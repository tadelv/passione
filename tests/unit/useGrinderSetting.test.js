/**
 * Unit test for useGrinderSetting — grind-setting precision normalization.
 *
 * Grinder records carry optional settingSmallStep / settingBigStep (the
 * physical dial grid). Values with decimals must be rounded to that grid,
 * capped at 2 decimal places — a 0.1-step grinder must never store
 * "12.300000000000001" (ValueInput float noise), a 1-step grinder must not
 * store "12.4", and a 0.5-step grinder snaps "12.3" to "12.5". Grinders
 * without step config (stepless) keep arbitrary values up to 2 decimals.
 *
 * Run: node --test tests/unit/useGrinderSetting.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  grinderSettingStep,
  grinderSettingDecimals,
  roundGrinderSetting,
} from '../../src/composables/useGrinderSetting.js'

describe('grinderSettingStep', () => {
  it('prefers the small step, falls back to big step, then 0.5', () => {
    assert.equal(grinderSettingStep({ settingSmallStep: 0.5, settingBigStep: 2 }), 0.5)
    assert.equal(grinderSettingStep({ settingBigStep: 1 }), 1)
    assert.equal(grinderSettingStep({}), 0.5)
  })
})

describe('grinderSettingDecimals', () => {
  it('derives decimals from the step size, capped at 2', () => {
    assert.equal(grinderSettingDecimals({ settingSmallStep: 1 }), 0)
    assert.equal(grinderSettingDecimals({ settingSmallStep: 0.5 }), 1)
    assert.equal(grinderSettingDecimals({ settingSmallStep: 0.1 }), 1)
    assert.equal(grinderSettingDecimals({ settingSmallStep: 0.25 }), 2)
    assert.equal(grinderSettingDecimals({ settingSmallStep: 0.005 }), 2)
    assert.equal(grinderSettingDecimals({}), 1)
  })
})

describe('roundGrinderSetting', () => {
  it('snaps to the small-step grid', () => {
    assert.equal(roundGrinderSetting('12.3', { settingSmallStep: 0.5 }), '12.5')
    assert.equal(roundGrinderSetting('12.4', { settingSmallStep: 1 }), '12')
    assert.equal(roundGrinderSetting('12.34', { settingSmallStep: 0.25 }), '12.25')
  })

  it('cleans ValueInput float noise on 0.1-step grinders', () => {
    assert.equal(roundGrinderSetting('12.300000000000001', { settingSmallStep: 0.1 }), '12.3')
  })

  it('leaves already-clean integer values untouched', () => {
    assert.equal(roundGrinderSetting('12', { settingSmallStep: 0.5 }), '12')
    assert.equal(roundGrinderSetting(12, { settingSmallStep: 0.5 }), '12')
  })

  it('uses the big step when the small step is unset', () => {
    assert.equal(roundGrinderSetting('12.4', { settingBigStep: 1 }), '12')
    assert.equal(roundGrinderSetting('12.7', { settingBigStep: 0.5 }), '12.5')
  })

  it('caps precision at 2 decimals without snapping when no step is configured', () => {
    assert.equal(roundGrinderSetting('12.34567', {}), '12.35')
    assert.equal(roundGrinderSetting('12', {}), '12')
  })

  it('passes non-numeric and empty values through untouched', () => {
    assert.equal(roundGrinderSetting('14 1400rpm', {}), '14 1400rpm')
    assert.equal(roundGrinderSetting('Fine', { settingSmallStep: 0.5 }), 'Fine')
    assert.equal(roundGrinderSetting('', { settingSmallStep: 0.5 }), '')
    assert.equal(roundGrinderSetting(null, { settingSmallStep: 0.5 }), null)
  })
})
