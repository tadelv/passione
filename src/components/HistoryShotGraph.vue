<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { createShotChartOpts, COLORS } from '../composables/useChartConfig.js'

const props = defineProps({
  /**
   * Shot data from GET /api/v1/shots/{id}.
   *
   * Supported shapes:
   *
   * 1) Pre-flattened (Streamline-Bridge flat format):
   *    { elapsed[], pressure[], targetPressure[], flow[], targetFlow[],
   *      temperature[], targetTemperature[], weight[], phaseMarkers?[] }
   *
   * 2) Measurements array (nested machine/scale sub-objects):
   *    { measurements: [{ timestamp, machine: { pressure, flow, mixTemperature,
   *      targetPressure, targetFlow, targetMixTemperature, profileFrame, ... },
   *      scale: { weight }, volume }, ...] }
   *
   * 3) Measurements array (flat entries):
   *    { measurements: [{ timestamp, pressure, flow, mixTemperature, weight, ... }, ...] }
   */
  shot: { type: Object, default: null },
})

const chartEl = ref(null)
let chart = null
let resizeObserver = null
let resizeTimer = null

/**
 * Normalize shot data from any supported format into the flat arrays
 * expected by the chart: { elapsed, pressure, targetPressure, flow,
 * targetFlow, temperature, targetTemperature, weight, phaseMarkers }.
 */
function normalizeShotData(shot) {
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

function shotToData(shot) {
  const normalized = normalizeShotData(shot)
  if (!normalized || !normalized.elapsed?.length) return null

  return [
    normalized.elapsed,
    normalized.pressure ?? normalized.elapsed.map(() => 0),
    normalized.targetPressure ?? normalized.elapsed.map(() => 0),
    normalized.flow ?? normalized.elapsed.map(() => 0),
    normalized.targetFlow ?? normalized.elapsed.map(() => 0),
    normalized.temperature ?? normalized.elapsed.map(() => 0),
    normalized.targetTemperature ?? normalized.elapsed.map(() => 0),
    normalized.weight ?? normalized.elapsed.map(() => 0),
  ]
}

// Keep a ref to the normalized data so drawMarkers can access phase markers
// that were derived from the measurements array normalization.
let normalizedShot = null

/**
 * uPlot draw hook: render phase marker vertical lines and labels.
 */
function drawMarkers(u) {
  const markers = normalizedShot?.phaseMarkers ?? props.shot?.phaseMarkers
  if (!markers?.length) return

  const ctx = u.ctx
  const { left, top, width, height } = u.bbox

  ctx.save()

  for (const marker of markers) {
    if (marker.label === 'Start') continue
    const x = u.valToPos(marker.time, 'x', true)
    if (x < left || x > left + width) continue

    // Vertical dotted line
    ctx.strokeStyle = marker.label === 'End' ? '#FF6B6B' : COLORS.marker
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, top + height)
    ctx.stroke()
    ctx.setLineDash([])

    // Label
    let label = marker.label
    if (marker.transitionReason && marker.label !== 'End') {
      const suffixes = { weight: ' [W]', pressure: ' [P]', flow: ' [F]', time: ' [T]' }
      label += suffixes[marker.transitionReason] || ''
    }

    ctx.save()
    ctx.translate(x + 4, top + 12)
    ctx.rotate(-Math.PI / 2)
    ctx.font = marker.label === 'End' ? 'bold 11px system-ui' : '11px system-ui'
    ctx.fillStyle = marker.label === 'End' ? '#FF6B6B' : 'rgba(255,255,255,0.7)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 0, 0)
    ctx.restore()
  }

  ctx.restore()
}

function initChart() {
  if (!chartEl.value) return
  const rect = chartEl.value.getBoundingClientRect()
  const w = Math.floor(rect.width) || 400
  const h = Math.floor(rect.height) || 300

  const opts = createShotChartOpts(w, h, { interactive: true })

  // Add marker drawing hook
  opts.hooks = { draw: [drawMarkers] }

  // Normalize shot data (handles measurements array + flat formats)
  normalizedShot = normalizeShotData(props.shot)
  const d = shotToData(props.shot)
  if (d) {
    const maxTime = d[0][d[0].length - 1] || 60
    opts.scales.x = { time: false, min: 0, max: maxTime + 2 }

    // Auto-fit weight scale
    const maxWeight = Math.max(10, ...d[7]) * 1.1
    opts.scales.weight = { min: 0, max: maxWeight, auto: false }
  }

  chart = new uPlot(opts, d || [[], [], [], [], [], [], [], []], chartEl.value)
}

function handleResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (!chart || !chartEl.value) return
    const rect = chartEl.value.getBoundingClientRect()
    const w = Math.floor(rect.width)
    const h = Math.floor(rect.height)
    if (w > 0 && h > 0) {
      chart.setSize({ width: w, height: h })
    }
  }, 100)
}

watch(() => props.shot, () => {
  // Destroy and recreate to reset scales/hooks for new shot data
  if (chart) {
    chart.destroy()
    chart = null
  }
  nextTick(initChart)
}, { deep: true })

onMounted(() => {
  nextTick(() => {
    initChart()
    if (chartEl.value) {
      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(chartEl.value)
    }
  })
})

onUnmounted(() => {
  clearTimeout(resizeTimer)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (chart) {
    chart.destroy()
    chart = null
  }
})
</script>

<template>
  <div class="history-shot-graph">
    <div ref="chartEl" class="history-shot-graph__canvas"></div>
    <div class="history-shot-graph__legend">
      <span class="history-shot-graph__legend-item">
        <span class="history-shot-graph__swatch" :style="{ background: COLORS.pressure }"></span>
        Pressure
      </span>
      <span class="history-shot-graph__legend-item">
        <span class="history-shot-graph__swatch" :style="{ background: COLORS.flow }"></span>
        Flow
      </span>
      <span class="history-shot-graph__legend-item">
        <span class="history-shot-graph__swatch" :style="{ background: COLORS.temperature }"></span>
        Temp
      </span>
      <span class="history-shot-graph__legend-item">
        <span class="history-shot-graph__swatch" :style="{ background: COLORS.weight }"></span>
        Weight
      </span>
      <span class="history-shot-graph__legend-sep"></span>
      <span class="history-shot-graph__legend-item history-shot-graph__legend-item--muted">
        <span class="history-shot-graph__swatch history-shot-graph__swatch--dashed"></span>
        target
      </span>
    </div>
  </div>
</template>

<style scoped>
.history-shot-graph {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.history-shot-graph__canvas {
  flex: 1 1 0;
  min-height: 0;
}

.history-shot-graph__canvas :deep(.u-wrap) {
  background: transparent !important;
}

.history-shot-graph__legend {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 8px;
  font-size: var(--font-sm);
  color: var(--text-secondary, #a0a8b8);
}

.history-shot-graph__legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.history-shot-graph__legend-item--muted {
  opacity: 0.6;
}

.history-shot-graph__swatch {
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: 1px;
}

.history-shot-graph__swatch--dashed {
  background: repeating-linear-gradient(
    90deg,
    var(--text-secondary, #a0a8b8) 0px,
    var(--text-secondary, #a0a8b8) 4px,
    transparent 4px,
    transparent 7px
  );
  height: 2px;
}

.history-shot-graph__legend-sep {
  width: 1px;
  height: 12px;
  background: var(--border, #3a3a4e);
}
</style>
