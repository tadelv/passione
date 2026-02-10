import { ref, shallowRef } from 'vue'

/**
 * Rolling buffer for real-time shot data, compatible with uPlot's data format.
 *
 * uPlot expects data as an array of arrays:
 *   [ timestamps[], series1[], series2[], ... ]
 *
 * Series indices (keep in sync with useChartConfig.js):
 *   0 - time (elapsed seconds)
 *   1 - pressure
 *   2 - targetPressure
 *   3 - flow
 *   4 - targetFlow
 *   5 - mixTemperature
 *   6 - targetMixTemperature
 *   7 - weight
 */

const MAX_POINTS = 500

export function useShotData() {
  const shotStartTime = ref(null)
  const isRecording = ref(false)

  // Internal typed arrays for performance — we pre-allocate and track length.
  // On export we slice to the actual length.
  let len = 0
  const buf = {
    time: new Float64Array(MAX_POINTS),
    pressure: new Float64Array(MAX_POINTS),
    targetPressure: new Float64Array(MAX_POINTS),
    flow: new Float64Array(MAX_POINTS),
    targetFlow: new Float64Array(MAX_POINTS),
    temperature: new Float64Array(MAX_POINTS),
    targetTemperature: new Float64Array(MAX_POINTS),
    weight: new Float64Array(MAX_POINTS),
  }

  // Shallow ref — we replace the value on each update so uPlot picks up the change.
  const data = shallowRef(emptyData())

  function emptyData() {
    return [[], [], [], [], [], [], [], []]
  }

  function reset() {
    len = 0
    shotStartTime.value = null
    isRecording.value = false
    data.value = emptyData()
  }

  /**
   * Start recording a new shot. Call this when the machine enters espresso state.
   * @param {number} [startTimestamp] - Optional epoch ms; defaults to Date.now()
   */
  function start(startTimestamp) {
    len = 0
    shotStartTime.value = startTimestamp ?? Date.now()
    isRecording.value = true
    data.value = emptyData()
  }

  /**
   * Add a data point from a machine snapshot (and optional scale snapshot).
   * @param {object} machineSnapshot - From ws/v1/machine/snapshot
   * @param {object} [scaleSnapshot]  - From ws/v1/scale/snapshot
   */
  function addPoint(machineSnapshot, scaleSnapshot) {
    if (!isRecording.value || shotStartTime.value === null) return

    const now = Date.now()
    const elapsed = (now - shotStartTime.value) / 1000

    // If buffer is full, shift everything left by 1 (drop oldest point).
    if (len >= MAX_POINTS) {
      for (const key of Object.keys(buf)) {
        buf[key].copyWithin(0, 1)
      }
      len = MAX_POINTS - 1
    }

    buf.time[len] = elapsed
    buf.pressure[len] = machineSnapshot.pressure ?? 0
    buf.targetPressure[len] = machineSnapshot.targetPressure ?? 0
    buf.flow[len] = machineSnapshot.flow ?? 0
    buf.targetFlow[len] = machineSnapshot.targetFlow ?? 0
    buf.temperature[len] = machineSnapshot.mixTemperature ?? 0
    buf.targetTemperature[len] = machineSnapshot.targetMixTemperature ?? 0
    buf.weight[len] = scaleSnapshot?.weight ?? 0
    len++

    // Build uPlot-compatible array of arrays (plain JS arrays sliced from typed arrays).
    data.value = [
      Array.from(buf.time.subarray(0, len)),
      Array.from(buf.pressure.subarray(0, len)),
      Array.from(buf.targetPressure.subarray(0, len)),
      Array.from(buf.flow.subarray(0, len)),
      Array.from(buf.targetFlow.subarray(0, len)),
      Array.from(buf.temperature.subarray(0, len)),
      Array.from(buf.targetTemperature.subarray(0, len)),
      Array.from(buf.weight.subarray(0, len)),
    ]
  }

  /**
   * Stop recording.
   */
  function stop() {
    isRecording.value = false
  }

  /**
   * Get the current elapsed time in seconds (or 0 if not recording).
   */
  function elapsed() {
    if (shotStartTime.value === null) return 0
    return (Date.now() - shotStartTime.value) / 1000
  }

  return {
    data,
    isRecording,
    shotStartTime,
    start,
    stop,
    addPoint,
    reset,
    elapsed,
  }
}
