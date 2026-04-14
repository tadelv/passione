<script setup>
import { ref, computed, inject, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PresetPillRow from '../components/PresetPillRow.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import SuggestionField from '../components/SuggestionField.vue'
import ValueInput from '../components/ValueInput.vue'
import GrinderSettingInput from '../components/GrinderSettingInput.vue'
import BottomBar from '../components/BottomBar.vue'
import { isComboModifiedVsForm } from '../composables/useComboDirty.js'

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

// ---- "Awaiting profile from picker" flag ----
// Must survive the /recipe/edit → /profiles → /recipe/edit round-trip.
// Pages unmount between route changes, so this can't live in a ref — we
// use sessionStorage as a minimal cross-mount signal.
//
// We store the baseline profile id at the moment the user clicks "Change"
// so that a subsequent mount only honors the flag if workflow.profile has
// ACTUALLY changed since then. Without the baseline check, an abandoned
// round-trip (user clicked Change, then navigated away via Settings/Home
// instead of completing Use Profile) would leave the flag set and silently
// overwrite the profile row the next time the editor was opened.
const AWAITING_PROFILE_KEY = 'wfe:awaitingProfileFromPicker'
const AWAITING_PROFILE_BASELINE_KEY = 'wfe:awaitingProfileBaseline'
function isAwaitingProfileFromPicker() {
  try { return sessionStorage.getItem(AWAITING_PROFILE_KEY) === '1' } catch { return false }
}
function getAwaitingProfileBaselineId() {
  try { return sessionStorage.getItem(AWAITING_PROFILE_BASELINE_KEY) } catch { return null }
}
function setAwaitingProfileFromPicker(v, baselineId = null) {
  try {
    if (v) {
      sessionStorage.setItem(AWAITING_PROFILE_KEY, '1')
      if (baselineId != null) {
        sessionStorage.setItem(AWAITING_PROFILE_BASELINE_KEY, String(baselineId))
      } else {
        sessionStorage.removeItem(AWAITING_PROFILE_BASELINE_KEY)
      }
    } else {
      sessionStorage.removeItem(AWAITING_PROFILE_KEY)
      sessionStorage.removeItem(AWAITING_PROFILE_BASELINE_KEY)
    }
  } catch { /* no-op */ }
}

onMounted(() => {
  // Honor a pending profile pick from ProfileSelectorPage — pages unmount
  // between navigations, so loadFromPreset() ran first and overwrote the
  // form's profileTitle with the combo's saved value. Re-sync from workflow
  // if the user came back from the picker.
  //
  // Wrap the assignments in the _updating guard so the live-apply watcher
  // doesn't re-fire buildWorkflowUpdate() from stale form values set by
  // loadFromPreset — that would silently clobber any user-side diverged
  // context fields (grinderSetting, coffeeName, etc.) back to the combo's
  // saved defaults.
  if (isAwaitingProfileFromPicker() && workflow?.profile) {
    const baselineId = getAwaitingProfileBaselineId()
    const currentKey = workflow.profile.id ?? workflow.profile.title ?? ''
    // Only honor the flag if workflow.profile has actually changed since
    // the user clicked "Change" — otherwise this is an abandoned round-trip
    // (user bailed out without picking) and we'd wrongly stomp the form.
    if (baselineId !== String(currentKey)) {
      _updating = true
      profileTitle.value = workflow.profile.title ?? ''
      profileId.value = workflow.profile.id ?? null
      nextTick(() => { _updating = false })
    }
    setAwaitingProfileFromPicker(false)
  }
})

// Cancel any pending live-apply / batch-restore work when the page unmounts.
onBeforeUnmount(() => {
  clearTimeout(liveApplyTimer)
  liveApplyTimer = null
  _pendingBatchWatch?.()
  _pendingBatchWatch = null
})

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
// Form-state comparison is strict (every pinned field and every include
// flag must match the saved combo). The IdlePage pill-dot uses a lenient
// variant — see useComboDirty.js for the split.
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
  return isComboModifiedVsForm(saved, comboValues())
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
// Toast is fired by the caller so it can include the recipe name in the
// user-visible message without this function re-reading the combo list.
function saveToSelectedCombo() {
  if (!settings || selectedIndex.value < 0) return
  const combos = [...workflowCombos.value]
  const existing = combos[selectedIndex.value]
  combos[selectedIndex.value] = { ...existing, ...comboValues() }
  settings.settings.workflowCombos = combos
}

// ---- Save as new recipe ----
// Creates a combo from the current form state, selects it, and returns
// the new index so the caller can open the rename popup on it. Fires a
// "Created …" toast with the auto-generated name. Returns -1 on failure.
function saveAsNew() {
  if (!settings) return -1
  const autoName = coffeeName.value || profileTitle.value || t('recipe.newRecipeName')
  const vals = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: autoName,
    emoji: '',
    ...comboValues(),
  }
  const combos = [...workflowCombos.value, vals]
  settings.settings.workflowCombos = combos
  const newIndex = combos.length - 1
  settings.settings.selectedWorkflowCombo = newIndex
  toast?.success(t('recipe.toastCreated', { name: autoName }))
  return newIndex
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

// Round to one decimal without going through `+(...).toFixed(1)`, which
// re-parses the string and can leave residual float noise (e.g. 32.0000001
// vs a literal 32). Math.round on the *10 scaled value is exact.
function round1(n) {
  return Math.round(n * 10) / 10
}

// ---- Linked ratio: changing any of doseIn/doseOut/ratio updates the others ----
watch(doseIn, (val) => {
  if (_updating) return
  _updating = true
  if (val > 0 && ratioValue.value > 0) {
    doseOut.value = round1(val * ratioValue.value)
  }
  _updating = false
})

watch(doseOut, (val) => {
  if (_updating) return
  _updating = true
  if (doseIn.value > 0 && val > 0) {
    ratioValue.value = round1(val / doseIn.value)
  }
  _updating = false
})

watch(ratioValue, (val) => {
  if (_updating) return
  _updating = true
  if (doseIn.value > 0 && val > 0) {
    doseOut.value = round1(doseIn.value * val)
  }
  _updating = false
})

// ---- Profile change navigation ----
function onChangeProfile() {
  // Snapshot the current workflow profile id so onMounted can verify that
  // an ACTUAL profile pick occurred before honoring the flag.
  const baselineId = workflow?.profile?.id ?? workflow?.profile?.title ?? ''
  setAwaitingProfileFromPicker(true, baselineId)
  router.push('/profiles?from=workflow')
}

// ---- Save action handlers ----
//
// Under the new model there is no unsaved-state guard: the live workflow
// is auto-applied on every edit, and the saved combo is only mutated when
// the user explicitly taps Save or Save as New Recipe. Exit (Home) is
// always free — nothing is ever "lost" because live state is always live
// and combo state is always deliberate.

function onSaveClick() {
  if (selectedIndex.value < 0) return
  const combo = workflowCombos.value[selectedIndex.value]
  saveToSelectedCombo()
  toast?.success(t('recipe.toastSaved', { name: combo?.name || t('recipe.title') }))
}

// Save as New Recipe: create a new combo from the current form state,
// select it, then immediately open the rename popup so the user can
// customize the auto-generated name without it being a two-step flow.
function onSaveAsNewClick() {
  const index = saveAsNew()
  if (index < 0) return
  // Open the rename popup pointed at the freshly-created combo
  editPopupIndex.value = index
  editPopupPreset.value = workflowCombos.value[index]
  editPopupVisible.value = true
}

// Sync profile title when returning from ProfileSelectorPage.
// Accepts workflow.profile updates in two cases:
//   1. No combo selected — ambient safety default
//   2. User explicitly picked a profile via the Change button (sessionStorage flag)
watch(() => workflow?.profile, (newProfile) => {
  if (!newProfile || _updating) return
  const explicitlyPicked = isAwaitingProfileFromPicker()
  const noComboSelected = selectedIndex.value < 0
  if (explicitlyPicked || noComboSelected) {
    profileTitle.value = newProfile.title ?? ''
    profileId.value = newProfile.id ?? null
    setAwaitingProfileFromPicker(false)
  }
}, { deep: true })
</script>

<template>
  <div class="recipe-editor">
    <!-- Header: recipe pill row + Save / Save as New buttons.
         Save buttons are visible only when the form has diverged from the
         selected saved recipe (or, when no recipe is selected, when any
         identifiable field has a value). Tapping Save writes the form
         state back to the currently-selected recipe; Save as New creates
         a brand-new recipe from the current state and prompts for a
         name. Exit (Home) is always free — see onSaveClick comment. -->
    <div class="recipe-editor__header">
      <div class="recipe-editor__presets">
        <PresetPillRow
          :presets="workflowCombos"
          :selected-index="selectedIndex"
          :edit-enabled="true"
          :modified="dirty && selectedIndex >= 0"
          :aria-label="t('recipe.recipes')"
          @select="onPresetSelect"
          @edit="onComboEdit"
        />
      </div>
      <div class="recipe-editor__actions">
        <button
          v-if="selectedIndex >= 0 && dirty"
          class="recipe-editor__save-btn"
          data-testid="wfe-save"
          @click="onSaveClick"
        >
          {{ t('recipe.save') }}
        </button>
        <button
          v-if="dirty"
          class="recipe-editor__save-btn recipe-editor__save-btn--secondary"
          data-testid="wfe-save-as-new"
          @click="onSaveAsNewClick"
        >
          {{ t('recipe.saveAsNew') }}
        </button>
      </div>
    </div>

    <!-- Scrollable content area -->
    <div class="recipe-editor__scroll">

    <!-- Profile section -->
    <div class="recipe-editor__profile-section">
      <h4 class="recipe-editor__section-title">Profile</h4>
      <div class="recipe-editor__profile-row">
        <span class="recipe-editor__profile-name">{{ profileTitle || 'No profile selected' }}</span>
        <button class="recipe-editor__change-btn" @click="onChangeProfile">Change</button>
      </div>
    </div>

    <!-- Field grid -->
    <div class="recipe-editor__grid">
      <!-- Column 1: Coffee -->
      <div class="recipe-editor__column">
        <h4 class="recipe-editor__section-title">Coffee</h4>

        <div class="recipe-editor__field">
          <label class="recipe-editor__label">Bean</label>
          <select class="recipe-editor__input" :value="selectedBeanId" @change="onBeanSelect($event.target.value)">
            <option value="">Manual entry...</option>
            <option v-for="b in beans" :key="b.id" :value="b.id">{{ b.roaster }} — {{ b.name }}</option>
          </select>
        </div>

        <!-- Manual mode: free-text fields -->
        <template v-if="!selectedBeanId">
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Name</label>
            <SuggestionField
              v-model="coffeeName"
              placeholder="Coffee name"
              :suggestions="coffeeSuggestions"
            />
          </div>

          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Roaster</label>
            <SuggestionField
              v-model="roaster"
              placeholder="Roaster name"
              :suggestions="roasterSuggestions"
            />
          </div>
        </template>

        <!-- Entity mode: read-only bean display + batch info -->
        <template v-else>
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Name</label>
            <span class="recipe-editor__readonly">{{ coffeeName }}</span>
          </div>

          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Roaster</label>
            <span class="recipe-editor__readonly">{{ roaster }}</span>
          </div>

          <div v-if="selectedBatch" class="recipe-editor__batch-info">
            <span v-if="selectedBatch.roastDate" class="recipe-editor__batch-detail">
              Roasted: {{ selectedBatch.roastDate }}
              <template v-if="daysSinceRoast(selectedBatch) !== null">
                ({{ daysSinceRoast(selectedBatch) }}d ago)
              </template>
            </span>
            <span v-if="selectedBatch.weightRemaining != null" class="recipe-editor__batch-detail">
              Remaining: {{ selectedBatch.weightRemaining }}g
            </span>
          </div>

          <div v-if="batchesForBean.length > 1" class="recipe-editor__field">
            <button class="recipe-editor__link-btn" @click="showBatchList = !showBatchList">
              {{ showBatchList ? 'Hide batches' : 'Switch batch' }} ({{ batchesForBean.length }})
            </button>
            <div v-if="showBatchList" class="recipe-editor__batch-list">
              <button
                v-for="b in batchesForBean"
                :key="b.id"
                class="recipe-editor__batch-option"
                :class="{ 'recipe-editor__batch-option--active': b.id === selectedBatchId }"
                @click="onBatchSelect(b.id)"
              >
                {{ b.roastDate || 'No date' }}
                <span v-if="b.weightRemaining != null"> · {{ b.weightRemaining }}g</span>
              </button>
            </div>
          </div>
        </template>

        <button class="recipe-editor__link-btn" @click="router.push('/settings/beans')">Manage...</button>
      </div>

      <!-- Column 2: Grinder -->
      <div class="recipe-editor__column">
        <h4 class="recipe-editor__section-title">Grinder</h4>

        <div class="recipe-editor__field">
          <label class="recipe-editor__label">Grinder</label>
          <select class="recipe-editor__input" :value="selectedGrinderId" @change="onGrinderSelect($event.target.value)">
            <option value="">Manual entry...</option>
            <option v-for="g in grinders" :key="g.id" :value="g.id">{{ g.model }}</option>
          </select>
        </div>

        <!-- Manual mode: free-text grinder -->
        <template v-if="!selectedGrinderId">
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Model</label>
            <SuggestionField
              v-model="grinder"
              placeholder="Grinder model"
              :suggestions="grinderSuggestions"
            />
          </div>

          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Setting</label>
            <input
              class="recipe-editor__input"
              type="text"
              v-model="grinderSetting"
              placeholder="Grind setting"
            />
          </div>
        </template>

        <!-- Entity mode: GrinderSettingInput -->
        <template v-else>
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Setting</label>
            <GrinderSettingInput v-model="grinderSetting" :grinder="selectedGrinder" />
          </div>
        </template>

        <button class="recipe-editor__link-btn" @click="router.push('/settings/grinders')">Manage...</button>
      </div>

      <!-- Column 3: Dose -->
      <div class="recipe-editor__column">
        <h4 class="recipe-editor__section-title">Dose</h4>

        <div class="recipe-editor__field">
          <label class="recipe-editor__label">Dose In</label>
          <ValueInput
            v-model="doseIn"
            :min="0"
            :max="40"
            :step="0.1"
            :decimals="1"
            suffix="g"
          />
        </div>

        <div class="recipe-editor__field">
          <label class="recipe-editor__label">Dose Out</label>
          <ValueInput
            v-model="doseOut"
            :min="0"
            :max="500"
            :step="0.1"
            :decimals="1"
            suffix="g"
          />
        </div>

        <div class="recipe-editor__field">
          <label class="recipe-editor__label">Ratio (1:X)</label>
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
    <div class="recipe-editor__operations">
      <!-- Steam -->
      <div class="recipe-editor__op-section">
        <button class="recipe-editor__op-toggle" @click="includeSteam = !includeSteam">
          <span>{{ includeSteam ? '\u25BE' : '\u25B8' }} Steam Settings</span>
          <span class="recipe-editor__op-badge" v-if="includeSteam">included</span>
        </button>
        <div v-if="includeSteam" class="recipe-editor__op-fields">
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Duration</label>
            <ValueInput v-model="steamDuration" :min="1" :max="120" :step="1" :decimals="0" suffix=" s" />
          </div>
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Flow</label>
            <ValueInput v-model="steamFlow" :min="0.4" :max="2.5" :step="0.05" :decimals="2" suffix=" mL/s" />
          </div>
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Temperature</label>
            <ValueInput v-model="steamTemperature" :min="100" :max="170" :step="1" :decimals="0" suffix=" &deg;C" />
          </div>
        </div>
      </div>

      <!-- Flush -->
      <div class="recipe-editor__op-section">
        <button class="recipe-editor__op-toggle" @click="includeFlush = !includeFlush">
          <span>{{ includeFlush ? '\u25BE' : '\u25B8' }} Flush Settings</span>
          <span class="recipe-editor__op-badge" v-if="includeFlush">included</span>
        </button>
        <div v-if="includeFlush" class="recipe-editor__op-fields">
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Duration</label>
            <ValueInput v-model="flushDuration" :min="1" :max="30" :step="0.5" :decimals="1" suffix=" s" />
          </div>
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Flow Rate</label>
            <ValueInput v-model="flushFlowRate" :min="2" :max="10" :step="0.5" :decimals="1" suffix=" mL/s" />
          </div>
        </div>
      </div>

      <!-- Hot Water -->
      <div class="recipe-editor__op-section">
        <button class="recipe-editor__op-toggle" @click="includeHotWater = !includeHotWater">
          <span>{{ includeHotWater ? '\u25BE' : '\u25B8' }} Hot Water Settings</span>
          <span class="recipe-editor__op-badge" v-if="includeHotWater">included</span>
        </button>
        <div v-if="includeHotWater" class="recipe-editor__op-fields">
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Volume</label>
            <ValueInput v-model="hotWaterVolume" :min="50" :max="500" :step="10" :decimals="0" suffix=" g" />
          </div>
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Temperature</label>
            <ValueInput v-model="hotWaterTemperature" :min="40" :max="100" :step="1" :decimals="0" suffix=" &deg;C" />
          </div>
        </div>
      </div>
    </div>

    </div><!-- end scroll -->

    <BottomBar
      :title="selectedIndex >= 0
        ? workflowCombos[selectedIndex]?.name || t('recipe.title')
        : t('recipe.title')"
      :show-back-button="false"
    />

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
.recipe-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

/*
 * Header row: recipe pill row on the left, Save / Save as New action
 * buttons on the right. The row collapses to wrap on narrow viewports.
 * The pill row owns the dirty-dot indicator (via the :modified prop);
 * the Save buttons only render when the form has diverged from the
 * saved recipe.
 */
.recipe-editor__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.recipe-editor__presets {
  flex: 1 1 auto;
  min-width: 0;
}

.recipe-editor__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.recipe-editor__scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
}

.recipe-editor__profile-section {
  padding: 0 16px;
}

.recipe-editor__profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin-top: 8px;
  border-radius: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.recipe-editor__profile-name {
  font-size: var(--font-body);
  color: var(--color-text);
}

.recipe-editor__change-btn {
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

.recipe-editor__change-btn:active {
  opacity: 0.7;
}

.recipe-editor__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
  padding: 16px;
  align-content: start;
}

.recipe-editor__column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recipe-editor__section-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border);
}

.recipe-editor__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recipe-editor__label {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.recipe-editor__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.recipe-editor__input {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
  outline: none;
}

.recipe-editor__input::placeholder {
  color: var(--color-text-secondary);
}

.recipe-editor__input:focus {
  border-color: var(--color-primary);
}

.recipe-editor__select {
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

.recipe-editor__operations {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recipe-editor__op-section {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.recipe-editor__op-toggle {
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

.recipe-editor__op-badge {
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--color-success);
  text-transform: uppercase;
}

.recipe-editor__op-fields {
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--color-border);
}

.recipe-editor__op-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

.recipe-editor__toggle {
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

.recipe-editor__toggle--on {
  background: var(--color-success);
  color: var(--color-text);
  border-color: var(--color-success);
}

.recipe-editor__save-btn {
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

.recipe-editor__save-btn:active {
  opacity: 0.8;
}

.recipe-editor__save-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.recipe-editor__readonly {
  font-size: var(--font-body);
  color: var(--color-text);
  padding: 8px 0 2px;
}

.recipe-editor__batch-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
}

.recipe-editor__batch-detail {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.recipe-editor__link-btn {
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

.recipe-editor__link-btn:active {
  opacity: 0.7;
}

.recipe-editor__batch-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recipe-editor__batch-option {
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

.recipe-editor__batch-option--active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
}

.recipe-editor__batch-option:active {
  opacity: 0.7;
}

@media (max-width: 600px) {
  .recipe-editor__grid {
    grid-template-columns: 1fr;
  }
}

</style>
