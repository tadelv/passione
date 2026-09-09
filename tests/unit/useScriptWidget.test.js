/**
 * Unit tests for the Script Widget pure helpers (issue #9).
 *
 * Covers the serializable state contract (null preservation, ratio, no
 * coercion), and the generated srcdoc document (theme variables, escaped
 * payload so a user `</script>` cannot break out, per-placement metadata).
 *
 * Run: node --test tests/unit/useScriptWidget.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  SCRIPT_WIDGET_EXAMPLE,
  SCRIPT_WIDGET_SANDBOX,
  SCRIPT_WIDGET_THEME_DEFAULTS,
  buildScriptWidgetState,
  buildScriptWidgetDocument,
} from '../../src/composables/useScriptWidget.js'

describe('buildScriptWidgetState — serialized read-only snapshot', () => {
  const connected = {
    machine: { connected: true, state: 'idle', substate: 'ready', temperature: 92.5 },
    scale: { connected: true, weight: 0, battery: 100 },
    workflow: {
      profile: { id: 'profile:abc', title: 'Classic' },
      context: {
        coffeeName: 'Morning Bean',
        coffeeRoaster: 'Roaster X',
        beanBatchId: 'batch-1',
        targetDoseWeight: 18,
        targetYield: 36,
        grinderId: 'grinder-9',
        grinderModel: 'Niche Zero',
        grinderSetting: '12',
      },
    },
  }

  it('maps Passione-owned workflow context fields explicitly', () => {
    const s = buildScriptWidgetState(connected)
    assert.deepEqual(s.workflow, {
      profileId: 'profile:abc',
      profileTitle: 'Classic',
      coffeeName: 'Morning Bean',
      coffeeRoaster: 'Roaster X',
      beanBatchId: 'batch-1',
      dose: 18,
      yield: 36,
      ratio: 2,
      grinderId: 'grinder-9',
      grinderName: 'Niche Zero',
      grindSetting: '12',
    })
  })

  it('keeps machine/scale telemetry including legitimate zeroes', () => {
    const s = buildScriptWidgetState(connected)
    assert.equal(s.machine.connected, true)
    assert.equal(s.machine.state, 'idle')
    assert.equal(s.machine.temperature, 92.5)
    assert.equal(s.scale.connected, true)
    assert.equal(s.scale.weight, 0) // tared zero is a real reading, not "no scale"
    assert.equal(s.scale.battery, 100)
  })

  it('nulls telemetry when the machine/scale is disconnected (no 0/"" coercion)', () => {
    const s = buildScriptWidgetState({
      machine: { connected: false, state: 'unknown', substate: 'unknown', temperature: 92.5 },
      scale: { connected: false, weight: 0, battery: null },
      workflow: connected.workflow,
    })
    assert.equal(s.machine.connected, false)
    assert.equal(s.machine.temperature, null)
    assert.equal(s.machine.state, 'unknown') // Passione's own "no data" sentinel
    assert.equal(s.scale.connected, false)
    assert.equal(s.scale.weight, null)
    assert.equal(s.scale.battery, null)
  })

  it('preserves null/unavailable optional workflow values', () => {
    const s = buildScriptWidgetState({
      machine: connected.machine,
      scale: connected.scale,
      workflow: { profile: { title: 'No ids here' }, context: { targetDoseWeight: 20 } },
    })
    assert.equal(s.workflow.profileId, null) // profile.id absent → null, not undefined
    assert.equal(s.workflow.dose, 20)
    assert.equal(s.workflow.yield, null)
    assert.equal(s.workflow.ratio, null) // ratio needs both dose and yield
    assert.equal(s.workflow.coffeeName, null)
    assert.equal(s.workflow.grinderName, null)
    assert.equal(s.workflow.grindSetting, null)
    assert.equal('undefined' in s.workflow, false)
  })

  it('ratio is null when dose is zero or missing', () => {
    assert.equal(buildScriptWidgetState(connected).workflow.ratio, 2)
    const zeroDose = buildScriptWidgetState({
      ...connected,
      workflow: { context: { targetDoseWeight: 0, targetYield: 36 } },
    })
    assert.equal(zeroDose.workflow.ratio, null)
  })

  it('tolerates a missing/empty workflow', () => {
    const s = buildScriptWidgetState({ machine: connected.machine, scale: connected.scale, workflow: null })
    for (const value of Object.values(s.workflow)) {
      assert.equal(value, null)
    }
  })

  it('serializes cleanly through JSON (no cycles, JSON-safe values)', () => {
    const roundTrip = JSON.parse(JSON.stringify(buildScriptWidgetState(connected)))
    assert.equal(roundTrip.workflow.ratio, 2)
    assert.equal(roundTrip.machine.temperature, 92.5)
  })
})

describe('sandbox contract', () => {
  it('runs scripts but never grants same-origin/popup/navigation capabilities', () => {
    assert.equal(SCRIPT_WIDGET_SANDBOX, 'allow-scripts')
    assert.equal(SCRIPT_WIDGET_SANDBOX.includes('allow-same-origin'), false)
  })
})

describe('buildScriptWidgetDocument — generated runtime document', () => {
  const base = {
    state: buildScriptWidgetState({
      machine: { connected: true, state: 'idle', substate: 'ready', temperature: 92.5 },
      scale: { connected: true, weight: 0, battery: 100 },
      workflow: null,
    }),
    widget: { zone: 'topLeft', density: 'compact' },
    source: 'document.body.textContent = "hello"',
  }

  it('injects --passione-* theme variables over sensible defaults', () => {
    const doc = buildScriptWidgetDocument({ ...base, themeVars: { text: '#123456' } })
    assert.ok(doc.includes('--passione-text: #123456;'))
    assert.ok(doc.includes('--passione-text-muted:'))
    assert.ok(doc.includes('--passione-background: #1a1a2e;')) // default applied
    assert.equal(SCRIPT_WIDGET_THEME_DEFAULTS.accent, '#e94560')
  })

  it('embeds placement metadata (zone/density) in the initial payload', () => {
    const doc = buildScriptWidgetDocument(base)
    assert.ok(doc.includes('topLeft'))
    assert.ok(doc.includes('compact'))
    assert.ok(doc.includes('passione-state'))
  })

  it('contains exactly one literal </script> — a user </script> cannot break out', () => {
    const evil = 'document.body.textContent = "</script><script>globalThis.pwned=1</script>"'
    const doc = buildScriptWidgetDocument({ ...base, source: evil })
    const closingTags = doc.split('</script').length - 1
    assert.equal(closingTags, 1, 'payload must be escaped so it cannot close the bootstrap script')
    assert.ok(!doc.includes('</script><script'), 'no raw breakout sequence may survive')
    assert.ok(doc.includes('\\u003c/script')) // source travels escaped inside the payload
  })

  it('produces a runnable <script> document skeleton', () => {
    const doc = buildScriptWidgetDocument(base)
    assert.ok(doc.startsWith('<!DOCTYPE html>'))
    assert.ok(doc.includes('<script>'))
    assert.ok(doc.includes('</script>'))
  })

  it('example source exercises both initial state and the update event', () => {
    assert.equal(typeof SCRIPT_WIDGET_EXAMPLE, 'string')
    assert.ok(SCRIPT_WIDGET_EXAMPLE.includes('passione.state'))
    assert.ok(SCRIPT_WIDGET_EXAMPLE.includes("addEventListener('passione-state'"))
    assert.ok(SCRIPT_WIDGET_EXAMPLE.includes('scale?.weight'))
  })
})
