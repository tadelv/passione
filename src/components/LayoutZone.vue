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

const props = defineProps({
  /** Zone configuration: { type: string, config?: object } */
  zone: { type: Object, required: true },
  /** Espresso presets (passed from IdlePage) */
  espressoPresets: { type: Array, default: () => [] },
  /** Selected espresso preset index */
  selectedEspressoPreset: { type: Number, default: -1 },
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
  /** Shot plan text */
  shotPlanText: { type: String, default: '' },
  /** Whether machine is ready for operations */
  isReady: { type: Boolean, default: false },
})

const emit = defineEmits([
  'start-espresso',
  'start-steam',
  'start-hot-water',
  'start-flush',
  'espresso-preset-select',
  'espresso-preset-activate',
  'espresso-preset-long-press',
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
        <div v-if="espressoPresets.length" class="layout-zone__preset-section">
          <span class="layout-zone__preset-label">{{ t('idle.espresso') }}</span>
          <PresetPillRow
            :presets="espressoPresets"
            :selected-index="selectedEspressoPreset"
            :long-press-enabled="true"
            @select="idx => emit('espresso-preset-select', idx)"
            @activate="() => emit('espresso-preset-activate')"
            @long-press="idx => emit('espresso-preset-long-press', idx)"
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

    <!-- Shot plan: profile name + dose + yield text -->
    <template v-else-if="zoneType === 'shotPlan'">
      <div class="layout-zone__shot-plan">
        <div v-if="profileName" class="layout-zone__profile" @click="router.push('/profiles')">
          {{ profileName }}
        </div>
        <div v-if="shotPlanText" class="layout-zone__plan-text" @click="router.push('/bean-info')">
          {{ shotPlanText }}
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
            :style="{ height: waterLevel + '%' }"
          />
        </div>
        <span class="layout-zone__water-label">{{ waterLevel }}%</span>
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
        :water-level="waterLevel"
        :profile-name="profileName"
      />
    </template>

    <!-- StatusInfo: connection + water level (default top bar in current IdlePage) -->
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
        <div class="layout-zone__water">
          <div class="layout-zone__water-bar">
            <div
              class="layout-zone__water-fill"
              :style="{ height: waterLevel + '%' }"
            />
          </div>
          <span class="layout-zone__water-label">{{ waterLevel }}%</span>
        </div>
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
  max-width: 80%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-zone__plan-text {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  text-align: center;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  max-width: 80%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* ---- Empty ---- */
.layout-zone__empty {
  min-height: 1px;
}
</style>
