/**
 * Normalize shot data from any supported format into the flat arrays
 * expected by the chart: { elapsed, pressure, targetPressure, flow,
 * targetFlow, temperature, targetTemperature, weight, phaseMarkers }.
 *
 * Trims the record to the actual shot — i.e. preinfusion + pouring (+ a
 * trailing pouringDone sample). The gateway includes preparingForShot
 * samples at the head (preheat) and idle samples at the tail (post-shot
 * weight settling); without trimming, those bloat the x axis and pull
 * weight/flow into weird-looking ramps. Trimming uses `machine.state.substate`
 * and silently no-ops when the field is missing (older / flat records).
 */
const SHOT_SUBSTATES = new Set(['preinfusion', 'pouring', 'pouringDone'])

function findShotRange(measurements) {
  let start = -1, end = -1
  for (let i = 0; i < measurements.length; i++) {
    const sub = measurements[i]?.machine?.state?.substate
    if (sub != null && SHOT_SUBSTATES.has(sub)) {
      if (start === -1) start = i
      end = i
    }
  }
  if (start === -1) return null
  return { start, end }
}

export function normalizeShotData(shot) {
  if (!shot) return null

  // Already in flat format — use directly
  if (shot.elapsed?.length) return shot

  // Measurements array format
  const measurements = shot.measurements
  if (!Array.isArray(measurements) || measurements.length === 0) return null

  const range = findShotRange(measurements)
  const startIdx = range ? range.start : 0
  const endIdx = range ? range.end : measurements.length - 1

  const elapsed = []
  const pressure = []
  const targetPressure = []
  const flow = []
  const targetFlow = []
  const temperature = []
  const targetTemperature = []
  const weight = []

  // Determine base timestamp for elapsed time calculation — anchored at the
  // first shot sample (post-preheat) so t=0 lines up with the espresso timer.
  const first = measurements[startIdx]
  let baseTime = 0
  if (first.timestamp != null) {
    const parsed = typeof first.timestamp === 'string' ? new Date(first.timestamp).getTime() : Number(first.timestamp)
    // If timestamp is in seconds (< 1e12), treat as seconds; otherwise milliseconds
    baseTime = parsed > 1e12 ? parsed / 1000 : parsed
  } else if (first.machine?.timestamp != null) {
    const parsed = typeof first.machine.timestamp === 'string' ? new Date(first.machine.timestamp).getTime() : Number(first.machine.timestamp)
    baseTime = parsed > 1e12 ? parsed / 1000 : parsed
  }

  // Track profile frame changes for phase markers
  const phaseMarkers = []
  let lastFrame = null

  for (let i = startIdx; i <= endIdx; i++) {
    const m = measurements[i]

    // Calculate elapsed time
    let t = 0
    const tsRaw = m.timestamp ?? m.machine?.timestamp
    if (m.elapsed != null) {
      t = Number(m.elapsed)
    } else if (tsRaw != null) {
      const parsed = typeof tsRaw === 'string' ? new Date(tsRaw).getTime() : Number(tsRaw)
      const seconds = parsed > 1e12 ? parsed / 1000 : parsed
      t = seconds - baseTime
    } else {
      // Fallback: assume ~10Hz sample rate
      t = (i - startIdx) * 0.1
    }
    elapsed.push(t)

    // Detect nested (machine/scale) vs flat entries
    const hasMachine = m.machine != null && typeof m.machine === 'object'
    const hasScale = m.scale != null && typeof m.scale === 'object'

    if (hasMachine) {
      const mc = m.machine
      pressure.push(mc.pressure ?? 0)
      targetPressure.push(mc.targetPressure ?? 0)
      flow.push(mc.flow ?? 0)
      targetFlow.push(mc.targetFlow ?? 0)
      temperature.push(mc.mixTemperature ?? mc.groupTemperature ?? 0)
      targetTemperature.push(mc.targetMixTemperature ?? mc.targetGroupTemperature ?? 0)

      // Phase markers from profileFrame changes
      const frame = mc.profileFrame
      if (frame != null && frame !== lastFrame) {
        const label = lastFrame == null ? 'Start' : `Frame ${frame}`
        phaseMarkers.push({ time: t, label })
        lastFrame = frame
      }
    } else {
      // Flat measurement entry
      pressure.push(m.pressure ?? 0)
      targetPressure.push(m.targetPressure ?? 0)
      flow.push(m.flow ?? 0)
      targetFlow.push(m.targetFlow ?? 0)
      temperature.push(m.mixTemperature ?? m.temperature ?? m.groupTemperature ?? 0)
      targetTemperature.push(m.targetMixTemperature ?? m.targetTemperature ?? m.targetGroupTemperature ?? 0)

      // Phase markers from profileFrame changes (flat)
      const frame = m.profileFrame
      if (frame != null && frame !== lastFrame) {
        const label = lastFrame == null ? 'Start' : `Frame ${frame}`
        phaseMarkers.push({ time: t, label })
        lastFrame = frame
      }
    }

    if (hasScale) {
      weight.push(m.scale.weight ?? 0)
    } else {
      weight.push(m.weight ?? 0)
    }
  }

  // Add end marker
  if (elapsed.length > 0) {
    phaseMarkers.push({ time: elapsed[elapsed.length - 1], label: 'End' })
  }

  return {
    elapsed,
    pressure,
    targetPressure,
    flow,
    targetFlow,
    temperature,
    targetTemperature,
    weight,
    phaseMarkers: phaseMarkers.length > 1 ? phaseMarkers : (shot.phaseMarkers ?? []),
  }
}
