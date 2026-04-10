<script setup>
/**
 * LayoutWidget — Renders a single widget by type string.
 *
 * Used by IdlePage to render each widget in the layout grid.
 * All machine/scale/settings data is injected from App.vue provides.
 */
import { ref, computed, inject, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import CircularGauge from './CircularGauge.vue'
import ActionButton from './ActionButton.vue'
import ConnectionIndicator from './ConnectionIndicator.vue'
import PresetPillRow from './PresetPillRow.vue'
import { setMachineState, getLatestShot, getShot } from '../api/rest.js'
import { normalizeShot } from '../composables/useShotNormalize'
import { espressoIcon, steamIcon, hotWaterIcon, flushIcon } from '../assets/icons/operations.js'

const HistoryShotGraph = defineAsyncComponent(() => import('./HistoryShotGraph.vue'))

const props = defineProps({
  /** Widget type string */
  type: { type: String, required: true },
  /** Whether machine is ready for operations */
  isReady: { type: Boolean, default: false },
  /** Shot plan lines (structured multi-line) */
  shotPlanLines: { type: Array, default: () => [] },
  /** Workflow combos */
  workflowCombos: { type: Array, default: () => [] },
  /** Selected workflow combo index */
  selectedWorkflowCombo: { type: Number, default: -1 },
  /** Steam presets */
  steamPresets: { type: Array, default: () => [] },
  /** Selected steam preset index */
  selectedSteamPreset: { type: Number, default: -1 },
  /** Hot water presets */
  hotWaterPresets: { type: Array, default: () => [] },
  /** Selected hot water preset index */
  selectedHotWaterPreset: { type: Number, default: -1 },
  /** Flush presets */
  flushPresets: { type: Array, default: () => [] },
  /** Selected flush preset index */
  selectedFlushPreset: { type: Number, default: -1 },
})

const emit = defineEmits([
  'start-espresso',
  'start-steam',
  'start-hot-water',
  'start-flush',
  'workflow-combo-select',
  'workflow-combo-long-press',
  'steam-preset-select',
  'hot-water-preset-select',
  'flush-preset-select',
])

const { t } = useI18n()
const router = useRouter()

// Injected from App.vue
const machineConnected = inject('machineConnected', ref(false))
const scaleConnected = inject('scaleConnected', ref(false))
const temperature = inject('temperature', ref(0))
const steamTemperature = inject('steamTemperature', ref(0))
const waterLevelDisplay = inject('waterLevelDisplay', ref(''))
const waterLevelPercent = inject('waterLevelPercent', ref(0))
const profileName = inject('profileName', ref(''))
const scale = inject('scale', null)
const scaleWeight = inject('weight', ref(0))
const devices = inject('devices', null)

// ---- Clock ----
const clockTime = ref('')
let clockInterval = null

function updateClock() {
  const now = new Date()
  clockTime.value = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  if (props.type === 'clock') {
    updateClock()
    clockInterval = setInterval(updateClock, 1000)
  }
  if (props.type === 'lastShot') {
    fetchLastShot()
  }
})

onUnmounted(() => {
  if (clockInterval) {
    clearInterval(clockInterval)
    clockInterval = null
  }
})

// ---- Fullscreen ----
const isFullscreen = ref(!!document.fullscreenElement || !!document.webkitFullscreenElement)

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen
    if (exit) exit.call(document).catch(() => {})
  } else {
    const el = document.documentElement
    const req = el.requestFullscreen || el.webkitRequestFullscreen
    if (req) req.call(el).catch(() => {})
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement || !!document.webkitFullscreenElement
}

onMounted(() => {
  if (props.type === 'fullscreen' || props.type === 'statusInfo') {
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
  }
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
})

// ---- Last Shot ----
const lastShot = ref(null)
const machineState = inject('machineState', ref(''))
let lastShotRefreshTimer = null

async function fetchLastShot() {
  try {
    const summary = await getLatestShot()
    if (summary?.id) {
      // Summary lacks measurements — fetch full shot for chart data
      lastShot.value = await getShot(summary.id)
    } else {
      lastShot.value = null
    }
  } catch {
    lastShot.value = null
  }
}

// Re-fetch last shot when espresso ends — delay to allow ReaPrime to save it
watch(machineState, (newState, oldState) => {
  if (props.type !== 'lastShot') return
  if (oldState === 'espresso' && newState === 'idle') {
    clearTimeout(lastShotRefreshTimer)
    lastShotRefreshTimer = setTimeout(fetchLastShot, 3000)
  }
})

// Retry last shot fetch when machine connects (covers cold-start race)
watch(machineConnected, (connected) => {
  if (props.type !== 'lastShot') return
  if (connected && !lastShot.value) {
    fetchLastShot()
  }
})

onUnmounted(() => {
  clearTimeout(lastShotRefreshTimer)
})

const lastShotInfo = computed(() => {
  const raw = lastShot.value
  if (!raw) return {}
  const s = normalizeShot(raw)

  const coffeeName = [s.coffeeRoaster, s.coffeeName].filter(Boolean).join(' — ') || null

  let dose = null
  if (s.doseIn && s.doseOut) {
    const ratio = s.doseOut / s.doseIn
    dose = `${Number(s.doseIn).toFixed(1)}g in / ${Number(s.doseOut).toFixed(1)}g out (1:${ratio.toFixed(1)})`
  } else if (s.doseIn) {
    dose = `${Number(s.doseIn).toFixed(1)}g in`
  }

  let grinderText = null
  if (s.grinderModel && s.grinderSetting) grinderText = `${s.grinderModel} @ ${s.grinderSetting}`
  else if (s.grinderSetting) grinderText = `Grind: ${s.grinderSetting}`
  else if (s.grinderModel) grinderText = s.grinderModel

  const duration = s.duration ? `${Number(s.duration).toFixed(0)}s` : null

  return { profile: s.profileName, coffee: coffeeName, dose, grinder: grinderText, duration }
})
</script>

<template>
  <div class="layout-widget" :class="`layout-widget--${type}`">
    <!-- Gauge -->
    <template v-if="type === 'gauge'">
      <CircularGauge
        :value="temperature"
        :min="0"
        :max="110"
        unit="&deg;C"
        :label="t('common.group')"
        color="var(--color-temperature)"
        :size="120"
      />
    </template>

    <!-- Steam gauge -->
    <template v-else-if="type === 'steamGauge'">
      <CircularGauge
        :value="steamTemperature"
        :min="0"
        :max="170"
        unit="&deg;C"
        :label="t('idle.steam')"
        color="var(--color-accent)"
        :size="120"
      />
    </template>

    <!-- Water level gauge -->
    <template v-else-if="type === 'waterGauge'">
      <CircularGauge
        :value="waterLevelPercent"
        :min="0"
        :max="100"
        unit="%"
        label="Water"
        color="var(--color-flow)"
        :size="120"
      />
    </template>

    <!-- Action buttons -->
    <template v-else-if="type === 'actionButtons'">
      <div class="layout-widget__actions">
        <ActionButton :icon="espressoIcon" :label="t('idle.espresso')" :disabled="!isReady" @click="emit('start-espresso')" />
        <ActionButton :icon="steamIcon" :label="t('idle.steam')" color="var(--color-accent)" :disabled="!isReady" @click="emit('start-steam')" />
        <ActionButton :icon="hotWaterIcon" :label="t('idle.hotWater')" color="var(--color-flow)" :disabled="!isReady" @click="emit('start-hot-water')" />
        <ActionButton :icon="flushIcon" :label="t('idle.flush')" color="var(--color-success)" :disabled="!isReady" @click="emit('start-flush')" />
      </div>
    </template>

    <!-- Shot plan -->
    <template v-else-if="type === 'shotPlan'">
      <div class="layout-widget__shot-plan" role="button" tabindex="0" @click="router.push('/bean-info')" @keydown.enter="router.push('/bean-info')" @keydown.space.prevent="router.push('/bean-info')">
        <div v-if="profileName" class="layout-widget__profile" @click.stop="router.push('/profiles')">
          {{ profileName }}
        </div>
        <div v-for="(line, i) in shotPlanLines" :key="i" class="layout-widget__plan-text">
          {{ line }}
        </div>
      </div>
    </template>

    <!-- Last Shot -->
    <template v-else-if="type === 'lastShot'">
      <div v-if="lastShot" class="layout-widget__last-shot" role="button" tabindex="0" @click="router.push(`/shot/${encodeURIComponent(lastShot.id)}`)" @keydown.enter="router.push(`/shot/${encodeURIComponent(lastShot.id)}`)" @keydown.space.prevent="router.push(`/shot/${encodeURIComponent(lastShot.id)}`)">
        <span class="layout-widget__section-label">Last Shot</span>
        <div class="layout-widget__last-shot-card">
          <div class="layout-widget__last-shot-chart">
            <HistoryShotGraph :shot="lastShot" />
          </div>
          <div class="layout-widget__last-shot-info">
            <span v-if="lastShotInfo.profile" class="layout-widget__last-shot-profile">{{ lastShotInfo.profile }}</span>
            <span v-if="lastShotInfo.coffee" class="layout-widget__last-shot-detail">{{ lastShotInfo.coffee }}</span>
            <span v-if="lastShotInfo.dose" class="layout-widget__last-shot-detail">{{ lastShotInfo.dose }}</span>
            <span v-if="lastShotInfo.grinder" class="layout-widget__last-shot-detail">{{ lastShotInfo.grinder }}</span>
            <span v-if="lastShotInfo.duration" class="layout-widget__last-shot-detail">{{ lastShotInfo.duration }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Workflow Presets -->
    <template v-else-if="type === 'workflowPresets'">
      <div v-if="workflowCombos.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">Workflows</span>
        <PresetPillRow
          :presets="workflowCombos"
          :selected-index="selectedWorkflowCombo"
          :long-press-enabled="true"
          @select="idx => emit('workflow-combo-select', idx)"
          @activate="() => emit('start-espresso')"
          @long-press="idx => emit('workflow-combo-long-press', idx)"
        />
      </div>
      <div v-else class="layout-widget__preset-section">
        <button class="layout-widget__new-combo-btn" @click="router.push('/bean-info')">
          + New Combo
        </button>
      </div>
    </template>

    <!-- Steam Presets -->
    <template v-else-if="type === 'steamPresets'">
      <div v-if="steamPresets.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">{{ t('idle.steam') }}</span>
        <PresetPillRow
          :presets="steamPresets"
          :selected-index="selectedSteamPreset"
          @select="idx => emit('steam-preset-select', idx)"
          @activate="() => emit('start-steam')"
        />
      </div>
    </template>

    <!-- Hot Water Presets -->
    <template v-else-if="type === 'hotWaterPresets'">
      <div v-if="hotWaterPresets.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">{{ t('idle.hotWater') }}</span>
        <PresetPillRow
          :presets="hotWaterPresets"
          :selected-index="selectedHotWaterPreset"
          @select="idx => emit('hot-water-preset-select', idx)"
          @activate="() => emit('start-hot-water')"
        />
      </div>
    </template>

    <!-- Flush Presets -->
    <template v-else-if="type === 'flushPresets'">
      <div v-if="flushPresets.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">{{ t('idle.flush') }}</span>
        <PresetPillRow
          :presets="flushPresets"
          :selected-index="selectedFlushPreset"
          @select="idx => emit('flush-preset-select', idx)"
          @activate="() => emit('start-flush')"
        />
      </div>
    </template>

    <!-- Clock -->
    <template v-else-if="type === 'clock'">
      <div class="layout-widget__clock">
        {{ clockTime }}
      </div>
    </template>

    <!-- Water Level -->
    <template v-else-if="type === 'waterLevel'">
      <div class="layout-widget__water">
        <div class="layout-widget__water-bar">
          <div class="layout-widget__water-fill" :style="{ transform: 'scaleY(' + waterLevelPercent / 100 + ')' }" />
        </div>
        <span class="layout-widget__water-label">{{ waterLevelDisplay }}</span>
      </div>
    </template>

    <!-- Status Info (connection + scale + water + fullscreen) -->
    <template v-else-if="type === 'statusInfo'">
      <div class="layout-widget__status-info">
        <div class="layout-widget__connection">
          <ConnectionIndicator
            :connected="machineConnected"
            :size="12"
            :detail="machineConnected && scaleConnected ? t('idle.machineAndScale') : machineConnected ? t('idle.machine') : ''"
          />
          <span class="layout-widget__connection-label">
            {{ machineConnected ? t('common.online') : t('common.offline') }}
          </span>
        </div>
        <div class="layout-widget__scale-info">
          <template v-if="scaleConnected">
            <span class="layout-widget__scale-weight">{{ scaleWeight.toFixed(1) }}g</span>
            <span v-if="scale?.batteryLevel?.value != null" class="layout-widget__scale-battery">{{ scale.batteryLevel.value }}%</span>
            <button class="layout-widget__scale-btn" @click="scale?.tare().catch(() => {})">Tare</button>
          </template>
          <template v-else>
            <span class="layout-widget__scale-disconnected">No scale</span>
            <button class="layout-widget__scale-btn" :disabled="devices?.scanning?.value" @click="devices?.scan({ connect: true })">
              {{ devices?.scanning?.value ? 'Scanning...' : 'Scan' }}
            </button>
          </template>
        </div>
        <div class="layout-widget__water">
          <div class="layout-widget__water-bar">
            <div class="layout-widget__water-fill" :style="{ transform: 'scaleY(' + waterLevelPercent / 100 + ')' }" />
          </div>
          <span class="layout-widget__water-label">{{ waterLevelDisplay }}</span>
        </div>
        <button class="layout-widget__fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'">
          <svg v-if="!isFullscreen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </template>

    <!-- Nav Buttons -->
    <template v-else-if="type === 'navButtons'">
      <div class="layout-widget__nav">
        <button class="layout-widget__nav-btn" @click="router.push('/bean-info')">{{ t('idle.beans') }}</button>
        <button class="layout-widget__nav-btn" @click="router.push('/history')">{{ t('idle.history') }}</button>
        <button class="layout-widget__nav-btn" @click="router.push('/settings')">{{ t('idle.settings') }}</button>
        <button class="layout-widget__nav-btn layout-widget__nav-btn--sleep" @click="setMachineState('sleeping').catch(() => {})">{{ t('idle.sleep') }}</button>
      </div>
    </template>

    <!-- Connection Status -->
    <template v-else-if="type === 'connectionStatus'">
      <div class="layout-widget__connection">
        <ConnectionIndicator
          :connected="machineConnected"
          :size="12"
          :detail="machineConnected && scaleConnected ? t('idle.machineAndScale') : machineConnected ? t('idle.machine') : ''"
        />
        <span class="layout-widget__connection-label">
          {{ machineConnected ? t('common.online') : t('common.offline') }}
        </span>
      </div>
    </template>

    <!-- Scale Info -->
    <template v-else-if="type === 'scaleInfo'">
      <div class="layout-widget__scale-info">
        <template v-if="scaleConnected">
          <span class="layout-widget__scale-weight">{{ scaleWeight.toFixed(1) }}g</span>
          <span v-if="scale?.batteryLevel?.value != null" class="layout-widget__scale-battery">{{ scale.batteryLevel.value }}%</span>
          <button class="layout-widget__scale-btn" @click="scale?.tare().catch(() => {})">Tare</button>
        </template>
        <template v-else>
          <span class="layout-widget__scale-disconnected">No scale</span>
          <button class="layout-widget__scale-btn" :disabled="devices?.scanning?.value" @click="devices?.scan({ connect: true })">
            {{ devices?.scanning?.value ? 'Scanning...' : 'Scan' }}
          </button>
        </template>
      </div>
    </template>

    <!-- Fullscreen Toggle -->
    <template v-else-if="type === 'fullscreen'">
      <button class="layout-widget__fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'">
        <svg v-if="!isFullscreen" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
    </template>
  </div>
</template>

<style scoped>
.layout-widget {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- Action buttons ---- */
.layout-widget__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-medium);
}

/* ---- Shot plan ---- */
.layout-widget__shot-plan {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.layout-widget__profile {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__plan-text {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__plan-text:active {
  opacity: 0.7;
}

/* ---- Last shot ---- */
.layout-widget__last-shot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  cursor: pointer;
}

.layout-widget__last-shot-card {
  display: flex;
  gap: var(--spacing-medium);
  width: 100%;
  max-width: 700px;
}

.layout-widget__last-shot-chart {
  flex: 1;
  min-width: 0;
  height: 180px;
}

.layout-widget__last-shot-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 140px;
  max-width: 200px;
}

.layout-widget__last-shot-profile {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layout-widget__last-shot-detail {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Preset sections ---- */
.layout-widget__preset-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.layout-widget__section-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.layout-widget__new-combo-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__new-combo-btn:active {
  opacity: 0.7;
}

/* ---- Clock ---- */
.layout-widget__clock {
  font-size: var(--font-value);
  font-weight: 300;
  color: var(--color-text);
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
}

/* ---- Water level ---- */
.layout-widget__water {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.layout-widget__water-bar {
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

.layout-widget__water-fill {
  width: 100%;
  height: 100%;
  background: var(--color-flow);
  border-radius: 0 0 3px 3px;
  transform-origin: bottom;
  transition: transform 0.3s ease;
}

.layout-widget__water-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

/* ---- Status info ---- */
.layout-widget__status-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

/* ---- Connection ---- */
.layout-widget__connection {
  display: flex;
  align-items: center;
  gap: 6px;
}

.layout-widget__connection-label {
  font-size: var(--font-label);
  font-weight: 600;
}

/* ---- Scale info ---- */
.layout-widget__scale-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.layout-widget__scale-weight {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.layout-widget__scale-battery {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.layout-widget__scale-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__scale-btn:active {
  opacity: 0.7;
}

.layout-widget__scale-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
}

.layout-widget__scale-disconnected {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

/* ---- Nav buttons ---- */
.layout-widget__nav {
  display: flex;
  gap: var(--spacing-medium);
}

.layout-widget__nav-btn {
  padding: 8px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__nav-btn:active {
  opacity: 0.7;
}

.layout-widget__nav-btn--sleep {
  border-color: var(--color-text-secondary);
  color: var(--color-text-secondary);
}

/* ---- Fullscreen toggle ---- */
.layout-widget__fullscreen-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__fullscreen-btn:active {
  opacity: 0.7;
}
</style>
