/**
 * Singleton composable for the Bengle milk-probe sensor.
 *
 * Decaid decodes Bengle's A013 MilkTemp field and exposes it as a normal
 * sensor under /api/v1/sensors (id ends with `-milkprobe`), streamed via
 * /ws/v1/sensors/<id>/snapshot. This discovers the probe once boot-quiet is
 * past, subscribes to its snapshot stream, and re-discovers on machine
 * connect (App.vue wires refresh()/close()).
 */

import { ref, readonly } from 'vue'
import { WS_URL } from '../api/gateway'
import { getSensors } from '../api/rest'
import { ReconnectingWebSocket } from '../api/websocket'
import { bootReady } from './useBootReady'

let _instance = null

export function useMilkProbe() {
  if (_instance) return _instance

  const probeId = ref(null)
  const temperature = ref(null)
  const isConnected = ref(false)

  let ws = null

  function close() {
    ws?.close()
    ws = null
    probeId.value = null
    temperature.value = null
    isConnected.value = false
  }

  function open(id) {
    close()
    if (!id) return
    probeId.value = id
    // The sensor id carries BLE colons that must survive URL construction.
    // encodeURI keeps colons intact; encodeURIComponent percent-encodes them
    // and the gateway then 404s the path.
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/sensors/${encodeURI(id)}/snapshot`,
      (data) => {
        if (typeof data.temperature === 'number') {
          temperature.value = data.temperature
          if (!isConnected.value) isConnected.value = true
        }
      }
    )
    ws.onConnectionChange = (connected) => {
      if (!connected) isConnected.value = false
    }
    ws.connect()
  }

  async function refresh() {
    try {
      const sensors = await getSensors()
      const list = Array.isArray(sensors) ? sensors : []
      const probe = list.find(
        (s) => s?.id?.endsWith('-milkprobe') || s?.info?.name === 'Bengle Milk Probe'
      )
      open(probe?.id ?? null)
    } catch {
      close()
    }
  }

  bootReady().then(refresh)

  _instance = {
    probeId: readonly(probeId),
    temperature: readonly(temperature),
    isConnected: readonly(isConnected),
    refresh,
    close,
  }

  return _instance
}
