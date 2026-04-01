<script setup>
/**
 * ShotSilhouette — minimal, decorative shot graph.
 *
 * Renders smoothed SVG curves for pressure, flow, and weight.
 * No axes, no grid, no legend — just the lines.
 * Designed for screensaver and ambient display use.
 */
import { computed } from 'vue'

const props = defineProps({
  shot: { type: Object, default: null },
})

const COLORS = {
  pressure: '#18c37e',
  flow: '#4e85f4',
  weight: '#a2693d',
}

// Normalize shot data into flat arrays (same logic as HistoryShotGraph)
function extractArrays(shot) {
  if (!shot) return null

  // Already flat format
  if (shot.elapsed?.length) {
    return {
      elapsed: shot.elapsed,
      pressure: shot.pressure ?? [],
      flow: shot.flow ?? [],
      weight: shot.weightFlow ?? shot.weight ?? [],
    }
  }

  const measurements = shot.measurements
  if (!Array.isArray(measurements) || measurements.length === 0) return null

  const elapsed = []
  const pressure = []
  const flow = []
  const weight = []

  // Find first timestamp from any source
  function parseTs(raw) {
    if (raw == null) return null
    const v = typeof raw === 'string' ? new Date(raw).getTime() : Number(raw)
    return v > 1e12 ? v / 1000 : v
  }

  const first = measurements[0]
  const baseTime = parseTs(first.timestamp ?? first.machine?.timestamp ?? first.scale?.timestamp) ?? 0

  for (let i = 0; i < measurements.length; i++) {
    const m = measurements[i]

    // Elapsed time — try multiple sources
    let t = 0
    if (m.elapsed != null) {
      t = Number(m.elapsed)
    } else {
      const ts = parseTs(m.timestamp ?? m.machine?.timestamp ?? m.scale?.timestamp)
      t = ts != null ? ts - baseTime : i * 0.1
    }
    elapsed.push(t)

    const mc = m.machine && typeof m.machine === 'object' ? m.machine : m
    const sc = m.scale && typeof m.scale === 'object' ? m.scale : m
    pressure.push(mc.pressure ?? m.pressure ?? 0)
    flow.push(mc.flow ?? m.flow ?? 0)
    weight.push(sc.weightFlow ?? m.weightFlow ?? 0)
  }

  return { elapsed, pressure, flow, weight }
}

// Build a smooth SVG path from data points
function buildPath(xVals, yVals, yMin, yMax, viewW, viewH) {
  if (!xVals.length || !yVals.length) return ''
  const xMin = xVals[0]
  const xMax = xVals[xVals.length - 1]
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1

  const points = []
  // Downsample to ~100 points max for smooth curves
  const step = Math.max(1, Math.floor(xVals.length / 100))
  for (let i = 0; i < xVals.length; i += step) {
    const x = ((xVals[i] - xMin) / xRange) * viewW
    const y = viewH - ((yVals[i] - yMin) / yRange) * viewH
    points.push([x, y])
  }
  // Always include last point
  const last = xVals.length - 1
  if (last % step !== 0) {
    points.push([
      ((xVals[last] - xMin) / xRange) * viewW,
      viewH - ((yVals[last] - yMin) / yRange) * viewH,
    ])
  }

  if (points.length < 2) return ''

  // Catmull-Rom to cubic bezier for smooth curves
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6

    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

const W = 1000
const H = 400

const paths = computed(() => {
  const data = extractArrays(props.shot)
  if (!data) return []

  const { elapsed, pressure, flow, weight } = data
  return [
    { d: buildPath(elapsed, pressure, 0, 12, W, H), color: COLORS.pressure, width: 3 },
    { d: buildPath(elapsed, flow, 0, 8, W, H), color: COLORS.flow, width: 2.5 },
    { d: buildPath(elapsed, weight, 0, 6, W, H), color: COLORS.weight, width: 2 },
  ].filter(p => p.d)
})
</script>

<template>
  <svg
    class="shot-silhouette"
    :viewBox="`0 0 ${W} ${H}`"
    preserveAspectRatio="none"
  >
    <defs>
      <filter id="glow">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <!-- Glow layer — blurred duplicate that breathes -->
    <g class="shot-silhouette__glow" filter="url(#glow)">
      <path
        v-for="(p, i) in paths"
        :key="'g' + i"
        :d="p.d"
        :stroke="p.color"
        :stroke-width="p.width * 1.5"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
    <!-- Sharp lines on top -->
    <path
      v-for="(p, i) in paths"
      :key="i"
      :d="p.d"
      :stroke="p.color"
      :stroke-width="p.width"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.shot-silhouette {
  width: 100%;
  height: 100%;
  display: block;
}

.shot-silhouette__glow {
  opacity: 0.5;
  animation: breathe 4s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.7; }
}
</style>
