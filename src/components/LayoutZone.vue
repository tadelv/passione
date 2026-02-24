<script setup>
/**
 * LayoutZone — Renders a single home screen zone based on its config.
 *
 * Accepts a zone configuration object { type, config? } and renders the
 * appropriate widget component. All machine/scale/settings data is
 * injected from App.vue provides.
 */
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import CircularGauge from './CircularGauge.vue'
import ActionButton from './ActionButton.vue'
import ConnectionIndicator from './ConnectionIndicator.vue'
import PresetPillRow from './PresetPillRow.vue'
import StatusBar from './StatusBar.vue'
import BottomBar from './BottomBar.vue'
import { setMachineState } from '../api/rest.js'

const props = defineProps({
  /** Zone configuration: { type: string, config?: object } */
  zone: { type: Object, required: true },
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
  /** Shot plan text (single-line fallback) */
  shotPlanText: { type: String, default: '' },
  /** Shot plan lines (structured multi-line) */
  shotPlanLines: { type: Array, default: () => [] },
  /** Whether machine is ready for operations */
  isReady: { type: Boolean, default: false },
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
const machineState = inject('machineState', ref('idle'))
const machineConnected = inject('machineConnected', ref(false))
const scaleConnected = inject('scaleConnected', ref(false))
const temperature = inject('temperature', ref(0))
const targetTemperature = inject('targetTemperature', ref(0))
const pressure = inject('pressure', ref(0))
const waterLevel = inject('waterLevel', ref(0))
const waterLevelDisplay = inject('waterLevelDisplay', ref(''))
const waterLevelPercent = inject('waterLevelPercent', ref(0))
const profileName = inject('profileName', ref(''))

// Clock time (updated every second when clock widget is active)
const clockTime = ref('')
let clockInterval = null

function startClock() {
  if (clockInterval) return
  updateClock()
  clockInterval = setInterval(updateClock, 1000)
}

function stopClock() {
  if (clockInterval) {
    clearInterval(clockInterval)
    clockInterval = null
  }
}

function updateClock() {
  const now = new Date()
  clockTime.value = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Start clock if this zone needs it
if (props.zone.type === 'clock') {
  startClock()
}

// Fullscreen toggle
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

// Listen for fullscreen changes to keep ref in sync
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement || !!document.webkitFullscreenElement
}
document.addEventListener('fullscreenchange', onFullscreenChange)
document.addEventListener('webkitfullscreenchange', onFullscreenChange)

// Scale info
const scale = inject('scale', null)
const scaleWeight = inject('weight', ref(0))
const devices = inject('devices', null)

const zoneType = computed(() => props.zone.type)
const zoneConfig = computed(() => props.zone.config ?? {})
</script>

<template>
  <div class="layout-zone" :class="`layout-zone--${zoneType}`">
    <!-- Gauge widget: CircularGauge showing group temperature -->
    <template v-if="zoneType === 'gauge'">
      <CircularGauge
        :value="temperature"
        :min="0"
        :max="110"
        unit="&deg;C"
        :label="zoneConfig.showLabel !== false ? t('common.group') : ''"
        color="var(--color-temperature)"
        :size="zoneConfig.size ?? 120"
      />
    </template>

    <!-- Action buttons: Espresso/Steam/HotWater/Flush -->
    <template v-else-if="zoneType === 'actionButtons'">
      <div class="layout-zone__actions">
        <ActionButton
          icon="&#9749;"
          :label="t('idle.espresso')"
          :disabled="!isReady"
          @click="emit('start-espresso')"
        />
        <ActionButton
          icon="&#9752;"
          :label="t('idle.steam')"
          color="var(--color-accent)"
          :disabled="!isReady"
          @click="emit('start-steam')"
        />
        <ActionButton
          icon="&#128167;"
          :label="t('idle.hotWater')"
          color="var(--color-flow)"
          :disabled="!isReady"
          @click="emit('start-hot-water')"
        />
        <ActionButton
          icon="&#127754;"
          :label="t('idle.flush')"
          color="var(--color-success)"
          :disabled="!isReady"
          @click="emit('start-flush')"
        />
      </div>
    </template>

    <!-- Preset pills: all preset rows (espresso, steam, hotwater, flush) -->
    <template v-else-if="zoneType === 'presetPills'">
      <div class="layout-zone__presets">
        <div v-if="workflowCombos.length" class="layout-zone__preset-section">
          <span class="layout-zone__preset-label">Workflows</span>
          <PresetPillRow
            :presets="workflowCombos"
            :selected-index="selectedWorkflowCombo"
            :long-press-enabled="true"
            @select="idx => emit('workflow-combo-select', idx)"
            @long-press="idx => emit('workflow-combo-long-press', idx)"
          />
        </div>
        <div v-if="steamPresets.length" class="layout-zone__preset-section">
          <span class="layout-zone__preset-label">{{ t('idle.steam') }}</span>
          <PresetPillRow
            :presets="steamPresets"
            :selected-index="selectedSteamPreset"
            @select="idx => emit('steam-preset-select', idx)"
            @activate="() => emit('start-steam')"
          />
        </div>
        <div v-if="hotWaterPresets.length" class="layout-zone__preset-section">
          <span class="layout-zone__preset-label">{{ t('idle.hotWater') }}</span>
          <PresetPillRow
            :presets="hotWaterPresets"
            :selected-index="selectedHotWaterPreset"
            @select="idx => emit('hot-water-preset-select', idx)"
            @activate="() => emit('start-hot-water')"
          />
        </div>
        <div v-if="flushPresets.length" class="layout-zone__preset-section">
          <span class="layout-zone__preset-label">{{ t('idle.flush') }}</span>
          <PresetPillRow
            :presets="flushPresets"
            :selected-index="selectedFlushPreset"
            @select="idx => emit('flush-preset-select', idx)"
            @activate="() => emit('start-flush')"
          />
        </div>
      </div>
    </template>

    <!-- Shot plan: profile name + beans + dose + grinder -->
    <template v-else-if="zoneType === 'shotPlan'">
      <div class="layout-zone__shot-plan" @click="router.push('/bean-info')">
        <div v-if="profileName" class="layout-zone__profile" @click.stop="router.push('/profiles')">
          {{ profileName }}
        </div>
        <div v-for="(line, i) in shotPlanLines" :key="i" class="layout-zone__plan-text">
          {{ line }}
        </div>
      </div>
    </template>

    <!-- Profile name only -->
    <template v-else-if="zoneType === 'profileName'">
      <div class="layout-zone__profile-name" @click="router.push('/profiles')">
        {{ profileName || '---' }}
      </div>
    </template>

    <!-- Clock -->
    <template v-else-if="zoneType === 'clock'">
      <div class="layout-zone__clock">
        {{ clockTime }}
      </div>
    </template>

    <!-- Water level indicator -->
    <template v-else-if="zoneType === 'waterLevel'">
      <div class="layout-zone__water">
        <div class="layout-zone__water-bar">
          <div
            class="layout-zone__water-fill"
            :style="{ height: waterLevelPercent + '%' }"
          />
        </div>
        <span class="layout-zone__water-label">{{ waterLevelDisplay }}</span>
      </div>
    </template>

    <!-- Connection status -->
    <template v-else-if="zoneType === 'connectionStatus'">
      <div class="layout-zone__connection">
        <ConnectionIndicator
          :connected="machineConnected"
          :size="12"
          :detail="machineConnected && scaleConnected ? t('idle.machineAndScale') : machineConnected ? t('idle.machine') : ''"
        />
        <span class="layout-zone__connection-label">
          {{ machineConnected ? t('common.online') : t('common.offline') }}
        </span>
      </div>
    </template>

    <!-- StatusBar: full status bar component -->
    <template v-else-if="zoneType === 'statusBar'">
      <StatusBar
        :machine-state="machineState"
        :machine-connected="machineConnected"
        :scale-connected="scaleConnected"
        :temperature="temperature"
        :target-temperature="targetTemperature"
        :profile-name="profileName"
      />
    </template>

    <!-- StatusInfo: connection + scale + water + fullscreen (default top bar) -->
    <template v-else-if="zoneType === 'statusInfo'">
      <div class="layout-zone__status-info">
        <div class="layout-zone__connection">
          <ConnectionIndicator
            :connected="machineConnected"
            :size="12"
            :detail="machineConnected && scaleConnected ? t('idle.machineAndScale') : machineConnected ? t('idle.machine') : ''"
          />
          <span class="layout-zone__connection-label">
            {{ machineConnected ? t('common.online') : t('common.offline') }}
          </span>
        </div>
        <div class="layout-zone__scale">
          <template v-if="scaleConnected">
            <span class="layout-zone__scale-weight">{{ scaleWeight.toFixed(1) }}g</span>
            <span v-if="scale?.batteryLevel?.value != null" class="layout-zone__scale-battery">{{ scale.batteryLevel.value }}%</span>
            <button class="layout-zone__scale-tare" @click="scale?.tare().catch(() => {})">Tare</button>
          </template>
          <template v-else>
            <span class="layout-zone__scale-disconnected">No scale</span>
            <button class="layout-zone__scale-scan" :disabled="devices?.scanning.value" @click="devices?.scan({ connect: true })">
              {{ devices?.scanning.value ? 'Scanning...' : 'Scan' }}
            </button>
          </template>
        </div>
        <div class="layout-zone__water">
          <div class="layout-zone__water-bar">
            <div
              class="layout-zone__water-fill"
              :style="{ height: waterLevelPercent + '%' }"
            />
          </div>
          <span class="layout-zone__water-label">{{ waterLevelDisplay }}</span>
        </div>
        <button class="layout-zone__fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'">
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

    <!-- BottomBar component -->
    <template v-else-if="zoneType === 'bottomBar'">
      <BottomBar :show-back-button="false" />
    </template>

    <!-- Nav buttons (default bottom bar in current IdlePage) -->
    <template v-else-if="zoneType === 'navButtons'">
      <div class="layout-zone__nav">
        <button class="layout-zone__nav-btn" @click="router.push('/bean-info')">
          {{ t('idle.beans') }}
        </button>
        <button class="layout-zone__nav-btn" @click="router.push('/history')">
          {{ t('idle.history') }}
        </button>
        <button class="layout-zone__nav-btn" @click="router.push('/settings')">
          {{ t('idle.settings') }}
        </button>
        <button class="layout-zone__nav-btn layout-zone__nav-btn--sleep" @click="setMachineState('sleeping').catch(() => {})">
          {{ t('idle.sleep') }}
        </button>
      </div>
    </template>

    <!-- Fullscreen toggle button -->
    <template v-else-if="zoneType === 'fullscreen'">
      <button class="layout-zone__fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'">
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

    <!-- Scale info: weight, battery, scan -->
    <template v-else-if="zoneType === 'scaleInfo'">
      <div class="layout-zone__scale">
        <template v-if="scaleConnected">
          <span class="layout-zone__scale-weight">{{ scaleWeight.toFixed(1) }}g</span>
          <span v-if="scale?.batteryLevel?.value != null" class="layout-zone__scale-battery">{{ scale.batteryLevel.value }}%</span>
          <button class="layout-zone__scale-tare" @click="scale?.tare().catch(() => {})">Tare</button>
        </template>
        <template v-else>
          <span class="layout-zone__scale-disconnected">No scale</span>
          <button class="layout-zone__scale-scan" :disabled="scanning" @click="startScan">
            {{ scanning ? 'Scanning...' : 'Scan' }}
          </button>
        </template>
      </div>
    </template>

    <!-- Empty / spacer -->
    <template v-else-if="zoneType === 'empty'">
      <div class="layout-zone__empty" />
    </template>
  </div>
</template>

<style scoped>
.layout-zone {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- Action buttons ---- */
.layout-zone__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-medium);
}

/* ---- Presets ---- */
.layout-zone__presets {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-medium);
  width: 100%;
}

.layout-zone__preset-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.layout-zone__preset-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ---- Shot plan ---- */
.layout-zone__shot-plan {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.layout-zone__profile {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-zone__plan-text {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-zone__plan-text:active {
  opacity: 0.7;
}

/* ---- Profile name ---- */
.layout-zone__profile-name {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* ---- Clock ---- */
.layout-zone__clock {
  font-size: 48px;
  font-weight: 300;
  color: var(--color-text);
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
}

/* ---- Water level ---- */
.layout-zone__water {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.layout-zone__water-bar {
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

.layout-zone__water-fill {
  width: 100%;
  background: var(--color-flow);
  border-radius: 0 0 3px 3px;
  transition: height 0.3s ease;
}

.layout-zone__water-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

/* ---- Connection status ---- */
.layout-zone__connection {
  display: flex;
  align-items: center;
  gap: 6px;
}

.layout-zone__connection-label {
  font-size: var(--font-label);
  font-weight: 600;
}

/* ---- Status info (combined connection + water) ---- */
.layout-zone__status-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

/* ---- Nav buttons ---- */
.layout-zone__nav {
  display: flex;
  gap: var(--spacing-medium);
}

.layout-zone__nav-btn {
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

.layout-zone__nav-btn:active {
  opacity: 0.7;
}

.layout-zone__nav-btn--sleep {
  border-color: var(--color-text-secondary);
  color: var(--color-text-secondary);
}

/* ---- Fullscreen toggle ---- */
.layout-zone__fullscreen-btn {
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

.layout-zone__fullscreen-btn:active {
  opacity: 0.7;
}

/* ---- Scale info ---- */
.layout-zone__scale {
  display: flex;
  align-items: center;
  gap: 8px;
}

.layout-zone__scale-weight {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.layout-zone__scale-battery {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.layout-zone__scale-tare,
.layout-zone__scale-scan {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-zone__scale-tare:active,
.layout-zone__scale-scan:active {
  opacity: 0.7;
}

.layout-zone__scale-scan:disabled {
  opacity: 0.5;
  cursor: default;
}

.layout-zone__scale-disconnected {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* ---- Empty ---- */
.layout-zone__empty {
  min-height: 1px;
}
</style>
