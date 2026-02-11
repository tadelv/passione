<script setup>
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import ValueInput from '../components/ValueInput.vue'

const router = useRouter()

// Injected from API layer
const machineState = inject('machineState', ref('idle'))
const shotTime = inject('shotTime', ref(0))
const steamTemperature = inject('steamTemperature', ref(0))
const targetSteamTemp = inject('targetSteamTemp', ref(160))

const isSteaming = computed(() =>
  machineState.value === 'steam'
)

const formattedShotTime = computed(() => {
  const t = typeof shotTime.value === 'number' ? shotTime.value : 0
  const mins = Math.floor(t / 60)
  const secs = Math.floor(t % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
})

const isHeatingUp = computed(() =>
  !isSteaming.value && steamTemperature.value < (targetSteamTemp.value - 5)
)

const heatProgress = computed(() =>
  targetSteamTemp.value > 0 ? Math.min(1, steamTemperature.value / targetSteamTemp.value) : 0
)

// Settings
const duration = ref(30)
const steamFlow = ref(150)
const temperature = ref(160)

const timerProgress = computed(() =>
  duration.value > 0 ? Math.min(1, shotTime.value / duration.value) : 0
)

function flowToDisplay(val) {
  return (val / 100).toFixed(1)
}

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="steam-page">
    <div class="steam-page__content">
      <!-- STEAMING VIEW -->
      <div v-if="isSteaming" class="steam-page__live">
        <div class="steam-page__spacer" />

        <!-- Timer display -->
        <div class="steam-page__timer-section">
          <div class="steam-page__timer-row">
            <button class="steam-page__adjust-btn" @click="duration = Math.max(5, duration - 5)">
              -5s
            </button>
            <span class="steam-page__timer-text">
              {{ formattedShotTime }} / {{ duration }}s
            </span>
            <button class="steam-page__adjust-btn" @click="duration = Math.min(120, duration + 5)">
              +5s
            </button>
          </div>
          <div class="steam-page__progress-bar">
            <div
              class="steam-page__progress-fill"
              :style="{ width: (timerProgress * 100) + '%' }"
            />
          </div>
        </div>

        <div class="steam-page__spacer" />

        <!-- Steam flow control during steaming -->
        <div class="steam-page__flow-control">
          <span class="steam-page__flow-label">Steam Flow</span>
          <ValueInput
            :model-value="steamFlow"
            :min="40"
            :max="250"
            :step="5"
            :decimals="0"
            value-color="var(--color-primary)"
            @update:model-value="steamFlow = $event"
          />
          <span class="steam-page__flow-hint">Low = flat, High = foamy</span>
        </div>

        <div class="steam-page__spacer" />
      </div>

      <!-- SETTINGS VIEW -->
      <div v-else class="steam-page__settings">
        <!-- Heating indicator -->
        <div v-if="isHeatingUp" class="steam-page__heating">
          <div class="steam-page__heating-info">
            <span class="steam-page__heating-icon">&#128293;</span>
            <div class="steam-page__heating-text">
              <span class="steam-page__heating-title">Heating steam...</span>
              <div class="steam-page__heating-bar">
                <div
                  class="steam-page__heating-fill"
                  :style="{ width: (heatProgress * 100) + '%' }"
                />
              </div>
            </div>
            <span class="steam-page__heating-temp">
              {{ steamTemperature.toFixed(0) }} / {{ targetSteamTemp.toFixed(0) }}&deg;C
            </span>
          </div>
        </div>

        <!-- Settings card -->
        <div class="steam-page__card">
          <!-- Duration -->
          <div class="steam-page__setting-row">
            <span class="steam-page__setting-label">Duration</span>
            <ValueInput
              :model-value="duration"
              :min="1"
              :max="120"
              :step="1"
              :decimals="0"
              suffix=" s"
              value-color="var(--color-primary)"
              @update:model-value="duration = $event"
            />
          </div>

          <div class="steam-page__separator" />

          <!-- Steam Flow -->
          <div class="steam-page__setting-row">
            <div>
              <span class="steam-page__setting-label">Steam Flow</span>
              <span class="steam-page__setting-hint">Low = flat, High = foamy</span>
            </div>
            <ValueInput
              :model-value="steamFlow"
              :min="40"
              :max="250"
              :step="5"
              :decimals="0"
              value-color="var(--color-primary)"
              @update:model-value="steamFlow = $event"
            />
          </div>

          <div class="steam-page__separator" />

          <!-- Temperature -->
          <div class="steam-page__setting-row">
            <div>
              <span class="steam-page__setting-label">Temperature</span>
              <span class="steam-page__setting-hint">Higher = drier steam</span>
            </div>
            <ValueInput
              :model-value="temperature"
              :min="120"
              :max="170"
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
      v-if="!isSteaming"
      title="Steam"
      @back="goBack"
    >
      <span>{{ duration }}s</span>
      <span style="opacity: 0.3">|</span>
      <span>Flow {{ flowToDisplay(steamFlow) }}</span>
      <span style="opacity: 0.3">|</span>
      <span>{{ temperature }}&deg;C</span>
    </BottomBar>
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
  overflow-y: auto;
  min-height: 0;
}

.steam-page__live {
  display: flex;
  flex-direction: column;
  height: 100%;
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
  border: 1px solid white;
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
  border-radius: 4px;
  background: var(--color-primary);
  transition: width 0.1s linear;
}

.steam-page__flow-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 0 40px;
}

.steam-page__flow-label {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
}

.steam-page__flow-hint {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
}

.steam-page__settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.steam-page__heating {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
}

.steam-page__heating-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.steam-page__heating-icon {
  font-size: 28px;
  animation: pulse-opacity 1.2s ease-in-out infinite;
}

@keyframes pulse-opacity {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.steam-page__heating-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.steam-page__heating-title {
  font-size: var(--font-label);
  font-weight: bold;
  color: var(--color-text);
}

.steam-page__heating-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--color-background);
}

.steam-page__heating-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--color-warning);
  transition: width 0.3s ease;
}

.steam-page__heating-temp {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.steam-page__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: var(--spacing-medium);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.steam-page__setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-medium);
}

.steam-page__setting-label {
  font-size: var(--font-title);
  color: var(--color-text);
  display: block;
}

.steam-page__setting-hint {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  display: block;
}

.steam-page__separator {
  height: 1px;
  background: var(--color-text-secondary);
  opacity: 0.3;
}
</style>
