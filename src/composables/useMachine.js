/**
 * Composable for real-time machine snapshot data.
 *
 * Connects to ws/v1/machine/snapshot (~10 Hz) and exposes reactive refs
 * for all telemetry fields plus derived state flags for easy consumption.
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'
import { setMachineState, getMachineState } from '../api/rest'

// States where the machine is actively performing an operation
const OPERATION_STATES = new Set(['espresso', 'steam', 'hotWater', 'flush', 'descaling', 'cleaning', 'calibration', 'selfTest', 'airPurge', 'fwUpgrade'])
const FLOWING_STATES = new Set(['espresso', 'steam', 'hotWater', 'flush'])
const HEATING_STATES = new Set(['heating', 'preheating'])
const READY_STATES = new Set(['idle', 'heating'])

// Map Streamline-Bridge states/substates to Decenza-style phases
const PHASE_MAP = {
  'sleeping': 'Sleep',
  'idle': 'Idle',
  'heating': 'Heating',
  'booting': 'Idle',
  'busy': 'Busy',
  'preheating': 'EspressoPreheating',
  'espresso': 'Pouring',
  'steam': 'Steaming',
  'hotWater': 'HotWater',
  'flush': 'Flushing',
  'steamRinse': 'Flushing',
  'descaling': 'Descaling',
  'cleaning': 'Cleaning',
  'calibration': 'Busy',
  'selfTest': 'Busy',
  'airPurge': 'Busy',
  'fwUpgrade': 'Busy',
  'skipStep': 'Pouring',
  'needsWater': 'Refill',
  'error': 'Disconnected',
}

// More specific phase mapping using substate
const SUBSTATE_PHASE_MAP = {
  'espresso:preparingForShot': 'EspressoPreheating',
  'espresso:preinfusion': 'Preinfusion',
  'espresso:pouring': 'Pouring',
  'espresso:pouringDone': 'Ending',
}

export function useMachine() {
  // Connection state
  const isConnected = ref(false)

  // Machine state
  const state = ref('unknown')
  const substate = ref('unknown')
  const previousState = ref(null)
  const previousSubstate = ref(null)

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

  // Shot timer — computed client-side from state transitions
  const _shotStartTime = ref(null)
  const shotTime = ref(0)
  let _shotTimerInterval = null

  // ---- Derived states --------------------------------------------------------

  /** Machine is in a ready-to-operate state (idle or heating). */
  const isReady = computed(() => READY_STATES.has(state.value))

  /** Machine is actively heating up. */
  const isHeating = computed(() => HEATING_STATES.has(state.value))

  /** Machine is actively performing a flowing operation. */
  const isFlowing = computed(() => FLOWING_STATES.has(state.value))

  /** Machine is performing any operation (espresso, steam, etc.). */
  const isOperating = computed(() => OPERATION_STATES.has(state.value))

  /** Machine is sleeping. */
  const isSleeping = computed(() => state.value === 'sleeping')

  /** Decenza-style phase derived from state + substate. */
  const phase = computed(() => {
    const key = `${state.value}:${substate.value}`
    return SUBSTATE_PHASE_MAP[key] || PHASE_MAP[state.value] || 'Disconnected'
  })

  // ---- WebSocket handler ----------------------------------------------------
  // P6-5: All ref assignments within onMessage are synchronous, so Vue 3's
  // reactivity system batches them into a single watcher flush. No additional
  // batching is needed.

  let ws = null

  function onMessage(data) {
    snapshot.value = data
    timestamp.value = data.timestamp ?? null

    if (data.state) {
      const newState = data.state.state ?? 'unknown'
      const newSubstate = data.state.substate ?? 'unknown'

      // Track previous state for transition detection
      if (newState !== state.value) {
        previousState.value = state.value
      }
      if (newSubstate !== substate.value) {
        previousSubstate.value = substate.value
      }

      state.value = newState
      substate.value = newSubstate
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

  // ---- Shot timer -----------------------------------------------------------

  function _startShotTimer() {
    _shotStartTime.value = Date.now()
    shotTime.value = 0
    _stopShotTimer()
    _shotTimerInterval = setInterval(() => {
      if (_shotStartTime.value !== null) {
        shotTime.value = (Date.now() - _shotStartTime.value) / 1000
      }
    }, 100)
  }

  function _stopShotTimer() {
    if (_shotTimerInterval) {
      clearInterval(_shotTimerInterval)
      _shotTimerInterval = null
    }
  }

  function _resetShotTimer() {
    _stopShotTimer()
    _shotStartTime.value = null
    shotTime.value = 0
  }

  // Start/stop shot timer on state transitions
  watch(state, (newState, oldState) => {
    if (newState === oldState) return

    if (FLOWING_STATES.has(newState)) {
      // Entering any flowing state: reset timer. Timer starts via the
      // substate watcher when the machine actually begins pouring (see below).
      _resetShotTimer()
    } else if (FLOWING_STATES.has(oldState)) {
      // Leaving a flowing operation — keep final time visible but stop ticking
      _stopShotTimer()
    }
  })

  // Drive the shot timer from the `pouring` substate. The DE1 transitions
  // preparingForShot → pouring → pouringDone for every flowing operation
  // (espresso, steam, hotWater, flush) — we only tick while the machine is
  // actually dispensing, not during preheat/stabilise or the brief
  // pouringDone handoff. Start on entering pouring, stop on leaving it.
  watch(substate, (newSubstate, oldSubstate) => {
    if (!FLOWING_STATES.has(state.value)) return
    if (newSubstate === 'pouring' && _shotStartTime.value === null) {
      _startShotTimer()
    } else if (oldSubstate === 'pouring' && newSubstate !== 'pouring') {
      _stopShotTimer()
    }
  })

  // ---- Connection management ------------------------------------------------

  function connect() {
    // Fetch current state via REST so the UI reflects the machine's state
    // immediately, without waiting for the first WebSocket frame.
    getMachineState().then(onMessage).catch(() => {})

    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/machine/snapshot`,
      onMessage
    )
    ws.onConnectionChange = (connected) => {
      isConnected.value = connected
      if (!connected) {
        // Reset state so the UI doesn't stay interactive against an
        // unreachable machine (keyboard shortcuts, buttons, etc.)
        state.value = 'unknown'
        substate.value = 'unknown'
        _stopShotTimer()
      }
    }
    ws.connect()
  }

  function disconnect() {
    ws?.close()
    ws = null
    isConnected.value = false
    _stopShotTimer()
  }

  /**
   * Request a machine state change (e.g. "espresso", "steam", "idle", "sleeping").
   */
  function requestState(newState) {
    return setMachineState(newState)
  }

  /** Skip to the next profile step during espresso. */
  function skipStep() {
    return setMachineState('skipStep')
  }

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    // connection
    isConnected,
    // state
    state,
    substate,
    previousState,
    previousSubstate,
    snapshot,
    timestamp,
    // derived states
    isReady,
    isHeating,
    isFlowing,
    isOperating,
    isSleeping,
    phase,
    // shot timer
    shotTime,
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
    skipStep,
    connect,
    disconnect,
  }
}
