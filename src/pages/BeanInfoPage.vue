<script setup>
import { ref, computed, inject, watch } from 'vue'
import { useRouter } from 'vue-router'
import PresetPillRow from '../components/PresetPillRow.vue'
import SuggestionField from '../components/SuggestionField.vue'
import ValueInput from '../components/ValueInput.vue'
import BottomBar from '../components/BottomBar.vue'

const settings = inject('settings', null)
const workflow = inject('workflow', null)
const updateWorkflow = inject('updateWorkflow')
const toast = inject('toast', null)
const router = useRouter()

// ---- Workflow combos ----
const workflowCombos = computed(() => settings?.settings?.workflowCombos ?? [])
const selectedIndex = computed(() => settings?.settings?.selectedWorkflowCombo ?? -1)

// ---- Editable fields ----
const coffeeName = ref('')
const roaster = ref('')
const grinder = ref('')
const grinderSetting = ref('')
const doseIn = ref(18.0)
const doseOut = ref(36.0)
const ratioValue = ref(2.0)
let _updating = false

// ---- Profile state ----
const profileTitle = ref('')
const profileId = ref(null)

// ---- Optional operation settings (for combo) ----
const includeSteam = ref(false)
const steamDuration = ref(30)
const steamFlow = ref(1.5)
const steamTemperature = ref(160)

const includeFlush = ref(false)
const flushDuration = ref(5)
const flushFlowRate = ref(6.0)

const includeHotWater = ref(false)
const hotWaterVolume = ref(200)
const hotWaterTemperature = ref(80)

// ---- Populate from selected preset ----
function loadFromPreset(index) {
  const preset = workflowCombos.value[index]
  if (!preset) return
  _updating = true
  // Coffee: support legacy beanBrand/beanType combos
  coffeeName.value = preset.coffeeName ?? ([preset.beanBrand, preset.beanType].filter(Boolean).join(' ') || '')
  roaster.value = preset.roaster ?? ''
  grinder.value = preset.grinder ?? ''
  grinderSetting.value = preset.grinderSetting ?? ''
  doseIn.value = preset.doseIn ?? 18.0
  doseOut.value = preset.doseOut ?? 36.0
  ratioValue.value = doseIn.value > 0 ? +(doseOut.value / doseIn.value).toFixed(1) : 2.0
  profileId.value = preset.profileId ?? null
  profileTitle.value = preset.profileTitle ?? ''
  // Operation settings
  includeSteam.value = preset.includeSteam ?? (preset.steamSettings?.duration > 0)
  if (preset.steamSettings && includeSteam.value) {
    steamDuration.value = preset.steamSettings.duration ?? 30
    steamFlow.value = preset.steamSettings.flow ?? 1.5
    steamTemperature.value = preset.steamSettings.temperature ?? 160
  }
  includeFlush.value = preset.includeFlush ?? (preset.flushSettings?.duration > 0)
  if (preset.flushSettings && includeFlush.value) {
    flushDuration.value = preset.flushSettings.duration ?? 5
    flushFlowRate.value = preset.flushSettings.flow ?? 6.0
  }
  includeHotWater.value = preset.includeHotWater ?? (preset.hotWaterSettings?.volume > 0)
  if (preset.hotWaterSettings && includeHotWater.value) {
    hotWaterVolume.value = preset.hotWaterSettings.volume ?? 200
    hotWaterTemperature.value = preset.hotWaterSettings.temperature ?? 80
  }
  _updating = false
}

// Load on mount if a preset is selected
if (selectedIndex.value >= 0) {
  loadFromPreset(selectedIndex.value)
} else {
  // Populate from workflow if available
  const wd = workflow?.doseData
  const wg = workflow?.grinderData
  const wc = workflow?.coffeeData
  if (wd) {
    doseIn.value = wd.doseIn ?? wd.dose ?? 18.0
    doseOut.value = wd.doseOut ?? wd.targetWeight ?? 36.0
    if (doseIn.value > 0) ratioValue.value = +(doseOut.value / doseIn.value).toFixed(1)
  }
  if (wg) {
    grinder.value = [wg.manufacturer, wg.model].filter(Boolean).join(' ') || (wg.grinder ?? wg.name ?? '')
    grinderSetting.value = wg.setting ?? wg.grindSetting ?? ''
  }
  if (wc) {
    coffeeName.value = wc.name ?? ''
    roaster.value = wc.roaster ?? ''
  }
  if (workflow?.profile) {
    profileTitle.value = workflow.profile.title ?? ''
  }
}

function onPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedWorkflowCombo = index
  loadFromPreset(index)
}

// ---- Auto-save to selected combo ----
function comboValues() {
  return {
    profileId: profileId.value,
    profileTitle: profileTitle.value,
    coffeeName: coffeeName.value,
    roaster: roaster.value,
    doseIn: doseIn.value,
    doseOut: doseOut.value,
    grinder: grinder.value,
    grinderSetting: grinderSetting.value,
    includeSteam: includeSteam.value,
    steamSettings: includeSteam.value ? { duration: steamDuration.value, flow: steamFlow.value, temperature: steamTemperature.value } : { duration: 0 },
    includeFlush: includeFlush.value,
    flushSettings: includeFlush.value ? { duration: flushDuration.value, flow: flushFlowRate.value } : { duration: 0 },
    includeHotWater: includeHotWater.value,
    hotWaterSettings: includeHotWater.value ? { volume: hotWaterVolume.value, temperature: hotWaterTemperature.value } : { volume: 0 },
  }
}

let saveTimer = null
function debouncedSaveToCombo() {
  if (!settings || selectedIndex.value < 0 || _updating) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const combos = [...workflowCombos.value]
    const existing = combos[selectedIndex.value]
    combos[selectedIndex.value] = {
      ...existing,
      ...comboValues(),
    }
    settings.settings.workflowCombos = combos
  }, 500)
}

// Watch all fields for auto-save
watch([coffeeName, roaster, grinder, grinderSetting, doseIn, doseOut,
       includeSteam, steamDuration, steamFlow, steamTemperature,
       includeFlush, flushDuration, flushFlowRate,
       includeHotWater, hotWaterVolume, hotWaterTemperature], debouncedSaveToCombo)

// ---- Save as new combo ----
function saveAsNew() {
  if (!settings) return
  const vals = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: coffeeName.value || profileTitle.value || 'Unnamed',
    emoji: '',
    ...comboValues(),
  }
  const combos = [...workflowCombos.value, vals]
  settings.settings.workflowCombos = combos
  settings.settings.selectedWorkflowCombo = combos.length - 1
  toast?.success('Combo saved')
}

// ---- Save to workflow ----
async function saveToWorkflow() {
  try {
    const workflowUpdate = {
      coffeeData: {
        name: coffeeName.value || 'Unnamed',
        roaster: roaster.value || null,
      },
      grinderData: {
        setting: grinderSetting.value,
        manufacturer: null,
        model: grinder.value || null,
      },
      doseData: {
        doseIn: doseIn.value,
        doseOut: doseOut.value,
      },
    }
    workflowUpdate.steamSettings = includeSteam.value
      ? { targetTemperature: steamTemperature.value, duration: steamDuration.value, flow: steamFlow.value }
      : { targetTemperature: settings?.settings?.steamTemperature ?? 160, duration: 0, flow: settings?.settings?.steamFlow ?? 1.5 }
    workflowUpdate.rinseData = includeFlush.value
      ? { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: flushDuration.value, flow: flushFlowRate.value }
      : { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: 0, flow: settings?.settings?.flushFlowRate ?? 6.0 }
    workflowUpdate.hotWaterData = includeHotWater.value
      ? { targetTemperature: hotWaterTemperature.value, volume: hotWaterVolume.value, duration: settings?.settings?.hotWaterDuration ?? 60, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
      : { targetTemperature: settings?.settings?.hotWaterTemperature ?? 80, volume: 0, duration: 0, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
    await updateWorkflow(workflowUpdate)
    // Also save to combo if one is selected
    if (settings && selectedIndex.value >= 0) {
      const combos = [...workflowCombos.value]
      const existing = combos[selectedIndex.value]
      combos[selectedIndex.value] = { ...existing, ...comboValues() }
      settings.settings.workflowCombos = combos
    }
    toast?.success('Applied & saved')
  } catch {
    toast?.error('Failed to save to workflow')
  }
}

// ---- Suggestion lists from existing combos ----
const coffeeSuggestions = computed(() =>
  [...new Set(workflowCombos.value.map(p => p.coffeeName ?? [p.beanBrand, p.beanType].filter(Boolean).join(' ')).filter(Boolean))]
)
const roasterSuggestions = computed(() =>
  [...new Set(workflowCombos.value.map(p => p.roaster).filter(Boolean))]
)
const grinderSuggestions = computed(() =>
  [...new Set(workflowCombos.value.map(p => p.grinder).filter(Boolean))]
)

// ---- Linked ratio: changing any of doseIn/doseOut/ratio updates the others ----
watch(doseIn, (val) => {
  if (_updating) return
  _updating = true
  if (val > 0 && ratioValue.value > 0) {
    doseOut.value = +(val * ratioValue.value).toFixed(1)
  }
  _updating = false
})

watch(doseOut, (val) => {
  if (_updating) return
  _updating = true
  if (doseIn.value > 0 && val > 0) {
    ratioValue.value = +(val / doseIn.value).toFixed(1)
  }
  _updating = false
})

watch(ratioValue, (val) => {
  if (_updating) return
  _updating = true
  if (doseIn.value > 0 && val > 0) {
    doseOut.value = +(doseIn.value * val).toFixed(1)
  }
  _updating = false
})

// Sync profile title when returning from ProfileSelectorPage
watch(() => workflow?.profile, (newProfile) => {
  if (newProfile && !_updating) {
    profileTitle.value = newProfile.title ?? ''
  }
}, { deep: true })
</script>

<template>
  <div class="bean-info">
    <!-- Workflow combos -->
    <div class="bean-info__presets">
      <PresetPillRow
        :presets="workflowCombos"
        :selected-index="selectedIndex"
        @select="onPresetSelect"
      />
      <button class="bean-info__add-btn" @click="saveAsNew">
        + New Combo
      </button>
    </div>

    <!-- Scrollable content area -->
    <div class="bean-info__scroll">

    <!-- Profile section -->
    <div class="bean-info__profile-section">
      <h4 class="bean-info__section-title">Profile</h4>
      <div class="bean-info__profile-row">
        <span class="bean-info__profile-name">{{ profileTitle || 'No profile selected' }}</span>
        <button class="bean-info__change-btn" @click="router.push('/profiles?from=workflow')">Change</button>
      </div>
    </div>

    <!-- Field grid -->
    <div class="bean-info__grid">
      <!-- Column 1: Coffee -->
      <div class="bean-info__column">
        <h4 class="bean-info__section-title">Coffee</h4>

        <div class="bean-info__field">
          <label class="bean-info__label">Name</label>
          <SuggestionField
            v-model="coffeeName"
            placeholder="Coffee name"
            :suggestions="coffeeSuggestions"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Roaster</label>
          <SuggestionField
            v-model="roaster"
            placeholder="Roaster name"
            :suggestions="roasterSuggestions"
          />
        </div>
      </div>

      <!-- Column 2: Grinder -->
      <div class="bean-info__column">
        <h4 class="bean-info__section-title">Grinder</h4>

        <div class="bean-info__field">
          <label class="bean-info__label">Grinder</label>
          <SuggestionField
            v-model="grinder"
            placeholder="Grinder model"
            :suggestions="grinderSuggestions"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Setting</label>
          <input
            class="bean-info__input"
            type="text"
            v-model="grinderSetting"
            placeholder="Grind setting"
          />
        </div>
      </div>

      <!-- Column 3: Dose -->
      <div class="bean-info__column">
        <h4 class="bean-info__section-title">Dose</h4>

        <div class="bean-info__field">
          <label class="bean-info__label">Dose In</label>
          <ValueInput
            v-model="doseIn"
            :min="0"
            :max="40"
            :step="0.1"
            :decimals="1"
            suffix="g"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Dose Out</label>
          <ValueInput
            v-model="doseOut"
            :min="0"
            :max="500"
            :step="0.1"
            :decimals="1"
            suffix="g"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Ratio (1:X)</label>
          <ValueInput
            v-model="ratioValue"
            :min="0.5"
            :max="10"
            :step="0.1"
            :decimals="1"
          />
        </div>
      </div>
    </div>

    <!-- Optional operation settings -->
    <div class="bean-info__operations">
      <!-- Steam -->
      <div class="bean-info__op-section">
        <button class="bean-info__op-toggle" @click="includeSteam = !includeSteam">
          <span>{{ includeSteam ? '\u25BE' : '\u25B8' }} Steam Settings</span>
          <span class="bean-info__op-badge" v-if="includeSteam">included</span>
        </button>
        <div v-if="includeSteam" class="bean-info__op-fields">
          <div class="bean-info__field">
            <label class="bean-info__label">Duration</label>
            <ValueInput v-model="steamDuration" :min="1" :max="120" :step="1" :decimals="0" suffix=" s" />
          </div>
          <div class="bean-info__field">
            <label class="bean-info__label">Flow</label>
            <ValueInput v-model="steamFlow" :min="0.4" :max="2.5" :step="0.05" :decimals="2" suffix=" mL/s" />
          </div>
          <div class="bean-info__field">
            <label class="bean-info__label">Temperature</label>
            <ValueInput v-model="steamTemperature" :min="100" :max="170" :step="1" :decimals="0" suffix=" &deg;C" />
          </div>
          <div class="bean-info__op-divider"></div>
          <div class="bean-info__field">
            <label class="bean-info__label">Keep steam heater on</label>
            <button
              class="bean-info__toggle"
              :class="{ 'bean-info__toggle--on': settings?.settings?.keepSteamHeaterOn }"
              @click="settings.settings.keepSteamHeaterOn = !settings.settings.keepSteamHeaterOn"
            >
              {{ settings?.settings?.keepSteamHeaterOn ? 'ON' : 'OFF' }}
            </button>
          </div>
          <div class="bean-info__field">
            <label class="bean-info__label">Auto-flush after steam</label>
            <ValueInput
              :model-value="settings?.settings?.steamAutoFlushSeconds ?? 0"
              @update:model-value="v => settings.settings.steamAutoFlushSeconds = v"
              :min="0"
              :max="60"
              :step="1"
              suffix=" s"
            />
            <span class="bean-info__hint">0 = disabled</span>
          </div>
        </div>
      </div>

      <!-- Flush -->
      <div class="bean-info__op-section">
        <button class="bean-info__op-toggle" @click="includeFlush = !includeFlush">
          <span>{{ includeFlush ? '\u25BE' : '\u25B8' }} Flush Settings</span>
          <span class="bean-info__op-badge" v-if="includeFlush">included</span>
        </button>
        <div v-if="includeFlush" class="bean-info__op-fields">
          <div class="bean-info__field">
            <label class="bean-info__label">Duration</label>
            <ValueInput v-model="flushDuration" :min="1" :max="30" :step="0.5" :decimals="1" suffix=" s" />
          </div>
          <div class="bean-info__field">
            <label class="bean-info__label">Flow Rate</label>
            <ValueInput v-model="flushFlowRate" :min="2" :max="10" :step="0.5" :decimals="1" suffix=" mL/s" />
          </div>
        </div>
      </div>

      <!-- Hot Water -->
      <div class="bean-info__op-section">
        <button class="bean-info__op-toggle" @click="includeHotWater = !includeHotWater">
          <span>{{ includeHotWater ? '\u25BE' : '\u25B8' }} Hot Water Settings</span>
          <span class="bean-info__op-badge" v-if="includeHotWater">included</span>
        </button>
        <div v-if="includeHotWater" class="bean-info__op-fields">
          <div class="bean-info__field">
            <label class="bean-info__label">Volume</label>
            <ValueInput v-model="hotWaterVolume" :min="50" :max="500" :step="10" :decimals="0" suffix=" g" />
          </div>
          <div class="bean-info__field">
            <label class="bean-info__label">Temperature</label>
            <ValueInput v-model="hotWaterTemperature" :min="40" :max="100" :step="1" :decimals="0" suffix=" &deg;C" />
          </div>
        </div>
      </div>
    </div>

    </div><!-- end scroll -->

    <BottomBar :title="selectedIndex >= 0 ? (workflowCombos[selectedIndex]?.name || 'Workflow Editor') : 'Workflow Editor'">
      <button class="bean-info__save-btn bean-info__save-btn--secondary" @click="saveToWorkflow">
        {{ selectedIndex >= 0 ? 'Apply & Save' : 'Apply' }}
      </button>
      <button class="bean-info__save-btn" @click="saveAsNew">
        Save as New
      </button>
    </BottomBar>
  </div>
</template>

<style scoped>
.bean-info {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.bean-info__presets {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  flex-shrink: 0;
}

.bean-info__add-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__add-btn:active {
  opacity: 0.7;
}

.bean-info__scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
}

.bean-info__profile-section {
  padding: 0 16px;
}

.bean-info__profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin-top: 8px;
  border-radius: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.bean-info__profile-name {
  font-size: 15px;
  color: var(--color-text);
}

.bean-info__change-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__change-btn:active {
  opacity: 0.7;
}

.bean-info__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
  padding: 16px;
  align-content: start;
}

.bean-info__column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bean-info__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border);
}

.bean-info__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bean-info__label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.bean-info__hint {
  font-size: 11px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.bean-info__input {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 15px;
  outline: none;
}

.bean-info__input::placeholder {
  color: var(--color-text-secondary);
}

.bean-info__input:focus {
  border-color: var(--color-primary);
}

.bean-info__select {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 15px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.bean-info__operations {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bean-info__op-section {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.bean-info__op-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__op-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-success);
  text-transform: uppercase;
}

.bean-info__op-fields {
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--color-border);
}

.bean-info__op-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

.bean-info__toggle {
  width: 80px;
  height: 36px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__toggle--on {
  background: var(--color-success);
  color: #fff;
  border-color: var(--color-success);
}

.bean-info__save-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-success);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__save-btn:active {
  opacity: 0.8;
}

.bean-info__save-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

@media (max-width: 600px) {
  .bean-info__grid {
    grid-template-columns: 1fr;
  }
}
</style>
