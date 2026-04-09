<script setup>
import { computed, watch, ref } from 'vue'

const props = defineProps({
  phase: { type: String, default: '' },
  currentWeight: { type: Number, default: 0 },
  targetWeight: { type: Number, default: 36 },
  currentFlow: { type: Number, default: 0 },
  currentPressure: { type: Number, default: 0 },
  targetFlow: { type: Number, default: 0 },
  targetPressure: { type: Number, default: 0 },
  shotTime: { type: Number, default: 0 },
})

const PHASES = [
  { key: 'EspressoPreheating', label: 'Preheat', short: 'H' },
  { key: 'Preinfusion', label: 'Pre-infusion', short: 'PI' },
  { key: 'Pouring', label: 'Pouring', short: 'P' },
  { key: 'Ending', label: 'Done', short: 'D' },
]

const activeIndex = computed(() => {
  const idx = PHASES.findIndex(p => p.key === props.phase)
  return idx >= 0 ? idx : -1
})

// Tracking color: port of QML Theme.trackingColor
const trackColor = computed(() => {
  if (activeIndex.value < 2) return null // no tracking before pouring
  const isPressure = props.targetFlow <= 0 && props.targetPressure > 0
  const goal = isPressure ? props.targetPressure : props.targetFlow
  const actual = isPressure ? props.currentPressure : props.currentFlow
  if (goal <= 0) return null

  const delta = Math.abs(actual - goal)
  const floorGood = isPressure ? 0.8 : 0.4
  const floorWarn = isPressure ? 1.8 : 0.8
  const threshGood = Math.max(floorGood, goal * 0.25)
  const threshWarn = Math.max(floorWarn, goal * 0.50)

  if (delta < threshGood) return 'var(--color-success)'
  if (delta < threshWarn) return 'var(--color-tracking-drift)'
  return 'var(--color-accent)'
})

// Weight progress during pouring
const weightProgress = computed(() => {
  if (props.targetWeight <= 0) return 0
  return Math.min(1, props.currentWeight / props.targetWeight)
})

// Format shot time
const timeText = computed(() => {
  const t = props.shotTime
  if (t <= 0) return '0.0s'
  const mins = Math.floor(t / 60)
  const secs = t % 60
  return mins > 0
    ? `${mins}:${secs.toFixed(1).padStart(4, '0')}`
    : `${secs.toFixed(1)}s`
})

// Phase status for each segment
function phaseStatus(index) {
  if (activeIndex.value < 0) return 'upcoming'
  if (index < activeIndex.value) return 'completed'
  if (index === activeIndex.value) return 'active'
  return 'upcoming'
}

// Accessibility: announce phase transitions
const announcement = ref('')
watch(activeIndex, (idx) => {
  if (idx >= 0 && idx < PHASES.length) {
    const label = PHASES[idx].label
    if (idx === 2) {
      announcement.value = `${label}, 0 of ${props.targetWeight.toFixed(0)} grams`
    } else if (idx === 3) {
      announcement.value = `Shot complete — ${props.currentWeight.toFixed(1)} grams, ${timeText.value}`
    } else {
      announcement.value = `${label} started`
    }
  }
})
</script>

<template>
  <div class="phase-timeline__wrapper">
    <div class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
    <div class="phase-timeline" role="list" aria-label="Extraction phases">
    <div
      v-for="(p, i) in PHASES"
      :key="p.key"
      class="phase-timeline__segment"
      :class="[
        `phase-timeline__segment--${phaseStatus(i)}`,
        { 'phase-timeline__segment--tracking': i === activeIndex && trackColor }
      ]"
      :style="{ '--track-color': trackColor }"
      role="listitem"
      :aria-current="i === activeIndex ? 'step' : undefined"
      :aria-label="`${p.label} — ${phaseStatus(i)}`"
    >
      <!-- Progress fill -->
      <div
        class="phase-timeline__fill"
        :style="{
          transform: phaseStatus(i) === 'completed' ? 'scaleX(1)'
            : phaseStatus(i) === 'active' && i === 2 ? `scaleX(${weightProgress})`
            : phaseStatus(i) === 'active' ? 'scaleX(1)'
            : 'scaleX(0)'
        }"
      />

      <!-- Label -->
      <span class="phase-timeline__label">
        {{ i === activeIndex ? p.label : p.short }}
      </span>

      <!-- Active phase detail -->
      <span v-if="i === activeIndex && i === 2" class="phase-timeline__detail">
        {{ currentWeight.toFixed(1) }}<small>/{{ targetWeight.toFixed(0) }}g</small>
      </span>
      <span v-else-if="i === activeIndex && i === 1" class="phase-timeline__detail">
        {{ currentPressure.toFixed(1) }}<small>bar</small>
      </span>
      <span v-else-if="i === activeIndex && i === 3" class="phase-timeline__detail">
        {{ currentWeight.toFixed(1) }}g
      </span>
    </div>

    <!-- Shot time (always visible) -->
    <div class="phase-timeline__time">{{ timeText }}</div>
    </div>
  </div>
</template>

<style scoped>
.phase-timeline__wrapper {
  flex-shrink: 0;
}

.phase-timeline {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  height: 44px;
  flex-shrink: 0;
  overflow: hidden;
}

.phase-timeline__segment {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  border-radius: 16px;
  padding: 0 10px;
  overflow: hidden;
  transition: flex 400ms ease;
  flex: 0 1 32px;
  min-width: 32px;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
}

.phase-timeline__segment--active {
  flex: 1 1 120px;
  border-color: var(--color-primary);
}

.phase-timeline__segment--tracking {
  border-color: var(--track-color, var(--color-primary));
}

.phase-timeline__segment--completed {
  border-color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 15%, var(--color-surface));
}

.phase-timeline__fill {
  position: absolute;
  inset: 0;
  background: var(--track-color, var(--color-primary));
  opacity: 0.12;
  transform-origin: left;
  transition: transform 0.15s linear;
  border-radius: inherit;
}

.phase-timeline__segment--completed .phase-timeline__fill {
  background: var(--color-success);
  opacity: 0.15;
}

.phase-timeline__label {
  position: relative;
  font-size: var(--font-caption);
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
  z-index: 1;
}

.phase-timeline__segment--active .phase-timeline__label {
  color: var(--color-text);
}

.phase-timeline__segment--completed .phase-timeline__label {
  color: var(--color-success);
}

.phase-timeline__detail {
  position: relative;
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  z-index: 1;
}

.phase-timeline__detail small {
  font-weight: 400;
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  margin-left: 2px;
}

.phase-timeline__time {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
  min-width: 48px;
  text-align: right;
}

.phase-timeline__segment--active .phase-timeline__fill {
  animation: phase-pulse 2s ease-in-out infinite;
}

@keyframes phase-pulse {
  0%, 100% { opacity: 0.10; }
  50% { opacity: 0.20; }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .phase-timeline__segment,
  .phase-timeline__fill {
    transition: none;
  }
  .phase-timeline__segment--active .phase-timeline__fill {
    animation: none;
    opacity: 0.12;
  }
}
</style>
