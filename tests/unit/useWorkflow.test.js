/**
 * Unit test for useWorkflow.applyWorkflowData — tri-state null handling.
 *
 * The workflow PUT is a deep merge on the gateway; a recipe/shot that omits an
 * entity ID keeps the previously-loaded association. And the client's apply of
 * a server echo must treat an explicit null (own key present) as an intentional
 * clear rather than ignoring it the way `??` did — while still preserving fields
 * the response omits, and never resurrecting an explicitly-cleared field from a
 * legacy top-level sibling (doseData / grinderData / coffeeData).
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

  it('preserves omitted fields (partial patch does not wipe them)', () => {
    const wf = freshWorkflow()
    wf.context.targetDoseWeight = 18
    wf.context.targetYield = 36
    wf.context.coffeeName = 'Keep'
    applyWorkflowData(wf, { context: { targetDoseWeight: 20 } })
    assert.equal(wf.context.targetDoseWeight, 20)
    assert.equal(wf.context.targetYield, 36) // omitted → preserved
    assert.equal(wf.context.coffeeName, 'Keep')
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
