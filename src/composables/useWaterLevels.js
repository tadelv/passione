/**
 * Composable for real-time water level updates.
 *
 * Connects to ws/v1/machine/waterLevels (push on change) and exposes
 * reactive refs for current and refill water levels.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'

export function useWaterLevels() {
  const isConnected = ref(false)
  const currentLevel = ref(0)
  const refillLevel = ref(0)

  let ws = null

  function onMessage(data) {
    currentLevel.value = data.currentLevel ?? currentLevel.value
    refillLevel.value = data.refillLevel ?? refillLevel.value
  }

  function connect() {
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/machine/waterLevels`,
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

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    isConnected,
    currentLevel,
    refillLevel,
    connect,
    disconnect,
  }
}
