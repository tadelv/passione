<script setup>
import { ref, computed, inject, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PresetPillRow from '../components/PresetPillRow.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import SuggestionField from '../components/SuggestionField.vue'
import ValueInput from '../components/ValueInput.vue'
import GrinderSettingInput from '../components/GrinderSettingInput.vue'
import BottomBar from '../components/BottomBar.vue'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue'

const settings = inject('settings', null)
const workflow = inject('workflow', null)
const updateWorkflow = inject('updateWorkflow')
const toast = inject('toast', null)
const router = useRouter()
const { t } = useI18n()

const beans = inject('beans', ref([]))
const beansApi = inject('beansApi', null)
const grinders = inject('grinders', ref([]))
const grindersApi = inject('grindersApi', null)

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

// ---- Entity selection state ----
const selectedBeanId = ref(null)
const selectedBatchId = ref(null)
const selectedGrinderId = ref(null)
const selectedBatch = ref(null)
const selectedGrinder = computed(() => grinders.value.find(g => g.id === selectedGrinderId.value) ?? null)
const batchesForBean = ref([])
const showBatchList = ref(false)

// ---- Profile state ----
const profileTitle = ref('')
const profileId = ref(null)
const awaitingProfileFromPicker = ref(false)

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

// ---- Bean/batch selection ----
async function onBeanSelect(beanId) {
  selectedBeanId.value = beanId || null
  selectedBatchId.value = null
  selectedBatch.value = null
  batchesForBean.value = []
  if (!beanId || !beansApi) {
    coffeeName.value = ''
    roaster.value = ''
    return
  }
  const bean = beans.value.find(b => b.id === beanId)
  if (bean) {
    coffeeName.value = bean.name ?? ''
    roaster.value = bean.roaster ?? ''
  }
  // Auto-select active batch
  const batch = await beansApi.activeBatchForBean(beanId)
  if (batch) {
    selectedBatchId.value = batch.id
    selectedBatch.value = batch
  }
  // Load all batches for switch UI
  batchesForBean.value = await beansApi.getBatches(beanId) ?? []
}

function onBatchSelect(batchId) {
  selectedBatchId.value = batchId
  selectedBatch.value = batchesForBean.value.find(b => b.id === batchId) ?? null
}

// ---- Grinder selection ----
function onGrinderSelect(grinderId, { resetSetting = true } = {}) {
  selectedGrinderId.value = grinderId || null
  if (!grinderId) {
    grinder.value = ''
    grinderSetting.value = ''
    return
  }
  const g = grinders.value.find(g => g.id === grinderId)
  if (g) {
    grinder.value = g.model ?? ''
    if (resetSetting) grinderSetting.value = ''
  }
}

// ---- Batch info helper ----
function daysSinceRoast(batch) {
  if (!batch?.roastDate) return null
  const diff = Date.now() - new Date(batch.roastDate).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// ---- Populate from selected preset ----
// Cancel any pending batch-restore watcher from a previous load
let _pendingBatchWatch = null

async function loadFromPreset(index) {
  // Cancel stale batch watcher from a previous combo switch
  _pendingBatchWatch?.()
  _pendingBatchWatch = null

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
  // Operation settings — always restore sub-field values so they survive
  // a toggle-off/toggle-on cycle (user disables steam, re-enables later)
  includeSteam.value = preset.includeSteam ?? (preset.steamSettings?.duration > 0)
  if (preset.steamSettings) {
    steamDuration.value = preset.steamSettings.duration ?? 30
    steamFlow.value = preset.steamSettings.flow ?? 1.5
    steamTemperature.value = preset.steamSettings.temperature ?? 160
  }
  includeFlush.value = preset.includeFlush ?? (preset.flushSettings?.duration > 0)
  if (preset.flushSettings) {
    flushDuration.value = preset.flushSettings.duration ?? 5
    flushFlowRate.value = preset.flushSettings.flow ?? 6.0
  }
  includeHotWater.value = preset.includeHotWater ?? (preset.hotWaterSettings?.volume > 0)
  if (preset.hotWaterSettings) {
    hotWaterVolume.value = preset.hotWaterSettings.volume ?? 200
    hotWaterTemperature.value = preset.hotWaterSettings.temperature ?? 80
  }
  // Restore entity selections — keep _updating true through async work
  // so the auto-save watcher doesn't fire with partially-loaded data
  if (preset.selectedBeanId) {
    await onBeanSelect(preset.selectedBeanId)
  } else {
    selectedBeanId.value = null
    selectedBatchId.value = null
    selectedBatch.value = null
    batchesForBean.value = []
  }
  if (preset.selectedGrinderId) {
    onGrinderSelect(preset.selectedGrinderId, { resetSetting: false })
  } else {
    selectedGrinderId.value = null
  }
  // Restore batch if both IDs present (after bean batches load)
  if (preset.selectedBeanId && preset.selectedBatchId) {
    const batchId = preset.selectedBatchId
    if (batchesForBean.value.length > 0) {
      onBatchSelect(batchId)
    } else {
      // Batches haven't loaded yet — wait for them
      _pendingBatchWatch = watch(batchesForBean, (batches) => {
        if (batches.length > 0) {
          onBatchSelect(batchId)
          _pendingBatchWatch?.()
          _pendingBatchWatch = null
        }
      })
    }
  }
  _updating = false
}

// Load on mount if a preset is selected
if (selectedIndex.value >= 0) {
  loadFromPreset(selectedIndex.value)
} else {
  // Populate from workflow context
  const ctx = workflow?.context
  if (ctx) {
    doseIn.value = ctx.targetDoseWeight ?? 18.0
    doseOut.value = ctx.targetYield ?? 36.0
    if (doseIn.value > 0) ratioValue.value = +(doseOut.value / doseIn.value).toFixed(1)
    grinder.value = ctx.grinderModel ?? ''
    grinderSetting.value = ctx.grinderSetting ?? ''
    coffeeName.value = ctx.coffeeName ?? ''
    roaster.value = ctx.coffeeRoaster ?? ''
    // Restore entity selections if present
    if (ctx.grinderId) selectedGrinderId.value = ctx.grinderId
    if (ctx.beanBatchId) {
      selectedBatchId.value = ctx.beanBatchId
      // Find matching bean
      const matchingBean = beans.value.find(b => b.name === ctx.coffeeName && b.roaster === ctx.coffeeRoaster)
      if (matchingBean) selectedBeanId.value = matchingBean.id
    }
  }
}
// Sync profile from workflow only when no preset is loaded — presets carry their own
// profileId/profileTitle and must not be overwritten by the machine's current workflow.
if (selectedIndex.value < 0 && workflow?.profile) {
  profileTitle.value = workflow.profile.title ?? ''
  profileId.value = workflow.profile.id ?? null
}

function onPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedWorkflowCombo = index
  loadFromPreset(index)
}

// ---- Combo edit popup ----
const editPopupVisible = ref(false)
const editPopupPreset = ref(null)
const editPopupIndex = ref(-1)

function onComboEdit(index) {
  const combo = workflowCombos.value[index]
  if (!combo) return
  editPopupPreset.value = combo
  editPopupIndex.value = index
  editPopupVisible.value = true
}

function onComboEditSave(updated) {
  if (!settings || editPopupIndex.value < 0) return
  const combos = [...workflowCombos.value]
  combos[editPopupIndex.value] = { ...combos[editPopupIndex.value], name: updated.name, emoji: updated.emoji }
  settings.settings.workflowCombos = combos
  editPopupVisible.value = false
}

function onComboEditDelete() {
  if (!settings || editPopupIndex.value < 0) return
  const combos = [...workflowCombos.value]
  combos.splice(editPopupIndex.value, 1)
  settings.settings.workflowCombos = combos
  if (selectedIndex.value >= combos.length) {
    settings.settings.selectedWorkflowCombo = combos.length - 1
  }
  editPopupVisible.value = false
}

function onComboEditCancel() {
  editPopupVisible.value = false
}

// ---- Combo values snapshot ----
function comboValues() {
  const vals = {
    profileId: profileId.value,
    profileTitle: profileTitle.value,
    coffeeName: coffeeName.value,
    roaster: roaster.value,
    doseIn: doseIn.value,
    doseOut: doseOut.value,
    grinder: grinder.value,
    grinderSetting: grinderSetting.value,
    selectedBeanId: selectedBeanId.value || null,
    selectedBatchId: selectedBatchId.value || null,
    selectedGrinderId: selectedGrinderId.value || null,
    includeSteam: includeSteam.value,
    steamSettings: includeSteam.value ? { duration: steamDuration.value, flow: steamFlow.value, temperature: steamTemperature.value } : { duration: 0 },
    includeFlush: includeFlush.value,
    flushSettings: includeFlush.value ? { duration: flushDuration.value, flow: flushFlowRate.value } : { duration: 0 },
    includeHotWater: includeHotWater.value,
    hotWaterSettings: includeHotWater.value ? { volume: hotWaterVolume.value, temperature: hotWaterTemperature.value } : { volume: 0 },
  }
  return vals
}

// ---- Dirty tracking ----
const dirty = computed(() => {
  if (selectedIndex.value < 0) {
    // No combo selected — dirty if any identifiable field has a non-initial value
    return !!(
      coffeeName.value || roaster.value || grinder.value || grinderSetting.value ||
      profileTitle.value || profileId.value ||
      selectedBeanId.value || selectedBatchId.value || selectedGrinderId.value ||
      includeSteam.value || includeFlush.value || includeHotWater.value
    )
  }
  const saved = workflowCombos.value[selectedIndex.value]
  if (!saved) return false
  const current = comboValues()
  const keys = [
    'profileId', 'profileTitle', 'coffeeName', 'roaster',
    'doseIn', 'doseOut', 'grinder', 'grinderSetting',
    'selectedBeanId', 'selectedBatchId', 'selectedGrinderId',
    'includeSteam', 'includeFlush', 'includeHotWater',
  ]
  for (const k of keys) {
    if ((current[k] ?? null) !== (saved[k] ?? null)) return true
  }
  if (JSON.stringify(current.steamSettings) !== JSON.stringify(saved.steamSettings)) return true
  if (JSON.stringify(current.flushSettings) !== JSON.stringify(saved.flushSettings)) return true
  if (JSON.stringify(current.hotWaterSettings) !== JSON.stringify(saved.hotWaterSettings)) return true
  return false
})

// ---- Build workflow update payload from current form state ----
function buildWorkflowUpdate() {
  const ctx = {
    targetDoseWeight: doseIn.value,
    targetYield: doseOut.value,
    coffeeName: coffeeName.value || null,
    coffeeRoaster: roaster.value || null,
    grinderModel: selectedGrinder.value?.model ?? (grinder.value || null),
    grinderSetting: grinderSetting.value != null ? String(grinderSetting.value) : null,
  }
  if (selectedGrinderId.value) ctx.grinderId = String(selectedGrinderId.value)
  if (selectedBatchId.value) ctx.beanBatchId = String(selectedBatchId.value)

  const payload = { context: ctx }
  payload.steamSettings = includeSteam.value
    ? { targetTemperature: steamTemperature.value, duration: steamDuration.value, flow: steamFlow.value }
    : { targetTemperature: settings?.settings?.steamTemperature ?? 160, duration: 0, flow: settings?.settings?.steamFlow ?? 1.5 }
  payload.rinseData = includeFlush.value
    ? { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: flushDuration.value, flow: flushFlowRate.value }
    : { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: 0, flow: settings?.settings?.flushFlowRate ?? 6.0 }
  payload.hotWaterData = includeHotWater.value
    ? { targetTemperature: hotWaterTemperature.value, volume: hotWaterVolume.value, duration: settings?.settings?.hotWaterDuration ?? 60, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
    : { targetTemperature: settings?.settings?.hotWaterTemperature ?? 80, volume: 0, duration: 0, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
  return payload
}

// ---- Apply current form state to the live workflow (no combo mutation) ----
async function applyToLiveWorkflow() {
  try {
    await updateWorkflow(buildWorkflowUpdate())
  } catch {
    // Silent — live-apply fires often; errors shouldn't toast-spam
  }
}

// ---- Persist current form state to the selected combo ----
function saveToSelectedCombo() {
  if (!settings || selectedIndex.value < 0) return
  const combos = [...workflowCombos.value]
  const existing = combos[selectedIndex.value]
  combos[selectedIndex.value] = { ...existing, ...comboValues() }
  settings.settings.workflowCombos = combos
  toast?.success(t('workflowEditor.toastSaved'))
}

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

// ---- Live-apply: push every field change to the workflow (300ms debounce) ----
let liveApplyTimer = null
watch([coffeeName, roaster, grinder, grinderSetting, doseIn, doseOut,
       selectedBeanId, selectedBatchId, selectedGrinderId,
       profileId, profileTitle,
       includeSteam, steamDuration, steamFlow, steamTemperature,
       includeFlush, flushDuration, flushFlowRate,
       includeHotWater, hotWaterVolume, hotWaterTemperature], () => {
  if (_updating) return
  clearTimeout(liveApplyTimer)
  liveApplyTimer = setTimeout(applyToLiveWorkflow, 300)
})

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

// ---- Profile change navigation ----
function onChangeProfile() {
  awaitingProfileFromPicker.value = true
  router.push('/profiles?from=workflow')
}

// ---- Back button + save placeholders (dialog wiring added in Task 9) ----
function onSaveClick() {
  saveToSelectedCombo()
}
function onBackClick() {
  router.back()
}

// Sync profile title when returning from ProfileSelectorPage.
// Accepts workflow.profile updates in two cases:
//   1. No combo selected — ambient safety default
//   2. User explicitly picked a profile via the Change button (awaitingProfileFromPicker)
watch(() => workflow?.profile, (newProfile) => {
  if (!newProfile || _updating) return
  const explicitlyPicked = awaitingProfileFromPicker.value
  const noComboSelected = selectedIndex.value < 0
  if (explicitlyPicked || noComboSelected) {
    profileTitle.value = newProfile.title ?? ''
    profileId.value = newProfile.id ?? null
    awaitingProfileFromPicker.value = false
  }
}, { deep: true })
</script>

<template>
  <div class="bean-info">
    <!-- Workflow combos -->
    <div class="bean-info__presets" :class="{ 'bean-info__presets--dirty': dirty && selectedIndex >= 0 }">
      <PresetPillRow
        :presets="workflowCombos"
        :selected-index="selectedIndex"
        :edit-enabled="true"
        @select="onPresetSelect"
        @edit="onComboEdit"
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
        <button class="bean-info__change-btn" @click="onChangeProfile">Change</button>
      </div>
    </div>

    <!-- Field grid -->
    <div class="bean-info__grid">
      <!-- Column 1: Coffee -->
      <div class="bean-info__column">
        <h4 class="bean-info__section-title">Coffee</h4>

        <div class="bean-info__field">
          <label class="bean-info__label">Bean</label>
          <select class="bean-info__input" :value="selectedBeanId" @change="onBeanSelect($event.target.value)">
            <option value="">Manual entry...</option>
            <option v-for="b in beans" :key="b.id" :value="b.id">{{ b.roaster }} — {{ b.name }}</option>
          </select>
        </div>

        <!-- Manual mode: free-text fields -->
        <template v-if="!selectedBeanId">
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
        </template>

        <!-- Entity mode: read-only bean display + batch info -->
        <template v-else>
          <div class="bean-info__field">
            <label class="bean-info__label">Name</label>
            <span class="bean-info__readonly">{{ coffeeName }}</span>
          </div>

          <div class="bean-info__field">
            <label class="bean-info__label">Roaster</label>
            <span class="bean-info__readonly">{{ roaster }}</span>
          </div>

          <div v-if="selectedBatch" class="bean-info__batch-info">
            <span v-if="selectedBatch.roastDate" class="bean-info__batch-detail">
              Roasted: {{ selectedBatch.roastDate }}
              <template v-if="daysSinceRoast(selectedBatch) !== null">
                ({{ daysSinceRoast(selectedBatch) }}d ago)
              </template>
            </span>
            <span v-if="selectedBatch.weightRemaining != null" class="bean-info__batch-detail">
              Remaining: {{ selectedBatch.weightRemaining }}g
            </span>
          </div>

          <div v-if="batchesForBean.length > 1" class="bean-info__field">
            <button class="bean-info__link-btn" @click="showBatchList = !showBatchList">
              {{ showBatchList ? 'Hide batches' : 'Switch batch' }} ({{ batchesForBean.length }})
            </button>
            <div v-if="showBatchList" class="bean-info__batch-list">
              <button
                v-for="b in batchesForBean"
                :key="b.id"
                class="bean-info__batch-option"
                :class="{ 'bean-info__batch-option--active': b.id === selectedBatchId }"
                @click="onBatchSelect(b.id)"
              >
                {{ b.roastDate || 'No date' }}
                <span v-if="b.weightRemaining != null"> · {{ b.weightRemaining }}g</span>
              </button>
            </div>
          </div>
        </template>

        <button class="bean-info__link-btn" @click="router.push('/settings/beans')">Manage...</button>
      </div>

      <!-- Column 2: Grinder -->
      <div class="bean-info__column">
        <h4 class="bean-info__section-title">Grinder</h4>

        <div class="bean-info__field">
          <label class="bean-info__label">Grinder</label>
          <select class="bean-info__input" :value="selectedGrinderId" @change="onGrinderSelect($event.target.value)">
            <option value="">Manual entry...</option>
            <option v-for="g in grinders" :key="g.id" :value="g.id">{{ g.model }}</option>
          </select>
        </div>

        <!-- Manual mode: free-text grinder -->
        <template v-if="!selectedGrinderId">
          <div class="bean-info__field">
            <label class="bean-info__label">Model</label>
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
        </template>

        <!-- Entity mode: GrinderSettingInput -->
        <template v-else>
          <div class="bean-info__field">
            <label class="bean-info__label">Setting</label>
            <GrinderSettingInput v-model="grinderSetting" :grinder="selectedGrinder" />
          </div>
        </template>

        <button class="bean-info__link-btn" @click="router.push('/settings/grinders')">Manage...</button>
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

    <BottomBar
      :title="selectedIndex >= 0
        ? (workflowCombos[selectedIndex]?.name || t('workflowEditor.title')) + (dirty ? ' \u25CF' : '')
        : t('workflowEditor.title')"
      @back="onBackClick"
    >
      <template v-if="selectedIndex >= 0 && dirty">
        <button class="bean-info__save-btn" data-testid="wfe-save" @click="onSaveClick">
          {{ t('workflowEditor.save') }}
        </button>
        <button class="bean-info__save-btn bean-info__save-btn--secondary" data-testid="wfe-save-as-new" @click="saveAsNew">
          {{ t('workflowEditor.saveAsNew') }}
        </button>
      </template>
      <template v-else-if="selectedIndex < 0 && dirty">
        <button class="bean-info__save-btn" data-testid="wfe-save-as-new" @click="saveAsNew">
          {{ t('workflowEditor.saveAsNew') }}
        </button>
      </template>
    </BottomBar>

    <PresetEditPopup
      :visible="editPopupVisible"
      :preset="editPopupPreset"
      operation-type="combo"
      :is-existing="true"
      @save="onComboEditSave"
      @delete="onComboEditDelete"
      @cancel="onComboEditCancel"
    />
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
  font-size: var(--font-md);
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
  font-size: var(--font-body);
  color: var(--color-text);
}

.bean-info__change-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-md);
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
  font-size: var(--font-body);
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
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.bean-info__hint {
  font-size: var(--font-sm);
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
  font-size: var(--font-body);
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
  font-size: var(--font-body);
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
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__op-badge {
  font-size: var(--font-sm);
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
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__toggle--on {
  background: var(--color-success);
  color: var(--color-text);
  border-color: var(--color-success);
}

.bean-info__save-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-success);
  color: var(--color-text);
  font-size: var(--font-md);
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

.bean-info__readonly {
  font-size: var(--font-body);
  color: var(--color-text);
  padding: 8px 0 2px;
}

.bean-info__batch-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
}

.bean-info__batch-detail {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.bean-info__link-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__link-btn:active {
  opacity: 0.7;
}

.bean-info__batch-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bean-info__batch-option {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-md);
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__batch-option--active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
}

.bean-info__batch-option:active {
  opacity: 0.7;
}

@media (max-width: 600px) {
  .bean-info__grid {
    grid-template-columns: 1fr;
  }
}

/* Dirty indicator — orange outline on the selected combo pill */
.bean-info__presets--dirty :deep(.preset-pill-row__pill--selected) {
  box-shadow: 0 0 0 2px #c89b3c;
}
</style>
