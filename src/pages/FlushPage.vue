<script setup>
import { ref, computed, inject, watch } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import ValueInput from '../components/ValueInput.vue'
import PresetPillRow from '../components/PresetPillRow.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import { setMachineState, updateWorkflow } from '../api/rest.js'

const router = useRouter()

// Injected from App.vue
const machineState = inject('machineState')
const shotTime = inject('shotTime')
const settings = inject('settings')

const isFlushing = computed(() =>
  machineState.value === 'flush'
)

// Settings-backed values
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

// Sync flush/rinse settings to workflow API when any setting changes
let _flushSyncTimer = null
function syncFlushToWorkflow() {
  clearTimeout(_flushSyncTimer)
  _flushSyncTimer = setTimeout(async () => {
    await updateWorkflow({
      rinseData: {
        duration: flushSeconds.value,
        flow: flushFlow.value,
      },
    }).catch(() => {})
  }, 300)
}
watch([flushSeconds, flushFlow], syncFlushToWorkflow)

// ---- Presets ----
const presets = computed(() => settings.settings.flushPresets)
const selectedPreset = computed({
  get: () => settings.settings.selectedFlushPreset,
  set: (v) => { settings.settings.selectedFlushPreset = v },
})

function onPresetSelect(index) {
  selectedPreset.value = index
  const preset = presets.value[index]
  if (preset) {
    flushSeconds.value = preset.duration ?? flushSeconds.value
    flushFlow.value = preset.flow ?? flushFlow.value
  }
}

function onPresetActivate() {
  if (machineState.value !== 'idle' && machineState.value !== 'ready') return
  setMachineState('flush').catch(() => {})
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
    duration: flushSeconds.value,
    flow: flushFlow.value,
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
  settings.settings.flushPresets = list
  editPopupVisible.value = false
}

function onPresetDelete() {
  const list = [...presets.value]
  list.splice(editPresetIndex.value, 1)
  settings.settings.flushPresets = list
  if (selectedPreset.value >= list.length) {
    selectedPreset.value = list.length - 1
  }
  editPopupVisible.value = false
}

function onPresetCancel() {
  editPopupVisible.value = false
}

function stopFlush() {
  setMachineState('idle').catch(() => {})
}

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="flush-page">
    <div class="flush-page__content">
      <!-- FLUSHING VIEW -->
      <div v-if="isFlushing" class="flush-page__live">
        <!-- Presets during flushing -->
        <PresetPillRow
          v-if="presets.length"
          :presets="presets"
          :selected-index="selectedPreset"
          @select="onPresetSelect"
        />

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

        <!-- Stop button -->
        <button class="flush-page__stop-btn" @click="stopFlush">
          Stop
        </button>
      </div>

      <!-- SETTINGS VIEW -->
      <div v-else class="flush-page__settings">
        <!-- Flush presets -->
        <PresetPillRow
          :presets="presets"
          :selected-index="selectedPreset"
          :long-press-enabled="true"
          @select="onPresetSelect"
          @activate="onPresetActivate"
          @long-press="onPresetLongPress"
        />
        <button class="flush-page__add-preset" @click="onAddPreset">+ Add Preset</button>

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

    <PresetEditPopup
      :visible="editPopupVisible"
      :preset="editPresetData"
      :is-existing="editPresetIndex >= 0"
      operation-type="flush"
      @save="onPresetSave"
      @delete="onPresetDelete"
      @cancel="onPresetCancel"
    />
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
  height: 6px;
  border-radius: 3px;
  background: var(--color-surface);
}

.flush-page__progress-fill {
  height: 100%;
  border-radius: 4px;
  background: var(--color-primary);
  transition: width 0.1s linear;
}

.flush-page__stop-btn {
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

.flush-page__stop-btn:active {
  filter: brightness(0.85);
}

.flush-page__add-preset {
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

.flush-page__add-preset:active {
  background: rgba(255, 255, 255, 0.05);
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
