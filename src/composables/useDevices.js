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

  // ConnectionManager status
  const connectionPhase = ref('idle')
  const foundMachines = ref([])
  const foundScales = ref([])
  const pendingAmbiguity = ref(null) // 'machinePicker' | 'scalePicker' | null
  const connectionError = ref(null)

  let ws = null

  function onMessage(data) {
    if (Array.isArray(data.devices)) {
      devices.value = data.devices
    }
    if (typeof data.scanning === 'boolean') {
      scanning.value = data.scanning
    }
    if (data.connectionStatus) {
      const cs = data.connectionStatus
      if (cs.phase != null) connectionPhase.value = cs.phase
      if (Array.isArray(cs.foundMachines)) foundMachines.value = cs.foundMachines
      if (Array.isArray(cs.foundScales)) foundScales.value = cs.foundScales
      pendingAmbiguity.value = cs.pendingAmbiguity ?? null
      connectionError.value = cs.error ?? null
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
    devices,
    scanning,
    isConnected,
    machineConnected,
    scaleConnected,
    machineDevice,
    scaleDevice,
    connectionPhase,
    foundMachines,
    foundScales,
    pendingAmbiguity,
    connectionError,
    scan,
    connectDevice,
    disconnectDevice,
  }
}
