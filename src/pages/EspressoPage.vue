<script setup>
import { ref, computed, inject, watch } from 'vue'
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
const profileFrame = inject('profileFrame', ref(0))
const machine = inject('machine', null)

// Shot data for the chart (provided by App.vue from useShotData)
const shotData = inject('shotData', null)

// Volume mode composable (provided by App.vue)
const volumeMode = inject('volumeMode', null)

// P1-7: Track frame transitions for phase markers on the chart
const frameMarkers = ref([])
let lastFrame = -1

watch(profileFrame, (newFrame) => {
  if (newFrame !== lastFrame && shotData?.isRecording?.value) {
    const elapsed = shotData.elapsed()
    if (elapsed > 0 && newFrame >= 0) {
      // Determine pump mode from which target value is non-zero
      // targetFlow > 0 means flow mode, otherwise pressure mode
      const targetF = machine?.targetFlow?.value ?? 0
      const pump = targetF > 0 ? 'flow' : 'pressure'
      // Label shows transition reason: [T]=time default
      // (the exact exit reason is not available in the snapshot)
      const label = newFrame > 0 ? '[T]' : ''
      frameMarkers.value = [
        ...frameMarkers.value,
        { time: elapsed, label, pump }
      ]
    }
    lastFrame = newFrame
  }
})

// Reset markers when recording starts
watch(() => shotData?.isRecording?.value, (recording) => {
  if (recording) {
    frameMarkers.value = []
    lastFrame = -1
  }
})

const isPreheating = computed(() =>
  substate.value === 'preparingForShot' || substate.value === 'preheating'
)

const weightProgress = computed(() => {
  if (volumeMode) return volumeMode.progress.value
  const tw = typeof targetWeight.value === 'number' ? targetWeight.value : targetWeight.value?.value ?? 36
  return tw > 0 ? Math.min(1, (weight.value ?? 0) / tw) : 0
})

const displayTargetWeight = computed(() => {
  if (volumeMode) return volumeMode.displayTarget.value
  const tw = targetWeight.value
  return typeof tw === 'number' ? tw : tw?.value ?? 36
})

const displayOutputValue = computed(() => {
  if (volumeMode) return volumeMode.displayValue.value
  return weight.value ?? 0
})

const displayOutputSuffix = computed(() => {
  if (volumeMode) return volumeMode.displaySuffix.value
  return 'g'
})

const brewRatioText = computed(() => {
  if (!volumeMode) return ''
  const ratio = volumeMode.brewByRatio.value
  return ratio > 0 ? `1:${ratio.toFixed(1)}` : ''
})

const rawShotTime = computed(() => {
  const t = shotTime.value
  return typeof t === 'number' ? t : (typeof t === 'function' ? t() : 0)
})

const displayShotTime = computed(() => {
  const t = rawShotTime.value
  const mins = Math.floor(t / 60)
  const secs = t % 60
  return mins > 0
    ? `${mins}:${secs.toFixed(1).padStart(4, '0')}`
    : `${secs.toFixed(1)}s`
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
        :frame-markers="frameMarkers"
        :show-legend="true"
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
          {{ displayShotTime }}
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

      <!-- Weight / Volume with progress -->
      <div class="espresso-page__weight">
        <div class="espresso-page__weight-row">
          <span class="espresso-page__metric-value" style="color: var(--color-weight)">
            {{ displayOutputValue.toFixed(1) }}
          </span>
          <span class="espresso-page__weight-target">
            / {{ displayTargetWeight.toFixed(0) }} {{ displayOutputSuffix }}
          </span>
        </div>
        <div v-if="brewRatioText" class="espresso-page__brew-ratio">
          {{ brewRatioText }}
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
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 8px 32px;
  font-size: var(--font-title);
  color: var(--color-text-secondary);
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

.espresso-page__brew-ratio {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
}

.espresso-page__progress {
  height: 4px;
  background: var(--color-surface);
  border-radius: 2px;
  overflow: hidden;
  max-width: 120px;
}

.espresso-page__progress-fill {
  height: 100%;
  background: var(--color-weight);
  border-radius: 4px;
  transition: width 0.1s linear;
}
</style>
