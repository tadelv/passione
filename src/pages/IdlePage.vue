<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LayoutZone from '../components/LayoutZone.vue'
import PresetPillRow from '../components/PresetPillRow.vue'
import ProfilePreviewPopup from '../components/ProfilePreviewPopup.vue'
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

  // Line 1: beans (roaster — brand/type, roast level)
  if (coffeeData) {
    const beanParts = [coffeeData.roaster, coffeeData.beanBrand ?? coffeeData.brand, coffeeData.beanType ?? coffeeData.type].filter(Boolean)
    if (beanParts.length) {
      let beanLine = beanParts.join(' — ')
      const roastLevel = coffeeData.roastLevel
      if (roastLevel) beanLine += ` (${roastLevel})`
      lines.push(beanLine)
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

// ---- Espresso favorite presets (two-step: tap to load profile, tap again to start) ----
const favoriteIds = computed(() => settings?.settings?.favoriteProfiles ?? [])
const allProfiles = ref([])
const espressoPresets = computed(() => {
  const ids = favoriteIds.value
  if (!ids.length || !allProfiles.value.length) return []
  const map = new Map(allProfiles.value.map(r => [r.id, r]))
  return ids.map(id => map.get(id)).filter(Boolean).map(r => ({
    name: r.profile?.title ?? 'Untitled',
    emoji: '',
    _record: r,
  }))
})
const selectedEspressoPreset = ref(-1)
const previewProfile = ref(null)
const previewVisible = ref(false)

async function loadFavoriteProfiles() {
  if (!favoriteIds.value.length) return
  try {
    const data = await getProfiles()
    allProfiles.value = Array.isArray(data) ? data : []
  } catch {
    allProfiles.value = []
  }
}

onMounted(() => {
  loadFavoriteProfiles()
  loadLayout()
})

function onEspressoPresetSelect(index) {
  const preset = espressoPresets.value[index]
  if (!preset) return
  // First tap: load profile into workflow
  selectedEspressoPreset.value = index
  updateWorkflow({ profile: preset._record.profile }).catch(() => {})
}

async function onEspressoPresetActivate() {
  // Second tap on selected: start espresso (only when machine is ready)
  if (!isReady.value) return
  await setMachineState('espresso').catch(() => {})
  router.push('/espresso')
}

function onEspressoPresetLongPress(index) {
  const preset = espressoPresets.value[index]
  if (!preset?._record) return
  previewProfile.value = preset._record.profile
  previewVisible.value = true
}

function onPreviewClose() {
  previewVisible.value = false
}

function onPreviewMoreInfo() {
  const idx = selectedEspressoPreset.value
  const preset = espressoPresets.value[idx]
  previewVisible.value = false
  if (preset?._record?.id) {
    router.push(`/profile-info/${encodeURIComponent(preset._record.id)}`)
  }
}

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
          :espresso-presets="espressoPresets"
          :selected-espresso-preset="selectedEspressoPreset"
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
          @espresso-preset-select="onEspressoPresetSelect"
          @espresso-preset-activate="onEspressoPresetActivate"
          @espresso-preset-long-press="onEspressoPresetLongPress"
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
        :espresso-presets="espressoPresets"
        :selected-espresso-preset="selectedEspressoPreset"
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
        @espresso-preset-select="onEspressoPresetSelect"
        @espresso-preset-activate="onEspressoPresetActivate"
        @espresso-preset-long-press="onEspressoPresetLongPress"
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
        :espresso-presets="espressoPresets"
        :selected-espresso-preset="selectedEspressoPreset"
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
        @espresso-preset-select="onEspressoPresetSelect"
        @espresso-preset-activate="onEspressoPresetActivate"
        @espresso-preset-long-press="onEspressoPresetLongPress"
        @steam-preset-select="onSteamPresetSelect"
        @hot-water-preset-select="onHotWaterPresetSelect"
        @flush-preset-select="onFlushPresetSelect"
      />

      <!-- Espresso favorite presets (always shown when available, part of center) -->
      <div v-if="espressoPresets.length" class="idle-page__preset-section">
        <span class="idle-page__preset-label">{{ t('idle.espresso') }}</span>
        <PresetPillRow
          :presets="espressoPresets"
          :selected-index="selectedEspressoPreset"
          :long-press-enabled="true"
          @select="onEspressoPresetSelect"
          @activate="onEspressoPresetActivate"
          @long-press="onEspressoPresetLongPress"
        />
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
        :espresso-presets="espressoPresets"
        :selected-espresso-preset="selectedEspressoPreset"
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
        @espresso-preset-select="onEspressoPresetSelect"
        @espresso-preset-activate="onEspressoPresetActivate"
        @espresso-preset-long-press="onEspressoPresetLongPress"
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
        :espresso-presets="espressoPresets"
        :selected-espresso-preset="selectedEspressoPreset"
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
        @espresso-preset-select="onEspressoPresetSelect"
        @espresso-preset-activate="onEspressoPresetActivate"
        @espresso-preset-long-press="onEspressoPresetLongPress"
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
        :espresso-presets="espressoPresets"
        :selected-espresso-preset="selectedEspressoPreset"
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
        @espresso-preset-select="onEspressoPresetSelect"
        @espresso-preset-activate="onEspressoPresetActivate"
        @espresso-preset-long-press="onEspressoPresetLongPress"
        @steam-preset-select="onSteamPresetSelect"
        @hot-water-preset-select="onHotWaterPresetSelect"
        @flush-preset-select="onFlushPresetSelect"
      />
    </div>

    <!-- Profile preview popup (on long-press of espresso preset) -->
    <ProfilePreviewPopup
      :visible="previewVisible"
      :profile="previewProfile"
      @close="onPreviewClose"
      @more-info="onPreviewMoreInfo"
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

</style>
