<script setup>
import { ref, inject, computed, onMounted } from 'vue'
import ValueInput from '../ValueInput.vue'
import { updateWaterLevelThreshold } from '../../api/rest.js'
import {
  getPresenceSchedules,
  getPresenceSettings,
  updatePresenceSettings,
  createPresenceSchedule,
  updatePresenceSchedule,
} from '../../api/rest.js'

const WATER_ML_PER_MM = 12.45

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings

// ---- Water level ----

const isML = computed(() => settings?.waterLevelDisplayUnit === 'ml')

const refillThresholdDisplay = computed({
  get: () => isML.value ? Math.round(settings.waterRefillThreshold * WATER_ML_PER_MM) : settings.waterRefillThreshold,
  set: (v) => {
    const mm = isML.value ? Math.round(v / WATER_ML_PER_MM) : v
    settings.waterRefillThreshold = mm
    updateWaterLevelThreshold(mm).catch(() => {})
  },
})

// ---- Auto-Wake Schedule (server-backed) ----

const DAYS = [
  { key: 'mon', label: 'Mon', iso: 1 },
  { key: 'tue', label: 'Tue', iso: 2 },
  { key: 'wed', label: 'Wed', iso: 3 },
  { key: 'thu', label: 'Thu', iso: 4 },
  { key: 'fri', label: 'Fri', iso: 5 },
  { key: 'sat', label: 'Sat', iso: 6 },
  { key: 'sun', label: 'Sun', iso: 7 },
]

const schedules = ref({})
const schedulesLoading = ref(true)

function findScheduleForDay(isoDay) {
  return Object.values(schedules.value).find(
    s => Array.isArray(s.daysOfWeek) && s.daysOfWeek.includes(isoDay)
  )
}

async function loadSchedules() {
  schedulesLoading.value = true
  try {
    const [scheduleData, presenceData] = await Promise.all([
      getPresenceSchedules(),
      getPresenceSettings(),
    ])
    const byId = {}
    const list = Array.isArray(scheduleData) ? scheduleData : (scheduleData?.schedules ?? [])
    for (const s of list) {
      if (s.id != null) byId[s.id] = s
    }
    schedules.value = byId
    if (presenceData?.userPresenceEnabled != null) {
      settings.autoWakeEnabled = presenceData.userPresenceEnabled
    }
  } catch {
    // Server may not support schedules API yet
  }
  schedulesLoading.value = false
}

async function toggleDay(isoDay) {
  const existing = findScheduleForDay(isoDay)
  if (existing) {
    try {
      const updated = await updatePresenceSchedule(existing.id, {
        ...existing,
        enabled: !existing.enabled,
      })
      schedules.value = { ...schedules.value, [existing.id]: updated ?? { ...existing, enabled: !existing.enabled } }
    } catch { /* ignore */ }
  } else {
    try {
      const created = await createPresenceSchedule({
        daysOfWeek: [isoDay],
        time: '07:00',
        enabled: true,
      })
      if (created?.id != null) {
        schedules.value = { ...schedules.value, [created.id]: created }
      }
    } catch { /* ignore */ }
  }
}

async function setDayTime(isoDay, time) {
  const existing = findScheduleForDay(isoDay)
  if (existing) {
    try {
      const updated = await updatePresenceSchedule(existing.id, {
        ...existing,
        time,
      })
      schedules.value = { ...schedules.value, [existing.id]: updated ?? { ...existing, time } }
    } catch { /* ignore */ }
  }
}

function isDayEnabled(isoDay) {
  const s = findScheduleForDay(isoDay)
  return s?.enabled ?? false
}

function getDayTime(isoDay) {
  const s = findScheduleForDay(isoDay)
  return s?.time ?? '07:00'
}

async function toggleAutoWake() {
  settings.autoWakeEnabled = !settings.autoWakeEnabled
  try {
    await updatePresenceSettings({ userPresenceEnabled: settings.autoWakeEnabled })
  } catch { /* ignore */ }
}

onMounted(loadSchedules)
</script>

<template>
  <div class="preferences-tab" v-if="settings">
    <div class="preferences-tab__grid">
      <!-- Column 1: Power & Sleep -->
      <div class="preferences-tab__column preferences-tab__column--wide">
        <h4 class="preferences-tab__section-title">Power &amp; Sleep</h4>

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

        <div class="preferences-tab__field">
          <label class="preferences-tab__label">Enable auto-wake</label>
          <button
            class="preferences-tab__toggle"
            :class="{ 'preferences-tab__toggle--on': settings.autoWakeEnabled }"
            @click="toggleAutoWake"
          >
            {{ settings.autoWakeEnabled ? 'ON' : 'OFF' }}
          </button>
        </div>

        <div v-if="schedulesLoading && settings.autoWakeEnabled" class="preferences-tab__hint">
          Loading schedules...
        </div>

        <div class="preferences-tab__schedule" v-if="settings.autoWakeEnabled && !schedulesLoading">
          <div
            v-for="day in DAYS"
            :key="day.key"
            class="preferences-tab__day-row"
          >
            <button
              class="preferences-tab__day-toggle"
              :class="{ 'preferences-tab__day-toggle--on': isDayEnabled(day.iso) }"
              @click="toggleDay(day.iso)"
            >
              {{ day.label }}
            </button>
            <input
              type="time"
              class="preferences-tab__time-input"
              :value="getDayTime(day.iso)"
              :disabled="!isDayEnabled(day.iso)"
              @change="e => setDayTime(day.iso, e.target.value)"
            />
          </div>
        </div>
      </div>

      <!-- Column 2: Water -->
      <div class="preferences-tab__column">
        <h4 class="preferences-tab__section-title">Water</h4>

        <div class="preferences-tab__field">
          <label class="preferences-tab__label">Water level display</label>
          <div class="preferences-tab__toggle-group">
            <button
              class="preferences-tab__seg"
              :class="{ 'preferences-tab__seg--active': settings.waterLevelDisplayUnit === 'mm' }"
              @click="settings.waterLevelDisplayUnit = 'mm'"
            >mm</button>
            <button
              class="preferences-tab__seg"
              :class="{ 'preferences-tab__seg--active': settings.waterLevelDisplayUnit === 'ml' }"
              @click="settings.waterLevelDisplayUnit = 'ml'"
            >mL</button>
          </div>
        </div>

        <div class="preferences-tab__field">
          <label class="preferences-tab__label">Refill threshold</label>
          <ValueInput
            :model-value="refillThresholdDisplay"
            @update:model-value="v => refillThresholdDisplay = v"
            :min="0"
            :max="isML ? 1500 : 120"
            :step="isML ? 50 : 5"
            :suffix="isML ? ' ml' : ' mm'"
          />
          <span class="preferences-tab__hint">Warn when water drops below this level</span>
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
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.preferences-tab__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preferences-tab__column--wide {
  min-width: 280px;
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

.preferences-tab__toggle-group {
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  width: fit-content;
}

.preferences-tab__seg {
  padding: 8px 20px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.preferences-tab__seg--active {
  background: var(--color-primary);
  color: #fff;
}

.preferences-tab__schedule {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preferences-tab__day-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preferences-tab__day-toggle {
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

.preferences-tab__day-toggle--on {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.preferences-tab__time-input {
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
}

.preferences-tab__time-input:disabled {
  opacity: 0.4;
  cursor: default;
}

.preferences-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
