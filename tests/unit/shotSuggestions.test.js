/**
 * Unit tests for the shot-history suggestion mining helper.
 *
 * The contract that matters here: mining must be measurement-independent, so
 * the caller can source records from the paginated endpoint (which the gateway
 * serves without the per-sample `measurements` array) instead of requesting
 * full records by id. Pulling full records for 100 shots was measured at
 * ~13 MB of JSON and a +14 MB transient heap, discarded immediately.
 *
 * Run: node --test tests/unit/shotSuggestions.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { mineSuggestions } from '../../src/composables/shotSuggestions.js'

/**
 * A summary shot record, shaped like ShotRecord.toJsonWithoutMeasurements():
 * id/timestamps/workflow/annotations, NO measurements array.
 */
function summaryShot({ id, roaster, coffee, beanBrand, grinder, setting, barista, basket, useLegacyMetadata = false }) {
  const record = {
    id,
    timestamp: '2026-07-19T12:00:00.000Z',
    createdAt: '2026-07-19T12:00:00.000Z',
    updatedAt: '2026-07-19T12:00:00.000Z',
    workflow: {
      profile: { id: 'profile:classic', title: 'Classic Espresso' },
      context: {
        coffeeName: coffee,
        coffeeRoaster: roaster,
        grinderModel: grinder,
        grinderSetting: setting,
        extras: basket ? { basketType: basket } : {},
      },
    },
  }
  // annotations is the modern schema; metadata is the deprecated legacy one.
  if (useLegacyMetadata) {
    record.metadata = { beanBrand, barista }
  } else {
    record.annotations = { enjoyment: 4, espressoNotes: 'good', extras: { beanBrand, barista } }
  }
  return record
}

/** The same record with a measurements array appended (full-record shape). */
function withMeasurements(record, samples = 5) {
  return {
    ...record,
    measurements: Array.from({ length: samples }, (_, i) => ({
      machine: { timestamp: `2026-07-19T12:00:0${i}.000Z`, pressure: 9, flow: 2.5 },
      scale: { weight: i * 0.5 },
      volume: i * 0.4,
    })),
  }
}

const THREE_SHOTS = [
  summaryShot({ id: 's1', roaster: 'Onyx', coffee: 'Ethiopia Guji', beanBrand: 'Onyx Labs', grinder: 'Niche Zero', setting: 12.5, barista: 'vid', basket: '18g VST' }),
  summaryShot({ id: 's2', roaster: 'Onyx', coffee: 'Colombia Huila', beanBrand: 'Onyx Labs', grinder: 'Niche Zero', setting: '12.5', barista: 'vlad', basket: '18g VST' }),
  summaryShot({ id: 's3', roaster: 'Passenger', coffee: 'Ethiopia Guji', beanBrand: 'Passenger', grinder: 'DF64', setting: 9, barista: 'vid', basket: '20g IMS' }),
]

describe('mineSuggestions — summary records (no measurements)', () => {
  it('mines all seven lists from summary records', () => {
    assert.deepEqual(mineSuggestions(THREE_SHOTS), {
      roaster: ['Onyx', 'Passenger'],
      beanBrand: ['Onyx Labs', 'Passenger'],
      beanType: ['Colombia Huila', 'Ethiopia Guji'],
      grinderModel: ['DF64', 'Niche Zero'],
      grinderSetting: ['12.5', '9'],
      barista: ['vid', 'vlad'],
      basketType: ['18g VST', '20g IMS'],
    })
  })

  it('returns null when there is nothing to mine', () => {
    assert.equal(mineSuggestions([]), null)
    assert.equal(mineSuggestions(null), null)
    assert.equal(mineSuggestions(undefined), null)
  })

  it('skips null holes without throwing', () => {
    const out = mineSuggestions([null, ...THREE_SHOTS, undefined])
    assert.deepEqual(out, mineSuggestions(THREE_SHOTS))
  })

  it('de-duplicates and string-coerces numerically-equal grinder settings', () => {
    // s1 grinderSetting is the number 12.5, s2 is the string '12.5'.
    assert.deepEqual(mineSuggestions(THREE_SHOTS).grinderSetting, ['12.5', '9'])
  })

  it('falls back to legacy metadata when annotations are absent', () => {
    const legacy = [summaryShot({ id: 'l1', roaster: 'R', coffee: 'C', beanBrand: 'B', grinder: 'G', setting: 1, barista: 'bar', basket: 'T', useLegacyMetadata: true })]
    const out = mineSuggestions(legacy)
    assert.deepEqual(out.beanBrand, ['B'])
    assert.deepEqual(out.barista, ['bar'])
  })

  it('returns empty lists for records with no relevant fields', () => {
    const out = mineSuggestions([{ id: 'x', workflow: {} }])
    assert.deepEqual(out, {
      roaster: [], beanBrand: [], beanType: [], grinderModel: [], grinderSetting: [], barista: [], basketType: [],
    })
  })
})

describe('mineSuggestions — measurement independence', () => {
  it('produces identical output for summary and full records', () => {
    const full = THREE_SHOTS.map((s) => withMeasurements(s))
    // Sanity: the full records really do carry a measurements array.
    assert.ok(full.every((s) => Array.isArray(s.measurements) && s.measurements.length > 0))

    assert.deepEqual(mineSuggestions(full), mineSuggestions(THREE_SHOTS))
  })

  it('ignores measurement-only data in all seven lists', () => {
    // Telemetry that carries values shaped like every suggestion candidate, so
    // leakage into ANY of the seven lists is caught — not just three of them.
    const leaked = () => ({
      machine: { pressure: 9, flow: 2.5, mixTemperature: 93 },
      scale: { weight: 36, batteryLevel: 90 },
      volume: 36,
      coffeeName: 'Leaked Bean',
      coffeeRoaster: 'Leaked Roaster',
      metadata: { beanBrand: 'Leaked Brand', barista: 'Leaked Barista' },
      annotations: { extras: { beanBrand: 'Leaked Brand', barista: 'Leaked Barista' } },
      workflow: { context: { grinderModel: 'Leaked Grinder', grinderSetting: 3.5, extras: { basketType: 'Leaked Basket' } } },
    })

    const measurementOnly = {
      id: 'm1',
      workflow: { context: {} },
      measurements: Array.from({ length: 3 }, leaked),
    }

    assert.deepEqual(mineSuggestions([measurementOnly]), {
      roaster: [], beanBrand: [], beanType: [], grinderModel: [], grinderSetting: [], barista: [], basketType: [],
    })
  })
})
