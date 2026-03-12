# Layout System Rethink — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken 8-zone single-widget layout system with a 6-zone slot-based layout where center zones hold ordered widget stacks, the preview matches reality, and all visible features (presets, last shot) are widgets.

**Architecture:** Six named zones in a 3-row × 2-column grid. Top/bottom zones hold at most 1 widget each. Center zones hold ordered widget lists rendered as vertical stacks. `useLayout.js` defines the data model (v2), `LayoutWidget.vue` renders individual widgets, `IdlePage.vue` is a pure layout renderer, and `LayoutTab.vue` provides a live-preview editor. No migration — v1 layouts are replaced with v2 defaults.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vite, uPlot (lazy-loaded for lastShot widget)

**Design doc:** `docs/plans/2026-02-25-layout-rethink-design.md`

---

### Task 1: Update useLayout.js — New Data Model

**Files:**
- Modify: `src/composables/useLayout.js`

This task replaces all zone/widget definitions, the default layout, and the validation logic to match the v2 design.

**Step 1: Replace constants**

Replace the entire `ZONE_NAMES`, `ZONE_LABELS`, `WIDGET_TYPES`, and `WIDGET_LABELS` arrays/objects in `src/composables/useLayout.js` with:

```js
const ZONE_NAMES = [
  'topLeft',
  'topRight',
  'centerLeft',
  'centerRight',
  'bottomLeft',
  'bottomRight',
]

const ZONE_LABELS = {
  topLeft: 'Top Left',
  topRight: 'Top Right',
  centerLeft: 'Center Left',
  centerRight: 'Center Right',
  bottomLeft: 'Bottom Left',
  bottomRight: 'Bottom Right',
}

// Zones that accept ordered widget stacks (multiple widgets)
const STACK_ZONES = new Set(['centerLeft', 'centerRight'])

// All supported widget types
const WIDGET_TYPES = [
  'gauge',
  'actionButtons',
  'shotPlan',
  'lastShot',
  'workflowPresets',
  'steamPresets',
  'hotWaterPresets',
  'flushPresets',
  'clock',
  'waterLevel',
  'statusInfo',
  'navButtons',
  'connectionStatus',
  'scaleInfo',
  'fullscreen',
]

const WIDGET_LABELS = {
  gauge: 'Temperature Gauge',
  actionButtons: 'Action Buttons',
  shotPlan: 'Shot Plan',
  lastShot: 'Last Shot',
  workflowPresets: 'Workflow Presets',
  steamPresets: 'Steam Presets',
  hotWaterPresets: 'Hot Water Presets',
  flushPresets: 'Flush Presets',
  clock: 'Clock',
  waterLevel: 'Water Level',
  statusInfo: 'Status Info',
  navButtons: 'Navigation Buttons',
  connectionStatus: 'Connection Status',
  scaleInfo: 'Scale Info',
  fullscreen: 'Fullscreen Toggle',
}

// Which zones each widget type is allowed in
// 'any' = all zones, 'center' = centerLeft/centerRight only, 'edge' = top/bottom only
const WIDGET_ZONE_RULES = {
  gauge: 'center',
  actionButtons: 'center',
  shotPlan: 'center',
  lastShot: 'center',
  workflowPresets: 'center',
  steamPresets: 'center',
  hotWaterPresets: 'center',
  flushPresets: 'center',
  clock: 'any',
  waterLevel: 'any',
  statusInfo: 'edge',
  navButtons: 'edge',
  connectionStatus: 'edge',
  scaleInfo: 'edge',
  fullscreen: 'edge',
}
```

**Step 2: Replace DEFAULT_LAYOUT**

Replace the `DEFAULT_LAYOUT` object:

```js
const DEFAULT_LAYOUT = {
  version: 2,
  zones: {
    topLeft:     { widgets: ['statusInfo'] },
    topRight:    { widgets: [] },
    centerLeft:  { widgets: ['gauge'] },
    centerRight: { widgets: ['actionButtons', 'shotPlan', 'workflowPresets'] },
    bottomLeft:  { widgets: ['navButtons'] },
    bottomRight: { widgets: [] },
  },
}
```

**Step 3: Rewrite validateLayout**

Replace the `validateLayout` function. The v2 shape uses `{ widgets: string[] }` per zone instead of `{ type: string }`. If a v1 layout is loaded (has `type` instead of `widgets`), return `null` so defaults apply.

```js
function validateLayout(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!raw.zones || typeof raw.zones !== 'object') return null
  // Reject v1 layouts — no migration, just use defaults
  if (raw.version !== 2) return null

  const validated = {
    version: 2,
    zones: {},
  }

  for (const zoneName of ZONE_NAMES) {
    const zoneConfig = raw.zones[zoneName]
    if (!zoneConfig || !Array.isArray(zoneConfig.widgets)) {
      validated.zones[zoneName] = { widgets: [] }
      continue
    }

    // Filter to valid widget types only
    const widgets = zoneConfig.widgets.filter(w => WIDGET_TYPES.includes(w))

    // Top/bottom zones: max 1 widget
    if (!STACK_ZONES.has(zoneName)) {
      validated.zones[zoneName] = { widgets: widgets.slice(0, 1) }
    } else {
      validated.zones[zoneName] = { widgets }
    }
  }

  return validated
}
```

**Step 4: Update setZone and removeZone**

Replace `setZone` and `removeZone` with new helpers for the v2 data shape:

```js
/**
 * Set the widget list for a zone and persist.
 */
async function setZoneWidgets(zoneName, widgets) {
  if (!ZONE_NAMES.includes(zoneName)) return
  const filtered = widgets.filter(w => WIDGET_TYPES.includes(w))
  const limited = STACK_ZONES.has(zoneName) ? filtered : filtered.slice(0, 1)

  layout.value = {
    ...layout.value,
    zones: {
      ...layout.value.zones,
      [zoneName]: { widgets: limited },
    },
  }
  await saveLayout()
}

/**
 * Clear all widgets from a zone and persist.
 */
async function clearZone(zoneName) {
  await setZoneWidgets(zoneName, [])
}
```

Remove the old `setZone`, `removeZone`, and `getZone` functions.

**Step 5: Update the returned instance**

Update the `_instance` object. Remove `setZone`, `removeZone`, `getZone`. Add `setZoneWidgets`, `clearZone`, `STACK_ZONES`, `WIDGET_ZONE_RULES`. Remove `statusBarConfig` from validation since it's no longer needed.

```js
_instance = {
  layout: readonly(layout),
  loaded: readonly(loaded),
  loading: readonly(loading),
  load,
  saveLayout,
  setZoneWidgets,
  clearZone,
  setLayout,
  resetLayout,
  WIDGET_TYPES,
  WIDGET_LABELS,
  WIDGET_ZONE_RULES,
  ZONE_NAMES,
  ZONE_LABELS,
  STACK_ZONES,
  DEFAULT_LAYOUT,
}
```

**Step 6: Verify**

Run: `npm run build`
Expected: Build succeeds (may have warnings from LayoutTab/IdlePage referencing old APIs — those are fixed in later tasks).

**Step 7: Commit**

```bash
git add src/composables/useLayout.js
git commit -m "refactor: update useLayout.js to v2 data model with 6 zones and widget stacks"
```

---

### Task 2: Create LayoutWidget.vue (rename from LayoutZone)

**Files:**
- Create: `src/components/LayoutWidget.vue` (based on `src/components/LayoutZone.vue`)
- Delete: `src/components/LayoutZone.vue` (after IdlePage is updated in Task 3)

This task creates the new `LayoutWidget.vue` component that renders a single widget by type. It keeps all existing widget renderers (gauge, actionButtons, shotPlan, clock, waterLevel, connectionStatus, statusInfo, navButtons, fullscreen, scaleInfo) and adds new ones (lastShot, workflowPresets, steamPresets, hotWaterPresets, flushPresets). Removes old types (profileName, statusBar, bottomBar, presetPills, empty).

**Step 1: Create LayoutWidget.vue script**

Create `src/components/LayoutWidget.vue`. The key difference from LayoutZone: it takes a `type` string prop instead of a `zone` object, and each widget is self-contained.

```vue
<script setup>
/**
 * LayoutWidget — Renders a single widget by type string.
 *
 * Used by IdlePage to render each widget in the layout grid.
 * All machine/scale/settings data is injected from App.vue provides.
 */
import { ref, computed, inject, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import CircularGauge from './CircularGauge.vue'
import ActionButton from './ActionButton.vue'
import ConnectionIndicator from './ConnectionIndicator.vue'
import PresetPillRow from './PresetPillRow.vue'
import { setMachineState, getLatestShot } from '../api/rest.js'

const HistoryShotGraph = defineAsyncComponent(() => import('./HistoryShotGraph.vue'))

const props = defineProps({
  /** Widget type string */
  type: { type: String, required: true },
  /** Whether machine is ready for operations */
  isReady: { type: Boolean, default: false },
  /** Shot plan lines (structured multi-line) */
  shotPlanLines: { type: Array, default: () => [] },
  /** Workflow combos */
  workflowCombos: { type: Array, default: () => [] },
  /** Selected workflow combo index */
  selectedWorkflowCombo: { type: Number, default: -1 },
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
})

const emit = defineEmits([
  'start-espresso',
  'start-steam',
  'start-hot-water',
  'start-flush',
  'workflow-combo-select',
  'workflow-combo-long-press',
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
const waterLevelDisplay = inject('waterLevelDisplay', ref(''))
const waterLevelPercent = inject('waterLevelPercent', ref(0))
const profileName = inject('profileName', ref(''))
const scale = inject('scale', null)
const scaleWeight = inject('weight', ref(0))
const devices = inject('devices', null)

// ---- Clock ----
const clockTime = ref('')
let clockInterval = null

function updateClock() {
  const now = new Date()
  clockTime.value = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  if (props.type === 'clock') {
    updateClock()
    clockInterval = setInterval(updateClock, 1000)
  }
  if (props.type === 'lastShot') {
    fetchLastShot()
  }
})

onUnmounted(() => {
  if (clockInterval) {
    clearInterval(clockInterval)
    clockInterval = null
  }
})

// ---- Fullscreen ----
const isFullscreen = ref(!!document.fullscreenElement || !!document.webkitFullscreenElement)

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen
    if (exit) exit.call(document).catch(() => {})
  } else {
    const el = document.documentElement
    const req = el.requestFullscreen || el.webkitRequestFullscreen
    if (req) req.call(el).catch(() => {})
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement || !!document.webkitFullscreenElement
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
})

// ---- Last Shot ----
const lastShot = ref(null)

async function fetchLastShot() {
  try {
    lastShot.value = await getLatestShot()
  } catch {
    lastShot.value = null
  }
}

const lastShotInfo = computed(() => {
  const s = lastShot.value
  if (!s) return {}
  const w = s.workflow ?? {}
  const coffee = w.coffeeData ?? {}
  const grinder = w.grinderData ?? {}
  const dd = w.doseData ?? {}

  const shotProfile = w.profile?.title ?? w.name ?? null
  const coffeeName = [coffee.roaster, coffee.name].filter(Boolean).join(' — ') || null
  const doseIn = s.doseIn ?? dd.doseIn
  const doseOut = s.doseOut ?? dd.doseOut
  let dose = null
  if (doseIn && doseOut) {
    const ratio = doseOut / doseIn
    dose = `${Number(doseIn).toFixed(1)}g in / ${Number(doseOut).toFixed(1)}g out (1:${ratio.toFixed(1)})`
  } else if (doseIn) {
    dose = `${Number(doseIn).toFixed(1)}g in`
  }

  const grinderName = [grinder.manufacturer, grinder.model].filter(Boolean).join(' ')
  const grinderSetting = grinder.setting ?? s.grinderSetting
  let grinderText = null
  if (grinderName && grinderSetting) grinderText = `${grinderName} @ ${grinderSetting}`
  else if (grinderSetting) grinderText = `Grind: ${grinderSetting}`
  else if (grinderName) grinderText = grinderName

  let duration = null
  if (s.duration) {
    duration = `${Number(s.duration).toFixed(0)}s`
  } else if (s.measurements?.length >= 2) {
    const first = s.measurements[0]
    const last = s.measurements[s.measurements.length - 1]
    const getTs = (m) => {
      if (m.elapsed != null) return m.elapsed
      const ts = m.machine?.timestamp ?? m.timestamp
      return ts ? new Date(ts).getTime() / 1000 : 0
    }
    const d = getTs(last) - getTs(first)
    if (d > 0) duration = `${d.toFixed(0)}s`
  }

  return { profile: shotProfile, coffee: coffeeName, dose, grinder: grinderText, duration }
})
</script>
```

**Step 2: Create LayoutWidget.vue template**

Add the template section after the script. This has all widget types using `v-if`/`v-else-if`:

```html
<template>
  <div class="layout-widget" :class="`layout-widget--${type}`">
    <!-- Gauge -->
    <template v-if="type === 'gauge'">
      <CircularGauge
        :value="temperature"
        :min="0"
        :max="110"
        unit="&deg;C"
        :label="t('common.group')"
        color="var(--color-temperature)"
        :size="120"
      />
    </template>

    <!-- Action buttons -->
    <template v-else-if="type === 'actionButtons'">
      <div class="layout-widget__actions">
        <ActionButton icon="&#9749;" :label="t('idle.espresso')" :disabled="!isReady" @click="emit('start-espresso')" />
        <ActionButton icon="&#9752;" :label="t('idle.steam')" color="var(--color-accent)" :disabled="!isReady" @click="emit('start-steam')" />
        <ActionButton icon="&#128167;" :label="t('idle.hotWater')" color="var(--color-flow)" :disabled="!isReady" @click="emit('start-hot-water')" />
        <ActionButton icon="&#127754;" :label="t('idle.flush')" color="var(--color-success)" :disabled="!isReady" @click="emit('start-flush')" />
      </div>
    </template>

    <!-- Shot plan -->
    <template v-else-if="type === 'shotPlan'">
      <div class="layout-widget__shot-plan" @click="router.push('/bean-info')">
        <div v-if="profileName" class="layout-widget__profile" @click.stop="router.push('/profiles')">
          {{ profileName }}
        </div>
        <div v-for="(line, i) in shotPlanLines" :key="i" class="layout-widget__plan-text">
          {{ line }}
        </div>
      </div>
    </template>

    <!-- Last Shot -->
    <template v-else-if="type === 'lastShot'">
      <div v-if="lastShot" class="layout-widget__last-shot" @click="router.push(`/shot/${encodeURIComponent(lastShot.id)}`)">
        <span class="layout-widget__section-label">Last Shot</span>
        <div class="layout-widget__last-shot-card">
          <div class="layout-widget__last-shot-chart">
            <HistoryShotGraph :shot="lastShot" />
          </div>
          <div class="layout-widget__last-shot-info">
            <span v-if="lastShotInfo.profile" class="layout-widget__last-shot-profile">{{ lastShotInfo.profile }}</span>
            <span v-if="lastShotInfo.coffee" class="layout-widget__last-shot-detail">{{ lastShotInfo.coffee }}</span>
            <span v-if="lastShotInfo.dose" class="layout-widget__last-shot-detail">{{ lastShotInfo.dose }}</span>
            <span v-if="lastShotInfo.grinder" class="layout-widget__last-shot-detail">{{ lastShotInfo.grinder }}</span>
            <span v-if="lastShotInfo.duration" class="layout-widget__last-shot-detail">{{ lastShotInfo.duration }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Workflow Presets -->
    <template v-else-if="type === 'workflowPresets'">
      <div v-if="workflowCombos.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">Workflows</span>
        <PresetPillRow
          :presets="workflowCombos"
          :selected-index="selectedWorkflowCombo"
          :long-press-enabled="true"
          @select="idx => emit('workflow-combo-select', idx)"
          @long-press="idx => emit('workflow-combo-long-press', idx)"
        />
      </div>
      <div v-else class="layout-widget__preset-section">
        <button class="layout-widget__new-combo-btn" @click="router.push('/bean-info')">
          + New Combo
        </button>
      </div>
    </template>

    <!-- Steam Presets -->
    <template v-else-if="type === 'steamPresets'">
      <div v-if="steamPresets.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">{{ t('idle.steam') }}</span>
        <PresetPillRow
          :presets="steamPresets"
          :selected-index="selectedSteamPreset"
          @select="idx => emit('steam-preset-select', idx)"
          @activate="() => emit('start-steam')"
        />
      </div>
    </template>

    <!-- Hot Water Presets -->
    <template v-else-if="type === 'hotWaterPresets'">
      <div v-if="hotWaterPresets.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">{{ t('idle.hotWater') }}</span>
        <PresetPillRow
          :presets="hotWaterPresets"
          :selected-index="selectedHotWaterPreset"
          @select="idx => emit('hot-water-preset-select', idx)"
          @activate="() => emit('start-hot-water')"
        />
      </div>
    </template>

    <!-- Flush Presets -->
    <template v-else-if="type === 'flushPresets'">
      <div v-if="flushPresets.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">{{ t('idle.flush') }}</span>
        <PresetPillRow
          :presets="flushPresets"
          :selected-index="selectedFlushPreset"
          @select="idx => emit('flush-preset-select', idx)"
          @activate="() => emit('start-flush')"
        />
      </div>
    </template>

    <!-- Clock -->
    <template v-else-if="type === 'clock'">
      <div class="layout-widget__clock">
        {{ clockTime }}
      </div>
    </template>

    <!-- Water Level -->
    <template v-else-if="type === 'waterLevel'">
      <div class="layout-widget__water">
        <div class="layout-widget__water-bar">
          <div class="layout-widget__water-fill" :style="{ height: waterLevelPercent + '%' }" />
        </div>
        <span class="layout-widget__water-label">{{ waterLevelDisplay }}</span>
      </div>
    </template>

    <!-- Status Info (connection + scale + water + fullscreen) -->
    <template v-else-if="type === 'statusInfo'">
      <div class="layout-widget__status-info">
        <div class="layout-widget__connection">
          <ConnectionIndicator
            :connected="machineConnected"
            :size="12"
            :detail="machineConnected && scaleConnected ? t('idle.machineAndScale') : machineConnected ? t('idle.machine') : ''"
          />
          <span class="layout-widget__connection-label">
            {{ machineConnected ? t('common.online') : t('common.offline') }}
          </span>
        </div>
        <div class="layout-widget__scale-info">
          <template v-if="scaleConnected">
            <span class="layout-widget__scale-weight">{{ scaleWeight.toFixed(1) }}g</span>
            <span v-if="scale?.batteryLevel?.value != null" class="layout-widget__scale-battery">{{ scale.batteryLevel.value }}%</span>
            <button class="layout-widget__scale-btn" @click="scale?.tare().catch(() => {})">Tare</button>
          </template>
          <template v-else>
            <span class="layout-widget__scale-disconnected">No scale</span>
            <button class="layout-widget__scale-btn" :disabled="devices?.scanning?.value" @click="devices?.scan({ connect: true })">
              {{ devices?.scanning?.value ? 'Scanning...' : 'Scan' }}
            </button>
          </template>
        </div>
        <div class="layout-widget__water">
          <div class="layout-widget__water-bar">
            <div class="layout-widget__water-fill" :style="{ height: waterLevelPercent + '%' }" />
          </div>
          <span class="layout-widget__water-label">{{ waterLevelDisplay }}</span>
        </div>
        <button class="layout-widget__fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'">
          <svg v-if="!isFullscreen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </template>

    <!-- Nav Buttons -->
    <template v-else-if="type === 'navButtons'">
      <div class="layout-widget__nav">
        <button class="layout-widget__nav-btn" @click="router.push('/bean-info')">{{ t('idle.beans') }}</button>
        <button class="layout-widget__nav-btn" @click="router.push('/history')">{{ t('idle.history') }}</button>
        <button class="layout-widget__nav-btn" @click="router.push('/settings')">{{ t('idle.settings') }}</button>
        <button class="layout-widget__nav-btn layout-widget__nav-btn--sleep" @click="setMachineState('sleeping').catch(() => {})">{{ t('idle.sleep') }}</button>
      </div>
    </template>

    <!-- Connection Status -->
    <template v-else-if="type === 'connectionStatus'">
      <div class="layout-widget__connection">
        <ConnectionIndicator
          :connected="machineConnected"
          :size="12"
          :detail="machineConnected && scaleConnected ? t('idle.machineAndScale') : machineConnected ? t('idle.machine') : ''"
        />
        <span class="layout-widget__connection-label">
          {{ machineConnected ? t('common.online') : t('common.offline') }}
        </span>
      </div>
    </template>

    <!-- Scale Info -->
    <template v-else-if="type === 'scaleInfo'">
      <div class="layout-widget__scale-info">
        <template v-if="scaleConnected">
          <span class="layout-widget__scale-weight">{{ scaleWeight.toFixed(1) }}g</span>
          <span v-if="scale?.batteryLevel?.value != null" class="layout-widget__scale-battery">{{ scale.batteryLevel.value }}%</span>
          <button class="layout-widget__scale-btn" @click="scale?.tare().catch(() => {})">Tare</button>
        </template>
        <template v-else>
          <span class="layout-widget__scale-disconnected">No scale</span>
          <button class="layout-widget__scale-btn" :disabled="devices?.scanning?.value" @click="devices?.scan({ connect: true })">
            {{ devices?.scanning?.value ? 'Scanning...' : 'Scan' }}
          </button>
        </template>
      </div>
    </template>

    <!-- Fullscreen Toggle -->
    <template v-else-if="type === 'fullscreen'">
      <button class="layout-widget__fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'">
        <svg v-if="!isFullscreen" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
    </template>
  </div>
</template>
```

**Step 3: Create LayoutWidget.vue styles**

Add the `<style scoped>` section. Port all styles from LayoutZone.vue, renaming CSS classes from `layout-zone__*` to `layout-widget__*`. Add new styles for lastShot and preset section widgets:

```css
<style scoped>
.layout-widget {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- Action buttons ---- */
.layout-widget__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-medium);
}

/* ---- Shot plan ---- */
.layout-widget__shot-plan {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.layout-widget__profile {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__plan-text {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__plan-text:active {
  opacity: 0.7;
}

/* ---- Last shot ---- */
.layout-widget__last-shot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  cursor: pointer;
}

.layout-widget__last-shot-card {
  display: flex;
  gap: var(--spacing-medium);
  width: 100%;
  max-width: 700px;
}

.layout-widget__last-shot-chart {
  flex: 1;
  min-width: 0;
  height: 180px;
}

.layout-widget__last-shot-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 140px;
  max-width: 200px;
}

.layout-widget__last-shot-profile {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layout-widget__last-shot-detail {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Preset sections ---- */
.layout-widget__preset-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.layout-widget__section-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.layout-widget__new-combo-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__new-combo-btn:active {
  opacity: 0.7;
}

/* ---- Clock ---- */
.layout-widget__clock {
  font-size: 48px;
  font-weight: 300;
  color: var(--color-text);
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
}

/* ---- Water level ---- */
.layout-widget__water {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.layout-widget__water-bar {
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

.layout-widget__water-fill {
  width: 100%;
  background: var(--color-flow);
  border-radius: 0 0 3px 3px;
  transition: height 0.3s ease;
}

.layout-widget__water-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

/* ---- Status info ---- */
.layout-widget__status-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

/* ---- Connection ---- */
.layout-widget__connection {
  display: flex;
  align-items: center;
  gap: 6px;
}

.layout-widget__connection-label {
  font-size: var(--font-label);
  font-weight: 600;
}

/* ---- Scale info ---- */
.layout-widget__scale-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.layout-widget__scale-weight {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.layout-widget__scale-battery {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.layout-widget__scale-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__scale-btn:active {
  opacity: 0.7;
}

.layout-widget__scale-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.layout-widget__scale-disconnected {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* ---- Nav buttons ---- */
.layout-widget__nav {
  display: flex;
  gap: var(--spacing-medium);
}

.layout-widget__nav-btn {
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

.layout-widget__nav-btn:active {
  opacity: 0.7;
}

.layout-widget__nav-btn--sleep {
  border-color: var(--color-text-secondary);
  color: var(--color-text-secondary);
}

/* ---- Fullscreen toggle ---- */
.layout-widget__fullscreen-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__fullscreen-btn:active {
  opacity: 0.7;
}
</style>
```

**Step 4: Verify**

Run: `npm run build`
Expected: Build succeeds. LayoutWidget.vue compiles without errors.

**Step 5: Commit**

```bash
git add src/components/LayoutWidget.vue
git commit -m "feat: add LayoutWidget.vue with all v2 widget types including lastShot and individual presets"
```

---

### Task 3: Rewrite IdlePage.vue — Pure Layout Renderer

**Files:**
- Modify: `src/pages/IdlePage.vue`

Rewrite IdlePage to render the v2 layout config as a 3-row × 2-column CSS grid. Remove all hardcoded preset rows, last shot section, and extra zones. The page becomes a pure renderer: it reads `layout.zones` and renders each widget using `LayoutWidget`.

**Step 1: Replace script section**

Replace the entire `<script setup>` in `src/pages/IdlePage.vue`. The key changes:
- Import `LayoutWidget` instead of `LayoutZone`
- Remove `HistoryShotGraph` lazy import (now inside LayoutWidget)
- Remove `getLatestShot` import (now inside LayoutWidget)
- Remove `showLastShot`, `lastShot`, `fetchLastShot`, `lastShotInfo` (moved to LayoutWidget)
- Remove individual preset rendering logic from template (now widgets)
- Keep: workflow combo logic (onComboSelect, etc.), operation start functions, shot plan computation
- Use `STACK_ZONES` from useLayout to determine rendering

```js
import { ref, computed, inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LayoutWidget from '../components/LayoutWidget.vue'
import PresetEditPopup from '../components/PresetEditPopup.vue'
import { useLayout } from '../composables/useLayout.js'
import { setMachineState, getProfiles } from '../api/rest.js'

const { t } = useI18n()
const router = useRouter()

// Layout system
const { layout, loaded: layoutLoaded, load: loadLayout, STACK_ZONES } = useLayout()

// Injected from App.vue
const machineState = inject('machineState', ref('idle'))
const workflow = inject('workflow', null)
const updateWorkflow = inject('updateWorkflow')
const settings = inject('settings', null)
const toast = inject('toast', null)

const isReady = computed(() =>
  machineState.value === 'idle' || machineState.value === 'ready'
)

// Shot plan lines — from workflow data
const shotPlanLines = computed(() => {
  if (!workflow) return []
  const lines = []
  const coffeeData = workflow.coffeeData
  const doseData = workflow.doseData
  const grinderData = workflow.grinderData

  if (coffeeData) {
    const coffeeName = coffeeData.name
    const roaster = coffeeData.roaster
    if (roaster && coffeeName) lines.push(`${roaster} — ${coffeeName}`)
    else if (coffeeName) lines.push(coffeeName)
    else if (roaster) lines.push(roaster)
  }

  if (doseData) {
    const doseIn = doseData.doseIn ?? doseData.dose
    const doseOut = doseData.doseOut ?? doseData.targetWeight
    if (doseIn && doseOut) {
      const ratio = doseOut / doseIn
      lines.push(`${Number(doseIn).toFixed(1)}g in / ${Number(doseOut).toFixed(1)}g out (1:${ratio.toFixed(1)})`)
    } else if (doseIn) lines.push(`${Number(doseIn).toFixed(1)}g in`)
    else if (doseOut) lines.push(`${Number(doseOut).toFixed(1)}g out`)
  }

  if (grinderData) {
    const grinderName = [grinderData.manufacturer, grinderData.model].filter(Boolean).join(' ') || grinderData.grinder || grinderData.name
    const grinderSetting = grinderData.setting ?? grinderData.grindSetting
    if (grinderName && grinderSetting != null) lines.push(`${grinderName} @ ${grinderSetting}`)
    else if (grinderSetting != null) lines.push(`Grind: ${grinderSetting}`)
    else if (grinderName) lines.push(grinderName)
  }

  return lines
})

// ---- Workflow combos ----
const workflowCombos = computed(() => settings?.settings?.workflowCombos ?? [])
const selectedWorkflowCombo = computed(() => settings?.settings?.selectedWorkflowCombo ?? -1)

const editPopupVisible = ref(false)
const editPopupPreset = ref(null)
const editPopupIndex = ref(-1)

async function onComboSelect(index) {
  if (!settings) return
  settings.settings.selectedWorkflowCombo = index
  const combo = workflowCombos.value[index]
  if (!combo) return

  const update = {}

  if (combo.profileId) {
    try {
      const records = await getProfiles()
      const record = (Array.isArray(records) ? records : []).find(r => r.id === combo.profileId)
      if (record?.profile) update.profile = record.profile
    } catch { /* skip */ }
  }

  const coffeeName = [combo.beanBrand, combo.beanType].filter(Boolean).join(' ')
  if (coffeeName || combo.roaster) {
    update.coffeeData = { name: coffeeName || null, roaster: combo.roaster || null }
  }

  if (combo.doseIn != null || combo.doseOut != null) {
    update.doseData = { doseIn: combo.doseIn ?? undefined, doseOut: combo.doseOut ?? undefined }
  }

  if (combo.grinder || combo.grinderSetting) {
    update.grinderData = { manufacturer: null, model: combo.grinder || null, setting: combo.grinderSetting ?? null }
  }

  if (combo.steamSettings) {
    update.steamSettings = {
      targetTemperature: combo.steamSettings.temperature,
      duration: combo.steamSettings.duration,
      flow: combo.steamSettings.flow,
    }
    settings.settings.steamDuration = combo.steamSettings.duration ?? settings.settings.steamDuration
    settings.settings.steamFlow = combo.steamSettings.flow ?? settings.settings.steamFlow
    settings.settings.steamTemperature = combo.steamSettings.temperature ?? settings.settings.steamTemperature
  }

  if (combo.flushSettings) {
    update.rinseData = { duration: combo.flushSettings.duration, flow: combo.flushSettings.flow }
    settings.settings.flushDuration = combo.flushSettings.duration ?? settings.settings.flushDuration
    settings.settings.flushFlowRate = combo.flushSettings.flow ?? settings.settings.flushFlowRate
  }

  if (combo.hotWaterSettings) {
    update.hotWaterData = {
      targetTemperature: combo.hotWaterSettings.temperature,
      volume: combo.hotWaterSettings.volume,
    }
    settings.settings.hotWaterVolume = combo.hotWaterSettings.volume ?? settings.settings.hotWaterVolume
    settings.settings.hotWaterTemperature = combo.hotWaterSettings.temperature ?? settings.settings.hotWaterTemperature
  }

  if (Object.keys(update).length > 0) {
    updateWorkflow(update).catch(() => {})
  }

  toast?.success(`Loaded ${combo.name || 'combo'}`)
}

function onComboLongPress(index) {
  const combo = workflowCombos.value[index]
  if (!combo) return
  editPopupPreset.value = combo
  editPopupIndex.value = index
  editPopupVisible.value = true
}

function onComboEditSave(updated) {
  if (!settings || editPopupIndex.value < 0) return
  const combos = [...workflowCombos.value]
  combos[editPopupIndex.value] = { ...combos[editPopupIndex.value], name: updated.name, emoji: updated.emoji }
  settings.settings.workflowCombos = combos
  editPopupVisible.value = false
}

function onComboEditDelete() {
  if (!settings || editPopupIndex.value < 0) return
  const combos = [...workflowCombos.value]
  combos.splice(editPopupIndex.value, 1)
  settings.settings.workflowCombos = combos
  if (selectedWorkflowCombo.value >= combos.length) {
    settings.settings.selectedWorkflowCombo = combos.length - 1
  }
  editPopupVisible.value = false
}

function onComboEditCancel() {
  editPopupVisible.value = false
}

// ---- Quick-start presets ----
const steamPresets = computed(() => settings?.settings?.steamPitcherPresets ?? [])
const selectedSteamPreset = computed(() => settings?.settings?.selectedSteamPitcherPreset ?? -1)
const hotWaterPresets = computed(() => settings?.settings?.waterVesselPresets ?? [])
const selectedHotWaterPreset = computed(() => settings?.settings?.selectedWaterVesselPreset ?? -1)
const flushPresets = computed(() => settings?.settings?.flushPresets ?? [])
const selectedFlushPreset = computed(() => settings?.settings?.selectedFlushPreset ?? -1)

function onSteamPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedSteamPitcherPreset = index
  const preset = steamPresets.value[index]
  if (preset) {
    settings.settings.steamDuration = preset.duration ?? settings.settings.steamDuration
    settings.settings.steamFlow = preset.flow ?? settings.settings.steamFlow
    settings.settings.steamTemperature = preset.temperature ?? settings.settings.steamTemperature
  }
}

function onHotWaterPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedWaterVesselPreset = index
  const preset = hotWaterPresets.value[index]
  if (preset) {
    settings.settings.hotWaterVolume = preset.volume ?? settings.settings.hotWaterVolume
    settings.settings.hotWaterTemperature = preset.temperature ?? settings.settings.hotWaterTemperature
  }
}

function onFlushPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedFlushPreset = index
  const preset = flushPresets.value[index]
  if (preset) {
    settings.settings.flushDuration = preset.duration ?? settings.settings.flushDuration
    settings.settings.flushFlowRate = preset.flow ?? settings.settings.flushFlowRate
  }
}

async function startEspresso() {
  if (!isReady.value) return
  await setMachineState('espresso').catch(() => {})
  router.push('/espresso')
}

async function startSteam() {
  if (!isReady.value) return
  await setMachineState('steam').catch(() => {})
  router.push('/steam')
}

async function startHotWater() {
  if (!isReady.value) return
  await setMachineState('hotWater').catch(() => {})
  router.push('/hotwater')
}

async function startFlush() {
  if (!isReady.value) return
  await setMachineState('flush').catch(() => {})
  router.push('/flush')
}

// ---- Layout helpers ----
const zones = computed(() => layout.value.zones)

function zoneWidgets(name) {
  return zones.value[name]?.widgets ?? []
}

function hasWidgets(name) {
  return zoneWidgets(name).length > 0
}

// Row visibility: collapse if both sides empty
const showTopRow = computed(() => hasWidgets('topLeft') || hasWidgets('topRight'))
const showBottomRow = computed(() => hasWidgets('bottomLeft') || hasWidgets('bottomRight'))
const hasCenterLeft = computed(() => hasWidgets('centerLeft'))
const hasCenterRight = computed(() => hasWidgets('centerRight'))

// Common props to pass to every LayoutWidget
const widgetEvents = {
  'start-espresso': startEspresso,
  'start-steam': startSteam,
  'start-hot-water': startHotWater,
  'start-flush': startFlush,
  'workflow-combo-select': onComboSelect,
  'workflow-combo-long-press': onComboLongPress,
  'steam-preset-select': onSteamPresetSelect,
  'hot-water-preset-select': onHotWaterPresetSelect,
  'flush-preset-select': onFlushPresetSelect,
}

onMounted(() => {
  loadLayout()
})
```

**Step 2: Replace template**

Replace the entire `<template>` section. The layout is a CSS grid with 3 rows × 2 columns. Top/bottom rows render a single widget per cell. Center row renders widget stacks. Center columns expand to full width when the other is empty.

```html
<template>
  <div class="idle-page" :class="{
    'idle-page--center-left-only': hasCenterLeft && !hasCenterRight,
    'idle-page--center-right-only': !hasCenterLeft && hasCenterRight,
  }">
    <!-- Top row -->
    <template v-if="showTopRow">
      <div class="idle-page__top-left">
        <LayoutWidget
          v-if="hasWidgets('topLeft')"
          :type="zoneWidgets('topLeft')[0]"
          :is-ready="isReady"
          :shot-plan-lines="shotPlanLines"
          :workflow-combos="workflowCombos"
          :selected-workflow-combo="selectedWorkflowCombo"
          :steam-presets="steamPresets"
          :selected-steam-preset="selectedSteamPreset"
          :hot-water-presets="hotWaterPresets"
          :selected-hot-water-preset="selectedHotWaterPreset"
          :flush-presets="flushPresets"
          :selected-flush-preset="selectedFlushPreset"
          v-on="widgetEvents"
        />
      </div>
      <div class="idle-page__top-right">
        <LayoutWidget
          v-if="hasWidgets('topRight')"
          :type="zoneWidgets('topRight')[0]"
          :is-ready="isReady"
          :shot-plan-lines="shotPlanLines"
          :workflow-combos="workflowCombos"
          :selected-workflow-combo="selectedWorkflowCombo"
          :steam-presets="steamPresets"
          :selected-steam-preset="selectedSteamPreset"
          :hot-water-presets="hotWaterPresets"
          :selected-hot-water-preset="selectedHotWaterPreset"
          :flush-presets="flushPresets"
          :selected-flush-preset="selectedFlushPreset"
          v-on="widgetEvents"
        />
      </div>
    </template>

    <!-- Center left column (widget stack) -->
    <div class="idle-page__center-left" v-if="hasCenterLeft">
      <LayoutWidget
        v-for="(widgetType, i) in zoneWidgets('centerLeft')"
        :key="'cl-' + i"
        :type="widgetType"
        :is-ready="isReady"
        :shot-plan-lines="shotPlanLines"
        :workflow-combos="workflowCombos"
        :selected-workflow-combo="selectedWorkflowCombo"
        :steam-presets="steamPresets"
        :selected-steam-preset="selectedSteamPreset"
        :hot-water-presets="hotWaterPresets"
        :selected-hot-water-preset="selectedHotWaterPreset"
        :flush-presets="flushPresets"
        :selected-flush-preset="selectedFlushPreset"
        v-on="widgetEvents"
      />
    </div>

    <!-- Center right column (widget stack) -->
    <div class="idle-page__center-right" v-if="hasCenterRight">
      <LayoutWidget
        v-for="(widgetType, i) in zoneWidgets('centerRight')"
        :key="'cr-' + i"
        :type="widgetType"
        :is-ready="isReady"
        :shot-plan-lines="shotPlanLines"
        :workflow-combos="workflowCombos"
        :selected-workflow-combo="selectedWorkflowCombo"
        :steam-presets="steamPresets"
        :selected-steam-preset="selectedSteamPreset"
        :hot-water-presets="hotWaterPresets"
        :selected-hot-water-preset="selectedHotWaterPreset"
        :flush-presets="flushPresets"
        :selected-flush-preset="selectedFlushPreset"
        v-on="widgetEvents"
      />
    </div>

    <!-- Bottom row -->
    <template v-if="showBottomRow">
      <div class="idle-page__bottom-left">
        <LayoutWidget
          v-if="hasWidgets('bottomLeft')"
          :type="zoneWidgets('bottomLeft')[0]"
          :is-ready="isReady"
          :shot-plan-lines="shotPlanLines"
          :workflow-combos="workflowCombos"
          :selected-workflow-combo="selectedWorkflowCombo"
          :steam-presets="steamPresets"
          :selected-steam-preset="selectedSteamPreset"
          :hot-water-presets="hotWaterPresets"
          :selected-hot-water-preset="selectedHotWaterPreset"
          :flush-presets="flushPresets"
          :selected-flush-preset="selectedFlushPreset"
          v-on="widgetEvents"
        />
      </div>
      <div class="idle-page__bottom-right">
        <LayoutWidget
          v-if="hasWidgets('bottomRight')"
          :type="zoneWidgets('bottomRight')[0]"
          :is-ready="isReady"
          :shot-plan-lines="shotPlanLines"
          :workflow-combos="workflowCombos"
          :selected-workflow-combo="selectedWorkflowCombo"
          :steam-presets="steamPresets"
          :selected-steam-preset="selectedSteamPreset"
          :hot-water-presets="hotWaterPresets"
          :selected-hot-water-preset="selectedHotWaterPreset"
          :flush-presets="flushPresets"
          :selected-flush-preset="selectedFlushPreset"
          v-on="widgetEvents"
        />
      </div>
    </template>

    <!-- Combo quick edit popup -->
    <PresetEditPopup
      :visible="editPopupVisible"
      :preset="editPopupPreset"
      operation-type="combo"
      :is-existing="true"
      @save="onComboEditSave"
      @delete="onComboEditDelete"
      @cancel="onComboEditCancel"
    />
  </div>
</template>
```

**Step 3: Replace styles**

Replace the entire `<style scoped>` section. Use CSS grid for the 3-row × 2-column layout. Handle center column expansion via modifier classes.

```css
<style scoped>
.idle-page {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "top-left     top-right"
    "center-left  center-right"
    "bottom-left  bottom-right";
  min-height: 100%;
  padding: var(--margin-standard);
  gap: var(--spacing-large);
}

/* When only one center column has widgets, it spans full width */
.idle-page--center-left-only {
  grid-template-areas:
    "top-left     top-right"
    "center-left  center-left"
    "bottom-left  bottom-right";
}

.idle-page--center-right-only {
  grid-template-areas:
    "top-left      top-right"
    "center-right  center-right"
    "bottom-left   bottom-right";
}

.idle-page__top-left {
  grid-area: top-left;
  display: flex;
  align-items: center;
}

.idle-page__top-right {
  grid-area: top-right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.idle-page__center-left {
  grid-area: center-left;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-large);
  min-height: 0;
}

.idle-page__center-right {
  grid-area: center-right;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-large);
  min-height: 0;
}

.idle-page__bottom-left {
  grid-area: bottom-left;
  display: flex;
  align-items: center;
}

.idle-page__bottom-right {
  grid-area: bottom-right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
</style>
```

**Step 4: Verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add src/pages/IdlePage.vue
git commit -m "refactor: rewrite IdlePage as pure v2 layout renderer with CSS grid"
```

---

### Task 4: Delete LayoutZone.vue

**Files:**
- Delete: `src/components/LayoutZone.vue`

**Step 1: Search for remaining imports**

Search the codebase for any remaining imports of `LayoutZone`:

Run: `grep -r "LayoutZone" src/`

If IdlePage.vue no longer imports it (confirmed in Task 3), and no other file imports it, delete it.

**Step 2: Delete the file**

Run: `rm src/components/LayoutZone.vue`

**Step 3: Verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add -u src/components/LayoutZone.vue
git commit -m "chore: remove old LayoutZone.vue (replaced by LayoutWidget.vue)"
```

---

### Task 5: Rewrite LayoutTab.vue — Live Preview + Zone Editor

**Files:**
- Modify: `src/components/settings/LayoutTab.vue`

Rewrite the settings UI for the v2 layout. Replace the old dropdown-per-zone + CSS grid preview with:
- A live miniature preview at the top showing the 6-zone grid with widget labels
- Tap a zone to select it
- Below the preview: editor panel for the selected zone
  - Top/bottom zones: dropdown to pick one widget (or "Empty")
  - Center zones: ordered list with move up/down, remove, and "Add widget" button
- Remove the StatusBar config section (no longer needed)
- Changes save immediately with debounce
- Reset to default button

**Step 1: Replace script section**

Replace the entire `<script setup>`:

```js
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { useLayout } from '../../composables/useLayout.js'

const {
  layout,
  loaded,
  load,
  setLayout,
  resetLayout,
  WIDGET_TYPES,
  WIDGET_LABELS,
  WIDGET_ZONE_RULES,
  ZONE_NAMES,
  ZONE_LABELS,
  STACK_ZONES,
  DEFAULT_LAYOUT,
} = useLayout()

// Local editing copy of the layout zones
const editZones = reactive({})
const selectedZone = ref('centerRight')
const saving = ref(false)
const saveMessage = ref('')

// Debounced save
let saveTimeout = null

function syncFromLayout() {
  for (const zoneName of ZONE_NAMES) {
    editZones[zoneName] = [...(layout.value.zones[zoneName]?.widgets ?? [])]
  }
  saveMessage.value = ''
}

onMounted(async () => {
  if (!loaded.value) await load()
  syncFromLayout()
})

watch(layout, () => {
  syncFromLayout()
})

function scheduleSave() {
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(doSave, 500)
}

async function doSave() {
  saving.value = true
  const newLayout = { version: 2, zones: {} }
  for (const zoneName of ZONE_NAMES) {
    newLayout.zones[zoneName] = { widgets: [...(editZones[zoneName] ?? [])] }
  }
  await setLayout(newLayout)
  saving.value = false
  saveMessage.value = 'Saved'
  setTimeout(() => { saveMessage.value = '' }, 1500)
}

async function onReset() {
  saving.value = true
  await resetLayout()
  syncFromLayout()
  saving.value = false
  saveMessage.value = 'Reset to default'
  setTimeout(() => { saveMessage.value = '' }, 2000)
}

// ---- Zone editing ----

const isStackZone = computed(() => STACK_ZONES.has(selectedZone.value))

// Widgets available for the selected zone based on WIDGET_ZONE_RULES
const availableWidgets = computed(() => {
  const zone = selectedZone.value
  const isCenter = STACK_ZONES.has(zone)
  const isEdge = !isCenter

  return WIDGET_TYPES.filter(wt => {
    const rule = WIDGET_ZONE_RULES[wt]
    if (rule === 'any') return true
    if (rule === 'center' && isCenter) return true
    if (rule === 'edge' && isEdge) return true
    return false
  })
})

// For top/bottom (single widget) zones
const singleWidgetValue = computed({
  get() {
    const widgets = editZones[selectedZone.value] ?? []
    return widgets[0] ?? ''
  },
  set(val) {
    editZones[selectedZone.value] = val ? [val] : []
    scheduleSave()
  },
})

// For center (stack) zones
function moveWidget(index, direction) {
  const widgets = editZones[selectedZone.value]
  if (!widgets) return
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= widgets.length) return
  const temp = widgets[index]
  widgets[index] = widgets[newIndex]
  widgets[newIndex] = temp
  // Trigger reactivity
  editZones[selectedZone.value] = [...widgets]
  scheduleSave()
}

function removeWidget(index) {
  const widgets = editZones[selectedZone.value]
  if (!widgets) return
  widgets.splice(index, 1)
  editZones[selectedZone.value] = [...widgets]
  scheduleSave()
}

const addWidgetType = ref('')

function addWidget() {
  if (!addWidgetType.value) return
  const widgets = editZones[selectedZone.value] ?? []
  widgets.push(addWidgetType.value)
  editZones[selectedZone.value] = [...widgets]
  addWidgetType.value = ''
  scheduleSave()
}

// Widgets not yet added to the selected center zone
const unusedCenterWidgets = computed(() => {
  const current = new Set(editZones[selectedZone.value] ?? [])
  return availableWidgets.value.filter(wt => !current.has(wt))
})
```

**Step 2: Replace template**

Replace the entire `<template>`:

```html
<template>
  <div class="layout-tab" v-if="loaded">
    <p class="layout-tab__description">
      Tap a zone in the preview to configure it. Changes are saved automatically.
    </p>

    <!-- Live preview grid -->
    <div class="layout-tab__preview">
      <div
        v-for="zoneName in ZONE_NAMES"
        :key="zoneName"
        class="layout-tab__preview-zone"
        :class="[
          `layout-tab__preview-zone--${zoneName}`,
          { 'layout-tab__preview-zone--selected': selectedZone === zoneName },
          { 'layout-tab__preview-zone--empty': !(editZones[zoneName]?.length) },
        ]"
        @click="selectedZone = zoneName"
      >
        <span class="layout-tab__preview-zone-name">{{ ZONE_LABELS[zoneName] }}</span>
        <template v-if="editZones[zoneName]?.length">
          <span
            v-for="wt in editZones[zoneName]"
            :key="wt"
            class="layout-tab__preview-zone-widget"
          >{{ WIDGET_LABELS[wt] || wt }}</span>
        </template>
        <span v-else class="layout-tab__preview-zone-widget layout-tab__preview-zone-widget--empty">Empty</span>
      </div>
    </div>

    <!-- Zone editor -->
    <div class="layout-tab__editor">
      <h4 class="layout-tab__section-title">{{ ZONE_LABELS[selectedZone] }}</h4>

      <!-- Single widget zones (top/bottom) -->
      <template v-if="!isStackZone">
        <select
          class="layout-tab__select"
          v-model="singleWidgetValue"
        >
          <option value="">Empty</option>
          <option
            v-for="wt in availableWidgets"
            :key="wt"
            :value="wt"
          >{{ WIDGET_LABELS[wt] || wt }}</option>
        </select>
      </template>

      <!-- Widget stack zones (center) -->
      <template v-else>
        <div v-if="editZones[selectedZone]?.length" class="layout-tab__widget-list">
          <div
            v-for="(wt, idx) in editZones[selectedZone]"
            :key="idx"
            class="layout-tab__widget-row"
          >
            <span class="layout-tab__widget-name">{{ WIDGET_LABELS[wt] || wt }}</span>
            <div class="layout-tab__widget-actions">
              <button
                class="layout-tab__widget-btn"
                :disabled="idx === 0"
                @click="moveWidget(idx, -1)"
                title="Move up"
              >&uarr;</button>
              <button
                class="layout-tab__widget-btn"
                :disabled="idx === editZones[selectedZone].length - 1"
                @click="moveWidget(idx, 1)"
                title="Move down"
              >&darr;</button>
              <button
                class="layout-tab__widget-btn layout-tab__widget-btn--remove"
                @click="removeWidget(idx)"
                title="Remove"
              >&times;</button>
            </div>
          </div>
        </div>
        <p v-else class="layout-tab__empty-hint">No widgets in this zone.</p>

        <div v-if="unusedCenterWidgets.length" class="layout-tab__add-row">
          <select class="layout-tab__select" v-model="addWidgetType">
            <option value="" disabled>Add widget...</option>
            <option v-for="wt in unusedCenterWidgets" :key="wt" :value="wt">
              {{ WIDGET_LABELS[wt] || wt }}
            </option>
          </select>
          <button
            class="layout-tab__add-btn"
            :disabled="!addWidgetType"
            @click="addWidget"
          >Add</button>
        </div>
      </template>
    </div>

    <!-- Actions -->
    <div class="layout-tab__actions">
      <button
        class="layout-tab__reset-btn"
        :disabled="saving"
        @click="onReset"
      >Reset to Default</button>
      <span v-if="saveMessage" class="layout-tab__save-message">{{ saveMessage }}</span>
      <span v-if="saving" class="layout-tab__save-message">Saving...</span>
    </div>
  </div>
  <div v-else class="layout-tab__loading">Loading layout...</div>
</template>
```

**Step 3: Replace styles**

Replace the entire `<style scoped>` section:

```css
<style scoped>
.layout-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.layout-tab__description {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}

/* ---- Preview grid ---- */
.layout-tab__preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "topLeft     topRight"
    "centerLeft  centerRight"
    "bottomLeft  bottomRight";
  gap: 6px;
  padding: 16px;
  background: var(--color-background);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  min-height: 200px;
}

.layout-tab__preview-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px 8px;
  border-radius: 8px;
  background: var(--color-surface);
  border: 2px solid transparent;
  min-height: 40px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.layout-tab__preview-zone:hover {
  border-color: var(--color-text-secondary);
}

.layout-tab__preview-zone--selected {
  border-color: var(--color-primary);
}

.layout-tab__preview-zone--empty {
  opacity: 0.5;
}

.layout-tab__preview-zone--topLeft       { grid-area: topLeft; }
.layout-tab__preview-zone--topRight      { grid-area: topRight; }
.layout-tab__preview-zone--centerLeft    { grid-area: centerLeft; }
.layout-tab__preview-zone--centerRight   { grid-area: centerRight; }
.layout-tab__preview-zone--bottomLeft    { grid-area: bottomLeft; }
.layout-tab__preview-zone--bottomRight   { grid-area: bottomRight; }

.layout-tab__preview-zone-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.layout-tab__preview-zone-widget {
  font-size: 12px;
  color: var(--color-text);
  font-weight: 500;
  text-align: center;
}

.layout-tab__preview-zone-widget--empty {
  color: var(--color-text-secondary);
  font-style: italic;
}

/* ---- Zone editor ---- */
.layout-tab__editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.layout-tab__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
  margin: 0;
}

.layout-tab__select {
  min-width: 160px;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-tab__widget-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.layout-tab__widget-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.layout-tab__widget-name {
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
}

.layout-tab__widget-actions {
  display: flex;
  gap: 4px;
}

.layout-tab__widget-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}

.layout-tab__widget-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.layout-tab__widget-btn:not(:disabled):active {
  opacity: 0.7;
}

.layout-tab__widget-btn--remove {
  color: var(--color-error);
  border-color: var(--color-error);
}

.layout-tab__empty-hint {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-style: italic;
  margin: 0;
}

.layout-tab__add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.layout-tab__add-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
}

.layout-tab__add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---- Actions ---- */
.layout-tab__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.layout-tab__reset-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-error);
  background: transparent;
  color: var(--color-error);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-tab__reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.layout-tab__reset-btn:not(:disabled):active {
  transform: scale(0.96);
}

.layout-tab__save-message {
  font-size: 13px;
  color: var(--color-success);
  font-weight: 500;
}

.layout-tab__loading {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
```

**Step 4: Verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/components/settings/LayoutTab.vue
git commit -m "feat: rewrite LayoutTab with live preview grid and zone editor for v2 layout"
```

---

### Task 6: Remove showLastShotOnIdle from Settings

**Files:**
- Modify: `src/composables/useSettings.js` (lines 92, 205)
- Modify: `src/components/settings/ShotHistoryTab.vue` (lines 56-66)

**Step 1: Remove from useSettings.js defaults**

In `src/composables/useSettings.js`, remove `showLastShotOnIdle: false,` from the defaults object (line 92).

**Step 2: Remove from useSettings.js GROUPS**

In `src/composables/useSettings.js`, remove `'showLastShotOnIdle'` from the GROUPS array entry on line 205. It's in the same group as `'autoFavorites'` — just remove the one key, keep `'autoFavorites'`.

**Step 3: Remove toggle from ShotHistoryTab.vue**

In `src/components/settings/ShotHistoryTab.vue`, remove the `showLastShotOnIdle` toggle field (lines 56-66). Delete the entire `<div class="history-tab__field">` block containing the label "Show last shot on idle" and its toggle button and hint.

**Step 4: Verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/composables/useSettings.js src/components/settings/ShotHistoryTab.vue
git commit -m "chore: remove showLastShotOnIdle setting (replaced by lastShot widget in layout)"
```

---

### Task 7: Final Verification and Cleanup

**Files:**
- Check all files for leftover references

**Step 1: Search for stale references**

Run these searches:
- `grep -r "LayoutZone" src/` — should return nothing
- `grep -r "extraTop\|extraBottom\|extraOverlay" src/` — should return nothing
- `grep -r "showLastShotOnIdle" src/` — should return nothing
- `grep -r "presetPills\|profileName.*widget\|statusBar.*widget\|bottomBar.*widget" src/composables/useLayout.js` — should return nothing
- `grep -r "centerMain\|topBar\b" src/composables/useLayout.js` — should return nothing (old zone names)

**Step 2: Fix any remaining references**

If any stale references are found, update them.

**Step 3: Full build check**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 4: Manual smoke test**

Open the app in a browser. Verify:
1. IdlePage renders with default layout (statusInfo top-left, gauge center-left, actionButtons+shotPlan+workflowPresets center-right, navButtons bottom-left)
2. Settings → Layout tab shows the 6-zone preview grid
3. Tapping a zone in the preview selects it and shows the editor below
4. Adding/removing/reordering widgets in center zones works and auto-saves
5. Changing a top/bottom zone widget via dropdown works and auto-saves
6. Reset to Default restores the default layout
7. The "Show last shot on idle" toggle is gone from Shot History settings
8. Adding `lastShot` widget to a center zone shows the last shot card

**Step 5: Commit any cleanup**

```bash
git add -A
git commit -m "chore: clean up stale references from layout system v1"
```
