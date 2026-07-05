import { useRouter } from 'vue-router'

/**
 * Owns the recipe editor's load/overlay pipeline: loadFromPreset (loads
 * from a saved combo), overlayFromWorkflow (overlays live workflow on top
 * of preset baseline), hydrateFromWorkflowContext (hydrates from workflow
 * only), onChangeProfile (navigates to profile picker + sessionStorage
 * protocol), and onGrinderSelect (grinder entity selection helper).
 *
 * @param {object} refs  Form refs (destructured, incl. `updating` Ref)
 * @param {object} ctx     Injected context: { workflow, grinders, beansApi,
 *                         enterLinked, clearLink, hydrateFromContext,
 *                         selectedBeanId, selectedBatchId, batchesForBean,
 *                         pickBrewTempFromProfile, round1, workflowCombos,
 *                         selectedIndex }
 */
export function useRecipeOverlay(refs, ctx) {
  const {
    workflow, grinders, beansApi,
    enterLinked, clearLink, hydrateFromContext,
    selectedBeanId, selectedBatchId, batchesForBean,
    pickBrewTempFromProfile, round1, workflowCombos, selectedIndex,
  } = ctx

  const router = useRouter()

  // ---- "Awaiting profile from picker" flag ----
  // Must survive the /recipe/edit → /profiles → /recipe/edit round-trip.
  // Pages unmount between route changes, so this can't live in a ref — we
  // use sessionStorage as a minimal cross-mount signal.
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

  // ---- Grinder selection helper ----
  function onGrinderSelect(grinderId, { resetSetting = true } = {}) {
    refs.selectedGrinderId.value = grinderId || null
    if (!grinderId) {
      refs.grinder.value = ''
      refs.grinderSetting.value = ''
      return
    }
    const g = grinders.value.find(g => g.id === grinderId)
    if (g) {
      refs.grinder.value = g.model ?? ''
      if (resetSetting) refs.grinderSetting.value = ''
    }
  }

  // ---- Populate from selected preset ----
  async function loadFromPreset(index) {
    const preset = workflowCombos.value[index]
    if (!preset) return
    refs.updating.value = true
    // Coffee: support legacy beanBrand/beanType combos
    refs.coffeeName.value = preset.coffeeName ?? ([preset.beanBrand, preset.beanType].filter(Boolean).join(' ') || '')
    refs.roaster.value = preset.roaster ?? ''
    refs.grinder.value = preset.grinder ?? ''
    refs.grinderSetting.value = preset.grinderSetting ?? ''
    refs.doseIn.value = preset.doseIn ?? 18.0
    refs.doseOut.value = preset.doseOut ?? 36.0
    refs.ratioValue.value = refs.doseIn.value > 0 ? +(refs.doseOut.value / refs.doseIn.value).toFixed(1) : 2.0
    refs.profileId.value = preset.profileId ?? null
    refs.profileTitle.value = preset.profileTitle ?? ''
    if (preset.brewTemperature != null) {
      refs.brewTemperature.value = preset.brewTemperature
    } else {
      refs.brewTemperature.value = pickBrewTempFromProfile(workflow?.profile) ?? 93
    }
    refs.grinderRpm.value = preset.grinderRpm ?? 1200
    refs.basketSize.value = preset.basketSize ?? 18
    refs.basketType.value = preset.basketType ?? ''
    // Operation settings — always restore sub-field values so they survive
    // a toggle-off/toggle-on cycle (user disables steam, re-enables later)
    refs.includeSteam.value = preset.includeSteam ?? (preset.steamSettings?.duration > 0)
    if (preset.steamSettings) {
      refs.steamDuration.value = preset.steamSettings.duration ?? 30
      refs.steamFlow.value = preset.steamSettings.flow ?? 1.5
      refs.steamTemperature.value = preset.steamSettings.temperature ?? 160
    }
    refs.includeFlush.value = preset.includeFlush ?? (preset.flushSettings?.duration > 0)
    if (preset.flushSettings) {
      refs.flushDuration.value = preset.flushSettings.duration ?? 5
      refs.flushFlowRate.value = preset.flushSettings.flow ?? 6.0
    }
    refs.includeHotWater.value = preset.includeHotWater ?? (preset.hotWaterSettings?.volume > 0)
    if (preset.hotWaterSettings) {
      refs.hotWaterVolume.value = preset.hotWaterSettings.volume ?? 200
      refs.hotWaterTemperature.value = preset.hotWaterSettings.temperature ?? 80
    }
    // Restore entity selections — keep refs.updating true through async work
    // so the auto-save watcher doesn't fire with partially-loaded data
    if (preset.selectedBeanId) {
      if (preset.selectedBatchId) {
        await enterLinked(preset.selectedBeanId, preset.selectedBatchId)
      } else {
        await enterLinked(preset.selectedBeanId)
      }
      if (beansApi) {
        batchesForBean.value = await beansApi.getBatches(preset.selectedBeanId).catch(() => []) ?? []
      }
    } else {
      clearLink()
      batchesForBean.value = []
    }
    if (preset.selectedGrinderId) {
      onGrinderSelect(preset.selectedGrinderId, { resetSetting: false })
    } else {
      refs.selectedGrinderId.value = null
    }
    refs.updating.value = false
  }

  // ---- Mount-time hydration: overlay live-workflow divergence on top ----
  async function overlayFromWorkflow() {
    if (!workflow) return
    refs.updating.value = true
    const ctxPayload = workflow.context ?? {}
    // Reconcile the entity links FIRST. loadFromPreset restored the SAVED
    // combo's bean/grinder, but the live workflow may carry different ones
    // the user picked since (the combo is only mutated on explicit Save).
    const liveBatchId = ctxPayload.beanBatchId ? String(ctxPayload.beanBatchId) : null
    const formBatchId = selectedBatchId.value ? String(selectedBatchId.value) : null
    if (liveBatchId !== formBatchId) {
      if (liveBatchId) {
        await hydrateFromContext(ctxPayload)
        if (selectedBeanId.value && beansApi) {
          batchesForBean.value = await beansApi.getBatches(selectedBeanId.value).catch(() => []) ?? []
        }
      } else {
        clearLink()
        batchesForBean.value = []
      }
    }
    const liveGrinderId = ctxPayload.grinderId ? String(ctxPayload.grinderId) : null
    const formGrinderId = refs.selectedGrinderId.value ? String(refs.selectedGrinderId.value) : null
    if (liveGrinderId !== formGrinderId) {
      if (liveGrinderId) onGrinderSelect(liveGrinderId, { resetSetting: false })
      else refs.selectedGrinderId.value = null
    }
    if (ctxPayload.targetDoseWeight != null) refs.doseIn.value = ctxPayload.targetDoseWeight
    if (ctxPayload.targetYield != null) refs.doseOut.value = ctxPayload.targetYield
    if (refs.doseIn.value > 0 && refs.doseOut.value > 0) {
      refs.ratioValue.value = round1(refs.doseOut.value / refs.doseIn.value)
    }
    // Skip coffeeName/coffeeRoaster while a bean is linked
    if (!selectedBeanId.value) {
      if (ctxPayload.coffeeName != null) refs.coffeeName.value = ctxPayload.coffeeName
      if (ctxPayload.coffeeRoaster != null) refs.roaster.value = ctxPayload.coffeeRoaster
    }
    if (ctxPayload.grinderModel != null) refs.grinder.value = ctxPayload.grinderModel
    if (ctxPayload.grinderSetting != null) refs.grinderSetting.value = String(ctxPayload.grinderSetting)
    if (workflow.profile) {
      refs.profileId.value = workflow.profile.id ?? refs.profileId.value
      refs.profileTitle.value = workflow.profile.title ?? refs.profileTitle.value
      const t = pickBrewTempFromProfile(workflow.profile)
      if (t != null) refs.brewTemperature.value = t
    }
    const extras = ctxPayload.extras ?? {}
    if (extras.grinderRpm != null) refs.grinderRpm.value = extras.grinderRpm
    if (extras.basketSize != null) refs.basketSize.value = extras.basketSize
    if (extras.basketType != null) refs.basketType.value = extras.basketType
    // Operation settings
    const ss = workflow.steamSettings
    if (ss) {
      const on = (ss.duration ?? 0) > 0
      refs.includeSteam.value = on
      if (on) {
        refs.steamDuration.value = ss.duration
        if (ss.flow != null) refs.steamFlow.value = ss.flow
        if (ss.targetTemperature != null) refs.steamTemperature.value = ss.targetTemperature
      }
    }
    const rd = workflow.rinseData
    if (rd) {
      const on = (rd.duration ?? 0) > 0
      refs.includeFlush.value = on
      if (on) {
        refs.flushDuration.value = rd.duration
        if (rd.flow != null) refs.flushFlowRate.value = rd.flow
      }
    }
    const hw = workflow.hotWaterData
    if (hw) {
      const on = (hw.volume ?? 0) > 0
      refs.includeHotWater.value = on
      if (on) {
        refs.hotWaterVolume.value = hw.volume
        if (hw.targetTemperature != null) refs.hotWaterTemperature.value = hw.targetTemperature
      }
    }
    refs.updating.value = false
  }

  async function hydrateFromWorkflowContext() {
    const ctxPayload = workflow?.context
    if (!ctxPayload) return
    refs.doseIn.value = ctxPayload.targetDoseWeight ?? 18.0
    refs.doseOut.value = ctxPayload.targetYield ?? 36.0
    if (refs.doseIn.value > 0) refs.ratioValue.value = +(refs.doseOut.value / refs.doseIn.value).toFixed(1)
    refs.grinder.value = ctxPayload.grinderModel ?? ''
    refs.grinderSetting.value = ctxPayload.grinderSetting ?? ''
    refs.coffeeName.value = ctxPayload.coffeeName ?? ''
    refs.roaster.value = ctxPayload.coffeeRoaster ?? ''
    if (ctxPayload.grinderId) refs.selectedGrinderId.value = ctxPayload.grinderId
    if (ctxPayload.beanBatchId) {
      await hydrateFromContext(ctxPayload)
      if (selectedBeanId.value && beansApi) {
        batchesForBean.value = await beansApi.getBatches(selectedBeanId.value).catch(() => []) ?? []
      }
    }
    const extras = ctxPayload.extras ?? {}
    if (extras.grinderRpm != null) refs.grinderRpm.value = extras.grinderRpm
    if (extras.basketSize != null) refs.basketSize.value = extras.basketSize
    if (extras.basketType != null) refs.basketType.value = extras.basketType
  }

  // ---- Profile change navigation ----
  function onChangeProfile() {
    const baselineId = workflow?.profile?.id ?? workflow?.profile?.title ?? ''
    setAwaitingProfileFromPicker(true, baselineId)
    router.push('/profiles?from=workflow')
  }

  return {
    loadFromPreset,
    overlayFromWorkflow,
    hydrateFromWorkflowContext,
    onChangeProfile,
    onGrinderSelect,
    isAwaitingProfileFromPicker,
    getAwaitingProfileBaselineId,
    setAwaitingProfileFromPicker,
  }
}