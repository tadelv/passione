/**
 * Composable for real-time scale snapshot data.
 *
 * Connects to ws/v1/scale/snapshot (5-10 Hz) and exposes reactive refs
 * for weight and battery level.
 *
 * Pass an `enabled` ref to gate the WebSocket on external state (e.g. the
 * `scaleConnected` flag from useDevices). The WS will open when enabled
 * becomes true and close when it becomes false. Without an enabled arg,
 * the WS opens on mount unconditionally (legacy behavior).
 */

import { ref, onUnmounted, watch, isRef } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'
import { tareScale as restTareScale } from '../api/rest'

export function useScale(enabled = true) {
  const isConnected = ref(false)
  const weight = ref(0)
  const batteryLevel = ref(null)
  const timestamp = ref(null)
  const flowRate = ref(0)

  let ws = null

  function onMessage(data) {
    timestamp.value = data.timestamp ?? null
    weight.value = data.weight ?? 0
    flowRate.value = Math.max(0, data.weightFlow ?? 0)
    batteryLevel.value = data.battery ?? null
  }

  function _open() {
    if (ws) return
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

  function _close() {
    ws?.close()
    ws = null
    isConnected.value = false
    weight.value = 0
    flowRate.value = 0
    batteryLevel.value = null
  }

  // Honor the `enabled` source — open when true, close when false.
  if (isRef(enabled)) {
    watch(
      enabled,
      (v) => { v ? _open() : _close() },
      { immediate: true }
    )
  } else if (enabled) {
    _open()
  }

  /** Tare (zero) the scale. */
  function tare() {
    return restTareScale()
  }

  // Manual override — rarely needed, the watcher does the work.
  function connect() { _open() }
  function disconnect() { _close() }

  onUnmounted(_close)

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
