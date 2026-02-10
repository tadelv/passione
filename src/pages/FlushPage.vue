<script setup>
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import ValueInput from '../components/ValueInput.vue'

const router = useRouter()

// Injected from API layer
const machineState = inject('machineState', ref('idle'))
const shotTime = inject('shotTime', ref(0))

const isFlushing = computed(() =>
  machineState.value === 'flush'
)

// Settings
const flushSeconds = ref(5)
const flushFlow = ref(6.0)

const timerProgress = computed(() =>
  flushSeconds.value > 0 ? Math.min(1, shotTime.value / flushSeconds.value) : 0
)

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="flush-page">
    <div class="flush-page__content">
      <!-- FLUSHING VIEW -->
      <div v-if="isFlushing" class="flush-page__live">
        <div class="flush-page__spacer" />

        <div class="flush-page__timer-section">
          <span class="flush-page__timer-text">
            {{ shotTime.toFixed(1) }}s / {{ flushSeconds.toFixed(0) }}s
          </span>
          <div class="flush-page__progress-bar">
            <div
              class="flush-page__progress-fill"
              :style="{ width: (timerProgress * 100) + '%' }"
            />
          </div>
        </div>

        <div class="flush-page__spacer" />
      </div>

      <!-- SETTINGS VIEW -->
      <div v-else class="flush-page__settings">
        <div class="flush-page__card">
          <!-- Duration -->
          <div class="flush-page__setting-row">
            <span class="flush-page__setting-label">Duration</span>
            <ValueInput
              :model-value="flushSeconds"
              :min="1"
              :max="30"
              :step="0.5"
              :decimals="1"
              suffix=" s"
              value-color="var(--color-primary)"
              @update:model-value="flushSeconds = $event"
            />
          </div>

          <div class="flush-page__separator" />

          <!-- Flow Rate -->
          <div class="flush-page__setting-row">
            <span class="flush-page__setting-label">Flow Rate</span>
            <ValueInput
              :model-value="flushFlow"
              :min="2"
              :max="10"
              :step="0.5"
              :decimals="1"
              suffix=" mL/s"
              value-color="var(--color-flow)"
              @update:model-value="flushFlow = $event"
            />
          </div>
        </div>
      </div>
    </div>

    <BottomBar
      v-if="!isFlushing"
      title="Flush"
      @back="goBack"
    >
      <span>{{ flushSeconds.toFixed(1) }}s</span>
      <span style="opacity: 0.3">|</span>
      <span>{{ flushFlow.toFixed(1) }} mL/s</span>
    </BottomBar>
  </div>
</template>

<style scoped>
.flush-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.flush-page__content {
  flex: 1;
  padding: var(--margin-standard);
  overflow-y: auto;
  min-height: 0;
}

.flush-page__live {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.flush-page__spacer {
  flex: 1;
}

.flush-page__timer-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.flush-page__timer-text {
  font-size: var(--font-timer);
  font-weight: bold;
  color: var(--color-text);
}

.flush-page__progress-bar {
  width: 100%;
  max-width: 500px;
  height: 8px;
  border-radius: 4px;
  background: var(--color-surface);
}

.flush-page__progress-fill {
  height: 100%;
  border-radius: 4px;
  background: var(--color-primary);
  transition: width 0.1s linear;
}

.flush-page__settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.flush-page__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: var(--spacing-medium);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.flush-page__setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-medium);
}

.flush-page__setting-label {
  font-size: var(--font-title);
  color: var(--color-text);
}

.flush-page__separator {
  height: 1px;
  background: var(--color-text-secondary);
  opacity: 0.3;
}
</style>
