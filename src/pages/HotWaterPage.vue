<script setup>
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import ValueInput from '../components/ValueInput.vue'

const router = useRouter()

// Injected from API layer
const machineState = inject('machineState', ref('idle'))
const weight = inject('weight', ref(0))

const isDispensing = computed(() =>
  machineState.value === 'hotWater'
)

// Settings
const volume = ref(200)
const temperature = ref(80)
const isVolumeMode = ref(false)

const weightProgress = computed(() =>
  volume.value > 0 ? Math.min(1, weight.value / volume.value) : 0
)

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="hotwater-page">
    <div class="hotwater-page__content">
      <!-- DISPENSING VIEW -->
      <div v-if="isDispensing" class="hotwater-page__live">
        <div class="hotwater-page__spacer" />

        <div class="hotwater-page__progress-section">
          <!-- Weight mode -->
          <span v-if="!isVolumeMode" class="hotwater-page__timer-text">
            {{ Math.max(0, weight).toFixed(0) }}g / {{ volume }}g
          </span>
          <!-- Volume mode -->
          <span v-else class="hotwater-page__timer-text">
            {{ volume }} ml
          </span>

          <span v-if="isVolumeMode" class="hotwater-page__mode-hint">
            Dispensing (flowmeter)
          </span>

          <!-- Progress bar (weight mode) -->
          <div v-if="!isVolumeMode" class="hotwater-page__progress-bar">
            <div
              class="hotwater-page__progress-fill"
              :style="{ width: (weightProgress * 100) + '%' }"
            />
          </div>
        </div>

        <div class="hotwater-page__spacer" />
      </div>

      <!-- SETTINGS VIEW -->
      <div v-else class="hotwater-page__settings">
        <!-- Settings card -->
        <div class="hotwater-page__card">
          <!-- Mode toggle + target value -->
          <div class="hotwater-page__setting-row">
            <div class="hotwater-page__mode-toggle">
              <button
                class="hotwater-page__mode-btn"
                :class="{ active: !isVolumeMode }"
                @click="isVolumeMode = false"
              >
                Weight (g)
              </button>
              <button
                class="hotwater-page__mode-btn"
                :class="{ active: isVolumeMode }"
                @click="isVolumeMode = true"
              >
                Volume (ml)
              </button>
            </div>
            <ValueInput
              :model-value="volume"
              :min="50"
              :max="isVolumeMode ? 255 : 500"
              :step="10"
              :decimals="0"
              :suffix="isVolumeMode ? ' ml' : ' g'"
              value-color="var(--color-primary)"
              @update:model-value="volume = $event"
            />
          </div>

          <div class="hotwater-page__separator" />

          <!-- Temperature -->
          <div class="hotwater-page__setting-row">
            <span class="hotwater-page__setting-label">Temperature</span>
            <ValueInput
              :model-value="temperature"
              :min="40"
              :max="100"
              :step="1"
              :decimals="0"
              suffix="&deg;C"
              value-color="var(--color-temperature)"
              @update:model-value="temperature = $event"
            />
          </div>
        </div>
      </div>
    </div>

    <BottomBar
      v-if="!isDispensing"
      title="Hot Water"
      @back="goBack"
    >
      <span>{{ volume }}{{ isVolumeMode ? ' ml' : ' g' }}</span>
      <span style="opacity: 0.3">|</span>
      <span>{{ temperature }}&deg;C</span>
    </BottomBar>
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
  overflow-y: auto;
  min-height: 0;
}

.hotwater-page__live {
  display: flex;
  flex-direction: column;
  height: 100%;
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
  border-radius: 4px;
  background: var(--color-primary);
  transition: width 0.1s linear;
}

.hotwater-page__settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hotwater-page__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: var(--spacing-medium);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hotwater-page__setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-medium);
}

.hotwater-page__setting-label {
  font-size: var(--font-title);
  color: var(--color-text);
}

.hotwater-page__mode-toggle {
  display: flex;
  gap: 4px;
}

.hotwater-page__mode-btn {
  padding: 8px 16px;
  border-radius: 18px;
  border: 1px solid var(--color-text-secondary);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-body);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.hotwater-page__mode-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.hotwater-page__separator {
  height: 1px;
  background: var(--color-text-secondary);
  opacity: 0.3;
}
</style>
