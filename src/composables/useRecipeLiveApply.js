import { watch, onBeforeUnmount } from 'vue'
import { roundGrinderSetting } from './useGrinderSetting.js'
import { applyBrewTemperatureOverride } from './useProfileCurve.js'

/**
 * Owns the recipe editor's live-apply pipeline: the 23-ref watcher (checks
 * updating guard to skip during batch loads), buildWorkflowUpdate() (assembles
 * the workflow PUT payload from form state), applyToLiveWorkflow() (debounced
 * push), and buildTemperatureOverrideProfile() (clones the profile with the
 * recipe's brew temperature override applied as a per-step delta).
 *
 * Form refs are passed directly (not through the useRecipeForm object) to
 * avoid ref divergence caused by Vite pre-bundler optimizations on objects
 * that mix plain properties with non-plain properties (previously a
 * getter/setter for `updating`, now a plain Ref).
 *
 * @param {object} refs  Destructured form refs + `updating` Ref
 * @param {object} ctx   Injected context: { settings, workflow, updateWorkflow,
 *                       selectedBeanId, selectedBatchId, selectedGrinder,
 *                       linkedBean, pickBrewTempFromProfile }
 */
export function useRecipeLiveApply(refs, ctx) {
  const {
    settings, workflow, updateWorkflow,
    selectedBeanId, selectedBatchId, selectedGrinder, linkedBean,
    pickBrewTempFromProfile,
    toast = null, t = null,
  } = ctx

  // Build a modified profile payload with the recipe's brewTemperature
  // override applied as a *delta*, not an absolute flat overwrite — see
  // applyBrewTemperatureOverride (shared with buildComboUpdate). Returns null
  // when no profile is available or brewTemperature is unset (no override).
  function buildTemperatureOverrideProfile() {
    return applyBrewTemperatureOverride(workflow?.profile, refs.brewTemperature.value)
  }

  // ---- Build workflow update payload from current form state ----
  function buildWorkflowUpdate() {
    const beanLinked = !!selectedBeanId.value
    const ctxPayload = {
      targetDoseWeight: refs.doseIn.value,
      targetYield: refs.doseOut.value,
      coffeeName: beanLinked ? (linkedBean.value?.name || null) : (refs.coffeeName.value || null),
      coffeeRoaster: beanLinked ? (linkedBean.value?.roaster || null) : (refs.roaster.value || null),
      grinderModel: selectedGrinder.value?.model ?? (refs.grinder.value || null),
      grinderSetting: roundGrinderSetting(refs.grinderSetting.value, selectedGrinder.value),
    }
    // Send entity IDs as explicit values — always present. When unlinked they
    // are null so the gateway clears a previous association (omission is not a
    // clear; the workflow PUT deep-merges and an omitted key retains whatever
    // a previously-loaded recipe/shot set on the machine).
    ctxPayload.grinderId = refs.selectedGrinderId.value ? String(refs.selectedGrinderId.value) : null
    ctxPayload.beanBatchId = selectedBatchId.value ? String(selectedBatchId.value) : null
    const showRpm = !!settings?.settings?.showGrinderRpm
    const showBasket = !!settings?.settings?.showBasketData
    if (showRpm || showBasket) {
      ctxPayload.extras = { ...(workflow?.context?.extras ?? {}) }
      if (showRpm) ctxPayload.extras.grinderRpm = refs.grinderRpm.value ?? null
      if (showBasket) {
        ctxPayload.extras.basketSize = refs.basketSize.value ?? null
        ctxPayload.extras.basketType = refs.basketType.value || null
      }
    }

    const payload = { context: ctxPayload }
    // targetTemperature must drop below 130 (send 0) when steam is
    // disabled, not just duration — the gateway re-applies the persisted
    // workflow on every machine reconnect using a targetTemperature >= 130
    // check that ignores duration entirely (de1_controller.defaults.dart).
    // See useComboApply.js for the full explanation.
    payload.steamSettings = refs.includeSteam.value
      ? { targetTemperature: refs.steamTemperature.value, duration: refs.steamDuration.value, flow: refs.steamFlow.value, stopAtTemperature: refs.steamStopAtTemperature.value }
      : { targetTemperature: 0, duration: 0, flow: settings?.settings?.steamFlow ?? 1.5, stopAtTemperature: 0 }
    payload.rinseData = refs.includeFlush.value
      ? { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: refs.flushDuration.value, flow: refs.flushFlowRate.value }
      : { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: 0, flow: settings?.settings?.flushFlowRate ?? 6.0 }
    payload.hotWaterData = refs.includeHotWater.value
      ? { targetTemperature: refs.hotWaterTemperature.value, volume: refs.hotWaterVolume.value, duration: settings?.settings?.hotWaterDuration ?? 60, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
      : { targetTemperature: settings?.settings?.hotWaterTemperature ?? 80, volume: 0, duration: 0, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
    return payload
  }

  // ---- Apply current form state to the live workflow (no combo mutation) ----
  // `_applyFailed` is reset on every success so each run of consecutive
  // failures surfaces exactly one user-facing toast (no time-based spam
  // guard — a success clears it, so a fresh failure run can toast again).
  let _applyFailed = false
  async function applyToLiveWorkflow() {
    try {
      const payload = buildWorkflowUpdate()
      const current = pickBrewTempFromProfile(workflow?.profile)
      if (refs.brewTemperature.value != null && current != null &&
          Math.abs(refs.brewTemperature.value - current) > 0.05) {
        const override = buildTemperatureOverrideProfile()
        if (override) payload.profile = override
      }
      await updateWorkflow(payload)
      _applyFailed = false
    } catch (err) {
      console.warn('[useRecipeLiveApply] live workflow update failed:', err)
      if (!_applyFailed) {
        _applyFailed = true
        toast?.error?.(t?.('recipe.applyFailed') ?? 'Failed to apply this change to the machine')
      }
    }
  }

  // ---- Live-apply: push every field change to the workflow (300ms debounce) ----
  // The `updating` guard is checked here so batch hydration (loadFromPreset /
  // overlayFromWorkflow / hydrateFromWorkflowContext) and slow async entity
  // links never publish an intermediate/default form. Those read-only paths
  // keep `updating` raised through Vue's watcher flush and then apply
  // explicitly (see useRecipeOverlay / RecipeEditorPage) — they never rely on
  // this debounce firing.
  let liveApplyTimer = null
  watch([
    refs.coffeeName, refs.roaster, refs.grinder, refs.grinderSetting,
    refs.doseIn, refs.doseOut,
    selectedBeanId, selectedBatchId, refs.selectedGrinderId,
    refs.profileId, refs.profileTitle, refs.brewTemperature,
    refs.grinderRpm, refs.basketSize, refs.basketType,
    refs.includeSteam, refs.steamDuration, refs.steamFlow, refs.steamTemperature, refs.steamStopAtTemperature,
    refs.includeFlush, refs.flushDuration, refs.flushFlowRate,
    refs.includeHotWater, refs.hotWaterVolume, refs.hotWaterTemperature,
  ], () => {
    if (refs.updating.value) return
    clearTimeout(liveApplyTimer)
    liveApplyTimer = setTimeout(() => {
      // Null first so a timer that has already fired is no longer considered
      // pending — otherwise onBeforeUnmount would flush a redundant write for
      // a debounce that already ran.
      liveApplyTimer = null
      // If a batch hydration or slow entity link started after this edit was
      // scheduled, don't push an intermediate form; the async path applies the
      // full resolved state explicitly once it finishes.
      if (refs.updating.value) return
      applyToLiveWorkflow()
    }, 300)
  })

  // When a batch hydration / async entity link raises `updating`, cancel any
  // pending genuine-edit debounce so it can't fire mid-batch (publishing an
  // intermediate form) nor send a redundant second PUT after the batch's
  // explicit apply.
  watch(() => refs.updating.value, (v) => {
    if (v && liveApplyTimer != null) {
      clearTimeout(liveApplyTimer)
      liveApplyTimer = null
    }
  })

  onBeforeUnmount(() => {
    if (liveApplyTimer == null) return
    // A batch hydration or slow entity link is in progress — never push an
    // intermediate form on the way out; its explicit apply handles it (or the
    // component is being torn down mid-resolution).
    if (refs.updating.value) {
      clearTimeout(liveApplyTimer)
      liveApplyTimer = null
      return
    }
    // Flush, don't drop: a pending debounced edit (grinder/coffee/dose/etc.)
    // must still reach the workflow, or navigating away within the 300ms
    // window silently discards the user's change (it never reaches
    // workflow.context, so overlayFromWorkflow on the next mount re-applies
    // stale pre-edit values, which looks like a reset to the saved recipe).
    // A timer that already fired is null (see above) and skipped, so an
    // unmount with no pending edit sends nothing.
    clearTimeout(liveApplyTimer)
    liveApplyTimer = null
    applyToLiveWorkflow()
  })

  return {
    buildWorkflowUpdate,
    applyToLiveWorkflow,
    buildTemperatureOverrideProfile,
  }
}