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
import { buildComboUpdate } from '../../src/composables/useComboApply.js'

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
