/**
 * Normalize shot data from any supported format into the flat arrays
 * expected by the chart: { elapsed, pressure, targetPressure, flow,
 * targetFlow, temperature, targetTemperature, weight, phaseMarkers }.
 */
export function normalizeShotData(shot) {
  if (!shot) return null

  // Already in flat format — use directly
  if (shot.elapsed?.length) return shot

  // Measurements array format
  const measurements = shot.measurements
  if (!Array.isArray(measurements) || measurements.length === 0) return null

  const elapsed = []
  const pressure = []
  const targetPressure = []
  const flow = []
  const targetFlow = []
  const temperature = []
  const targetTemperature = []
  const weight = []

  // Determine base timestamp for elapsed time calculation
  const first = measurements[0]
  let baseTime = 0
  if (first.timestamp != null) {
    const parsed = typeof first.timestamp === 'string' ? new Date(first.timestamp).getTime() : Number(first.timestamp)
    // If timestamp is in seconds (< 1e12), treat as seconds; otherwise milliseconds
    baseTime = parsed > 1e12 ? parsed / 1000 : parsed
  }

  // Track profile frame changes for phase markers
  const phaseMarkers = []
  let lastFrame = null

  for (let i = 0; i < measurements.length; i++) {
    const m = measurements[i]

    // Calculate elapsed time
    let t = 0
    if (m.elapsed != null) {
      t = Number(m.elapsed)
    } else if (m.timestamp != null) {
      const parsed = typeof m.timestamp === 'string' ? new Date(m.timestamp).getTime() : Number(m.timestamp)
      const seconds = parsed > 1e12 ? parsed / 1000 : parsed
      t = seconds - baseTime
    } else {
      // Fallback: assume ~10Hz sample rate
      t = i * 0.1
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
