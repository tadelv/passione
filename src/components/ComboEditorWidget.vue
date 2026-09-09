<script setup>
/**
 * ComboEditorWidget — dense home quick editor for the CURRENT live workflow.
 *
 * It never mutates the selected saved recipe: every edit is a partial
 * workflow PUT (deep-merged by the gateway) exactly like the full Combo
 * Editor's live-apply path. The modified-dot divergence indicator on the
 * recipe pill (IdlePage) reacts to these workflow changes on its own.
 *
 * Tools reuse the existing Passione controls and shared semantics:
 *   - coffee  → BeanPickerPopup (unchanged quick picker)
 *   - grind   → GrinderSettingInput
 *   - dose    → useRecipeForm doseIn/doseOut/ratioValue (linked-cascade rules)
 *   - temp    → applyBrewTemperatureOverride (delta profile clone, saved
 *               profile never mutated)
 *   - rpm     → ctx.extras.grinderRpm via ValueInput (extras shape)
 *   - basket  → ctx.extras.basketSize/basketType via existing controls
 *
 * Availability model: a configured tool that has no current value stays
 * visible but inert, showing "—" (the home layout does not reflow through
 * connection/workflow transitions).
 */
import { ref, reactive, computed, inject, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ValueInput from './ValueInput.vue'
import GrinderSettingInput from './GrinderSettingInput.vue'
import BeanPickerPopup from './BeanPickerPopup.vue'
import SuggestionField from './SuggestionField.vue'
import { useRecipeForm } from '../composables/useRecipeForm.js'
import { normalizeComboEditorTools } from '../composables/useComboEditorConfig.js'
import {
  profileFirstStepTemp,
  applyBrewTemperatureOverride,
  brewOverrideNeeded,
} from '../composables/useProfileCurve.js'
import { roundGrinderSetting } from '../composables/useGrinderSetting.js'
import { LIMITS } from '../constants/limits.js'

const props = defineProps({
  /** False while a recipe load is in flight — inputs go inert. */
  editEnabled: { type: Boolean, default: true },
})

const { t } = useI18n()
const router = useRouter()

const workflow = inject('workflow', null)
const updateWorkflow = inject('updateWorkflow', null)
const settings = inject('settings', null)
const toast = inject('toast', null)
const grinders = inject('grinders', ref([]))

// ---- Tool visibility (fixed order, see useComboEditorConfig.js) ----
const tools = computed(() => normalizeComboEditorTools(settings?.settings?.comboEditorTools))

// ---- Shared form refs — same useRecipeForm the full editor uses, so the
// linked dose/ratio/output cascade semantics are identical by construction.
const form = useRecipeForm({ settings })
const { doseIn, doseOut, ratioValue, grinderSetting, brewTemperature, grinderRpm, basketSize, basketType, round1 } = form
const updating = form.updating

// ---- Workflow-derived state ----
const ctx = computed(() => workflow?.context ?? {})
const extras = computed(() => ctx.value.extras ?? {})

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const doseInputCtx = computed(() => num(ctx.value.targetDoseWeight))
const doseOutCtx = computed(() => num(ctx.value.targetYield))
const doseAvailable = computed(() => doseInputCtx.value != null && doseOutCtx.value != null)
const grindAvailable = computed(() => ctx.value.grinderSetting != null)
const tempAvailable = computed(() => profileFirstStepTemp(workflow?.profile) != null)
// RPM/basket live in workflow ctx extras; like the full editor they stay
// editable once a workflow context exists (defaults apply until first edit).
const rpmAvailable = computed(() => !!workflow?.context)
const basketAvailable = computed(() => !!workflow?.context)

const coffeeText = computed(() => {
  const name = ctx.value.coffeeName ?? ''
  const roaster = ctx.value.coffeeRoaster ?? ''
  return [roaster, name].filter(Boolean).join(' — ')
})

const basketSizeCtx = computed(() => num(extras.value.basketSize))
const basketTypeCtx = computed(() => extras.value.basketType ?? '')
const basketLabel = computed(() =>
  basketSizeCtx.value != null
    ? `${basketSizeCtx.value.toFixed(0)} g${basketTypeCtx.value ? ` · ${basketTypeCtx.value}` : ''}`
    : ''
)

const basketTypeSuggestions = computed(() => {
  const seen = new Set()
  for (const combo of settings?.settings?.workflowCombos ?? []) {
    if (combo.basketType) seen.add(combo.basketType)
  }
  return [...seen]
})

const ctxGrinderId = computed(() => (ctx.value.grinderId != null ? String(ctx.value.grinderId) : null))
const selectedGrinder = computed(
  () => grinders.value.find((g) => String(g.id) === ctxGrinderId.value) ?? null
)

// ---- Coffee (BeanPickerPopup owns the live-ctx write) ----
const beanPickerOpen = ref(false)
const beanPickerBatchId = computed(() =>
  ctx.value.beanBatchId != null ? String(ctx.value.beanBatchId) : null
)
function openCoffeePicker() {
  if (!props.editEnabled) return
  beanPickerOpen.value = true
}

// ---- Edit state: per-tool dirty flags + one debounced partial PUT ----
const dirty = reactive({ dose: false, grind: false, temp: false, rpm: false, basket: false })
// Generation counter per tool: every user edit bumps it, so an in-flight flush
// can tell whether a tool's dirty state changed while its PUT was out.
const dirtyGen = { dose: 0, grind: 0, temp: 0, rpm: 0, basket: 0 }
let flushTimer = null

function clearDirty() {
  for (const k of Object.keys(dirty)) dirty[k] = false
}

function scheduleEdit(tool) {
  if (!props.editEnabled) return
  dirty[tool] = true
  dirtyGen[tool]++
  if (flushTimer == null) {
    flushTimer = setTimeout(flushEdits, 300)
  }
}

function buildPatch() {
  if (!workflow) return null
  const patch = {}
  const patchCtx = {}
  if (dirty.dose && doseAvailable.value) {
    patchCtx.targetDoseWeight = round1(doseIn.value)
    patchCtx.targetYield = round1(doseOut.value)
  }
  if (dirty.grind && grindAvailable.value) {
    patchCtx.grinderSetting = roundGrinderSetting(grinderSetting.value, selectedGrinder.value) ?? grinderSetting.value
  }
  if (dirty.rpm || dirty.basket) {
    const mergedExtras = { ...(workflow.context?.extras ?? {}) }
    if (dirty.rpm) mergedExtras.grinderRpm = Number(grinderRpm.value)
    if (dirty.basket) {
      mergedExtras.basketSize = Number(basketSize.value)
      mergedExtras.basketType = basketType.value || null
    }
    patchCtx.extras = mergedExtras
  }
  if (Object.keys(patchCtx).length) patch.context = patchCtx
  if (dirty.temp && tempAvailable.value) {
    const bt = Number(brewTemperature.value)
    if (Number.isFinite(bt) && brewOverrideNeeded(workflow.profile, bt)) {
      patch.profile = applyBrewTemperatureOverride(workflow.profile, bt)
    }
  }
  return Object.keys(patch).length ? patch : null
}

async function flushEdits() {
  flushTimer = null
  if (!updateWorkflow) {
    clearDirty()
    return
  }
  let patch
  try {
    patch = buildPatch()
    if (!patch) {
      clearDirty()
      return
    }
    // Snapshot the generation of each tool this PUT covers, before awaiting.
    // On success only those are cleared — a tool edited again while the PUT was
    // in flight has bumped its generation, so its newer dirty state survives
    // and the edit watcher's own debounce pushes it (no dropped edit).
    const sentGen = {}
    for (const k of Object.keys(dirty)) {
      if (dirty[k]) sentGen[k] = dirtyGen[k]
    }
    await updateWorkflow(patch)
    for (const k of Object.keys(sentGen)) {
      if (dirtyGen[k] === sentGen[k]) dirty[k] = false
    }
  } catch (e) {
    console.warn('[comboEditor] live workflow update failed:', e)
    toast?.error?.(t?.('comboEditor.applyFailed') || 'Failed to apply this change to the machine')
  }
}

// ---- Mirror live workflow into the form (external changes win) ----
// Fields that the user has edited but not yet flushed are left alone so a
// concurrent ctx echo (e.g. the coffee picker's own PUT) can't stomp an
// in-flight edit; the pending flush pushes it right after.
let mirrorBusy = false
async function mirrorFromWorkflow() {
  if (!workflow || mirrorBusy) return
  mirrorBusy = true
  updating.value = true
  try {
    const c = workflow.context ?? {}
    const e = c.extras ?? {}
    if (!dirty.dose) {
      const dIn = num(c.targetDoseWeight)
      const dOut = num(c.targetYield)
      if (dIn != null) doseIn.value = dIn
      if (dOut != null) doseOut.value = dOut
      if (doseIn.value > 0 && doseOut.value > 0) ratioValue.value = round1(doseOut.value / doseIn.value)
    }
    if (!dirty.grind && c.grinderSetting != null) grinderSetting.value = String(c.grinderSetting)
    if (!dirty.temp) {
      const t0 = profileFirstStepTemp(workflow.profile)
      if (t0 != null) brewTemperature.value = t0
    }
    if (!dirty.rpm && e.grinderRpm != null) grinderRpm.value = num(e.grinderRpm) ?? grinderRpm.value
    if (!dirty.basket) {
      if (e.basketSize != null) basketSize.value = num(e.basketSize) ?? basketSize.value
      if (e.basketType != null) basketType.value = String(e.basketType)
    }
    // Drain queued cascade/live watchers while the guard is still raised.
    await nextTick()
  } finally {
    updating.value = false
    mirrorBusy = false
  }
}

watch(() => [workflow?.context, workflow?.profile], mirrorFromWorkflow, { deep: true, immediate: true })

// ---- Per-tool edit watchers (skip mirror/sync flushes) ----
watch([doseIn, doseOut, ratioValue], () => {
  if (updating.value || mirrorBusy) return
  if (!doseAvailable.value) return
  scheduleEdit('dose')
})
watch(grinderSetting, () => {
  if (updating.value || mirrorBusy) return
  if (!grindAvailable.value) return
  scheduleEdit('grind')
})
watch(brewTemperature, () => {
  if (updating.value || mirrorBusy) return
  if (!tempAvailable.value) return
  scheduleEdit('temp')
})
watch(grinderRpm, () => {
  if (updating.value || mirrorBusy) return
  if (!rpmAvailable.value) return
  scheduleEdit('rpm')
})
watch([basketSize, basketType], () => {
  if (updating.value || mirrorBusy) return
  if (!basketAvailable.value) return
  scheduleEdit('basket')
})

// ---- Busy (recipe load) guard: drop pending edits so they can't clobber
// the loaded recipe's workflow, then let the echo re-hydrate the form.
watch(() => props.editEnabled, (v) => {
  if (!v) {
    clearTimeout(flushTimer)
    flushTimer = null
    clearDirty()
  }
})

// Flush a pending debounced edit on the way out so navigating away within
// the debounce window never silently discards the user's change.
onBeforeUnmount(() => {
  if (flushTimer == null) return
  clearTimeout(flushTimer)
  flushTimer = null
  if (!props.editEnabled) return // recipe load owns the workflow now
  flushEdits()
})

// Basket row expansion
const basketOpen = ref(false)

const busy = computed(() => !props.editEnabled)

function goFullEditor() {
  router.push('/recipe/edit')
}
</script>

<template>
  <div
    class="combo-editor"
    :aria-disabled="busy ? 'true' : undefined"
    :inert="busy ? '' : undefined"
  >
    <!-- Coffee -->
    <button
      v-if="tools.coffee"
      type="button"
      class="combo-editor__coffee"
      data-testid="combo-coffee"
      :aria-label="t('comboEditor.selectCoffee') || 'Select coffee'"
      :disabled="busy"
      @click="openCoffeePicker"
    >
      <span class="combo-editor__coffee-text">{{ coffeeText || (t('comboEditor.selectCoffee') || 'Select coffee') }}</span>
      <svg class="combo-editor__chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <!-- Grind setting -->
    <div v-if="tools.grind" class="combo-editor__row" data-testid="combo-grind">
      <span class="combo-editor__label">{{ t('comboEditor.grind') || 'Grind setting' }}</span>
      <span v-if="!grindAvailable" class="combo-editor__na" aria-hidden="true">—</span>
      <div v-else class="combo-editor__control">
        <GrinderSettingInput v-model="grinderSetting" :grinder="selectedGrinder" />
      </div>
    </div>

    <!-- Input / Ratio / Output -->
    <template v-if="tools.dose">
      <div class="combo-editor__row" data-testid="combo-doseIn">
        <span class="combo-editor__label">{{ t('comboEditor.input') || 'Input' }}</span>
        <span v-if="!doseAvailable" class="combo-editor__na" aria-hidden="true">—</span>
        <div v-else class="combo-editor__control">
          <ValueInput
            v-model="doseIn"
            :min="LIMITS.weight.doseMin"
            :max="LIMITS.weight.doseMax"
            :step="0.1"
            :decimals="1"
            suffix="g"
            :aria-label="t('comboEditor.input') || 'Input'"
          />
        </div>
      </div>
      <div class="combo-editor__row" data-testid="combo-ratio">
        <span class="combo-editor__label">{{ t('comboEditor.ratio') || 'Ratio' }}</span>
        <span v-if="!doseAvailable" class="combo-editor__na" aria-hidden="true">—</span>
        <div v-else class="combo-editor__control">
          <ValueInput
            v-model="ratioValue"
            :min="LIMITS.ratio.min"
            :max="LIMITS.ratio.max"
            :step="0.1"
            :decimals="1"
            :aria-label="t('comboEditor.ratio') || 'Ratio'"
          />
        </div>
      </div>
      <div class="combo-editor__row" data-testid="combo-doseOut">
        <span class="combo-editor__label">{{ t('comboEditor.output') || 'Output' }}</span>
        <span v-if="!doseAvailable" class="combo-editor__na" aria-hidden="true">—</span>
        <div v-else class="combo-editor__control">
          <ValueInput
            v-model="doseOut"
            :min="LIMITS.weight.yieldMin"
            :max="LIMITS.weight.yieldMax"
            :step="0.1"
            :decimals="1"
            suffix="g"
            :aria-label="t('comboEditor.output') || 'Output'"
          />
        </div>
      </div>
    </template>

    <!-- Brew temperature -->
    <div v-if="tools.temperature" class="combo-editor__row" data-testid="combo-temp">
      <span class="combo-editor__label">{{ t('comboEditor.temperature') || 'Brew temperature' }}</span>
      <span v-if="!tempAvailable" class="combo-editor__na" aria-hidden="true">—</span>
      <div v-else class="combo-editor__control">
        <ValueInput
          v-model="brewTemperature"
          :min="LIMITS.temp.brewMin"
          :max="LIMITS.temp.brewMax"
          :step="0.5"
          :decimals="1"
          suffix="°C"
          :aria-label="t('comboEditor.temperature') || 'Brew temperature'"
        />
      </div>
    </div>

    <!-- Grinder RPM -->
    <div v-if="tools.grinderRpm" class="combo-editor__row" data-testid="combo-rpm">
      <span class="combo-editor__label">{{ t('comboEditor.rpm') || 'Grinder RPM' }}</span>
      <span v-if="!rpmAvailable" class="combo-editor__na" aria-hidden="true">—</span>
      <div v-else class="combo-editor__control">
        <ValueInput
          v-model="grinderRpm"
          :min="selectedGrinder?.extras?.rpmMin ?? LIMITS.rpm.min"
          :max="selectedGrinder?.extras?.rpmMax ?? LIMITS.rpm.max"
          :step="50"
          :decimals="0"
          :aria-label="t('comboEditor.rpm') || 'Grinder RPM'"
        />
      </div>
    </div>

    <!-- Basket -->
    <div v-if="tools.basket" data-testid="combo-basket">
      <button
        type="button"
        class="combo-editor__row combo-editor__basket-row"
        :disabled="!basketAvailable || busy"
        :aria-expanded="basketOpen ? 'true' : 'false'"
        @click="basketOpen = !basketOpen"
      >
        <span class="combo-editor__label">{{ t('comboEditor.basket') || 'Basket' }}</span>
        <span class="combo-editor__basket-summary">{{ basketLabel || '—' }}</span>
        <svg class="combo-editor__chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div v-if="basketOpen && basketAvailable" class="combo-editor__basket-panel">
        <div class="combo-editor__row">
          <span class="combo-editor__label">{{ t('comboEditor.basketSize') || 'Size (g)' }}</span>
          <div class="combo-editor__control">
            <ValueInput
              v-model="basketSize"
              :min="LIMITS.weight.basketMin"
              :max="LIMITS.weight.basketMax"
              :step="0.5"
              :decimals="0"
              :aria-label="t('comboEditor.basketSize') || 'Basket size'"
            />
          </div>
        </div>
        <div class="combo-editor__row">
          <span class="combo-editor__label">{{ t('comboEditor.basketType') || 'Type' }}</span>
          <div class="combo-editor__control combo-editor__control--wide">
            <SuggestionField
              v-model="basketType"
              :placeholder="t('comboEditor.basketTypePlaceholder') || 'e.g. IMS Competition'"
              :suggestions="basketTypeSuggestions"
              data-testid="combo-basketType"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Persistent affordance → full Combo Editor -->
    <button type="button" class="combo-editor__edit" data-testid="combo-edit" @click="goFullEditor">
      {{ t('comboEditor.editCombo') || 'Edit combo' }}
      <span aria-hidden="true">&rsaquo;</span>
    </button>

    <BeanPickerPopup
      :visible="beanPickerOpen"
      :current-batch-id="beanPickerBatchId"
      @close="beanPickerOpen = false"
    />
  </div>
</template>

<style scoped>
.combo-editor {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

/* ---- Coffee row ---- */
.combo-editor__coffee {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  box-sizing: border-box;
  background: var(--color-surface-pressed, rgba(255, 255, 255, 0.05));
  color: var(--color-text);
  cursor: pointer;
  font-size: var(--font-md);
  font-weight: 500;
  -webkit-tap-highlight-color: transparent;
  align-self: center;
}

.combo-editor__coffee:active:not(:disabled) {
  opacity: 0.7;
}

.combo-editor__coffee:disabled {
  opacity: 0.5;
  cursor: default;
}

.combo-editor__chevron {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

/* ---- Generic rows ---- */
.combo-editor__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 0 8px;
  border-radius: 8px;
}

.combo-editor__label {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.combo-editor__control {
  width: 220px;
  flex-shrink: 0;
}

.combo-editor__control--wide {
  width: 240px;
}

.combo-editor :deep(.value-input) {
  height: 44px;
  border-radius: 10px;
  width: 100%;
}

.combo-editor :deep(.value-input__btn) {
  width: 38px;
}

.combo-editor :deep(.value-input__display) {
  font-size: var(--font-md);
}

.combo-editor :deep(.grinder-setting__select),
.combo-editor :deep(.grinder-setting__text) {
  width: 100%;
  height: 44px;
  border-radius: 10px;
}

/* ---- Unavailable marker keeps the row's footprint stable ---- */
.combo-editor__na {
  width: 220px;
  flex-shrink: 0;
  text-align: center;
  color: var(--color-text-secondary);
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

/* ---- Basket ---- */
.combo-editor__basket-row {
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.combo-editor__basket-row:disabled {
  cursor: default;
}

.combo-editor__basket-summary {
  flex: 1;
  text-align: right;
  font-size: var(--font-md);
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.combo-editor__basket-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px 6px 0;
}

/* ---- Full editor affordance ---- */
.combo-editor__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  align-self: center;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.combo-editor__edit:active {
  opacity: 0.7;
}

@media (max-width: 480px) {
  .combo-editor__control,
  .combo-editor__na {
    width: 150px;
  }
}
</style>
