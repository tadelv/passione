import { watch, onBeforeUnmount } from 'vue'

/**
 * Owns the recipe editor's live-apply pipeline: the 23-ref watcher (checks
 * updating guard to skip during batch loads), buildWorkflowUpdate() (assembles
 * the workflow PUT payload from form state), applyToLiveWorkflow() (debounced
 * push), and buildTemperatureOverrideProfile() (clones the profile with the
 * recipe's brew temperature override).
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
  } = ctx

  // Build a modified profile payload with every step's temperature set to
  // the recipe's brewTemperature. Returns null when no profile is available
  // or brewTemperature is unset (no override to apply).
  function buildTemperatureOverrideProfile() {
    const base = workflow?.profile
    if (!base || refs.brewTemperature.value == null) return null
    const steps = base.steps ?? base.frames ?? []
    if (!steps.length) return null
    const clone = JSON.parse(JSON.stringify(base))
    const t = refs.brewTemperature.value
    const cloneSteps = clone.steps ?? clone.frames
    for (const s of cloneSteps) s.temperature = t
    return clone
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
      grinderSetting: refs.grinderSetting.value != null ? String(refs.grinderSetting.value) : null,
    }
    if (refs.selectedGrinderId.value) ctxPayload.grinderId = String(refs.selectedGrinderId.value)
    if (selectedBatchId.value) ctxPayload.beanBatchId = String(selectedBatchId.value)
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
    payload.steamSettings = refs.includeSteam.value
      ? { targetTemperature: refs.steamTemperature.value, duration: refs.steamDuration.value, flow: refs.steamFlow.value }
      : { targetTemperature: settings?.settings?.steamTemperature ?? 160, duration: 0, flow: settings?.settings?.steamFlow ?? 1.5 }
    payload.rinseData = refs.includeFlush.value
      ? { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: refs.flushDuration.value, flow: refs.flushFlowRate.value }
      : { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: 0, flow: settings?.settings?.flushFlowRate ?? 6.0 }
    payload.hotWaterData = refs.includeHotWater.value
      ? { targetTemperature: refs.hotWaterTemperature.value, volume: refs.hotWaterVolume.value, duration: settings?.settings?.hotWaterDuration ?? 60, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
      : { targetTemperature: settings?.settings?.hotWaterTemperature ?? 80, volume: 0, duration: 0, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
    return payload
  }

  // ---- Apply current form state to the live workflow (no combo mutation) ----
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
    } catch {
      // Silent — live-apply fires often; errors shouldn't toast-spam
    }
  }

  // ---- Live-apply: push every field change to the workflow (300ms debounce) ----
  let liveApplyTimer = null
  watch([
    refs.coffeeName, refs.roaster, refs.grinder, refs.grinderSetting,
    refs.doseIn, refs.doseOut,
    selectedBeanId, selectedBatchId, refs.selectedGrinderId,
    refs.profileId, refs.profileTitle, refs.brewTemperature,
    refs.grinderRpm, refs.basketSize, refs.basketType,
    refs.includeSteam, refs.steamDuration, refs.steamFlow, refs.steamTemperature,
    refs.includeFlush, refs.flushDuration, refs.flushFlowRate,
    refs.includeHotWater, refs.hotWaterVolume, refs.hotWaterTemperature,
  ], () => {
    if (refs.updating.value) return
    clearTimeout(liveApplyTimer)
    liveApplyTimer = setTimeout(applyToLiveWorkflow, 300)
  })

  onBeforeUnmount(() => {
    clearTimeout(liveApplyTimer)
    liveApplyTimer = null
  })

  return {
    buildWorkflowUpdate,
    applyToLiveWorkflow,
    buildTemperatureOverrideProfile,
  }
}