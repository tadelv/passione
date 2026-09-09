/**
 * Pure weather display logic for the `weather` home widget.
 *
 * Backed by the `weather.reaplugin` plugin websocket payload:
 *   { ok, reason, ageMinutes, code, temperature, humidity, high, low, units }
 *
 * This module is intentionally gateway-free so the unit tests can import it
 * under plain `node --test`. Keep derivations here (WMO→class, staleness,
 * null-safe text) and let useWeather.js own the connection/lifecycle.
 */

// WMO weather code → coarse display class (five-icon v1 set).
// 0 clear · 1-2 partly cloudy · 3/45/48 overcast+fog · drizzle/rain/
// showers/thunder 51-99 · freezing/snow 56-86. Anything else (null,
// unknown, future codes) falls back to the neutral cloudy graphic.
const WMO_CLASS = {
  0: 'clear',
  1: 'partlyCloudy',
  2: 'partlyCloudy',
  3: 'cloudy',
  45: 'cloudy',
  48: 'cloudy',
  51: 'rain',
  53: 'rain',
  55: 'rain',
  61: 'rain',
  63: 'rain',
  65: 'rain',
  80: 'rain',
  81: 'rain',
  82: 'rain',
  95: 'rain',
  96: 'rain',
  99: 'rain',
  56: 'snow',
  57: 'snow',
  66: 'snow',
  67: 'snow',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snow',
  85: 'snow',
  86: 'snow',
}

/**
 * Map a WMO weather code to one of the five condition classes:
 * 'clear' | 'partlyCloudy' | 'cloudy' | 'rain' | 'snow'.
 * Unknown/null/future codes map to 'cloudy' (neutral fallback mark).
 */
export function weatherClass(code) {
  return WMO_CLASS[code] ?? 'cloudy'
}

/**
 * Derive the widget state from a payload.
 *
 * Returns one of:
 *   'loading'       — no usable payload yet (initial / pre-first-frame)
 *   'usable'        — ok:true and younger than the two-hour staleness cap
 *   'config'        — ok:false with a plugin-config reason (no_location,
 *                     unknown_place): direct the user to the plugin
 *   'unavailable'   — anything else that must not show stale weather
 */
export function weatherStatus(payload) {
  if (!payload || typeof payload !== 'object') return 'loading'
  if (payload.ok === false) {
    if (payload.reason === 'no_location' || payload.reason === 'unknown_place') {
      return 'config'
    }
    return 'unavailable'
  }
  if (payload.ok !== true) return 'loading'
  const age = payload.ageMinutes
  if (typeof age === 'number' && age >= 120) return 'unavailable'
  return 'usable'
}

/**
 * User-facing notice copy for a weatherStatus state. Single source of truth
 * for the widget's explanatory text.
 *
 * Returns { title, detail } for states that render a notice, or null when
 * the state renders no notice (loading / usable).
 *   'config'        → point the user at plugin location config
 *   'unavailable'   → stale/offline, nothing actionable skin-side
 *   'pluginMissing' → plugin must be installed
 */
export function weatherNotice(status) {
  switch (status) {
    case 'config':
      return { title: 'Weather unavailable', detail: 'Configure location in Weather plugin' }
    case 'unavailable':
      return { title: 'Weather unavailable', detail: null }
    case 'pluginMissing':
      return { title: 'Weather plugin required', detail: 'Install weather.reaplugin to use this widget' }
    default:
      return null
  }
}

/**
 * Temperature + unit label for the current reading.
 * 'metric' → °C, 'imperial' → °F. Null stays unavailable ('—'), never 0.
 */
export function displayTemperature(value, units) {
  if (value == null || Number.isNaN(value)) return '—'
  const unit = units === 'imperial' ? '°F' : units === 'metric' ? '°C' : '°'
  return `${Math.round(Number(value))}${unit}`
}

/**
 * High/low value with a degree mark (e.g. '24°'). Null → '—'.
 */
export function displayHighLow(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${Math.round(Number(value))}°`
}

/**
 * Relative humidity with percent mark (e.g. '58%'). Null → '—%'.
 */
export function displayHumidity(value) {
  if (value == null || Number.isNaN(value)) return '—%'
  return `${Math.round(Number(value))}%`
}
