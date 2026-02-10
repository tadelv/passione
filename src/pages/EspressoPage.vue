<script setup>
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import ShotGraph from '../components/ShotGraph.vue'
import { setMachineState } from '../api/rest.js'

const router = useRouter()

// Injected from App.vue (populated by real composables)
const pressure = inject('pressure', ref(0))
const flow = inject('flow', ref(0))
const temperature = inject('temperature', ref(0))
const weight = inject('weight', ref(0))
const targetWeight = inject('targetWeight', ref(36))
const shotTime = inject('shotTime', ref(0))
const machineState = inject('machineState', ref('idle'))
const substate = inject('substate', ref(''))

// Shot data for the chart (provided by App.vue from useShotData)
const shotData = inject('shotData', null)

const isPreheating = computed(() =>
  substate.value === 'preparingForShot' || substate.value === 'preheating'
)

const weightProgress = computed(() => {
  const tw = typeof targetWeight.value === 'number' ? targetWeight.value : targetWeight.value?.value ?? 36
  return tw > 0 ? Math.min(1, (weight.value ?? 0) / tw) : 0
})

const displayTargetWeight = computed(() => {
  const tw = targetWeight.value
  return typeof tw === 'number' ? tw : tw?.value ?? 36
})

const displayShotTime = computed(() => {
  const t = shotTime.value
  return typeof t === 'number' ? t : (typeof t === 'function' ? t() : 0)
})

async function stopAndGoBack() {
  try {
    await setMachineState('idle')
  } catch {
    // Navigation will happen via auto-nav watcher in App.vue
  }
  router.push('/')
}
</script>

<template>
  <div class="espresso-page">
    <!-- Preheating banner -->
    <div v-if="isPreheating" class="espresso-page__preheat">
      PREHEATING...
    </div>

    <!-- Shot graph -->
    <div class="espresso-page__chart">
      <ShotGraph
        v-if="shotData"
        :data="shotData.data.value"
      />
      <div v-else class="espresso-page__chart-placeholder">
        <span>Shot Graph</span>
      </div>
    </div>

    <!-- Bottom info bar -->
    <div class="espresso-page__info-bar">
      <!-- Back / Stop button -->
      <button class="espresso-page__back" @click="stopAndGoBack" aria-label="Stop and go back">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <!-- Timer -->
      <div class="espresso-page__metric">
        <span class="espresso-page__metric-value espresso-page__metric-value--timer">
          {{ displayShotTime.toFixed(1) }}s
        </span>
        <span class="espresso-page__metric-label">Time</span>
      </div>

      <div class="espresso-page__divider" />

      <!-- Pressure -->
      <div class="espresso-page__metric">
        <span class="espresso-page__metric-value" style="color: var(--color-pressure)">
          {{ pressure.toFixed(1) }}
        </span>
        <span class="espresso-page__metric-label">bar</span>
      </div>

      <!-- Flow -->
      <div class="espresso-page__metric">
        <span class="espresso-page__metric-value" style="color: var(--color-flow)">
          {{ flow.toFixed(1) }}
        </span>
        <span class="espresso-page__metric-label">mL/s</span>
      </div>

      <!-- Temperature -->
      <div class="espresso-page__metric">
        <span class="espresso-page__metric-value" style="color: var(--color-temperature)">
          {{ temperature.toFixed(1) }}
        </span>
        <span class="espresso-page__metric-label">&deg;C</span>
      </div>

      <div class="espresso-page__divider" />

      <!-- Weight with progress -->
      <div class="espresso-page__weight">
        <div class="espresso-page__weight-row">
          <span class="espresso-page__metric-value" style="color: var(--color-weight)">
            {{ weight.toFixed(1) }}
          </span>
          <span class="espresso-page__weight-target">
            / {{ displayTargetWeight.toFixed(0) }} g
          </span>
        </div>
        <div class="espresso-page__progress">
          <div
            class="espresso-page__progress-fill"
            :style="{ width: (weightProgress * 100) + '%' }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.espresso-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.espresso-page__preheat {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 24px;
  background: var(--color-accent);
  border-radius: 18px;
  font-size: var(--font-body);
  color: var(--color-text);
  z-index: 5;
}

.espresso-page__chart {
  flex: 1;
  padding: 50px 0 0 0;
  min-height: 0;
}

.espresso-page__chart-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: var(--font-title);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-card);
  margin: var(--spacing-medium);
}

.espresso-page__info-bar {
  display: flex;
  align-items: center;
  height: 100px;
  padding: 0 var(--spacing-medium);
  gap: var(--spacing-medium);
  background: color-mix(in srgb, var(--color-surface), black 20%);
  flex-shrink: 0;
}

.espresso-page__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 100%;
  border: none;
  background: transparent;
  color: white;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.espresso-page__back:active {
  opacity: 0.7;
}

.espresso-page__metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 60px;
}

.espresso-page__metric-value {
  font-size: 28px;
  font-weight: 500;
  color: var(--color-text);
}

.espresso-page__metric-value--timer {
  font-size: 36px;
  font-weight: bold;
}

.espresso-page__metric-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

.espresso-page__divider {
  width: 1px;
  align-self: stretch;
  margin: 10px 0;
  background: var(--color-text-secondary);
  opacity: 0.3;
}

.espresso-page__weight {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.espresso-page__weight-row {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-small);
}

.espresso-page__weight-target {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
}

.espresso-page__progress {
  height: var(--spacing-small);
  background: var(--color-surface);
  border-radius: 4px;
  overflow: hidden;
}

.espresso-page__progress-fill {
  height: 100%;
  background: var(--color-weight);
  border-radius: 4px;
  transition: width 0.1s linear;
}
</style>
