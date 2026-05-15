<script setup>
/**
 * LayoutWidget — Renders a single widget by type string.
 *
 * Used by IdlePage to render each widget in the layout grid.
 * All machine/scale/settings data is injected from App.vue provides.
 */
import { ref, computed, inject, watch, onMounted, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ActionButton from './ActionButton.vue'
import PresetPillRow from './PresetPillRow.vue'
import BeanPickerPopup from './BeanPickerPopup.vue'
import { setMachineState } from '../api/rest.js'
import { normalizeShot } from '../composables/useShotNormalize'
import { useShotCache } from '../composables/useShotCache'
import { bootReady } from '../composables/useBootReady'
import { espressoIcon, steamIcon, hotWaterIcon, flushIcon } from '../assets/icons/operations.js'

const OP_ICONS = { steam: steamIcon, hotwater: hotWaterIcon, flush: flushIcon }

const HistoryShotGraph = defineAsyncComponent(() => import('./HistoryShotGraph.vue'))

const props = defineProps({
  /** Widget type string */
  type: { type: String, required: true },
  /** Whether machine is ready for operations */
  isReady: { type: Boolean, default: false },
  /**
   * Shot plan lines. Items are `{ kind, text }`:
   *   - `coffee`  — clickable, opens the BeanPickerPopup.
   *   - `dose`, `grinder` — non-interactive; the outer container handles
   *     navigation to the recipe editor.
   *   - `steam`, `hotwater`, `flush` — status-only.
   */
  shotPlanLines: { type: Array, default: () => [] },
  /** Workflow combos */
  workflowCombos: { type: Array, default: () => [] },
  /** Selected workflow combo index */
  selectedWorkflowCombo: { type: Number, default: -1 },
  /**
   * Whether the selected workflow combo has been "modified" — i.e. the
   * live workflow has diverged from the saved combo on some field.
   * Computed by IdlePage via useComboDirty and forwarded here; this
   * widget is a pass-through to PresetPillRow.
   */
  selectedWorkflowComboModified: { type: Boolean, default: false },
})

const emit = defineEmits([
  'start-espresso',
  'start-steam',
  'start-hot-water',
  'start-flush',
  'workflow-combo-select',
  'workflow-combo-edit',
])

const { t } = useI18n()
const router = useRouter()

// Injected from App.vue
const machineConnected = inject('machineConnected', ref(false))
const scaleConnected = inject('scaleConnected', ref(false))
const temperature = inject('temperature', ref(0))
const steamTemperature = inject('steamTemperature', ref(0))
const waterLevelDisplay = inject('waterLevelDisplay', ref(''))
const waterLevelPercent = inject('waterLevelPercent', ref(0))
const profileName = inject('profileName', ref(''))
const scale = inject('scale', null)
const scaleWeight = inject('weight', ref(0))
const devices = inject('devices', null)
const updateWorkflow = inject('updateWorkflow', null)
const toast = inject('toast', null)
const workflow = inject('workflow', null)

// Bean picker popup state — opened from the coffee row of the shotPlan widget.
const beanPickerOpen = ref(false)
const currentBatchId = computed(() => {
  const id = workflow?.context?.beanBatchId
  return id != null ? String(id) : null
})

function onCoffeeRowClick() {
  beanPickerOpen.value = true
}

// ---- Last Shot ----
//
// The widget reads from useShotCache.latest (a shared shallowRef holding the
// most-recent shot record). The cache fetches /shots/latest + /shots/<id>
// once per session, caches the result, and broadcasts patches when a shot
// mutation lands on the current id. Previously this widget had its own
// fetch chain + 5-retry × 2 s loop + an `immediate: true` watcher that
// double-fired the request on mount — together those were the worst-case
// cold-start offender for BLE on Teclast.
const shotCache = useShotCache()
const lastShot = shotCache.latest
const machineState = inject('machineState', ref(''))

// Defer the initial fetch until the machine WS is up — see useBootReady.
// The espresso→idle invalidation lives in App.vue (the widget is unmounted
// during a shot, so a watcher here would miss the transition); after App
// calls shotCache.refreshLatest(), `latest.value` flips to null and the
// next ensureLatest() — fired by either this widget or App's poll — pulls
// the fresh record.
onMounted(async () => {
  if (props.type !== 'lastShot') return
  await bootReady()
  shotCache.ensureLatest()
})

// Re-attempt only on the connect *edge*, not on mount (the bootReady gate
// above handles initial fetch). Covers the case where the machine drops and
// reconnects mid-session.
watch(machineConnected, (connected, prevConnected) => {
  if (props.type !== 'lastShot') return
  if (connected && !prevConnected && !lastShot.value) {
    shotCache.refreshLatest()
  }
})


const lastShotInfo = computed(() => {
  const raw = lastShot.value
  if (!raw) return {}
  const s = normalizeShot(raw)

  const coffeeName = [s.coffeeRoaster, s.coffeeName].filter(Boolean).join(' — ') || null

  let dose = null
  if (s.doseIn && s.doseOut) {
    const ratio = s.doseOut / s.doseIn
    dose = `${Number(s.doseIn).toFixed(1)}g in / ${Number(s.doseOut).toFixed(1)}g out (1:${ratio.toFixed(1)})`
  } else if (s.doseIn) {
    dose = `${Number(s.doseIn).toFixed(1)}g in`
  }

  let grinderText = null
  if (s.grinderModel && s.grinderSetting) grinderText = `${s.grinderModel} @ ${s.grinderSetting}`
  else if (s.grinderSetting) grinderText = `Grind: ${s.grinderSetting}`
  else if (s.grinderModel) grinderText = s.grinderModel

  const duration = s.duration ? `${Number(s.duration).toFixed(0)}s` : null

  return { profile: s.profileName, coffee: coffeeName, dose, grinder: grinderText, duration }
})

async function repeatLastShot() {
  const raw = lastShot.value
  if (!raw) return
  const s = normalizeShot(raw)
  const profile = raw.profile || raw.workflow?.profile
  if (!profile) {
    toast?.warning('No profile data available for this shot')
    return
  }
  try {
    const update = { profile }
    const context = {}
    if (s.coffeeName) context.coffeeName = s.coffeeName
    if (s.coffeeRoaster) context.coffeeRoaster = s.coffeeRoaster
    if (s.grinderModel) context.grinderModel = s.grinderModel
    if (s.grinderSetting != null) context.grinderSetting = String(s.grinderSetting)
    if (s.doseIn) context.targetDoseWeight = s.doseIn
    if (s.doseOut) context.targetYield = s.doseOut
    const srcExtras = raw.workflow?.context?.extras ?? {}
    const extras = {}
    if (srcExtras.grinderRpm != null) extras.grinderRpm = srcExtras.grinderRpm
    if (srcExtras.basketSize != null) extras.basketSize = srcExtras.basketSize
    if (srcExtras.basketType != null) extras.basketType = srcExtras.basketType
    if (Object.keys(extras).length > 0) context.extras = extras
    if (Object.keys(context).length > 0) update.context = context
    await updateWorkflow(update)
    toast?.success('Workflow loaded from last shot')
  } catch {
    toast?.error('Failed to load workflow')
  }
}
</script>

<template>
  <div class="layout-widget" :class="`layout-widget--${type}`">
    <!-- Action buttons -->
    <template v-if="type === 'actionButtons'">
      <div class="layout-widget__actions">
        <ActionButton :icon="espressoIcon" :label="t('idle.espresso')" :disabled="!isReady" @click="emit('start-espresso')" />
        <ActionButton :icon="steamIcon" :label="t('idle.steam')" color="var(--color-accent)" :disabled="!isReady" @click="emit('start-steam')" />
        <ActionButton :icon="hotWaterIcon" :label="t('idle.hotWater')" color="var(--color-flow)" :disabled="!isReady" @click="emit('start-hot-water')" />
        <ActionButton :icon="flushIcon" :label="t('idle.flush')" color="var(--color-success)" :disabled="!isReady" @click="emit('start-flush')" />
      </div>
    </template>

    <!-- Shot plan -->
    <template v-else-if="type === 'shotPlan'">
      <div class="layout-widget__shot-plan" role="button" tabindex="0" @click="router.push('/recipe/edit')" @keydown.enter="router.push('/recipe/edit')" @keydown.space.prevent="router.push('/recipe/edit')">
        <div v-if="profileName" class="layout-widget__profile" @click.stop="router.push('/profiles')">
          {{ profileName }}
        </div>
        <template v-for="(line, i) in shotPlanLines" :key="i">
          <!-- Coffee row: tappable, opens bean picker. Always rendered so the
               affordance is reachable even when no coffee is selected yet. -->
          <div
            v-if="line.kind === 'coffee'"
            class="layout-widget__plan-text layout-widget__plan-text--coffee"
            role="button"
            tabindex="0"
            :aria-label="t('idle.pickCoffee') || 'Pick coffee'"
            @click.stop="onCoffeeRowClick"
            @keydown.enter.stop.prevent="onCoffeeRowClick"
            @keydown.space.stop.prevent="onCoffeeRowClick"
          >
            <span>{{ line.text || (t('idle.pickCoffee') || 'Pick coffee') }}</span>
            <svg class="layout-widget__plan-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <!-- Operations row: condensed icon-prefixed chips for steam/hotwater/flush. -->
          <div
            v-else-if="line.kind === 'ops'"
            class="layout-widget__plan-ops"
          >
            <span
              v-for="entry in line.entries"
              :key="entry.op"
              :class="['layout-widget__plan-op', `layout-widget__plan-op--${entry.op}`]"
            >
              <span class="layout-widget__plan-op-icon" v-html="OP_ICONS[entry.op]" aria-hidden="true" />
              <span class="layout-widget__plan-op-text">{{ entry.text }}</span>
            </span>
          </div>
          <div
            v-else
            :class="['layout-widget__plan-text', `layout-widget__plan-text--${line.kind}`]"
          >
            {{ line.text }}
          </div>
        </template>
      </div>
      <BeanPickerPopup
        :visible="beanPickerOpen"
        :current-batch-id="currentBatchId"
        @close="beanPickerOpen = false"
      />
    </template>

    <!-- Last Shot -->
    <template v-else-if="type === 'lastShot'">
      <div v-if="lastShot" class="layout-widget__last-shot" role="button" tabindex="0" @click="router.push(`/shot/${encodeURIComponent(lastShot.id)}`)" @keydown.enter="router.push(`/shot/${encodeURIComponent(lastShot.id)}`)" @keydown.space.prevent="router.push(`/shot/${encodeURIComponent(lastShot.id)}`)">
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
            <button class="layout-widget__repeat-btn" @click.stop="repeatLastShot" aria-label="Repeat last shot">Repeat</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Recipes (workflow combos — internal data key kept for layout compat) -->
    <template v-else-if="type === 'workflowCombos'">
      <!-- Empty-state has no dedicated CTA here: first-time users reach the
           recipe editor via the nav-buttons widget ("Recipes" button) and
           create their first recipe by tweaking fields and tapping
           "Save as New Recipe". Keeps a single creation path. -->
      <div v-if="workflowCombos.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">{{ t('recipe.recipes') }}</span>
        <PresetPillRow
          :presets="workflowCombos"
          :selected-index="selectedWorkflowCombo"
          :edit-enabled="true"
          :confirm-activate="false"
          :modified="selectedWorkflowComboModified"
          @select="idx => emit('workflow-combo-select', idx)"
          @edit="idx => emit('workflow-combo-edit', idx)"
        />
      </div>
    </template>

    <!-- Nav Buttons -->
    <template v-else-if="type === 'navButtons'">
      <div class="layout-widget__nav">
        <button class="layout-widget__nav-btn" @click="router.push('/recipe/edit')">{{ t('idle.recipes') }}</button>
        <button class="layout-widget__nav-btn" @click="router.push('/history')">{{ t('idle.history') }}</button>
        <button class="layout-widget__nav-btn" @click="router.push('/catalog')">{{ t('idle.catalog') }}</button>
        <button class="layout-widget__nav-btn" @click="router.push('/settings')">{{ t('idle.settings') }}</button>
      </div>
    </template>

    <!-- Sleep button (separate widget so it doesn't unbalance the nav row) -->
    <template v-else-if="type === 'sleepButton'">
      <div class="layout-widget__sleep">
        <button
          class="layout-widget__nav-btn layout-widget__nav-btn--sleep"
          @click="setMachineState('sleeping').catch(() => {})"
        >{{ t('idle.sleep') }}</button>
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

  </div>
</template>

<style scoped>
.layout-widget {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Parent columns use `align-items: center`, which leaves descendants
     content-sized. The last-shot card's `max-width: 700px` then wins even
     when the grid cell is narrower, overflowing the screen edge.
     Cap the widget to its cell and let flex children shrink below content. */
  max-width: 100%;
  min-width: 0;
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

/* Coffee row — bean picker affordance with chevron. */
.layout-widget__plan-text--coffee {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-surface-pressed, rgba(255, 255, 255, 0.05));
  color: var(--color-text);
}

.layout-widget__plan-chevron {
  color: var(--color-text-secondary);
}

/* Operation status row — condensed chips with icons. */
.layout-widget__plan-ops {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 2px;
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  cursor: pointer; /* parent click goes to recipe editor */
}

.layout-widget__plan-op {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.layout-widget__plan-op-icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
  line-height: 0;
}

.layout-widget__plan-op-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.layout-widget__plan-op--steam { color: var(--color-accent); }
.layout-widget__plan-op--hotwater { color: var(--color-flow); }
.layout-widget__plan-op--flush { color: var(--color-success); }

.layout-widget__plan-op-text {
  color: var(--color-text-secondary);
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
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layout-widget__last-shot-detail {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layout-widget__repeat-btn {
  margin-top: 4px;
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  align-self: flex-start;
}

.layout-widget__repeat-btn:active {
  opacity: 0.7;
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

/* ---- Clock ---- */
.layout-widget__clock {
  font-size: var(--font-value);
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
  height: 100%;
  background: var(--color-flow);
  border-radius: 0 0 3px 3px;
  transform-origin: bottom;
  transition: transform 0.3s ease;
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
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.layout-widget__scale-battery {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.layout-widget__scale-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-widget__scale-btn:active {
  opacity: 0.7;
}

.layout-widget__scale-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
}

.layout-widget__scale-disconnected {
  font-size: var(--font-md);
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
  font-size: var(--font-md);
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

/* ---- Sleep widget (own zone) ---- */
.layout-widget__sleep {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* ---- Mobile: stack last shot card, wrap nav buttons ---- */
@media (max-width: 480px) {
  .layout-widget__last-shot-card {
    flex-direction: column;
    gap: 8px;
  }

  .layout-widget__last-shot-chart {
    height: 140px;
  }

  .layout-widget__last-shot-info {
    min-width: 0;
    max-width: none;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px 12px;
  }

  .layout-widget__last-shot-profile {
    width: 100%;
  }

  .layout-widget__nav {
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .layout-widget__nav-btn {
    padding: 8px 16px;
    font-size: var(--font-sm);
  }

  .layout-widget__actions {
    gap: 8px;
  }
}

/* ---- Tablet ---- */
@media (min-width: 481px) and (max-width: 960px) {
  .layout-widget__last-shot-info {
    min-width: 120px;
    max-width: 180px;
  }

  .layout-widget__nav {
    flex-wrap: wrap;
    justify-content: center;
  }
}

</style>
