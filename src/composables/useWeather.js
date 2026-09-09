/**
 * Composable for the `weather` home widget — one shared plugin websocket.
 *
 * Reads weather data ONLY from the `weather.reaplugin` websocket endpoint:
 *   ws/v1/plugins/weather.reaplugin/weather
 *
 * Module-level singleton state: no matter how many WeatherWidget instances
 * mount (a weather widget can be placed in any home zone), exactly one
 * ReconnectingWebSocket is opened. Widgets call `ensure()` on mount; the
 * connection is opened once (gated behind bootReady) and lives for the
 * session — the plugin emits cached readings on a heartbeat, so we never
 * tear down the socket between widget renders.
 *
 * Payload shape (see weatherModel.js for the derived-state rules):
 *   { ok, reason, ageMinutes, code, temperature, humidity, high, low, units }
 *
 * Numeric `null` = unavailable and is never coerced to 0. The two-hour
 * staleness rule, WMO→class mapping, and config/missing states all live in
 * weatherModel.js (pure, unit-tested); this file owns only connection state.
 */

import { ref, computed } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'
import { bootReady } from './useBootReady'
import { weatherClass, weatherStatus } from './weatherModel'

const WEATHER_ENDPOINT = `${WS_URL}/ws/v1/plugins/weather.reaplugin/weather`

// Grace window for the plugin-missing fallback: if no payload has ever
// arrived within this long after the first connect attempt, the plugin is
// very likely absent (ReconnectingWebSocket retries silently otherwise).
const PLUGIN_MISSING_GRACE_MS = 20000

// ---- module-level singleton state ----------------------------------------

const payload = ref(null)        // latest raw payload (null until first frame)
const hasPayload = ref(false)    // ever received a payload
const pluginMissing = ref(false) // grace elapsed with no payload at all
const isConnected = ref(false)
const status = computed(() => {
  if (!hasPayload.value) return pluginMissing.value ? 'pluginMissing' : 'loading'
  return weatherStatus(payload.value)
})

const code = computed(() => payload.value?.code ?? null)
const temperature = computed(() => payload.value?.temperature ?? null)
const high = computed(() => payload.value?.high ?? null)
const low = computed(() => payload.value?.low ?? null)
const humidity = computed(() => payload.value?.humidity ?? null)
const units = computed(() => payload.value?.units ?? null)
const iconClass = computed(() => weatherClass(payload.value?.code))

let ws = null
let booting = null    // in-flight bootReady gate (single-flight)
let missingTimer = null

function onMessage(data) {
  if (!data || typeof data !== 'object') return
  clearTimeout(missingTimer)
  missingTimer = null
  hasPayload.value = true
  if (pluginMissing.value) pluginMissing.value = false
  payload.value = data
}

function connect() {
  ws = new ReconnectingWebSocket(WEATHER_ENDPOINT, onMessage)
  ws.onConnectionChange = (connected) => {
    isConnected.value = connected
  }
  // The plugin may be absent (endpoint never connects / never emits) while
  // ReconnectingWebSocket retries quietly forever — surface that as a
  // distinct state after a grace period instead of an endless spinner.
  missingTimer = setTimeout(() => {
    missingTimer = null
    if (!hasPayload.value) pluginMissing.value = true
  }, PLUGIN_MISSING_GRACE_MS)
  ws.connect()
}

/**
 * Ensure the shared socket is connected. Idempotent — safe to call from
 * every WeatherWidget mount; only the first call opens the socket.
 */
async function ensure() {
  if (ws) return
  if (booting) return booting
  booting = (async () => {
    await bootReady()
    if (!ws) connect()
  })()
  try {
    await booting
  } finally {
    booting = null
  }
}

export function useWeather() {
  return {
    status,
    isConnected,
    // display fields (null = unavailable)
    code,
    temperature,
    high,
    low,
    humidity,
    units,
    iconClass,
    ensure,
  }
}
