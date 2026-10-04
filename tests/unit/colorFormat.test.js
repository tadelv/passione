/**
 * Unit tests for the CSS colour parsing helper.
 *
 * The contract that matters: theme colours are not always hex (useTheme's
 * random palette stores `hsl(...)`), and ColorPicker only understands
 * `#rrggbb` — feeding it anything else silently resolves to black. So
 * cssColorToHex must convert the real formats and return null (not a
 * fabricated colour) for anything it does not understand.
 *
 * Run: node --test tests/unit/colorFormat.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { cssColorToHex } from '../../src/composables/colorFormat.js'

describe('cssColorToHex — hex input', () => {
  it('passes through six-digit hex lowercased', () => {
    assert.equal(cssColorToHex('#1A1A2E'), '#1a1a2e')
    assert.equal(cssColorToHex('  #ffffff  '), '#ffffff')
    assert.equal(cssColorToHex('#000000'), '#000000')
  })

  it('expands three-digit shorthand', () => {
    assert.equal(cssColorToHex('#abc'), '#aabbcc')
    assert.equal(cssColorToHex('#F0A'), '#ff00aa')
  })

  it('rejects malformed hex rather than guessing', () => {
    assert.equal(cssColorToHex('#12'), null)
    assert.equal(cssColorToHex('#12345'), null)
    assert.equal(cssColorToHex('#gggggg'), null)
  })
})

describe('cssColorToHex — rgb() input', () => {
  it('converts rgb() and rgba()', () => {
    assert.equal(cssColorToHex('rgb(255, 0, 0)'), '#ff0000')
    assert.equal(cssColorToHex('rgba(0, 128, 255, 0.5)'), '#0080ff')
    assert.equal(cssColorToHex('rgb(26,26,46)'), '#1a1a2e')
  })

  it('accepts space-separated components', () => {
    assert.equal(cssColorToHex('rgb(255 0 0)'), '#ff0000')
  })

  it('clamps out-of-range components', () => {
    assert.equal(cssColorToHex('rgb(300, -20, 0)'), '#ff0000')
  })
})

describe('cssColorToHex — hsl() input (the useTheme random palette)', () => {
  it('converts the exact format generateRandomPalette produces', () => {
    // useTheme.js: `hsl(${h}, ${s}%, ${l}%)`
    assert.equal(cssColorToHex('hsl(0, 100%, 50%)'), '#ff0000')
    assert.equal(cssColorToHex('hsl(120, 100%, 50%)'), '#00ff00')
    assert.equal(cssColorToHex('hsl(240, 100%, 50%)'), '#0000ff')
    assert.equal(cssColorToHex('hsl(0, 0%, 0%)'), '#000000')
    assert.equal(cssColorToHex('hsl(0, 0%, 100%)'), '#ffffff')
  })

  it('handles achromatic and wraparound hues', () => {
    assert.equal(cssColorToHex('hsl(0, 0%, 50%)'), '#808080')
    assert.equal(cssColorToHex('hsl(360, 100%, 50%)'), '#ff0000')
    assert.equal(cssColorToHex('hsl(-120, 100%, 50%)'), '#0000ff')
  })

  it('converts every colour shape generateRandomPalette can emit', () => {
    // Regression guard for the reported bug: "Surprise me" stores hsl() values
    // (useTheme.js generateRandomPalette) which the picker read as black. Sweep
    // the same formula across the full hue range and the palette's saturation
    // range, and require every produced colour to convert.
    const paletteFor = (hue, sat) => [
      `hsl(${hue}, ${sat - 15}%, 10%)`,
      `hsl(${hue}, ${sat - 10}%, 15%)`,
      `hsl(${hue}, ${sat + 20}%, 55%)`,
      `hsl(${(hue + 150) % 360}, ${sat + 10}%, 50%)`,
      `hsl(${hue}, 10%, 90%)`,
      `hsl(${hue}, 8%, 60%)`,
      `hsl(${hue}, ${sat - 10}%, 25%)`,
      `hsl(130, 50%, 50%)`,
      `hsl(40, 80%, 55%)`,
      `hsl(0, 70%, 55%)`,
      `hsl(${(hue + 90) % 360}, ${sat}%, 60%)`,
    ]

    let checked = 0
    const seen = new Set()
    for (let hue = 0; hue < 360; hue += 7) {
      for (let sat = 40; sat <= 69; sat += 7) {
        for (const css of paletteFor(hue, sat)) {
          const hex = cssColorToHex(css)
          assert.match(hex ?? '', /^#[0-9a-f]{6}$/, `failed to convert ${css}`)
          seen.add(hex)
          checked++
        }
      }
    }
    assert.ok(checked > 1000, `expected a broad sweep, checked ${checked}`)
    // Guard against a constant-but-valid result satisfying the sweep (i.e. the
    // conversion collapsing every input to one colour).
    assert.ok(seen.size > 500, `expected varied output, saw ${seen.size} distinct colours`)
  })

  it('handles the hsla() and deg-suffixed forms', () => {
    assert.equal(cssColorToHex('hsla(240, 100%, 50%, 0.3)'), '#0000ff')
    assert.equal(cssColorToHex('hsl(240deg, 100%, 50%)'), '#0000ff')
  })

  it('never returns black for a non-black hsl colour', () => {
    // Regression guard for the reported bug: a dark-but-not-black theme colour
    // must not collapse to #000000 the way an unparsed hsl() did.
    const hex = cssColorToHex('hsl(210, 45%, 10%)')
    assert.notEqual(hex, '#000000')
    assert.match(hex, /^#[0-9a-f]{6}$/)
  })
})

describe('cssColorToHex — unsupported input', () => {  it('rejects malformed functional syntax instead of truncating it', () => {
    // Regression guard: the original patterns were unanchored, so these all
    // parsed as valid colours.
    assert.equal(cssColorToHex('rgb(1,2,3'), null, 'missing closing paren')
    assert.equal(cssColorToHex('rgb(1,2,3))'), null, 'extra closing paren')
    assert.equal(cssColorToHex('hsl(120,100%,50%)garbage'), null, 'trailing garbage')
    assert.equal(cssColorToHex('rgb(1,2,3) extra'), null, 'trailing text')
    assert.equal(cssColorToHex('rgb(..,0,0)'), null, 'malformed number')
    assert.equal(cssColorToHex('rgb(1,2)'), null, 'too few components')
    assert.equal(cssColorToHex('rgb(1,2,3,4,5)'), null, 'too many components')
    assert.equal(cssColorToHex('hsl(120,100,50)'), null, 'missing percent units')
    assert.equal(cssColorToHex('hsl(120,100%,50%)'), '#00ff00', 'the valid form still parses')
    assert.equal(cssColorToHex('rgb(1,2,3)'), '#010203', 'the valid form still parses')
  })

  it('accepts the modern slash-alpha forms', () => {
    assert.equal(cssColorToHex('rgb(255 0 0 / 0.5)'), '#ff0000')
    assert.equal(cssColorToHex('hsl(240 100% 50% / 30%)'), '#0000ff')
    assert.equal(cssColorToHex('rgb(255, 0, 0, 0.5)'), '#ff0000')
  })

  it('returns null rather than fabricating a colour', () => {
    assert.equal(cssColorToHex(''), null)
    assert.equal(cssColorToHex('   '), null)
    assert.equal(cssColorToHex(null), null)
    assert.equal(cssColorToHex(undefined), null)
    assert.equal(cssColorToHex(42), null)
    assert.equal(cssColorToHex('var(--color-primary)'), null)
    assert.equal(cssColorToHex('red'), null)
    assert.equal(cssColorToHex('not-a-colour'), null)
  })
})
