<script setup>
import { ref, computed, inject, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import RecipePillRail from '../components/RecipePillRail.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import SuggestionField from '../components/SuggestionField.vue'
import ProfilePickerModal from '../components/ProfilePickerModal.vue'
import ValueInput from '../components/ValueInput.vue'
import GrinderSettingInput from '../components/GrinderSettingInput.vue'
import SettingsToggle from '../components/settings/SettingsToggle.vue'
import BottomBar from '../components/BottomBar.vue'
import { useBeanLink } from '../composables/useBeanLink'
import { isComboModifiedVsForm } from '../composables/useComboDirty.js'
import { useShotHistorySuggestions } from '../composables/useShotHistorySuggestions'
import { useRecipeForm } from '../composables/useRecipeForm'
import { useRecipeLiveApply } from '../composables/useRecipeLiveApply'
import { useRecipeOverlay } from '../composables/useRecipeOverlay'
import { useRecipePersist } from '../composables/useRecipePersist'
import { LIMITS } from '../constants/limits'

const { suggestions: historySuggestions, load: loadHistorySuggestions } = useShotHistorySuggestions()

const settings = inject('settings', null)
const workflow = inject('workflow', null)
const workflowReady = inject('workflowReady', null)
const updateWorkflow = inject('updateWorkflow')
const toast = inject('toast', null)
const router = useRouter()
const { t } = useI18n()

const beans = inject('beans', ref([]))
const beansApi = inject('beansApi', null)
const grinders = inject('grinders', ref([]))
const grindersApi = inject('grindersApi', null)

// ---- Workflow combos (from form composable) ----
const form = useRecipeForm({ settings })
const {
  coffeeName, roaster, grinder, grinderSetting,
  doseIn, doseOut, ratioValue,
  selectedGrinderId,
  profileId, profileTitle, brewTemperature,
  grinderRpm, basketSize, basketType,
  includeSteam, steamDuration, steamFlow, steamTemperature,
  includeFlush, flushDuration, flushFlowRate,
  includeHotWater, hotWaterVolume, hotWaterTemperature,
  comboValues: _comboValues,
  pickBrewTempFromProfile,
  round1,
  selectedIndex,
  workflowCombos,
} = form

const selectedGrinder = computed(() => grinders.value.find(g => g.id === selectedGrinderId.value) ?? null)
const batchesForBean = ref([])
const showBatchList = ref(false)
const {
  selectedBeanId,
  selectedBatchId,
  linkedBean,
  linkedBatch: selectedBatch, // alias to keep template references working
  isLinked,
  enterLinked,
  clearLink,
  hydrateFromContext,
} = useBeanLink({ beans, beansApi, coffeeName, roaster })

// Wire comboValues to include bean link refs (owned by useBeanLink, not useRecipeForm)
const comboValues = () => _comboValues({ selectedBeanId, selectedBatchId })

// Form refs object passed to both live-apply and overlay composables.
// Must use the destructured refs directly (not form.xxx) to avoid ref
// divergence caused by Vite pre-bundler when an object mixes plain ref
// properties with getter/setter properties (the `updating` guard).
const refsForEditor = {
  coffeeName, roaster, grinder, grinderSetting,
  doseIn, doseOut, ratioValue,
  selectedGrinderId,
  profileId, profileTitle, brewTemperature,
  grinderRpm, basketSize, basketType,
  includeSteam, steamDuration, steamFlow, steamTemperature,
  includeFlush, flushDuration, flushFlowRate,
  includeHotWater, hotWaterVolume, hotWaterTemperature,
  updating: form.updating,
}

// ---- Live-apply composable ----
const {
  buildWorkflowUpdate,
  applyToLiveWorkflow,
  buildTemperatureOverrideProfile,
} = useRecipeLiveApply(refsForEditor, {
  settings, workflow, updateWorkflow,
  selectedBeanId, selectedBatchId, selectedGrinder, linkedBean,
  pickBrewTempFromProfile,
})

// ---- Dirty tracking ----
// Stays in SFC because it needs selectedBeanId from useBeanLink.
const dirty = computed(() => {
  if (selectedIndex.value < 0) {
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

// ---- Header display name ----
const recipeName = computed(() => {
  if (selectedIndex.value >= 0) {
    return workflowCombos.value[selectedIndex.value]?.name || t('recipe.title')
  }
  return t('recipe.title')
})

// ---- One-line recipe summary for the header strip ----
// Gives instant context: "Bean — 18g→36g (1:2) · Profile · 93°C"
const recipeSummary = computed(() => {
  const parts = []
  const bean = linkedBean.value?.name || coffeeName.value
  if (bean) parts.push(bean)
  if (doseIn.value > 0 || doseOut.value > 0) {
    const doseStr = `${Number(doseIn.value).toFixed(1)}g→${Number(doseOut.value).toFixed(1)}g`
    const ratioStr = ratioValue.value > 0 ? ` (1:${ratioValue.value.toFixed(1)})` : ''
    parts.push(doseStr + ratioStr)
  }
  if (profileTitle.value) parts.push(profileTitle.value)
  if (brewTemperature.value) parts.push(`${brewTemperature.value}°C`)
  return parts.join(' · ')
})

// ---- Overlay composable ----
const {
  loadFromPreset,
  overlayFromWorkflow,
  hydrateFromWorkflowContext,
  onChangeProfile,
  onGrinderSelect: _onGrinderSelect,
  isAwaitingProfileFromPicker,
  getAwaitingProfileBaselineId,
  setAwaitingProfileFromPicker,
} = useRecipeOverlay(refsForEditor, {
  workflow, grinders, beansApi,
  enterLinked, clearLink, hydrateFromContext,
  selectedBeanId, selectedBatchId, batchesForBean,
  pickBrewTempFromProfile, round1, workflowCombos, selectedIndex,
})

// Grinder select wrapper — also used by the template's @change handler
function onGrinderSelect(grinderId) { _onGrinderSelect(grinderId) }

onMounted(() => {
  loadHistorySuggestions()
  if (isAwaitingProfileFromPicker() && workflow?.profile) {
    const baselineId = getAwaitingProfileBaselineId()
    const currentKey = workflow.profile.id ?? workflow.profile.title ?? ''
    if (baselineId !== String(currentKey)) {
      refsForEditor.updating.value = true
      profileTitle.value = workflow.profile.title ?? ''
      profileId.value = workflow.profile.id ?? null
      const t = pickBrewTempFromProfile(workflow.profile)
      if (t != null) brewTemperature.value = t
      nextTick(() => { refsForEditor.updating.value = false })
    }
    setAwaitingProfileFromPicker(false)
  }
})

// ---- Operation settings popup ----
// Which operation's popup is open ('steam' | 'flush' | 'hotwater' | null).
// The popup edits the operation refs above by v-model; the existing
// live-apply watcher pushes those changes to the workflow.
const expandedOp = ref(null)
const showProfilePicker = ref(false)

function onProfilePicked(record) {
  refsForEditor.updating.value = true
  profileTitle.value = record.profile?.title ?? ''
  profileId.value = record.id ?? null
  const t = pickBrewTempFromProfile(record.profile)
  if (t != null) brewTemperature.value = t
  nextTick(() => { refsForEditor.updating.value = false })
  showProfilePicker.value = false
}

// Concise one-line summaries for the operations list rows. Show an em-dash
// when the operation is off; otherwise the active field values.
const steamSummary = computed(() =>
  includeSteam.value
    ? `${steamTemperature.value} °C · ${steamDuration.value} s`
    : t('recipe.opNotIncluded'),
)
const flushSummary = computed(() =>
  includeFlush.value
    ? `${flushDuration.value} s · ${flushFlowRate.value.toFixed(1)} mL/s`
    : t('recipe.opNotIncluded'),
)
const hotWaterSummary = computed(() =>
  includeHotWater.value
    ? `${hotWaterVolume.value} g · ${hotWaterTemperature.value} °C`
    : t('recipe.opNotIncluded'),
)

// ---- Bean/batch selection ----
async function onBeanSelect(beanId) {
  if (!beanId) {
    clearLink()
    coffeeName.value = ''
    roaster.value = ''
    batchesForBean.value = []
    return
  }
  await enterLinked(beanId)
  // The linked-mode watcher in useBeanLink already syncs coffeeName/roaster
  // to the bean record. Load batches for the picker dropdown.
  if (beansApi) {
    batchesForBean.value = await beansApi.getBatches(beanId).catch(() => []) ?? []
  }
}

async function onBatchSelect(batchId) {
  if (!selectedBeanId.value) return
  await enterLinked(selectedBeanId.value, batchId)
}

// ---- Batch info helper ----
function daysSinceRoast(batch) {
  if (!batch?.roastDate) return null
  const diff = Date.now() - new Date(batch.roastDate).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// ---- Mount-time load coordination ----
// If a recipe is selected, load it and overlay the live workflow on top.
// If none is selected, auto-select the first recipe (index 0) so the
// well-tested loadFromPreset + overlayFromWorkflow path handles context
// hydration including extras (basketType, grinderRpm, etc.). Falling
// through to hydrateFromWorkflowContext would skip the updating guard
// and loses extras on the first live-apply PUT.
const effectiveIndex = selectedIndex.value >= 0 ? selectedIndex.value
  : workflowCombos.value.length > 0 ? 0 : -1
if (effectiveIndex >= 0) {
  loadFromPreset(effectiveIndex).then(async () => {
    if (workflowReady) await workflowReady
    await overlayFromWorkflow()
  })
} else {
  // No recipes exist yet — hydrate whatever the workflow has (first-run user)
  if (workflowReady) {
    workflowReady.then(() => hydrateFromWorkflowContext())
  } else {
    hydrateFromWorkflowContext()
  }
}

// Sync profile from workflow only when no preset is loaded
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

// ---- Persist composable ----
const {
  saveToSelectedCombo,
  saveAsNew,
} = useRecipePersist(refsForEditor, {
  settings, toast, t,
  comboValues, linkedBean,
  selectedIndex, workflowCombos,
})

// ---- Suggestion lists: merge saved combos with shot-history mining ----
function mergeSorted(...lists) {
  const set = new Set()
  for (const list of lists) for (const v of list) if (v) set.add(v)
  return [...set].sort()
}
const coffeeSuggestions = computed(() => mergeSorted(
  workflowCombos.value.map(p => p.coffeeName ?? [p.beanBrand, p.beanType].filter(Boolean).join(' ')),
  historySuggestions.value.beanType,
))
const roasterSuggestions = computed(() => mergeSorted(
  workflowCombos.value.map(p => p.roaster),
  historySuggestions.value.roaster,
))
const grinderSuggestions = computed(() => mergeSorted(
  workflowCombos.value.map(p => p.grinder),
  historySuggestions.value.grinderModel,
))
const basketTypeSuggestions = computed(() => mergeSorted(
  workflowCombos.value.map(p => p.basketType),
  historySuggestions.value.basketType,
))

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
  if (!newProfile || refsForEditor.updating.value) return
  const explicitlyPicked = isAwaitingProfileFromPicker()
  const noComboSelected = selectedIndex.value < 0
  if (explicitlyPicked || noComboSelected) {
    profileTitle.value = newProfile.title ?? ''
    profileId.value = newProfile.id ?? null
    if (explicitlyPicked) {
      const t = pickBrewTempFromProfile(newProfile)
      if (t != null) brewTemperature.value = t
    }
    setAwaitingProfileFromPicker(false)
  }
}, { deep: true })
</script>

<template>
  <div class="recipe-editor">
    <div class="recipe-editor__main">
      <!-- Left rail: vertical recipe list + "+ New" button. -->
      <div class="recipe-editor__rail">
        <RecipePillRail
          :presets="workflowCombos"
          :selected-index="selectedIndex"
          :modified="dirty && selectedIndex >= 0"
          :aria-label="t('recipe.recipes')"
          @select="onPresetSelect"
          @edit="onComboEdit"
          @new="onSaveAsNewClick"
        />
      </div>

      <!-- Content area: header bar (recipe name + summary + save actions)
           above a single-column stack of section cards. The stack is the
           sole scroll region; the rail, header and BottomBar stay pinned.
           Save buttons appear only when the form has diverged from the
           selected recipe (or any field has a value when no recipe is
           selected). Exit (Home) is always free. -->
      <div class="recipe-editor__area">
        <div class="recipe-editor__area-header">
          <div class="recipe-editor__header-left">
            <span class="recipe-editor__header-name">{{ recipeName }}</span>
            <span v-if="recipeSummary" class="recipe-editor__header-summary">{{ recipeSummary }}</span>
          </div>
          <div class="recipe-editor__header-right">
            <span v-if="dirty" class="recipe-editor__badge" data-testid="recipe-modified-badge">
              {{ t('recipe.modified') }}
            </span>
            <div class="recipe-editor__actions">
              <button
                v-if="selectedIndex >= 0 && dirty"
                class="recipe-editor__save-btn"
                data-testid="wfe-save"
                @click="onSaveClick"
              >
                <svg class="recipe-editor__save-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                {{ t('recipe.save') }}
              </button>
              <button
                v-if="dirty"
                class="recipe-editor__save-btn recipe-editor__save-btn--secondary"
                data-testid="wfe-save-as-new"
                @click="onSaveAsNewClick"
              >
                <svg class="recipe-editor__save-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                {{ t('recipe.saveAsNew') }}
              </button>
            </div>
          </div>
        </div>

        <div class="recipe-editor__grid">
          <!-- ══════════════════════════════════════════════════════════
               Section 1: Coffee & Grind
               Merged card with a two-column internal split — coffee on the
               left, grinder on the right. The `recipe-editor__column` class
               is retained on this card for e2e locator compatibility
               (.recipe-editor__column first() must scope to coffee fields;
               the bean <select> is the first <select> in DOM order).
               ══════════════════════════════════════════════════════════ -->
          <div class="recipe-editor__quadrant recipe-editor__column">
            <h4 class="recipe-editor__section-title">
              <svg class="recipe-editor__section-icon recipe-editor__section-icon--coffee" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z"/>
                <path d="M6 1v3M10 1v3M14 1v3"/>
              </svg>
              {{ t('recipe.coffeeAndGrind') }}
            </h4>

            <div class="recipe-editor__split">
              <!-- ── Coffee column ── -->
              <div class="recipe-editor__split-col">
                <div class="recipe-editor__field">
                  <label class="recipe-editor__label">{{ t('recipe.bean') }}</label>
                  <select class="recipe-editor__input" :value="selectedBeanId" @change="onBeanSelect($event.target.value)">
                    <option value="">{{ t('recipe.manualEntry') }}</option>
                    <option v-for="b in beans" :key="b.id" :value="b.id">{{ b.roaster }} — {{ b.name }}</option>
                  </select>
                </div>

                <!-- Manual mode: free-text fields -->
                <template v-if="!selectedBeanId">
                  <div class="recipe-editor__field">
                    <label class="recipe-editor__label">{{ t('recipe.name') }}</label>
                    <SuggestionField
                      v-model="coffeeName"
                      placeholder="Coffee name"
                      :suggestions="coffeeSuggestions"
                    />
                  </div>
                  <div class="recipe-editor__field">
                    <label class="recipe-editor__label">{{ t('recipe.roaster') }}</label>
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
                    <label class="recipe-editor__label">{{ t('recipe.name') }}</label>
                    <span class="recipe-editor__readonly">{{ linkedBean?.name || coffeeName }}</span>
                  </div>
                  <div class="recipe-editor__field">
                    <label class="recipe-editor__label">{{ t('recipe.roaster') }}</label>
                    <span class="recipe-editor__readonly">{{ linkedBean?.roaster || roaster }}</span>
                  </div>
                  <div v-if="selectedBatch" class="recipe-editor__batch-info">
                    <span v-if="selectedBatch.roastDate" class="recipe-editor__batch-detail">
                      {{ t('recipe.roasted') }} {{ selectedBatch.roastDate }}
                      <template v-if="daysSinceRoast(selectedBatch) !== null">
                        ({{ daysSinceRoast(selectedBatch) }}d ago)
                      </template>
                    </span>
                    <span v-if="selectedBatch.weightRemaining != null" class="recipe-editor__batch-detail">
                      {{ t('recipe.remaining') }} {{ selectedBatch.weightRemaining }}g
                    </span>
                  </div>
                  <div v-if="batchesForBean.length > 1" class="recipe-editor__field">
                    <button class="recipe-editor__link-btn" @click="showBatchList = !showBatchList">
                      {{ showBatchList ? t('recipe.hideBatches') : t('recipe.switchBatch') }} ({{ batchesForBean.length }})
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

                <div v-if="settings?.settings?.showBasketData" class="recipe-editor__basket" data-testid="recipe-basket-section">
                  <h5 class="recipe-editor__subsection-title">{{ t('recipe.basket') }}</h5>
                  <div class="recipe-editor__field">
                    <label class="recipe-editor__label">{{ t('recipe.basketSize') }}</label>
                    <ValueInput
                      v-model="basketSize"
                      :min="LIMITS.weight.basketMin"
                      :max="LIMITS.weight.basketMax"
                      :step="0.5"
                      placeholder="—"
                    />
                  </div>
                  <div class="recipe-editor__field">
                    <label class="recipe-editor__label">{{ t('recipe.basketType') }}</label>
                    <SuggestionField
                      v-model="basketType"
                      placeholder="e.g. IMS Competition"
                      :suggestions="basketTypeSuggestions"
                      data-testid="recipe-basketType-input"
                    />
                  </div>
                </div>

                <button class="recipe-editor__link-btn recipe-editor__link-btn--manage" @click="router.push('/settings/beans')">{{ t('recipe.manage') }}</button>
              </div>

              <!-- ── Grinder column ── -->
              <div class="recipe-editor__split-col">
                <div class="recipe-editor__field">
                  <label class="recipe-editor__label">{{ t('recipe.grinder') }}</label>
                  <select class="recipe-editor__input" :value="selectedGrinderId" @change="onGrinderSelect($event.target.value)">
                    <option value="">{{ t('recipe.manualEntry') }}</option>
                    <option v-for="g in grinders" :key="g.id" :value="g.id">{{ g.model }}</option>
                  </select>
                </div>

                <!-- Manual mode: free-text grinder -->
                <template v-if="!selectedGrinderId">
                  <div class="recipe-editor__field">
                    <label class="recipe-editor__label">{{ t('recipe.grinderModel') }}</label>
                    <SuggestionField
                      v-model="grinder"
                      placeholder="Grinder model"
                      :suggestions="grinderSuggestions"
                    />
                  </div>
                  <div class="recipe-editor__field">
                    <label class="recipe-editor__label">{{ t('recipe.grinderSetting') }}</label>
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
                    <label class="recipe-editor__label">{{ t('recipe.grinderSetting') }}</label>
                    <GrinderSettingInput v-model="grinderSetting" :grinder="selectedGrinder" />
                  </div>
                </template>

                <div v-if="settings?.settings?.showGrinderRpm" class="recipe-editor__field" data-testid="recipe-grinderRpm-field">
                  <label class="recipe-editor__label">{{ t('recipe.rpm') }}</label>
                  <ValueInput
                    v-model="grinderRpm"
                    :min="selectedGrinder?.extras?.rpmMin ?? LIMITS.rpm.min"
                    :max="selectedGrinder?.extras?.rpmMax ?? LIMITS.rpm.max"
                    :step="50"
                    placeholder="—"
                  />
                </div>

                <button class="recipe-editor__link-btn recipe-editor__link-btn--manage" @click="router.push('/settings/grinders')">{{ t('recipe.manage') }}</button>
              </div>
            </div>
          </div>

          <!-- ══════════════════════════════════════════════════════════
               Section 2: Brew Plan
               Dose in/out/ratio in a 3-column row, then profile + temperature.
               ══════════════════════════════════════════════════════════ -->
          <div class="recipe-editor__quadrant">
            <h4 class="recipe-editor__section-title">
              <svg class="recipe-editor__section-icon recipe-editor__section-icon--dose" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v18M5 7h14M7 7l-4 8a4 4 0 0 0 8 0L7 7M17 7l-4 8a4 4 0 0 0 8 0l-4-8"/>
              </svg>
              {{ t('recipe.brewPlan') }}
            </h4>

            <!-- Dose row: 3 compact fields side by side, grouped as a
                 visual unit — these are the core brew target numbers. -->
            <div class="recipe-editor__field-row recipe-editor__dose-group">
              <div class="recipe-editor__field">
                <label class="recipe-editor__label">{{ t('recipe.doseIn') }}</label>
                <ValueInput
                  v-model="doseIn"
                  :min="LIMITS.weight.doseMin"
                  :max="LIMITS.weight.doseMax"
                  :step="0.1"
                  :decimals="1"
                  suffix="g"
                  data-testid="recipe-doseIn"
                />
              </div>
              <div class="recipe-editor__field">
                <label class="recipe-editor__label">{{ t('recipe.doseOut') }}</label>
                <ValueInput
                  v-model="doseOut"
                  :min="LIMITS.weight.yieldMin"
                  :max="LIMITS.weight.yieldMax"
                  :step="0.1"
                  :decimals="1"
                  suffix="g"
                />
              </div>
              <div class="recipe-editor__field">
                <label class="recipe-editor__label">{{ t('recipe.ratio') }}</label>
                <ValueInput
                  v-model="ratioValue"
                  :min="LIMITS.ratio.min"
                  :max="LIMITS.ratio.max"
                  :step="0.1"
                  :decimals="1"
                />
              </div>
            </div>

            <!-- Profile: prominent card-like row -->
            <div class="recipe-editor__profile-row">
              <div class="recipe-editor__profile-info">
                <span class="recipe-editor__profile-label">{{ t('recipe.profile') }}</span>
                <span class="recipe-editor__profile-name">{{ profileTitle || t('recipe.noProfileSelected') }}</span>
              </div>
              <button class="recipe-editor__change-btn" @click="showProfilePicker = true">{{ t('recipe.change') }}</button>
            </div>

            <!-- Temperature -->
            <div class="recipe-editor__field">
              <label class="recipe-editor__label">{{ t('recipe.temperature') }}</label>
              <ValueInput
                v-model="brewTemperature"
                :min="LIMITS.temp.brewMin"
                :max="LIMITS.temp.brewMax"
                :step="0.5"
                :decimals="1"
                suffix="°C"
                data-testid="recipe-brew-temperature"
              />
            </div>
          </div>

          <!-- ══════════════════════════════════════════════════════════
               Section 3: Operations
               3-row summary list with toggle + expandable detail.
               ══════════════════════════════════════════════════════════ -->
          <div class="recipe-editor__quadrant recipe-editor__operations">
            <h4 class="recipe-editor__section-title">
              <svg class="recipe-editor__section-icon recipe-editor__section-icon--ops" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="21" x2="4" y2="14"/>
                <line x1="4" y1="10" x2="4" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12" y2="3"/>
                <line x1="20" y1="21" x2="20" y2="16"/>
                <line x1="20" y1="12" x2="20" y2="3"/>
                <line x1="1" y1="14" x2="7" y2="14"/>
                <line x1="9" y1="8" x2="15" y2="8"/>
                <line x1="17" y1="16" x2="23" y2="16"/>
              </svg>
              {{ t('recipe.operations') }}
            </h4>

            <!-- Steam -->
            <div class="recipe-editor__op-block">
              <div class="recipe-editor__op-row" :class="{ 'recipe-editor__op-row--active': includeSteam }">
                <SettingsToggle v-model="includeSteam" :aria-label="t('recipe.steamSettings')" />
                <button
                  class="recipe-editor__op-open"
                  data-testid="recipe-op-steam"
                  @click="expandedOp = expandedOp === 'steam' ? null : 'steam'"
                >
                  <span class="recipe-editor__op-name">{{ t('recipe.steamSettings') }}</span>
                  <span class="recipe-editor__op-summary">{{ steamSummary }}</span>
                  <span class="recipe-editor__op-chevron" aria-hidden="true">{{ expandedOp === 'steam' ? '▲' : '▼' }}</span>
                </button>
              </div>
              <Transition name="op-expand">
              <div v-if="expandedOp === 'steam'" class="recipe-editor__op-detail">
                <div class="recipe-editor__field">
                  <label class="recipe-editor__label">{{ t('recipe.duration') }}</label>
                  <ValueInput v-model="steamDuration" :min="LIMITS.duration.steamMin" :max="LIMITS.duration.steamMax" :step="1" :decimals="0" suffix=" s" :aria-label="t('recipe.duration')" />
                </div>
                <div class="recipe-editor__field">
                  <label class="recipe-editor__label">{{ t('recipe.flow') }}</label>
                  <ValueInput v-model="steamFlow" :min="LIMITS.flow.steamMin" :max="LIMITS.flow.steamMax" :step="0.05" :decimals="2" suffix=" mL/s" :aria-label="t('recipe.flow')" />
                </div>
                <div class="recipe-editor__field">
                  <label class="recipe-editor__label">{{ t('recipe.temperature') }}</label>
                  <ValueInput v-model="steamTemperature" :min="LIMITS.temp.steamMin" :max="LIMITS.temp.steamMax" :step="1" :decimals="0" suffix=" °C" value-color="var(--color-temperature)" :aria-label="t('recipe.temperature')" />
                </div>
              </div>
              </Transition>
            </div>

            <!-- Flush -->
            <div class="recipe-editor__op-block">
              <div class="recipe-editor__op-row" :class="{ 'recipe-editor__op-row--active': includeFlush }">
                <SettingsToggle v-model="includeFlush" :aria-label="t('recipe.flushSettings')" />
                <button
                  class="recipe-editor__op-open"
                  data-testid="recipe-op-flush"
                  @click="expandedOp = expandedOp === 'flush' ? null : 'flush'"
                >
                  <span class="recipe-editor__op-name">{{ t('recipe.flushSettings') }}</span>
                  <span class="recipe-editor__op-summary">{{ flushSummary }}</span>
                  <span class="recipe-editor__op-chevron" aria-hidden="true">{{ expandedOp === 'flush' ? '▲' : '▼' }}</span>
                </button>
              </div>
              <Transition name="op-expand">
              <div v-if="expandedOp === 'flush'" class="recipe-editor__op-detail">
                <div class="recipe-editor__field">
                  <label class="recipe-editor__label">{{ t('recipe.duration') }}</label>
                  <ValueInput v-model="flushDuration" :min="LIMITS.duration.flushMin" :max="LIMITS.duration.flushMax" :step="0.5" :decimals="1" suffix=" s" :aria-label="t('recipe.duration')" />
                </div>
                <div class="recipe-editor__field">
                  <label class="recipe-editor__label">{{ t('recipe.flowRate') }}</label>
                  <ValueInput v-model="flushFlowRate" :min="LIMITS.flow.flushMin" :max="LIMITS.flow.flushMax" :step="0.5" :decimals="1" suffix=" mL/s" value-color="var(--color-flow)" :aria-label="t('recipe.flowRate')" />
                </div>
              </div>
              </Transition>
            </div>

            <!-- Hot Water -->
            <div class="recipe-editor__op-block">
              <div class="recipe-editor__op-row" :class="{ 'recipe-editor__op-row--active': includeHotWater }">
                <SettingsToggle v-model="includeHotWater" :aria-label="t('recipe.hotWaterSettings')" />
                <button
                  class="recipe-editor__op-open"
                  data-testid="recipe-op-hotwater"
                  @click="expandedOp = expandedOp === 'hotwater' ? null : 'hotwater'"
                >
                  <span class="recipe-editor__op-name">{{ t('recipe.hotWaterSettings') }}</span>
                  <span class="recipe-editor__op-summary">{{ hotWaterSummary }}</span>
                  <span class="recipe-editor__op-chevron" aria-hidden="true">{{ expandedOp === 'hotwater' ? '▲' : '▼' }}</span>
                </button>
              </div>
              <Transition name="op-expand">
              <div v-if="expandedOp === 'hotwater'" class="recipe-editor__op-detail">
                <div class="recipe-editor__field">
                  <label class="recipe-editor__label">{{ t('recipe.volume') }}</label>
                  <ValueInput v-model="hotWaterVolume" :min="LIMITS.weight.hotWaterMin" :max="LIMITS.weight.hotWaterMax" :step="10" :decimals="0" suffix=" g" :aria-label="t('recipe.volume')" />
                </div>
                <div class="recipe-editor__field">
                  <label class="recipe-editor__label">{{ t('recipe.temperature') }}</label>
                  <ValueInput v-model="hotWaterTemperature" :min="LIMITS.temp.hotWaterMin" :max="LIMITS.temp.hotWaterMax" :step="1" :decimals="0" suffix=" °C" value-color="var(--color-temperature)" :aria-label="t('recipe.temperature')" />
                </div>
              </div>
              </Transition>
            </div>
          </div>
        </div><!-- end grid -->
      </div><!-- end area -->
    </div><!-- end main -->

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

    <ProfilePickerModal
      :visible="showProfilePicker"
      @select="onProfilePicked"
      @close="showProfilePicker = false"
    />
  </div>
</template>

<style scoped>
/* ================================================================
 * Recipe Editor — v3: Impeccable refinement
 *
 * Guided by the 5 design principles:
 *   1. Purposeful density — compact spacing to reduce scroll on
 *      the 1024×600 target; every pixel earns its place.
 *   2. Confidence through clarity — dose row grouped as a visual
 *      unit; profile row enlarged to read as the "engine" of the
 *      recipe.
 *   3. Warmth without whimsy — soft transitions on operations
 *      expand/collapse; warm tint on coffee/batch info.
 *   4. Touch-native feel — all interactive elements ≥ 44px.
 *   5. Invisible complexity — progressive disclosure preserved;
 *      header summary gives at-a-glance context.
 * ================================================================ */

.recipe-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

/* ---- Main row: rail + area ---- */
.recipe-editor__main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
  padding: 10px 14px;
}

/* ---- Left rail ---- */
.recipe-editor__rail {
  flex: 0 0 180px;
  min-height: 0;
  display: flex;
}

/* ---- Content area ---- */
.recipe-editor__area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ---- Header bar: recipe name + summary on left, badge + saves on right ---- */
.recipe-editor__area-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 0 4px;
}

.recipe-editor__header-left {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.recipe-editor__header-name {
  font-size: var(--font-subtitle);
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recipe-editor__header-summary {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.recipe-editor__header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* Modified badge — warm amber pill */
.recipe-editor__badge {
  padding: 4px 10px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--color-water-low) 20%, transparent);
  color: var(--color-water-low);
  font-size: var(--font-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
}

.recipe-editor__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ---- Single-column stack ---- */
.recipe-editor__grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ---- Section cards: compact padding, subtle depth ---- */
.recipe-editor__quadrant {
  min-width: 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-card);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-surface) 100%, var(--color-background)) 0%,
    var(--color-surface) 100%
  );
  border: 1px solid var(--color-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

/* ---- Section title: icon + colored accent ---- */
.recipe-editor__section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-subtitle);
  font-weight: 700;
  color: var(--color-text);
  padding-bottom: 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
}

.recipe-editor__section-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.recipe-editor__section-icon--coffee { color: var(--color-weight); }
.recipe-editor__section-icon--grinder { color: var(--color-flow); }
.recipe-editor__section-icon--dose { color: var(--color-pressure); }
.recipe-editor__section-icon--ops { color: var(--color-warning); }

/* ---- Subsection title ---- */
.recipe-editor__subsection-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text-secondary);
  padding-bottom: 4px;
}

/* ================================================================
 * Coffee & Grind: 2-column internal split
 * ================================================================ */

.recipe-editor__split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
  flex: 1;
}

.recipe-editor__split-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* Visual divider between the two columns */
.recipe-editor__split-col:first-child {
  border-right: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
  padding-right: 20px;
}

/* ================================================================
 * Fields
 * ================================================================ */

.recipe-editor__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recipe-editor__label {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
  letter-spacing: 0.01em;
}

.recipe-editor__input {
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-background) 40%, var(--color-surface));
  color: var(--color-text);
  font-size: var(--font-body);
  outline: none;
  transition: border-color 0.15s ease;
}

.recipe-editor__input::placeholder { color: var(--color-text-secondary); }
.recipe-editor__input:focus { border-color: var(--color-primary); }

/* ---- Read-only entity display ---- */
.recipe-editor__readonly {
  font-size: var(--font-body);
  color: var(--color-text);
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-background) 50%, var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
}

/* ---- Batch info: warm coffee tint ---- */
.recipe-editor__batch-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-weight) 10%, var(--color-background));
  border: 1px solid color-mix(in srgb, var(--color-weight) 15%, transparent);
}

.recipe-editor__batch-detail {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.recipe-editor__batch-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* Touch target: ≥ 44px (was ~32px) */
.recipe-editor__batch-option {
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-md);
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.recipe-editor__batch-option--active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
}

.recipe-editor__batch-option:active { opacity: 0.7; }

/* ---- Link / manage buttons: 44px touch target ---- */
.recipe-editor__link-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  padding: 8px 0;
  min-height: 44px;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  display: flex;
  align-items: center;
}

.recipe-editor__link-btn:active { opacity: 0.7; }

.recipe-editor__link-btn--manage {
  margin-top: auto;
  padding-top: 4px;
}

/* ================================================================
 * Brew Plan: dose row + profile + temperature
 * ================================================================ */

/* 3-column row for dose in / dose out / ratio */
.recipe-editor__field-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
}

/* Dose group: subtle grouped background to read as a cohesive unit.
   The dose in/out/ratio are the core brew target — give them visual
   weight as a single concept, not three loose fields. */
.recipe-editor__dose-group {
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-pressure) 6%, var(--color-background));
  border: 1px solid color-mix(in srgb, var(--color-pressure) 12%, var(--color-border));
}

/* ---- Profile row: prominent — this is the "engine" of the recipe ---- */
.recipe-editor__profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, var(--color-border));
}

.recipe-editor__profile-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.recipe-editor__profile-label {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Profile name enlarged — it drives the extraction, make it confident */
.recipe-editor__profile-name {
  font-size: var(--font-subtitle);
  color: var(--color-text);
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Touch target: ≥ 44px (was ~38px) */
.recipe-editor__change-btn {
  flex-shrink: 0;
  min-height: 44px;
  padding: 10px 20px;
  border-radius: 10px;
  border: 1px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s ease;
  display: flex;
  align-items: center;
}

.recipe-editor__change-btn:active {
  background: color-mix(in srgb, var(--color-primary) 25%, transparent);
}

/* ---- Basket sub-section ---- */
.recipe-editor__basket {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
}

/* ================================================================
 * Save buttons
 * ================================================================ */

.recipe-editor__save-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 10px 22px;
  border-radius: 10px;
  border: none;
  background: var(--color-success);
  color: #fff;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-success) 30%, transparent);
  transition: opacity 0.1s ease, transform 0.1s ease;
}

.recipe-editor__save-btn:active {
  opacity: 0.85;
  transform: scale(0.98);
}

.recipe-editor__save-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  box-shadow: none;
}

.recipe-editor__save-icon { flex-shrink: 0; }

/* ================================================================
 * Operations
 * ================================================================ */

.recipe-editor__operations { gap: 6px; }

.recipe-editor__op-block {
  display: flex;
  flex-direction: column;
}

.recipe-editor__op-row {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-background) 40%, var(--color-surface));
  padding-left: 4px;
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.recipe-editor__op-row--active {
  border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border));
}

.recipe-editor__op-open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.recipe-editor__op-open:active { background: var(--color-surface-hover); }

.recipe-editor__op-name {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
}

.recipe-editor__op-summary {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.recipe-editor__op-row--active .recipe-editor__op-summary {
  color: var(--color-success);
}

.recipe-editor__op-chevron {
  font-size: var(--font-title);
  color: var(--color-text-secondary);
  flex-shrink: 0;
  line-height: 1;
}

/* Soft transition for expand/collapse (warmth without whimsy) */
.op-expand-enter-active,
.op-expand-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.op-expand-enter-from,
.op-expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.recipe-editor__op-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-top: none;
  border-radius: 0 0 10px 10px;
  background: color-mix(in srgb, var(--color-background) 30%, var(--color-surface));
}

/* ================================================================
 * Responsive: narrow screens stack the split into single column
 * ================================================================ */

@media (max-width: 700px) {
  .recipe-editor__main {
    flex-direction: column;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .recipe-editor__rail { flex: 0 0 auto; }
  .recipe-editor__area { min-height: 0; }

  .recipe-editor__area-header { flex-wrap: wrap; }

  .recipe-editor__grid { flex: 0 0 auto; }

  /* Stack the coffee/grinder split vertically on narrow screens */
  .recipe-editor__split {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .recipe-editor__split-col:first-child {
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
    padding-right: 0;
    padding-bottom: 12px;
  }

  /* Dose row: stack vertically on narrow screens */
  .recipe-editor__field-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .recipe-editor__save-btn {
    padding: 8px 16px;
    font-size: var(--font-md);
  }
}

</style>
