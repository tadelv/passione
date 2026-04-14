/**
 * Composable for the time-to-ready plugin stream.
 *
 * Subscribes to the ReaPrime `time-to-ready.reaplugin` WebSocket endpoint
 * and exposes reactive refs describing how long until the DE1 group head
 * reaches its target temperature. The plugin ships with ReaPrime (bundled
 * plugin, see vendor/reaprime/assets/plugins/time-to-ready.reaplugin/) and
 * is enabled by default on recent gateways.
 *
 * Endpoint: ws/v1/plugins/time-to-ready.reaplugin/timeToReady
 *
 * Payload shape (from the plugin's manifest / emit):
 *   {
 *     remainingTimeMs: number | null,   // estimated ms until reach target
 *     heatingRate: number | null,       // °C per second (from linear reg.)
 *     status: 'reached' | 'heating' | 'insufficient_data' | 'not_heating',
 *     message: string,                  // "Estimated 01:30 remaining" etc.
 *     formattedTime?: string,           // "01:30" when heating (set by plugin)
 *     currentTemp?: number,
 *     targetTemp?: number,
 *     timestamp?: number,
 *   }
 *
 * Consumers typically care about:
 *   - status === 'heating'  → show the "ready in <formattedTime>" chip
 *   - status === 'reached'  → machine is at temperature, hide the chip
 *   - everything else       → hide the chip (insufficient data / not heating)
 *
 * The WS endpoint may not exist on older gateways or when the plugin is
 * disabled; ReconnectingWebSocket will silently retry and the reactive
 * refs simply stay at their defaults, so consumers degrade to "no
 * estimate shown" rather than crashing.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'

export function useTimeToReady() {
  const isConnected = ref(false)
  const status = ref(null)           // 'reached' | 'heating' | 'insufficient_data' | 'not_heating' | null
  const remainingTimeMs = ref(null)
  const formattedTime = ref(null)
  const message = ref(null)

  let ws = null

  function onMessage(data) {
    if (!data || typeof data !== 'object') return
    status.value = data.status ?? null
    remainingTimeMs.value = data.remainingTimeMs ?? null
    formattedTime.value = data.formattedTime ?? null
    message.value = data.message ?? null
  }

  function connect() {
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/plugins/time-to-ready.reaplugin/timeToReady`,
      onMessage
    )
    ws.onConnectionChange = (connected) => {
      isConnected.value = connected
      if (!connected) {
        // Stream dropped — clear stale estimate so consumers don't show
        // an old "ready in 01:30" label from before the disconnect.
        status.value = null
        remainingTimeMs.value = null
        formattedTime.value = null
        message.value = null
      }
    }
    ws.connect()
  }

  function disconnect() {
    ws?.close()
    ws = null
    isConnected.value = false
  }

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    isConnected,
    status,
    remainingTimeMs,
    formattedTime,
    message,
  }
}
