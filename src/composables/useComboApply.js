/**
 * Builders producing a workflow PUT payload from a saved recipe (combo) or a
 * recorded shot. Pure-ish helpers — they never PUT; callers own updateWorkflow
 * and the error/toast.
 *
 * Shared contract: the gateway PUT /workflow deep-merges, so an omitted entity
 * ID silently keeps whatever a previous recipe/shot set. Every builder emits
 * beanBatchId/grinderId explicitly (null when the source carries no link), so
 * loading a recipe/shot clears a stale association instead of mixing identity.
 * Lookup failure throws before any PUT so callers never publish a partial/
 * stale payload.
 */

import { applyBrewTemperatureOverride, brewOverrideNeeded } from './useProfileCurve.js'
import { normalizeShot } from './useShotNormalize.js'

/**
 * Resolve the execution profile a combo references. `profileId` is the
 * identity; a title match is only a legacy fallback when no id is present (the
 * same title is not proof of the same execution content). Throws when a combo
 * references a profile that cannot be resolved.
 */
async function resolveComboProfile(combo, profilesCache) {
  if (!combo.profileId && !combo.profileTitle) return null
  if (!profilesCache?.ensureLoaded) {
    throw new Error(`Profile "${combo.profileTitle || combo.profileId}" could not be resolved (no profile catalog)`)
  }
  const records = await profilesCache.ensureLoaded()
  const allRecords = Array.isArray(records) ? records : []
  const record = combo.profileId
    ? allRecords.find(r => r.id === String(combo.profileId))
    : allRecords.find(r => r.profile?.title === combo.profileTitle)
  if (!record?.profile) {
    throw new Error(`Profile "${combo.profileTitle || combo.profileId}" could not be found`)
  }
  return record.profile
}

/**
 * Resolve a combo's bean + batch into a coherent link. A pinned batch must
 * exist, carry a beanId, and belong to the pinned bean (else incoherent →
 * throw). A bean without a pinned batch resolves to its active batch. Transport
 * failures and missing/invalid records throw (caller aborts); a bean with
 * simply no active batch is a legitimate "no batch pinned" result (batchId
 * null). Fetches a pinned batch at most once.
 */
async function resolveComboBeanLink(combo, beans) {
  if (!combo.selectedBeanId && !combo.selectedBatchId) return { bean: null, batchId: null }
  if (!beans) throw new Error('Linked coffee bean could not be resolved')

  let beanId = combo.selectedBeanId ? String(combo.selectedBeanId) : null
  let batchId = combo.selectedBatchId ? String(combo.selectedBatchId) : null
  if (batchId) {
    const batch = await beans.getBatch(batchId) // throws propagate
    if (!batch) throw new Error('Linked coffee batch could not be resolved')
    if (!batch.beanId) throw new Error('Linked coffee batch has no bean')
    if (beanId && String(batch.beanId) !== beanId) {
      throw new Error('Recipe coffee batch does not belong to its bean')
    }
    beanId = String(batch.beanId)
  }

  // Bean present, no pinned batch → active batch. Ownership is implied by
  // activeBatchForBean(beanId); validate a present beanId anyway.
  if (beanId && !batchId && typeof beans.activeBatchForBean === 'function') {
    const active = await beans.activeBatchForBean(beanId) // transport errors throw
    if (active && active.beanId && String(active.beanId) !== String(beanId)) {
      throw new Error('Recipe coffee active batch does not belong to its bean')
    }
    batchId = active?.id ? String(active.id) : null
  }

  const bean = beanId ? await beans.getById(beanId) : null // throws propagate
  if (beanId && !bean) throw new Error('Linked coffee bean could not be resolved')
  return { bean, batchId }
}

/**
 * Build a workflow PUT payload from a saved combo. Used by the IdlePage recipe
 * pill and the editor's deliberate recipe selection. Carries coherent entity
 * links + display text, the grinder setting (even 0), and the temperature-curve
 * override — applied even when the referenced profile is already loaded.
 *
 * @param {object} combo
 * @param {object} workflow  live workflow; its .profile short-circuits a same-id
 *   profile push unless a brew-temperature override differs from it
 * @param {object} deps { profilesCache, settings, beans }
 * @returns {Promise<object>} partial WorkflowRequest payload
 */
export async function buildComboUpdate(combo, workflow, { profilesCache, settings, beans } = {}) {
  const update = {}

  // ---- Profile + temperature-curve override ----
  const currentProfile = workflow?.profile
  const comboId = combo.profileId ? String(combo.profileId) : null
  const alreadyLoaded = !!comboId && !!currentProfile?.id && String(currentProfile.id) === comboId
  if (combo.profileId || combo.profileTitle) {
    const base = alreadyLoaded ? currentProfile : await resolveComboProfile(combo, profilesCache)
    if (base) {
      const override = combo.brewTemperature != null ? applyBrewTemperatureOverride(base, combo.brewTemperature) : null
      const overrideDiffers = brewOverrideNeeded(base, combo.brewTemperature)
      if (override && (overrideDiffers || !alreadyLoaded)) update.profile = override
      else if (!alreadyLoaded) update.profile = base
      // alreadyLoaded + no differing override → profile already live, send nothing
    }
  }

  // ---- Coffee / bean-batch / grinder links + text ----
  const { bean, batchId } = await resolveComboBeanLink(combo, beans) // throws propagate
  const grinderId = combo.selectedGrinderId ? String(combo.selectedGrinderId) : null
  const hasBasketExtras = combo.grinderRpm != null || combo.basketSize != null || combo.basketType != null
  const hasContext =
    combo.doseIn != null || combo.doseOut != null ||
    !!combo.coffeeName || !!combo.roaster || !!combo.beanBrand || !!combo.beanType ||
    !!combo.grinder || combo.grinderSetting != null ||
    !!combo.selectedBeanId || !!combo.selectedBatchId || !!combo.selectedGrinderId ||
    hasBasketExtras

  if (hasContext) {
    // Linked bean is source of truth for coffee text (combos blank it on link).
    const coffeeName = bean ? (bean.name ?? null)
      : (combo.coffeeName || [combo.beanBrand, combo.beanType].filter(Boolean).join(' ') || null)
    const context = {
      coffeeName: coffeeName || null,
      coffeeRoaster: bean ? (bean.roaster ?? null) : (combo.roaster || null),
      targetDoseWeight: combo.doseIn ?? undefined,
      targetYield: combo.doseOut ?? undefined,
      grinderModel: combo.grinder || null,
      grinderSetting: combo.grinderSetting != null ? String(combo.grinderSetting) : null, // even 0
      beanBatchId: batchId || null,
      grinderId,
    }
    if (hasBasketExtras) {
      context.extras = {
        grinderRpm: combo.grinderRpm ?? null,
        basketSize: combo.basketSize ?? null,
        basketType: combo.basketType ?? null,
      }
    }
    update.context = context
  }

  // Operations always sent so an omitted op clears a prior recipe's setting.
  // Steam also needs targetTemperature 0 (not just duration 0) when disabled —
  // the gateway re-applies the persisted workflow on reconnect via a
  // targetTemperature >= 130 check that ignores duration.
  if (combo.includeSteam && combo.steamSettings) {
    update.steamSettings = {
      targetTemperature: combo.steamSettings.temperature ?? settings?.settings?.steamTemperature ?? 160,
      duration: combo.steamSettings.duration ?? settings?.settings?.steamDuration ?? 30,
      flow: combo.steamSettings.flow ?? settings?.settings?.steamFlow ?? 1.5,
      stopAtTemperature: combo.steamSettings.stopAtTemperature ?? settings?.settings?.steamStopAtTemperature ?? 0,
    }
  } else {
    update.steamSettings = {
      targetTemperature: 0, duration: 0,
      flow: settings?.settings?.steamFlow ?? 1.5, stopAtTemperature: 0,
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
      duration: 0, flow: settings?.settings?.flushFlowRate ?? 6.0,
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
      volume: 0, duration: 0, flow: settings?.settings?.hotWaterFlow ?? 6.0,
    }
  }

  return update
}

/**
 * Build a workflow PUT payload from a recorded shot — the single shared builder
 * for the home last-shot "Repeat" and the history "Load". Scope: profile +
 * context only; operations are never touched. Normalizes through normalizeShot
 * so legacy coffeeData/grinderData/doseData fall back correctly, prefers the
 * shot's PLANNED target (never the actual overshoot), and resolves linked bean
 * text authoritatively. A linked bean/batch that cannot be resolved throws (no
 * stale/partial publish).
 */
export async function buildShotWorkflowUpdate(raw, { beans } = {}) {
  if (!raw) throw new Error('No profile data available for this shot')
  const s = normalizeShot(raw)
  const profile = s.profile || raw?.workflow?.profile
  if (!profile) throw new Error('No profile data available for this shot')

  const ctx = raw?.workflow?.context ?? {}
  const update = { profile }

  const beanBatchId = ctx.beanBatchId ? String(ctx.beanBatchId) : null
  let coffeeName = ctx.coffeeName ?? s.coffeeName ?? null
  let coffeeRoaster = ctx.coffeeRoaster ?? s.coffeeRoaster ?? null
  if (beanBatchId) {
    if (!beans) throw new Error('Linked coffee bean could not be resolved')
    const batch = await beans.getBatch(beanBatchId) // throws propagate
    if (!batch) throw new Error('Linked coffee batch could not be resolved')
    if (!batch.beanId) throw new Error('Linked coffee batch has no bean')
    const bean = await beans.getById(batch.beanId) // throws propagate
    if (!bean) throw new Error('Linked coffee bean could not be resolved')
    coffeeName = bean.name ?? coffeeName
    coffeeRoaster = bean.roaster ?? coffeeRoaster
  }

  const grinderId = ctx.grinderId ? String(ctx.grinderId) : null
  const grinderModel = ctx.grinderModel ?? s.grinderModel ?? null
  const grinderSetting = ctx.grinderSetting != null ? String(ctx.grinderSetting)
    : (s.grinderSetting != null ? String(s.grinderSetting) : null)

  // Planned next target only — never the actual yield that overshot.
  const plannedDose = ctx.targetDoseWeight != null ? ctx.targetDoseWeight : s.doseIn ?? null
  const plannedYield = ctx.targetYield != null ? ctx.targetYield : s.targetYield ?? null

  const context = {
    coffeeName: coffeeName || null,
    coffeeRoaster: coffeeRoaster || null,
    targetDoseWeight: plannedDose ?? undefined,
    beanBatchId: beanBatchId || null,
    grinderId,
    grinderModel: grinderModel || null,
    grinderSetting,
    targetYield: plannedYield ?? undefined,
  }

  const srcExtras = ctx.extras ?? {}
  const extras = {}
  if (srcExtras.grinderRpm != null) extras.grinderRpm = srcExtras.grinderRpm
  if (srcExtras.basketSize != null) extras.basketSize = srcExtras.basketSize
  if (srcExtras.basketType != null) extras.basketType = srcExtras.basketType
  if (Object.keys(extras).length > 0) context.extras = extras

  update.context = context
  return update
}
