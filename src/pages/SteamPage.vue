<script setup>
import { computed, inject, watch } from 'vue'
import ValueInput from '../components/ValueInput.vue'
import PresetPillRow from '../components/PresetPillRow.vue'
import { setMachineState } from '../api/rest.js'

// Injected from App.vue
const machineState = inject('machineState')
const shotTime = inject('shotTime')
const settings = inject('settings')


const isSteaming = computed(() =>
  machineState.value === 'steam'
)

const formattedShotTime = computed(() => {
  const t = typeof shotTime.value === 'number' ? shotTime.value : 0
  const mins = Math.floor(t / 60)
  const secs = Math.floor(t % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
})

// Use settings-backed values directly
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

// Steam settings are synced to the workflow API by useOperationSettings
// (watches settings.steamDuration/steamFlow/steamTemperature with debounce).

// ---- Presets (for selecting during steaming) ----
const presets = computed(() => settings.settings.steamPitcherPresets)
const selectedPreset = computed({
  get: () => settings.settings.selectedSteamPitcherPreset,
  set: (v) => { settings.settings.selectedSteamPitcherPreset = v },
})

function onPresetSelect(index) {
  selectedPreset.value = index
  const preset = presets.value[index]
  if (preset) {
    duration.value = preset.duration ?? duration.value
    steamFlow.value = preset.flow ?? steamFlow.value
    temperature.value = preset.temperature ?? temperature.value
  }
}

function stopSteam() {
  setMachineState('idle').catch(() => {})
}
</script>

<template>
  <div class="steam-page">
    <div class="steam-page__content">
      <div v-if="isSteaming" class="steam-page__live">
        <!-- Pitcher presets during steaming -->
        <PresetPillRow
          v-if="presets.length"
          :presets="presets"
          :selected-index="selectedPreset"
          @select="onPresetSelect"
        />

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
              :style="{ transform: 'scaleX(' + timerProgress + ')' }"
            />
          </div>
        </div>

        <div class="steam-page__spacer" />

        <!-- Steam flow control during steaming -->
        <div class="steam-page__flow-control">
          <span class="steam-page__flow-label">Steam Flow</span>
          <ValueInput
            :model-value="steamFlow"
            :min="0.4"
            :max="2.5"
            :step="0.05"
            :decimals="2"
            suffix=" mL/s"
            value-color="var(--color-primary)"
            @update:model-value="steamFlow = $event"
          />
          <span class="steam-page__flow-hint">Low = flat, High = foamy</span>
        </div>

        <div class="steam-page__spacer" />

        <!-- Stop button -->
        <button class="steam-page__stop-btn" @click="stopSteam">
          Stop
        </button>
      </div>
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

.steam-page__stop-btn {
  align-self: center;
  width: 100%;
  max-width: 300px;
  height: 56px;
  border-radius: var(--radius-card);
  border: none;
  background: var(--color-error);
  color: var(--color-text);
  font-size: var(--font-title);
  font-weight: 700;
  cursor: pointer;
  margin-bottom: var(--spacing-medium);
  -webkit-tap-highlight-color: transparent;
}

.steam-page__stop-btn:active {
  filter: brightness(0.85);
}
</style>
