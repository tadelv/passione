<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { createShotChartOpts, COLORS } from '../composables/useChartConfig.js'

const props = defineProps({
  /** uPlot-compatible data: [time[], p[], pGoal[], f[], fGoal[], t[], tGoal[], w[]] */
  data: { type: Array, required: true },
  /**
   * P1-7: Frame markers — array of { time, label, pump }
   * time: elapsed seconds when frame transitioned
   * label: transition reason code e.g. '[W]', '[P]', '[F]', '[T]'
   * pump: 'pressure' or 'flow' — pump mode for this frame
   */
  frameMarkers: { type: Array, default: () => [] },
  /** P1-9: Whether to show the legend overlay */
  showLegend: { type: Boolean, default: true },
})

const chartEl = ref(null)
let chart = null
let resizeObserver = null
let resizeTimer = null

// P6-5: RAF throttling — buffer data, only call setData once per animation frame
let pendingData = null
let rafId = null

function scheduleRedraw() {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    if (chart && pendingData) {
      chart.setData(pendingData)
      pendingData = null
    }
  })
}

// P1-7: Store frame marker info for the draw hook
const markersRef = computed(() => props.frameMarkers)

function initChart() {
  if (!chartEl.value) return
  const rect = chartEl.value.getBoundingClientRect()
  const w = Math.floor(rect.width) || 400
  const h = Math.floor(rect.height) || 300

  const opts = createShotChartOpts(w, h)

  // P1-7: Add draw hook for frame markers and pump mode bars
  opts.hooks = {
    draw: [drawPhaseOverlays],
  }

  // Start with empty data if none provided yet
  const initial = props.data && props.data[0]?.length
    ? props.data
    : [[], [], [], [], [], [], [], [], []]

  chart = new uPlot(opts, initial, chartEl.value)
}

/**
 * P1-7: uPlot draw hook — renders frame transition vertical lines,
 * phase labels at top, and pump mode indicator bars at bottom.
 */
function drawPhaseOverlays(u) {
  const markers = markersRef.value
  if (!markers || markers.length === 0) return

  const ctx = u.ctx
  const { left, top, width, height } = u.bbox

  // Need the x scale range to compute pixel positions
  const xMin = u.scales.x.min ?? 0
  const xMax = u.scales.x.max ?? 1

  ctx.save()

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    const x = left + ((marker.time - xMin) / (xMax - xMin)) * width

    // Skip markers outside visible range
    if (x < left || x > left + width) continue

    // Calculate bar width to next marker or end of data
    const nextTime = i + 1 < markers.length ? markers[i + 1].time : xMax
    const barW = ((nextTime - marker.time) / (xMax - xMin)) * width

    // Pump mode indicator bar at bottom (4px)
    if (barW > 0) {
      ctx.fillStyle = marker.pump === 'flow' ? COLORS.flow : COLORS.pressure
      ctx.globalAlpha = 0.7
      ctx.fillRect(x, top + height - 4, Math.max(barW, 1), 4)
      ctx.globalAlpha = 1
    }

    // Vertical boundary line at frame transition
    if (i > 0) {
      ctx.strokeStyle = COLORS.marker
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, top + height)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Phase label at top of chart
    if (marker.label) {
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.6)' // ~color-text at 60% opacity (canvas can't use CSS vars)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(marker.label, x + Math.min(barW / 2, 20), top + 2)
    }
  }

  ctx.restore()
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

// P6-5: Watch for new data and push to uPlot via RAF throttle.
// At ~10Hz WebSocket rate, this coalesces updates to display refresh rate.
watch(() => props.data, (newData) => {
  if (!chart) return
  if (newData && newData[0]?.length) {
    pendingData = newData
    scheduleRedraw()
  }
})

// Redraw when frame markers change
watch(() => props.frameMarkers, () => {
  if (chart) chart.redraw()
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
  // P6-5: Cancel pending RAF
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  pendingData = null
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
  <div class="shot-graph">
    <div ref="chartEl" class="shot-graph__canvas" role="img" aria-label="Shot graph showing pressure, flow, temperature, and weight over time"></div>

    <!-- P1-9: Custom legend overlay in top-left corner -->
    <div v-if="showLegend" class="shot-graph__legend-overlay">
      <span class="shot-graph__legend-item">
        <span class="shot-graph__dot" :style="{ background: COLORS.pressure }"></span>
        Pressure
      </span>
      <span class="shot-graph__legend-item">
        <span class="shot-graph__dot" :style="{ background: COLORS.flow }"></span>
        Flow
      </span>
      <span class="shot-graph__legend-item">
        <span class="shot-graph__dot" :style="{ background: COLORS.temperature }"></span>
        Temp
      </span>
      <span class="shot-graph__legend-item">
        <span class="shot-graph__dot" :style="{ background: COLORS.weight }"></span>
        Weight
      </span>
      <span class="shot-graph__legend-item">
        <span class="shot-graph__dot" :style="{ background: COLORS.weightFlow }"></span>
        Wt Flow
      </span>
    </div>
  </div>
</template>

<style scoped>
.shot-graph {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.shot-graph__canvas {
  flex: 1 1 0;
  min-height: 0;
}

/* Override uPlot's default background to be transparent (chart sits on page bg) */
.shot-graph__canvas :deep(.u-wrap) {
  background: transparent !important;
}

/* P1-9: Legend overlay in top-left corner of the chart */
.shot-graph__legend-overlay {
  position: absolute;
  top: 8px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 10px;
  background: var(--color-overlay-scrim);
  border-radius: 6px;
  pointer-events: none;
  z-index: var(--z-chart);
}

.shot-graph__legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.shot-graph__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
