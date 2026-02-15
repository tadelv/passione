<script setup>
import { ref, computed, inject, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import ValueInput from '../components/ValueInput.vue'
import PresetPillRow from '../components/PresetPillRow.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import { setMachineState, updateWorkflow } from '../api/rest.js'

const router = useRouter()

// Injected from App.vue
const machineState = inject('machineState')
const weight = inject('weight')
const settings = inject('settings')
const scale = inject('scale')

const isDispensing = computed(() =>
  machineState.value === 'hotWater'
)

// Settings-backed values
const volume = computed({
  get: () => settings.settings.hotWaterVolume,
  set: (v) => { settings.settings.hotWaterVolume = v },
})

const temperature = computed({
  get: () => settings.settings.hotWaterTemperature,
  set: (v) => { settings.settings.hotWaterTemperature = v },
})

const isVolumeMode = computed({
  get: () => settings.settings.hotWaterMode === 'volume',
  set: (v) => { settings.settings.hotWaterMode = v ? 'volume' : 'weight' },
})

const weightProgress = computed(() =>
  volume.value > 0 ? Math.min(1, weight.value / volume.value) : 0
)

// Sync hot water settings to workflow API when any setting changes
let _hotWaterSyncTimer = null
function syncHotWaterToWorkflow() {
  clearTimeout(_hotWaterSyncTimer)
  _hotWaterSyncTimer = setTimeout(async () => {
    await updateWorkflow({
      hotWaterData: {
        targetTemperature: temperature.value,
        volume: volume.value,
      },
    }).catch(() => {})
  }, 300)
}
watch([volume, temperature], syncHotWaterToWorkflow)

// ---- Presets ----
const presets = computed(() => settings.settings.waterVesselPresets)
const selectedPreset = computed({
  get: () => settings.settings.selectedWaterVesselPreset,
  set: (v) => { settings.settings.selectedWaterVesselPreset = v },
})

function onPresetSelect(index) {
  selectedPreset.value = index
  const preset = presets.value[index]
  if (preset) {
    volume.value = preset.volume ?? volume.value
    temperature.value = preset.temperature ?? temperature.value
  }
}

function onPresetActivate() {
  if (machineState.value !== 'idle' && machineState.value !== 'ready') return
  setMachineState('hotWater').catch(() => {})
}

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
    volume: volume.value,
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
  settings.settings.waterVesselPresets = list
  editPopupVisible.value = false
}

function onPresetDelete() {
  const list = [...presets.value]
  list.splice(editPresetIndex.value, 1)
  settings.settings.waterVesselPresets = list
  if (selectedPreset.value >= list.length) {
    selectedPreset.value = list.length - 1
  }
  editPopupVisible.value = false
}

function onPresetCancel() {
  editPopupVisible.value = false
}

// Auto-tare on mount when in weight mode
onMounted(() => {
  if (!isVolumeMode.value && scale) {
    scale.tare().catch(() => {})
  }
})

function stopHotWater() {
  setMachineState('idle').catch(() => {})
}

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="hotwater-page">
    <div class="hotwater-page__content">
      <!-- DISPENSING VIEW -->
      <div v-if="isDispensing" class="hotwater-page__live">
        <!-- Vessel presets during dispensing -->
        <PresetPillRow
          v-if="presets.length"
          :presets="presets"
          :selected-index="selectedPreset"
          @select="onPresetSelect"
        />

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

        <!-- Stop button -->
        <button class="hotwater-page__stop-btn" @click="stopHotWater">
          Stop
        </button>
      </div>

      <!-- SETTINGS VIEW -->
      <div v-else class="hotwater-page__settings">
        <!-- Vessel presets -->
        <PresetPillRow
          :presets="presets"
          :selected-index="selectedPreset"
          :long-press-enabled="true"
          @select="onPresetSelect"
          @activate="onPresetActivate"
          @long-press="onPresetLongPress"
        />
        <button class="hotwater-page__add-preset" @click="onAddPreset">+ Add Preset</button>

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

    <PresetEditPopup
      :visible="editPopupVisible"
      :preset="editPresetData"
      :is-existing="editPresetIndex >= 0"
      operation-type="hotwater"
      @save="onPresetSave"
      @delete="onPresetDelete"
      @cancel="onPresetCancel"
    />
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

.hotwater-page__stop-btn {
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

.hotwater-page__stop-btn:active {
  filter: brightness(0.85);
}

.hotwater-page__add-preset {
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

.hotwater-page__add-preset:active {
  background: rgba(255, 255, 255, 0.05);
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
