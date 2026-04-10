/**
 * Shared uPlot configuration factory for Decenza chart components.
 *
 * Colors from Decenza Theme.qml:
 *   pressure:        #18c37e (solid)   pressureGoal:    #69fdb3 (dashed)
 *   flow:            #4e85f4 (solid)   flowGoal:        #7aaaff (dashed)
 *   temperature:     #e73249 (solid)   temperatureGoal: #ffa5a6 (dashed)
 *   weight:          #a2693d (solid)
 *   grid:            #3a3a4e
 *   surface:         #252538
 *   textSecondary:   #a0a8b8
 */

export const COLORS = {
  pressure:        '#18c37e',
  pressureGoal:    '#69fdb3',
  flow:            '#4e85f4',
  flowGoal:        '#7aaaff',
  temperature:     '#e73249',
  temperatureGoal: '#ffa5a6',
  weight:          '#a2693d',
  weightFlow:      '#d4a76a',
  grid:            '#3a3a4e',
  surface:         '#252538',
  background:      '#1a1a2e',
  text:            '#ffffff',
  textSecondary:   '#a0a8b8',
  accent:          '#e94560',
  marker:          'rgba(255,255,255,0.4)',
}

const LINE_WIDTH = 2.5
const GOAL_LINE_WIDTH = 1.5
const GOAL_DASH = [6, 4]

/**
 * Create uPlot options for live shot charts and history shot charts.
 *
 * Series order must match useShotData.js:
 *   0: time, 1: pressure, 2: targetPressure, 3: flow, 4: targetFlow,
 *   5: temperature, 6: targetTemperature, 7: weight, 8: weightFlow
 */
export function createShotChartOpts(width, height, opts = {}) {
  const { interactive = true } = opts

  return {
    width,
    height,
    padding: [12, 16, 0, 0],
    cursor: {
      show: interactive,
      drag: { x: interactive, y: false },
    },
    select: {
      show: interactive,
    },
    legend: {
      show: false, // We use a custom Vue legend overlay
    },
    axes: [
      // X axis — time in seconds
      {
        stroke: COLORS.textSecondary,
        grid: { stroke: COLORS.grid, width: 1 },
        ticks: { stroke: COLORS.grid, width: 1 },
        values: (u, vals) => vals.map(v => v.toFixed(0) + 's'),
        font: '11px system-ui, sans-serif',
        gap: 6,
      },
      // Left Y axis — pressure (bar) / flow (mL/s)
      {
        stroke: COLORS.textSecondary,
        grid: { stroke: COLORS.grid, width: 1 },
        ticks: { stroke: COLORS.grid, width: 1 },
        values: (u, vals) => vals.map(v => v.toFixed(0)),
        font: '11px system-ui, sans-serif',
        gap: 6,
        scale: 'pressure',
      },
      // Right Y axis — temperature (C)
      {
        side: 1,
        stroke: COLORS.temperature,
        grid: { show: false },
        ticks: { stroke: COLORS.grid, width: 1 },
        values: (u, vals) => vals.map(v => v.toFixed(0) + '\u00b0'),
        font: '11px system-ui, sans-serif',
        gap: 6,
        scale: 'temp',
      },
      // Right Y axis (hidden) — weight (g) — shares right side
      {
        side: 1,
        stroke: COLORS.weight,
        grid: { show: false },
        ticks: { show: false },
        values: (u, vals) => vals.map(v => v.toFixed(0) + 'g'),
        font: '11px system-ui, sans-serif',
        gap: 6,
        scale: 'weight',
        show: false,
      },
    ],
    scales: {
      x: { time: false },
      pressure: { min: 0, max: 12, auto: false },
      temp: { min: 80, max: 100, auto: false },
      weight: { min: 0, max: 50, auto: true },
    },
    series: [
      // 0: time (x axis — no config needed beyond label)
      {},
      // 1: pressure (actual)
      {
        label: 'Pressure',
        stroke: COLORS.pressure,
        width: LINE_WIDTH,
        scale: 'pressure',
        value: (u, v) => v != null ? v.toFixed(1) + ' bar' : '--',
      },
      // 2: targetPressure (goal)
      {
        label: 'P Goal',
        stroke: COLORS.pressureGoal,
        width: GOAL_LINE_WIDTH,
        dash: GOAL_DASH,
        scale: 'pressure',
        value: (u, v) => v != null ? v.toFixed(1) : '--',
      },
      // 3: flow (actual)
      {
        label: 'Flow',
        stroke: COLORS.flow,
        width: LINE_WIDTH,
        scale: 'pressure',
        value: (u, v) => v != null ? v.toFixed(1) + ' mL/s' : '--',
      },
      // 4: targetFlow (goal)
      {
        label: 'F Goal',
        stroke: COLORS.flowGoal,
        width: GOAL_LINE_WIDTH,
        dash: GOAL_DASH,
        scale: 'pressure',
        value: (u, v) => v != null ? v.toFixed(1) : '--',
      },
      // 5: temperature (actual)
      {
        label: 'Temp',
        stroke: COLORS.temperature,
        width: LINE_WIDTH,
        scale: 'temp',
        value: (u, v) => v != null ? v.toFixed(1) + '\u00b0C' : '--',
      },
      // 6: targetTemperature (goal)
      {
        label: 'T Goal',
        stroke: COLORS.temperatureGoal,
        width: GOAL_LINE_WIDTH,
        dash: GOAL_DASH,
        scale: 'temp',
        value: (u, v) => v != null ? v.toFixed(1) : '--',
      },
      // 7: weight
      {
        label: 'Weight',
        stroke: COLORS.weight,
        width: LINE_WIDTH,
        scale: 'weight',
        value: (u, v) => v != null ? v.toFixed(1) + ' g' : '--',
      },
      // 8: weightFlow (g/s from scale)
      {
        label: 'Weight Flow',
        stroke: COLORS.weightFlow,
        width: LINE_WIDTH - 0.5,
        scale: 'pressure',
        value: (u, v) => v != null ? v.toFixed(1) + ' g/s' : '--',
      },
    ],
  }
}

/**
 * Create uPlot options for static profile visualization.
 *
 * Series:
 *   0: time, 1: pressure, 2: flow, 3: temperature
 *
 * Profile graphs show target/goal curves only (dashed), since there is
 * no actual measured data — this is a preview of what the profile will do.
 */
export function createProfileChartOpts(width, height) {
  return {
    width,
    height,
    padding: [12, 16, 0, 0],
    cursor: {
      show: true,
      drag: { x: false, y: false },
    },
    select: { show: false },
    legend: { show: false },
    axes: [
      // X — time (s)
      {
        stroke: COLORS.textSecondary,
        grid: { stroke: COLORS.grid, width: 1 },
        ticks: { stroke: COLORS.grid, width: 1 },
        values: (u, vals) => vals.map(v => v.toFixed(0) + 's'),
        font: '11px system-ui, sans-serif',
        gap: 6,
      },
      // Left Y — pressure / flow
      {
        stroke: COLORS.textSecondary,
        grid: { stroke: COLORS.grid, width: 1 },
        ticks: { stroke: COLORS.grid, width: 1 },
        values: (u, vals) => vals.map(v => v.toFixed(0)),
        font: '11px system-ui, sans-serif',
        gap: 6,
        scale: 'pressure',
      },
      // Right Y — temperature
      {
        side: 1,
        stroke: COLORS.temperature,
        grid: { show: false },
        ticks: { stroke: COLORS.grid, width: 1 },
        values: (u, vals) => vals.map(v => v.toFixed(0) + '\u00b0'),
        font: '11px system-ui, sans-serif',
        gap: 6,
        scale: 'temp',
      },
    ],
    scales: {
      x: { time: false },
      pressure: { min: 0, max: 12, auto: false },
      temp: { min: 80, max: 100, auto: false },
    },
    series: [
      // 0: time
      {},
      // 1: pressure target curve
      {
        label: 'Pressure',
        stroke: COLORS.pressureGoal,
        width: LINE_WIDTH,
        dash: GOAL_DASH,
        scale: 'pressure',
        value: (u, v) => v != null ? v.toFixed(1) + ' bar' : '--',
      },
      // 2: flow target curve
      {
        label: 'Flow',
        stroke: COLORS.flowGoal,
        width: LINE_WIDTH,
        dash: GOAL_DASH,
        scale: 'pressure',
        value: (u, v) => v != null ? v.toFixed(1) + ' mL/s' : '--',
      },
      // 3: temperature target curve
      {
        label: 'Temp',
        stroke: COLORS.temperatureGoal,
        width: LINE_WIDTH - 0.5,
        dash: GOAL_DASH,
        scale: 'temp',
        value: (u, v) => v != null ? v.toFixed(1) + '\u00b0C' : '--',
      },
    ],
  }
}

/**
 * Build uPlot data arrays from a profile's frames for ProfileGraph.
 *
 * Frames have: { name, seconds, pump ('pressure'|'flow'), pressure, flow,
 *                temperature, transition ('fast'|'smooth') }
 *
 * Returns [time[], pressure[], flow[], temperature[]] where pressure and flow
 * use null for segments where the pump is in the other mode, producing
 * disconnected curve segments.
 */
export function profileFramesToData(frames) {
  if (!frames || frames.length === 0) return [[], [], [], []]

  const time = []
  const pressure = []
  const flow = []
  const temperature = []

  let t = 0

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const dur = frame.seconds || 0
    const isSmooth = frame.transition === 'smooth'
    const prevFrame = i > 0 ? frames[i - 1] : null

    // Determine start values for smooth transitions
    const prevSamePump = prevFrame && prevFrame.pump === frame.pump

    // Start point
    if (frame.pump === 'pressure') {
      const startVal = isSmooth && prevSamePump ? (prevFrame.pressure ?? 0) : (frame.pressure ?? 0)
      time.push(t)
      pressure.push(startVal)
      flow.push(null)
      temperature.push(isSmooth && prevFrame ? (prevFrame.temperature ?? frame.temperature) : frame.temperature)

      // End point
      time.push(t + dur)
      pressure.push(frame.pressure ?? 0)
      flow.push(null)
      temperature.push(frame.temperature)
    } else {
      // flow mode
      const startVal = isSmooth && prevSamePump ? (prevFrame.flow ?? 0) : (frame.flow ?? 0)
      time.push(t)
      pressure.push(null)
      flow.push(startVal)
      temperature.push(isSmooth && prevFrame ? (prevFrame.temperature ?? frame.temperature) : frame.temperature)

      // End point
      time.push(t + dur)
      pressure.push(null)
      flow.push(frame.flow ?? 0)
      temperature.push(frame.temperature)
    }

    t += dur
  }

  return [time, pressure, flow, temperature]
}
