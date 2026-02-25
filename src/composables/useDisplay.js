/**
 * Composable for display state via ws/v1/display.
 *
 * Provides reactive display state (brightness, wake-lock) and commands
 * to dim/restore the display and request/release wake-lock.
 * Wake-lock is auto-released by the server on WebSocket disconnect.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'

export function useDisplay() {
  const brightness = ref('normal')       // 'normal' | 'dimmed'
  const wakeLockEnabled = ref(false)
  const wakeLockOverride = ref(false)
  const platformSupported = ref(false)
  const isConnected = ref(false)

  let ws = null

  function onMessage(data) {
    if (data.brightness != null) brightness.value = data.brightness
    if (data.wakeLockEnabled != null) wakeLockEnabled.value = data.wakeLockEnabled
    if (data.wakeLockOverride != null) wakeLockOverride.value = data.wakeLockOverride
    if (data.platformSupported != null) platformSupported.value = data.platformSupported
  }

  function dim() {
    ws?.send({ command: 'dim' })
  }

  function restore() {
    ws?.send({ command: 'restore' })
  }

  function requestWakeLock() {
    ws?.send({ command: 'requestWakeLock' })
  }

  function releaseWakeLock() {
    ws?.send({ command: 'releaseWakeLock' })
  }

  function connect() {
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/display`,
      onMessage
    )
    ws.onConnectionChange = (connected) => {
      isConnected.value = connected
      if (!connected) {
        wakeLockEnabled.value = false
        wakeLockOverride.value = false
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
    brightness,
    wakeLockEnabled,
    wakeLockOverride,
    platformSupported,
    isConnected,
    dim,
    restore,
    requestWakeLock,
    releaseWakeLock,
  }
}
