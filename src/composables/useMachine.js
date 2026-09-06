/**
 * Composable for real-time machine snapshot data.
 *
 * Connects to ws/v1/machine/snapshot (~10 Hz) and exposes reactive refs
 * for all telemetry fields plus derived state flags for easy consumption.
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'
import { setMachineState } from '../api/rest'
import { setBootReadyTrigger } from './useBootReady'

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

  // Resolves on the first snapshot from the gateway. Boot-quiet consumers
  // (last-shot card, presence sync, update check) await this so they don't
  // pile onto the cold-start HTTP burst that competes with BLE on Teclast.
  let _firstFrameResolve = null
  const firstFrame = new Promise((resolve) => { _firstFrameResolve = resolve })
  setBootReadyTrigger(firstFrame)

  function onMessage(data) {
    if (_firstFrameResolve) {
      _firstFrameResolve(data)
      _firstFrameResolve = null
    }
    snapshot.value = data
    timestamp.value = data.timestamp ?? null

    if (data.state) {
      const newState = data.state.state ?? 'unknown'
      const newSubstate = data.state.substate ?? 'unknown'
      const oldState = state.value
      const oldSubstate = substate.value

      // Track previous state for transition detection
      if (newState !== oldState) {
        previousState.value = oldState
      }
      if (newSubstate !== oldSubstate) {
        previousSubstate.value = oldSubstate
      }

      state.value = newState
      substate.value = newSubstate

      // Drive the shot timer from a single coherent view of state + substate.
      // Unlike the old split state/substate watchers, this also sees direct
      // different-operation transitions that leave the substate unchanged
      // (e.g. steam/pouring → hotWater/pouring).
      _onFlowChange(newState, newSubstate, oldState)
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
  // One coherent handler (_onFlowChange) watches state + substate together. It
  // is driven from onMessage (where both change atomically) rather than from
  // two separate Vue watchers so that a direct different-operation transition
  // that leaves the substate unchanged (operation A/pouring → B/pouring) is
  // not lost.
  //
  // Rules:
  //  - Entering a NEW flowing operation (the machine state value changed)
  //    resets the clock — including a direct A → B hand-off where the substate
  //    is unchanged.
  //  - Espresso starts ticking at `preinfusion` (or at `pouring` when
  //    preinfusion is skipped) and runs continuously across preinfusion →
  //    pouring (no reset).
  //  - Steam/hotWater/flush tick only from `pouring`.
  //  - `preparingForShot` preheat never ticks.
  //  - Ticking freezes at `pouringDone` or when the operation exits, and the
  //    frozen value is the exact final elapsed (not a stale last-100ms tick).
  //  - Elapsed is anchored on performance.now() (monotonic) so OS/NTP clock
  //    adjustments cannot step the displayed time backward/forward.

  function _startShotTimer() {
    _stopShotTimer()
    _shotStartTime.value = performance.now()
    shotTime.value = 0
    _shotTimerInterval = setInterval(() => {
      if (_shotStartTime.value !== null) {
        shotTime.value = (performance.now() - _shotStartTime.value) / 1000
      }
    }, 100)
  }

  function _stopShotTimer() {
    if (_shotTimerInterval) {
      clearInterval(_shotTimerInterval)
      _shotTimerInterval = null
    }
  }

  // Freeze at the exact final elapsed (rather than the last 100ms tick) and
  // clear the anchor so a later exit transition cannot add idle time to the
  // frozen value. No-op when nothing is running.
  function _freezeShotTimer() {
    if (_shotStartTime.value !== null) {
      shotTime.value = (performance.now() - _shotStartTime.value) / 1000
    }
    _stopShotTimer()
    _shotStartTime.value = null
  }

  function _resetShotTimer() {
    _stopShotTimer()
    _shotStartTime.value = null
    shotTime.value = 0
  }

  // True when the given operation is actively dispensing and should tick.
  // Espresso counts from preinfusion (with pouring as the fallback when
  // preinfusion is skipped); steam/hotWater/flush count only from pouring.
  function _isExtracting(stateName, substateName) {
    if (stateName === 'espresso') {
      return substateName === 'preinfusion' || substateName === 'pouring'
    }
    return substateName === 'pouring'
  }

  // Coherent state + substate transition handler (called from onMessage with
  // the previous snapshot's machine state).
  function _onFlowChange(newState, newSubstate, oldState) {
    if (!FLOWING_STATES.has(newState)) {
      // Not in a flowing operation — settle any running clock at its exact
      // final elapsed. No-op when the operation never started ticking.
      _freezeShotTimer()
      return
    }

    // Entering a flowing operation. A different machine-state value means a NEW
    // operation — including a direct operation A → operation B hand-off whose
    // substate may be unchanged (steam/pouring → hotWater/pouring). Reset the
    // clock so B measures only its own extraction. Transitions that stay within
    // one operation (espresso preinfusion → pouring) keep the same state value
    // and therefore do not reset.
    if (oldState !== newState) {
      _resetShotTimer()
    }

    // Start ticking once this operation reaches active extraction. If already
    // started and still extracting, do nothing (repeated snapshots and the
    // espresso preinfusion → pouring roll-over must not reset). If it reached
    // a terminal/non-extracting substate (pouringDone), freeze the exact final.
    if (_isExtracting(newState, newSubstate)) {
      if (_shotStartTime.value === null) _startShotTimer()
    } else if (_shotStartTime.value !== null) {
      _freezeShotTimer()
    }
  }

  // ---- Connection management ------------------------------------------------

  function connect() {
    // The first WebSocket frame arrives within ~100 ms and carries the same
    // payload as `getMachineState()`, so the parallel REST GET that used to
    // sit here was just doubling the cold-start request count. Removed —
    // consumers that need machine state before the first frame can `await
    // firstFrame` instead.

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
    firstFrame,
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
