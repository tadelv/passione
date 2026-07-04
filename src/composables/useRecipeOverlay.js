import { useRouter } from 'vue-router'

/**
 * Owns the recipe editor's load/overlay pipeline: loadFromPreset (loads
 * from a saved combo), overlayFromWorkflow (overlays live workflow on top
 * of preset baseline), hydrateFromWorkflowContext (hydrates from workflow
 * only), onChangeProfile (navigates to profile picker + sessionStorage
 * protocol), and onGrinderSelect (grinder entity selection helper).
 *
 * @param {object} form    The useRecipeForm return object
 * @param {object} ctx     Injected context: { workflow, grinders, beansApi,
 *                         enterLinked, clearLink, hydrateFromContext,
 *                         selectedBeanId, selectedBatchId, batchesForBean,
 *                         pickBrewTempFromProfile, round1, workflowCombos,
 *                         selectedIndex }
 */
export function useRecipeOverlay(form, ctx) {
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
    form.selectedGrinderId.value = grinderId || null
    if (!grinderId) {
      form.grinder.value = ''
      form.grinderSetting.value = ''
      return
    }
    const g = grinders.value.find(g => g.id === grinderId)
    if (g) {
      form.grinder.value = g.model ?? ''
      if (resetSetting) form.grinderSetting.value = ''
    }
  }

  // ---- Populate from selected preset ----
  async function loadFromPreset(index) {
    const preset = workflowCombos.value[index]
    if (!preset) return
    form.updating = true
    // Coffee: support legacy beanBrand/beanType combos
    form.coffeeName.value = preset.coffeeName ?? ([preset.beanBrand, preset.beanType].filter(Boolean).join(' ') || '')
    form.roaster.value = preset.roaster ?? ''
    form.grinder.value = preset.grinder ?? ''
    form.grinderSetting.value = preset.grinderSetting ?? ''
    form.doseIn.value = preset.doseIn ?? 18.0
    form.doseOut.value = preset.doseOut ?? 36.0
    form.ratioValue.value = form.doseIn.value > 0 ? +(form.doseOut.value / form.doseIn.value).toFixed(1) : 2.0
    form.profileId.value = preset.profileId ?? null
    form.profileTitle.value = preset.profileTitle ?? ''
    if (preset.brewTemperature != null) {
      form.brewTemperature.value = preset.brewTemperature
    } else {
      form.brewTemperature.value = pickBrewTempFromProfile(workflow?.profile) ?? 93
    }
    form.grinderRpm.value = preset.grinderRpm ?? 1200
    form.basketSize.value = preset.basketSize ?? 18
    form.basketType.value = preset.basketType ?? ''
    // Operation settings — always restore sub-field values so they survive
    // a toggle-off/toggle-on cycle (user disables steam, re-enables later)
    form.includeSteam.value = preset.includeSteam ?? (preset.steamSettings?.duration > 0)
    if (preset.steamSettings) {
      form.steamDuration.value = preset.steamSettings.duration ?? 30
      form.steamFlow.value = preset.steamSettings.flow ?? 1.5
      form.steamTemperature.value = preset.steamSettings.temperature ?? 160
    }
    form.includeFlush.value = preset.includeFlush ?? (preset.flushSettings?.duration > 0)
    if (preset.flushSettings) {
      form.flushDuration.value = preset.flushSettings.duration ?? 5
      form.flushFlowRate.value = preset.flushSettings.flow ?? 6.0
    }
    form.includeHotWater.value = preset.includeHotWater ?? (preset.hotWaterSettings?.volume > 0)
    if (preset.hotWaterSettings) {
      form.hotWaterVolume.value = preset.hotWaterSettings.volume ?? 200
      form.hotWaterTemperature.value = preset.hotWaterSettings.temperature ?? 80
    }
    // Restore entity selections — keep form.updating true through async work
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
      form.selectedGrinderId.value = null
    }
    form.updating = false
  }

  // ---- Mount-time hydration: overlay live-workflow divergence on top ----
  async function overlayFromWorkflow() {
    if (!workflow) return
    form.updating = true
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
    const formGrinderId = form.selectedGrinderId.value ? String(form.selectedGrinderId.value) : null
    if (liveGrinderId !== formGrinderId) {
      if (liveGrinderId) onGrinderSelect(liveGrinderId, { resetSetting: false })
      else form.selectedGrinderId.value = null
    }
    if (ctxPayload.targetDoseWeight != null) form.doseIn.value = ctxPayload.targetDoseWeight
    if (ctxPayload.targetYield != null) form.doseOut.value = ctxPayload.targetYield
    if (form.doseIn.value > 0 && form.doseOut.value > 0) {
      form.ratioValue.value = round1(form.doseOut.value / form.doseIn.value)
    }
    // Skip coffeeName/coffeeRoaster while a bean is linked
    if (!selectedBeanId.value) {
      if (ctxPayload.coffeeName != null) form.coffeeName.value = ctxPayload.coffeeName
      if (ctxPayload.coffeeRoaster != null) form.roaster.value = ctxPayload.coffeeRoaster
    }
    if (ctxPayload.grinderModel != null) form.grinder.value = ctxPayload.grinderModel
    if (ctxPayload.grinderSetting != null) form.grinderSetting.value = String(ctxPayload.grinderSetting)
    if (workflow.profile) {
      form.profileId.value = workflow.profile.id ?? form.profileId.value
      form.profileTitle.value = workflow.profile.title ?? form.profileTitle.value
      const t = pickBrewTempFromProfile(workflow.profile)
      if (t != null) form.brewTemperature.value = t
    }
    const extras = ctxPayload.extras ?? {}
    if (extras.grinderRpm != null) form.grinderRpm.value = extras.grinderRpm
    if (extras.basketSize != null) form.basketSize.value = extras.basketSize
    if (extras.basketType != null) form.basketType.value = extras.basketType
    // Operation settings
    const ss = workflow.steamSettings
    if (ss) {
      const on = (ss.duration ?? 0) > 0
      form.includeSteam.value = on
      if (on) {
        form.steamDuration.value = ss.duration
        if (ss.flow != null) form.steamFlow.value = ss.flow
        if (ss.targetTemperature != null) form.steamTemperature.value = ss.targetTemperature
      }
    }
    const rd = workflow.rinseData
    if (rd) {
      const on = (rd.duration ?? 0) > 0
      form.includeFlush.value = on
      if (on) {
        form.flushDuration.value = rd.duration
        if (rd.flow != null) form.flushFlowRate.value = rd.flow
      }
    }
    const hw = workflow.hotWaterData
    if (hw) {
      const on = (hw.volume ?? 0) > 0
      form.includeHotWater.value = on
      if (on) {
        form.hotWaterVolume.value = hw.volume
        if (hw.targetTemperature != null) form.hotWaterTemperature.value = hw.targetTemperature
      }
    }
    form.updating = false
  }

  async function hydrateFromWorkflowContext() {
    const ctxPayload = workflow?.context
    if (!ctxPayload) return
    form.doseIn.value = ctxPayload.targetDoseWeight ?? 18.0
    form.doseOut.value = ctxPayload.targetYield ?? 36.0
    if (form.doseIn.value > 0) form.ratioValue.value = +(form.doseOut.value / form.doseIn.value).toFixed(1)
    form.grinder.value = ctxPayload.grinderModel ?? ''
    form.grinderSetting.value = ctxPayload.grinderSetting ?? ''
    form.coffeeName.value = ctxPayload.coffeeName ?? ''
    form.roaster.value = ctxPayload.coffeeRoaster ?? ''
    if (ctxPayload.grinderId) form.selectedGrinderId.value = ctxPayload.grinderId
    if (ctxPayload.beanBatchId) {
      await hydrateFromContext(ctxPayload)
      if (selectedBeanId.value && beansApi) {
        batchesForBean.value = await beansApi.getBatches(selectedBeanId.value).catch(() => []) ?? []
      }
    }
    const extras = ctxPayload.extras ?? {}
    if (extras.grinderRpm != null) form.grinderRpm.value = extras.grinderRpm
    if (extras.basketSize != null) form.basketSize.value = extras.basketSize
    if (extras.basketType != null) form.basketType.value = extras.basketType
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