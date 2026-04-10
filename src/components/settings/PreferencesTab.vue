<script setup>
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import ValueInput from '../ValueInput.vue'
import {
  updateWaterLevelThreshold,
  getPresenceSchedules,
  getPresenceSettings,
  updatePresenceSettings,
  createPresenceSchedule,
  updatePresenceSchedule,
  deletePresenceSchedule,
} from '../../api/rest.js'

// DE1 tank CAD-derived lookup table (same as App.vue)
const WATER_MM_TO_ML = [
  0, 16, 43, 70, 97, 124, 151, 179, 206, 233,
  261, 288, 316, 343, 371, 398, 426, 453, 481, 509,
  537, 564, 592, 620, 648, 676, 704, 732, 760, 788,
  816, 844, 872, 900, 929, 957, 985, 1013, 1042, 1070,
  1104, 1138, 1172, 1207, 1242, 1277, 1312, 1347, 1382, 1417,
  1453, 1488, 1523, 1559, 1594, 1630, 1665, 1701, 1736, 1772,
  1808, 1843, 1879, 1915, 1951, 1986,
]
const WATER_SENSOR_OFFSET_MM = 5

function waterMmToMl(rawMm) {
  const mm = Math.max(0, rawMm + WATER_SENSOR_OFFSET_MM)
  const idx = Math.min(Math.floor(mm), WATER_MM_TO_ML.length - 1)
  return WATER_MM_TO_ML[idx]
}

function waterMlToMm(ml) {
  for (let i = WATER_MM_TO_ML.length - 1; i >= 0; i--) {
    if (WATER_MM_TO_ML[i] <= ml) return Math.max(0, i - WATER_SENSOR_OFFSET_MM)
  }
  return 0
}

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
const toast = inject('toast', null)

// ---- Water level ----

const isML = computed(() => settings?.waterLevelDisplayUnit === 'ml')

const refillThresholdDisplay = computed({
  get: () => isML.value ? waterMmToMl(settings.waterRefillThreshold) : settings.waterRefillThreshold,
  set: (v) => {
    const mm = isML.value ? waterMlToMm(v) : v
    settings.waterRefillThreshold = mm
    updateWaterLevelThreshold(mm).catch(() => {})
  },
})

// ---- Power & Sleep (server-backed) ----

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

// ---- Auto-sleep ----

async function setSleepTimeout(minutes) {
  const prev = sleepTimeoutMinutes.value
  sleepTimeoutMinutes.value = minutes
  try {
    await updatePresenceSettings({ sleepTimeoutMinutes: minutes })
    // Also update the setting that useAutoSleep watches, so it stays in sync
    if (settings) settings.autoSleepMinutes = minutes
  } catch {
    sleepTimeoutMinutes.value = prev
    toast?.error('Failed to update auto-sleep')
  }
}

// ---- Schedule CRUD ----

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
  // Optimistic update
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
    // Revert
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
    // Revert — splice back at original position
    const list = [...schedules.value]
    list.splice(Math.min(idx, list.length), 0, prev)
    schedules.value = list
    toast?.error('Failed to delete schedule')
  }
}

// ---- Interactions ----

function toggleDay(scheduleId, isoDay) {
  const schedule = schedules.value.find(s => s.id === scheduleId)
  if (!schedule) return
  const days = Array.isArray(schedule.daysOfWeek) ? [...schedule.daysOfWeek] : []
  const idx = days.indexOf(isoDay)
  if (idx >= 0) {
    // Don't remove last day — use delete instead
    if (days.length <= 1) return
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

function setTime(scheduleId, time) {
  updateScheduleField(scheduleId, { time })
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

// ---- Double-tap delete ----

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
  <div class="pref" v-if="settings">
    <div class="pref__grid">
      <!-- Column 1: Power & Sleep -->
      <div class="pref__column pref__column--wide">
        <h4 class="pref__section-title">Power &amp; Sleep</h4>

        <!-- Auto-sleep row -->
        <div class="pref__sleep-row">
          <div>
            <div class="pref__label">Auto-sleep</div>
            <div class="pref__hint">Sleep after inactivity</div>
          </div>
          <select
            class="pref__select"
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
        <div class="pref__schedules-header">
          <div class="pref__label">Wake Schedules</div>
        </div>

        <div v-if="loading" class="pref__hint">Loading schedules...</div>

        <template v-if="!loading">
          <div
            v-for="schedule in schedules"
            :key="schedule.id"
            class="pref__card"
            :class="{ 'pref__card--disabled': !schedule.enabled }"
            @click="onCardClick(schedule.id, $event)"
          >
            <!-- Delete confirm overlay -->
            <div v-if="confirmDeleteId === schedule.id" class="pref__delete-confirm">
              <button class="pref__delete-btn" @click="removeSchedule(schedule.id)">
                Delete this schedule
              </button>
              <button class="pref__delete-cancel" @click="confirmDeleteId = null">
                Cancel
              </button>
            </div>

            <!-- Card content -->
            <template v-else>
              <div class="pref__card-top">
                <div class="pref__card-left">
                  <label class="pref__time-wrapper">
                    <span class="pref__time">{{ schedule.time || '07:00' }}</span>
                    <input
                      type="time"
                      class="pref__time-input"
                      :value="schedule.time || '07:00'"
                      @change="e => setTime(schedule.id, e.target.value)"
                    />
                  </label>
                  <select
                    class="pref__awake-badge"
                    :value="schedule.keepAwakeFor ?? ''"
                    @change="e => setKeepAwakeFor(schedule.id, Number(e.target.value) || 0)"
                  >
                    <option v-for="opt in KEEP_AWAKE_OPTIONS" :key="String(opt.value)" :value="opt.value ?? ''">
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
                <button
                  class="pref__toggle-switch"
                  :class="{ 'pref__toggle-switch--on': schedule.enabled }"
                  @click.stop="toggleEnabled(schedule.id)"
                  :aria-label="schedule.enabled ? 'Disable schedule' : 'Enable schedule'"
                >
                  <span class="pref__toggle-knob" />
                </button>
              </div>

              <div class="pref__day-pills">
                <button
                  v-for="day in DAYS"
                  :key="day.iso"
                  class="pref__pill"
                  :class="{
                    'pref__pill--active': isDayActive(schedule, day.iso),
                    'pref__pill--last': isLastActiveDay(schedule, day.iso),
                  }"
                  :aria-label="'Toggle ' + day.name"
                  @click.stop="toggleDay(schedule.id, day.iso)"
                >
                  {{ day.key }}
                </button>
              </div>
            </template>
          </div>

          <!-- Add schedule -->
          <button class="pref__add-btn" @click="addSchedule">
            <span class="pref__add-icon">+</span> Add schedule
          </button>
        </template>
      </div>

      <!-- Column 2: Water (unchanged) -->
      <div class="pref__column">
        <h4 class="pref__section-title">Water</h4>

        <div class="pref__field">
          <label class="pref__label">Water level display</label>
          <div class="pref__seg-group">
            <button
              class="pref__seg"
              :class="{ 'pref__seg--active': settings.waterLevelDisplayUnit === 'mm' }"
              @click="settings.waterLevelDisplayUnit = 'mm'"
            >mm</button>
            <button
              class="pref__seg"
              :class="{ 'pref__seg--active': settings.waterLevelDisplayUnit === 'ml' }"
              @click="settings.waterLevelDisplayUnit = 'ml'"
            >mL</button>
          </div>
        </div>

        <div class="pref__field">
          <label class="pref__label">Refill threshold</label>
          <ValueInput
            :model-value="refillThresholdDisplay"
            @update:model-value="v => refillThresholdDisplay = v"
            :min="0"
            :max="isML ? 1500 : 120"
            :step="isML ? 50 : 5"
            :suffix="isML ? ' ml' : ' mm'"
          />
          <span class="pref__hint">Warn when water drops below this level</span>
        </div>
      </div>

      <!-- Column 3: Espresso -->
      <div class="pref__column">
        <h4 class="pref__section-title">Espresso</h4>

        <div class="pref__sleep-row">
          <div>
            <div class="pref__label">Show brew dialog</div>
            <div class="pref__hint">Confirm dose, yield, and temperature before each shot</div>
          </div>
          <button
            class="pref__toggle-switch"
            :class="{ 'pref__toggle-switch--on': settings.showBrewDialog }"
            @click="settings.showBrewDialog = !settings.showBrewDialog"
            :aria-label="settings.showBrewDialog ? 'Disable brew dialog' : 'Enable brew dialog'"
          >
            <span class="pref__toggle-knob" />
          </button>
        </div>

        <div class="pref__sleep-row">
          <div>
            <div class="pref__label">Linger on shot graph</div>
            <div class="pref__hint">Stay on espresso page after shot ends</div>
          </div>
          <button
            class="pref__toggle-switch"
            :class="{ 'pref__toggle-switch--on': settings.lingerOnEspressoPage }"
            @click="settings.lingerOnEspressoPage = !settings.lingerOnEspressoPage"
            :aria-label="settings.lingerOnEspressoPage ? 'Disable linger' : 'Enable linger'"
          >
            <span class="pref__toggle-knob" />
          </button>
        </div>

      </div>
    </div>
  </div>
  <div v-else class="pref__empty">Settings not available.</div>
</template>

<style scoped>
.pref {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pref__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
}

.pref__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pref__column--wide {
  min-width: 280px;
}

.pref__section-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.pref__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pref__label {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

.pref__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

/* ---- Auto-sleep row ---- */

.pref__sleep-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--color-surface);
  border-radius: 10px;
}

.pref__select {
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-md);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* ---- Schedules header ---- */

.pref__schedules-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ---- Schedule card ---- */

.pref__card {
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

.pref__card--disabled {
  color: var(--button-disabled-text);
  pointer-events: none;
}

.pref__card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.pref__card-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ---- Time display/input ---- */

.pref__time-wrapper {
  position: relative;
  cursor: pointer;
}

.pref__time {
  font-size: var(--font-title);
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: -0.5px;
}

.pref__time-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  font-size: var(--font-body);
}

/* ---- Keep-awake badge ---- */

.pref__awake-badge {
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* ---- Toggle switch ---- */

.pref__toggle-switch {
  width: 52px;
  height: 30px;
  border-radius: 15px;
  border: none;
  background: var(--color-border);
  position: relative;
  cursor: pointer;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
  padding: 0;
}

.pref__toggle-switch--on {
  background: var(--color-success);
}

.pref__toggle-knob {
  position: absolute;
  top: 50%;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  transform: translateY(-50%);
  transition: left 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.pref__toggle-switch--on .pref__toggle-knob {
  left: 25px;
}

/* ---- Day pills ---- */

.pref__day-pills {
  display: flex;
  gap: 4px;
}

.pref__pill {
  width: 34px;
  height: 28px;
  border-radius: 6px;
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

.pref__pill--active {
  background: var(--color-primary);
  color: var(--color-text);
  border-color: var(--color-primary);
}

.pref__pill--last {
  cursor: default;
  opacity: 0.7;
}

/* ---- Delete confirm overlay ---- */

.pref__delete-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 72px;
}

.pref__delete-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--color-danger, #e94560);
  color: #fff;
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pref__delete-cancel {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* ---- Add button ---- */

.pref__add-btn {
  width: 100%;
  height: 40px;
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

.pref__add-btn:active {
  background: var(--color-surface);
}

.pref__add-icon {
  font-size: var(--font-body);
}

/* ---- Segment group (water) ---- */

.pref__seg-group {
  display: flex;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  width: fit-content;
}

.pref__seg {
  padding: 8px 20px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pref__seg--active {
  background: var(--color-primary);
  color: var(--color-text);
}

.pref__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
