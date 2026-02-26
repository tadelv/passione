<script setup>
import { inject } from 'vue'
import ValueInput from '../ValueInput.vue'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
</script>

<template>
  <div class="preferences-tab" v-if="settings">
    <div class="preferences-tab__grid">
      <!-- Column 1: Sleep & Auto -->
      <div class="preferences-tab__column">
        <h4 class="preferences-tab__section-title">Sleep &amp; Power</h4>

        <div class="preferences-tab__field">
          <label class="preferences-tab__label">Auto-sleep timeout</label>
          <select
            class="preferences-tab__select"
            :value="settings.autoSleepMinutes"
            @change="settings.autoSleepMinutes = Number($event.target.value)"
          >
            <option :value="0">Disabled</option>
            <option :value="15">15 minutes</option>
            <option :value="30">30 minutes</option>
            <option :value="45">45 minutes</option>
            <option :value="60">60 minutes</option>
          </select>
        </div>
      </div>

      <!-- Column 2: Steam & Scale -->
      <div class="preferences-tab__column">
        <h4 class="preferences-tab__section-title">Steam &amp; Scale</h4>

        <div class="preferences-tab__field">
          <label class="preferences-tab__label">Keep steam heater on</label>
          <button
            class="preferences-tab__toggle"
            :class="{ 'preferences-tab__toggle--on': settings.keepSteamHeaterOn }"
            @click="settings.keepSteamHeaterOn = !settings.keepSteamHeaterOn"
          >
            {{ settings.keepSteamHeaterOn ? 'ON' : 'OFF' }}
          </button>
        </div>

        <div class="preferences-tab__field">
          <label class="preferences-tab__label">Auto-flush after steam</label>
          <ValueInput
            :model-value="settings.steamAutoFlushSeconds"
            @update:model-value="v => settings.steamAutoFlushSeconds = v"
            :min="0"
            :max="60"
            :step="1"
            suffix="s"
          />
          <span class="preferences-tab__hint">0 = disabled</span>
        </div>
      </div>

      <!-- Column 3: Flush -->
      <div class="preferences-tab__column">
        <h4 class="preferences-tab__section-title">Flush</h4>

        <div class="preferences-tab__field">
          <label class="preferences-tab__label">Flush duration</label>
          <ValueInput
            :model-value="settings.flushDuration"
            @update:model-value="v => settings.flushDuration = v"
            :min="1"
            :max="30"
            :step="1"
            suffix="s"
          />
        </div>

        <div class="preferences-tab__field">
          <label class="preferences-tab__label">Flush flow rate</label>
          <ValueInput
            :model-value="settings.flushFlowRate"
            @update:model-value="v => settings.flushFlowRate = v"
            :min="1.0"
            :max="10.0"
            :step="0.5"
            :decimals="1"
            suffix=" mL/s"
          />
        </div>
      </div>
    </div>
  </div>
  <div v-else class="preferences-tab__empty">Settings not available.</div>
</template>

<style scoped>
.preferences-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preferences-tab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.preferences-tab__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preferences-tab__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.preferences-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preferences-tab__label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.preferences-tab__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.preferences-tab__select {
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.preferences-tab__toggle {
  width: 80px;
  height: 40px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.preferences-tab__toggle--on {
  background: var(--color-success);
  color: #fff;
  border-color: var(--color-success);
}

.preferences-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
