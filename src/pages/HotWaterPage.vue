<script setup>
import { computed, inject, onMounted } from 'vue'
import { setMachineState } from '../api/rest.js'

const machineState = inject('machineState')
const weight = inject('weight')
const settings = inject('settings')
const scale = inject('scale')

const isDispensing = computed(() => machineState.value === 'hotWater')

const volume = computed({
  get: () => settings.settings.hotWaterVolume,
  set: (v) => { settings.settings.hotWaterVolume = v },
})

const temperature = computed({
  get: () => settings.settings.hotWaterTemperature,
  set: (v) => { settings.settings.hotWaterTemperature = v },
})

const isVolumeMode = computed(() => settings.settings.hotWaterMode === 'volume')

const weightProgress = computed(() =>
  volume.value > 0 ? Math.min(1, weight.value / volume.value) : 0
)

onMounted(() => {
  if (!isVolumeMode.value && scale) {
    scale.tare().catch(() => {})
  }
})

function stopHotWater() {
  setMachineState('idle').catch(() => {})
}

function startHotWater() {
  setMachineState('hotWater').catch(() => {})
}
</script>

<template>
  <div class="hotwater-page">
    <div class="hotwater-page__content">
      <!-- ACTIVE: dispensing -->
      <template v-if="isDispensing">
        <div class="hotwater-page__spacer" />

        <div class="hotwater-page__progress-section">
          <span v-if="!isVolumeMode" class="hotwater-page__timer-text">
            {{ Math.max(0, weight).toFixed(0) }}g / {{ volume }}g
          </span>
          <span v-else class="hotwater-page__timer-text">
            {{ volume }} ml
          </span>
          <span v-if="isVolumeMode" class="hotwater-page__mode-hint">
            Dispensing (flowmeter)
          </span>
          <div v-if="!isVolumeMode" class="hotwater-page__progress-bar">
            <div class="hotwater-page__progress-fill" :style="{ transform: 'scaleX(' + weightProgress + ')' }" />
          </div>
        </div>

        <div class="hotwater-page__spacer" />

        <button class="hotwater-page__stop-btn" aria-label="Stop hot water" @click="stopHotWater">
          Stop
        </button>
      </template>

      <!-- IDLE: fallback -->
      <template v-else>
        <div class="hotwater-page__idle">
          <div class="hotwater-page__idle-info">
            <span class="hotwater-page__idle-value">{{ temperature }}°C</span>
            <span class="hotwater-page__idle-label">Temperature</span>
          </div>
          <div class="hotwater-page__idle-info">
            <span class="hotwater-page__idle-value">{{ volume }}{{ isVolumeMode ? ' ml' : ' g' }}</span>
            <span class="hotwater-page__idle-label">{{ isVolumeMode ? 'Volume' : 'Weight' }}</span>
          </div>
          <button class="hotwater-page__start-btn" @click="startHotWater">
            Start Hot Water
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.hotwater-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.hotwater-page__content {
  flex: 1;
  padding: var(--margin-standard);
  display: flex;
  flex-direction: column;
}

.hotwater-page__spacer {
  flex: 1;
}

.hotwater-page__progress-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.hotwater-page__timer-text {
  font-size: var(--font-timer);
  font-weight: bold;
  color: var(--color-text);
}

.hotwater-page__mode-hint {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
}

.hotwater-page__progress-bar {
  width: 100%;
  max-width: 500px;
  height: 8px;
  border-radius: 4px;
  background: var(--color-surface);
}

.hotwater-page__progress-fill {
  height: 100%;
  width: 100%;
  border-radius: 4px;
  background: var(--color-primary);
  transform-origin: left;
  transition: transform 0.1s linear;
}

.hotwater-page__stop-btn,
.hotwater-page__start-btn {
  align-self: center;
  width: 100%;
  max-width: 300px;
  height: 56px;
  border-radius: var(--radius-card);
  border: none;
  color: var(--color-text);
  font-size: var(--font-title);
  font-weight: 700;
  cursor: pointer;
  margin-bottom: var(--spacing-medium);
  -webkit-tap-highlight-color: transparent;
}

.hotwater-page__stop-btn {
  background: var(--color-error);
}

.hotwater-page__start-btn {
  background: var(--color-primary);
}

.hotwater-page__stop-btn:active,
.hotwater-page__start-btn:active {
  filter: brightness(0.85);
}

.hotwater-page__idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  flex: 1;
}

.hotwater-page__idle-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.hotwater-page__idle-value {
  font-size: var(--font-title);
  font-weight: 600;
  color: var(--color-text);
}

.hotwater-page__idle-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}
</style>
