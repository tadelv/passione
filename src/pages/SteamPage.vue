<script setup>
import { ref, computed, inject, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import ValueInput from '../components/ValueInput.vue'
import PresetPillRow from '../components/PresetPillRow.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import { useSteamHeater } from '../composables/useSteamHeater.js'
import { setMachineState, updateWorkflow } from '../api/rest.js'

const router = useRouter()

// Injected from App.vue
const machineState = inject('machineState')
const shotTime = inject('shotTime')
const machine = inject('machine')
const settings = inject('settings')

// Steam heater control composable
const steamHeater = useSteamHeater(machine, settings)

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

// Re-apply settings when temperature changes (updates machine heater target)
watch(temperature, () => steamHeater.applySettings())

// Sync steam settings to workflow API when any setting changes
let _steamSyncTimer = null
function syncSteamToWorkflow() {
  clearTimeout(_steamSyncTimer)
  _steamSyncTimer = setTimeout(async () => {
    await updateWorkflow({
      steamSettings: {
        targetTemperature: temperature.value,
        duration: duration.value,
        flow: steamFlow.value / 100, // convert from 0.01 units to actual
      },
    }).catch(() => {})
  }, 300)
}
watch([duration, steamFlow, temperature], syncSteamToWorkflow)

function flowToDisplay(val) {
  return (val / 100).toFixed(1)
}

// ---- Presets ----
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

function onPresetActivate() {
  if (machineState.value !== 'idle' && machineState.value !== 'ready') return
  setMachineState('steam').catch(() => {})
}

// Preset edit popup
const editPopupVisible = ref(false)
const editPresetIndex = ref(-1)
const editPresetData = ref(null)

function onPresetLongPress(index) {
  editPresetIndex.value = index
  editPresetData.value = { ...presets.value[index] }
  editPopupVisible.value = true
}

function onAddPreset() {
  editPresetIndex.value = -1
  editPresetData.value = {
    name: '',
    emoji: '',
    duration: duration.value,
    flow: steamFlow.value,
    temperature: temperature.value,
  }
  editPopupVisible.value = true
}

function onPresetSave(data) {
  const list = [...presets.value]
  if (editPresetIndex.value >= 0) {
    list[editPresetIndex.value] = data
  } else {
    list.push(data)
    selectedPreset.value = list.length - 1
  }
  settings.settings.steamPitcherPresets = list
  editPopupVisible.value = false
}

function onPresetDelete() {
  const list = [...presets.value]
  list.splice(editPresetIndex.value, 1)
  settings.settings.steamPitcherPresets = list
  if (selectedPreset.value >= list.length) {
    selectedPreset.value = list.length - 1
  }
  editPopupVisible.value = false
}

function onPresetCancel() {
  editPopupVisible.value = false
}

// Start heating on mount, handle leave
onMounted(() => {
  steamHeater.startHeating()
})

onUnmounted(() => {
  steamHeater.onLeave()
})

function stopSteam() {
  setMachineState('idle').catch(() => {})
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

        <!-- Stop button -->
        <button class="steam-page__stop-btn" @click="stopSteam">
          Stop
        </button>
      </div>

      <!-- SETTINGS VIEW -->
      <div v-else class="steam-page__settings">
        <!-- Pitcher presets -->
        <PresetPillRow
          :presets="presets"
          :selected-index="selectedPreset"
          :long-press-enabled="true"
          @select="onPresetSelect"
          @activate="onPresetActivate"
          @long-press="onPresetLongPress"
        />
        <button class="steam-page__add-preset" @click="onAddPreset">+ Add Preset</button>

        <!-- Heating indicator -->
        <div v-if="steamHeater.isHeatingUp.value" class="steam-page__heating">
          <div class="steam-page__heating-info">
            <span class="steam-page__heating-icon">&#128293;</span>
            <div class="steam-page__heating-text">
              <span class="steam-page__heating-title">Heating steam...</span>
              <div class="steam-page__heating-bar">
                <div
                  class="steam-page__heating-fill"
                  :style="{ width: (steamHeater.heatProgress.value * 100) + '%' }"
                />
              </div>
            </div>
            <span class="steam-page__heating-temp">
              {{ steamHeater.currentSteamTemp.value.toFixed(0) }} / {{ steamHeater.targetTemp.value.toFixed(0) }}&deg;C
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

    <PresetEditPopup
      :visible="editPopupVisible"
      :preset="editPresetData"
      :is-existing="editPresetIndex >= 0"
      operation-type="steam"
      @save="onPresetSave"
      @delete="onPresetDelete"
      @cancel="onPresetCancel"
    />
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

.steam-page__stop-btn {
  align-self: center;
  width: 100%;
  max-width: 300px;
  height: 56px;
  border-radius: var(--radius-card);
  border: none;
  background: var(--color-error);
  color: #fff;
  font-size: var(--font-title);
  font-weight: 700;
  cursor: pointer;
  margin-bottom: var(--spacing-medium);
  -webkit-tap-highlight-color: transparent;
}

.steam-page__stop-btn:active {
  filter: brightness(0.85);
}

.steam-page__add-preset {
  align-self: center;
  padding: 6px 16px;
  border-radius: 8px;
  border: 1px dashed var(--color-text-secondary);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-label);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.steam-page__add-preset:active {
  background: rgba(255, 255, 255, 0.05);
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
