/**
 * Unit tests for the home comboEditor widget tool-visibility config.
 *
 * Verifies the acceptance criteria that live in pure logic:
 *  - default tool visibility (coffee/grind/dose on; temp/RPM/basket off)
 *  - fixed ordering
 *  - sanitization of partial/foreign stored shapes
 *  - at-least-one-tool invariant (all-off configs restore defaults)
 *
 * Run: node --test tests/unit/useComboEditorConfig.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  COMBO_EDITOR_TOOL_ORDER,
  COMBO_EDITOR_TOOL_DEFAULTS,
  normalizeComboEditorTools,
} from '../../src/composables/useComboEditorConfig.js'

describe('combo editor config', () => {
  it('defaults to coffee/grind/dose enabled, temp/RPM/basket disabled', () => {
    assert.deepEqual(normalizeComboEditorTools(undefined), {
      coffee: true,
      grind: true,
      dose: true,
      temperature: false,
      grinderRpm: false,
      basket: false,
    })
    assert.deepEqual(COMBO_EDITOR_TOOL_DEFAULTS, {
      coffee: true,
      grind: true,
      dose: true,
      temperature: false,
      grinderRpm: false,
      basket: false,
    })
  })

  it('keeps a fixed v1 ordering', () => {
    assert.deepEqual(COMBO_EDITOR_TOOL_ORDER, [
      'coffee', 'grind', 'dose', 'temperature', 'grinderRpm', 'basket',
    ])
  })

  it('sanitizes partial stored configs against the defaults', () => {
    // A config saved before a key existed / hand-edited to a partial shape
    // must not lose keys or gain foreign keys.
    const out = normalizeComboEditorTools({ coffee: true, basket: true, bogus: true })
    assert.deepEqual(out, {
      coffee: true,
      grind: true,
      dose: true,
      temperature: false,
      grinderRpm: false,
      basket: true,
    })
  })

  it('refuses an all-off config (at-least-one invariant)', () => {
    const out = normalizeComboEditorTools({
      coffee: false, grind: false, dose: false,
      temperature: false, grinderRpm: false, basket: false,
    })
    assert.deepEqual(out, COMBO_EDITOR_TOOL_DEFAULTS)
    assert.ok(Object.values(out).some(Boolean))
  })

  it('non-boolean values fall back to that tool\'s default', () => {
    const out = normalizeComboEditorTools({ coffee: 'yes', dose: 1, temperature: null })
    assert.equal(out.coffee, true) // default-on tool
    assert.equal(out.grind, true)  // default-on tool
    assert.equal(out.dose, true)   // default-on tool
    assert.equal(out.temperature, false) // default-off tool
    assert.equal(out.grinderRpm, false)
  })
})
