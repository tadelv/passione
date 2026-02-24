<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LayoutZone from '../components/LayoutZone.vue'
import PresetPillRow from '../components/PresetPillRow.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import { useLayout } from '../composables/useLayout.js'
import { setMachineState, getProfiles } from '../api/rest.js'

const { t } = useI18n()

const router = useRouter()

// Layout system
const { layout, loaded: layoutLoaded, load: loadLayout } = useLayout()

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
const updateWorkflow = inject('updateWorkflow')
const settings = inject('settings', null)
const toast = inject('toast', null)

const isReady = computed(() =>
  machineState.value === 'idle' || machineState.value === 'ready'
)

// P1-4: Shot Plan Text — display brewing plan from workflow data
// P1-4: Shot plan — structured lines from workflow data
const shotPlanLines = computed(() => {
  if (!workflow) return []

  const lines = []
  const coffeeData = workflow.coffeeData
  const doseData = workflow.doseData
  const grinderData = workflow.grinderData

  // Line 1: beans (API fields: name, roaster)
  if (coffeeData) {
    const coffeeName = coffeeData.name
    const roaster = coffeeData.roaster
    if (roaster && coffeeName) {
      lines.push(`${roaster} — ${coffeeName}`)
    } else if (coffeeName) {
      lines.push(coffeeName)
    } else if (roaster) {
      lines.push(roaster)
    }
  }

  // Line 2: dose / yield / ratio
  if (doseData) {
    const doseIn = doseData.doseIn ?? doseData.dose
    const doseOut = doseData.doseOut ?? doseData.targetWeight
    if (doseIn && doseOut) {
      const ratio = doseOut / doseIn
      lines.push(`${Number(doseIn).toFixed(1)}g in / ${Number(doseOut).toFixed(1)}g out (1:${ratio.toFixed(1)})`)
    } else if (doseIn) {
      lines.push(`${Number(doseIn).toFixed(1)}g in`)
    } else if (doseOut) {
      lines.push(`${Number(doseOut).toFixed(1)}g out`)
    }
  }

  // Line 3: grinder (API fields: manufacturer, model, setting)
  if (grinderData) {
    const grinderName = [grinderData.manufacturer, grinderData.model].filter(Boolean).join(' ') || grinderData.grinder || grinderData.name
    const grinderSetting = grinderData.setting ?? grinderData.grindSetting
    if (grinderName && grinderSetting != null) {
      lines.push(`${grinderName} @ ${grinderSetting}`)
    } else if (grinderSetting != null) {
      lines.push(`Grind: ${grinderSetting}`)
    } else if (grinderName) {
      lines.push(grinderName)
    }
  }

  return lines
})

// Flat text fallback for components that use a single string
const shotPlanText = computed(() => shotPlanLines.value.join(' | '))

// ---- Workflow combos (single tap loads everything, action buttons start) ----
const workflowCombos = computed(() => settings?.settings?.workflowCombos ?? [])
const selectedWorkflowCombo = computed(() => settings?.settings?.selectedWorkflowCombo ?? -1)

// Long-press edit popup state
const editPopupVisible = ref(false)
const editPopupPreset = ref(null)
const editPopupIndex = ref(-1)

async function onComboSelect(index) {
  if (!settings) return
  settings.settings.selectedWorkflowCombo = index
  const combo = workflowCombos.value[index]
  if (!combo) return

  // Build workflow update from non-null combo fields
  const update = {}

  // Profile
  if (combo.profileId) {
    try {
      const records = await getProfiles()
      const record = (Array.isArray(records) ? records : []).find(r => r.id === combo.profileId)
      if (record?.profile) update.profile = record.profile
    } catch { /* profile not found, skip */ }
  }

  // Coffee data
  const coffeeName = [combo.beanBrand, combo.beanType].filter(Boolean).join(' ')
  if (coffeeName || combo.roaster) {
    update.coffeeData = {
      name: coffeeName || null,
      roaster: combo.roaster || null,
    }
  }

  // Dose data
  if (combo.doseIn != null || combo.doseOut != null) {
    update.doseData = {
      doseIn: combo.doseIn ?? undefined,
      doseOut: combo.doseOut ?? undefined,
    }
  }

  // Grinder data
  if (combo.grinder || combo.grinderSetting) {
    update.grinderData = {
      manufacturer: null,
      model: combo.grinder || null,
      setting: combo.grinderSetting ?? null,
    }
  }

  // Steam settings → workflow API + local settings
  if (combo.steamSettings) {
    update.steamSettings = {
      targetTemperature: combo.steamSettings.temperature,
      duration: combo.steamSettings.duration,
      flow: combo.steamSettings.flow,
    }
    settings.settings.steamDuration = combo.steamSettings.duration ?? settings.settings.steamDuration
    settings.settings.steamFlow = combo.steamSettings.flow ?? settings.settings.steamFlow
    settings.settings.steamTemperature = combo.steamSettings.temperature ?? settings.settings.steamTemperature
  }

  // Flush settings → workflow API (rinseData) + local settings
  if (combo.flushSettings) {
    update.rinseData = {
      duration: combo.flushSettings.duration,
      flow: combo.flushSettings.flow,
    }
    settings.settings.flushDuration = combo.flushSettings.duration ?? settings.settings.flushDuration
    settings.settings.flushFlowRate = combo.flushSettings.flow ?? settings.settings.flushFlowRate
  }

  // Hot water settings → workflow API + local settings
  if (combo.hotWaterSettings) {
    update.hotWaterData = {
      targetTemperature: combo.hotWaterSettings.temperature,
      volume: combo.hotWaterSettings.volume,
    }
    settings.settings.hotWaterVolume = combo.hotWaterSettings.volume ?? settings.settings.hotWaterVolume
    settings.settings.hotWaterTemperature = combo.hotWaterSettings.temperature ?? settings.settings.hotWaterTemperature
  }

  if (Object.keys(update).length > 0) {
    updateWorkflow(update).catch(() => {})
  }

  toast?.success(`Loaded ${combo.name || 'combo'}`)
}

function onComboLongPress(index) {
  const combo = workflowCombos.value[index]
  if (!combo) return
  editPopupPreset.value = combo
  editPopupIndex.value = index
  editPopupVisible.value = true
}

function onComboEditSave(updated) {
  if (!settings || editPopupIndex.value < 0) return
  const combos = [...workflowCombos.value]
  combos[editPopupIndex.value] = { ...combos[editPopupIndex.value], name: updated.name, emoji: updated.emoji }
  settings.settings.workflowCombos = combos
  editPopupVisible.value = false
}

function onComboEditDelete() {
  if (!settings || editPopupIndex.value < 0) return
  const combos = [...workflowCombos.value]
  combos.splice(editPopupIndex.value, 1)
  settings.settings.workflowCombos = combos
  if (selectedWorkflowCombo.value >= combos.length) {
    settings.settings.selectedWorkflowCombo = combos.length - 1
  }
  editPopupVisible.value = false
}

function onComboEditCancel() {
  editPopupVisible.value = false
}

onMounted(() => {
  loadLayout()
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
  if (!isReady.value) return
  await setMachineState('espresso').catch(() => {})
  router.push('/espresso')
}

async function startSteam() {
  if (!isReady.value) return
  await setMachineState('steam').catch(() => {})
  router.push('/steam')
}

async function startHotWater() {
  if (!isReady.value) return
  await setMachineState('hotWater').catch(() => {})
  router.push('/hotwater')
}

async function startFlush() {
  if (!isReady.value) return
  await setMachineState('flush').catch(() => {})
  router.push('/flush')
}

// ---- Layout zone helpers ----
const zones = computed(() => layout.value.zones)

function hasZone(name) {
  return !!zones.value[name]
}
</script>

<template>
  <div class="idle-page">
    <!-- Top section: topBar zone -->
    <div v-if="hasZone('topBar')" class="idle-page__top">
      <div class="idle-page__top-left">
        <LayoutZone
          v-if="hasZone('centerLeft')"
          :zone="zones.centerLeft"
          :is-ready="isReady"
          :shot-plan-text="shotPlanText"
          :shot-plan-lines="shotPlanLines"
          :workflow-combos="workflowCombos"
          :selected-workflow-combo="selectedWorkflowCombo"
          :steam-presets="steamPresets"
          :selected-steam-preset="selectedSteamPreset"
          :hot-water-presets="hotWaterPresets"
          :selected-hot-water-preset="selectedHotWaterPreset"
          :flush-presets="flushPresets"
          :selected-flush-preset="selectedFlushPreset"
          @start-espresso="startEspresso"
          @start-steam="startSteam"
          @start-hot-water="startHotWater"
          @start-flush="startFlush"
          @workflow-combo-select="onComboSelect"
          @workflow-combo-long-press="onComboLongPress"
          @steam-preset-select="onSteamPresetSelect"
          @hot-water-preset-select="onHotWaterPresetSelect"
          @flush-preset-select="onFlushPresetSelect"
        />
      </div>
      <div class="idle-page__top-right">
        <LayoutZone
          :zone="zones.topBar"
          :is-ready="isReady"
          :shot-plan-text="shotPlanText"
          :shot-plan-lines="shotPlanLines"
        />
      </div>
    </div>

    <!-- Center section -->
    <div class="idle-page__center">
      <!-- Shot plan / profile zone (centerRight in default layout) -->
      <LayoutZone
        v-if="hasZone('centerRight')"
        :zone="zones.centerRight"
        :is-ready="isReady"
        :shot-plan-text="shotPlanText"
        :shot-plan-lines="shotPlanLines"
        :workflow-combos="workflowCombos"
        :selected-workflow-combo="selectedWorkflowCombo"
        :steam-presets="steamPresets"
        :selected-steam-preset="selectedSteamPreset"
        :hot-water-presets="hotWaterPresets"
        :selected-hot-water-preset="selectedHotWaterPreset"
        :flush-presets="flushPresets"
        :selected-flush-preset="selectedFlushPreset"
        @start-espresso="startEspresso"
        @start-steam="startSteam"
        @start-hot-water="startHotWater"
        @start-flush="startFlush"
        @workflow-combo-select="onComboSelect"
        @workflow-combo-long-press="onComboLongPress"
        @steam-preset-select="onSteamPresetSelect"
        @hot-water-preset-select="onHotWaterPresetSelect"
        @flush-preset-select="onFlushPresetSelect"
      />

      <!-- Action buttons (centerMain zone) -->
      <LayoutZone
        v-if="hasZone('centerMain')"
        :zone="zones.centerMain"
        :is-ready="isReady"
        :shot-plan-text="shotPlanText"
        :shot-plan-lines="shotPlanLines"
        :workflow-combos="workflowCombos"
        :selected-workflow-combo="selectedWorkflowCombo"
        :steam-presets="steamPresets"
        :selected-steam-preset="selectedSteamPreset"
        :hot-water-presets="hotWaterPresets"
        :selected-hot-water-preset="selectedHotWaterPreset"
        :flush-presets="flushPresets"
        :selected-flush-preset="selectedFlushPreset"
        @start-espresso="startEspresso"
        @start-steam="startSteam"
        @start-hot-water="startHotWater"
        @start-flush="startFlush"
        @workflow-combo-select="onComboSelect"
        @workflow-combo-long-press="onComboLongPress"
        @steam-preset-select="onSteamPresetSelect"
        @hot-water-preset-select="onHotWaterPresetSelect"
        @flush-preset-select="onFlushPresetSelect"
      />

      <!-- Workflow combo presets -->
      <div v-if="workflowCombos.length" class="idle-page__preset-section">
        <span class="idle-page__preset-label">Workflows</span>
        <PresetPillRow
          :presets="workflowCombos"
          :selected-index="selectedWorkflowCombo"
          :long-press-enabled="true"
          @select="onComboSelect"
          @long-press="onComboLongPress"
        />
      </div>
      <div v-else class="idle-page__preset-section">
        <button class="idle-page__new-combo-btn" @click="router.push('/bean-info')">
          + New Combo
        </button>
      </div>

      <!-- Quick-start presets -->
      <div v-if="steamPresets.length" class="idle-page__preset-section">
        <span class="idle-page__preset-label">{{ t('idle.steam') }}</span>
        <PresetPillRow
          :presets="steamPresets"
          :selected-index="selectedSteamPreset"
          @select="onSteamPresetSelect"
          @activate="startSteam"
        />
      </div>
      <div v-if="hotWaterPresets.length" class="idle-page__preset-section">
        <span class="idle-page__preset-label">{{ t('idle.hotWater') }}</span>
        <PresetPillRow
          :presets="hotWaterPresets"
          :selected-index="selectedHotWaterPreset"
          @select="onHotWaterPresetSelect"
          @activate="startHotWater"
        />
      </div>
      <div v-if="flushPresets.length" class="idle-page__preset-section">
        <span class="idle-page__preset-label">{{ t('idle.flush') }}</span>
        <PresetPillRow
          :presets="flushPresets"
          :selected-index="selectedFlushPreset"
          @select="onFlushPresetSelect"
          @activate="startFlush"
        />
      </div>

      <!-- Bottom bar zone (rendered inside center for vertical flow) -->
      <LayoutZone
        v-if="hasZone('bottomBar')"
        :zone="zones.bottomBar"
        :is-ready="isReady"
        :shot-plan-text="shotPlanText"
        :shot-plan-lines="shotPlanLines"
        :workflow-combos="workflowCombos"
        :selected-workflow-combo="selectedWorkflowCombo"
        :steam-presets="steamPresets"
        :selected-steam-preset="selectedSteamPreset"
        :hot-water-presets="hotWaterPresets"
        :selected-hot-water-preset="selectedHotWaterPreset"
        :flush-presets="flushPresets"
        :selected-flush-preset="selectedFlushPreset"
        @start-espresso="startEspresso"
        @start-steam="startSteam"
        @start-hot-water="startHotWater"
        @start-flush="startFlush"
        @workflow-combo-select="onComboSelect"
        @workflow-combo-long-press="onComboLongPress"
        @steam-preset-select="onSteamPresetSelect"
        @hot-water-preset-select="onHotWaterPresetSelect"
        @flush-preset-select="onFlushPresetSelect"
      />

      <!-- Extra zones (optional, configurable) -->
      <LayoutZone
        v-if="hasZone('extraTop')"
        :zone="zones.extraTop"
        :is-ready="isReady"
        :shot-plan-text="shotPlanText"
        :shot-plan-lines="shotPlanLines"
        :workflow-combos="workflowCombos"
        :selected-workflow-combo="selectedWorkflowCombo"
        :steam-presets="steamPresets"
        :selected-steam-preset="selectedSteamPreset"
        :hot-water-presets="hotWaterPresets"
        :selected-hot-water-preset="selectedHotWaterPreset"
        :flush-presets="flushPresets"
        :selected-flush-preset="selectedFlushPreset"
        @start-espresso="startEspresso"
        @start-steam="startSteam"
        @start-hot-water="startHotWater"
        @start-flush="startFlush"
        @workflow-combo-select="onComboSelect"
        @workflow-combo-long-press="onComboLongPress"
        @steam-preset-select="onSteamPresetSelect"
        @hot-water-preset-select="onHotWaterPresetSelect"
        @flush-preset-select="onFlushPresetSelect"
      />

      <LayoutZone
        v-if="hasZone('extraBottom')"
        :zone="zones.extraBottom"
        :is-ready="isReady"
        :shot-plan-text="shotPlanText"
        :shot-plan-lines="shotPlanLines"
        :workflow-combos="workflowCombos"
        :selected-workflow-combo="selectedWorkflowCombo"
        :steam-presets="steamPresets"
        :selected-steam-preset="selectedSteamPreset"
        :hot-water-presets="hotWaterPresets"
        :selected-hot-water-preset="selectedHotWaterPreset"
        :flush-presets="flushPresets"
        :selected-flush-preset="selectedFlushPreset"
        @start-espresso="startEspresso"
        @start-steam="startSteam"
        @start-hot-water="startHotWater"
        @start-flush="startFlush"
        @workflow-combo-select="onComboSelect"
        @workflow-combo-long-press="onComboLongPress"
        @steam-preset-select="onSteamPresetSelect"
        @hot-water-preset-select="onHotWaterPresetSelect"
        @flush-preset-select="onFlushPresetSelect"
      />
    </div>

    <!-- Combo quick edit popup (on long-press) -->
    <PresetEditPopup
      :visible="editPopupVisible"
      :preset="editPopupPreset"
      operation-type="combo"
      :is-existing="true"
      @save="onComboEditSave"
      @delete="onComboEditDelete"
      @cancel="onComboEditCancel"
    />
  </div>
</template>

<style scoped>
.idle-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
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

.idle-page__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-large);
  min-height: 0;
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

.idle-page__new-combo-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.idle-page__new-combo-btn:active {
  opacity: 0.7;
}

</style>
