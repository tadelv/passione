/**
 * Composable for real-time scale snapshot data.
 *
 * Connects to ws/v1/scale/snapshot (5-10 Hz) and exposes reactive refs
 * for weight and battery level.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'
import { tareScale as restTareScale } from '../api/rest'

export function useScale() {
  const isConnected = ref(false)
  const weight = ref(0)
  const batteryLevel = ref(null)
  const timestamp = ref(null)

  let ws = null

  function onMessage(data) {
    timestamp.value = data.timestamp ?? null
    weight.value = data.weight ?? 0
    batteryLevel.value = data.batteryLevel ?? null
  }

  function connect() {
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/scale/snapshot`,
      onMessage
    )
    ws.onConnectionChange = (connected) => {
      isConnected.value = connected
    }
    ws.connect()
  }

  function disconnect() {
    ws?.close()
    ws = null
    isConnected.value = false
  }

  /** Tare (zero) the scale. */
  function tare() {
    return restTareScale()
  }

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    isConnected,
    weight,
    batteryLevel,
    timestamp,
    tare,
    connect,
    disconnect,
  }
}
