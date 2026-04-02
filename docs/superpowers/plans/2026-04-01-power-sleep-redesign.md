# Power & Sleep Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7-row-per-day wake schedule grid with schedule cards that group days naturally, wire auto-sleep to the server API, and clean up dead settings.

**Architecture:** PreferencesTab's Power & Sleep section is rewritten. Schedules load from the server's presence API and render as cards with direct-manipulation interactions (tap time to edit, tap day pills to toggle, dropdown for keep-awake). Settings cleanup removes `autoWakeEnabled` and `autoSleepMinutes` from local KV store since both are server-authoritative (auto-sleep sync already handled by `useAutoSleep.js`).

**Tech Stack:** Vue 3 Composition API, `<script setup>`, ReaPrime REST API (`/api/v1/presence/*`)

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/settings/PreferencesTab.vue` | Rewrite | Schedule cards UI, auto-sleep dropdown, all schedule CRUD |
| `src/composables/useSettings.js` | Modify | Remove `autoWakeEnabled` and `autoSleepMinutes` from defaults and groups |

---

### Task 1: Clean up dead settings from useSettings.js

**Files:**
- Modify: `src/composables/useSettings.js:24` (remove `autoSleepMinutes` default)
- Modify: `src/composables/useSettings.js:80` (remove `autoWakeEnabled` default)
- Modify: `src/composables/useSettings.js:158` (remove from `preferences` group)
- Modify: `src/composables/useSettings.js:189` (remove from `options` group)

- [ ] **Step 1: Remove `autoSleepMinutes` from DEFAULT_SETTINGS**

In `src/composables/useSettings.js`, remove the `autoSleepMinutes: 60,` line and its comment from DEFAULT_SETTINGS (around line 23-24).

- [ ] **Step 2: Remove `autoWakeEnabled` from DEFAULT_SETTINGS**

In `src/composables/useSettings.js`, remove the `autoWakeEnabled: false,` line (around line 80).

- [ ] **Step 3: Remove from GROUPS**

In the `preferences` group array (around line 157-159), remove `'autoSleepMinutes'` from the array.

In the `options` group array (around line 187-190), remove `'autoWakeEnabled'` from the array.

- [ ] **Step 4: Verify `useAutoSleep.js` still works**

`useAutoSleep.js` reads/writes `settings.settings.autoSleepMinutes`. Since it's no longer in defaults, it will be `undefined` initially but gets set from server on mount (line 100). The watch on line 91 will still work. However, the initial `_syncSettingsToServer()` call on line 74 would send `undefined`. 

Fix: In `src/composables/useAutoSleep.js`, guard the sync function:

```javascript
async function _syncSettingsToServer() {
  const minutes = settings.settings.autoSleepMinutes
  if (minutes == null) return  // Not yet loaded from server
  try {
    await updatePresenceSettings({
      sleepTimeoutMinutes: minutes,
      userPresenceEnabled: true,
    })
  } catch {
    // Server may not support presence API yet
  }
}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/composables/useSettings.js src/composables/useAutoSleep.js
git commit -m "refactor: remove autoSleepMinutes and autoWakeEnabled from local settings

Both are now server-authoritative via the presence API.
autoSleepMinutes is synced by useAutoSleep.js.
autoWakeEnabled is managed by PreferencesTab directly."
```

---

### Task 2: Rewrite PreferencesTab Power & Sleep section

**Files:**
- Rewrite: `src/components/settings/PreferencesTab.vue`

This is the main task. The entire `<script setup>`, `<template>`, and `<style>` for the Power & Sleep column gets rewritten. The Water column stays unchanged.

- [ ] **Step 1: Rewrite the script section**

Replace the entire `<script setup>` in `src/components/settings/PreferencesTab.vue` with:

```javascript
import { ref, computed, inject, onMounted } from 'vue'
import ValueInput from '../ValueInput.vue'
import { updateWaterLevelThreshold } from '../../api/rest.js'
import {
  getPresenceSchedules,
  getPresenceSettings,
  updatePresenceSettings,
  createPresenceSchedule,
  updatePresenceSchedule,
  deletePresenceSchedule,
} from '../../api/rest.js'

const WATER_ML_PER_MM = 12.45

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
const toast = inject('toast', null)

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

// ---- Power & Sleep (server-backed) ----

const DAYS = [
  { key: 'M', iso: 1 },
  { key: 'T', iso: 2 },
  { key: 'W', iso: 3 },
  { key: 'T', iso: 4 },
  { key: 'F', iso: 5 },
  { key: 'S', iso: 6 },
  { key: 'S', iso: 7 },
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
      daysOfWeek: [],
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
    // Revert
    schedules.value = [...schedules.value, prev]
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
  if (!Array.isArray(schedule.daysOfWeek) || schedule.daysOfWeek.length === 0) return true // empty = every day
  return schedule.daysOfWeek.includes(isoDay)
}

function isLastActiveDay(schedule, isoDay) {
  if (!Array.isArray(schedule.daysOfWeek) || schedule.daysOfWeek.length === 0) return false
  return schedule.daysOfWeek.length === 1 && schedule.daysOfWeek[0] === isoDay
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

function keepAwakeLabel(schedule) {
  const v = schedule.keepAwakeFor
  if (!v) return 'wake only'
  if (v < 60) return `${v} min`
  return `${v / 60} hr`
}

// ---- Long-press delete ----

let longPressTimer = null

function onCardPointerDown(id) {
  longPressTimer = setTimeout(() => {
    confirmDeleteId.value = id
    clearTimeout(confirmDeleteTimer)
    confirmDeleteTimer = setTimeout(() => {
      confirmDeleteId.value = null
    }, 4000)
  }, 500)
}

function onCardPointerUp() {
  clearTimeout(longPressTimer)
}

onMounted(loadAll)
```

- [ ] **Step 2: Rewrite the template**

Replace the entire `<template>` section with:

```html
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
            @pointerdown.prevent="onCardPointerDown(schedule.id)"
            @pointerup="onCardPointerUp()"
            @pointerleave="onCardPointerUp()"
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
    </div>
  </div>
  <div v-else class="pref__empty">Settings not available.</div>
</template>
```

- [ ] **Step 3: Rewrite the styles**

Replace the entire `<style scoped>` section with:

```css
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
  font-size: 16px;
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
  font-size: 14px;
  color: var(--color-text-secondary);
}

.pref__hint {
  font-size: 12px;
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
  font-size: 14px;
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
  opacity: 0.5;
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
  font-size: 22px;
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
  font-size: 16px;
}

/* ---- Keep-awake badge ---- */

.pref__awake-badge {
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* ---- Toggle switch ---- */

.pref__toggle-switch {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: none;
  background: var(--color-border);
  position: relative;
  cursor: pointer;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.pref__toggle-switch--on {
  background: var(--color-success);
}

.pref__toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

.pref__toggle-switch--on .pref__toggle-knob {
  transform: translateX(20px);
}

/* ---- Day pills ---- */

.pref__day-pills {
  display: flex;
  gap: 4px;
}

.pref__pill {
  width: 32px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 11px;
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
  font-size: 13px;
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
  font-size: 13px;
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
  font-size: 13px;
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
  font-size: 18px;
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
  font-size: 14px;
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
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/PreferencesTab.vue
git commit -m "feat: rewrite Power & Sleep with schedule cards

Replace 7-row per-day grid with schedule cards that group days
naturally. Auto-sleep synced to server via presence API. Schedule
cards support direct manipulation: tap time to edit, tap day pills
to toggle, dropdown for keep-awake duration, toggle switch for
enable/disable, long-press to delete."
```

---

### Task 3: Verify integration and fix edge cases

**Files:**
- Possibly modify: `src/components/settings/PreferencesTab.vue`
- Possibly modify: `src/composables/useAutoSleep.js`

- [ ] **Step 1: Verify no remaining references to removed settings**

Search for `autoWakeEnabled` and `autoSleepMinutes` across the codebase (excluding `useAutoSleep.js` which legitimately uses `autoSleepMinutes` as a reactive bridge):

```bash
grep -r "autoWakeEnabled" src/ --include="*.vue" --include="*.js"
grep -r "autoSleepMinutes" src/ --include="*.vue" --include="*.js"
```

`useAutoSleep.js` references `settings.settings.autoSleepMinutes` — this still works because Vue's `reactive()` allows setting properties not in the original defaults. The server value gets written here on mount, and PreferencesTab now also writes here via `setSleepTimeout()` to keep useAutoSleep's watcher in sync.

If any other files reference these removed settings, update them.

- [ ] **Step 2: Test the full flow manually**

1. Open Settings → Preferences tab
2. Verify auto-sleep dropdown loads the server's current value
3. Change auto-sleep — verify it persists (reload page, value should stick)
4. Verify schedule cards load from server
5. Add a new schedule — verify card appears with defaults
6. Tap time — verify time picker opens
7. Tap day pills — verify they toggle (last one should not toggle off)
8. Change keep-awake dropdown — verify it saves
9. Toggle enable switch — verify card dims when disabled
10. Long-press card — verify delete confirm appears, then auto-dismisses after ~4s
11. Delete a schedule — verify card removed

- [ ] **Step 3: Final build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit if any fixes were needed**

```bash
git add -u
git commit -m "fix: edge cases in power & sleep redesign"
```
