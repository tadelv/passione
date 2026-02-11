<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

const props = defineProps({
  /** Array of shot objects (max 3) */
  shots: { type: Array, default: () => [] },
  /** Which curves to show: { pressure, flow, weight } */
  visibleCurves: {
    type: Object,
    default: () => ({ pressure: true, flow: true, weight: true }),
  },
})

// Distinct color sets per shot
const SHOT_COLORS = [
  { pressure: '#18c37e', flow: '#4e85f4', weight: '#a2693d' },
  { pressure: '#ff8c42', flow: '#9c5bff', weight: '#e73249' },
  { pressure: '#ffd700', flow: '#00bcd4', weight: '#ff6b9d' },
]

const chartEl = ref(null)
let chart = null
let resizeObserver = null
let resizeTimer = null

function buildData() {
  if (!props.shots.length) return null

  // Merge all time points, then interpolate each shot's data
  const allTimes = new Set()
  const shotDatasets = props.shots.map(shot => {
    const elapsed = shot.elapsed ?? []
    for (const t of elapsed) allTimes.add(t)
    return {
      elapsed,
      pressure: shot.pressure ?? [],
      flow: shot.flow ?? [],
      weight: shot.weight ?? [],
    }
  })

  const times = [...allTimes].sort((a, b) => a - b)
  if (times.length === 0) return null

  // For each shot, build series aligned to merged time axis
  const series = []
  for (const ds of shotDatasets) {
    const p = [], f = [], w = []
    for (const t of times) {
      p.push(interpolate(ds.elapsed, ds.pressure, t))
      f.push(interpolate(ds.elapsed, ds.flow, t))
      w.push(interpolate(ds.elapsed, ds.weight, t))
    }
    series.push({ pressure: p, flow: f, weight: w })
  }

  // Build uPlot data array: [time, ...shot1_curves, ...shot2_curves, ...]
  const data = [times]
  for (const s of series) {
    data.push(s.pressure)
    data.push(s.flow)
    data.push(s.weight)
  }
  return data
}

function interpolate(xs, ys, target) {
  if (xs.length === 0) return null
  if (target <= xs[0]) return ys[0] ?? null
  if (target >= xs[xs.length - 1]) return ys[ys.length - 1] ?? null

  for (let i = 1; i < xs.length; i++) {
    if (xs[i] >= target) {
      const t = (target - xs[i - 1]) / (xs[i] - xs[i - 1])
      const v0 = ys[i - 1] ?? 0
      const v1 = ys[i] ?? 0
      return v0 + t * (v1 - v0)
    }
  }
  return null
}

function buildOpts(width, height) {
  const seriesDefs = [{}] // time axis

  for (let i = 0; i < props.shots.length; i++) {
    const colors = SHOT_COLORS[i] || SHOT_COLORS[0]
    const suffix = props.shots.length > 1 ? ` #${i + 1}` : ''

    seriesDefs.push({
      label: `Pressure${suffix}`,
      stroke: colors.pressure,
      width: 2.5,
      scale: 'pressure',
      show: props.visibleCurves.pressure,
    })
    seriesDefs.push({
      label: `Flow${suffix}`,
      stroke: colors.flow,
      width: 2.5,
      scale: 'pressure',
      show: props.visibleCurves.flow,
    })
    seriesDefs.push({
      label: `Weight${suffix}`,
      stroke: colors.weight,
      width: 2.5,
      scale: 'weight',
      show: props.visibleCurves.weight,
    })
  }

  return {
    width,
    height,
    padding: [12, 16, 0, 0],
    cursor: { show: true, drag: { x: true, y: false } },
    select: { show: true },
    legend: { show: false },
    axes: [
      {
        stroke: '#a0a8b8',
        grid: { stroke: '#3a3a4e', width: 1 },
        ticks: { stroke: '#3a3a4e', width: 1 },
        values: (u, vals) => vals.map(v => v.toFixed(0) + 's'),
        font: '11px system-ui, sans-serif',
        gap: 6,
      },
      {
        stroke: '#a0a8b8',
        grid: { stroke: '#3a3a4e', width: 1 },
        ticks: { stroke: '#3a3a4e', width: 1 },
        values: (u, vals) => vals.map(v => v.toFixed(0)),
        font: '11px system-ui, sans-serif',
        gap: 6,
        scale: 'pressure',
      },
      {
        side: 1,
        stroke: '#a2693d',
        grid: { show: false },
        ticks: { show: false },
        values: (u, vals) => vals.map(v => v.toFixed(0) + 'g'),
        font: '11px system-ui, sans-serif',
        gap: 6,
        scale: 'weight',
      },
    ],
    scales: {
      x: { time: false },
      pressure: { min: 0, max: 12, auto: false },
      weight: { min: 0, max: 60, auto: true },
    },
    series: seriesDefs,
  }
}

function initChart() {
  if (!chartEl.value) return
  const rect = chartEl.value.getBoundingClientRect()
  const w = Math.floor(rect.width) || 400
  const h = Math.floor(rect.height) || 300

  const opts = buildOpts(w, h)
  const data = buildData() || [[]]

  chart = new uPlot(opts, data, chartEl.value)
}

function handleResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (!chart || !chartEl.value) return
    const rect = chartEl.value.getBoundingClientRect()
    const w = Math.floor(rect.width)
    const h = Math.floor(rect.height)
    if (w > 0 && h > 0) chart.setSize({ width: w, height: h })
  }, 100)
}

function recreateChart() {
  if (chart) {
    chart.destroy()
    chart = null
  }
  nextTick(initChart)
}

watch(() => props.shots, recreateChart, { deep: true })
watch(() => props.visibleCurves, recreateChart, { deep: true })

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
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (chart) { chart.destroy(); chart = null }
})
</script>

<template>
  <div class="comparison-graph">
    <div ref="chartEl" class="comparison-graph__canvas"></div>
    <!-- Legend -->
    <div class="comparison-graph__legend">
      <template v-for="(shot, i) in shots" :key="i">
        <span class="comparison-graph__legend-group">
          <span class="comparison-graph__legend-label">
            {{ shot.profileName || shot.profile?.title || `Shot ${i + 1}` }}
          </span>
          <span v-if="visibleCurves.pressure" class="comparison-graph__swatch" :style="{ background: SHOT_COLORS[i]?.pressure }"></span>
          <span v-if="visibleCurves.flow" class="comparison-graph__swatch" :style="{ background: SHOT_COLORS[i]?.flow }"></span>
          <span v-if="visibleCurves.weight" class="comparison-graph__swatch" :style="{ background: SHOT_COLORS[i]?.weight }"></span>
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.comparison-graph {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.comparison-graph__canvas {
  flex: 1 1 0;
  min-height: 0;
}

.comparison-graph__canvas :deep(.u-wrap) {
  background: transparent !important;
}

.comparison-graph__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.comparison-graph__legend-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.comparison-graph__legend-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.comparison-graph__swatch {
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: 1px;
}
</style>
