<script setup>
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import CircularGauge from '../components/CircularGauge.vue'
import ConnectionIndicator from '../components/ConnectionIndicator.vue'
import PresetPillRow from '../components/PresetPillRow.vue'
import { setMachineState } from '../api/rest.js'

const router = useRouter()

// Injected from App.vue (populated by real composables)
const machineState = inject('machineState', ref('idle'))
const machineConnected = inject('machineConnected', ref(false))
const scaleConnected = inject('scaleConnected', ref(false))
const temperature = inject('temperature', ref(0))
const targetTemperature = inject('targetTemperature', ref(0))
const pressure = inject('pressure', ref(0))
const waterLevel = inject('waterLevel', ref(0))
const profileName = inject('profileName', ref(''))
const workflow = inject('workflow', null)
const settings = inject('settings', null)

const isReady = computed(() =>
  machineState.value === 'idle' || machineState.value === 'ready'
)

// P1-4: Shot Plan Text — display brewing plan from workflow data
const shotPlanText = computed(() => {
  if (!workflow) return ''

  const doseData = workflow.doseData
  const grinderData = workflow.grinderData

  if (!doseData) return ''

  const parts = []

  const doseIn = doseData.doseIn ?? doseData.dose
  const doseOut = doseData.doseOut ?? doseData.targetWeight
  if (doseIn && doseOut) {
    const ratio = doseOut / doseIn
    parts.push(`${Number(doseIn).toFixed(1)}g in / ${Number(doseOut).toFixed(1)}g out (1:${ratio.toFixed(1)})`)
  } else if (doseIn) {
    parts.push(`${Number(doseIn).toFixed(1)}g in`)
  } else if (doseOut) {
    parts.push(`${Number(doseOut).toFixed(1)}g out`)
  }

  if (grinderData) {
    const grinderName = grinderData.grinder || grinderData.name
    const grinderSetting = grinderData.setting ?? grinderData.grindSetting
    if (grinderName && grinderSetting != null) {
      parts.push(`${grinderName} @ ${grinderSetting}`)
    } else if (grinderName) {
      parts.push(grinderName)
    }
  }

  return parts.join(' | ')
})

// ---- Quick-start presets on idle page ----
const steamPresets = computed(() => settings?.settings?.steamPitcherPresets ?? [])
const selectedSteamPreset = computed(() => settings?.settings?.selectedSteamPitcherPreset ?? -1)
const hotWaterPresets = computed(() => settings?.settings?.waterVesselPresets ?? [])
const selectedHotWaterPreset = computed(() => settings?.settings?.selectedWaterVesselPreset ?? -1)
const flushPresets = computed(() => settings?.settings?.flushPresets ?? [])
const selectedFlushPreset = computed(() => settings?.settings?.selectedFlushPreset ?? -1)

function onSteamPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedSteamPitcherPreset = index
  const preset = steamPresets.value[index]
  if (preset) {
    settings.settings.steamDuration = preset.duration ?? settings.settings.steamDuration
    settings.settings.steamFlow = preset.flow ?? settings.settings.steamFlow
    settings.settings.steamTemperature = preset.temperature ?? settings.settings.steamTemperature
  }
}

function onHotWaterPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedWaterVesselPreset = index
  const preset = hotWaterPresets.value[index]
  if (preset) {
    settings.settings.hotWaterVolume = preset.volume ?? settings.settings.hotWaterVolume
    settings.settings.hotWaterTemperature = preset.temperature ?? settings.settings.hotWaterTemperature
  }
}

function onFlushPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedFlushPreset = index
  const preset = flushPresets.value[index]
  if (preset) {
    settings.settings.flushDuration = preset.duration ?? settings.settings.flushDuration
    settings.settings.flushFlowRate = preset.flow ?? settings.settings.flushFlowRate
  }
}

async function startEspresso() {
  await setMachineState('espresso').catch(() => {})
  router.push('/espresso')
}

async function startSteam() {
  await setMachineState('steam').catch(() => {})
  router.push('/steam')
}

async function startHotWater() {
  await setMachineState('hotWater').catch(() => {})
  router.push('/hotwater')
}

async function startFlush() {
  await setMachineState('flush').catch(() => {})
  router.push('/flush')
}
</script>

<template>
  <div class="idle-page">
    <!-- Top info section -->
    <div class="idle-page__top">
      <div class="idle-page__top-left">
        <CircularGauge
          :value="temperature"
          :min="0"
          :max="110"
          unit="&deg;C"
          label="Group"
          color="var(--color-temperature)"
          :size="120"
        />
      </div>
      <div class="idle-page__top-right">
        <div class="idle-page__connection">
          <ConnectionIndicator
            :connected="machineConnected"
            :size="12"
            :detail="machineConnected && scaleConnected ? 'Machine + Scale' : machineConnected ? 'Machine' : ''"
          />
          <span class="idle-page__connection-label">
            {{ machineConnected ? 'Online' : 'Offline' }}
          </span>
        </div>
        <div class="idle-page__water">
          <div class="idle-page__water-bar">
            <div
              class="idle-page__water-fill"
              :style="{ height: waterLevel + '%' }"
            />
          </div>
          <span class="idle-page__water-label">{{ waterLevel }}%</span>
        </div>
      </div>
    </div>

    <!-- Center action buttons -->
    <div class="idle-page__center">
      <div v-if="profileName" class="idle-page__profile" @click="router.push('/profiles')">
        {{ profileName }}
      </div>

      <!-- P1-4: Shot plan text -->
      <div v-if="shotPlanText" class="idle-page__shot-plan">
        {{ shotPlanText }}
      </div>

      <div class="idle-page__actions">
        <ActionButton
          icon="&#9749;"
          label="Espresso"
          :disabled="!isReady"
          @click="startEspresso"
        />
        <ActionButton
          icon="&#9752;"
          label="Steam"
          color="var(--color-accent)"
          :disabled="!isReady"
          @click="startSteam"
        />
        <ActionButton
          icon="&#128167;"
          label="Hot Water"
          color="var(--color-flow)"
          :disabled="!isReady"
          @click="startHotWater"
        />
        <ActionButton
          icon="&#127754;"
          label="Flush"
          color="var(--color-success)"
          :disabled="!isReady"
          @click="startFlush"
        />
      </div>

      <!-- Quick-start presets -->
      <div v-if="steamPresets.length" class="idle-page__preset-section">
        <span class="idle-page__preset-label">Steam</span>
        <PresetPillRow
          :presets="steamPresets"
          :selected-index="selectedSteamPreset"
          @select="onSteamPresetSelect"
          @activate="() => setMachineState('steam').catch(() => {})"
        />
      </div>
      <div v-if="hotWaterPresets.length" class="idle-page__preset-section">
        <span class="idle-page__preset-label">Hot Water</span>
        <PresetPillRow
          :presets="hotWaterPresets"
          :selected-index="selectedHotWaterPreset"
          @select="onHotWaterPresetSelect"
          @activate="() => setMachineState('hotWater').catch(() => {})"
        />
      </div>
      <div v-if="flushPresets.length" class="idle-page__preset-section">
        <span class="idle-page__preset-label">Flush</span>
        <PresetPillRow
          :presets="flushPresets"
          :selected-index="selectedFlushPreset"
          @select="onFlushPresetSelect"
          @activate="() => setMachineState('flush').catch(() => {})"
        />
      </div>

      <!-- Navigation links -->
      <div class="idle-page__nav">
        <button class="idle-page__nav-btn" @click="router.push('/history')">
          History
        </button>
        <button class="idle-page__nav-btn" @click="router.push('/settings')">
          Settings
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.idle-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--margin-standard);
}

.idle-page__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.idle-page__top-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-large);
}

.idle-page__top-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

.idle-page__connection {
  display: flex;
  align-items: center;
  gap: 6px;
}

.idle-page__connection-label {
  font-size: var(--font-label);
  font-weight: 600;
}

.idle-page__scale-status {
  display: flex;
  align-items: center;
  gap: 4px;
}

.idle-page__scale-label {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
}

.idle-page__water {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.idle-page__water-bar {
  width: 24px;
  height: 48px;
  border-radius: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.idle-page__water-fill {
  width: 100%;
  background: var(--color-flow);
  border-radius: 0 0 3px 3px;
  transition: height 0.3s ease;
}

.idle-page__water-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

.idle-page__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-large);
}

.idle-page__profile {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  text-align: center;
  max-width: 80%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.idle-page__shot-plan {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  text-align: center;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.idle-page__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-medium);
}

.idle-page__preset-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.idle-page__preset-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.idle-page__nav {
  display: flex;
  gap: var(--spacing-medium);
}

.idle-page__nav-btn {
  padding: 8px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.idle-page__nav-btn:active {
  opacity: 0.7;
}
</style>
