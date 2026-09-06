/**
 * Unit test for useComboApply.buildComboUpdate — regression coverage for the
 * "switching recipes doesn't disable steam/flush/hot water" bug.
 *
 * The gateway's PUT /api/v1/workflow is a partial merge: any field omitted
 * from the payload keeps whatever the previously-loaded recipe set on the
 * machine. buildComboUpdate must therefore always send steamSettings /
 * rinseData / hotWaterData, using duration: 0 (volume: 0 for hot water) as
 * the disabled sentinel, even when the target recipe doesn't include that
 * operation.
 *
 * Steam additionally requires targetTemperature to drop below 130 (send 0)
 * when disabled — the gateway re-applies the persisted workflow on every
 * machine reconnect via a targetTemperature >= 130 check that ignores
 * duration entirely (vendor/reaprime lib/src/controllers/de1_controller.defaults.dart).
 * Sending duration: 0 alone turns steam back on at the next reconnect.
 *
 * Run: node --test tests/unit/useComboApply.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { buildComboUpdate, buildShotWorkflowUpdate } from '../../src/composables/useComboApply.js'

describe('buildComboUpdate — operation disable-on-switch', () => {

  it('sends duration: 0 for steam when the target combo does not include it', async () => {
    const combo = { includeSteam: false }
    const update = await buildComboUpdate(combo, {}, {})
    assert.equal(update.steamSettings.duration, 0)
  })

  it('sends targetTemperature below 130 for steam when the target combo does not include it', async () => {
    const combo = { includeSteam: false }
    const update = await buildComboUpdate(combo, {}, {})
    assert.ok(update.steamSettings.targetTemperature < 130)
  })

  it('sends duration: 0 for flush (rinseData) when the target combo does not include it', async () => {
    const combo = { includeFlush: false }
    const update = await buildComboUpdate(combo, {}, {})
    assert.equal(update.rinseData.duration, 0)
  })

  it('sends volume: 0 and duration: 0 for hot water when the target combo does not include it', async () => {
    const combo = { includeHotWater: false }
    const update = await buildComboUpdate(combo, {}, {})
    assert.equal(update.hotWaterData.volume, 0)
    assert.equal(update.hotWaterData.duration, 0)
  })

  it('sends the enabled steam settings when the target combo includes it', async () => {
    const combo = {
      includeSteam: true,
      steamSettings: { temperature: 155, duration: 45, flow: 0.9 },
    }
    const update = await buildComboUpdate(combo, {}, {})
    assert.deepEqual(update.steamSettings, {
      targetTemperature: 155,
      duration: 45,
      flow: 0.9,
      stopAtTemperature: 0,
    })
  })

  it('switching from a steam-enabled to a steam-disabled combo always turns steam off', async () => {
    const disabledCombo = { includeSteam: false }
    const update = await buildComboUpdate(disabledCombo, {}, {})
    // Regardless of what the live workflow currently has (steam left on by
    // a previously-loaded recipe), the payload must explicitly disable it —
    // both duration and targetTemperature, so it stays off across the
    // gateway's next machine-reconnect default-push too.
    assert.ok(update.steamSettings)
    assert.equal(update.steamSettings.duration, 0)
    assert.equal(update.steamSettings.targetTemperature, 0)
  })
})

/**
 * Daily-driver audit #3 — coherent recipe loading & shared shot→workflow builder.
 *
 * Run: node --test tests/unit/useComboApply.test.js
 */
function beanStub(map) {
  return {
    getById: async (id) => map.beans[id] ?? null,
    getBatch: async (id) => map.batches[id] ?? null,
    activeBatchForBean: async (beanId) => (map.active && map.active[beanId]) || null,
  }
}

describe('buildComboUpdate — coherent recipe loading (audit #3)', () => {
  it('emits beanBatchId, grinderId, grinder setting even when 0, and bean text', async () => {
    const combo = {
      selectedBeanId: 'b1', selectedBatchId: 'bt1', selectedGrinderId: 'g1',
      grinder: 'GM', grinderSetting: 0, doseIn: 18, doseOut: 36,
    }
    const beans = beanStub({
      beans: { b1: { id: 'b1', name: 'Bean', roaster: 'Roaster' } },
      batches: { bt1: { id: 'bt1', beanId: 'b1' } },
    })
    const update = await buildComboUpdate(combo, {}, { beans })
    assert.equal(update.context.beanBatchId, 'bt1')
    assert.equal(update.context.grinderId, 'g1')
    assert.equal(update.context.grinderSetting, '0') // zero setting must be sent
    assert.equal(update.context.coffeeName, 'Bean')
    assert.equal(update.context.coffeeRoaster, 'Roaster')
  })

  it('resolves a bean with no pinned batch to its active batch', async () => {
    const combo = { selectedBeanId: 'b1', selectedGrinderId: null }
    const beans = beanStub({
      beans: { b1: { id: 'b1', name: 'B', roaster: 'R' } },
      batches: {},
      active: { b1: { id: 'active-bt' } },
    })
    const update = await buildComboUpdate(combo, {}, { beans })
    assert.equal(update.context.beanBatchId, 'active-bt')
  })

  it('clears batch/grinder ids when the recipe does not pin a link', async () => {
    const combo = { coffeeName: 'Free Coffee', doseIn: 18, doseOut: 36 }
    const update = await buildComboUpdate(combo, {}, {})
    assert.equal(update.context.beanBatchId, null)
    assert.equal(update.context.grinderId, null)
    assert.equal(update.context.coffeeName, 'Free Coffee')
  })

  it('applies the brew temperature as a per-step delta without mutating the cached profile', async () => {
    const profile = { title: 'P', steps: [{ temperature: 90 }, { temperature: 86 }] }
    const combo = { profileId: 'p1', brewTemperature: 94 }
    const profilesCache = { ensureLoaded: async () => [{ id: 'p1', profile }] }
    const update = await buildComboUpdate(combo, {}, { profilesCache })
    assert.deepEqual(update.profile.steps.map(s => s.temperature), [94, 90])
    // cached record untouched
    assert.deepEqual(profile.steps.map(s => s.temperature), [90, 86])
  })

  it('skips re-sending an already-loaded profile by identity (not by title)', async () => {
    const combo = { profileId: 'p1', profileTitle: 'P' }
    const workflow = { profile: { id: 'p1', title: 'P' } }
    const update = await buildComboUpdate(combo, workflow, {})
    assert.equal(update.profile, undefined)
  })

  it('fails (rejects) before PUT when a referenced profile cannot load', async () => {
    const combo = { profileId: 'missing' }
    const profilesCache = { ensureLoaded: async () => [{ id: 'other', profile: { title: 'x' } }] }
    await assert.rejects(buildComboUpdate(combo, {}, { profilesCache }))
  })

  it('fails when a pinned batch does not belong to the selected bean', async () => {
    const combo = { selectedBeanId: 'b1', selectedBatchId: 'btOther' }
    const beans = beanStub({
      beans: { b1: { id: 'b1', name: 'B', roaster: 'R' } },
      batches: { btOther: { id: 'btOther', beanId: 'b99' } },
    })
    await assert.rejects(buildComboUpdate(combo, {}, { beans }), /does not belong/)
  })

  it('fails when a referenced bean cannot be resolved', async () => {
    const combo = { selectedBeanId: 'ghost' }
    const beans = beanStub({ beans: {}, batches: {} })
    await assert.rejects(buildComboUpdate(combo, {}, { beans }))
  })
})

describe('buildShotWorkflowUpdate — shared Repeat/History loader (audit #3)', () => {
  const profile = { id: 'prof1', title: 'Prof', steps: [{ temperature: 93 }] }

  it('restores linked ids + grinder setting + resolves bean text for the home plan', async () => {
    const raw = {
      profile,
      workflow: {
        context: {
          beanBatchId: 'bt1', grinderId: 'g1', grinderModel: 'GM', grinderSetting: '12',
          coffeeName: 'Old', coffeeRoaster: 'OR', targetDoseWeight: 18, targetYield: 36,
          extras: { grinderRpm: 1200 },
        },
      },
    }
    const beans = beanStub({
      beans: { b1: { id: 'b1', name: 'New Bean', roaster: 'NR' } },
      batches: { bt1: { id: 'bt1', beanId: 'b1' } },
    })
    const update = await buildShotWorkflowUpdate(raw, { beans })
    assert.equal(update.context.beanBatchId, 'bt1')
    assert.equal(update.context.grinderId, 'g1')
    assert.equal(update.context.grinderSetting, '12')
    assert.equal(update.context.grinderModel, 'GM')
    assert.equal(update.context.coffeeName, 'New Bean') // authoritative text from bean record
    assert.equal(update.context.extras.grinderRpm, 1200)
    assert.equal(update.profile.id, 'prof1')
  })

  it('keeps the PLANNED target yield, never the actual overshoot', async () => {
    const raw = {
      profile,
      annotations: { actualYield: 44, actualDoseWeight: 18 }, // actual overshot 44g
      workflow: { context: { targetDoseWeight: 18, targetYield: 36 } },
    }
    const update = await buildShotWorkflowUpdate(raw, {})
    assert.equal(update.context.targetDoseWeight, 18)
    assert.equal(update.context.targetYield, 36) // planned, not 44
  })

  it('clears prior ids for a manual/no-link shot and sends no fabricated yield', async () => {
    const raw = { profile } // no workflow.context, no link
    const update = await buildShotWorkflowUpdate(raw, {})
    assert.equal(update.context.beanBatchId, null)
    assert.equal(update.context.grinderId, null)
    assert.equal(update.context.targetYield, undefined)
  })

  it('throws (no partial publish) when the shot carries no profile', async () => {
    const raw = { workflow: { context: {} } }
    await assert.rejects(buildShotWorkflowUpdate(raw, {}))
  })
})

// ---- Corrections from supervisor review #3 ----
function throwingBeanStub(overrides = {}) {
  const map = overrides.maps || { beans: {}, batches: {} }
  const base = {
    getById: async (id) => (overrides.throwGetById ? Promise.reject(new Error('boom')) : (map.beans[id] ?? null)),
    getBatch: async (id) => (overrides.throwGetBatch ? Promise.reject(new Error('boom')) : (map.batches[id] ?? null)),
    activeBatchForBean: async (beanId) => (overrides.throwActive ? Promise.reject(new Error('boom')) : (overrides.active && overrides.active[beanId]) || null),
  }
  return { ...base, ...overrides.overrides }
}

describe('review #3 — same-id recipe still applies explicit temperature override (A)', () => {
  it('already-loaded profile (same id) with a differing brewTemperature sends the override curve', async () => {
    const combo = { profileId: 'p1', brewTemperature: 94 }
    const workflow = { profile: { id: 'p1', title: 'P', steps: [{ temperature: 90 }, { temperature: 86 }] } }
    const update = await buildComboUpdate(combo, workflow, {})
    assert.deepEqual(update.profile.steps.map(s => s.temperature), [94, 90])
  })

  it('coerces numeric-string step temperatures and keeps the curve', async () => {
    const combo = { profileId: 'p1', brewTemperature: 94 }
    const profilesCache = { ensureLoaded: async () => [{ id: 'p1', profile: { steps: [{ temperature: '90' }, { temperature: '86' }] } }] }
    const update = await buildComboUpdate(combo, {}, { profilesCache })
    assert.deepEqual(update.profile.steps.map(s => s.temperature), [94, 90])
  })

  it('does not override when the already-loaded profile already matches brewTemperature', async () => {
    const combo = { profileId: 'p1', brewTemperature: 92 }
    const workflow = { profile: { id: 'p1', title: 'P', steps: [{ temperature: 92 }, { temperature: 88 }] } }
    const update = await buildComboUpdate(combo, workflow, {})
    assert.equal(update.profile, undefined)
  })
})

describe('review #3 — shot builder legacy fallback + no stale publish (B/C)', () => {
  const profile = { id: 'prof1', title: 'Prof' }

  it('falls back to legacy coffeeData/grinderData/doseData when context is absent', async () => {
    const raw = {
      profile,
      workflow: {
        coffeeData: { name: 'Legacy coffee', roaster: 'Legacy roaster' },
        grinderData: { model: 'Legacy grinder', setting: '12' },
        doseData: { doseIn: 18, doseOut: 36 },
      },
    }
    const update = await buildShotWorkflowUpdate(raw, {})
    assert.equal(update.context.coffeeName, 'Legacy coffee')
    assert.equal(update.context.coffeeRoaster, 'Legacy roaster')
    assert.equal(update.context.grinderModel, 'Legacy grinder')
    assert.equal(update.context.grinderSetting, '12')
    assert.equal(update.context.targetDoseWeight, 18)
    assert.equal(update.context.targetYield, 36)
  })

  it('throws (no publish) when a linked batch lookup fails', async () => {
    const raw = { profile, workflow: { context: { beanBatchId: 'missing' } } }
    const beans = throwingBeanStub({ throwGetBatch: true })
    await assert.rejects(buildShotWorkflowUpdate(raw, { beans }))
  })

  it('throws when a referenced shot batch record cannot be found', async () => {
    const raw = { profile, workflow: { context: { beanBatchId: 'missing', coffeeName: 'Stale' } } }
    const beans = throwingBeanStub({ maps: { beans: {}, batches: {} } }) // getBatch -> null
    await assert.rejects(buildShotWorkflowUpdate(raw, { beans }))
  })
})

describe('review #3 — saved-recipe bean resolution propagates failure (C)', () => {
  it('rejects when the recipe references a missing batch', async () => {
    const combo = { selectedBeanId: 'b1', selectedBatchId: 'btMissing' }
    const beans = throwingBeanStub({ maps: { beans: { b1: { id: 'b1', name: 'B' } }, batches: {} } })
    await assert.rejects(buildComboUpdate(combo, {}, { beans }))
  })

  it('rejects (propagates) on active-batch transport failure instead of silently dropping the batch', async () => {
    const combo = { selectedBeanId: 'b1' }
    const beans = throwingBeanStub({ throwActive: true, maps: { beans: { b1: { id: 'b1', name: 'B' } }, batches: {} } })
    await assert.rejects(buildComboUpdate(combo, {}, { beans }))
  })

  it('treats a bean with no active batch as a legitimate null batch (not an error)', async () => {
    const combo = { selectedBeanId: 'b1' }
    const beans = throwingBeanStub({
      active: { b1: null },
      maps: { beans: { b1: { id: 'b1', name: 'B', roaster: 'R' } }, batches: {} },
    })
    const update = await buildComboUpdate(combo, {}, { beans })
    assert.equal(update.context.beanBatchId, null)
    assert.equal(update.context.coffeeName, 'B')
  })
})
