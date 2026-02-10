/**
 * Composable for real-time machine snapshot data.
 *
 * Connects to ws/v1/machine/snapshot (~10 Hz) and exposes reactive refs
 * for all telemetry fields. Also provides a method to request state changes.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'
import { setMachineState } from '../api/rest'

export function useMachine() {
  // Connection state
  const isConnected = ref(false)

  // Machine state
  const state = ref('unknown')
  const substate = ref('unknown')

  // Telemetry
  const pressure = ref(0)
  const flow = ref(0)
  const targetPressure = ref(0)
  const targetFlow = ref(0)
  const mixTemperature = ref(0)
  const groupTemperature = ref(0)
  const targetMixTemperature = ref(0)
  const targetGroupTemperature = ref(0)
  const steamTemperature = ref(0)
  const profileFrame = ref(0)
  const timestamp = ref(null)

  // Raw snapshot for consumers that need the full object
  const snapshot = ref(null)

  let ws = null

  function onMessage(data) {
    snapshot.value = data
    timestamp.value = data.timestamp ?? null

    if (data.state) {
      state.value = data.state.state ?? 'unknown'
      substate.value = data.state.substate ?? 'unknown'
    }

    pressure.value = data.pressure ?? 0
    flow.value = data.flow ?? 0
    targetPressure.value = data.targetPressure ?? 0
    targetFlow.value = data.targetFlow ?? 0
    mixTemperature.value = data.mixTemperature ?? 0
    groupTemperature.value = data.groupTemperature ?? 0
    targetMixTemperature.value = data.targetMixTemperature ?? 0
    targetGroupTemperature.value = data.targetGroupTemperature ?? 0
    steamTemperature.value = data.steamTemperature ?? 0
    profileFrame.value = data.profileFrame ?? 0
  }

  function connect() {
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/machine/snapshot`,
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

  /**
   * Request a machine state change (e.g. "espresso", "steam", "idle", "sleeping").
   */
  function requestState(newState) {
    return setMachineState(newState)
  }

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    // connection
    isConnected,
    // state
    state,
    substate,
    snapshot,
    timestamp,
    // telemetry
    pressure,
    flow,
    targetPressure,
    targetFlow,
    mixTemperature,
    groupTemperature,
    targetMixTemperature,
    targetGroupTemperature,
    steamTemperature,
    profileFrame,
    // actions
    requestState,
    connect,
    disconnect,
  }
}
