# Grinder RPM + Basket data (recipe-editor power-user fields)

**Date:** 2026-04-28
**Status:** Spec — pending implementation
**Tracking:** Passione feedback list (`Professional/Decent/Passione.md`, items #43 "allow option to change grinder rpm. Enabled by a toggle in settings page" and #44 "allow me to add/edit basket data. Enabled by a toggle in settings page").
**Bundles:** #43 + #44 (same pattern, same code paths).

## Problem

Power users want to record more shot metadata than the current recipe editor exposes. Specifically:
- **#43** — grinder RPM (rotations per minute), useful when comparing grinders or tuning a single grinder.
- **#44** — basket data (size in grams; type, e.g. "IMS Competition"), important context for extraction analysis.

Most users don't need either field; surfacing them by default would clutter the recipe editor. Both features are gated behind individual settings toggles so they're invisible to casual users and one click away for power users.

## Goals

- Add three persisted recipe/workflow fields: `grinderRpm`, `basketSize`, `basketType`.
- Add two settings toggles (`showGrinderRpm`, `showBasketData`) defaulting to `false`.
- Make the new fields appear in `RecipeEditorPage` only when the matching toggle is on.
- Preserve combo dirty-detection (so editing the new fields lights the modified-dot).
- Live-apply pushes the new fields into `workflow.context` exactly like every other recipe field.

## Non-goals

- Building a Basket entity / CRUD page (basket data is a pair of free-form fields, not a managed list — same stylistic choice as `coffeeRoaster`/`grinderModel` text fallbacks).
- Validation that RPM matches the selected grinder's specs (we don't model grinder specs).
- Surfacing the fields on `PostShotReviewPage` for editing (read access via `workflow.context` is automatic; an editor surface there is a future enhancement if requested).
- Driving any machine behavior — these are pure metadata.

## Approach

Three independent additions, each surgical:

1. **Settings.** Add two new keys to `DEFAULT_SETTINGS` in `useSettings.js`. Group them under a new `'powerUser'` group (or extend the existing `'espresso'` group — see Components) so they persist to the KV store.

2. **PreferencesTab toggles.** Add two toggle rows next to the existing "Linger on shot graph" toggle, sharing the same `pref__toggle-switch` pattern.

3. **RecipeEditorPage fields.** Three new inputs:
   - **RPM** — `<ValueInput>` (50, step 50, min 50, max 3000) inside the Grinder column, only when `settings.showGrinderRpm`.
   - **Basket Size** — `<ValueInput>` (18, step 0.5, min 7, max 22) and **Basket Type** — free-text input. Both inside a new condensed "Basket" sub-section in the Coffee column (after the bean batch info), only when `settings.showBasketData`.

   Each input is wired into:
   - The `comboValues()` builder (so it gets persisted into saved combos).
   - The `loadFromPreset` and `overlayFromWorkflow` paths (so it hydrates from saved combos and live workflow context).
   - The live-apply watcher's reactive sources.
   - The `buildWorkflowUpdate()` payload (so it lands in `workflow.context`).

4. **`useComboDirty.js`.** Add `'grinderRpm'`, `'basketSize'`, `'basketType'` to `SCALAR_KEYS` so dirty detection sees changes to the new fields. The `workflowToComboShape()` mapping reads them from `ctx`.

## Components

### `src/composables/useSettings.js` (modify)

In `DEFAULT_SETTINGS`:
```js
showGrinderRpm: false,
showBasketData: false,
```

In the `GROUPS` map: add a new `powerUser` group:
```js
powerUser: ['showGrinderRpm', 'showBasketData'],
```

### `src/components/settings/PreferencesTab.vue` (modify)

After the existing "Linger on shot graph" toggle row in the Espresso column (line ~390-403), add two more toggle rows with the same structure:

```vue
<div class="pref__sleep-row">
  <div>
    <div class="pref__label">Show grinder RPM</div>
    <div class="pref__hint">Add an RPM field to recipe editor</div>
  </div>
  <button
    class="pref__toggle-switch"
    :class="{ 'pref__toggle-switch--on': settings.showGrinderRpm }"
    @click="settings.showGrinderRpm = !settings.showGrinderRpm"
    :aria-label="settings.showGrinderRpm ? 'Hide grinder RPM' : 'Show grinder RPM'"
  >
    <span class="pref__toggle-knob" />
  </button>
</div>

<div class="pref__sleep-row">
  <div>
    <div class="pref__label">Show basket data</div>
    <div class="pref__hint">Add basket size + type fields to recipe editor</div>
  </div>
  <button
    class="pref__toggle-switch"
    :class="{ 'pref__toggle-switch--on': settings.showBasketData }"
    @click="settings.showBasketData = !settings.showBasketData"
    :aria-label="settings.showBasketData ? 'Hide basket data' : 'Show basket data'"
  >
    <span class="pref__toggle-knob" />
  </button>
</div>
```

### `src/pages/RecipeEditorPage.vue` (modify)

**New refs:**
```js
const grinderRpm = ref(null)
const basketSize = ref(null)
const basketType = ref('')
```

**Add to live-apply watcher source list:**
```js
watch([coffeeName, roaster, grinder, grinderSetting, doseIn, doseOut,
       selectedBeanId, selectedBatchId, selectedGrinderId,
       profileId, profileTitle, brewTemperature,
       grinderRpm, basketSize, basketType,    // NEW
       includeSteam, steamDuration, steamFlow, steamTemperature,
       includeFlush, flushDuration, flushFlowRate,
       includeHotWater, hotWaterVolume, hotWaterTemperature], ...)
```

**Add to `buildWorkflowUpdate()`:**
```js
const ctx = {
  // ...existing fields...
  grinderRpm: grinderRpm.value ?? null,
  basketSize: basketSize.value ?? null,
  basketType: basketType.value || null,
}
```

**Add to `comboValues()`:** mirror the same fields.

**Hydrate in `loadFromPreset`:**
```js
grinderRpm.value = preset.grinderRpm ?? null
basketSize.value = preset.basketSize ?? null
basketType.value = preset.basketType ?? ''
```

**Hydrate in `overlayFromWorkflow`:**
```js
if (ctx.grinderRpm != null) grinderRpm.value = ctx.grinderRpm
if (ctx.basketSize != null) basketSize.value = ctx.basketSize
if (ctx.basketType != null) basketType.value = ctx.basketType
```

**Hydrate in `hydrateFromWorkflowContext`** (the no-preset path): same three lines.

**Template — RPM field** in the Grinder column, after the existing grind setting row, gated by `v-if="settings?.settings?.showGrinderRpm"`:
```vue
<div v-if="settings?.settings?.showGrinderRpm" class="recipe-editor__field">
  <label class="recipe-editor__label">RPM</label>
  <ValueInput
    v-model="grinderRpm"
    :min="50"
    :max="3000"
    :step="50"
    placeholder="—"
  />
</div>
```

**Template — Basket section** as a NEW condensed sub-section appended to the Coffee column (after the bean batch info block), gated by `v-if="settings?.settings?.showBasketData"`:
```vue
<div v-if="settings?.settings?.showBasketData" class="recipe-editor__basket">
  <h5 class="recipe-editor__subsection-title">Basket</h5>
  <div class="recipe-editor__field">
    <label class="recipe-editor__label">Size (g)</label>
    <ValueInput
      v-model="basketSize"
      :min="7"
      :max="22"
      :step="0.5"
      placeholder="—"
    />
  </div>
  <div class="recipe-editor__field">
    <label class="recipe-editor__label">Type</label>
    <input
      class="recipe-editor__input"
      v-model="basketType"
      placeholder="e.g. IMS Competition"
    />
  </div>
</div>
```

`.recipe-editor__basket` and `.recipe-editor__subsection-title` styles can reuse existing column-internal spacing (no new CSS classes strictly required — match existing `recipe-editor__field` pattern).

### `src/composables/useComboDirty.js` (modify)

In `SCALAR_KEYS`, add `'grinderRpm'`, `'basketSize'`, `'basketType'`.

In `workflowToComboShape()`, map:
```js
grinderRpm: ctx.grinderRpm ?? null,
basketSize: ctx.basketSize ?? null,
basketType: ctx.basketType ?? null,
```

(Read directly from the workflow context.)

## Data flow

1. User flips toggle in Settings → `settings.showGrinderRpm = true` → KV save (debounced).
2. RecipeEditorPage's template re-evaluates `v-if`; field appears.
3. User edits the value → `grinderRpm.value` updates → live-apply watcher fires → `buildWorkflowUpdate()` includes `grinderRpm: 1200` → `updateWorkflow(payload)` → mock workflow now has it in `context`.
4. User saves the combo → `comboValues()` includes `grinderRpm: 1200` → settings persists.
5. User flips toggle off → field hides; the value remains in the workflow / saved combo, just not visible.

## Error handling

No new error paths. Live-apply already silently swallows errors (`applyToLiveWorkflow` catch). Settings persistence already handles transient failures via the existing KV-store flow.

## Testing

E2E in a single new spec `tests/e2e/recipe-power-fields.spec.js`:

1. **Default OFF — fields invisible.** Mount recipe editor with default settings. Assert `RPM` label and `Basket` subsection are not in DOM.
2. **RPM toggle ON — field renders, edits push to workflow.** Flip toggle in PreferencesTab via REST or UI; reload recipe editor; set RPM to 1200; wait for live-apply; assert `GET /api/v1/workflow → context.grinderRpm === 1200`.
3. **Basket toggle ON — fields render, edits push.** Same shape: flip toggle, set basketSize 18 + basketType "Test", assert `context.basketSize === 18` and `context.basketType === 'Test'`.
4. **Toggle off after editing — values persist in workflow.** Edit RPM with toggle on; flip off; assert workflow still has the value (only the editor UI hides; data stays).

Mock-server endpoints: existing `GET /api/v1/workflow`, `PUT /api/v1/store/decenza-js/{key}` already cover everything we need.

## Out-of-scope but worth tracking

- **PostShotReviewPage display.** The shot record will inherit `grinderRpm` / `basketSize` / `basketType` automatically via `workflow.context`. A read-only display row on the shot review page would be a small follow-up. Not in this spec.
- **Single "Power-User Fields" toggle.** We chose two toggles for granularity (some users want RPM, not basket). If the toggle list grows past 3-4 items, consider folding under one master toggle.
- **Validation against grinder spec.** Future feature when grinder records carry RPM ranges.

## Sequencing

1. Settings additions.
2. PreferencesTab toggles.
3. RecipeEditorPage refs + live-apply + buildWorkflowUpdate + hydration paths.
4. RecipeEditorPage template (RPM + basket sections).
5. useComboDirty additions.
6. E2E tests.
7. Version bump 0.5.14 → 0.5.15.
