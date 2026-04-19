<script setup>
import { ref, computed, inject, onMounted, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import ValueInput from '../components/ValueInput.vue'
import ProfileGraph from '../components/ProfileGraph.vue'
import BottomBar from '../components/BottomBar.vue'
import { getProfile, updateProfile, createProfile } from '../api/rest.js'
import { invalidateProfileCaches } from '../composables/useProfileCacheInvalidation'
import {
  extractSimpleParams,
  generateSimpleFrames,
  buildProfileFromParams,
  isSimpleFlow,
  isSimpleProfile,
} from '../composables/useSimpleProfile'

const route = useRoute()
const router = useRouter()
const toast = inject('toast', null)

const profileId = computed(() => route.params.id)
const loading = ref(true)
const saving = ref(false)
const record = ref(null)
const params = ref({})
const meta = ref({ title: '', author: '', notes: '' })
const isFlow = ref(false)
const showTempSteps = ref(false)
const confirmLeave = ref(false)
let pendingNavigation = null
let originalSnapshot = ''

// Computed preview for ProfileGraph
const previewProfile = computed(() => {
  const steps = generateSimpleFrames(params.value, isFlow.value)
  return {
    title: meta.value.title,
    steps,
    target_weight: params.value.target_weight,
  }
})

const isDirty = computed(() => {
  const current = JSON.stringify({ params: params.value, meta: meta.value })
  return current !== originalSnapshot
})

const ratioText = computed(() => {
  const dose = params.value.recommended_dose
  const weight = params.value.target_weight
  if (dose > 0 && weight > 0) return `1:${(weight / dose).toFixed(1)}`
  return '--'
})

function updateParam(key, value) {
  params.value = { ...params.value, [key]: value }
}

function updateAllTemps(temp) {
  params.value = {
    ...params.value,
    espresso_temperature: temp,
    temperature_presets: [temp, temp, temp, temp],
    temp_steps_enabled: false,
  }
}

function updateTempPreset(index, value) {
  const presets = [...params.value.temperature_presets]
  presets[index] = value
  params.value = {
    ...params.value,
    temperature_presets: presets,
    temp_steps_enabled: true,
  }
}

async function loadProfile(id) {
  if (!id) {
    // New profile — use defaults based on query param
    const type = route.query.type
    isFlow.value = type === 'flow'
    params.value = extractSimpleParams({}, isFlow.value)
    meta.value = { title: isFlow.value ? 'New Flow Profile' : 'New Pressure Profile', author: '', notes: '' }
    loading.value = false
    originalSnapshot = JSON.stringify({ params: params.value, meta: meta.value })
    return
  }

  loading.value = true
  try {
    const result = await getProfile(id)
    record.value = result
    const profile = result?.profile ?? result

    if (!isSimpleProfile(profile)) {
      toast?.warning('This profile uses the advanced editor')
      router.replace(`/profile-editor/${encodeURIComponent(id)}`)
      return
    }

    isFlow.value = isSimpleFlow(profile)
    params.value = extractSimpleParams(profile, isFlow.value)
    meta.value = {
      title: profile.title || '',
      author: profile.author || '',
      notes: profile.notes || '',
    }
  } catch (e) {
    toast?.error('Failed to load profile')
    record.value = null
  }
  loading.value = false
  originalSnapshot = JSON.stringify({ params: params.value, meta: meta.value })
}

async function saveProfile() {
  if (saving.value) return
  saving.value = true
  try {
    const payload = buildProfileFromParams(params.value, isFlow.value, meta.value)
    if (profileId.value) {
      await updateProfile(profileId.value, payload)
      invalidateProfileCaches()
    } else {
      const created = await createProfile(payload)
      invalidateProfileCaches()
      if (created?.id) {
        router.replace(`/simple-editor/${encodeURIComponent(created.id)}`)
      }
    }
    originalSnapshot = JSON.stringify({ params: params.value, meta: meta.value })
    toast?.success('Profile saved')
  } catch (e) {
    toast?.error(e.message || 'Failed to save')
  }
  saving.value = false
}

function switchToAdvanced() {
  if (profileId.value) {
    router.push(`/advanced-editor/${encodeURIComponent(profileId.value)}`)
  }
}

// Navigation guard
onBeforeRouteLeave((to, from, next) => {
  if (!isDirty.value) { next(); return }
  pendingNavigation = next
  confirmLeave.value = true
})

function discardAndLeave() {
  confirmLeave.value = false
  originalSnapshot = JSON.stringify({ params: params.value, meta: meta.value })
  if (pendingNavigation) { pendingNavigation(); pendingNavigation = null }
}

function cancelLeave() {
  confirmLeave.value = false
  if (pendingNavigation) { pendingNavigation(false); pendingNavigation = null }
}

async function saveAndLeave() {
  await saveProfile()
  confirmLeave.value = false
  if (pendingNavigation) { pendingNavigation(); pendingNavigation = null }
}

function goBack() {
  if (profileId.value) {
    router.push(`/profile-info/${encodeURIComponent(profileId.value)}`)
  } else {
    router.push('/profiles')
  }
}

onMounted(() => loadProfile(profileId.value))
watch(profileId, (id) => loadProfile(id))

// Shorthand for pressure/flow hold params
const holdTimeKey = computed(() => isFlow.value ? 'flow_profile_hold_time' : 'espresso_hold_time')
const holdValueKey = computed(() => isFlow.value ? 'flow_profile_hold' : 'espresso_pressure')
const declineTimeKey = computed(() => isFlow.value ? 'flow_profile_decline_time' : 'espresso_decline_time')
const declineValueKey = computed(() => isFlow.value ? 'flow_profile_decline' : 'pressure_end')
const holdValueLabel = computed(() => isFlow.value ? 'Flow' : 'Pressure')
const holdValueMax = computed(() => isFlow.value ? 8 : 12)
const holdValueSuffix = computed(() => isFlow.value ? ' mL/s' : ' bar')
</script>

<template>
  <div class="simple-editor">
    <div v-if="loading" class="simple-editor__loading">Loading...</div>

    <template v-else>
      <div class="simple-editor__scroll">
        <!-- Graph preview -->
        <div class="simple-editor__graph">
          <ProfileGraph :profile="previewProfile" />
        </div>

        <!-- Title -->
        <div class="simple-editor__title-row">
          <input
            v-model="meta.title"
            class="simple-editor__title-input"
            placeholder="Profile name"
          />
          <span class="simple-editor__type-badge">
            {{ isFlow ? 'Flow' : 'Pressure' }}
          </span>
        </div>

        <!-- Temperature -->
        <section class="simple-editor__section">
          <div class="simple-editor__section-header">
            <span>Temperature</span>
            <button class="simple-editor__chip" @click="showTempSteps = !showTempSteps">
              {{ params.temp_steps_enabled ? 'Per-step' : 'Global' }}
            </button>
          </div>
          <div class="simple-editor__field">
            <ValueInput
              :model-value="params.espresso_temperature"
              :min="70" :max="100" :step="0.1" :decimals="1"
              suffix=" °C"
              aria-label="Profile temperature"
              @update:model-value="updateAllTemps($event)"
            />
          </div>
          <div class="simple-editor__field">
            <label class="simple-editor__label">Dose</label>
            <ValueInput
              :model-value="params.recommended_dose"
              :min="3" :max="40" :step="0.1" :decimals="1"
              suffix=" g"
              aria-label="Dose weight"
              @update:model-value="updateParam('recommended_dose', $event)"
            />
          </div>
        </section>

        <!-- Temperature steps modal -->
        <div v-if="showTempSteps" class="simple-editor__temp-steps">
          <div class="simple-editor__section-header">
            <span>Temperature per step</span>
            <button class="simple-editor__chip" @click="showTempSteps = false">Close</button>
          </div>
          <div v-for="(label, i) in ['Start', 'Pre-infusion', 'Hold', 'Decline']" :key="i" class="simple-editor__field">
            <label class="simple-editor__label">{{ label }}</label>
            <ValueInput
              :model-value="params.temperature_presets[i]"
              :min="70" :max="100" :step="0.1" :decimals="1"
              suffix=" °C"
              :aria-label="`${label} temperature`"
              @update:model-value="updateTempPreset(i, $event)"
            />
          </div>
        </div>

        <!-- Step 1: Preinfuse -->
        <section class="simple-editor__section">
          <div class="simple-editor__section-header">
            <span class="simple-editor__step-num">1</span>
            <span>Preinfuse</span>
          </div>
          <div class="simple-editor__field">
            <label class="simple-editor__label">Max duration</label>
            <ValueInput
              :model-value="params.preinfusion_time"
              :min="0" :max="60" :step="1" :decimals="0"
              suffix=" s"
              :display-text="params.preinfusion_time === 0 ? 'off' : null"
              aria-label="Preinfusion duration"
              @update:model-value="updateParam('preinfusion_time', $event)"
            />
          </div>
          <template v-if="params.preinfusion_time > 0">
            <div class="simple-editor__field">
              <label class="simple-editor__label">Flow rate</label>
              <ValueInput
                :model-value="params.preinfusion_flow_rate"
                :min="1" :max="10" :step="0.1" :decimals="1"
                suffix=" mL/s"
                aria-label="Preinfusion flow rate"
                @update:model-value="updateParam('preinfusion_flow_rate', $event)"
              />
            </div>
            <div class="simple-editor__field">
              <label class="simple-editor__label">Exit pressure</label>
              <ValueInput
                :model-value="params.preinfusion_stop_pressure"
                :min="0.5" :max="8" :step="0.1" :decimals="1"
                suffix=" bar"
                aria-label="Preinfusion exit pressure"
                @update:model-value="updateParam('preinfusion_stop_pressure', $event)"
              />
            </div>
          </template>
          <span v-else class="simple-editor__hint">Preinfusion off</span>
        </section>

        <!-- Step 2: Hold -->
        <section class="simple-editor__section">
          <div class="simple-editor__section-header">
            <span class="simple-editor__step-num">2</span>
            <span>{{ isFlow ? 'Hold' : 'Rise and Hold' }}</span>
          </div>
          <div class="simple-editor__field">
            <label class="simple-editor__label">{{ holdValueLabel }}</label>
            <ValueInput
              :model-value="params[holdValueKey]"
              :min="0.5" :max="holdValueMax" :step="0.1" :decimals="1"
              :suffix="holdValueSuffix"
              :aria-label="`Hold ${holdValueLabel.toLowerCase()}`"
              @update:model-value="updateParam(holdValueKey, $event)"
            />
          </div>
          <div class="simple-editor__field">
            <label class="simple-editor__label">Time</label>
            <ValueInput
              :model-value="params[holdTimeKey]"
              :min="0" :max="60" :step="1" :decimals="0"
              suffix=" s"
              :display-text="params[holdTimeKey] === 0 ? 'off' : null"
              aria-label="Hold time"
              @update:model-value="updateParam(holdTimeKey, $event)"
            />
          </div>
          <div class="simple-editor__field">
            <label class="simple-editor__label">{{ isFlow ? 'Pressure limit' : 'Flow limit' }}</label>
            <ValueInput
              :model-value="isFlow ? params.maximum_pressure : params.maximum_flow"
              :min="0" :max="isFlow ? 12 : 8" :step="0.1" :decimals="1"
              :suffix="isFlow ? ' bar' : ' mL/s'"
              :display-text="(isFlow ? params.maximum_pressure : params.maximum_flow) === 0 ? 'off' : null"
              :aria-label="isFlow ? 'Pressure limit' : 'Flow limit'"
              @update:model-value="updateParam(isFlow ? 'maximum_pressure' : 'maximum_flow', $event)"
            />
          </div>
        </section>

        <!-- Step 3: Decline -->
        <section class="simple-editor__section">
          <div class="simple-editor__section-header">
            <span class="simple-editor__step-num">3</span>
            <span>Decline</span>
          </div>
          <div class="simple-editor__field">
            <label class="simple-editor__label">Time</label>
            <ValueInput
              :model-value="params[declineTimeKey]"
              :min="0" :max="60" :step="1" :decimals="0"
              suffix=" s"
              :display-text="params[declineTimeKey] === 0 ? 'off' : null"
              aria-label="Decline time"
              @update:model-value="updateParam(declineTimeKey, $event)"
            />
          </div>
          <template v-if="params[declineTimeKey] > 0">
            <div class="simple-editor__field">
              <label class="simple-editor__label">End {{ holdValueLabel.toLowerCase() }}</label>
              <ValueInput
                :model-value="params[declineValueKey]"
                :min="0" :max="holdValueMax" :step="0.1" :decimals="1"
                :suffix="holdValueSuffix"
                :aria-label="`End ${holdValueLabel.toLowerCase()}`"
                @update:model-value="updateParam(declineValueKey, $event)"
              />
            </div>
          </template>
          <span v-else class="simple-editor__hint">Decline off</span>
        </section>

        <!-- Step 4: Stop at Weight -->
        <section class="simple-editor__section">
          <div class="simple-editor__section-header">
            <span class="simple-editor__step-num">4</span>
            <span>Stop at Weight</span>
          </div>
          <div class="simple-editor__field">
            <ValueInput
              :model-value="params.target_weight"
              :min="0" :max="500" :step="0.1" :decimals="1"
              suffix=" g"
              :display-text="params.target_weight === 0 ? 'off' : null"
              aria-label="Target weight"
              @update:model-value="updateParam('target_weight', $event)"
            />
          </div>
          <div v-if="params.target_weight > 0 && params.recommended_dose > 0" class="simple-editor__ratio">
            Ratio {{ ratioText }}
          </div>
        </section>

        <!-- Notes -->
        <section class="simple-editor__section">
          <textarea
            v-model="meta.notes"
            class="simple-editor__notes"
            placeholder="Profile notes..."
            rows="2"
          />
        </section>

        <!-- Actions -->
        <div class="simple-editor__actions">
          <button
            class="simple-editor__save-btn"
            :disabled="saving || !isDirty"
            @click="saveProfile"
          >
            {{ saving ? 'Saving...' : isDirty ? 'Save' : 'Saved' }}
          </button>
          <button
            v-if="profileId"
            class="simple-editor__advanced-btn"
            @click="switchToAdvanced"
          >
            Advanced Editor
          </button>
        </div>
      </div>
    </template>

    <BottomBar :title="isFlow ? 'Simple Flow Editor' : 'Simple Pressure Editor'" @back="goBack" />

    <!-- Unsaved changes confirm -->
    <Transition name="confirm-fade">
      <div v-if="confirmLeave" class="simple-editor__confirm" @click.self="cancelLeave">
        <div class="simple-editor__confirm-card">
          <span class="simple-editor__confirm-text">You have unsaved changes.</span>
          <div class="simple-editor__confirm-actions">
            <button class="simple-editor__confirm-btn simple-editor__confirm-btn--discard" @click="discardAndLeave">Discard</button>
            <button class="simple-editor__confirm-btn simple-editor__confirm-btn--cancel" @click="cancelLeave">Stay</button>
            <button class="simple-editor__confirm-btn simple-editor__confirm-btn--save" @click="saveAndLeave">Save & Leave</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.simple-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.simple-editor__loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
}

.simple-editor__scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.simple-editor__graph {
  height: 180px;
  flex-shrink: 0;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.simple-editor__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.simple-editor__title-input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
  font-weight: 600;
  outline: none;
}

.simple-editor__title-input:focus {
  border-color: var(--color-primary);
}

.simple-editor__type-badge {
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-caption);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.simple-editor__section {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.simple-editor__section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-body);
  font-weight: 700;
  color: var(--color-text);
}

.simple-editor__step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-caption);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.simple-editor__chip {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-caption);
  font-weight: 600;
  cursor: pointer;
}

.simple-editor__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.simple-editor__label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

.simple-editor__hint {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  font-style: italic;
}

.simple-editor__ratio {
  font-size: var(--font-md);
  color: var(--color-primary);
  font-weight: 600;
}

.simple-editor__temp-steps {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--color-primary);
}

.simple-editor__notes {
  width: 100%;
  min-height: 60px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-body);
  font-family: inherit;
  resize: vertical;
  outline: none;
}

.simple-editor__notes:focus {
  border-color: var(--color-primary);
}

.simple-editor__actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  padding: 8px 0;
}

.simple-editor__save-btn {
  min-width: 140px;
  height: 48px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
}

.simple-editor__save-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  cursor: default;
}

.simple-editor__advanced-btn {
  min-width: 140px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
}

/* Confirm dialog */
.simple-editor__confirm {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: var(--z-overlay);
  background: var(--color-overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
}

.simple-editor__confirm-card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 24px;
  width: 90%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.simple-editor__confirm-text {
  font-size: var(--font-body);
  color: var(--color-text);
  text-align: center;
}

.simple-editor__confirm-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}

.simple-editor__confirm-btn {
  flex: 1;
  height: 40px;
  border-radius: 10px;
  border: none;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
}

.simple-editor__confirm-btn--discard { background: var(--color-error); color: var(--color-text); }
.simple-editor__confirm-btn--cancel { background: transparent; color: var(--color-text-secondary); border: 1px solid var(--color-border); }
.simple-editor__confirm-btn--save { background: var(--color-primary); color: var(--color-text); }

.confirm-fade-enter-active, .confirm-fade-leave-active { transition: opacity 0.15s ease; }
.confirm-fade-enter-from, .confirm-fade-leave-to { opacity: 0; }
</style>
