/**
 * Unit test for reduceScaleFrame — the /ws/v1/scale/snapshot frame parser.
 *
 * Decaid's scale channel emits `{status: connected|disconnected}` frames
 * plus `{weight, weightFlow, battery, ...}` snapshots. The reducer must
 * derive connection state from those frames rather than from the device
 * inventory (an active integrated scale can be labelled disconnected there).
 *
 * Run: node --test tests/unit/scaleFrame.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { reduceScaleFrame } from '../../src/composables/scaleFrame.js'

const empty = {
  isConnected: false,
  weight: 0,
  flowRate: 0,
  batteryLevel: null,
  timestamp: null,
}

describe('reduceScaleFrame', () => {
  it('marks connected on a connected status frame', () => {
    const next = reduceScaleFrame(empty, { status: 'connected' })
    assert.equal(next.isConnected, true)
  })

  it('clears readings on a disconnected status frame', () => {
    const connected = { ...empty, isConnected: true, weight: 42, flowRate: 2.5, batteryLevel: 90 }
    const next = reduceScaleFrame(connected, { status: 'disconnected' })
    assert.equal(next.isConnected, false)
    assert.equal(next.weight, 0)
    assert.equal(next.flowRate, 0)
    assert.equal(next.batteryLevel, null)
  })

  it('applies a snapshot frame and marks connected', () => {
    const next = reduceScaleFrame(empty, {
      timestamp: 't',
      weight: 18.5,
      weightFlow: 1.2,
      battery: 80,
    })
    assert.equal(next.isConnected, true)
    assert.equal(next.weight, 18.5)
    assert.equal(next.flowRate, 1.2)
    assert.equal(next.batteryLevel, 80)
    assert.equal(next.timestamp, 't')
  })

  it('clamps negative flow to zero', () => {
    const next = reduceScaleFrame(empty, { weight: 10, weightFlow: -3 })
    assert.equal(next.flowRate, 0)
  })

  it('ignores frames that carry neither status nor weight', () => {
    assert.deepEqual(reduceScaleFrame(empty, { foo: 1 }), empty)
  })
})
