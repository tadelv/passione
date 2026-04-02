<script setup>
/**
 * LayoutTab — Settings tab for configuring the IdlePage layout (v2).
 *
 * Live miniature preview of the 6-zone grid at top; tap a zone to select it.
 * Below the preview: editor panel for the selected zone.
 *   - Edge zones (top/bottom): dropdown to pick one widget or "Empty"
 *   - Stack zones (center): ordered list with move/remove + "Add widget"
 * Changes auto-save with 500ms debounce.
 */
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

const isCenterZone = computed(() => STACK_ZONES.has(selectedZone.value))

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

// Widgets not yet added to the selected zone
const unusedWidgets = computed(() => {
  const current = new Set(editZones[selectedZone.value] ?? [])
  return availableWidgets.value.filter(wt => !current.has(wt))
})
</script>

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
      <h4 class="layout-tab__section-title">
        {{ ZONE_LABELS[selectedZone] }}
        <span class="layout-tab__zone-hint">{{ isCenterZone ? '(vertical stack)' : '(horizontal row)' }}</span>
      </h4>

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
              :title="isCenterZone ? 'Move up' : 'Move left'"
            >{{ isCenterZone ? '&uarr;' : '&larr;' }}</button>
            <button
              class="layout-tab__widget-btn"
              :disabled="idx === editZones[selectedZone].length - 1"
              @click="moveWidget(idx, 1)"
              :title="isCenterZone ? 'Move down' : 'Move right'"
            >{{ isCenterZone ? '&darr;' : '&rarr;' }}</button>
            <button
              class="layout-tab__widget-btn layout-tab__widget-btn--remove"
              @click="removeWidget(idx)"
              title="Remove"
            >&times;</button>
          </div>
        </div>
      </div>
      <p v-else class="layout-tab__empty-hint">No widgets in this zone.</p>

      <div v-if="unusedWidgets.length" class="layout-tab__add-row">
        <select class="layout-tab__select" v-model="addWidgetType">
          <option value="" disabled>Add widget...</option>
          <option v-for="wt in unusedWidgets" :key="wt" :value="wt">
            {{ WIDGET_LABELS[wt] || wt }}
          </option>
        </select>
        <button
          class="layout-tab__add-btn"
          :disabled="!addWidgetType"
          @click="addWidget"
        >Add</button>
      </div>
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

<style scoped>
.layout-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.layout-tab__description {
  font-size: var(--font-md);
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
  color: var(--button-disabled-text);
}

.layout-tab__preview-zone--topLeft       { grid-area: topLeft; }
.layout-tab__preview-zone--topRight      { grid-area: topRight; }
.layout-tab__preview-zone--centerLeft    { grid-area: centerLeft; }
.layout-tab__preview-zone--centerRight   { grid-area: centerRight; }
.layout-tab__preview-zone--bottomLeft    { grid-area: bottomLeft; }
.layout-tab__preview-zone--bottomRight   { grid-area: bottomRight; }

.layout-tab__preview-zone-name {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.layout-tab__preview-zone-widget {
  font-size: var(--font-sm);
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
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
  margin: 0;
}

.layout-tab__zone-hint {
  font-size: var(--font-sm);
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-left: 8px;
}

.layout-tab__select {
  min-width: 160px;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-md);
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
  font-size: var(--font-md);
  color: var(--color-text);
  font-weight: 500;
}

.layout-tab__widget-actions {
  display: flex;
  gap: 4px;
}

.layout-tab__widget-btn {
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-body);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}

.layout-tab__widget-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
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
  font-size: var(--font-md);
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
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
}

.layout-tab__add-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  cursor: default;
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
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-tab__reset-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
}

.layout-tab__reset-btn:not(:disabled):active {
  transform: scale(0.96);
}

.layout-tab__save-message {
  font-size: var(--font-md);
  color: var(--color-success);
  font-weight: 500;
}

.layout-tab__loading {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
