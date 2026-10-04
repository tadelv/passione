/**
 * CSS colour parsing — pure helpers.
 *
 * Dependency-free so it unit-tests under `node --test` (same pattern as
 * scaleFrame.js / weatherModel.js / shotSuggestions.js).
 *
 * Exists because theme colours are not always hex: useTheme's random palette
 * stores `hsl(...)` strings, while ColorPicker only understands `#rrggbb`.
 */

function clampByte(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(255, Math.round(n)))
}

// A numeric component must carry at least one digit, so '..' and exponents are
// rejected rather than coerced to 0.
const NUM = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)'
// Components may be separated by a comma, a slash (modern syntax), or whitespace.
const SEP = '(?:\\s*,\\s*|\\s*\\/\\s*|\\s+)'
const ALPHA = `(?:${NUM}%?)`

// Anchored and fully closed: a missing ')' or trailing garbage must NOT parse.
const RGB_RE = new RegExp(`^rgba?\\(\\s*(${NUM})${SEP}(${NUM})${SEP}(${NUM})(?:${SEP}${ALPHA})?\\)$`)
const HSL_RE = new RegExp(`^hsla?\\(\\s*(${NUM})(?:deg)?${SEP}(${NUM})%${SEP}(${NUM})%(?:${SEP}${ALPHA})?\\)$`)

function toHex(r, g, b) {
  const part = (n) => clampByte(n).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** HSL (h in degrees, s/l in percent) -> [r, g, b] in 0-255. */
function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360
  const sat = Math.max(0, Math.min(100, s)) / 100
  const light = Math.max(0, Math.min(100, l)) / 100

  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2

  let rgb
  if (hue < 60) rgb = [c, x, 0]
  else if (hue < 120) rgb = [x, c, 0]
  else if (hue < 180) rgb = [0, c, x]
  else if (hue < 240) rgb = [0, x, c]
  else if (hue < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]

  return rgb.map((v) => (v + m) * 255)
}

/**
 * Convert a CSS colour string to lowercase `#rrggbb`.
 *
 * Understands the three forms the app actually produces: `#rgb` / `#rrggbb`,
 * `rgb()` / `rgba()`, and `hsl()` / `hsla()` (comma-, slash- or
 * whitespace-separated). Parsing is anchored and fully closed — malformed
 * syntax such as `rgb(1,2,3` or `hsl(120,100%,50%)garbage` is rejected rather
 * than truncated into a colour.
 *
 * Returns null for anything else — callers must handle that rather than
 * silently substituting a colour. Notably this does NOT try to resolve
 * `var(--token)` or named colours; theme values are always literal.
 */
export function cssColorToHex(css) {
  if (typeof css !== 'string') return null
  const value = css.trim().toLowerCase()
  if (!value) return null

  // #rgb / #rrggbb
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)
  if (hex) {
    const h = hex[1]
    return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`
  }

  // rgb() / rgba() — components separated by comma, slash, or whitespace.
  // Out-of-range values are clamped rather than rejected (an authoring mistake
  // should not blank the picker), but malformed syntax must not parse at all.
  const rgb = RGB_RE.exec(value)
  if (rgb) {
    const r = Number(rgb[1])
    const g = Number(rgb[2])
    const b = Number(rgb[3])
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
    return toHex(r, g, b)
  }

  // hsl() / hsla() — hue may carry a deg unit; s and l must be percentages
  const hsl = HSL_RE.exec(value)
  if (hsl) {
    const h = Number(hsl[1])
    const s = Number(hsl[2])
    const l = Number(hsl[3])
    if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null
    return toHex(...hslToRgb(h, s, l))
  }

  return null
}
