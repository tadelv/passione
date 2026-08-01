/**
 * Builds a workflow PUT payload from a saved workflow combo.
 *
 * Shared by IdlePage (user taps a recipe pill) and App.vue (push the
 * selected recipe to the gateway on boot) so the two paths can't drift.
 */

/**
 * @param {object} combo - saved workflowCombos entry
 * @param {object} workflow - live workflow (from useWorkflow) — used to skip
 *   re-sending a profile that's already loaded
 * @param {object} deps
 * @param {object} deps.profilesCache - from useProfilesCache()
 * @param {object} deps.settings - from useSettings(), for operation fallback defaults
 * @param {object} [deps.beans] - from useBeans(), resolves combo.selectedBeanId to the
 *   linked bean's name/roaster. Saved combos blank coffeeName/roaster once a bean is
 *   linked (see useBeanLink.enterLinked) — the bean record is the source of truth.
 * @param {object} [deps.toast] - optional, warns on profile/bean lookup failure
 * @returns {Promise<object>} partial WorkflowRequest payload for updateWorkflow()
 */
export async function buildComboUpdate(combo, workflow, { profilesCache, settings, beans, toast } = {}) {
  const update = {}

  if (combo.profileId || combo.profileTitle) {
    const currentProfile = workflow?.profile
    const alreadyLoaded =
      (combo.profileId && currentProfile?.id === combo.profileId) ||
      (combo.profileTitle && currentProfile?.title === combo.profileTitle)
    if (!alreadyLoaded) {
      try {
        const records = await profilesCache.ensureLoaded()
        const allRecords = Array.isArray(records) ? records : []
        // Match by ID first, fall back to title match (Profile objects don't carry the ProfileRecord ID)
        const record = allRecords.find(r => r.id === combo.profileId)
          || (combo.profileTitle && allRecords.find(r => r.profile?.title === combo.profileTitle))
        if (record?.profile) {
          update.profile = record.profile
        } else {
          toast?.warning(`Profile "${combo.profileTitle || combo.profileId}" not found — keeping current profile`)
        }
      } catch {
        toast?.warning('Could not load profile — keeping current profile')
      }
    }
  }

  let coffeeName = combo.coffeeName
  let roaster = combo.roaster
  let beanLookupFailed = false
  if (combo.selectedBeanId && beans) {
    try {
      const bean = await beans.getById(combo.selectedBeanId)
      coffeeName = bean?.name || null
      roaster = bean?.roaster || null
    } catch {
      beanLookupFailed = true
      toast?.warning('Could not load linked bean — keeping current coffee name')
    }
  }
  // A bean-linked combo denormalizes coffeeName/roaster to blank (the bean
  // record is the source of truth — see useBeanLink.enterLinked). If the
  // lookup above failed, combo.coffeeName is that blank, and defaulting to
  // it here would push a wiped coffee name to the gateway. Fall back to
  // whatever's already live instead of blanking it.
  if (beanLookupFailed) {
    coffeeName = workflow?.context?.coffeeName ?? null
    roaster = workflow?.context?.coffeeRoaster ?? null
  } else {
    coffeeName = coffeeName || [combo.beanBrand, combo.beanType].filter(Boolean).join(' ')
  }
  const hasBasketExtras = combo.grinderRpm != null || combo.basketSize != null || combo.basketType != null
  if (coffeeName || roaster || combo.doseIn != null || combo.doseOut != null || combo.grinder || combo.grinderSetting || hasBasketExtras) {
    update.context = {
      coffeeName: coffeeName || null,
      coffeeRoaster: roaster || null,
      targetDoseWeight: combo.doseIn ?? undefined,
      targetYield: combo.doseOut ?? undefined,
      grinderModel: combo.grinder || null,
      grinderSetting: combo.grinderSetting != null ? String(combo.grinderSetting) : null,
    }
    if (hasBasketExtras) {
      update.context.extras = {
        grinderRpm: combo.grinderRpm ?? null,
        basketSize: combo.basketSize ?? null,
        basketType: combo.basketType ?? null,
      }
    }
  }

  // Always send these three fields, even when the recipe doesn't include the
  // operation — the gateway PUT is a partial merge, so omitting a field
  // leaves whatever the previously-loaded recipe set on the machine in
  // place. duration: 0 / volume: 0 is the established "disabled" convention
  // (see useRecipeForm.js, useComboDirty.js) that the machine honors.
  //
  // Steam's targetTemperature must also drop below 130 (send 0) when
  // disabled, not just duration. The live PUT handler derives steamEnabled
  // from duration > 0 (workflow_handler.dart), but the gateway re-applies
  // defaultWorkflow on every machine reconnect using a *different* check —
  // targetTemperature >= 130 (de1_controller.defaults.dart) — ignoring
  // duration entirely. Leaving targetTemperature at a real value (e.g. 160)
  // with duration: 0 turns steam back on at the next reconnect.
  if (combo.includeSteam && combo.steamSettings) {
    update.steamSettings = {
      targetTemperature: combo.steamSettings.temperature ?? settings?.settings?.steamTemperature ?? 160,
      duration: combo.steamSettings.duration ?? settings?.settings?.steamDuration ?? 30,
      flow: combo.steamSettings.flow ?? settings?.settings?.steamFlow ?? 1.5,
    }
  } else {
    update.steamSettings = {
      targetTemperature: 0,
      duration: 0,
      flow: settings?.settings?.steamFlow ?? 1.5,
    }
  }

  if (combo.includeFlush && combo.flushSettings) {
    update.rinseData = {
      targetTemperature: combo.flushSettings.temperature ?? settings?.settings?.flushTemperature ?? 90,
      duration: combo.flushSettings.duration ?? settings?.settings?.flushDuration ?? 5,
      flow: combo.flushSettings.flow ?? settings?.settings?.flushFlowRate ?? 6.0,
    }
  } else {
    update.rinseData = {
      targetTemperature: settings?.settings?.flushTemperature ?? 90,
      duration: 0,
      flow: settings?.settings?.flushFlowRate ?? 6.0,
    }
  }

  if (combo.includeHotWater && combo.hotWaterSettings) {
    update.hotWaterData = {
      targetTemperature: combo.hotWaterSettings.temperature ?? settings?.settings?.hotWaterTemperature ?? 80,
      volume: combo.hotWaterSettings.volume ?? settings?.settings?.hotWaterVolume ?? 200,
      duration: settings?.settings?.hotWaterDuration ?? 60,
      flow: settings?.settings?.hotWaterFlow ?? 6.0,
    }
  } else {
    update.hotWaterData = {
      targetTemperature: settings?.settings?.hotWaterTemperature ?? 80,
      volume: 0,
      duration: 0,
      flow: settings?.settings?.hotWaterFlow ?? 6.0,
    }
  }

  return update
}
