<script setup>
import { ref, onMounted } from 'vue'
import ValueInput from '../ValueInput.vue'
import { getReaSettings, updateReaSettings } from '../../api/rest.js'

const reaSettings = ref(null)
const loading = ref(true)
const saving = ref(false)

const LOG_LEVELS = ['debug', 'info', 'warn', 'error']
const SCALE_POWER_MODES = ['disabled', 'displayOff', 'disconnect']

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
  font-size: 16px;
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
  font-size: 14px;
  color: var(--color-text-secondary);
}

.gateway-tab__value {
  font-size: 16px;
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
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-transform: capitalize;
  -webkit-tap-highlight-color: transparent;
}

.gateway-tab__seg--active {
  background: var(--color-primary);
  color: #fff;
}

.gateway-tab__loading,
.gateway-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
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
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.gateway-tab__saving {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}
</style>
