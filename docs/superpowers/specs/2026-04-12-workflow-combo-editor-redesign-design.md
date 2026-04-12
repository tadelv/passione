# Workflow Combo Editor Redesign

**Date:** 2026-04-12
**Origin:** Testing feedback round 2 items 5 and 6 (see `professional/decent/passione.md`), plus a diagnosed bug in profile-change round-tripping and a terminology cleanup carried over from commit `d842286 refactor: remove all presets, simplify operation pages`.

## Summary

Three tightly coupled fixes on the same conceptual surface (workflow combos):

1. **Behavior fix** — tapping a workflow combo on IdlePage no longer starts espresso; the Espresso action button is the only start affordance.
2. **Live-apply redesign of the combo editor** — replace the silent debounced auto-save-to-combo + dual "Apply / Apply & Save" buttons with a live-apply field watcher, explicit `Save` / `Save as New` buttons only when dirty, and an unsaved-changes dialog on Back with four actions (Save / Save as New / Discard / Keep changes).
3. **Terminology cleanup** — complete the preset → combo migration in code, file names, routes, CLAUDE.md, and a naming fix on the page itself (`BeanInfoPage` → `WorkflowEditorPage`). Fix a related profile-change watcher bug that silently swallows user-initiated profile changes while a combo is selected. Skip the profile fetch in `onComboSelect` when the combo's profile is already loaded.

All three land in one spec because they touch the same files (`IdlePage.vue`, the renamed `WorkflowEditorPage.vue`, `LayoutWidget.vue`, `PresetPillRow.vue`, `useLayout.js`, `CLAUDE.md`) and share the same conceptual model (workflow combos as bundled recipe state, not as preset pills with an implicit start action).

Design approved by the user after parallel review from two subagents (UX designer + long-time Decenza user persona). Both rejected the earlier "keep the buttons, add an explicit Apply-only function" proposal in favor of the live-apply model documented below.

---

## Background: what a workflow combo is

A **workflow combo** is a saved bundle of recipe state: profile reference (by id + title), bean name, coffee roaster, grinder model and setting, dose in/out, optional steam/hot-water/flush parameter overrides. It lives in the skin's key-value settings store under `settings.workflowCombos` as an array. Users browse combos as pills at the top of `WorkflowEditorPage` (currently `BeanInfoPage.vue`) and also from the IdlePage layout where they're rendered as selectable pills via `LayoutWidget`.

A workflow combo is NOT the same as an **operation preset**, which is a quick-switch parameter set for a single operation (e.g., "100 ml at 90°C" for hot water). Operation presets keep their "tap to start" behavior on `SteamPage`, `HotWaterPage`, `FlushPage`. Workflow combos should not.

---

## Feature 1 — IdlePage workflow combo behavior fix

### Goal

Make workflow combos on IdlePage pure selectors. Tapping a combo loads it into the live workflow; it never starts an espresso shot. The dedicated Espresso `ActionButton` remains the only "go" affordance.

### Changes

1. `src/components/LayoutWidget.vue:202-213` — in the `workflowCombos` (currently `workflowPresets`) template branch:
   - Delete the `@activate="() => emit('start-espresso')"` line.
   - Pass a new prop `:confirm-activate="false"` to the `PresetPillRow` so the two-step "Tap to start" confirm state is bypassed entirely for this row.
2. `src/components/PresetPillRow.vue` — add a new prop `confirmActivate: { type: Boolean, default: true }`. When `false`, the `onClick` handler skips the confirm-state logic and treats a tap on the already-selected pill as a no-op.
3. Tap behavior after the fix:
   - Tap unselected combo → `select` emitted → `IdlePage.onComboSelect` loads combo into workflow (unchanged).
   - Tap already-selected combo → no visual change, no emit.
   - Double-tap any combo → `edit` emitted (currently named `long-press`; see rename below) → `IdlePage.onComboLongPress` opens the inline edit popup (unchanged).

### CLAUDE.md updates

Line 115 is rewritten to clarify it applies only to operation presets, not workflow combos:

> **Operation preset pills** (SteamPage / HotWaterPage / FlushPage): single-tap selects, double-tap on selected activates (starts operation), double-tap on unselected opens edit popup.

Line 118 is rewritten to describe workflow combos accurately:

> **IdlePage workflow combos:** tap to load combo into workflow. Double-tap to edit. The Espresso action button is the one and only way to start a shot — tapping a combo never starts an operation.

A new short paragraph is added at the top of the "Interaction Patterns" block:

> **Terminology.** *Operation presets* (steam / hot-water / flush) are quick-switch parameter sets for a single operation. *Workflow combos* are bundled recipe state (profile + bean + grinder + dose + optional steam/hot-water/flush overrides). Both use the `PresetPillRow` component, but they have different interaction contracts: operation presets have tap-to-start, workflow combos do not.

---

## Feature 2 — Live-apply workflow combo editor (`WorkflowEditorPage`)

### Goal

Let the user tweak a variable, see it applied to the live workflow immediately, and navigate away without silently mutating the saved combo. The combo is only touched on an explicit Save.

### Mental model

- Field changes are **live-applied** to `updateWorkflow()` with a 300 ms debounce (matches the existing operation-page pattern documented in CLAUDE.md).
- The selected combo in `settings.workflowCombos` is NEVER mutated implicitly. It is only mutated by an explicit `Save` button press inside the unsaved-changes dialog, or by `Save as New`.
- On Back with dirty state, the user chooses between Save, Save as New, Discard, or Keep changes via a dialog.

### Changes to `WorkflowEditorPage.vue` (currently `BeanInfoPage.vue`)

1. **Delete the debounced auto-save-to-combo watch** (currently around line 303-308 of `BeanInfoPage.vue`). Form field changes no longer write to `settings.workflowCombos`.
2. **Add a live-apply watch.** A new watcher on the full set of form field refs (dose, ratio, coffee name, roaster, grinder, grinder setting, profile id/title, steam/hot-water/flush sub-fields) debounced at 300 ms via a new `useDebounce` helper call or an inline `setTimeout` guard. On every stable update, it calls `updateWorkflow()` with the payload shape that `saveToWorkflow` currently builds (minus the combo-write tail). No toast.
3. **Split the existing `saveToWorkflow` into two clearly-scoped functions:**
   - `applyToLiveWorkflow()` — private helper used by the live-apply watcher. Builds the workflow update payload and calls `updateWorkflow()`. NEVER touches `settings.workflowCombos`. No toast.
   - `saveToSelectedCombo()` — used by the Save button in the unsaved-changes dialog and (indirectly) by `saveAsNew`. Writes current form values to the selected combo entry via `settings.workflowCombos = [...]`. No `updateWorkflow()` call (live workflow is already in sync from the live-apply watcher). Toast: "Combo saved."
4. **Capture `workflowSnapshot` on page mount.** Store a deep clone of the `useWorkflow` state's `profile`, `context`, `steamSettings`, `hotWaterData`, `rinseData` at mount time. This is the baseline the Discard action reverts to.
5. **Add a `dirty` computed** that compares the current form values to the saved combo values (when a combo is selected). If no combo is selected, `dirty` is true whenever any form field has a non-initial value — same semantic as "there's something to save as new."
6. **BottomBar logic:**
   - Combo selected AND `dirty` → `Save` (primary) + `Save as New` (secondary).
   - Combo selected AND NOT `dirty` → no save-related buttons. Just the Back chevron from the parent `BottomBar` component.
   - No combo selected → `Save as New` only.
7. **Dirty indicator** — orange outline on the selected combo pill in the top selector row. Drawn via a new CSS class applied by the page when `dirty` is true and `selectedIndex >= 0`. A small `●` dot is also appended to the BottomBar title as a secondary cue (`{{ comboName }} ●` when dirty).
8. **Back button behavior:**
   - If `dirty` is false → `router.back()` as today.
   - If `dirty` is true → open the new `UnsavedChangesDialog.vue` overlay.
9. **`UnsavedChangesDialog.vue` (new component):** centered modal with four buttons and a short body text. Actions wired through emit events handled by the parent:
   - `Save` — calls `saveToSelectedCombo()` then `router.back()`. Only shown when a combo is selected.
   - `Save as New` — calls `saveAsNew()` then `router.back()`. Always shown.
   - `Discard` — calls `updateWorkflow(workflowSnapshot)` to restore the live workflow to the captured pre-edit state, then `router.back()`.
   - `Keep changes` — just `router.back()`. Live workflow already reflects the form state (from the live-apply watcher). Combo is not touched. This is the literal "apply without saving" path.
10. The existing `saveAsNew` helper stays mostly intact but drops its `updateWorkflow()` call (live-apply already handled that).

### New component: `src/components/UnsavedChangesDialog.vue`

Props:

- `visible: Boolean` — controls the overlay.
- `comboSelected: Boolean` — toggles whether the Save button is rendered.

Emits:

- `save` — user clicked Save.
- `save-as-new` — user clicked Save as New.
- `discard` — user clicked Discard.
- `keep-changes` — user clicked Keep changes.
- `close` — user tapped the backdrop or pressed Escape without making a choice.

Structure: single-column stack of four buttons (three when no combo is selected), each with a short helper line underneath. Uses existing theme tokens. Accessible via `role="dialog"` with an `aria-labelledby` pointing at the dialog title element.

### i18n keys (new)

Added under a new `workflowEditor` block in `src/i18n/locales/en.json`:

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
}
```

---

## Feature 3 — Terminology cleanup

### Widget-type rename (no user-visible change)

1. `src/composables/useLayout.js` — rename widget type `'workflowPresets'` → `'workflowCombos'` at lines 47, 57, 68, 82. Display label `'Workflow Presets'` → `'Workflows'` at line 57.
2. `src/composables/useLayout.js` load/normalize path — accept legacy `'workflowPresets'` string as an alias for `'workflowCombos'` so existing users' saved layouts don't break. Implementation: in whatever function reads layout from settings and returns the active layout object, run the returned layout zones through a small normalizer that rewrites any `'workflowPresets'` entry to `'workflowCombos'` before downstream code sees it.
3. `src/components/LayoutWidget.vue:201-213` — update the template comment and `v-else-if="type === 'workflowCombos'"`.

### `PresetPillRow` prop/emit rename

The component's `longPressEnabled` prop and `long-press` emit were named before commit `260e17a` replaced long-press with double-tap. The names are misleading — neither has anything to do with long-press anymore.

1. `src/components/PresetPillRow.vue`:
   - Rename `longPressEnabled: Boolean` → `editEnabled: Boolean`.
   - Rename emit `'long-press'` → `'edit'`.
2. All callers (`src/components/LayoutWidget.vue`, the renamed `src/pages/WorkflowEditorPage.vue`, any other file using `PresetPillRow`):
   - Change `:long-press-enabled="true"` → `:edit-enabled="true"`.
   - Change `@long-press="..."` → `@edit="..."`.
   - Event handler names referenced in templates (e.g., `onComboLongPress`) get renamed to match: `onComboEdit` in `IdlePage.vue` and `WorkflowEditorPage.vue`.

No backward compat needed here — Vue component props and events are internal to the codebase.

### `BeanInfoPage` → `WorkflowEditorPage` file and route rename

1. `git mv src/pages/BeanInfoPage.vue src/pages/WorkflowEditorPage.vue`.
2. `src/router/index.js`:
   - Update the lazy import on line 20: `const WorkflowEditorPage = () => import('../pages/WorkflowEditorPage.vue')`.
   - Update the route on line 45: `{ path: '/workflow/edit', name: 'workflow-editor', component: WorkflowEditorPage }`.
   - Add a backward-compat redirect: `{ path: '/bean-info', redirect: '/workflow/edit' }` so any cached bookmarks, deep-links, or older test runs still land correctly.
3. Grep and update all callers of `/bean-info` or `name: 'bean-info'` (likely `IdlePage.vue` and maybe `ProfileSelectorPage.vue` when it navigates back with `?from=workflow`). Change to `/workflow/edit` and `name: 'workflow-editor'`.
4. Grep and update any import statement that references `BeanInfoPage.vue` — there should only be one (in the router).
5. `tests/e2e/*` — grep for `/bean-info` and update. The router redirect would catch misses, but fix them anyway so new tests follow the new name.
6. `CLAUDE.md` — grep for `BeanInfoPage` or `bean-info`; replace with `WorkflowEditorPage` / `/workflow/edit`.

### `?from=workflow` query param — keep as-is

The sentinel string passed from `WorkflowEditorPage` to `ProfileSelectorPage` when the user clicks the Change button stays named `?from=workflow`. It's an internal query param signaling intent; renaming it would force matching changes in `ProfileSelectorPage` without user-facing value. YAGNI.

---

## Feature 4 — Bug fix: profile change doesn't update the row when a combo is selected

### Root cause

`BeanInfoPage.vue:402-410` has a watcher:

```js
watch(() => workflow?.profile, (newProfile) => {
  if (newProfile && !_updating && selectedIndex.value < 0) {
    profileTitle.value = newProfile.title ?? ''
    profileId.value = newProfile.id ?? null
  }
}, { deep: true })
```

The guard `selectedIndex.value < 0` exists to prevent the machine's ambient workflow state from leaking into the form while the user is editing a combo. But it also blocks the user's *own* profile change when they take the explicit path:

1. User is editing combo X (selectedIndex = 2).
2. User clicks **Change** → `router.push('/profiles?from=workflow')`.
3. User picks a new profile in `ProfileSelectorPage`, taps **Use Profile**, which calls `updateWorkflow({ profile: newProfile })` then navigates back.
4. Watcher fires on the renamed `WorkflowEditorPage`, but `selectedIndex` is still 2 → the guard blocks the sync.
5. Form still shows the old profile title. With the new live-apply watcher from Feature 2, the *workflow* now briefly has the new profile but the *form* state is stale, so the next tick writes the STALE profile id/title back out via `applyToLiveWorkflow()` — effectively reverting the user's profile change.

### Fix

Track an explicit "I'm expecting a profile from ProfileSelectorPage" flag.

1. Add `const awaitingProfileFromPicker = ref(false)` near the other form state refs.
2. In the Change button's click handler (line 437 of the current template), set `awaitingProfileFromPicker.value = true` before `router.push('/profiles?from=workflow')`.
3. Update the watcher to accept the update in two cases:
   - No combo is selected (existing defensive intent).
   - OR `awaitingProfileFromPicker.value` is true (the user explicitly went to pick a profile).

```js
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

The flag is cleared as soon as it's consumed, so the defensive guard is restored for subsequent ambient updates.

**Ordering subtlety with the live-apply watcher.** When the user picks a new profile, `updateWorkflow({ profile })` fires from `ProfileSelectorPage`, then we navigate back to `WorkflowEditorPage`, then the `workflow.profile` watcher fires and updates `profileTitle` / `profileId`. The new live-apply watcher is on the form refs including `profileId` and `profileTitle`, so it fires a second time, re-sending the same values to `updateWorkflow`. This is idempotent on the server, so it's fine — but if observed to cause a visible hitch, add a guard: skip the live-apply debounce fire when the change was caused by `awaitingProfileFromPicker` being consumed. Implementation detail, not a spec-level concern.

---

## Feature 5 — Trivial optimization: skip profile fetch in `onComboSelect` when already loaded

### Goal

Avoid the slow `getProfiles()` call and the redundant `update.profile = ...` write in the workflow update payload when the combo's profile is already the active workflow profile.

### Change

`src/pages/IdlePage.vue` `onComboSelect` at line 89-104. Before entering the existing profile fetch block:

```js
if (combo.profileId || combo.profileTitle) {
  const currentProfile = workflow?.profile
  const alreadyLoaded =
    (combo.profileId && currentProfile?.id === combo.profileId) ||
    (combo.profileTitle && currentProfile?.title === combo.profileTitle)
  if (!alreadyLoaded) {
    try {
      const records = await getProfiles()
      // ... existing match + update.profile = ... block
    } catch {
      // ... existing error handling
    }
  }
}
```

~8 lines added, one conditional. No tests; this is a latency optimization, not a behavior change — the existing combo-selection tests already cover the happy path.

---

## Testing

All tests land in a new file `tests/e2e/workflow-combo.spec.js`. Four cases:

1. **Tap workflow combo does not start espresso** (Feature 1).
   - Load IdlePage. Set `workflowCombos` in settings to include at least one combo with an `id`, `profileTitle`, etc.
   - Click the combo pill to select it. Click it again. Click it a third time.
   - Assert `machine.state` via the mock never transitions from `idle` to `espresso` / `heating`. Assert no `PUT /api/v1/machine/state/espresso` hit the mock server.

2. **Keep changes path** (Feature 2).
   - Navigate to `/workflow/edit`. Select combo X via `PresetPillRow`.
   - Change the `doseIn` field to a new value.
   - Click the BottomBar back chevron → the `UnsavedChangesDialog` opens.
   - Click **Keep changes**.
   - Assert the page navigated back (e.g., to `/`).
   - Assert the mock's last `PUT /api/v1/workflow` payload contained the new `doseIn`.
   - Assert `settings.workflowCombos[X].doseIn` still has the original value (combo untouched).
   - Navigate back to `/workflow/edit`, re-select combo X, assert the form's `doseIn` shows the original value.

3. **Discard path** (Feature 2).
   - Select combo X, change `doseIn`, open the dialog via Back, click **Discard**.
   - Assert the mock received a final `PUT /api/v1/workflow` whose payload matches the pre-edit workflow snapshot (specifically, the original `targetDoseWeight`).
   - Assert `settings.workflowCombos[X].doseIn` is the original value.
   - Re-select combo X and verify the form shows the original value.

4. **Profile change round-trip** (Feature 4 bug fix).
   - Navigate to `/workflow/edit`, select combo X.
   - Click **Change** — verify navigation to `/profiles?from=workflow`.
   - Pick a different profile in the list, click **Use Profile**.
   - Verify navigation back to `/workflow/edit` and that the profile row now shows the newly picked profile.
   - Change some other field (e.g., `doseIn`) to trigger the dirty state.
   - Open Back dialog, click **Save**, navigate back.
   - Re-select combo X, assert the form's profile title reflects the picked profile, not the original.

Mock server requirements (`tests/mock-server.js`):

- `GET /api/v1/profiles` — already exists, may need another mock profile entry so the test has at least two profiles to pick between.
- `PUT /api/v1/workflow` — already exists; the test needs a way to inspect the most recent payload. Add a test-only endpoint `GET /test/last-workflow-update` that returns the last PUT body, or capture via Playwright's `page.waitForRequest` API (preferred — no mock mutation).

---

## Out of scope (this spec)

- **Tutorial page** (testing feedback item 7). Deferred; noted in `professional/decent/passione.md` with open questions.
- **Further preset → combo terminology cleanup beyond workflow combos.** Operation presets (steam / hot-water / flush) stay named as "presets" because they are presets.
- **Redesign of `ProfileSelectorPage`**. The `?from=workflow` sentinel and the "Use Profile" button stay as-is.
- **New combo features** (cloning, import/export, shared combos, etc.). Out of scope.
- **Migrating stored `workflowCombos` data shape.** The shape stays identical; only the access patterns and the editor UI change.

---

## File inventory

**Renamed:**
- `src/pages/BeanInfoPage.vue` → `src/pages/WorkflowEditorPage.vue`

**Modified:**
- `src/components/LayoutWidget.vue` — remove activate on workflow combo row, pass `confirmActivate: false`, rename widget type string, rename `long-press-enabled` → `edit-enabled`, `@long-press` → `@edit`
- `src/components/PresetPillRow.vue` — add `confirmActivate` prop, rename `longPressEnabled` → `editEnabled`, rename emit `long-press` → `edit`
- `src/composables/useLayout.js` — rename widget type key + label, add legacy-alias normalizer
- `src/pages/IdlePage.vue` — rename event handler `onComboLongPress` → `onComboEdit`, update `widgetEvents` map, add profile-diff optimization in `onComboSelect`, update any `/bean-info` → `/workflow/edit`
- `src/pages/WorkflowEditorPage.vue` (formerly `BeanInfoPage.vue`) — full editor redesign: remove auto-save watch, add live-apply watch, capture workflow snapshot, split `saveToWorkflow` into `applyToLiveWorkflow` + `saveToSelectedCombo`, add `dirty` computed, add `UnsavedChangesDialog` integration, fix the profile watcher with `awaitingProfileFromPicker`, add dirty indicator classes, update BottomBar button logic, rename `onComboLongPress` → `onComboEdit`
- `src/router/index.js` — rename import + route + add legacy redirect
- `src/i18n/locales/en.json` — new `workflowEditor` block with all dialog and button strings
- `CLAUDE.md` — rewrite lines 115 and 118, add terminology paragraph, update any `BeanInfoPage` / `/bean-info` mentions
- `tests/mock-server.js` — add at least a second mock profile for the profile-change round-trip test

**Created:**
- `src/components/UnsavedChangesDialog.vue` — four-action modal
- `tests/e2e/workflow-combo.spec.js` — four e2e test cases listed above

---

## Rollout

One branch, bundled commits split by feature for a reviewable git log:

1. `refactor: rename workflowPresets widget type and legacy-alias support`
2. `refactor: rename PresetPillRow longPressEnabled → editEnabled and long-press emit → edit`
3. `refactor: rename BeanInfoPage → WorkflowEditorPage, /bean-info → /workflow/edit with redirect`
4. `fix(idle): workflow combo tap no longer starts espresso`
5. `feat(workflow-editor): live-apply editor with unsaved-changes dialog`
6. `fix(workflow-editor): profile change is honored when combo is selected`
7. `perf(idle): skip profile fetch when combo profile already loaded`
8. `test: e2e coverage for workflow combo editor redesign`
9. `docs: update CLAUDE.md with combo/preset terminology`

CI covers the whole thing via `npm run test:e2e`. No data migration. No breaking changes for end users (legacy `/bean-info` URL still works via the redirect, legacy `'workflowPresets'` widget type in saved layouts still works via the alias).
