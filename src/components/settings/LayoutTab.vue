<script setup>
/**
 * LayoutTab — Settings tab for configuring the IdlePage layout.
 *
 * Users can select which widget appears in each zone, toggle StatusBar
 * section visibility, preview the layout, and reset to defaults.
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useLayout } from '../../composables/useLayout.js'

const {
  layout,
  loaded,
  loading,
  load,
  setLayout,
  resetLayout,
  WIDGET_TYPES,
  WIDGET_LABELS,
  ZONE_NAMES,
  ZONE_LABELS,
  DEFAULT_LAYOUT,
} = useLayout()

// Local editing state (cloned from the live layout)
const editZones = reactive({})
const editStatusBarConfig = reactive({
  showConnection: true,
  showState: true,
  showProfile: true,
  showTemperature: true,
  showWaterLevel: true,
})

const dirty = ref(false)
const saving = ref(false)
const saveMessage = ref('')

// Human-readable labels for status bar toggle fields
const STATUS_BAR_FIELDS = [
  { key: 'showConnection', label: 'Connection indicator' },
  { key: 'showState', label: 'Machine state' },
  { key: 'showProfile', label: 'Profile name' },
  { key: 'showTemperature', label: 'Temperature' },
  { key: 'showWaterLevel', label: 'Water level' },
]

/**
 * Sync local editing state from the live layout.
 */
function syncFromLayout() {
  // Clear and repopulate zones
  for (const key of ZONE_NAMES) {
    editZones[key] = layout.value.zones[key]?.type ?? 'empty'
  }

  // StatusBar config
  const sbc = layout.value.statusBarConfig ?? {}
  editStatusBarConfig.showConnection = sbc.showConnection !== false
  editStatusBarConfig.showState = sbc.showState !== false
  editStatusBarConfig.showProfile = sbc.showProfile !== false
  editStatusBarConfig.showTemperature = sbc.showTemperature !== false
  editStatusBarConfig.showWaterLevel = sbc.showWaterLevel !== false

  dirty.value = false
  saveMessage.value = ''
}

// Load layout if not already loaded
onMounted(async () => {
  if (!loaded.value) {
    await load()
  }
  syncFromLayout()
})

// Resync if layout changes externally
watch(layout, () => {
  if (!dirty.value) {
    syncFromLayout()
  }
})

function onZoneChange() {
  dirty.value = true
  saveMessage.value = ''
}

function onStatusBarToggle() {
  dirty.value = true
  saveMessage.value = ''
}

/**
 * Build a layout object from the editing state and persist it.
 */
async function save() {
  saving.value = true
  saveMessage.value = ''

  const newLayout = {
    version: 1,
    zones: {},
  }

  for (const zoneName of ZONE_NAMES) {
    const widgetType = editZones[zoneName]
    if (widgetType && widgetType !== 'empty') {
      newLayout.zones[zoneName] = { type: widgetType }
    }
  }

  // Include statusBarConfig if any flag is non-default (false)
  const sbc = { ...editStatusBarConfig }
  const hasCustomStatusBar = Object.values(sbc).some(v => v === false)
  if (hasCustomStatusBar) {
    newLayout.statusBarConfig = sbc
  }

  await setLayout(newLayout)
  dirty.value = false
  saving.value = false
  saveMessage.value = 'Layout saved'
  setTimeout(() => { saveMessage.value = '' }, 2000)
}

/**
 * Reset to the default layout and sync editing state.
 */
async function onReset() {
  saving.value = true
  await resetLayout()
  syncFromLayout()
  saving.value = false
  saveMessage.value = 'Reset to default'
  setTimeout(() => { saveMessage.value = '' }, 2000)
}

// Computed preview grid — maps zone positions to visual grid areas
const previewZones = computed(() => {
  const result = []
  for (const zoneName of ZONE_NAMES) {
    const widgetType = editZones[zoneName]
    if (widgetType && widgetType !== 'empty') {
      result.push({
        name: zoneName,
        label: ZONE_LABELS[zoneName],
        widget: WIDGET_LABELS[widgetType] || widgetType,
      })
    }
  }
  return result
})
</script>

<template>
  <div class="layout-tab" v-if="loaded">
    <p class="layout-tab__description">
      Configure which widgets appear in each zone of the home screen. Changes
      are saved to the gateway and apply immediately.
    </p>

    <div class="layout-tab__main">
      <!-- Zone configuration panel -->
      <div class="layout-tab__zones">
        <h4 class="layout-tab__section-title">Zone Widgets</h4>

        <div
          v-for="zoneName in ZONE_NAMES"
          :key="zoneName"
          class="layout-tab__zone-row"
        >
          <label class="layout-tab__zone-label" :for="`zone-${zoneName}`">
            {{ ZONE_LABELS[zoneName] }}
          </label>
          <select
            :id="`zone-${zoneName}`"
            class="layout-tab__select"
            v-model="editZones[zoneName]"
            @change="onZoneChange"
          >
            <option
              v-for="wt in WIDGET_TYPES"
              :key="wt"
              :value="wt"
            >
              {{ WIDGET_LABELS[wt] || wt }}
            </option>
          </select>
        </div>
      </div>

      <!-- Status bar configuration -->
      <div class="layout-tab__status-bar-config">
        <h4 class="layout-tab__section-title">Status Bar Sections</h4>
        <p class="layout-tab__hint">
          Control which sections are visible in the global status bar at the top of every page.
        </p>

        <div
          v-for="field in STATUS_BAR_FIELDS"
          :key="field.key"
          class="layout-tab__toggle-row"
        >
          <label class="layout-tab__toggle-label" :for="`sb-${field.key}`">
            {{ field.label }}
          </label>
          <button
            :id="`sb-${field.key}`"
            class="layout-tab__toggle"
            :class="{ 'layout-tab__toggle--on': editStatusBarConfig[field.key] }"
            @click="editStatusBarConfig[field.key] = !editStatusBarConfig[field.key]; onStatusBarToggle()"
          >
            {{ editStatusBarConfig[field.key] ? 'ON' : 'OFF' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Preview -->
    <div class="layout-tab__preview-section">
      <h4 class="layout-tab__section-title">Layout Preview</h4>
      <div class="layout-tab__preview">
        <div
          v-for="zone in previewZones"
          :key="zone.name"
          class="layout-tab__preview-zone"
          :class="`layout-tab__preview-zone--${zone.name}`"
        >
          <span class="layout-tab__preview-zone-name">{{ zone.label }}</span>
          <span class="layout-tab__preview-zone-widget">{{ zone.widget }}</span>
        </div>
        <div v-if="!previewZones.length" class="layout-tab__preview-empty">
          All zones empty
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="layout-tab__actions">
      <button
        class="layout-tab__save-btn"
        :disabled="!dirty || saving"
        @click="save"
      >
        {{ saving ? 'Saving...' : 'Save Layout' }}
      </button>
      <button
        class="layout-tab__reset-btn"
        :disabled="saving"
        @click="onReset"
      >
        Reset to Default
      </button>
      <span v-if="saveMessage" class="layout-tab__save-message">{{ saveMessage }}</span>
    </div>
  </div>
  <div v-else class="layout-tab__loading">Loading layout...</div>
</template>

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

.layout-tab__main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

@media (max-width: 700px) {
  .layout-tab__main {
    grid-template-columns: 1fr;
  }
}

.layout-tab__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
  margin: 0 0 12px 0;
}

.layout-tab__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
  margin: 0 0 12px 0;
  line-height: 1.4;
}

/* ---- Zone rows ---- */
.layout-tab__zones {
  display: flex;
  flex-direction: column;
}

.layout-tab__zone-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
}

.layout-tab__zone-row:last-child {
  border-bottom: none;
}

.layout-tab__zone-label {
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
  white-space: nowrap;
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

/* ---- Status bar toggles ---- */
.layout-tab__status-bar-config {
  display: flex;
  flex-direction: column;
}

.layout-tab__toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
}

.layout-tab__toggle-row:last-child {
  border-bottom: none;
}

.layout-tab__toggle-label {
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
}

.layout-tab__toggle {
  width: 64px;
  height: 32px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.layout-tab__toggle--on {
  background: var(--color-success);
  color: #fff;
  border-color: var(--color-success);
}

/* ---- Preview ---- */
.layout-tab__preview-section {
  display: flex;
  flex-direction: column;
}

.layout-tab__preview {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: auto auto auto auto;
  grid-template-areas:
    "topBar topBar topBar"
    "extraTop extraTop extraTop"
    "centerLeft centerMain centerRight"
    "extraBottom extraBottom extraBottom"
    "bottomBar bottomBar bottomBar";
  gap: 6px;
  padding: 16px;
  background: var(--color-background);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  min-height: 180px;
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
  border: 1px solid var(--color-border);
  min-height: 40px;
}

.layout-tab__preview-zone--topBar       { grid-area: topBar; }
.layout-tab__preview-zone--centerLeft   { grid-area: centerLeft; }
.layout-tab__preview-zone--centerMain   { grid-area: centerMain; }
.layout-tab__preview-zone--centerRight  { grid-area: centerRight; }
.layout-tab__preview-zone--bottomBar    { grid-area: bottomBar; }
.layout-tab__preview-zone--extraTop     { grid-area: extraTop; }
.layout-tab__preview-zone--extraBottom  { grid-area: extraBottom; }
.layout-tab__preview-zone--extraOverlay { grid-area: topBar; opacity: 0.6; }

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

.layout-tab__preview-empty {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

/* ---- Action buttons ---- */
.layout-tab__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.layout-tab__save-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s ease;
}

.layout-tab__save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.layout-tab__save-btn:not(:disabled):active {
  transform: scale(0.96);
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
