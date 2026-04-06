<script setup>
import { ref, computed, inject, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LayoutWidget from '../components/LayoutWidget.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import LayoutEditOverlay from '../components/LayoutEditOverlay.vue'
import { useLayout } from '../composables/useLayout.js'
import { setMachineState, getProfiles } from '../api/rest.js'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

// Layout system
const { layout, loaded: layoutLoaded, load: loadLayout, STACK_ZONES } = useLayout()

// Injected from App.vue
const machineState = inject('machineState', ref('idle'))
const workflow = inject('workflow', null)
const updateWorkflow = inject('updateWorkflow')
const settings = inject('settings', null)
const toast = inject('toast', null)
const operationSettings = inject('operationSettings', null)

const editingLayout = inject('editingLayout', ref(false))

const isEditMode = computed(() => route.query.editLayout === 'true')

// Sync the editingLayout flag so App.vue suppresses auto-navigation
watch(isEditMode, (v) => { editingLayout.value = v }, { immediate: true })

onUnmounted(() => {
  editingLayout.value = false
})

const isReady = computed(() =>
  machineState.value === 'idle' || machineState.value === 'ready'
)

// Shot plan lines — from workflow data
const shotPlanLines = computed(() => {
  if (!workflow) return []
  const lines = []
  const ctx = workflow.context

  if (ctx) {
    const coffeeName = ctx.coffeeName
    const roaster = ctx.coffeeRoaster
    if (roaster && coffeeName) lines.push(`${roaster} — ${coffeeName}`)
    else if (coffeeName) lines.push(coffeeName)
    else if (roaster) lines.push(roaster)

    const doseIn = ctx.targetDoseWeight
    const doseOut = ctx.targetYield
    if (doseIn && doseOut) {
      const ratio = doseOut / doseIn
      lines.push(`${Number(doseIn).toFixed(1)}g in / ${Number(doseOut).toFixed(1)}g out (1:${ratio.toFixed(1)})`)
    } else if (doseIn) lines.push(`${Number(doseIn).toFixed(1)}g in`)
    else if (doseOut) lines.push(`${Number(doseOut).toFixed(1)}g out`)

    const grinderName = ctx.grinderModel
    const grinderSetting = ctx.grinderSetting
    if (grinderName && grinderSetting != null) lines.push(`${grinderName} @ ${grinderSetting}`)
    else if (grinderSetting != null) lines.push(`Grind: ${grinderSetting}`)
    else if (grinderName) lines.push(grinderName)
  }

  return lines
})

// ---- Workflow combos ----
const workflowCombos = computed(() => settings?.settings?.workflowCombos ?? [])
const selectedWorkflowCombo = computed(() => settings?.settings?.selectedWorkflowCombo ?? -1)

const editPopupVisible = ref(false)
const editPopupPreset = ref(null)
const editPopupIndex = ref(-1)

async function onComboSelect(index) {
  if (!settings) return
  settings.settings.selectedWorkflowCombo = index
  const combo = workflowCombos.value[index]
  if (!combo) return

  const update = {}

  if (combo.profileId) {
    try {
      const records = await getProfiles()
      const record = (Array.isArray(records) ? records : []).find(r => r.id === combo.profileId)
      if (record?.profile) {
        update.profile = record.profile
      } else {
        toast?.warning(`Profile "${combo.profileTitle || combo.profileId}" not found — keeping current profile`)
      }
    } catch {
      toast?.warning('Could not load profile — keeping current profile')
    }
  }

  const coffeeName = [combo.beanBrand, combo.beanType].filter(Boolean).join(' ')
  if (coffeeName || combo.roaster || combo.doseIn != null || combo.doseOut != null || combo.grinder || combo.grinderSetting) {
    update.context = {
      coffeeName: coffeeName || null,
      coffeeRoaster: combo.roaster || null,
      targetDoseWeight: combo.doseIn ?? undefined,
      targetYield: combo.doseOut ?? undefined,
      grinderModel: combo.grinder || null,
      grinderSetting: combo.grinderSetting != null ? String(combo.grinderSetting) : null,
    }
  }

  // Include operation settings in the single workflow update (avoids multiple rapid PUTs).
  // Suppress useOperationSettings watchers so settings mutations don't trigger extra API calls.
  operationSettings?.suppress()

  if (combo.steamSettings) {
    update.steamSettings = {
      targetTemperature: combo.steamSettings.temperature ?? settings.settings.steamTemperature ?? 160,
      duration: combo.steamSettings.duration ?? settings.settings.steamDuration ?? 30,
      flow: combo.steamSettings.flow ?? settings.settings.steamFlow ?? 1.5,
    }
    if (combo.steamSettings.duration != null) settings.settings.steamDuration = combo.steamSettings.duration
    if (combo.steamSettings.flow != null) settings.settings.steamFlow = combo.steamSettings.flow
    if (combo.steamSettings.temperature != null) settings.settings.steamTemperature = combo.steamSettings.temperature
  }

  if (combo.flushSettings) {
    update.rinseData = {
      targetTemperature: combo.flushSettings.temperature ?? settings.settings.flushTemperature ?? 90,
      duration: combo.flushSettings.duration ?? settings.settings.flushDuration ?? 5,
      flow: combo.flushSettings.flow ?? settings.settings.flushFlowRate ?? 6.0,
    }
    if (combo.flushSettings.duration != null) settings.settings.flushDuration = combo.flushSettings.duration
    if (combo.flushSettings.flow != null) settings.settings.flushFlowRate = combo.flushSettings.flow
  }

  if (combo.hotWaterSettings) {
    update.hotWaterData = {
      targetTemperature: combo.hotWaterSettings.temperature ?? settings.settings.hotWaterTemperature ?? 80,
      volume: combo.hotWaterSettings.volume ?? settings.settings.hotWaterVolume ?? 200,
      duration: settings.settings.hotWaterDuration ?? 60,
      flow: settings.settings.hotWaterFlow ?? 6.0,
    }
    if (combo.hotWaterSettings.volume != null) settings.settings.hotWaterVolume = combo.hotWaterSettings.volume
    if (combo.hotWaterSettings.temperature != null) settings.settings.hotWaterTemperature = combo.hotWaterSettings.temperature
  }

  // Re-enable watchers after settings are updated (nextTick ensures Vue has flushed)
  Promise.resolve().then(() => operationSettings?.unsuppress())

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

// ---- Quick-start presets ----
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

// ---- Layout helpers ----
const zones = computed(() => layout.value.zones)

function zoneWidgets(name) {
  return zones.value[name]?.widgets ?? []
}

function hasWidgets(name) {
  return zoneWidgets(name).length > 0
}

// Row visibility: collapse if both sides empty
const showTopRow = computed(() => hasWidgets('topLeft') || hasWidgets('topRight'))
const showBottomRow = computed(() => hasWidgets('bottomLeft') || hasWidgets('bottomRight'))
const hasCenterLeft = computed(() => hasWidgets('centerLeft'))
const hasCenterRight = computed(() => hasWidgets('centerRight'))

// Common props to pass to every LayoutWidget
const widgetEvents = {
  'start-espresso': startEspresso,
  'start-steam': startSteam,
  'start-hot-water': startHotWater,
  'start-flush': startFlush,
  'workflow-combo-select': onComboSelect,
  'workflow-combo-long-press': onComboLongPress,
  'steam-preset-select': onSteamPresetSelect,
  'hot-water-preset-select': onHotWaterPresetSelect,
  'flush-preset-select': onFlushPresetSelect,
}

onMounted(() => {
  loadLayout()
})
</script>

<template>
  <div class="idle-page" :class="{
    'idle-page--center-left-only': hasCenterLeft && !hasCenterRight,
    'idle-page--center-right-only': !hasCenterLeft && hasCenterRight,
    'idle-page--editing': isEditMode,
  }">
    <!-- Top row -->
    <template v-if="showTopRow">
      <div class="idle-page__top-left">
        <LayoutWidget
          v-for="(widgetType, i) in zoneWidgets('topLeft')"
          :key="'tl-' + i"
          :type="widgetType"
          :is-ready="isReady"
          :shot-plan-lines="shotPlanLines"
          :workflow-combos="workflowCombos"
          :selected-workflow-combo="selectedWorkflowCombo"
          :steam-presets="steamPresets"
          :selected-steam-preset="selectedSteamPreset"
          :hot-water-presets="hotWaterPresets"
          :selected-hot-water-preset="selectedHotWaterPreset"
          :flush-presets="flushPresets"
          :selected-flush-preset="selectedFlushPreset"
          v-on="widgetEvents"
        />
      </div>
      <div class="idle-page__top-right">
        <LayoutWidget
          v-for="(widgetType, i) in zoneWidgets('topRight')"
          :key="'tr-' + i"
          :type="widgetType"
          :is-ready="isReady"
          :shot-plan-lines="shotPlanLines"
          :workflow-combos="workflowCombos"
          :selected-workflow-combo="selectedWorkflowCombo"
          :steam-presets="steamPresets"
          :selected-steam-preset="selectedSteamPreset"
          :hot-water-presets="hotWaterPresets"
          :selected-hot-water-preset="selectedHotWaterPreset"
          :flush-presets="flushPresets"
          :selected-flush-preset="selectedFlushPreset"
          v-on="widgetEvents"
        />
      </div>
    </template>

    <!-- Center left column (widget stack) -->
    <div class="idle-page__center-left" v-if="hasCenterLeft">
      <LayoutWidget
        v-for="(widgetType, i) in zoneWidgets('centerLeft')"
        :key="'cl-' + i"
        :type="widgetType"
        :is-ready="isReady"
        :shot-plan-lines="shotPlanLines"
        :workflow-combos="workflowCombos"
        :selected-workflow-combo="selectedWorkflowCombo"
        :steam-presets="steamPresets"
        :selected-steam-preset="selectedSteamPreset"
        :hot-water-presets="hotWaterPresets"
        :selected-hot-water-preset="selectedHotWaterPreset"
        :flush-presets="flushPresets"
        :selected-flush-preset="selectedFlushPreset"
        v-on="widgetEvents"
      />
    </div>

    <!-- Center right column (widget stack) -->
    <div class="idle-page__center-right" v-if="hasCenterRight">
      <LayoutWidget
        v-for="(widgetType, i) in zoneWidgets('centerRight')"
        :key="'cr-' + i"
        :type="widgetType"
        :is-ready="isReady"
        :shot-plan-lines="shotPlanLines"
        :workflow-combos="workflowCombos"
        :selected-workflow-combo="selectedWorkflowCombo"
        :steam-presets="steamPresets"
        :selected-steam-preset="selectedSteamPreset"
        :hot-water-presets="hotWaterPresets"
        :selected-hot-water-preset="selectedHotWaterPreset"
        :flush-presets="flushPresets"
        :selected-flush-preset="selectedFlushPreset"
        v-on="widgetEvents"
      />
    </div>

    <!-- Bottom row -->
    <template v-if="showBottomRow">
      <div class="idle-page__bottom-left">
        <LayoutWidget
          v-for="(widgetType, i) in zoneWidgets('bottomLeft')"
          :key="'bl-' + i"
          :type="widgetType"
          :is-ready="isReady"
          :shot-plan-lines="shotPlanLines"
          :workflow-combos="workflowCombos"
          :selected-workflow-combo="selectedWorkflowCombo"
          :steam-presets="steamPresets"
          :selected-steam-preset="selectedSteamPreset"
          :hot-water-presets="hotWaterPresets"
          :selected-hot-water-preset="selectedHotWaterPreset"
          :flush-presets="flushPresets"
          :selected-flush-preset="selectedFlushPreset"
          v-on="widgetEvents"
        />
      </div>
      <div class="idle-page__bottom-right">
        <LayoutWidget
          v-for="(widgetType, i) in zoneWidgets('bottomRight')"
          :key="'br-' + i"
          :type="widgetType"
          :is-ready="isReady"
          :shot-plan-lines="shotPlanLines"
          :workflow-combos="workflowCombos"
          :selected-workflow-combo="selectedWorkflowCombo"
          :steam-presets="steamPresets"
          :selected-steam-preset="selectedSteamPreset"
          :hot-water-presets="hotWaterPresets"
          :selected-hot-water-preset="selectedHotWaterPreset"
          :flush-presets="flushPresets"
          :selected-flush-preset="selectedFlushPreset"
          v-on="widgetEvents"
        />
      </div>
    </template>

    <!-- Layout edit overlay -->
    <LayoutEditOverlay v-if="isEditMode" />

    <!-- Combo quick edit popup -->
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "top-left     top-right"
    "center-left  center-right"
    "bottom-left  bottom-right";
  min-height: 100%;
  padding: var(--margin-standard);
  gap: var(--spacing-large);
}

/* When only one center column has widgets, it spans full width */
.idle-page--center-left-only {
  grid-template-areas:
    "top-left     top-right"
    "center-left  center-left"
    "bottom-left  bottom-right";
}

.idle-page--center-right-only {
  grid-template-areas:
    "top-left      top-right"
    "center-right  center-right"
    "bottom-left   bottom-right";
}

.idle-page__top-left {
  grid-area: top-left;
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

.idle-page__top-right {
  grid-area: top-right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-medium);
}

.idle-page__center-left {
  grid-area: center-left;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-large);
  min-height: 0;
}

.idle-page__center-right {
  grid-area: center-right;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-large);
  min-height: 0;
}

.idle-page__bottom-left {
  grid-area: bottom-left;
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

.idle-page__bottom-right {
  grid-area: bottom-right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-medium);
}

/* Edit mode: dim all widgets, disable interaction */
.idle-page--editing > :not(.edit-overlay) {
  opacity: 0.5;
  filter: saturate(0.3);
  pointer-events: none;
}

.idle-page--editing {
  position: relative;
}
</style>
