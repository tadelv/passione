<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { createShotChartOpts, COLORS } from '../composables/useChartConfig.js'
import { normalizeShotData } from '../composables/useChartNormalize.js'

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

function shotToData(shot) {
  const normalized = normalizeShotData(shot)
  if (!normalized || !normalized.elapsed?.length) return null

  const w = normalized.weight ?? normalized.elapsed.map(() => 0)
  const e = normalized.elapsed

  // Compute weight flow (g/s) from weight deltas. The raw derivative of a
  // noisy scale signal is jagged, so we run a 5-sample centered moving
  // average over the result. This matches the live EMA smoothing applied
  // in useShotData (during recording) so post-shot graphs read smoothly.
  const rawFlow = e.map((t, i) => {
    if (i === 0) return 0
    const dt = t - e[i - 1]
    const dw = w[i] - w[i - 1]
    return dt > 0.05 ? Math.max(0, dw / dt) : 0
  })
  const window = 5
  const half = Math.floor(window / 2)
  const weightFlow = rawFlow.map((_, i) => {
    let sum = 0
    let n = 0
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < rawFlow.length) {
        sum += rawFlow[k]
        n++
      }
    }
    return n > 0 ? sum / n : 0
  })

  return [
    e,
    normalized.pressure ?? e.map(() => 0),
    normalized.targetPressure ?? e.map(() => 0),
    normalized.flow ?? e.map(() => 0),
    normalized.targetFlow ?? e.map(() => 0),
    normalized.temperature ?? e.map(() => 0),
    normalized.targetTemperature ?? e.map(() => 0),
    w,
    weightFlow,
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

  chart = new uPlot(opts, d || [[], [], [], [], [], [], [], [], []], chartEl.value)
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
      <span class="history-shot-graph__legend-item">
        <span class="history-shot-graph__swatch" :style="{ background: COLORS.weightFlow }"></span>
        Wt Flow
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
