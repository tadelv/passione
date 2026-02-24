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

  // Client-side flow rate derivative: (weight[n] - weight[n-1]) / dt
  const flowRate = ref(0)
  let _prevWeight = null
  let _prevTime = null
  const SMOOTHING = 0.3 // EMA alpha — lower = smoother

  let ws = null

  function onMessage(data) {
    timestamp.value = data.timestamp ?? null
    const newWeight = data.weight ?? 0

    // Compute flow rate before updating weight
    const now = Date.now()
    if (_prevWeight !== null && _prevTime !== null) {
      const dt = (now - _prevTime) / 1000
      if (dt > 0 && dt < 2) {
        const raw = (newWeight - _prevWeight) / dt
        // Clamp negative flow to 0 (dripping/noise)
        const clamped = Math.max(0, raw)
        // Exponential moving average
        flowRate.value = SMOOTHING * clamped + (1 - SMOOTHING) * flowRate.value
      }
    }
    _prevWeight = newWeight
    _prevTime = now

    weight.value = newWeight
    batteryLevel.value = data.batteryLevel ?? null
  }

  function connect() {
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/scale/snapshot`,
      (data) => {
        // Mark connected only when we actually receive scale data,
        // not just when the WebSocket opens. This avoids false
        // connect/disconnect notifications when no physical scale
        // is paired with ReaPrime.
        if (!isConnected.value) isConnected.value = true
        onMessage(data)
      }
    )
    ws.onConnectionChange = (connected) => {
      if (!connected) isConnected.value = false
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
    flowRate,
    batteryLevel,
    timestamp,
    tare,
    connect,
    disconnect,
  }
}
