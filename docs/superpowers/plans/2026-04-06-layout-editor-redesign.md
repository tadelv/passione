# Layout Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the settings-based layout editor with a WYSIWYG overlay on IdlePage, where users edit the layout directly on the real page with a bottom drawer for widget controls.

**Architecture:** IdlePage reads an `editLayout` query param to toggle edit mode. A new `LayoutEditOverlay` component renders dashed zone borders, labels, and dims widgets. Tapping a zone opens a new `LayoutEditorDrawer` bottom sheet with add/remove/reorder controls. `LayoutTab` becomes a simple launcher. Machine-state navigation is suppressed during edit mode via a provide/inject flag.

**Tech Stack:** Vue 3 Composition API, vue-router query params, existing `useLayout` composable

**Spec:** `docs/superpowers/specs/2026-04-06-layout-editor-redesign-design.md`

---

### Task 1: Add edit-mode suppression flag

Prevent machine-state auto-navigation from pulling the user away from IdlePage during layout editing.

**Files:**
- Modify: `src/App.vue:266-278` (state watcher that calls `router.replace`)

- [ ] **Step 1: Add a provide for editLayout flag**

In `src/App.vue`, after the existing provides (around line 90), add a reactive ref and provide it:

```js
const editingLayout = ref(false)
provide('editingLayout', editingLayout)
```

Add `ref` to the existing vue import if not already there (it is).

- [ ] **Step 2: Guard the auto-navigation watcher**

In the `watch(machine.state, ...)` callback (line 234), add a guard at the top of the state-navigation logic. Find the line:

```js
const targetRoute = STATE_ROUTES[newState]
```

Add this guard just before it:

```js
  // Suppress navigation during layout editing
  if (editingLayout.value && route.path === '/') return
```

This ensures that if the machine changes state while the user is editing layout on IdlePage, it won't yank them away. Sleep/wake handling above this line still works (the user would get pulled to screensaver on sleep, which is correct — you shouldn't edit layout while the machine sleeps).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.vue
git commit -m "feat(layout): add editingLayout flag to suppress auto-navigation"
```

---

### Task 2: Simplify LayoutTab to a launcher

Strip the LayoutTab settings panel down to a description, "Edit Layout" button, and "Reset to Default".

**Files:**
- Modify: `src/components/settings/LayoutTab.vue`

- [ ] **Step 1: Replace the script setup**

Replace the entire `<script setup>` block with:

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLayout } from '../../composables/useLayout.js'

const router = useRouter()
const { loaded, load, resetLayout } = useLayout()

const saving = ref(false)
const saveMessage = ref('')

onMounted(async () => {
  if (!loaded.value) await load()
})

function openEditor() {
  router.push({ path: '/', query: { editLayout: 'true' } })
}

async function onReset() {
  saving.value = true
  await resetLayout()
  saving.value = false
  saveMessage.value = 'Reset to default'
  setTimeout(() => { saveMessage.value = '' }, 2000)
}
</script>
```

- [ ] **Step 2: Replace the template**

Replace the entire `<template>` block with:

```vue
<template>
  <div class="layout-tab" v-if="loaded">
    <p class="layout-tab__description">
      Customize which widgets appear in each zone of the home screen.
    </p>

    <div class="layout-tab__actions">
      <button class="layout-tab__edit-btn" @click="openEditor">
        Edit Layout
      </button>
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

- [ ] **Step 3: Replace the style block**

Replace the entire `<style scoped>` block with:

```vue
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

.layout-tab__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.layout-tab__edit-btn {
  padding: 12px 32px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-tab__edit-btn:active {
  filter: brightness(0.85);
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
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/LayoutTab.vue
git commit -m "feat(layout): simplify LayoutTab to launcher with Edit Layout button"
```

---

### Task 3: Create LayoutEditorDrawer component

Bottom sheet that shows the widget list for a selected zone with add/remove/reorder controls.

**Files:**
- Create: `src/components/LayoutEditorDrawer.vue`

- [ ] **Step 1: Create the component**

Create `src/components/LayoutEditorDrawer.vue`:

```vue
<script setup>
import { ref, computed } from 'vue'
import { useLayout } from '../composables/useLayout.js'

const props = defineProps({
  zone: { type: String, required: true },
})

const emit = defineEmits(['close'])

const {
  layout,
  setZoneWidgets,
  WIDGET_TYPES,
  WIDGET_LABELS,
  WIDGET_ZONE_RULES,
  STACK_ZONES,
} = useLayout()

const isStack = computed(() => STACK_ZONES.has(props.zone))

const ZONE_LABELS = {
  topLeft: 'Top Left',
  topRight: 'Top Right',
  centerLeft: 'Center Left',
  centerRight: 'Center Right',
  bottomLeft: 'Bottom Left',
  bottomRight: 'Bottom Right',
}

const widgets = computed(() => layout.value.zones[props.zone]?.widgets ?? [])

const availableWidgets = computed(() => {
  const isCenter = STACK_ZONES.has(props.zone)
  return WIDGET_TYPES.filter(wt => {
    const rule = WIDGET_ZONE_RULES[wt]
    return rule === 'any' || (rule === 'center' && isCenter) || (rule === 'edge' && !isCenter)
  })
})

const unusedWidgets = computed(() => {
  const current = new Set(widgets.value)
  return availableWidgets.value.filter(wt => !current.has(wt))
})

const addWidgetType = ref('')

function moveWidget(index, direction) {
  const arr = [...widgets.value]
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= arr.length) return
  ;[arr[index], arr[newIndex]] = [arr[newIndex], arr[index]]
  setZoneWidgets(props.zone, arr)
}

function removeWidget(index) {
  const arr = [...widgets.value]
  arr.splice(index, 1)
  setZoneWidgets(props.zone, arr)
}

function addWidget() {
  if (!addWidgetType.value) return
  setZoneWidgets(props.zone, [...widgets.value, addWidgetType.value])
  addWidgetType.value = ''
}
</script>

<template>
  <div class="drawer-backdrop" @click.self="emit('close')">
    <div class="drawer" role="dialog" aria-label="Layout editor">
      <div class="drawer__handle" />

      <h3 class="drawer__title">
        {{ ZONE_LABELS[zone] }}
        <span class="drawer__hint">{{ isStack ? '(vertical stack)' : '(horizontal row)' }}</span>
      </h3>

      <div v-if="widgets.length" class="drawer__list">
        <div v-for="(wt, idx) in widgets" :key="idx" class="drawer__row">
          <span class="drawer__widget-name">{{ WIDGET_LABELS[wt] || wt }}</span>
          <div class="drawer__row-actions">
            <button
              class="drawer__btn"
              :disabled="idx === 0"
              @click="moveWidget(idx, -1)"
              :aria-label="isStack ? 'Move up' : 'Move left'"
            >{{ isStack ? '\u2191' : '\u2190' }}</button>
            <button
              class="drawer__btn"
              :disabled="idx === widgets.length - 1"
              @click="moveWidget(idx, 1)"
              :aria-label="isStack ? 'Move down' : 'Move right'"
            >{{ isStack ? '\u2193' : '\u2192' }}</button>
            <button
              class="drawer__btn drawer__btn--remove"
              @click="removeWidget(idx)"
              aria-label="Remove widget"
            >&times;</button>
          </div>
        </div>
      </div>
      <p v-else class="drawer__empty">No widgets in this zone.</p>

      <div v-if="unusedWidgets.length" class="drawer__add-row">
        <select class="drawer__select" v-model="addWidgetType">
          <option value="" disabled>Add widget...</option>
          <option v-for="wt in unusedWidgets" :key="wt" :value="wt">
            {{ WIDGET_LABELS[wt] || wt }}
          </option>
        </select>
        <button class="drawer__add-btn" :disabled="!addWidgetType" @click="addWidget">Add</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}

.drawer {
  width: 100%;
  max-width: 600px;
  max-height: 50vh;
  overflow-y: auto;
  background: var(--color-surface);
  border-radius: 16px 16px 0 0;
  padding: 12px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: slide-up 0.2s ease-out;
}

@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.drawer__handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-text-secondary);
  opacity: 0.4;
  align-self: center;
  margin-bottom: 4px;
}

.drawer__title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.drawer__hint {
  font-size: var(--font-sm);
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-left: 8px;
}

.drawer__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drawer__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
}

.drawer__widget-name {
  font-size: var(--font-md);
  color: var(--color-text);
  font-weight: 500;
}

.drawer__row-actions {
  display: flex;
  gap: 4px;
}

.drawer__btn {
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

.drawer__btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  cursor: default;
}

.drawer__btn:not(:disabled):active {
  opacity: 0.7;
}

.drawer__btn--remove {
  color: var(--color-error);
  border-color: var(--color-error);
}

.drawer__empty {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  font-style: italic;
  margin: 0;
}

.drawer__add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.drawer__select {
  flex: 1;
  min-width: 140px;
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

.drawer__add-btn {
  padding: 8px 20px;
  height: 44px;
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

.drawer__add-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  cursor: default;
}
</style>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (component is not yet imported anywhere, so no runtime verification yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/LayoutEditorDrawer.vue
git commit -m "feat(layout): create LayoutEditorDrawer bottom sheet component"
```

---

### Task 4: Create LayoutEditOverlay component

The overlay that renders on IdlePage in edit mode — dashed zone borders, zone labels, dimming, zone selection, and the "Done" pill.

**Files:**
- Create: `src/components/LayoutEditOverlay.vue`

- [ ] **Step 1: Create the component**

Create `src/components/LayoutEditOverlay.vue`:

```vue
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLayout } from '../composables/useLayout.js'
import LayoutEditorDrawer from './LayoutEditorDrawer.vue'

const router = useRouter()
const { ZONE_NAMES, ZONE_LABELS } = useLayout()

const selectedZone = ref(null)

function selectZone(zoneName) {
  selectedZone.value = zoneName
}

function closeDrawer() {
  selectedZone.value = null
}

function done() {
  selectedZone.value = null
  router.replace({ path: '/', query: {} })
}
</script>

<template>
  <div class="edit-overlay">
    <!-- Zone tap targets -->
    <div
      v-for="zoneName in ZONE_NAMES"
      :key="zoneName"
      class="edit-overlay__zone"
      :class="[
        `edit-overlay__zone--${zoneName}`,
        { 'edit-overlay__zone--selected': selectedZone === zoneName },
      ]"
      role="button"
      :aria-label="`Edit ${ZONE_LABELS[zoneName]} zone`"
      tabindex="0"
      @click="selectZone(zoneName)"
      @keydown.enter="selectZone(zoneName)"
      @keydown.space.prevent="selectZone(zoneName)"
    >
      <span class="edit-overlay__zone-label">{{ ZONE_LABELS[zoneName] }}</span>
    </div>

    <!-- Done pill -->
    <button class="edit-overlay__done" @click="done" aria-label="Exit layout editor">
      Done
    </button>

    <!-- Bottom drawer -->
    <LayoutEditorDrawer
      v-if="selectedZone"
      :zone="selectedZone"
      @close="closeDrawer"
    />
  </div>
</template>

<style scoped>
.edit-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--z-popover);
  pointer-events: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "topLeft     topRight"
    "centerLeft  centerRight"
    "bottomLeft  bottomRight";
  padding: var(--margin-standard);
  gap: var(--spacing-large);
}

.edit-overlay__zone {
  pointer-events: auto;
  border: 2px dashed var(--color-text-secondary);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
  position: relative;
  min-height: 44px;
}

.edit-overlay__zone:hover {
  border-color: var(--color-text);
  background: rgba(255, 255, 255, 0.03);
}

.edit-overlay__zone--selected {
  border-color: var(--color-primary);
  border-style: solid;
  background: rgba(255, 255, 255, 0.05);
}

.edit-overlay__zone--topLeft       { grid-area: topLeft; }
.edit-overlay__zone--topRight      { grid-area: topRight; }
.edit-overlay__zone--centerLeft    { grid-area: centerLeft; }
.edit-overlay__zone--centerRight   { grid-area: centerRight; }
.edit-overlay__zone--bottomLeft    { grid-area: bottomLeft; }
.edit-overlay__zone--bottomRight   { grid-area: bottomRight; }

.edit-overlay__zone-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--color-surface);
  padding: 2px 8px;
  border-radius: 4px;
  pointer-events: none;
}

.edit-overlay__zone--selected .edit-overlay__zone-label {
  color: var(--color-primary);
}

.edit-overlay__done {
  pointer-events: auto;
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: calc(var(--z-popover) + 1);
  padding: 10px 32px;
  border-radius: 24px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  -webkit-tap-highlight-color: transparent;
}

.edit-overlay__done:active {
  filter: brightness(0.85);
}
</style>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/LayoutEditOverlay.vue
git commit -m "feat(layout): create LayoutEditOverlay with zone selection and Done pill"
```

---

### Task 5: Wire edit mode into IdlePage

Connect the overlay and edit-mode flag into IdlePage.

**Files:**
- Modify: `src/pages/IdlePage.vue`

- [ ] **Step 1: Add imports and edit-mode state**

In the `<script setup>` section of `src/pages/IdlePage.vue`, add imports after the existing ones (line 7):

```js
import { useRoute } from 'vue-router'
import LayoutEditOverlay from '../components/LayoutEditOverlay.vue'
```

After the existing `const router = useRouter()` (line 11), add:

```js
const route = useRoute()
```

After the existing injects (around line 22), add:

```js
const editingLayout = inject('editingLayout', ref(false))

const isEditMode = computed(() => route.query.editLayout === 'true')

// Sync the editingLayout flag so App.vue suppresses auto-navigation
watch(isEditMode, (v) => { editingLayout.value = v }, { immediate: true })
```

Add `watch` to the vue import on line 2 (it currently has `ref, computed, inject, onMounted`):

```js
import { ref, computed, inject, onMounted, watch } from 'vue'
```

- [ ] **Step 2: Update the template**

In the template, add the overlay and dimming. Find the opening `<div class="idle-page"` tag (line 277) and add the `idle-page--editing` class:

```html
  <div class="idle-page" :class="{
    'idle-page--center-left-only': hasCenterLeft && !hasCenterRight,
    'idle-page--center-right-only': !hasCenterLeft && hasCenterRight,
    'idle-page--editing': isEditMode,
  }">
```

Just before the closing `</div>` of the idle-page (before the `PresetEditPopup`), add:

```html
    <!-- Layout edit overlay -->
    <LayoutEditOverlay v-if="isEditMode" />
```

- [ ] **Step 3: Add edit-mode CSS**

In the `<style scoped>` section, add at the end (before the closing `</style>` tag):

```css
/* Edit mode: dim all widgets, disable interaction */
.idle-page--editing > :not(.edit-overlay) {
  opacity: 0.5;
  filter: saturate(0.3);
  pointer-events: none;
}

.idle-page--editing {
  position: relative;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/IdlePage.vue
git commit -m "feat(layout): wire edit mode into IdlePage with overlay and dimming"
```

---

### Task 6: Clean up LayoutEditOverlay to handle cleanup on unmount

Ensure the `editingLayout` flag is properly cleaned up if the user navigates away without pressing Done (e.g., browser back).

**Files:**
- Modify: `src/pages/IdlePage.vue`

- [ ] **Step 1: Add onUnmounted cleanup**

In `src/pages/IdlePage.vue`, add `onUnmounted` to the vue import:

```js
import { ref, computed, inject, onMounted, onUnmounted, watch } from 'vue'
```

After the `watch(isEditMode, ...)` line, add:

```js
onUnmounted(() => {
  editingLayout.value = false
})
```

This ensures the suppression flag is cleared if IdlePage unmounts (e.g., machine starts an operation despite the guard, or the user navigates via browser controls).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/IdlePage.vue
git commit -m "fix(layout): clean up editingLayout flag on IdlePage unmount"
```

---

### Task 7: Verify end-to-end flow manually

**Files:** None (manual testing)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test the full flow**

1. Navigate to Settings > Layout tab
2. Verify "Edit Layout" button and "Reset to Default" button are shown (no zone editor)
3. Tap "Edit Layout" — should navigate to IdlePage with `?editLayout=true`
4. Verify: widgets are dimmed/desaturated, dashed zone borders visible, zone labels shown, "Done" pill at top
5. Tap a zone — verify it highlights with solid primary border
6. Verify drawer slides up with widget list for that zone
7. Add a widget, remove a widget, reorder — verify the real layout updates live behind the overlay
8. Tap a different zone — drawer updates to show that zone's widgets
9. Tap backdrop — drawer closes
10. Tap "Done" — returns to normal IdlePage with changes persisted
11. Navigate to Settings > Layout > "Reset to Default" — verify it resets

- [ ] **Step 3: Final commit (if any fixes needed)**

Fix any issues discovered during testing, then commit.
