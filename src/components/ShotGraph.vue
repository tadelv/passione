<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { createShotChartOpts, COLORS } from '../composables/useChartConfig.js'

const props = defineProps({
  /** uPlot-compatible data: [time[], p[], pGoal[], f[], fGoal[], t[], tGoal[], w[]] */
  data: { type: Array, required: true },
})

const chartEl = ref(null)
let chart = null
let resizeObserver = null
let resizeTimer = null

function initChart() {
  if (!chartEl.value) return
  const rect = chartEl.value.getBoundingClientRect()
  const w = Math.floor(rect.width) || 400
  const h = Math.floor(rect.height) || 300

  const opts = createShotChartOpts(w, h)

  // Start with empty data if none provided yet
  const initial = props.data && props.data[0]?.length
    ? props.data
    : [[], [], [], [], [], [], [], []]

  chart = new uPlot(opts, initial, chartEl.value)
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

// Watch for new data and push to uPlot
watch(() => props.data, (newData) => {
  if (!chart) return
  if (newData && newData[0]?.length) {
    chart.setData(newData)
  }
})

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
  <div class="shot-graph">
    <div ref="chartEl" class="shot-graph__canvas"></div>
    <div class="shot-graph__legend">
      <span class="shot-graph__legend-item">
        <span class="shot-graph__swatch" :style="{ background: COLORS.pressure }"></span>
        Pressure
      </span>
      <span class="shot-graph__legend-item">
        <span class="shot-graph__swatch" :style="{ background: COLORS.flow }"></span>
        Flow
      </span>
      <span class="shot-graph__legend-item">
        <span class="shot-graph__swatch" :style="{ background: COLORS.temperature }"></span>
        Temp
      </span>
      <span class="shot-graph__legend-item">
        <span class="shot-graph__swatch" :style="{ background: COLORS.weight }"></span>
        Weight
      </span>
      <span class="shot-graph__legend-sep"></span>
      <span class="shot-graph__legend-item shot-graph__legend-item--muted">
        <span class="shot-graph__swatch shot-graph__swatch--dashed"></span>
        target
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

.shot-graph__legend {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--text-secondary, #a0a8b8);
}

.shot-graph__legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.shot-graph__legend-item--muted {
  opacity: 0.6;
}

.shot-graph__swatch {
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: 1px;
}

.shot-graph__swatch--dashed {
  background: repeating-linear-gradient(
    90deg,
    var(--text-secondary, #a0a8b8) 0px,
    var(--text-secondary, #a0a8b8) 4px,
    transparent 4px,
    transparent 7px
  );
  height: 2px;
}

.shot-graph__legend-sep {
  width: 1px;
  height: 12px;
  background: var(--border, #3a3a4e);
}
</style>
