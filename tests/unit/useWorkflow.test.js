/**
 * Unit test for useWorkflow.applyWorkflowData — tri-state null handling.
 *
 * Every input to applyWorkflowData is a CANONICAL full workflow snapshot (GET
 * refresh / PUT echo). The gateway's WorkflowContext.toJson omits null fields,
 * so an absent tracked scalar context key means the server value is null —
 * absence is an authoritative clear, indistinguishable from an explicit
 * own-key null (the way `??` previously ignored BOTH). Legacy top-level
 * siblings (doseData / grinderData / coffeeData) backfill ONLY keys the
 * response context did not explicitly carry, and only while that field is null
 * after the clear, so an explicitly-cleared field is never resurrected.
 *
 * Run: node --test tests/unit/useWorkflow.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { reactive } from 'vue'
import { applyWorkflowData } from '../../src/composables/useWorkflowMerge.js'

function freshWorkflow() {
  return reactive({
    id: null,
    name: null,
    description: null,
    profile: null,
    context: {
      targetDoseWeight: null,
      targetYield: null,
      grinderId: null,
      grinderModel: null,
      grinderSetting: null,
      beanBatchId: null,
      coffeeName: null,
      coffeeRoaster: null,
      finalBeverageType: null,
      extras: {},
    },
    steamSettings: null,
    hotWaterData: null,
    rinseData: null,
  })
}

describe('applyWorkflowData — tri-state context merge', () => {
  it('applies an explicit null as a clear (own-key presence)', () => {
    const wf = freshWorkflow()
    // Seed a previous association.
    wf.context.beanBatchId = 'bt-old'
    wf.context.grinderId = 'g-old'
    wf.context.coffeeName = 'Old'
    applyWorkflowData(wf, {
      context: { beanBatchId: null, grinderId: null, coffeeName: null },
    })
    assert.equal(wf.context.beanBatchId, null)
    assert.equal(wf.context.grinderId, null)
    assert.equal(wf.context.coffeeName, null)
  })

  it('clears a tracked scalar key the response omits (absent nullable = server null)', () => {
    const wf = freshWorkflow()
    // A local association from a previously loaded recipe.
    wf.context.beanBatchId = 'A'
    wf.context.grinderId = 'g'
    wf.context.coffeeName = 'C'
    // Echo after an explicit-null clear: toJson omits the now-null keys.
    applyWorkflowData(wf, { context: { targetDoseWeight: 18 } })
    assert.equal(wf.context.beanBatchId, null)
    assert.equal(wf.context.grinderId, null)
    assert.equal(wf.context.coffeeName, null)
    // A key the response DOES carry is applied, not cleared.
    assert.equal(wf.context.targetDoseWeight, 18)
  })

  it('omitted dose/grinder/coffee text clears too (all tracked scalar keys)', () => {
    const wf = freshWorkflow()
    wf.context.targetDoseWeight = 18
    wf.context.targetYield = 36
    wf.context.grinderModel = 'GM'
    wf.context.grinderSetting = '12'
    wf.context.coffeeRoaster = 'R'
    wf.context.finalBeverageType = 'espresso'
    applyWorkflowData(wf, { context: {} })
    assert.equal(wf.context.targetDoseWeight, null)
    assert.equal(wf.context.targetYield, null)
    assert.equal(wf.context.grinderModel, null)
    assert.equal(wf.context.grinderSetting, null)
    assert.equal(wf.context.coffeeRoaster, null)
    assert.equal(wf.context.finalBeverageType, null)
  })

  it('legacy backfill fills an omitted+cleared dose key after the context clear (old gateway)', () => {
    const wf = freshWorkflow()
    // Old gateway: context present but empty of dose; top-level doseData carries it.
    applyWorkflowData(wf, { context: {}, doseData: { doseIn: 20, doseOut: 40 } })
    assert.equal(wf.context.targetDoseWeight, 20)
    assert.equal(wf.context.targetYield, 40)
  })

  it('does not resurrect an explicitly-cleared coffee field from legacy coffeeData', () => {
    const wf = freshWorkflow()
    wf.context.coffeeName = 'Cleared To Null'
    applyWorkflowData(wf, {
      context: { coffeeName: null, coffeeRoaster: null },
      coffeeData: { name: 'Legacy Coffee', roaster: 'Legacy Roaster' },
    })
    assert.equal(wf.context.coffeeName, null)
    assert.equal(wf.context.coffeeRoaster, null)
  })

  it('backfills from legacy doseData only when the context omitted the key', () => {
    const wf = freshWorkflow()
    applyWorkflowData(wf, {
      context: { targetDoseWeight: 18, targetYield: 36 },
      doseData: { doseIn: 99, doseOut: 198 }, // ignored — context carried the key
    })
    assert.equal(wf.context.targetDoseWeight, 18)
    assert.equal(wf.context.targetYield, 36)

    // A response with NO dose context and no existing dose falls back to legacy.
    const wf2 = freshWorkflow()
    applyWorkflowData(wf2, { doseData: { doseIn: 20, doseOut: 40 } })
    assert.equal(wf2.context.targetDoseWeight, 20)
    assert.equal(wf2.context.targetYield, 40)
  })

  it('merges extras, applying null clears while preserving unknown extras', () => {
    const wf = freshWorkflow()
    wf.context.extras = { grinderRpm: 1200, basketSize: 18, unknownExtra: 'keep-me' }
    applyWorkflowData(wf, { context: { extras: { grinderRpm: null } } })
    assert.equal(wf.context.extras.grinderRpm, null)
    assert.equal(wf.context.extras.basketSize, 18)
    assert.equal(wf.context.extras.unknownExtra, 'keep-me')
  })

  it('ignores a missing/absent data payload', () => {
    const wf = freshWorkflow()
    wf.context.targetDoseWeight = 18
    applyWorkflowData(wf, null)
    assert.equal(wf.context.targetDoseWeight, 18)
  })
})
