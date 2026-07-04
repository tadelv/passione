import { watch, onBeforeUnmount } from 'vue'

/**
 * Owns the recipe editor's live-apply pipeline: the 23-ref watcher (checks
 * form.updating to skip during batch loads), buildWorkflowUpdate() (assembles
 * the workflow PUT payload from form state), applyToLiveWorkflow() (debounced
 * push), and buildTemperatureOverrideProfile() (clones the profile with the
 * recipe's brew temperature override).
 *
 * @param {object} form    The useRecipeForm return object (refs + updating guard)
 * @param {object} ctx     Injected context: { settings, workflow, updateWorkflow,
 *                         selectedBeanId, selectedBatchId, selectedGrinder,
 *                         linkedBean, pickBrewTempFromProfile }
 */
export function useRecipeLiveApply(form, ctx) {
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
    if (!base || form.brewTemperature.value == null) return null
    const steps = base.steps ?? base.frames ?? []
    if (!steps.length) return null
    const clone = JSON.parse(JSON.stringify(base))
    const t = form.brewTemperature.value
    const cloneSteps = clone.steps ?? clone.frames
    for (const s of cloneSteps) s.temperature = t
    return clone
  }

  // ---- Build workflow update payload from current form state ----
  function buildWorkflowUpdate() {
    // When a bean record is linked, useBeanLink blanks the coffeeName/roaster
    // refs (the bean record is the source of truth). The live workflow ctx,
    // though, is read by many downstream views (IdlePage pill, screensaver,
    // LayoutWidget) that don't resolve via beanBatchId — keep the denormalized
    // text populated from the linked bean record so those views keep working.
    // The SAVED combo gets the blank refs via comboValues() — so the recipe
    // template stays normalized (id only).
    const beanLinked = !!selectedBeanId.value
    const ctxPayload = {
      targetDoseWeight: form.doseIn.value,
      targetYield: form.doseOut.value,
      coffeeName: beanLinked ? (linkedBean.value?.name || null) : (form.coffeeName.value || null),
      coffeeRoaster: beanLinked ? (linkedBean.value?.roaster || null) : (form.roaster.value || null),
      grinderModel: selectedGrinder.value?.model ?? (form.grinder.value || null),
      grinderSetting: form.grinderSetting.value != null ? String(form.grinderSetting.value) : null,
    }
    if (form.selectedGrinderId.value) ctxPayload.grinderId = String(form.selectedGrinderId.value)
    if (selectedBatchId.value) ctxPayload.beanBatchId = String(selectedBatchId.value)
    // Power-user fields: only push to the workflow when their toggle is on,
    // so disabled fields don't pollute every shot's context with default
    // values the user never set.
    const showRpm = !!settings?.settings?.showGrinderRpm
    const showBasket = !!settings?.settings?.showBasketData
    if (showRpm || showBasket) {
      ctxPayload.extras = { ...(workflow?.context?.extras ?? {}) }
      if (showRpm) ctxPayload.extras.grinderRpm = form.grinderRpm.value ?? null
      if (showBasket) {
        ctxPayload.extras.basketSize = form.basketSize.value ?? null
        ctxPayload.extras.basketType = form.basketType.value || null
      }
    }

    const payload = { context: ctxPayload }
    payload.steamSettings = form.includeSteam.value
      ? { targetTemperature: form.steamTemperature.value, duration: form.steamDuration.value, flow: form.steamFlow.value }
      : { targetTemperature: settings?.settings?.steamTemperature ?? 160, duration: 0, flow: settings?.settings?.steamFlow ?? 1.5 }
    payload.rinseData = form.includeFlush.value
      ? { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: form.flushDuration.value, flow: form.flushFlowRate.value }
      : { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: 0, flow: settings?.settings?.flushFlowRate ?? 6.0 }
    payload.hotWaterData = form.includeHotWater.value
      ? { targetTemperature: form.hotWaterTemperature.value, volume: form.hotWaterVolume.value, duration: settings?.settings?.hotWaterDuration ?? 60, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
      : { targetTemperature: settings?.settings?.hotWaterTemperature ?? 80, volume: 0, duration: 0, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
    return payload
  }

  // ---- Apply current form state to the live workflow (no combo mutation) ----
  async function applyToLiveWorkflow() {
    try {
      const payload = buildWorkflowUpdate()
      // Only send a profile override if the recipe's temperature diverges
      // from the profile currently loaded in the workflow. Avoids pushing
      // a cloned profile (and potentially churning its content-hash id) on
      // every unrelated field change.
      const current = pickBrewTempFromProfile(workflow?.profile)
      if (form.brewTemperature.value != null && current != null &&
          Math.abs(form.brewTemperature.value - current) > 0.05) {
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
    form.coffeeName, form.roaster, form.grinder, form.grinderSetting,
    form.doseIn, form.doseOut,
    selectedBeanId, selectedBatchId, form.selectedGrinderId,
    form.profileId, form.profileTitle, form.brewTemperature,
    form.grinderRpm, form.basketSize, form.basketType,
    form.includeSteam, form.steamDuration, form.steamFlow, form.steamTemperature,
    form.includeFlush, form.flushDuration, form.flushFlowRate,
    form.includeHotWater, form.hotWaterVolume, form.hotWaterTemperature,
  ], () => {
    if (form.updating) return
    clearTimeout(liveApplyTimer)
    liveApplyTimer = setTimeout(applyToLiveWorkflow, 300)
  })

  // Cancel any pending live-apply work when the composable's owner unmounts.
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