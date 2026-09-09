/**
 * Unit tests for the weather widget's pure display logic (weatherModel.js).
 *
 * Run: node --test tests/unit/weatherModel.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  weatherClass,
  weatherStatus,
  weatherNotice,
  displayTemperature,
  displayHighLow,
  displayHumidity,
} from '../../src/composables/weatherModel.js'

describe('weatherClass — WMO code → five-icon mapping', () => {
  const expectClass = (codes, cls) => {
    for (const code of codes) assert.equal(weatherClass(code), cls, `code ${code}`)
  }
  it('maps WMO 0 to clear', () => expectClass([0], 'clear'))
  it('maps WMO 1-2 to partlyCloudy', () => expectClass([1, 2], 'partlyCloudy'))
  it('maps overcast + fog to cloudy', () => expectClass([3, 45, 48], 'cloudy'))
  it('maps drizzle/rain/showers/thunder to rain', () =>
    expectClass([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99], 'rain'))
  it('maps freezing/snow precipitation to snow', () =>
    expectClass([56, 57, 66, 67, 71, 73, 75, 77, 85, 86], 'snow'))
  it('falls back to cloudy for null/unknown/future codes', () => {
    assert.equal(weatherClass(null), 'cloudy')
    assert.equal(weatherClass(undefined), 'cloudy')
    assert.equal(weatherClass(999), 'cloudy')
    assert.equal(weatherClass(50), 'cloudy')
  })
})

describe('weatherStatus — payload state derivation', () => {
  it('is loading without a payload', () => assert.equal(weatherStatus(null), 'loading'))
  it('treats a malformed payload as loading', () => assert.equal(weatherStatus('nope'), 'loading'))

  it('usable cached payload below 120 minutes stays visible', () => {
    const p = { ok: true, ageMinutes: 30, temperature: 21, high: 24, low: 13, humidity: 58 }
    assert.equal(weatherStatus(p), 'usable')
  })
  it('usable when ageMinutes is missing (fresh reading)', () => {
    assert.equal(weatherStatus({ ok: true }), 'usable')
  })
  it('reading at exactly 120 minutes becomes unavailable', () => {
    assert.equal(weatherStatus({ ok: true, ageMinutes: 120 }), 'unavailable')
  })
  it('reading past 120 minutes becomes unavailable', () => {
    assert.equal(weatherStatus({ ok: true, ageMinutes: 150 }), 'unavailable')
  })

  it('no_location sends the user to plugin config', () => {
    assert.equal(weatherStatus({ ok: false, reason: 'no_location' }), 'config')
  })
  it('unknown_place sends the user to plugin config', () => {
    assert.equal(weatherStatus({ ok: false, reason: 'unknown_place' }), 'config')
  })
  it('explicit stale reason is unavailable', () => {
    assert.equal(weatherStatus({ ok: false, reason: 'stale' }), 'unavailable')
  })
  it('offline with no usable cached reading is unavailable', () => {
    assert.equal(weatherStatus({ ok: false, reason: 'offline' }), 'unavailable')
  })
  it('other ok:false reasons are unavailable', () => {
    assert.equal(weatherStatus({ ok: false, reason: 'plugin_broken' }), 'unavailable')
  })
})

describe('weatherNotice — rendered notice copy', () => {
  it('no_location / unknown_place yield the configuration message pair', () => {
    assert.equal(weatherStatus({ ok: false, reason: 'no_location' }), 'config')
    assert.equal(weatherStatus({ ok: false, reason: 'unknown_place' }), 'config')
    assert.deepEqual(weatherNotice('config'), {
      title: 'Weather unavailable',
      detail: 'Configure location in Weather plugin',
    })
  })
  it('unavailable yields a title-only pair', () => {
    assert.deepEqual(weatherNotice('unavailable'), { title: 'Weather unavailable', detail: null })
  })
  it('pluginMissing yields the install-dependency pair', () => {
    assert.deepEqual(weatherNotice('pluginMissing'), {
      title: 'Weather plugin required',
      detail: 'Install weather.reaplugin to use this widget',
    })
  })
  it('loading and usable render no notice', () => {
    assert.equal(weatherNotice('loading'), null)
    assert.equal(weatherNotice('usable'), null)
    assert.equal(weatherNotice(null), null)
  })
})

describe('Display helpers — metric/imperial + null handling', () => {
  it('metric temperatures render with °C', () => {
    assert.equal(displayTemperature(21, 'metric'), '21°C')
    assert.equal(displayTemperature(21.4, 'metric'), '21°C')
    assert.equal(displayTemperature(21.6, 'metric'), '22°C')
  })
  it('imperial temperatures render with °F', () => {
    assert.equal(displayTemperature(80, 'imperial'), '80°F')
  })
  it('missing unit falls back to a bare degree mark', () => {
    assert.equal(displayTemperature(21, undefined), '21°')
  })
  it('null temperature stays unavailable — never zero', () => {
    assert.equal(displayTemperature(null, 'metric'), '—')
    assert.equal(displayTemperature(undefined, 'metric'), '—')
  })
  it('high/low render with degree mark, null stays —', () => {
    assert.equal(displayHighLow(24), '24°')
    assert.equal(displayHighLow(13), '13°')
    assert.equal(displayHighLow(null), '—')
    assert.equal(displayHighLow(0), '0°')
  })
  it('humidity renders with %, null stays —%', () => {
    assert.equal(displayHumidity(58), '58%')
    assert.equal(displayHumidity(null), '—%')
    assert.equal(displayHumidity(0), '0%')
  })
})
