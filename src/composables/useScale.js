/**
 * Composable for real-time scale snapshot data.
 *
 * Connects to ws/v1/scale/snapshot and exposes reactive refs for weight,
 * flow, and battery level. The socket is opened once the cold-start burst
 * has settled and held open — Decaid keeps the channel alive across scale
 * connect/disconnect cycles and emits its own status frames, which are the
 * authoritative connection signal. The /ws/v1/devices inventory is not used
 * here because it can label an active integrated scale disconnected.
 */

import { ref, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'
import { tareScale as restTareScale } from '../api/rest'
import { bootReady } from './useBootReady'
import { reduceScaleFrame } from './scaleFrame'

export function useScale() {
  const isConnected = ref(false)
  const weight = ref(0)
  const batteryLevel = ref(null)
  const timestamp = ref(null)
  const flowRate = ref(0)

  let ws = null
  let disposed = false

  function onMessage(data) {
    const next = reduceScaleFrame(
      {
        isConnected: isConnected.value,
        weight: weight.value,
        flowRate: flowRate.value,
        batteryLevel: batteryLevel.value,
        timestamp: timestamp.value,
      },
      data
    )
    isConnected.value = next.isConnected
    weight.value = next.weight
    flowRate.value = next.flowRate
    batteryLevel.value = next.batteryLevel
    timestamp.value = next.timestamp
  }

  function _open() {
    if (ws || disposed) return
    ws = new ReconnectingWebSocket(`${WS_URL}/ws/v1/scale/snapshot`, onMessage)
    ws.onConnectionChange = (connected) => {
      if (!connected) isConnected.value = false
    }
    ws.connect()
  }

  function _close() {
    ws?.close()
    ws = null
    isConnected.value = false
    weight.value = 0
    flowRate.value = 0
    batteryLevel.value = null
  }

  // Wait out the boot-quiet burst before opening; ReconnectingWebSocket owns
  // reconnect from here on. The sleep/wake watcher in App.vue still pauses
  // the channel during machine sleep via connect()/disconnect().
  bootReady().then(() => {
    if (!disposed) _open()
  })

  /** Tare (zero) the scale. */
  function tare() {
    return restTareScale()
  }

  function connect() { _open() }
  function disconnect() { _close() }

  onUnmounted(() => {
    disposed = true
    _close()
  })

  return {
    isConnected,
    weight,
    flowRate,
    batteryLevel,
    timestamp,
    tare,
    connect,
    disconnect,
  }
}
