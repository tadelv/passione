<script setup>
import { ref, onMounted, inject } from 'vue'
import ValueInput from '../ValueInput.vue'
import SettingsToggle from './SettingsToggle.vue'
import { getReaSettings, updateReaSettings } from '../../api/rest.js'

const reaSettings = ref(null)
const loading = ref(true)
const saving = ref(false)
const toast = inject('toast', null)

// Decaid uses Java logging level names, not lowercase shell-style levels.
const LOG_LEVELS = ['FINEST', 'FINE', 'INFO', 'WARNING', 'SEVERE']
const SCALE_POWER_MODES = ['disabled', 'displayOff', 'disconnect']

const bridgeSettingsUrl = `${window.location.protocol}//${window.location.hostname}:8080/api/v1/plugins/settings.reaplugin/ui?backName=Passione`

async function loadSettings() {
  loading.value = true
  try {
    const data = await getReaSettings()
    reaSettings.value = data ?? {}
  } catch {
    reaSettings.value = null
  }
  loading.value = false
}

async function saveField(key, value) {
  if (!reaSettings.value) return
  const prev = reaSettings.value[key]
  reaSettings.value[key] = value
  saving.value = true
  try {
    await updateReaSettings({ [key]: value })
  } catch {
    reaSettings.value[key] = prev
    toast?.error?.('Failed to save Bridge setting')
  } finally {
    saving.value = false
  }
}

onMounted(loadSettings)
</script>

<template>
  <div class="gateway-tab">
    <div v-if="loading" class="gateway-tab__loading">Loading Bridge settings...</div>

    <div v-else-if="!reaSettings" class="gateway-tab__empty">
      Could not load Bridge settings.
      <button class="gateway-tab__retry-btn" @click="loadSettings">Retry</button>
    </div>

    <div v-else class="gateway-tab__grid">
      <!-- Column 1: General -->
      <div class="gateway-tab__column">
        <h4 class="gateway-tab__section-title">General</h4>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Bridge mode</label>
          <span class="gateway-tab__value">
            {{ reaSettings.gatewayMode ?? reaSettings.mode ?? 'N/A' }}
          </span>
        </div>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Log level</label>
          <div class="gateway-tab__seg-group">
            <button
              v-for="level in LOG_LEVELS"
              :key="level"
              class="gateway-tab__seg"
              :class="{ 'gateway-tab__seg--active': (reaSettings.logLevel ?? reaSettings.log_level) === level }"
              @click="saveField('logLevel', level)"
            >
              {{ level }}
            </button>
          </div>
        </div>
      </div>

      <!-- Column 2: Calibration -->
      <div class="gateway-tab__column">
        <h4 class="gateway-tab__section-title">Calibration</h4>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Weight flow multiplier</label>
          <ValueInput
            :model-value="reaSettings.weightFlowMultiplier ?? 1.0"
            @update:model-value="v => saveField('weightFlowMultiplier', v)"
            :min="0.1"
            :max="2.0"
            :step="0.01"
            :decimals="2"
            suffix="x"
          />
        </div>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Volume flow multiplier</label>
          <ValueInput
            :model-value="reaSettings.volumeFlowMultiplier ?? 1.0"
            @update:model-value="v => saveField('volumeFlowMultiplier', v)"
            :min="0.1"
            :max="2.0"
            :step="0.01"
            :decimals="2"
            suffix="x"
          />
        </div>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Hot water flow multiplier</label>
          <ValueInput
            :model-value="reaSettings.hotWaterFlowMultiplier ?? 1.0"
            @update:model-value="v => saveField('hotWaterFlowMultiplier', v)"
            :min="0.1"
            :max="2.0"
            :step="0.01"
            :decimals="2"
            suffix="x"
          />
        </div>
      </div>

      <!-- Column 3: Scale -->
      <div class="gateway-tab__column">
        <h4 class="gateway-tab__section-title">Scale</h4>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Scale power mode</label>
          <div class="gateway-tab__seg-group">
            <button
              v-for="mode in SCALE_POWER_MODES"
              :key="mode"
              class="gateway-tab__seg"
              :class="{ 'gateway-tab__seg--active': (reaSettings.scalePowerMode ?? reaSettings.scale_power_mode) === mode }"
              @click="saveField('scalePowerMode', mode)"
            >
              {{ mode }}
            </button>
          </div>
        </div>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Block tare during shot</label>
          <SettingsToggle
            :model-value="!!reaSettings.blockTareDuringShot"
            aria-label="Block tare during shot"
            @update:model-value="v => saveField('blockTareDuringShot', v)"
          />
        </div>
      </div>

      <!-- Column 4: Display -->
      <div class="gateway-tab__column">
        <h4 class="gateway-tab__section-title">Display</h4>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Dim screen on low battery</label>
          <SettingsToggle
            :model-value="!!reaSettings.lowBatteryBrightnessLimit"
            aria-label="Dim screen on low battery"
            @update:model-value="v => saveField('lowBatteryBrightnessLimit', v)"
          />
          <span class="gateway-tab__hint">Cap brightness at 20% when battery drops below 30%</span>
        </div>
      </div>
    </div>

    <div class="gateway-tab__links">
      <a
        :href="bridgeSettingsUrl"
        target="_blank"
        rel="noopener"
        class="gateway-tab__link"
      >
        Open Streamline-Bridge configuration
        <svg
          class="gateway-tab__link-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    </div>

    <span v-if="saving" class="gateway-tab__saving">Saving...</span>
  </div>
</template>

<style scoped>
.gateway-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gateway-tab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.gateway-tab__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gateway-tab__section-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.gateway-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gateway-tab__label {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

.gateway-tab__value {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  text-transform: capitalize;
}

.gateway-tab__seg-group {
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  width: fit-content;
}

.gateway-tab__seg {
  padding: 8px 16px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  text-transform: capitalize;
  -webkit-tap-highlight-color: transparent;
}

.gateway-tab__seg--active {
  background: var(--color-primary);
  color: var(--color-text);
}

.gateway-tab__loading,
.gateway-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.gateway-tab__retry-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
}

.gateway-tab__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.gateway-tab__links {
  padding-top: 8px;
}

.gateway-tab__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  min-height: 44px;
}

.gateway-tab__link:hover {
  color: var(--color-text);
}

.gateway-tab__link:active {
  opacity: 0.7;
}

.gateway-tab__link-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.gateway-tab__saving {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}
</style>
