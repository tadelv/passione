/**
 * Composable for real-time device state via ws/v1/devices.
 *
 * Provides reactive device list, scanning state, and derived connection
 * flags for machine/scale. Sends scan/connect/disconnect commands over
 * the same bidirectional WebSocket.
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'

export function useDevices() {
  const devices = ref([])
  const scanning = ref(false)
  const isConnected = ref(false)

  let ws = null

  function onMessage(data) {
    if (Array.isArray(data.devices)) {
      devices.value = data.devices
    }
    if (typeof data.scanning === 'boolean') {
      scanning.value = data.scanning
    }
  }

  // Derived: is a machine device in "connected" state?
  const machineConnected = computed(() =>
    devices.value.some(d => d.type === 'machine' && d.state === 'connected')
  )

  // Derived: is a scale device in "connected" state?
  const scaleConnected = computed(() =>
    devices.value.some(d => d.type === 'scale' && d.state === 'connected')
  )

  // Derived: the connected machine device (if any)
  const machineDevice = computed(() =>
    devices.value.find(d => d.type === 'machine' && d.state === 'connected') ?? null
  )

  // Derived: the connected scale device (if any)
  const scaleDevice = computed(() =>
    devices.value.find(d => d.type === 'scale' && d.state === 'connected') ?? null
  )

  /** Start a BLE/USB scan. Optionally auto-connect discovered devices. */
  function scan({ connect: autoConnect = false, quick = false } = {}) {
    ws?.send({ command: 'scan', connect: autoConnect, quick })
  }

  /** Connect to a specific device by ID. */
  function connectDevice(deviceId) {
    ws?.send({ command: 'connect', deviceId })
  }

  /** Disconnect a specific device by ID. */
  function disconnectDevice(deviceId) {
    ws?.send({ command: 'disconnect', deviceId })
  }

  function connect() {
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/devices`,
      onMessage
    )
    ws.onConnectionChange = (connected) => {
      isConnected.value = connected
      if (!connected) {
        devices.value = []
        scanning.value = false
      }
    }
    ws.connect()
  }

  function disconnect() {
    ws?.close()
    ws = null
    isConnected.value = false
    devices.value = []
    scanning.value = false
  }

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    /** All known devices from ReaPrime. */
    devices,
    /** Whether a BLE/USB scan is in progress. */
    scanning,
    /** Whether the devices WebSocket is connected to the gateway. */
    isConnected,
    /** Whether a machine is physically connected. */
    machineConnected,
    /** Whether a scale is physically connected. */
    scaleConnected,
    /** The connected machine device info, or null. */
    machineDevice,
    /** The connected scale device info, or null. */
    scaleDevice,
    /** Send scan command. */
    scan,
    /** Connect to a device by ID. */
    connectDevice,
    /** Disconnect a device by ID. */
    disconnectDevice,
  }
}
