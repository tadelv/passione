<script setup>
import { ref, onMounted } from 'vue'
import ValueInput from '../ValueInput.vue'
import { getReaSettings, updateReaSettings } from '../../api/rest.js'

const reaSettings = ref(null)
const loading = ref(true)
const saving = ref(false)

const LOG_LEVELS = ['debug', 'info', 'warn', 'error']
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
  reaSettings.value[key] = value
  saving.value = true
  try {
    await updateReaSettings({ [key]: value })
  } catch {
    // ignore
  }
  saving.value = false
}

onMounted(loadSettings)
</script>

<template>
  <div class="gateway-tab">
    <div v-if="loading" class="gateway-tab__loading">Loading gateway settings...</div>

    <div v-else-if="!reaSettings" class="gateway-tab__empty">
      Could not load gateway settings.
      <button class="gateway-tab__retry-btn" @click="loadSettings">Retry</button>
    </div>

    <div v-else class="gateway-tab__grid">
      <!-- Column 1: General -->
      <div class="gateway-tab__column">
        <h4 class="gateway-tab__section-title">General</h4>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Gateway mode</label>
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
          <label class="gateway-tab__label">Weight multiplier</label>
          <ValueInput
            :model-value="reaSettings.weightMultiplier ?? reaSettings.weight_multiplier ?? 1.0"
            @update:model-value="v => saveField('weightMultiplier', v)"
            :min="0.5"
            :max="2.0"
            :step="0.01"
            :decimals="2"
            suffix="x"
          />
        </div>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Flow multiplier</label>
          <ValueInput
            :model-value="reaSettings.flowMultiplier ?? reaSettings.flow_multiplier ?? 1.0"
            @update:model-value="v => saveField('flowMultiplier', v)"
            :min="0.5"
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
      </div>

      <!-- Column 4: Display -->
      <div class="gateway-tab__column">
        <h4 class="gateway-tab__section-title">Display</h4>

        <div class="gateway-tab__field">
          <label class="gateway-tab__label">Low battery brightness limit</label>
          <button
            class="gateway-tab__toggle"
            :class="{ 'gateway-tab__toggle--on': reaSettings.lowBatteryBrightnessLimit }"
            @click="saveField('lowBatteryBrightnessLimit', !reaSettings.lowBatteryBrightnessLimit)"
          >
            {{ reaSettings.lowBatteryBrightnessLimit ? 'ON' : 'OFF' }}
          </button>
          <span class="gateway-tab__hint">Cap brightness at 20% when battery drops below 30%</span>
        </div>
      </div>
    </div>

    <div class="gateway-tab__links">
      <a
        :href="bridgeSettingsUrl"
        target="_blank"
        rel="noopener"
        class="gateway-tab__link-btn"
      >
        Streamline-Bridge Settings
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

.gateway-tab__toggle {
  width: 80px;
  height: 40px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.gateway-tab__toggle--on {
  background: var(--color-success);
  color: var(--color-text);
  border-color: var(--color-success);
}

.gateway-tab__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.gateway-tab__links {
  padding-top: 8px;
}

.gateway-tab__link-btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-md);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.gateway-tab__link-btn:active {
  opacity: 0.7;
}

.gateway-tab__saving {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}
</style>
