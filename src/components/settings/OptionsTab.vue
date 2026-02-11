<script setup>
import { inject, computed } from 'vue'
import ValueInput from '../ValueInput.vue'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings

const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
]

function toggleDay(dayKey) {
  const schedule = settings.autoWakeSchedule
  schedule[dayKey] = {
    ...schedule[dayKey],
    enabled: !schedule[dayKey].enabled,
  }
  settings.autoWakeSchedule = { ...schedule }
}

function setDayTime(dayKey, time) {
  const schedule = settings.autoWakeSchedule
  schedule[dayKey] = { ...schedule[dayKey], time }
  settings.autoWakeSchedule = { ...schedule }
}
</script>

<template>
  <div class="options-tab" v-if="settings">
    <div class="options-tab__grid">
      <!-- Column 1: Water & Machine -->
      <div class="options-tab__column">
        <h4 class="options-tab__section-title">Water &amp; Machine</h4>

        <div class="options-tab__field">
          <label class="options-tab__label">Water level display</label>
          <div class="options-tab__toggle-group">
            <button
              class="options-tab__seg"
              :class="{ 'options-tab__seg--active': settings.waterLevelDisplayUnit === '%' }"
              @click="settings.waterLevelDisplayUnit = '%'"
            >%</button>
            <button
              class="options-tab__seg"
              :class="{ 'options-tab__seg--active': settings.waterLevelDisplayUnit === 'ml' }"
              @click="settings.waterLevelDisplayUnit = 'ml'"
            >mL</button>
          </div>
        </div>

        <div class="options-tab__field">
          <label class="options-tab__label">Refill threshold</label>
          <ValueInput
            :model-value="settings.waterRefillThreshold"
            @update:model-value="v => settings.waterRefillThreshold = v"
            :min="0"
            :max="50"
            :step="5"
            suffix="%"
          />
          <span class="options-tab__hint">Warn when water drops below this level</span>
        </div>

        <div class="options-tab__field">
          <label class="options-tab__label">Headless mode</label>
          <button
            class="options-tab__toggle"
            :class="{ 'options-tab__toggle--on': settings.headlessMode }"
            @click="settings.headlessMode = !settings.headlessMode"
          >
            {{ settings.headlessMode ? 'ON' : 'OFF' }}
          </button>
          <span class="options-tab__hint">Run without attached display</span>
        </div>
      </div>

      <!-- Column 2: Auto-Wake Schedule -->
      <div class="options-tab__column options-tab__column--wide">
        <h4 class="options-tab__section-title">Auto-Wake Schedule</h4>

        <div class="options-tab__field">
          <label class="options-tab__label">Enable auto-wake</label>
          <button
            class="options-tab__toggle"
            :class="{ 'options-tab__toggle--on': settings.autoWakeEnabled }"
            @click="settings.autoWakeEnabled = !settings.autoWakeEnabled"
          >
            {{ settings.autoWakeEnabled ? 'ON' : 'OFF' }}
          </button>
        </div>

        <div class="options-tab__schedule" v-if="settings.autoWakeEnabled">
          <div
            v-for="day in DAYS"
            :key="day.key"
            class="options-tab__day-row"
          >
            <button
              class="options-tab__day-toggle"
              :class="{ 'options-tab__day-toggle--on': settings.autoWakeSchedule[day.key]?.enabled }"
              @click="toggleDay(day.key)"
            >
              {{ day.label }}
            </button>
            <input
              type="time"
              class="options-tab__time-input"
              :value="settings.autoWakeSchedule[day.key]?.time || '07:00'"
              :disabled="!settings.autoWakeSchedule[day.key]?.enabled"
              @change="e => setDayTime(day.key, e.target.value)"
            />
          </div>
        </div>

        <div class="options-tab__field" v-if="settings.autoWakeEnabled">
          <label class="options-tab__label">Stay awake after auto-wake</label>
          <ValueInput
            :model-value="settings.stayAwakeDuration"
            @update:model-value="v => settings.stayAwakeDuration = v"
            :min="5"
            :max="240"
            :step="5"
            suffix=" min"
          />
        </div>
      </div>
    </div>
  </div>
  <div v-else class="options-tab__empty">Settings not available.</div>
</template>

<style scoped>
.options-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.options-tab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.options-tab__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.options-tab__column--wide {
  min-width: 280px;
}

.options-tab__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.options-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.options-tab__label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.options-tab__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.options-tab__toggle-group {
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  width: fit-content;
}

.options-tab__seg {
  padding: 8px 20px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.options-tab__seg--active {
  background: var(--color-primary);
  color: #fff;
}

.options-tab__toggle {
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

.options-tab__toggle--on {
  background: var(--color-success);
  color: #fff;
  border-color: var(--color-success);
}

.options-tab__schedule {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.options-tab__day-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.options-tab__day-toggle {
  width: 48px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.options-tab__day-toggle--on {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.options-tab__time-input {
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
}

.options-tab__time-input:disabled {
  opacity: 0.4;
  cursor: default;
}

.options-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
