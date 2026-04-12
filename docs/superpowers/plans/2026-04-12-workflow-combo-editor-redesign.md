# Workflow Combo Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the workflow combo editor redesign — IdlePage combo tap no longer starts espresso, WorkflowEditorPage adopts live-apply + unsaved-changes dialog, BeanInfoPage is renamed to WorkflowEditorPage, the preset→combo terminology cleanup is completed, and a profile-change watcher bug is fixed.

**Architecture:** Five features land across eight files and one new component (`UnsavedChangesDialog`). The editor is redesigned around a live-apply watcher that pushes every field edit to `updateWorkflow()` (debounced 300 ms), with an explicit Save button that only writes to the combo preset, and a dialog on Back with four choices (Save / Save as New / Discard / Keep changes). A captured `workflowSnapshot` powers the Discard path.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), vue-i18n, vue-router, Playwright e2e, existing `useWorkflow` / `useLayout` / `useSettings` composables, existing `PresetPillRow` / `BottomBar` / `PresetEditPopup` components.

**Spec:** `docs/superpowers/specs/2026-04-12-workflow-combo-editor-redesign-design.md`

---

## File Structure

**Renamed:**
- `src/pages/BeanInfoPage.vue` → `src/pages/WorkflowEditorPage.vue`

**Created:**
- `src/components/UnsavedChangesDialog.vue` — four-action Back dialog
- `tests/e2e/workflow-combo.spec.js` — 4 test cases

**Modified:**
- `src/composables/useLayout.js` — rename widget type + legacy alias
- `src/components/LayoutWidget.vue` — workflow combo activate removal, confirmActivate prop, widget type string, edit-enabled prop rename
- `src/components/PresetPillRow.vue` — add `confirmActivate`, rename `longPressEnabled` → `editEnabled`, rename emit `long-press` → `edit`
- `src/pages/WorkflowEditorPage.vue` — full editor redesign + profile watcher fix + handler renames
- `src/pages/IdlePage.vue` — `onComboLongPress` → `onComboEdit`, widget event map rename, profile-fetch optimization, router path updates
- `src/router/index.js` — rename import + route + add redirect
- `src/i18n/locales/en.json` — add `workflowEditor` block
- `CLAUDE.md` — rewrite lines 115/118, add terminology paragraph
- `tests/mock-server.js` — add a second mock profile for round-trip test

---

## Task 1: Rename widget type `workflowPresets` → `workflowCombos` + legacy alias

**Files:**
- Modify: `src/composables/useLayout.js:43-72, ~103-120`
- Modify: `src/components/LayoutWidget.vue:200-213`

- [ ] **Step 1: Update the widget type enum and labels**

Edit `src/composables/useLayout.js`. Replace `'workflowPresets'` with `'workflowCombos'` in the `WIDGET_TYPES` array (line 47):

```js
const WIDGET_TYPES = [
  'actionButtons',
  'shotPlan',
  'lastShot',
  'workflowCombos',
  'navButtons',
  'scaleInfo',
  'fullscreen',
]
```

In `WIDGET_LABELS` (line 53), rename the key and update the display label:

```js
const WIDGET_LABELS = {
  actionButtons: 'Action Buttons',
  shotPlan: 'Shot Plan',
  lastShot: 'Last Shot',
  workflowCombos: 'Workflows',
  navButtons: 'Navigation Buttons',
  scaleInfo: 'Scale Info',
  fullscreen: 'Fullscreen Toggle',
}
```

In `WIDGET_ZONE_RULES` (line 64), rename the key:

```js
const WIDGET_ZONE_RULES = {
  actionButtons: 'center',
  shotPlan: 'center',
  lastShot: 'center',
  workflowCombos: 'center',
  navButtons: 'edge',
  scaleInfo: 'edge',
  fullscreen: 'edge',
}
```

In `DEFAULT_LAYOUT.zones.centerRight.widgets` (line 82), update:

```js
centerRight: { widgets: ['workflowCombos', 'lastShot'] },
```

- [ ] **Step 2: Add the legacy alias normalizer inside `validateLayout`**

Still in `src/composables/useLayout.js`, inside `validateLayout` (around line 103-120), in the block that filters widgets per zone, add a rewrite step that converts any legacy `'workflowPresets'` string to `'workflowCombos'` before the `WIDGET_TYPES.includes` check:

```js
for (const zoneName of ZONE_NAMES) {
  const zoneConfig = raw.zones[zoneName]
  if (!zoneConfig || !Array.isArray(zoneConfig.widgets)) {
    validated.zones[zoneName] = { widgets: [] }
    continue
  }
  const widgets = zoneConfig.widgets
    .map(w => (w === 'workflowPresets' ? 'workflowCombos' : w))
    .filter(w => WIDGET_TYPES.includes(w))
  validated.zones[zoneName] = { widgets }
}
```

- [ ] **Step 3: Update the `LayoutWidget.vue` template branch**

Edit `src/components/LayoutWidget.vue` around lines 200-213. Update the comment and the `v-else-if` type check:

```vue
    <!-- Workflow Combos -->
    <template v-else-if="type === 'workflowCombos'">
      <div v-if="workflowCombos.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">Workflows</span>
        <PresetPillRow
          :presets="workflowCombos"
          :selected-index="selectedWorkflowCombo"
          :long-press-enabled="true"
          @select="idx => emit('workflow-combo-select', idx)"
          @activate="() => emit('start-espresso')"
          @long-press="idx => emit('workflow-combo-long-press', idx)"
        />
      </div>
      <div v-else class="layout-widget__preset-section">
```

(`activate` and `long-press` handlers stay for now — Task 4 will remove them.)

- [ ] **Step 4: Run the full e2e suite to verify nothing broke**

Run: `npm run test:e2e -- --reporter=line`
Expected: all tests pass (legacy alias keeps saved layouts working).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useLayout.js src/components/LayoutWidget.vue
git commit -m "refactor: rename workflowPresets widget type to workflowCombos (legacy alias)"
```

---

## Task 2: Rename `PresetPillRow` `longPressEnabled` → `editEnabled`, `long-press` emit → `edit`

**Files:**
- Modify: `src/components/PresetPillRow.vue`
- Modify: `src/components/LayoutWidget.vue`
- Modify: `src/pages/IdlePage.vue`
- Modify: `src/pages/BeanInfoPage.vue`

- [ ] **Step 1: Rename the prop and emit in `PresetPillRow.vue`**

Edit `src/components/PresetPillRow.vue`. In the `defineProps` block (lines 4-13), rename `longPressEnabled` to `editEnabled`:

```js
const props = defineProps({
  /** Array of preset objects: [{ name, emoji, ... }] */
  presets: { type: Array, default: () => [] },
  /** Index of the currently selected preset (-1 = none) */
  selectedIndex: { type: Number, default: -1 },
  /** Enable double-tap interaction (opens edit popup) */
  editEnabled: { type: Boolean, default: false },
  /** P6-4: Accessible label for the preset list */
  ariaLabel: { type: String, default: 'Presets' },
})
```

In `defineEmits` (line 15-19), rename `long-press` → `edit`:

```js
const emit = defineEmits([
  'select',
  'activate',
  'edit',
])
```

In `onClick` (line 46-49), update the prop reference and emit name:

```js
function onClick(index, event) {
  // Double-tap → edit (event.detail is the native click count)
  if (event.detail >= 2 && props.editEnabled) {
    clearConfirm()
    emit('edit', index)
    return
  }
  // ... rest unchanged
```

- [ ] **Step 2: Update caller `LayoutWidget.vue`**

Edit `src/components/LayoutWidget.vue` around line 202-213 (workflowCombos branch). Rename the prop and event:

```vue
    <template v-else-if="type === 'workflowCombos'">
      <div v-if="workflowCombos.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">Workflows</span>
        <PresetPillRow
          :presets="workflowCombos"
          :selected-index="selectedWorkflowCombo"
          :edit-enabled="true"
          @select="idx => emit('workflow-combo-select', idx)"
          @activate="() => emit('start-espresso')"
          @edit="idx => emit('workflow-combo-edit', idx)"
        />
      </div>
```

Also update `defineEmits` earlier in the file (around line 32-39). Find the `'workflow-combo-long-press'` emit name and rename to `'workflow-combo-edit'`:

```js
const emit = defineEmits([
  'start-espresso',
  'start-steam',
  'start-hot-water',
  'start-flush',
  'workflow-combo-select',
  'workflow-combo-edit',
])
```

- [ ] **Step 3: Update caller `IdlePage.vue`**

Edit `src/pages/IdlePage.vue`. Find the function declaration for `onComboLongPress` (around line 164):

```js
function onComboEdit(index) {
  const combo = workflowCombos.value[index]
  if (!combo) return
  editPopupPreset.value = combo
  editPopupIndex.value = index
  editPopupVisible.value = true
}
```

Then find the `widgetEvents` object (around line 237-244) and rename:

```js
const widgetEvents = {
  'start-espresso': startEspresso,
  'start-steam': startSteam,
  'start-hot-water': startHotWater,
  'start-flush': startFlush,
  'workflow-combo-select': onComboSelect,
  'workflow-combo-edit': onComboEdit,
}
```

- [ ] **Step 4: Update caller `BeanInfoPage.vue`**

Edit `src/pages/BeanInfoPage.vue` around line 417-423. Update the prop and event:

```vue
      <PresetPillRow
        :presets="workflowCombos"
        :selected-index="selectedIndex"
        :edit-enabled="true"
        @select="onPresetSelect"
        @edit="onComboEdit"
      />
```

Find the function declaration for `onComboLongPress` (grep for it — likely around lines 240-260) and rename it to `onComboEdit`. Only the function name changes; the body stays identical.

- [ ] **Step 5: Grep for any remaining references and verify**

Run: `grep -rn "longPressEnabled\|long-press-enabled\|long-press\|onComboLongPress\|workflow-combo-long-press" src/ tests/`

Expected output: no hits in `src/` except possibly in CSS class names (which aren't affected). If any hits remain in Vue/JS code, fix them.

- [ ] **Step 6: Run the full e2e suite to catch any missed callers**

Run: `npm run test:e2e -- --reporter=line`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/PresetPillRow.vue src/components/LayoutWidget.vue src/pages/IdlePage.vue src/pages/BeanInfoPage.vue
git commit -m "refactor: rename PresetPillRow longPressEnabled → editEnabled and emit"
```

---

## Task 3: Rename `BeanInfoPage` → `WorkflowEditorPage` (file + route + redirect)

**Files:**
- Rename: `src/pages/BeanInfoPage.vue` → `src/pages/WorkflowEditorPage.vue`
- Modify: `src/router/index.js`
- Modify: `src/pages/IdlePage.vue` (any `/bean-info` references)
- Modify: Any other caller of `/bean-info` or `name: 'bean-info'`

- [ ] **Step 1: Rename the file with git mv**

Run:
```bash
git mv src/pages/BeanInfoPage.vue src/pages/WorkflowEditorPage.vue
```

- [ ] **Step 2: Update the router import and route**

Edit `src/router/index.js`. Find line 20:

```js
const WorkflowEditorPage = () => import('../pages/WorkflowEditorPage.vue')
```

Find line 45 (the route definition):

```js
{ path: '/workflow/edit', name: 'workflow-editor', component: WorkflowEditorPage },
{ path: '/bean-info', redirect: '/workflow/edit' },
```

- [ ] **Step 3: Grep for `/bean-info` and `bean-info` references in src/ and update**

Run: `grep -rn "/bean-info\|'bean-info'" src/ tests/`

Expected hits: `src/pages/IdlePage.vue`, possibly `src/pages/ProfileSelectorPage.vue` (for the `?from=workflow` return navigation), possibly in `tests/e2e/*.spec.js`.

For each hit in `src/`, replace `/bean-info` → `/workflow/edit` and `name: 'bean-info'` → `name: 'workflow-editor'`. For hits in `tests/`, leave them alone for now (the redirect keeps them working, and we'll touch tests in Task 11).

- [ ] **Step 4: Grep for references to `BeanInfoPage` in src/**

Run: `grep -rn "BeanInfoPage" src/`

Expected: only `src/router/index.js` (already updated in Step 2). If there are other references (e.g., docs or comments), replace with `WorkflowEditorPage`.

- [ ] **Step 5: Run the full e2e suite**

Run: `npm run test:e2e -- --reporter=line`
Expected: all tests pass (the redirect keeps legacy URLs working).

- [ ] **Step 6: Commit**

```bash
git add src/pages/WorkflowEditorPage.vue src/router/index.js src/pages/IdlePage.vue
git commit -m "refactor: rename BeanInfoPage → WorkflowEditorPage, /bean-info redirect"
```

(Add any additional modified files from Step 3 to the `git add` command.)

---

## Task 4: Remove tap-to-start from workflow combo pills

**Files:**
- Modify: `src/components/LayoutWidget.vue:202-213`
- Modify: `src/components/PresetPillRow.vue`
- Test: `tests/e2e/workflow-combo.spec.js` (will be created in Task 11 — for now, test manually via the existing suite)

- [ ] **Step 1: Add the `confirmActivate` prop to `PresetPillRow.vue`**

Edit `src/components/PresetPillRow.vue`. Add a new prop after `editEnabled`:

```js
const props = defineProps({
  /** Array of preset objects: [{ name, emoji, ... }] */
  presets: { type: Array, default: () => [] },
  /** Index of the currently selected preset (-1 = none) */
  selectedIndex: { type: Number, default: -1 },
  /** Enable double-tap interaction (opens edit popup) */
  editEnabled: { type: Boolean, default: false },
  /** When false, tap-on-selected becomes a no-op (no confirm state, no activate emit) */
  confirmActivate: { type: Boolean, default: true },
  /** P6-4: Accessible label for the preset list */
  ariaLabel: { type: String, default: 'Presets' },
})
```

- [ ] **Step 2: Update `onClick` to respect `confirmActivate`**

Still in `PresetPillRow.vue`, edit the `onClick` function. The "already selected" branch needs to short-circuit when `confirmActivate` is false:

```js
function onClick(index, event) {
  // Double-tap → edit (event.detail is the native click count)
  if (event.detail >= 2 && props.editEnabled) {
    clearConfirm()
    emit('edit', index)
    return
  }

  // Check if this preset is already selected (either via props or our local tracking)
  const isSelected = index === props.selectedIndex || index === lastEmittedSelectIndex

  if (isSelected) {
    // If activation is disabled, tap-on-selected is a no-op
    if (!props.confirmActivate) {
      clearConfirm()
      return
    }
    // Selected preset tapped — two-step confirm before activating
    if (confirmIndex.value === index) {
      // Second tap on confirmed → activate (start operation)
      clearConfirm()
      lastEmittedSelectIndex = -1
      emit('activate', index)
    } else {
      // First tap on selected → enter confirm state
      clearConfirm()
      confirmIndex.value = index
      confirmTimer = setTimeout(clearConfirm, 2000)
    }
    return
  }

  // First tap on unselected → select this preset
  clearConfirm()
  lastEmittedSelectIndex = index
  emit('select', index)
}
```

- [ ] **Step 3: Pass `:confirm-activate="false"` and remove `@activate` from the workflow combo row in `LayoutWidget.vue`**

Edit `src/components/LayoutWidget.vue` around lines 202-213:

```vue
    <!-- Workflow Combos -->
    <template v-else-if="type === 'workflowCombos'">
      <div v-if="workflowCombos.length" class="layout-widget__preset-section">
        <span class="layout-widget__section-label">Workflows</span>
        <PresetPillRow
          :presets="workflowCombos"
          :selected-index="selectedWorkflowCombo"
          :edit-enabled="true"
          :confirm-activate="false"
          @select="idx => emit('workflow-combo-select', idx)"
          @edit="idx => emit('workflow-combo-edit', idx)"
        />
      </div>
```

Note: `@activate` is gone. The template no longer emits `start-espresso` from this path.

- [ ] **Step 4: Run full e2e suite**

Run: `npm run test:e2e -- --reporter=line`
Expected: all existing tests pass (none of them test this new behavior yet — Task 11 adds that).

- [ ] **Step 5: Commit**

```bash
git add src/components/PresetPillRow.vue src/components/LayoutWidget.vue
git commit -m "fix(idle): workflow combo tap no longer starts espresso"
```

---

## Task 5: Fix profile-change watcher in WorkflowEditorPage

**Files:**
- Modify: `src/pages/WorkflowEditorPage.vue`

- [ ] **Step 1: Add the `awaitingProfileFromPicker` ref**

Edit `src/pages/WorkflowEditorPage.vue`. Find the profile state section (around line 45-47 where `profileTitle` and `profileId` are declared) and add:

```js
// ---- Profile state ----
const profileTitle = ref('')
const profileId = ref(null)
const awaitingProfileFromPicker = ref(false)
```

- [ ] **Step 2: Set the flag when the user clicks the Change button**

Find the template's "Change" button (around line 437 in the current file). Replace the inline `@click` with a named handler, then add the handler in the script block.

In the template:

```vue
      <div class="bean-info__profile-row">
        <span class="bean-info__profile-name">{{ profileTitle || 'No profile selected' }}</span>
        <button class="bean-info__change-btn" @click="onChangeProfile">Change</button>
      </div>
```

In the `<script setup>` block, near the other event handlers (e.g., after `saveAsNew` around line 311-323), add:

```js
// ---- Profile change navigation ----
function onChangeProfile() {
  awaitingProfileFromPicker.value = true
  router.push('/profiles?from=workflow')
}
```

- [ ] **Step 3: Update the watcher to honor the flag**

Find the existing watcher at the bottom of the script block (around line 402-410):

```js
// Sync profile title when returning from ProfileSelectorPage.
// Accepts workflow.profile updates in two cases:
//   1. No combo selected — ambient safety default
//   2. User explicitly picked a profile via the Change button
watch(() => workflow?.profile, (newProfile) => {
  if (!newProfile || _updating) return
  const explicitlyPicked = awaitingProfileFromPicker.value
  const noComboSelected = selectedIndex.value < 0
  if (explicitlyPicked || noComboSelected) {
    profileTitle.value = newProfile.title ?? ''
    profileId.value = newProfile.id ?? null
    awaitingProfileFromPicker.value = false
  }
}, { deep: true })
```

- [ ] **Step 4: Run the full e2e suite**

Run: `npm run test:e2e -- --reporter=line`
Expected: all existing tests pass (the new behavior is covered by a test added in Task 11).

- [ ] **Step 5: Commit**

```bash
git add src/pages/WorkflowEditorPage.vue
git commit -m "fix(workflow-editor): profile change honored when combo selected"
```

---

## Task 6: Create `UnsavedChangesDialog.vue`

**Files:**
- Create: `src/components/UnsavedChangesDialog.vue`

- [ ] **Step 1: Write the component**

Create `src/components/UnsavedChangesDialog.vue`:

```vue
<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  visible: { type: Boolean, default: false },
  comboSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'save-as-new', 'discard', 'keep-changes', 'close'])
const { t } = useI18n()
</script>

<template>
  <transition name="ucd-fade">
    <div
      v-if="visible"
      class="ucd"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ucd-title"
      @click.self="emit('close')"
    >
      <div class="ucd__panel">
        <h2 id="ucd-title" class="ucd__title">{{ t('workflowEditor.unsavedTitle') }}</h2>
        <p class="ucd__body">{{ t('workflowEditor.unsavedBody') }}</p>
        <div class="ucd__actions">
          <button
            v-if="comboSelected"
            class="ucd__btn ucd__btn--primary"
            data-testid="ucd-save"
            @click="emit('save')"
          >
            {{ t('workflowEditor.unsavedSave') }}
          </button>
          <button
            class="ucd__btn"
            data-testid="ucd-save-as-new"
            @click="emit('save-as-new')"
          >
            {{ t('workflowEditor.unsavedSaveAsNew') }}
          </button>
          <button
            class="ucd__btn ucd__btn--subtle"
            data-testid="ucd-keep-changes"
            @click="emit('keep-changes')"
          >
            <span class="ucd__btn-label">{{ t('workflowEditor.unsavedKeepChanges') }}</span>
            <span class="ucd__btn-hint">{{ t('workflowEditor.unsavedKeepChangesHint') }}</span>
          </button>
          <button
            class="ucd__btn ucd__btn--subtle"
            data-testid="ucd-discard"
            @click="emit('discard')"
          >
            <span class="ucd__btn-label">{{ t('workflowEditor.unsavedDiscard') }}</span>
            <span class="ucd__btn-hint">{{ t('workflowEditor.unsavedDiscardHint') }}</span>
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.ucd {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: var(--z-dialog, 1000);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.ucd__panel {
  max-width: 440px;
  width: 100%;
  background: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ucd__title {
  font-size: var(--font-title);
  color: var(--color-text);
  margin: 0;
}

.ucd__body {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
  margin: 0;
}

.ucd__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ucd__btn {
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  -webkit-tap-highlight-color: transparent;
}

.ucd__btn--primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.ucd__btn--subtle {
  background: transparent;
}

.ucd__btn-label {
  font-size: var(--font-body);
  font-weight: 600;
}

.ucd__btn-hint {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  font-weight: 400;
}

.ucd-fade-enter-active,
.ucd-fade-leave-active {
  transition: opacity 0.15s ease;
}

.ucd-fade-enter-from,
.ucd-fade-leave-to {
  opacity: 0;
}
</style>
```

- [ ] **Step 2: Add the i18n keys**

Edit `src/i18n/locales/en.json`. Add a new `workflowEditor` top-level block (alphabetical placement is fine):

```json
  "workflowEditor": {
    "title": "Workflow Editor",
    "combos": "Workflows",
    "save": "Save",
    "saveAsNew": "Save as New",
    "unsavedTitle": "You have unsaved changes",
    "unsavedBody": "Choose what to do with your edits.",
    "unsavedSave": "Save",
    "unsavedSaveAsNew": "Save as New",
    "unsavedDiscard": "Discard",
    "unsavedDiscardHint": "Revert live workflow to the state before you opened this page.",
    "unsavedKeepChanges": "Keep changes",
    "unsavedKeepChangesHint": "Leave the combo untouched; keep the new values on the live workflow.",
    "toastSaved": "Combo saved"
  },
```

- [ ] **Step 3: Verify JSON parses**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('src/i18n/locales/en.json','utf8'))" && echo OK`
Expected: `OK`

- [ ] **Step 4: Build to catch template/script errors**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/UnsavedChangesDialog.vue src/i18n/locales/en.json
git commit -m "feat(workflow-editor): add UnsavedChangesDialog component and i18n keys"
```

---

## Task 7: Editor redesign part A — remove auto-save, add live-apply, split `saveToWorkflow`

**Files:**
- Modify: `src/pages/WorkflowEditorPage.vue`

- [ ] **Step 1: Delete the debounced auto-save block**

Edit `src/pages/WorkflowEditorPage.vue`. Find the auto-save block (currently around lines 263-300). Delete the `comboValues`, `saveTimer`, and `debouncedSaveToCombo` functions AND the watch at lines 302-308 that calls them.

Do NOT delete `comboValues` — it's used by `saveAsNew`. Keep `comboValues` as-is but delete ONLY `saveTimer`, `debouncedSaveToCombo`, and the watch registration:

Remove these:

```js
let saveTimer = null
function debouncedSaveToCombo() {
  if (!settings || selectedIndex.value < 0 || _updating) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const combos = [...workflowCombos.value]
    const existing = combos[selectedIndex.value]
    combos[selectedIndex.value] = {
      ...existing,
      ...comboValues(),
    }
    settings.settings.workflowCombos = combos
  }, 500)
}

// Watch all fields for auto-save
watch([coffeeName, roaster, grinder, grinderSetting, doseIn, doseOut,
       selectedBeanId, selectedBatchId, selectedGrinderId,
       profileId, profileTitle,
       includeSteam, steamDuration, steamFlow, steamTemperature,
       includeFlush, flushDuration, flushFlowRate,
       includeHotWater, hotWaterVolume, hotWaterTemperature], debouncedSaveToCombo)
```

Leave the `comboValues()` function intact — it's still used by `saveAsNew`.

- [ ] **Step 2: Split `saveToWorkflow` into `applyToLiveWorkflow` and `saveToSelectedCombo`**

Still in `WorkflowEditorPage.vue`. Find the current `saveToWorkflow` function (around line 326-361). Replace it with two separate functions:

```js
// ---- Build workflow update payload from current form state ----
function buildWorkflowUpdate() {
  const ctx = {
    targetDoseWeight: doseIn.value,
    targetYield: doseOut.value,
    coffeeName: coffeeName.value || null,
    coffeeRoaster: roaster.value || null,
    grinderModel: selectedGrinder.value?.model ?? (grinder.value || null),
    grinderSetting: grinderSetting.value != null ? String(grinderSetting.value) : null,
  }
  if (selectedGrinderId.value) ctx.grinderId = String(selectedGrinderId.value)
  if (selectedBatchId.value) ctx.beanBatchId = String(selectedBatchId.value)

  const payload = { context: ctx }
  payload.steamSettings = includeSteam.value
    ? { targetTemperature: steamTemperature.value, duration: steamDuration.value, flow: steamFlow.value }
    : { targetTemperature: settings?.settings?.steamTemperature ?? 160, duration: 0, flow: settings?.settings?.steamFlow ?? 1.5 }
  payload.rinseData = includeFlush.value
    ? { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: flushDuration.value, flow: flushFlowRate.value }
    : { targetTemperature: settings?.settings?.flushTemperature ?? 90, duration: 0, flow: settings?.settings?.flushFlowRate ?? 6.0 }
  payload.hotWaterData = includeHotWater.value
    ? { targetTemperature: hotWaterTemperature.value, volume: hotWaterVolume.value, duration: settings?.settings?.hotWaterDuration ?? 60, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
    : { targetTemperature: settings?.settings?.hotWaterTemperature ?? 80, volume: 0, duration: 0, flow: settings?.settings?.hotWaterFlow ?? 6.0 }
  return payload
}

// ---- Apply current form state to the live workflow (no combo mutation) ----
async function applyToLiveWorkflow() {
  try {
    await updateWorkflow(buildWorkflowUpdate())
  } catch {
    // Silent — live-apply fires often; errors shouldn't toast-spam
  }
}

// ---- Persist current form state to the selected combo ----
function saveToSelectedCombo() {
  if (!settings || selectedIndex.value < 0) return
  const combos = [...workflowCombos.value]
  const existing = combos[selectedIndex.value]
  combos[selectedIndex.value] = { ...existing, ...comboValues() }
  settings.settings.workflowCombos = combos
  toast?.success(t('workflowEditor.toastSaved'))
}
```

- [ ] **Step 3: Import `useI18n` and `t` if not already present**

Still in `WorkflowEditorPage.vue`. Find the imports at the top of the script block. If `useI18n` is not already imported, add it:

```js
import { ref, computed, inject, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
// ... existing component imports
```

And in the script body:

```js
const { t } = useI18n()
```

If `onMounted` is not already imported, add it (needed for Task 8's workflow snapshot capture).

- [ ] **Step 4: Add the live-apply watcher**

Still in `WorkflowEditorPage.vue`. Add this block near the bottom of the script, AFTER the existing profile watcher (the one you updated in Task 5):

```js
// ---- Live-apply: push every field change to the workflow (300ms debounce) ----
let liveApplyTimer = null
watch([coffeeName, roaster, grinder, grinderSetting, doseIn, doseOut,
       selectedBeanId, selectedBatchId, selectedGrinderId,
       profileId, profileTitle,
       includeSteam, steamDuration, steamFlow, steamTemperature,
       includeFlush, flushDuration, flushFlowRate,
       includeHotWater, hotWaterVolume, hotWaterTemperature], () => {
  if (_updating) return
  clearTimeout(liveApplyTimer)
  liveApplyTimer = setTimeout(applyToLiveWorkflow, 300)
})
```

- [ ] **Step 5: Update callers of the old `saveToWorkflow`**

Still in `WorkflowEditorPage.vue`. Find the BottomBar template (around line 671-678) and any script reference to `saveToWorkflow`. Grep the file:

Run: `grep -n "saveToWorkflow" src/pages/WorkflowEditorPage.vue`

Replace with the appropriate new function name. For the BottomBar buttons, Task 8 will redo this block entirely — for NOW, temporarily point both buttons at `applyToLiveWorkflow` so the file compiles. Task 8 will finalize the button layout.

```vue
    <BottomBar :title="selectedIndex >= 0 ? (workflowCombos[selectedIndex]?.name || 'Workflow Editor') : 'Workflow Editor'" @back="router.back()">
      <button class="bean-info__save-btn bean-info__save-btn--secondary" @click="applyToLiveWorkflow">
        {{ selectedIndex >= 0 ? 'Apply & Save' : 'Apply' }}
      </button>
      <button class="bean-info__save-btn" @click="saveAsNew">
        Save as New
      </button>
    </BottomBar>
```

(The button labels are wrong for the final design — Task 8 fixes them.)

- [ ] **Step 6: Delete `updateWorkflow` call from `saveAsNew`**

Still in `WorkflowEditorPage.vue`. Find `saveAsNew` (around line 311-323). It does NOT currently call `updateWorkflow` — only writes to `settings.settings.workflowCombos` and sets `selectedWorkflowCombo`. Confirm by reading the function. If it does NOT call `updateWorkflow`, no change is needed here. If it does, remove that call (the live-apply watcher handles workflow updates continuously).

- [ ] **Step 7: Build to catch errors**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 8: Run the full e2e suite**

Run: `npm run test:e2e -- --reporter=line`
Expected: all existing tests pass. The button labels are still wrong (Task 8), but functionality isn't tested at that granularity in the existing suite.

- [ ] **Step 9: Commit**

```bash
git add src/pages/WorkflowEditorPage.vue
git commit -m "feat(workflow-editor): remove auto-save, add live-apply watcher, split save fn"
```

---

## Task 8: Editor redesign part B — `dirty` computed + BottomBar button logic + dirty indicator CSS

**Files:**
- Modify: `src/pages/WorkflowEditorPage.vue`

- [ ] **Step 1: Add the `dirty` computed**

Edit `src/pages/WorkflowEditorPage.vue`. After `comboValues()` (around line 264-285) and before the watchers, add:

```js
// ---- Dirty tracking ----
const dirty = computed(() => {
  if (selectedIndex.value < 0) {
    // No combo selected — dirty if any identifiable field has a non-initial value
    return !!(
      coffeeName.value || roaster.value || grinder.value || grinderSetting.value ||
      profileTitle.value || profileId.value ||
      selectedBeanId.value || selectedBatchId.value || selectedGrinderId.value ||
      includeSteam.value || includeFlush.value || includeHotWater.value
    )
  }
  const saved = workflowCombos.value[selectedIndex.value]
  if (!saved) return false
  const current = comboValues()
  // Shallow compare the fields we care about
  const keys = [
    'profileId', 'profileTitle', 'coffeeName', 'roaster',
    'doseIn', 'doseOut', 'grinder', 'grinderSetting',
    'selectedBeanId', 'selectedBatchId', 'selectedGrinderId',
    'includeSteam', 'includeFlush', 'includeHotWater',
  ]
  for (const k of keys) {
    if ((current[k] ?? null) !== (saved[k] ?? null)) return true
  }
  // Compare sub-objects via JSON stringify for simplicity
  if (JSON.stringify(current.steamSettings) !== JSON.stringify(saved.steamSettings)) return true
  if (JSON.stringify(current.flushSettings) !== JSON.stringify(saved.flushSettings)) return true
  if (JSON.stringify(current.hotWaterSettings) !== JSON.stringify(saved.hotWaterSettings)) return true
  return false
})
```

- [ ] **Step 2: Update the BottomBar template with the new button logic**

Edit the BottomBar block (around line 671-678):

```vue
    <BottomBar
      :title="selectedIndex >= 0 ? (workflowCombos[selectedIndex]?.name || t('workflowEditor.title')) + (dirty ? ' \u25CF' : '') : t('workflowEditor.title')"
      @back="onBackClick"
    >
      <template v-if="selectedIndex >= 0 && dirty">
        <button class="bean-info__save-btn" data-testid="wfe-save" @click="onSaveClick">
          {{ t('workflowEditor.save') }}
        </button>
        <button class="bean-info__save-btn bean-info__save-btn--secondary" data-testid="wfe-save-as-new" @click="saveAsNew">
          {{ t('workflowEditor.saveAsNew') }}
        </button>
      </template>
      <template v-else-if="selectedIndex < 0 && dirty">
        <button class="bean-info__save-btn" data-testid="wfe-save-as-new" @click="saveAsNew">
          {{ t('workflowEditor.saveAsNew') }}
        </button>
      </template>
    </BottomBar>
```

Note: `onBackClick` and `onSaveClick` don't exist yet — Task 9 adds them. For now, add temporary placeholders:

```js
function onSaveClick() {
  saveToSelectedCombo()
}
function onBackClick() {
  router.back()
}
```

Place these near the other event handlers in the script block.

- [ ] **Step 3: Add the dirty indicator CSS (orange outline on the selected combo pill)**

Still in `WorkflowEditorPage.vue`. Find the `<style scoped>` block. Add at the end, before the closing `</style>`:

```css
/* Dirty indicator — orange outline on the selected combo pill */
.bean-info__presets :deep(.preset-pill-row__pill--selected.wfe-dirty) {
  box-shadow: 0 0 0 2px var(--color-water-low, #c89b3c);
}
```

- [ ] **Step 4: Conditionally apply the `wfe-dirty` class to the selected combo pill**

The `PresetPillRow` component doesn't accept a class-per-pill prop. The simplest way to apply the outline without modifying the component is via a CSS selector on the wrapping element that tags when dirty. Update the template block around the `PresetPillRow`:

```vue
    <div class="bean-info__presets" :class="{ 'bean-info__presets--dirty': dirty && selectedIndex >= 0 }">
      <PresetPillRow
        :presets="workflowCombos"
        :selected-index="selectedIndex"
        :edit-enabled="true"
        @select="onPresetSelect"
        @edit="onComboEdit"
      />
      <button class="bean-info__add-btn" @click="saveAsNew">
        + New Combo
      </button>
    </div>
```

Then update the CSS to target via the modifier:

```css
/* Dirty indicator — orange outline on the selected combo pill */
.bean-info__presets--dirty :deep(.preset-pill-row__pill--selected) {
  box-shadow: 0 0 0 2px #c89b3c;
}
```

- [ ] **Step 5: Build and run the suite**

Run: `npx vite build && npm run test:e2e -- --reporter=line`
Expected: build succeeds, all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/WorkflowEditorPage.vue
git commit -m "feat(workflow-editor): dirty computed, bottom bar logic, dirty indicator"
```

---

## Task 9: Editor redesign part C — integrate `UnsavedChangesDialog` + workflow snapshot

**Files:**
- Modify: `src/pages/WorkflowEditorPage.vue`

- [ ] **Step 1: Import `UnsavedChangesDialog` and add visibility state**

Edit `src/pages/WorkflowEditorPage.vue`. Add the import:

```js
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue'
```

Add the visibility ref near other UI state:

```js
const unsavedDialogVisible = ref(false)
```

- [ ] **Step 2: Capture the workflow snapshot on mount**

Still in `WorkflowEditorPage.vue`. Add near the top of the script block, near the other state initializers:

```js
// ---- Snapshot for Discard path ----
const workflowSnapshot = ref(null)

onMounted(() => {
  if (workflow) {
    workflowSnapshot.value = {
      profile: workflow.profile ? JSON.parse(JSON.stringify(workflow.profile)) : null,
      context: workflow.context ? JSON.parse(JSON.stringify(workflow.context)) : null,
      steamSettings: workflow.steamSettings ? JSON.parse(JSON.stringify(workflow.steamSettings)) : null,
      hotWaterData: workflow.hotWaterData ? JSON.parse(JSON.stringify(workflow.hotWaterData)) : null,
      rinseData: workflow.rinseData ? JSON.parse(JSON.stringify(workflow.rinseData)) : null,
    }
  }
})
```

- [ ] **Step 3: Replace the temporary `onBackClick` with the dialog trigger**

Find the `onBackClick` placeholder you added in Task 8 step 2. Replace with:

```js
function onBackClick() {
  if (dirty.value) {
    unsavedDialogVisible.value = true
  } else {
    router.back()
  }
}
```

- [ ] **Step 4: Add the dialog event handlers**

After `onBackClick`, add:

```js
function onDialogSave() {
  saveToSelectedCombo()
  unsavedDialogVisible.value = false
  router.back()
}

function onDialogSaveAsNew() {
  saveAsNew()
  unsavedDialogVisible.value = false
  router.back()
}

async function onDialogDiscard() {
  if (workflowSnapshot.value) {
    try {
      await updateWorkflow({
        context: workflowSnapshot.value.context ?? undefined,
        steamSettings: workflowSnapshot.value.steamSettings ?? undefined,
        hotWaterData: workflowSnapshot.value.hotWaterData ?? undefined,
        rinseData: workflowSnapshot.value.rinseData ?? undefined,
      })
    } catch {
      // Silent — best effort revert
    }
  }
  unsavedDialogVisible.value = false
  router.back()
}

function onDialogKeepChanges() {
  // Live workflow already reflects form state via the live-apply watcher.
  // Combo is not touched. Just navigate back.
  unsavedDialogVisible.value = false
  router.back()
}

function onDialogClose() {
  unsavedDialogVisible.value = false
}
```

- [ ] **Step 5: Mount the dialog in the template**

Edit the template block. Add the dialog right before the closing `</div>` of `.bean-info` (or wherever is appropriate as a sibling of the scrollable content and BottomBar):

```vue
    <UnsavedChangesDialog
      :visible="unsavedDialogVisible"
      :combo-selected="selectedIndex >= 0"
      @save="onDialogSave"
      @save-as-new="onDialogSaveAsNew"
      @discard="onDialogDiscard"
      @keep-changes="onDialogKeepChanges"
      @close="onDialogClose"
    />
```

- [ ] **Step 6: Also gate `saveAsNew` in the dialog handler**

`saveAsNew` currently creates a new combo and also navigates internally (by setting `selectedWorkflowCombo` to the new index). The dialog handler `onDialogSaveAsNew` calls it and then `router.back()`. Verify that `saveAsNew` does not navigate on its own — if it does, remove that navigation. Read the current `saveAsNew` function:

```
grep -n "saveAsNew" src/pages/WorkflowEditorPage.vue
```

If it calls `router.back()` or `router.push(...)`, remove that line from inside `saveAsNew` — the caller is responsible for navigation.

- [ ] **Step 7: Build and run the suite**

Run: `npx vite build && npm run test:e2e -- --reporter=line`
Expected: build succeeds, all existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/pages/WorkflowEditorPage.vue
git commit -m "feat(workflow-editor): UnsavedChangesDialog on Back with four actions"
```

---

## Task 10: Profile-fetch optimization in `onComboSelect`

**Files:**
- Modify: `src/pages/IdlePage.vue`

- [ ] **Step 1: Read the current `onComboSelect` block**

Open `src/pages/IdlePage.vue` and find `onComboSelect` (around line 81-162). The profile block is around lines 89-104:

```js
if (combo.profileId || combo.profileTitle) {
  try {
    const records = await getProfiles()
    const allRecords = Array.isArray(records) ? records : []
    const record = allRecords.find(r => r.id === combo.profileId)
      || (combo.profileTitle && allRecords.find(r => r.profile?.title === combo.profileTitle))
    if (record?.profile) {
      update.profile = record.profile
    } else {
      toast?.warning(`Profile "${combo.profileTitle || combo.profileId}" not found — keeping current profile`)
    }
  } catch {
    toast?.warning('Could not load profile — keeping current profile')
  }
}
```

- [ ] **Step 2: Inject `workflow` and wrap the block with an already-loaded guard**

First, verify that `workflow` is already injected into `IdlePage.vue`. Grep:

Run: `grep -n "inject.*workflow" src/pages/IdlePage.vue`

If `workflow` is already injected, skip to Step 3. If not, add near the top of the script:

```js
const workflow = inject('workflow', null)
```

- [ ] **Step 3: Wrap the profile fetch block**

Replace the profile block with:

```js
if (combo.profileId || combo.profileTitle) {
  const currentProfile = workflow?.profile
  const alreadyLoaded =
    (combo.profileId && currentProfile?.id === combo.profileId) ||
    (combo.profileTitle && currentProfile?.title === combo.profileTitle)
  if (!alreadyLoaded) {
    try {
      const records = await getProfiles()
      const allRecords = Array.isArray(records) ? records : []
      const record = allRecords.find(r => r.id === combo.profileId)
        || (combo.profileTitle && allRecords.find(r => r.profile?.title === combo.profileTitle))
      if (record?.profile) {
        update.profile = record.profile
      } else {
        toast?.warning(`Profile "${combo.profileTitle || combo.profileId}" not found — keeping current profile`)
      }
    } catch {
      toast?.warning('Could not load profile — keeping current profile')
    }
  }
}
```

- [ ] **Step 4: Run the full e2e suite**

Run: `npm run test:e2e -- --reporter=line`
Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/IdlePage.vue
git commit -m "perf(idle): skip profile fetch when combo profile already loaded"
```

---

## Task 11: E2E tests — all four cases

**Files:**
- Create: `tests/e2e/workflow-combo.spec.js`
- Modify: `tests/mock-server.js` (add a second mock profile)

- [ ] **Step 1: Add a second mock profile in `tests/mock-server.js`**

Find `mockProfiles` (around line 82 based on earlier reads). Add a second entry:

```js
const mockProfiles = [
  {
    id: 'profile-test1234567890abcdef',
    profile: {
      version: '2',
      title: 'Classic Blooming',
      // ... existing content ...
    },
    visibility: 'visible',
    isDefault: true,
  },
  {
    id: 'profile-alt0987654321fedcba',
    profile: {
      version: '2',
      title: 'Alternative Profile',
      author: 'Test Author',
      notes: 'Second profile for round-trip tests',
      beverage_type: 'espresso',
      target_weight: 36,
      target_volume: 0,
      steps: [
        { name: 'Preinfuse', pump: 'pressure', pressure: 4.0, flow: 0, temperature: 92.0, seconds: 10, transition: 'fast' },
        { name: 'Pour', pump: 'pressure', pressure: 9.0, flow: 0, temperature: 92.0, seconds: 30, transition: 'smooth' },
      ],
    },
    visibility: 'visible',
    isDefault: false,
  },
]
```

- [ ] **Step 2: Write the e2e test file**

Create `tests/e2e/workflow-combo.spec.js`:

```js
/**
 * E2E tests for the workflow combo editor redesign.
 *
 * Covers:
 *  - Tapping a workflow combo pill on IdlePage does NOT start espresso.
 *  - Keep-changes path: live workflow takes new values, combo preset untouched.
 *  - Discard path: live workflow reverts, combo preset untouched.
 *  - Profile-change round-trip: Change → pick → Use Profile → Save → verify.
 */
import { test, expect } from '@playwright/test'

async function loadAppAt(page, route = '/') {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  if (route !== '/') {
    await page.evaluate((r) => window.__vueRouter.push(r), route)
    await page.waitForTimeout(300)
  }
}

async function seedCombo(page, combo) {
  // Set a single workflow combo in the skin KV settings store
  await page.evaluate(async (c) => {
    await fetch('/api/v1/store/decenza-js/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowCombos: [c],
        selectedWorkflowCombo: 0,
      }),
    })
  }, combo)
}

test.describe('Workflow combo editor redesign', () => {
  const sampleCombo = {
    id: 'combo-1',
    name: 'Morning',
    emoji: '',
    profileId: 'profile-test1234567890abcdef',
    profileTitle: 'Classic Blooming',
    coffeeName: 'Test Beans',
    roaster: 'Roaster X',
    doseIn: 18,
    doseOut: 36,
    grinder: 'Test Grinder',
    grinderSetting: '15',
    includeSteam: false,
    steamSettings: { duration: 0 },
    includeFlush: false,
    flushSettings: { duration: 0 },
    includeHotWater: false,
    hotWaterSettings: { volume: 0 },
  }

  test('tapping a workflow combo pill does NOT start espresso', async ({ page }) => {
    await loadAppAt(page, '/')
    await seedCombo(page, sampleCombo)
    // Reload to pick up the combo
    await page.goto('/')
    await page.waitForSelector('.status-bar')

    // Track any state transitions to espresso
    let startedEspresso = false
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/machine/state/espresso') && req.method() === 'PUT') {
        startedEspresso = true
      }
    })

    // Wait for workflow combos row to render and find the first pill
    const pill = page.locator('.preset-pill-row__pill').first()
    await expect(pill).toBeVisible({ timeout: 5000 })

    // Tap multiple times
    await pill.click()
    await page.waitForTimeout(100)
    await pill.click()
    await page.waitForTimeout(100)
    await pill.click()
    await page.waitForTimeout(500)

    expect(startedEspresso).toBe(false)
  })

  test('keep-changes path: live workflow takes new values, combo preset untouched', async ({ page, request }) => {
    await loadAppAt(page, '/')
    await seedCombo(page, sampleCombo)
    await page.evaluate(() => window.__vueRouter.push('/workflow/edit'))
    await page.waitForSelector('.bean-info', { timeout: 5000 })

    // Select the combo pill
    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)

    // Change the doseIn to 20 via ValueInput (assume numeric input accessible)
    // Using a JS evaluate to set via the reactive settings is more robust:
    await page.evaluate(() => {
      const input = document.querySelector('.bean-info__grid input[type="number"]')
      if (input) {
        input.focus()
        input.value = '20'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await page.waitForTimeout(500)  // wait for live-apply debounce

    // Click Back to open the dialog
    await page.locator('[data-testid="bottom-bar-back"], .bottom-bar__back').first().click().catch(async () => {
      // Fallback: call router.back via the page
      await page.evaluate(() => window.__vueRouter.back())
    })

    // Click Keep changes
    await page.locator('[data-testid="ucd-keep-changes"]').click()
    await page.waitForTimeout(300)

    // Verify combo preset is untouched (doseIn still 18)
    const combos = await request.get('http://localhost:8080/api/v1/store/decenza-js/settings').then(r => r.json())
    expect(combos?.workflowCombos?.[0]?.doseIn).toBe(18)

    // Verify live workflow has new dose (20)
    const wf = await request.get('http://localhost:8080/api/v1/workflow').then(r => r.json())
    expect(wf?.context?.targetDoseWeight).toBe(20)
  })

  test('discard path: live workflow reverts, combo preset untouched', async ({ page, request }) => {
    await loadAppAt(page, '/')
    await seedCombo(page, sampleCombo)
    await page.evaluate(() => window.__vueRouter.push('/workflow/edit'))
    await page.waitForSelector('.bean-info', { timeout: 5000 })

    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)

    // Capture the workflow state BEFORE editing
    const preEdit = await request.get('http://localhost:8080/api/v1/workflow').then(r => r.json())
    const originalDose = preEdit?.context?.targetDoseWeight

    // Change dose
    await page.evaluate(() => {
      const input = document.querySelector('.bean-info__grid input[type="number"]')
      if (input) {
        input.focus()
        input.value = '25'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await page.waitForTimeout(500)

    // Open dialog via Back
    await page.evaluate(() => window.__vueRouter.back())
    await page.locator('[data-testid="ucd-discard"]').click()
    await page.waitForTimeout(500)

    // Combo untouched
    const combos = await request.get('http://localhost:8080/api/v1/store/decenza-js/settings').then(r => r.json())
    expect(combos?.workflowCombos?.[0]?.doseIn).toBe(18)

    // Live workflow reverted to the pre-edit snapshot
    const wf = await request.get('http://localhost:8080/api/v1/workflow').then(r => r.json())
    expect(wf?.context?.targetDoseWeight).toBe(originalDose)
  })

  test('profile change round-trip (bug fix)', async ({ page, request }) => {
    await loadAppAt(page, '/')
    await seedCombo(page, sampleCombo)
    await page.evaluate(() => window.__vueRouter.push('/workflow/edit'))
    await page.waitForSelector('.bean-info', { timeout: 5000 })

    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)

    // Verify initial profile row
    await expect(page.locator('.bean-info__profile-name')).toContainText('Classic Blooming')

    // Click Change → navigate to /profiles?from=workflow
    await page.locator('.bean-info__change-btn').click()
    await page.waitForSelector('.profile-selector, [data-testid="profile-selector"]', { timeout: 5000 }).catch(() => {})

    // Pick the alternative profile — find a row matching "Alternative Profile"
    await page.locator('text=Alternative Profile').first().click()
    await page.waitForTimeout(200)

    // Click Use Profile (adjust selector if needed based on ProfileSelectorPage template)
    await page.locator('button:has-text("Use Profile")').click()
    await page.waitForTimeout(500)

    // We're back on WorkflowEditorPage. The profile row should show the new profile.
    await expect(page.locator('.bean-info__profile-name')).toContainText('Alternative Profile', { timeout: 3000 })

    // Click Save in the BottomBar
    await page.locator('[data-testid="wfe-save"]').click()
    await page.waitForTimeout(300)

    // Re-select the combo and verify
    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)
    await expect(page.locator('.bean-info__profile-name')).toContainText('Alternative Profile')
  })
})
```

- [ ] **Step 3: Run the new test file**

Run: `npm run test:e2e -- tests/e2e/workflow-combo.spec.js --reporter=line`
Expected: 4 tests PASS.

Likely debug spots:
1. **Selectors** — `.preset-pill-row__pill`, `.bean-info__*`, `.bottom-bar__back`, `data-testid` values may differ from current template. Inspect via `npm run dev` and a browser devtools session if any test can't find its target.
2. **BottomBar back selector** — the test uses both a `data-testid` and a class fallback. If neither exists, add `data-testid="bottom-bar-back"` to `BottomBar.vue` (one-line change). Commit the added attribute as part of this task if needed.
3. **ProfileSelectorPage "Use Profile" button** — if the button has a different label, adjust the selector.
4. **Workflow update race** — if `expect(wf?.context?.targetDoseWeight).toBe(20)` fails, increase the `waitForTimeout(500)` to `1000` to give the live-apply debounce more breathing room.

- [ ] **Step 4: Run the full suite to make sure new tests don't break old ones**

Run: `npm run test:e2e -- --reporter=line`
Expected: all tests (existing + 4 new) PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/workflow-combo.spec.js tests/mock-server.js
git commit -m "test: e2e coverage for workflow combo editor redesign"
```

---

## Task 12: CLAUDE.md terminology cleanup

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rewrite line 115 (Preset pills)**

Edit `CLAUDE.md`. Find the line:

```
- **Preset pills:** Single tap selects, double-tap on selected activates (starts operation), double-tap on unselected opens edit popup
```

Replace with:

```
- **Operation preset pills** (SteamPage / HotWaterPage / FlushPage): Single tap selects, double-tap on selected activates (starts operation), double-tap on unselected opens edit popup.
```

- [ ] **Step 2: Rewrite line 118 (IdlePage espresso presets)**

Find the line:

```
- **IdlePage espresso presets:** Two-step — first tap loads profile into workflow, second tap starts espresso. Double-tap on unselected shows ProfilePreviewPopup
```

Replace with:

```
- **IdlePage workflow combos:** Tap to load combo into workflow. Double-tap to open the Workflow Editor (`/workflow/edit`). The Espresso action button is the one and only way to start a shot — tapping a workflow combo never starts an operation.
```

- [ ] **Step 3: Add the terminology note**

Immediately before the "Operation preset pills" line (new line 115), add a short terminology paragraph:

```
- **Terminology.** *Operation presets* (steam / hot-water / flush) are quick-switch parameter sets for a single operation — they live on operation pages and have tap-to-start. *Workflow combos* are bundled recipe state (profile + bean + grinder + dose + optional steam/hot-water/flush overrides) — they live on IdlePage and in `WorkflowEditorPage`, and they never start an operation directly. Both are rendered via the `PresetPillRow` component but use different interaction contracts.
```

- [ ] **Step 4: Grep for other stale references**

Run: `grep -n "BeanInfoPage\|bean-info\|workflowPresets" CLAUDE.md`

For each hit, update to the new names (`WorkflowEditorPage`, `/workflow/edit`, `workflowCombos`).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with workflow combo terminology"
```

---

## Task 13: Full suite, build, manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full e2e suite**

Run: `npm run test:e2e -- --reporter=line`
Expected: all tests PASS.

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: clean build, no errors or warnings related to the changes.

- [ ] **Step 3: Manual smoke (if a dev gateway is available)**

```bash
npm run dev
```

Visit `/` → verify the workflow combo row renders. Tap a combo pill — verify it loads into the workflow but does NOT start espresso. Double-tap a combo — verify the edit popup opens. Navigate to `/workflow/edit`, select a combo, change a field, press Back — verify the dialog appears with four buttons. Try each button:

- Save → combo updated, navigates back.
- Save as New → new combo created, navigates back.
- Discard → live workflow reverts, combo untouched, navigates back.
- Keep changes → live workflow keeps new values, combo untouched, navigates back.

Change a profile via the Change button — verify the profile row updates on return.

- [ ] **Step 4: Final commit if any fixups were needed**

If the manual smoke turned up any issues, fix them and commit:

```bash
git add <files>
git commit -m "fix: <specific issue>"
```

- [ ] **Step 5: Report back**

Report to the operator with:
- Number of new commits on the branch.
- E2E test count (existing + 4 new).
- Any deviations from the plan that were necessary.
- Confirmation that nothing in `docs/deferred/screensaver-machine-decoupling.md` was touched (parked work still parked).

---

## Self-review

**Spec coverage check:**

- [x] Feature 1 — IdlePage workflow combo tap-to-start removal — Task 4
- [x] Feature 1 — `confirmActivate` prop on `PresetPillRow` — Task 4
- [x] Feature 1 — `workflowPresets` widget type rename + legacy alias — Task 1
- [x] Feature 1 — CLAUDE.md terminology — Task 12
- [x] Feature 2 — Remove debounced auto-save — Task 7
- [x] Feature 2 — Live-apply watch (300 ms debounce) — Task 7
- [x] Feature 2 — Split `saveToWorkflow` into `applyToLiveWorkflow` + `saveToSelectedCombo` — Task 7
- [x] Feature 2 — Capture `workflowSnapshot` on mount — Task 9
- [x] Feature 2 — `dirty` computed — Task 8
- [x] Feature 2 — BottomBar button logic (Save / Save as New / dirty dot / title dot) — Task 8
- [x] Feature 2 — Dirty indicator (orange outline on selected pill) — Task 8
- [x] Feature 2 — Back button with dirty → dialog — Task 9
- [x] Feature 2 — `UnsavedChangesDialog` component — Task 6
- [x] Feature 2 — Four dialog actions (Save / Save as New / Discard / Keep changes) — Task 9
- [x] Feature 3 — `PresetPillRow` prop + emit rename — Task 2
- [x] Feature 3 — `BeanInfoPage` → `WorkflowEditorPage` file + route rename + redirect — Task 3
- [x] Feature 3 — i18n keys — Task 6
- [x] Feature 4 — `awaitingProfileFromPicker` flag — Task 5
- [x] Feature 4 — Watcher update — Task 5
- [x] Feature 5 — Profile-fetch optimization in `onComboSelect` — Task 10
- [x] Testing — tap-does-not-start test — Task 11
- [x] Testing — keep-changes test — Task 11
- [x] Testing — discard test — Task 11
- [x] Testing — profile change round-trip test — Task 11
- [x] Mock server — second mock profile — Task 11

**Placeholder scan:** No "TBD", "implement later", "similar to Task N", or missing code blocks. The `onBackClick` and `onSaveClick` placeholders in Task 8 step 2 are resolved in Task 9 step 3 — flagged in Task 8 step 2 as temporary.

**Type consistency:** `applyToLiveWorkflow` / `saveToSelectedCombo` / `buildWorkflowUpdate` are consistently used across Tasks 7, 8, 9. `dirty`, `workflowSnapshot`, `unsavedDialogVisible`, `awaitingProfileFromPicker` are consistently spelled. The `data-testid` values (`wfe-save`, `wfe-save-as-new`, `ucd-*`) match between component templates and test selectors.

**Out-of-scope guard:** No task touches any file from `docs/deferred/screensaver-machine-decoupling.md`'s file list (`App.vue:247`, `App.vue:277-279`, `ScreensaverPage.vue:57`, `LayoutWidget.vue:227`). The parked decoupling work remains parked.
