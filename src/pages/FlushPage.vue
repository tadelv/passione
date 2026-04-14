<script setup>
import { computed, inject, onMounted } from 'vue'
import { setMachineState } from '../api/rest.js'

const machineState = inject('machineState')
const shotTime = inject('shotTime')
const settings = inject('settings')
const operationSettings = inject('operationSettings', null)

// Refresh local flush settings from the live workflow on mount so values
// reflect any updates made elsewhere (workflow editor, other client).
onMounted(() => {
  operationSettings?.syncFromWorkflow?.()
})

const isFlushing = computed(() => machineState.value === 'flush')

const flushSeconds = computed({
  get: () => settings.settings.flushDuration,
  set: (v) => { settings.settings.flushDuration = v },
})

const flushFlow = computed({
  get: () => settings.settings.flushFlowRate,
  set: (v) => { settings.settings.flushFlowRate = v },
})

const timerProgress = computed(() =>
  flushSeconds.value > 0 ? Math.min(1, shotTime.value / flushSeconds.value) : 0
)

function stopFlush() {
  setMachineState('idle').catch(() => {})
}

function startFlush() {
  setMachineState('flush').catch(() => {})
}
</script>

<template>
  <div class="flush-page">
    <div class="flush-page__content">
      <!-- ACTIVE: flushing -->
      <template v-if="isFlushing">
        <div class="flush-page__spacer" />

        <div class="flush-page__timer-section">
          <span class="flush-page__timer-text">
            {{ shotTime.toFixed(1) }}s / {{ flushSeconds.toFixed(0) }}s
          </span>
          <div class="flush-page__progress-bar">
            <div class="flush-page__progress-fill" :style="{ transform: 'scaleX(' + timerProgress + ')' }" />
          </div>
        </div>

        <div class="flush-page__spacer" />

        <button class="flush-page__stop-btn" aria-label="Stop flushing" @click="stopFlush">
          Stop
        </button>
      </template>

      <!-- IDLE: fallback -->
      <template v-else>
        <div class="flush-page__idle">
          <div class="flush-page__idle-info">
            <span class="flush-page__idle-value">{{ flushSeconds.toFixed(1) }}s</span>
            <span class="flush-page__idle-label">Duration</span>
          </div>
          <div class="flush-page__idle-info">
            <span class="flush-page__idle-value">{{ flushFlow.toFixed(1) }} mL/s</span>
            <span class="flush-page__idle-label">Flow</span>
          </div>
          <button class="flush-page__start-btn" @click="startFlush">
            Start Flush
          </button>
        </div>
      </template>
    </div>
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
  display: flex;
  flex-direction: column;
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
  height: 6px;
  border-radius: 3px;
  background: var(--color-surface);
}

.flush-page__progress-fill {
  height: 100%;
  width: 100%;
  border-radius: 4px;
  background: var(--color-primary);
  transform-origin: left;
  transition: transform 0.1s linear;
}

.flush-page__stop-btn,
.flush-page__start-btn {
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

.flush-page__stop-btn {
  background: var(--color-error);
}

.flush-page__start-btn {
  background: var(--color-primary);
}

.flush-page__stop-btn:active,
.flush-page__start-btn:active {
  filter: brightness(0.85);
}

.flush-page__idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  flex: 1;
}

.flush-page__idle-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.flush-page__idle-value {
  font-size: var(--font-title);
  font-weight: 600;
  color: var(--color-text);
}

.flush-page__idle-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}
</style>
