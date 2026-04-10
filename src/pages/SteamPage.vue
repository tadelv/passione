<script setup>
import { computed, inject } from 'vue'
import ValueInput from '../components/ValueInput.vue'
import { setMachineState } from '../api/rest.js'

const machineState = inject('machineState')
const shotTime = inject('shotTime')
const settings = inject('settings')

const isSteaming = computed(() => machineState.value === 'steam')

const formattedShotTime = computed(() => {
  const t = typeof shotTime.value === 'number' ? shotTime.value : 0
  const mins = Math.floor(t / 60)
  const secs = Math.floor(t % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
})

const duration = computed({
  get: () => settings.settings.steamDuration,
  set: (v) => { settings.settings.steamDuration = v },
})

const steamFlow = computed({
  get: () => settings.settings.steamFlow,
  set: (v) => { settings.settings.steamFlow = v },
})

const temperature = computed({
  get: () => settings.settings.steamTemperature,
  set: (v) => { settings.settings.steamTemperature = v },
})

const timerProgress = computed(() =>
  duration.value > 0 ? Math.min(1, shotTime.value / duration.value) : 0
)

function stopSteam() {
  setMachineState('idle').catch(() => {})
}

function startSteam() {
  setMachineState('steam').catch(() => {})
}
</script>

<template>
  <div class="steam-page">
    <div class="steam-page__content">
      <!-- ACTIVE: steaming -->
      <template v-if="isSteaming">
        <div class="steam-page__spacer" />

        <div class="steam-page__timer-section">
          <div class="steam-page__timer-row">
            <button class="steam-page__adjust-btn" aria-label="Decrease 5 seconds" @click="duration = Math.max(5, duration - 5)">
              -5s
            </button>
            <span class="steam-page__timer-text">
              {{ formattedShotTime }} / {{ duration }}s
            </span>
            <button class="steam-page__adjust-btn" aria-label="Increase 5 seconds" @click="duration = Math.min(120, duration + 5)">
              +5s
            </button>
          </div>
          <div class="steam-page__progress-bar">
            <div class="steam-page__progress-fill" :style="{ transform: 'scaleX(' + timerProgress + ')' }" />
          </div>
        </div>

        <div class="steam-page__flow-control">
          <span class="steam-page__flow-label">Steam Flow</span>
          <ValueInput
            :model-value="steamFlow"
            :min="0.4" :max="2.5" :step="0.05" :decimals="2"
            suffix=" mL/s"
            value-color="var(--color-primary)"
            aria-label="Steam flow rate"
            @update:model-value="steamFlow = $event"
          />
        </div>

        <div class="steam-page__spacer" />

        <button class="steam-page__stop-btn" aria-label="Stop steaming" @click="stopSteam">
          Stop
        </button>
      </template>

      <!-- IDLE: fallback (should rarely be seen) -->
      <template v-else>
        <div class="steam-page__idle">
          <div class="steam-page__idle-info">
            <span class="steam-page__idle-value">{{ temperature }}°C</span>
            <span class="steam-page__idle-label">Temperature</span>
          </div>
          <div class="steam-page__idle-info">
            <span class="steam-page__idle-value">{{ duration }}s</span>
            <span class="steam-page__idle-label">Duration</span>
          </div>
          <div class="steam-page__idle-info">
            <span class="steam-page__idle-value">{{ steamFlow }} mL/s</span>
            <span class="steam-page__idle-label">Flow</span>
          </div>
          <button class="steam-page__start-btn" @click="startSteam">
            Start Steam
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.steam-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.steam-page__content {
  flex: 1;
  padding: var(--margin-standard);
  display: flex;
  flex-direction: column;
}

.steam-page__spacer {
  flex: 1;
}

.steam-page__timer-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.steam-page__timer-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

.steam-page__adjust-btn {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: var(--font-body);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.steam-page__adjust-btn:active {
  filter: brightness(0.85);
}

.steam-page__timer-text {
  font-size: var(--font-timer);
  font-weight: bold;
  color: var(--color-text);
}

.steam-page__progress-bar {
  width: 100%;
  max-width: 500px;
  height: 8px;
  border-radius: 4px;
  background: var(--color-surface);
}

.steam-page__progress-fill {
  height: 100%;
  width: 100%;
  border-radius: 4px;
  background: var(--color-primary);
  transform-origin: left;
  transition: transform 0.1s linear;
}

.steam-page__flow-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 40px;
}

.steam-page__flow-label {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
}

.steam-page__stop-btn,
.steam-page__start-btn {
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

.steam-page__stop-btn {
  background: var(--color-error);
}

.steam-page__start-btn {
  background: var(--color-primary);
}

.steam-page__stop-btn:active,
.steam-page__start-btn:active {
  filter: brightness(0.85);
}

.steam-page__idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  flex: 1;
}

.steam-page__idle-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.steam-page__idle-value {
  font-size: var(--font-title);
  font-weight: 600;
  color: var(--color-text);
}

.steam-page__idle-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}
</style>
