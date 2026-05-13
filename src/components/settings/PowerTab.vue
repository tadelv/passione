<script setup>
import { ref, inject, onMounted, onUnmounted } from 'vue'
import SettingsToggle from './SettingsToggle.vue'
import {
  getPresenceSchedules,
  getPresenceSettings,
  updatePresenceSettings,
  createPresenceSchedule,
  updatePresenceSchedule,
  deletePresenceSchedule,
} from '../../api/rest.js'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
const toast = inject('toast', null)

const DAYS = [
  { key: 'Mo', name: 'Monday', iso: 1 },
  { key: 'Tu', name: 'Tuesday', iso: 2 },
  { key: 'We', name: 'Wednesday', iso: 3 },
  { key: 'Th', name: 'Thursday', iso: 4 },
  { key: 'Fr', name: 'Friday', iso: 5 },
  { key: 'Sa', name: 'Saturday', iso: 6 },
  { key: 'Su', name: 'Sunday', iso: 7 },
]

const KEEP_AWAKE_OPTIONS = [
  { value: null, label: 'wake only' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hr' },
  { value: 120, label: '2 hr' },
  { value: 240, label: '4 hr' },
]

const schedules = ref([])
const loading = ref(true)
const sleepTimeoutMinutes = ref(30)
const confirmDeleteId = ref(null)
let confirmDeleteTimer = null

async function loadAll() {
  loading.value = true
  try {
    const [scheduleData, presenceData] = await Promise.all([
      getPresenceSchedules(),
      getPresenceSettings(),
    ])
    const list = Array.isArray(scheduleData) ? scheduleData : (scheduleData?.schedules ?? [])
    schedules.value = list.filter(s => s.id != null)
    if (presenceData?.sleepTimeoutMinutes != null) {
      sleepTimeoutMinutes.value = presenceData.sleepTimeoutMinutes
    }
  } catch {
    // Server may not support presence API
  }
  loading.value = false
}

async function setSleepTimeout(minutes) {
  const prev = sleepTimeoutMinutes.value
  sleepTimeoutMinutes.value = minutes
  try {
    await updatePresenceSettings({ sleepTimeoutMinutes: minutes })
    if (settings) settings.autoSleepMinutes = minutes
  } catch {
    sleepTimeoutMinutes.value = prev
    toast?.error('Failed to update auto-sleep')
  }
}

function findIndex(id) {
  return schedules.value.findIndex(s => s.id === id)
}

async function addSchedule() {
  try {
    const created = await createPresenceSchedule({
      time: '07:00',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      enabled: true,
    })
    if (created?.id) {
      schedules.value = [...schedules.value, created]
    }
  } catch {
    toast?.error('Failed to create schedule')
  }
}

async function updateScheduleField(id, fields) {
  const idx = findIndex(id)
  if (idx < 0) return
  const prev = schedules.value[idx]
  const updated = { ...prev, ...fields }
  const next = [...schedules.value]
  next[idx] = updated
  schedules.value = next
  try {
    const result = await updatePresenceSchedule(id, fields)
    if (result) {
      const next2 = [...schedules.value]
      next2[findIndex(id)] = result
      schedules.value = next2
    }
  } catch {
    const revert = [...schedules.value]
    const ri = findIndex(id)
    if (ri >= 0) revert[ri] = prev
    schedules.value = revert
    toast?.error('Failed to update schedule')
  }
}

async function removeSchedule(id) {
  const idx = findIndex(id)
  if (idx < 0) return
  const prev = schedules.value[idx]
  schedules.value = schedules.value.filter(s => s.id !== id)
  confirmDeleteId.value = null
  try {
    await deletePresenceSchedule(id)
  } catch {
    const list = [...schedules.value]
    list.splice(Math.min(idx, list.length), 0, prev)
    schedules.value = list
    toast?.error('Failed to delete schedule')
  }
}

function toggleDay(scheduleId, isoDay) {
  const schedule = schedules.value.find(s => s.id === scheduleId)
  if (!schedule) return
  const days = Array.isArray(schedule.daysOfWeek) ? [...schedule.daysOfWeek] : []
  const idx = days.indexOf(isoDay)
  if (idx >= 0) {
    if (days.length <= 1) return // Don't remove last day — use delete instead
    days.splice(idx, 1)
  } else {
    days.push(isoDay)
    days.sort()
  }
  updateScheduleField(scheduleId, { daysOfWeek: days })
}

function isDayActive(schedule, isoDay) {
  const days = schedule.daysOfWeek
  if (!Array.isArray(days) || days.length === 0) return true // legacy: empty = every day
  return days.includes(isoDay)
}

function isLastActiveDay(schedule, isoDay) {
  const days = schedule.daysOfWeek
  if (!Array.isArray(days)) return false
  return days.length === 1 && days[0] === isoDay
}

function normalizeTimeInput(raw) {
  // Accept "7", "07", "7:00", "0700", "7:5" etc. Return HH:MM or null.
  if (!raw) return null
  const s = String(raw).trim()
  let h, m
  if (s.includes(':')) {
    const [hh, mm = '0'] = s.split(':', 2)
    h = parseInt(hh, 10)
    m = parseInt(mm, 10)
  } else if (/^\d{3,4}$/.test(s)) {
    h = parseInt(s.slice(0, s.length - 2), 10)
    m = parseInt(s.slice(-2), 10)
  } else if (/^\d{1,2}$/.test(s)) {
    h = parseInt(s, 10)
    m = 0
  } else {
    return null
  }
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function setTime(scheduleId, time) {
  updateScheduleField(scheduleId, { time })
}

function commitTime(scheduleId, raw, currentValue) {
  const next = normalizeTimeInput(raw)
  if (!next) return currentValue || '07:00'
  if (next !== currentValue) setTime(scheduleId, next)
  return next
}

function onTimeInputBlur(e, schedule) {
  const normalized = commitTime(schedule.id, e.target.value, schedule.time)
  e.target.value = normalized
}

function onTimeInputKeydown(e, schedule) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.target.blur()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.target.value = schedule.time || '07:00'
    e.target.blur()
  }
}

function setKeepAwakeFor(scheduleId, value) {
  const keepAwakeFor = value > 0 ? value : null
  updateScheduleField(scheduleId, { keepAwakeFor })
}

function toggleEnabled(scheduleId) {
  const schedule = schedules.value.find(s => s.id === scheduleId)
  if (!schedule) return
  updateScheduleField(scheduleId, { enabled: !schedule.enabled })
}

function onCardClick(id, event) {
  if (event.detail >= 2) {
    confirmDeleteId.value = id
    clearTimeout(confirmDeleteTimer)
    confirmDeleteTimer = setTimeout(() => {
      confirmDeleteId.value = null
    }, 4000)
  }
}

onMounted(loadAll)

onUnmounted(() => {
  clearTimeout(confirmDeleteTimer)
})
</script>

<template>
  <div class="power-tab" v-if="settings">
    <!-- Auto-sleep row -->
    <div class="power-tab__row">
      <div>
        <div class="power-tab__label">Auto-sleep</div>
        <div class="power-tab__hint">Sleep after inactivity</div>
      </div>
      <select
        class="power-tab__select"
        :value="sleepTimeoutMinutes"
        @change="setSleepTimeout(Number($event.target.value))"
      >
        <option :value="0">Disabled</option>
        <option :value="15">15 min</option>
        <option :value="30">30 min</option>
        <option :value="45">45 min</option>
        <option :value="60">60 min</option>
      </select>
    </div>

    <!-- Wake Schedules -->
    <div class="power-tab__schedules-header">
      <div class="power-tab__label">Wake schedules</div>
    </div>

    <div v-if="loading" class="power-tab__hint">Loading schedules...</div>

    <template v-if="!loading">
      <div
        v-for="schedule in schedules"
        :key="schedule.id"
        class="power-tab__card"
        :class="{ 'power-tab__card--disabled': !schedule.enabled }"
        @click="onCardClick(schedule.id, $event)"
      >
        <div v-if="confirmDeleteId === schedule.id" class="power-tab__delete-confirm">
          <button class="power-tab__delete-btn" @click="removeSchedule(schedule.id)">
            Delete this schedule
          </button>
          <button class="power-tab__delete-cancel" @click="confirmDeleteId = null">
            Cancel
          </button>
        </div>

        <template v-else>
          <div class="power-tab__card-top">
            <div class="power-tab__card-left">
              <input
                type="text"
                class="power-tab__time-input"
                inputmode="numeric"
                pattern="^([01]\d|2[0-3]):[0-5]\d$"
                maxlength="5"
                aria-label="Wake time (24-hour, HH:MM)"
                :value="schedule.time || '07:00'"
                @blur="e => onTimeInputBlur(e, schedule)"
                @keydown="e => onTimeInputKeydown(e, schedule)"
                @click.stop
              />
              <select
                class="power-tab__awake-badge"
                :value="schedule.keepAwakeFor ?? ''"
                @change="e => setKeepAwakeFor(schedule.id, Number(e.target.value) || 0)"
                @click.stop
              >
                <option v-for="opt in KEEP_AWAKE_OPTIONS" :key="String(opt.value)" :value="opt.value ?? ''">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <SettingsToggle
              :model-value="!!schedule.enabled"
              :aria-label="schedule.enabled ? 'Disable schedule' : 'Enable schedule'"
              @update:model-value="() => toggleEnabled(schedule.id)"
              @click.stop
            />
          </div>

          <div class="power-tab__day-pills">
            <button
              v-for="day in DAYS"
              :key="day.iso"
              class="power-tab__pill"
              :class="{
                'power-tab__pill--active': isDayActive(schedule, day.iso),
                'power-tab__pill--last': isLastActiveDay(schedule, day.iso),
              }"
              :aria-label="'Toggle ' + day.name"
              @click.stop="toggleDay(schedule.id, day.iso)"
            >
              {{ day.key }}
            </button>
          </div>
        </template>
      </div>

      <button class="power-tab__add-btn" @click="addSchedule">
        <span class="power-tab__add-icon">+</span> Add schedule
      </button>
    </template>
  </div>
  <div v-else class="power-tab__empty">Settings not available.</div>
</template>

<style scoped>
.power-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 640px;
}

.power-tab__label {
  font-size: var(--font-md);
  color: var(--color-text);
  font-weight: 600;
}

.power-tab__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
  margin-top: 2px;
}

.power-tab__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--color-surface);
  border-radius: 10px;
  gap: 16px;
}

.power-tab__select {
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-md);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.power-tab__schedules-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.power-tab__card {
  position: relative;
  background: var(--color-surface);
  border-radius: 10px;
  padding: 14px;
  border: 1px solid var(--color-border);
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  transition: opacity 0.15s ease;
}

.power-tab__card--disabled {
  color: var(--button-disabled-text);
  pointer-events: none;
}

.power-tab__card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.power-tab__card-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.power-tab__time-input {
  width: 5ch;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-title);
  font-weight: 600;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
  text-align: left;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}

.power-tab__time-input:hover {
  border-color: var(--color-border);
}

.power-tab__time-input:focus {
  outline: none;
  border-color: var(--color-primary);
  background: var(--color-background);
}

.power-tab__time-input:invalid {
  color: var(--color-error);
}

.power-tab__awake-badge {
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.power-tab__day-pills {
  display: flex;
  gap: 4px;
}

.power-tab__pill {
  min-width: 44px;
  min-height: 44px;
  padding: 0 6px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.power-tab__pill--active {
  background: var(--color-primary);
  color: var(--color-text);
  border-color: var(--color-primary);
}

.power-tab__pill--last {
  cursor: default;
  opacity: 0.7;
}

.power-tab__delete-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 72px;
}

.power-tab__delete-btn {
  padding: 10px 18px;
  border-radius: 8px;
  border: none;
  background: var(--color-danger, #e94560);
  color: #fff;
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.power-tab__delete-cancel {
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.power-tab__add-btn {
  width: 100%;
  min-height: 44px;
  border-radius: 8px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  -webkit-tap-highlight-color: transparent;
}

.power-tab__add-btn:active {
  background: var(--color-surface);
}

.power-tab__add-icon {
  font-size: var(--font-body);
}

.power-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
