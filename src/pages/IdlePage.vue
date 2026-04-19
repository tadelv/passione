<script setup>
import { ref, computed, inject, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LayoutWidget from '../components/LayoutWidget.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import LayoutEditOverlay from '../components/LayoutEditOverlay.vue'
import { useLayout } from '../composables/useLayout.js'
import { isComboModifiedVsWorkflow } from '../composables/useComboDirty.js'
import { setMachineState } from '../api/rest.js'
import { useProfilesCache } from '../composables/useProfilesCache'

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

const profilesCache = useProfilesCache()

const isEditMode = computed(() => route.query.editLayout === 'true')

// Sync the editingLayout flag so App.vue suppresses auto-navigation
watch(isEditMode, (v) => { editingLayout.value = v }, { immediate: true })

onUnmounted(() => {
  editingLayout.value = false
})

const isReady = computed(() =>
  machineState.value === 'idle'
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

// "Modified" dot on the selected combo pill: true when the live workflow
// has diverged from the saved combo on any field the combo pinned. See
// useComboDirty.js for the lenient-compare rationale (fields the combo
// left null are skipped so combo switches don't falsely trip the dot).
const selectedComboModified = computed(() => {
  const idx = selectedWorkflowCombo.value
  if (idx < 0) return false
  const saved = workflowCombos.value[idx]
  return isComboModifiedVsWorkflow(saved, workflow)
})

const editPopupVisible = ref(false)
const editPopupPreset = ref(null)
const editPopupIndex = ref(-1)

async function onComboSelect(index) {
  if (!settings) return
  const combo = workflowCombos.value[index]
  if (!combo) return

  const previousIndex = settings.settings.selectedWorkflowCombo
  // Optimistic selection — reverted below if the workflow update fails.
  settings.settings.selectedWorkflowCombo = index

  const update = {}

  if (combo.profileId || combo.profileTitle) {
    const currentProfile = workflow?.profile
    const alreadyLoaded =
      (combo.profileId && currentProfile?.id === combo.profileId) ||
      (combo.profileTitle && currentProfile?.title === combo.profileTitle)
    if (!alreadyLoaded) {
      try {
        const records = await profilesCache.ensureLoaded()
        const allRecords = Array.isArray(records) ? records : []
        // Match by ID first, fall back to title match (Profile objects don't carry the ProfileRecord ID)
        const record = allRecords.find(r => r.id === combo.profileId)
          || (combo.profileTitle && allRecords.find(r => r.profile?.title === combo.profileTitle))
        if (record?.profile) {
          update.profile = record.profile
        } else {
          toast?.warning(`Profile "${combo.profileTitle || combo.profileId}" not found — keeping current profile`)
        }
      } catch {
        toast?.warning('Could not load profile — keeping current profile')
      }
    }
  }

  const coffeeName = combo.coffeeName || [combo.beanBrand, combo.beanType].filter(Boolean).join(' ')
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

  if (combo.includeSteam && combo.steamSettings) {
    update.steamSettings = {
      targetTemperature: combo.steamSettings.temperature ?? settings.settings.steamTemperature ?? 160,
      duration: combo.steamSettings.duration ?? settings.settings.steamDuration ?? 30,
      flow: combo.steamSettings.flow ?? settings.settings.steamFlow ?? 1.5,
    }
  }

  if (combo.includeFlush && combo.flushSettings) {
    update.rinseData = {
      targetTemperature: combo.flushSettings.temperature ?? settings.settings.flushTemperature ?? 90,
      duration: combo.flushSettings.duration ?? settings.settings.flushDuration ?? 5,
      flow: combo.flushSettings.flow ?? settings.settings.flushFlowRate ?? 6.0,
    }
  }

  if (combo.includeHotWater && combo.hotWaterSettings) {
    update.hotWaterData = {
      targetTemperature: combo.hotWaterSettings.temperature ?? settings.settings.hotWaterTemperature ?? 80,
      volume: combo.hotWaterSettings.volume ?? settings.settings.hotWaterVolume ?? 200,
      duration: settings.settings.hotWaterDuration ?? 60,
      flow: settings.settings.hotWaterFlow ?? 6.0,
    }
  }

  if (Object.keys(update).length === 0) {
    toast?.success(`Loaded ${combo.name || 'combo'}`)
    return
  }

  try {
    await updateWorkflow(update)
    // Mirror the server-confirmed workflow back into the local settings
    // cache so SteamPage / FlushPage / HotWaterPage read the freshly applied
    // values (and any clamping the gateway may have applied).
    operationSettings?.syncFromWorkflow?.()
    toast?.success(`Loaded ${combo.name || 'combo'}`)
  } catch {
    // Revert the optimistic selection so the UI doesn't lie about which
    // combo is active when the gateway rejected the update.
    settings.settings.selectedWorkflowCombo = previousIndex
    toast?.error(`Failed to load ${combo.name || 'combo'}`)
  }
}

function onComboEdit(index) {
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
  'workflow-combo-edit': onComboEdit,
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
          :selected-workflow-combo-modified="selectedComboModified"
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
          :selected-workflow-combo-modified="selectedComboModified"
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
        :selected-workflow-combo-modified="selectedComboModified"
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
        :selected-workflow-combo-modified="selectedComboModified"
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
          :selected-workflow-combo-modified="selectedComboModified"
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
          :selected-workflow-combo-modified="selectedComboModified"
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

/* ---- Mobile: collapse to single column ---- */
@media (max-width: 480px) {
  .idle-page {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto auto auto auto;
    grid-template-areas:
      "top-left"
      "top-right"
      "center-left"
      "center-right"
      "bottom-left"
      "bottom-right";
    gap: var(--spacing-medium);
  }

  .idle-page--center-left-only {
    grid-template-areas:
      "top-left"
      "top-right"
      "center-left"
      "bottom-left"
      "bottom-right";
  }

  .idle-page--center-right-only {
    grid-template-areas:
      "top-left"
      "top-right"
      "center-right"
      "bottom-left"
      "bottom-right";
  }

  .idle-page__top-right {
    justify-content: flex-start;
  }

  .idle-page__bottom-right {
    justify-content: flex-start;
  }
}

/* ---- Tablet portrait: keep 2-col but tighter ---- */
@media (min-width: 481px) and (max-width: 960px) {
  .idle-page {
    gap: var(--spacing-medium);
  }
}
</style>
