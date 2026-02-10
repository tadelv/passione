<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 10 },
  unit: { type: String, default: '' },
  label: { type: String, default: '' },
  color: { type: String, default: 'var(--color-primary)' },
  size: { type: Number, default: 120 },
  strokeWidth: { type: Number, default: 8 },
})

const center = computed(() => props.size / 2)
const radius = computed(() => center.value - props.strokeWidth - 8)
const normalizedValue = computed(() =>
  Math.max(0, Math.min(1, (props.value - props.min) / (props.max - props.min)))
)

// Arc from 135deg to 405deg (270 degree sweep)
const startAngle = 135
const sweepAngle = 270

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx, cy, r, startDeg, endDeg) {
  const start = polarToCartesian(cx, cy, r, endDeg)
  const end = polarToCartesian(cx, cy, r, startDeg)
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

const bgArc = computed(() =>
  describeArc(center.value, center.value, radius.value, startAngle, startAngle + sweepAngle)
)

const valueArc = computed(() => {
  const sweep = sweepAngle * normalizedValue.value
  if (sweep < 0.5) return ''
  return describeArc(center.value, center.value, radius.value, startAngle, startAngle + sweep)
})

const displayValue = computed(() => props.value.toFixed(1))
</script>

<template>
  <div class="circular-gauge" :style="{ width: size + 'px' }">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <!-- Background arc -->
      <path
        :d="bgArc"
        fill="none"
        :stroke="color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        stroke-opacity="0.2"
      />
      <!-- Value arc -->
      <path
        v-if="valueArc"
        :d="valueArc"
        fill="none"
        :stroke="color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
      />
    </svg>
    <div class="circular-gauge__value">
      <span class="circular-gauge__number">{{ displayValue }}</span>
      <span class="circular-gauge__unit">{{ unit }}</span>
    </div>
    <div v-if="label" class="circular-gauge__label">{{ label }}</div>
  </div>
</template>

<style scoped>
.circular-gauge {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.circular-gauge__value {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: v-bind("size + 'px'");
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  margin-top: -5px;
}

.circular-gauge__number {
  font-size: 20px;
  font-weight: bold;
  color: var(--color-text);
}

.circular-gauge__unit {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
}

.circular-gauge__label {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  margin-top: 5px;
  text-align: center;
}
</style>
