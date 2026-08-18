/**
 * Unit test for stopAtTemperature handling in the combo dirty helpers.
 *
 * stopAtTemperature is a new steamSettings field (0 = disabled, 0-80 °C).
 * Old saved combos never pinned it, so the lenient IdlePage compare must not
 * flag a live workflow carrying Decaid's default as a user change.
 *
 * Run: node --test tests/unit/useComboDirty.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  effectiveSteam,
  isComboModifiedVsWorkflow,
} from '../../src/composables/useComboDirty.js'

describe('effectiveSteam stopAtTemperature', () => {
  it('normalizes a missing stopAtTemperature to 0', () => {
    const s = effectiveSteam({ duration: 30, flow: 1.5, temperature: 160 })
    assert.equal(s.stopAtTemperature, 0)
  })

  it('carries an explicit stopAtTemperature', () => {
    const s = effectiveSteam({ duration: 30, flow: 1.5, temperature: 160, stopAtTemperature: 40 })
    assert.equal(s.stopAtTemperature, 40)
  })

  it('drops stopAtTemperature when steam is off', () => {
    assert.deepEqual(effectiveSteam({ duration: 0, stopAtTemperature: 40 }), { duration: 0 })
  })
})

describe('isComboModifiedVsWorkflow stopAtTemperature leniency', () => {
  const workflow = {
    profile: { id: 'p1', title: 'P' },
    context: {},
    steamSettings: { duration: 30, flow: 1.5, targetTemperature: 160, stopAtTemperature: 40 },
    rinseData: { duration: 0 },
    hotWaterData: { volume: 0 },
  }

  it('does not flag an old combo that never pinned stopAtTemperature', () => {
    const saved = {
      profileId: 'p1',
      profileTitle: 'P',
      includeSteam: true,
      steamSettings: { duration: 30, flow: 1.5, temperature: 160 },
    }
    assert.equal(isComboModifiedVsWorkflow(saved, workflow), false)
  })

  it('flags a combo that pinned a different stopAtTemperature', () => {
    const saved = {
      profileId: 'p1',
      profileTitle: 'P',
      includeSteam: true,
      steamSettings: { duration: 30, flow: 1.5, temperature: 160, stopAtTemperature: 50 },
    }
    assert.equal(isComboModifiedVsWorkflow(saved, workflow), true)
  })
})
