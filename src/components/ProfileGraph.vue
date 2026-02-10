<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import {
  createProfileChartOpts,
  profileFramesToData,
  COLORS,
} from '../composables/useChartConfig.js'

const props = defineProps({
  /** Profile object with a `frames` array */
  profile: { type: Object, default: null },
  /** Optional: index of the selected frame (-1 = none) */
  selectedFrame: { type: Number, default: -1 },
})

const emit = defineEmits(['frame-selected'])

const chartEl = ref(null)
let chart = null
let resizeObserver = null
let resizeTimer = null

const frames = computed(() => props.profile?.frames ?? [])

const chartData = computed(() => profileFramesToData(frames.value))

/**
 * Compute cumulative frame boundaries (start times) for overlay rendering.
 */
const frameBoundaries = computed(() => {
  const boundaries = []
  let t = 0
  for (const f of frames.value) {
    boundaries.push({ start: t, duration: f.seconds || 0, name: f.name, pump: f.pump })
    t += f.seconds || 0
  }
  return boundaries
})

const totalDuration = computed(() => {
  let total = 0
  for (const f of frames.value) total += f.seconds || 0
  return Math.max(total, 5)
})

function initChart() {
  if (!chartEl.value) return
  const rect = chartEl.value.getBoundingClientRect()
  const w = Math.floor(rect.width) || 400
  const h = Math.floor(rect.height) || 250

  const opts = createProfileChartOpts(w, h)

  // Override x-axis max to fit profile duration
  opts.scales.x = { time: false, min: 0, max: totalDuration.value * 1.1 }

  // Draw frame boundary lines and pump mode indicators via hooks
  opts.hooks = {
    draw: [drawFrameOverlays],
  }

  const initial = chartData.value[0].length ? chartData.value : [[], [], [], []]
  chart = new uPlot(opts, initial, chartEl.value)
}

/**
 * uPlot draw hook: renders frame boundary lines, labels, and pump-mode bars.
 */
function drawFrameOverlays(u) {
  const ctx = u.ctx
  const { left, top, width, height } = u.bbox
  const xMax = totalDuration.value * 1.1

  ctx.save()

  for (let i = 0; i < frameBoundaries.value.length; i++) {
    const fb = frameBoundaries.value[i]
    const x = left + (fb.start / xMax) * width
    const barW = (fb.duration / xMax) * width

    // Alternating subtle background
    ctx.fillStyle = i === props.selectedFrame
      ? 'rgba(233,69,96,0.2)'
      : i % 2 === 0
        ? 'rgba(255,255,255,0.03)'
        : 'rgba(255,255,255,0.01)'
    ctx.fillRect(x, top, barW, height)

    // Pump mode indicator at bottom
    if (i > 0 || fb.duration > 0) {
      ctx.fillStyle = fb.pump === 'flow' ? COLORS.flow : COLORS.pressure
      ctx.globalAlpha = 0.8
      ctx.fillRect(x, top + height - 4, barW, 4)
      ctx.globalAlpha = 1
    }

    // Vertical boundary line (skip first frame's left edge — that's the axis)
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

    // Frame name label (rotated -90)
    if (fb.name && barW > 14) {
      ctx.save()
      ctx.translate(x + barW / 2, top + 10)
      ctx.rotate(-Math.PI / 2)
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = i === props.selectedFrame ? COLORS.accent : 'rgba(255,255,255,0.7)'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(fb.name, 0, 0)
      ctx.restore()
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

function updateChart() {
  if (!chart) return
  const d = chartData.value
  if (d[0].length) {
    // Update x scale to fit new duration
    chart.scales.x.min = 0
    chart.scales.x.max = totalDuration.value * 1.1
    chart.setData(d)
  }
}

watch(() => props.profile, () => {
  if (chart) {
    updateChart()
    chart.redraw()
  }
}, { deep: true })

watch(() => props.selectedFrame, () => {
  if (chart) chart.redraw()
})

/**
 * Handle clicks on the chart — determine which frame was clicked.
 */
function onChartClick(e) {
  if (!chart || !chartEl.value) return
  const rect = chartEl.value.getBoundingClientRect()
  const clientX = e.clientX - rect.left
  const { left, width } = chart.bbox
  const xMax = totalDuration.value * 1.1
  const clickTime = ((clientX - left) / width) * xMax

  for (let i = 0; i < frameBoundaries.value.length; i++) {
    const fb = frameBoundaries.value[i]
    if (clickTime >= fb.start && clickTime < fb.start + fb.duration) {
      emit('frame-selected', i)
      return
    }
  }
}

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
  <div class="profile-graph">
    <div ref="chartEl" class="profile-graph__canvas" @click="onChartClick"></div>
    <div class="profile-graph__legend">
      <span class="profile-graph__legend-item">
        <span class="profile-graph__swatch profile-graph__swatch--dashed"
              :style="{ '--c': COLORS.pressureGoal }"></span>
        Pressure
      </span>
      <span class="profile-graph__legend-item">
        <span class="profile-graph__swatch profile-graph__swatch--dashed"
              :style="{ '--c': COLORS.flowGoal }"></span>
        Flow
      </span>
      <span class="profile-graph__legend-item">
        <span class="profile-graph__swatch profile-graph__swatch--dashed"
              :style="{ '--c': COLORS.temperatureGoal }"></span>
        Temp
      </span>
    </div>
  </div>
</template>

<style scoped>
.profile-graph {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.profile-graph__canvas {
  flex: 1 1 0;
  min-height: 0;
  cursor: pointer;
}

.profile-graph__canvas :deep(.u-wrap) {
  background: transparent !important;
}

.profile-graph__legend {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-secondary, #a0a8b8);
}

.profile-graph__legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.profile-graph__swatch--dashed {
  display: inline-block;
  width: 14px;
  height: 2px;
  background: repeating-linear-gradient(
    90deg,
    var(--c) 0px,
    var(--c) 4px,
    transparent 4px,
    transparent 7px
  );
}
</style>
