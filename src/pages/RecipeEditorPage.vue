<script setup>
import { ref, computed, inject, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import RecipePillRail from '../components/RecipePillRail.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import OperationSettingsPopup from '../components/OperationSettingsPopup.vue'
import SuggestionField from '../components/SuggestionField.vue'
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
} = useRecipeForm({ settings })

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

// ---- Live-apply composable ----
const {
  buildWorkflowUpdate,
  applyToLiveWorkflow,
  buildTemperatureOverrideProfile,
} = useRecipeLiveApply(form, {
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
} = useRecipeOverlay(form, {
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
      form.updating = true
      profileTitle.value = workflow.profile.title ?? ''
      profileId.value = workflow.profile.id ?? null
      const t = pickBrewTempFromProfile(workflow.profile)
      if (t != null) brewTemperature.value = t
      nextTick(() => { form.updating = false })
    }
    setAwaitingProfileFromPicker(false)
  }
})

// ---- Operation settings popup ----
// Which operation's popup is open ('steam' | 'flush' | 'hotwater' | null).
// The popup edits the operation refs above by v-model; the existing
// live-apply watcher pushes those changes to the workflow.
const activeOperation = ref(null)

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
// Load on mount if a preset is selected
if (selectedIndex.value >= 0) {
  loadFromPreset(selectedIndex.value).then(overlayFromWorkflow)
} else {
  hydrateFromWorkflowContext()
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
} = useRecipePersist(form, {
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
  if (!newProfile || form.updating) return
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
    <!-- Main row: recipe rail on the left, quadrant area on the right.
         Fills the viewport between the top and the BottomBar; neither the
         row nor the page scrolls — overflow is pushed down into the rail's
         recipe list and into individual quadrants. -->
    <div class="recipe-editor__main">
      <!-- Left rail: vertical recipe list + baked-in "+ New" button.
           The recipe list scrolls internally so "+ New" stays pinned. -->
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

      <!-- Quadrant area: a slim header strip (Save / Save as New, top-right)
           above a 2×2 grid of fixed-height quadrants.
           Save buttons are visible only when the form has diverged from the
           selected saved recipe (or, when no recipe is selected, when any
           identifiable field has a value). Tapping Save writes the form
           state back to the currently-selected recipe; Save as New creates
           a brand-new recipe from the current state and prompts for a
           name. Exit (Home) is always free — see onSaveClick comment. -->
      <div class="recipe-editor__area">
        <div class="recipe-editor__area-header">
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

        <div class="recipe-editor__grid">
          <!-- Q1: Coffee.
               Retains the legacy `recipe-editor__column` class because the
               bean-batch-integrity e2e suite scopes its locators to it
               (`.recipe-editor__column` first() == the Coffee column). -->
          <div class="recipe-editor__quadrant recipe-editor__column">
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

        <!-- Entity mode: read-only bean display + batch info. Read from the
             linked bean record; fall back to any legacy stored text (covers
             the case where the upstream bean was deleted). -->
        <template v-else>
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Name</label>
            <span class="recipe-editor__readonly">{{ linkedBean?.name || coffeeName }}</span>
          </div>

          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Roaster</label>
            <span class="recipe-editor__readonly">{{ linkedBean?.roaster || roaster }}</span>
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

        <div v-if="settings?.settings?.showBasketData" class="recipe-editor__basket" data-testid="recipe-basket-section">
          <h5 class="recipe-editor__subsection-title">Basket</h5>
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Size (g)</label>
            <ValueInput
              v-model="basketSize"
              :min="LIMITS.weight.basketMin"
              :max="LIMITS.weight.basketMax"
              :step="0.5"
              placeholder="—"
            />
          </div>
          <div class="recipe-editor__field">
            <label class="recipe-editor__label">Type</label>
            <SuggestionField
              v-model="basketType"
              placeholder="e.g. IMS Competition"
              :suggestions="basketTypeSuggestions"
              data-testid="recipe-basketType-input"
            />
          </div>
        </div>

            <button class="recipe-editor__link-btn" @click="router.push('/settings/beans')">Manage...</button>
          </div>

          <!-- Q2: Grinder -->
          <div class="recipe-editor__quadrant">
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

        <div v-if="settings?.settings?.showGrinderRpm" class="recipe-editor__field" data-testid="recipe-grinderRpm-field">
          <label class="recipe-editor__label">RPM</label>
          <ValueInput
            v-model="grinderRpm"
            :min="selectedGrinder?.extras?.rpmMin ?? LIMITS.rpm.min"
            :max="selectedGrinder?.extras?.rpmMax ?? LIMITS.rpm.max"
            :step="50"
            placeholder="—"
          />
        </div>

            <button class="recipe-editor__link-btn" @click="router.push('/settings/grinders')">Manage...</button>
          </div>

          <!-- Q3: Dose + Profile -->
          <div class="recipe-editor__quadrant">
            <h4 class="recipe-editor__section-title">Dose + Profile</h4>

            <div class="recipe-editor__field">
              <label class="recipe-editor__label">Dose In</label>
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
              <label class="recipe-editor__label">Dose Out</label>
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
              <label class="recipe-editor__label">Ratio (1:X)</label>
              <ValueInput
                v-model="ratioValue"
                :min="LIMITS.ratio.min"
                :max="LIMITS.ratio.max"
                :step="0.1"
                :decimals="1"
              />
            </div>

            <!-- Profile: compact single-line row (name + Change inline) -->
            <div class="recipe-editor__profile-row">
              <span class="recipe-editor__profile-name">{{ profileTitle || 'No profile selected' }}</span>
              <button class="recipe-editor__change-btn" @click="onChangeProfile">Change</button>
            </div>

            <div class="recipe-editor__field">
              <label class="recipe-editor__label">Temperature</label>
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

          <!-- Q4: Operations \u2014 calm 3-row summary list. The toggle flips
               the include flag; tapping the row body / chevron opens the
               per-operation popup. This quadrant renders its own heading. -->
          <div class="recipe-editor__quadrant recipe-editor__operations">
            <h4 class="recipe-editor__section-title">{{ t('recipe.operations') }}</h4>

            <!-- Steam -->
            <div class="recipe-editor__op-row">
              <SettingsToggle v-model="includeSteam" :aria-label="t('recipe.steamSettings')" />
              <button
                class="recipe-editor__op-open"
                data-testid="recipe-op-steam"
                @click="activeOperation = 'steam'"
              >
                <span class="recipe-editor__op-name">{{ t('recipe.steamSettings') }}</span>
                <span class="recipe-editor__op-summary">{{ steamSummary }}</span>
                <span class="recipe-editor__op-chevron" aria-hidden="true">&rsaquo;</span>
              </button>
            </div>

            <!-- Flush -->
            <div class="recipe-editor__op-row">
              <SettingsToggle v-model="includeFlush" :aria-label="t('recipe.flushSettings')" />
              <button
                class="recipe-editor__op-open"
                data-testid="recipe-op-flush"
                @click="activeOperation = 'flush'"
              >
                <span class="recipe-editor__op-name">{{ t('recipe.flushSettings') }}</span>
                <span class="recipe-editor__op-summary">{{ flushSummary }}</span>
                <span class="recipe-editor__op-chevron" aria-hidden="true">&rsaquo;</span>
              </button>
            </div>

            <!-- Hot Water -->
            <div class="recipe-editor__op-row">
              <SettingsToggle v-model="includeHotWater" :aria-label="t('recipe.hotWaterSettings')" />
              <button
                class="recipe-editor__op-open"
                data-testid="recipe-op-hotwater"
                @click="activeOperation = 'hotwater'"
              >
                <span class="recipe-editor__op-name">{{ t('recipe.hotWaterSettings') }}</span>
                <span class="recipe-editor__op-summary">{{ hotWaterSummary }}</span>
                <span class="recipe-editor__op-chevron" aria-hidden="true">&rsaquo;</span>
              </button>
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

    <!-- One popup per operation, each v-model-bound to its own refs. The
         popup mutates these refs directly; the live-apply watcher picks
         the change up and pushes it to the workflow. -->
    <OperationSettingsPopup
      operation-type="steam"
      :visible="activeOperation === 'steam'"
      v-model:include="includeSteam"
      v-model:duration="steamDuration"
      v-model:flow="steamFlow"
      v-model:temperature="steamTemperature"
      @close="activeOperation = null"
    />
    <OperationSettingsPopup
      operation-type="flush"
      :visible="activeOperation === 'flush'"
      v-model:include="includeFlush"
      v-model:duration="flushDuration"
      v-model:flow="flushFlowRate"
      @close="activeOperation = null"
    />
    <OperationSettingsPopup
      operation-type="hotwater"
      :visible="activeOperation === 'hotwater'"
      v-model:include="includeHotWater"
      v-model:volume="hotWaterVolume"
      v-model:temperature="hotWaterTemperature"
      @close="activeOperation = null"
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
 * Main row: fixed-width recipe rail + flexible quadrant area. Fills the
 * height between the top of the page and the BottomBar. `min-height: 0`
 * lets the inner grid/rail own their overflow so the page never scrolls.
 */
.recipe-editor__main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
}

/*
 * Left rail column. Fixed width — narrow enough to leave the two quadrant
 * columns ≥ ~360px each at 1024px. The RecipePillRail inside scrolls its
 * own recipe list (see RecipePillRail scoped CSS) so "+ New" stays pinned.
 */
.recipe-editor__rail {
  flex: 0 0 180px;
  min-height: 0;
  display: flex;
}

/*
 * Quadrant area: a slim header strip (Save buttons, right-aligned) on top
 * of the 2×2 quadrant grid. The header is pinned; the grid below it is the
 * single scroll region — so the rail and BottomBar always stay put while
 * the quadrants themselves render at full height (no per-quadrant clipping).
 */
.recipe-editor__area {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recipe-editor__area-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 40px;
}

.recipe-editor__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/*
 * 2×2 quadrant grid. Rows are content-height (`auto`), not stretched to
 * fill — quadrants render whole, never clipped. The grid is the single
 * scroll region: on a tall-enough screen everything fits with no scroll;
 * on a short screen (1024×600 target with both power-user toggles on) the
 * grid scrolls as one unit while the rail, header and BottomBar stay put.
 */
.recipe-editor__grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 12px;
  align-content: start;
}

.recipe-editor__quadrant {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.recipe-editor__profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
}

.recipe-editor__profile-name {
  font-size: var(--font-body);
  color: var(--color-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-editor__change-btn {
  flex-shrink: 0;
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

/* Q4 quadrant: the operations summary list. Inherits the quadrant box;
   the gap between rows is slightly tighter than the default field gap. */
.recipe-editor__operations {
  gap: 8px;
}

/*
 * Operations summary list. Each row: an iOS-knob include toggle on the
 * left, then a tappable body (label + summary text + chevron) that opens
 * the per-operation popup. The toggle just flips the include flag; the
 * row body opens the editor.
 */
.recipe-editor__op-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  padding-left: 4px;
  overflow: hidden;
}

.recipe-editor__op-open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.recipe-editor__op-open:active {
  background: var(--color-surface-hover);
}

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
}

.recipe-editor__op-chevron {
  font-size: var(--font-title);
  color: var(--color-text-secondary);
  flex-shrink: 0;
  line-height: 1;
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

/*
 * Narrow fallback (off-target, e.g. dev browser windows): drop the
 * landscape rail + quadrant layout and stack everything into a single
 * scrolling column. Functional, not pretty — the target device is the
 * 1024×600 tablet, this just keeps the page usable elsewhere.
 */
@media (max-width: 700px) {
  .recipe-editor__main {
    flex-direction: column;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .recipe-editor__rail {
    flex: 0 0 auto;
  }

  .recipe-editor__area {
    min-height: 0;
  }

  .recipe-editor__grid {
    flex: 0 0 auto;
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }

  .recipe-editor__quadrant {
    overflow-y: visible;
  }
}

</style>
