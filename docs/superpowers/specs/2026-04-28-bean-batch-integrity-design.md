# Bean-batch integrity + shot-edit picker

**Date:** 2026-04-28
**Status:** Spec — pending implementation
**Tracking:** Passione feedback list (`Professional/Decent/Passione.md`, item: "Allow editing of bean-batch id / reference on shot edit page. I also noticed a lot of my beans have wrong batch id referenced…")
**Bundles:** A (investigation), B (validation/integrity fix), C (shot-edit picker), D (tests).

## Problem

The user reports that "many" of their existing shots reference the wrong bean batch — the bean *name* is correct but the `beanBatchId` points to a different bean. They also want the ability to edit the bean+batch link from the shot edit page (`PostShotReviewPage.vue`); today that page can read and display a linked bean ("Linked Bean: X — batch label") but offers no way to change the link.

## Root cause

Two distinct paths produce drift today.

**1. Free-editable text while linked (RecipeEditorPage).** The recipe editor lets the user pick a bean (`onBeanSelect` sets `selectedBeanId`, auto-resolves an active batch, copies `bean.name → coffeeName` and `bean.roaster → roaster`). But `coffeeName` / `roaster` remain free-text inputs. If the user then types in either field, the persisted text drifts away from the linked bean record while `selectedBatchId` stays put. Live-apply pushes `{ coffeeName: <typed>, coffeeRoaster: <typed>, beanBatchId: <linked> }` to the workflow — and from there into every shot saved during that session.

**2. Mount hydration uses text-match instead of authoritative batch-id lookup.** `RecipeEditorPage.vue:366-371` hydrates the page from `workflow.context` like this:

```js
if (ctx.beanBatchId) {
  selectedBatchId.value = ctx.beanBatchId
  const matchingBean = beans.value.find(b => b.name === ctx.coffeeName && b.roaster === ctx.coffeeRoaster)
  if (matchingBean) selectedBeanId.value = matchingBean.id
}
```

When text has drifted, the find fails (or matches a different bean). `selectedBatchId` stays set; `selectedBeanId` is null or wrong. Subsequent live-applies push the same orphaned `beanBatchId` back to the workflow alongside whatever text the user typed. Once committed to a shot record, the drift is permanent.

**3. Shot edit page never updates `beanBatchId`.** `PostShotReviewPage.vue#save` writes `annotations.extras.{beanBrand,roastDate,roastLevel,…}` and `workflow.context.{coffeeName,coffeeRoaster,grinderModel,grinderSetting}` — but does not write `workflow.context.beanBatchId`. So even if a UI for re-linking existed, the save path would silently drop the change.

## Goals

- Make bean-batch links **non-driftable**: while a bean is linked, the bean-related text fields are sourced from the bean record, not free-edited.
- Add a bean+batch picker to the shot edit page (`PostShotReviewPage.vue`) and persist the `beanBatchId` on save.
- Replace mount-time name-matching with batch-id-first lookup so drifted historical records hydrate correctly.
- Cover the user's test scenario plus the integrity invariants with e2e tests.
- Existing drifted records auto-self-correct on next save (no migration needed): linked-mode overwrites the persisted text with the bean's authoritative values.

## Non-goals

- A standalone migration / batch-fix tool to rewrite existing shot records. Self-correction on next edit is sufficient given the user's workflow.
- Changing the workflow context schema (`coffeeName`, `coffeeRoaster`, `beanBatchId` shape stays the same; we tighten how we write them).
- Adding bean+batch entity creation flows on either page (existing `BeansTab` flow remains the only entry point for new bean records).
- Validating server-side. The skin enforces the invariant on write; gateway accepts whatever the API contract says it accepts.

## Approach

Three connected changes.

**1. Linked-mode UI primitive** — a small shared composable `useBeanLink` plus a presentational pattern reused in both `RecipeEditorPage` and `PostShotReviewPage`. Owns:
- `mode` ∈ `'linked' | 'free'`.
- `enterLinked(beanId, batchId?)` — sets selection, copies `bean.name`/`bean.roaster` into the bound name/roaster refs, picks active batch if `batchId` not supplied.
- `clearLink()` — resets `selectedBeanId`/`selectedBatchId`, leaves the name/roaster refs at their last value (now in free mode).
- `linkedBean` / `linkedBatch` / `linkedDisplayName` / `linkedDisplayRoaster` getters.
- The pages render the name/roaster fields as plain text spans when `mode==='linked'`, as inputs when `'free'`.

**2. Authoritative hydration** — replace the name-match block in `RecipeEditorPage.vue:366-371` with a batch-first lookup:

```js
if (ctx.beanBatchId && beansApi) {
  try {
    const batch = await beansApi.getBatch(ctx.beanBatchId)
    if (batch?.beanId) {
      await onBeanSelect(batch.beanId)        // sets bean + auto-batch
      onBatchSelect(batch.id)                 // ensures the specific batch is selected
    } else {
      // Batch resolved but no beanId — orphan link. Clear it.
      selectedBatchId.value = null
    }
  } catch {
    // Batch not found on server — clear local link.
    selectedBatchId.value = null
  }
}
```

Same shape applies to the shot edit page when loading an existing shot's `beanBatchId`.

**3. Shot edit page picker (PostShotReviewPage)** — render the existing free-text fields (`roaster`, `beanBrand`, `beanType`, `roastDate`, `roastLevel`) inside the linked-mode pattern. Add a `<BeanPicker>` row above them. When linked, all five fields display from the bean+batch records. When unlinked, free-edit. Save writes:

- `workflow.context.beanBatchId` ← `selectedBatchId.value || null` (NEW; previously dropped).
- `workflow.context.coffeeName` / `coffeeRoaster` ← linked bean's values when linked, or the typed values when free.
- `annotations.extras.{beanBrand,roastDate,roastLevel}` ← derived from bean/batch when linked, or typed when free.

## Components

### `src/composables/useBeanLink.js` (new)

Shared composable, ~100 lines. Owns linked-mode state.

```js
import { ref, computed, watch } from 'vue'

/**
 * Bean-batch link helper used by RecipeEditor and PostShotReview.
 *
 * `selectedBeanId` and `selectedBatchId` are the canonical source of truth
 * for the link. While both are set and resolve to live records, the link is
 * "linked" — the consumer should render bound text refs (coffeeName,
 * coffeeRoaster, etc.) read-only and trust the bean/batch records for
 * display. While the link is null, the consumer renders free-edit inputs.
 *
 * @param {object} opts
 * @param {Ref<Array>} opts.beans       - Reactive bean list.
 * @param {object}     opts.beansApi    - useBeans() API.
 * @param {Ref<string>} opts.coffeeName - Bound name ref. Updated when entering/exiting link.
 * @param {Ref<string>} opts.roaster    - Bound roaster ref.
 */
export function useBeanLink({ beans, beansApi, coffeeName, roaster }) {
  const selectedBeanId = ref(null)
  const selectedBatchId = ref(null)
  const linkedBean = computed(() =>
    selectedBeanId.value ? beans.value.find(b => b.id === selectedBeanId.value) : null
  )
  const linkedBatchRef = ref(null)
  const isLinked = computed(() =>
    !!selectedBeanId.value && !!selectedBatchId.value && !!linkedBean.value
  )

  // While linked, force coffeeName/roaster to mirror the bean record.
  watch([linkedBean, isLinked], ([bean, linked]) => {
    if (linked && bean) {
      coffeeName.value = bean.name ?? ''
      roaster.value = bean.roaster ?? ''
    }
  }, { immediate: true })

  async function enterLinked(beanId, batchId = null) {
    selectedBeanId.value = beanId
    if (batchId) {
      selectedBatchId.value = batchId
      linkedBatchRef.value = await beansApi.getBatch(batchId).catch(() => null)
    } else {
      const batch = await beansApi.activeBatchForBean(beanId).catch(() => null)
      selectedBatchId.value = batch?.id ?? null
      linkedBatchRef.value = batch ?? null
    }
  }

  function clearLink() {
    selectedBeanId.value = null
    selectedBatchId.value = null
    linkedBatchRef.value = null
    // coffeeName/roaster keep their last value — user is now free-editing.
  }

  /**
   * Hydrate the link from a workflow context (or shot record). Uses batch-id
   * as the authoritative source — text-match was the source of historical
   * drift and is intentionally not used here.
   */
  async function hydrateFromContext(ctx) {
    if (!ctx?.beanBatchId || !beansApi) return
    try {
      const batch = await beansApi.getBatch(ctx.beanBatchId)
      if (batch?.beanId && beans.value.find(b => b.id === batch.beanId)) {
        await enterLinked(batch.beanId, batch.id)
      } else {
        clearLink()
      }
    } catch {
      clearLink()
    }
  }

  return {
    selectedBeanId,
    selectedBatchId,
    linkedBean,
    linkedBatch: linkedBatchRef,
    isLinked,
    enterLinked,
    clearLink,
    hydrateFromContext,
  }
}
```

### `src/components/BeanLinkBadge.vue` (new)

Small presentational component. Renders one of:
- `Linked: <bean name> — <batch label>  [Clear]` when `linked === true`.
- Nothing when `linked === false`.

```vue
<script setup>
defineProps({
  linked: { type: Boolean, default: false },
  beanName: { type: String, default: '' },
  batchLabel: { type: String, default: '' },
})
defineEmits(['clear'])
</script>

<template>
  <div v-if="linked" class="bean-link-badge">
    <span class="bean-link-badge__label">Linked:</span>
    <span class="bean-link-badge__name">{{ beanName }}</span>
    <span v-if="batchLabel" class="bean-link-badge__batch"> — {{ batchLabel }}</span>
    <button type="button" class="bean-link-badge__clear" @click="$emit('clear')">
      Clear link
    </button>
  </div>
</template>

<style scoped>
/* Inherits container colors; tone-on-tone background to read as info, not action. */
.bean-link-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: var(--color-surface-2, rgba(255,255,255,0.04));
  border-radius: 6px;
  font-size: var(--font-small, 0.875rem);
}
.bean-link-badge__label { opacity: 0.7; }
.bean-link-badge__name { font-weight: 600; }
.bean-link-badge__batch { opacity: 0.85; }
.bean-link-badge__clear {
  background: none;
  border: 0;
  color: var(--color-link, #6aa9ff);
  cursor: pointer;
  padding: 0 0.25rem;
}
</style>
```

### `src/pages/RecipeEditorPage.vue` (modify)

- Replace local `selectedBeanId` / `selectedBatchId` refs with destructured fields from `useBeanLink`.
- Drop the body of `onBeanSelect` and `onBatchSelect` in favor of calling `enterLinked(beanId)` / `enterLinked(selectedBeanId.value, batchId)`.
- Replace the broken hydration block (`RecipeEditorPage.vue:366-371`) with `await hydrateFromContext(ctx)`.
- In the template, render `<input v-if="!isLinked">` for `coffeeName` and `roaster`, and `<span class="…readonly">{{ coffeeName }}</span>` plus `<BeanLinkBadge :linked="isLinked" …>` when linked.
- Live-apply continues to read `coffeeName.value` / `roaster.value` — the watcher in `useBeanLink` keeps them pegged to the bean record while linked, so no other live-apply changes are required.

### `src/pages/PostShotReviewPage.vue` (modify)

- Add `useBeanLink` instance bound to local `beanBrand` (re-named/aliased to act as the name ref) and `roaster` refs.
- Add a `<BeanPicker>` row before the existing fields. (`BeanPicker` is a small inline `<select>`-style component that emits a chosen `beanId`; if a similar picker already exists in `RecipeEditorPage.vue` it gets extracted in the implementation step.)
- Render the existing fields:
  - `roaster`, `beanBrand` — `v-if="!isLinked"` for the input, otherwise read-only spans.
  - `roastDate`, `roastLevel` — same. Sourced from `linkedBatch` when linked.
  - Show `<BeanLinkBadge>` above the row.
- On `enrichShot`, replace the existing imperative enrichment with `await hydrateFromContext({ beanBatchId: s.beanBatchId })`. (The `enrichedBean` ref can be removed; the picker derives display data from `useBeanLink`.)
- `save()` must include:
  ```js
  workflow: {
    context: {
      coffeeName: beanType.value || undefined,
      coffeeRoaster: roaster.value || undefined,
      grinderModel: grinderModel.value || undefined,
      grinderSetting: grinderSetting.value || undefined,
      beanBatchId: selectedBatchId.value || null,   // NEW
    },
  },
  ```
- Annotations stay as-is, except: if `isLinked`, source `beanBrand` from `linkedBean.value.name`, `roastDate` from `linkedBatch.value.roastDate`, `roastLevel` from `linkedBatch.value.roastLevel`. (Already enforced by the linked-mode watcher; double-check at save time and write authoritative values.)

### `src/composables/useWorkflow.js` (touch — invariant doc only)

Add a one-line comment near `beanBatchId` initialization documenting the invariant: "If `beanBatchId` is set, `coffeeName` / `coffeeRoaster` MUST equal the linked bean's values. The skin enforces this via `useBeanLink`."

No code change to `useWorkflow.js` itself.

## Data flow

### Mount (RecipeEditorPage with existing `ctx.beanBatchId`)

1. `loadFromPreset(index)` runs synchronously; sets all scalar fields.
2. `await hydrateFromContext(ctx)` → `beansApi.getBatch(ctx.beanBatchId)` → resolves to `{ id, beanId, … }` → if bean exists in `beans.value`, `enterLinked(batch.beanId, batch.id)`.
3. `enterLinked` sets `selectedBeanId` + `selectedBatchId`, the watcher in `useBeanLink` syncs `coffeeName` / `roaster` to authoritative values.
4. `overlayFromWorkflow()` runs — overlays scalar fields (target dose, etc.) but the linked-mode watcher overrides any drifted text from `ctx`.

### Edit while linked

1. User types in coffeeName field — *can't* in linked mode. The input is replaced by a span. To change name/roaster, the user must:
   a. Click "Clear link" — enters free mode, can now type.
   b. Or click the bean picker and choose a different bean — `enterLinked(newBeanId)` runs, fields update.
2. Live-apply fires on selection change as today; pushes `{ coffeeName, coffeeRoaster, beanBatchId }` to workflow. All three are now consistent by construction.

### Save (PostShotReviewPage)

1. `save()` builds the update payload.
2. If `isLinked`:
   - `workflow.context.coffeeName` ← `linkedBean.name`
   - `workflow.context.coffeeRoaster` ← `linkedBean.roaster`
   - `workflow.context.beanBatchId` ← `selectedBatchId.value`
   - `annotations.extras.beanBrand` ← `linkedBean.name`
   - `annotations.extras.roastDate` ← `linkedBatch.roastDate`
   - `annotations.extras.roastLevel` ← `linkedBatch.roastLevel`
3. If unlinked, persists the typed text and `beanBatchId: null`.
4. Calls `updateShot(shotId, payload)`.

## Error handling

- `beansApi.getBatch(id)` rejects → treat as broken link, `clearLink()`. Log nothing (existing patterns swallow these).
- Batch resolves but `beanId` not in `beans.value` (race with bean list refresh): `clearLink()`. The cross-device-refresh feature shipped 2026-04-26 means the bean list refreshes on resume — this race shrinks but isn't zero.
- User clears link mid-edit (between picking a bean and saving): we just save the typed text plus `beanBatchId: null`. No warning needed.
- Save fails: existing toast pattern in `PostShotReviewPage.save()` covers it.

## Testing

E2E tests in `tests/e2e/bean-batch-integrity.spec.js`:

1. **Recipe live-apply (the user's scenario, item D).**
   - Seed two beans + two batches.
   - Open recipe editor; pick bean A + batch A1; save the recipe.
   - Reopen recipe editor; switch to batch A2; **don't save**; navigate Home then back via Recipe.
   - Inspect `/api/v1/workflow` (REST GET): `context.beanBatchId === A2.id`. (The recipe editor's live-apply watcher pushes the change to the workflow even without recipe-save.)

2. **Linked-mode read-only (item B/UX).**
   - Seed bean + batch.
   - Open recipe editor; pick the bean.
   - Assert `coffeeName` / `roaster` render as `.bean-link-badge` adjacent text spans (not `<input>`).
   - Click "Clear link"; assert they become `<input>` again and `selectedBatchId` is `null`.

3. **Shot edit picker (item C).**
   - Seed shot with `workflow.context.beanBatchId === A1`.
   - Open `/shot-review/{shotId}`.
   - Assert linked-mode shows bean A.
   - Use the picker to switch to bean B (auto-selects active batch B1).
   - Save.
   - Assert `mockShotsData[shotId].workflow.context.beanBatchId === B1`.

4. **Hydration with drifted text (item B/regression).**
   - Seed shot with `workflow.context = { beanBatchId: A1, coffeeName: 'wrong', coffeeRoaster: 'wrong' }`.
   - Open `/shot-review/{shotId}`.
   - Assert linked-mode displays bean A's actual name and roaster (not "wrong").
   - Save without further edits.
   - Assert persisted `coffeeName` / `coffeeRoaster` now equal bean A's values (auto-self-correction).

Mock-server additions in `tests/mock-server.js`:
- New helper endpoints under `/api/v1/test/...`:
  - `POST /api/v1/test/inject-bean-with-batch` — atomically creates bean + batch with the provided ids, returns `{ beanId, batchId }`.
  - `POST /api/v1/test/inject-shot` — creates a shot record in `mockShotsData` with caller-supplied `workflow.context` (used by tests 3 and 4).

## Behavior: orphan link clearing on save

If a shot's `workflow.context.beanBatchId` references a bean record that no longer exists server-side (the user deleted it via BeansTab on this or another device), `hydrateFromContext` calls `clearLink()` and sets `selectedBatchId.value` to `null`. The next save then writes `workflow.context.beanBatchId: null`, permanently clearing the orphan reference.

This is the intended behavior:
- The link is genuinely broken — the referenced bean record does not exist.
- Honesty over preservation: a permanent `null` is more truthful than a silently-orphaned id that can never resolve.
- If the user wants to re-link to a different bean, the picker is right there.
- If the user restores the bean record from a backup later, the orphan id would still need a reconciliation pass — which a one-time audit/backfill (out of scope for this work) would do anyway.

The previous behavior (save dropping `beanBatchId` from the payload entirely, allowing the orphan to persist) was an accident of the missing save-path field, not an intentional preservation strategy.

## Out-of-scope but worth tracking

- **Migration / batch-fix tool.** The user's existing drifted shots auto-correct on next edit. A one-time backfill would visit every shot and apply the same logic. Possible follow-up if the auto-correct cadence is too slow.
- **Batches list refresh in linked-mode.** When the user is in linked mode and a *different* device adds a new batch to the same bean, the picker dropdown should refresh. The cross-device-refresh feature already invalidates `batchCache` on visibility — when the user reopens the picker, fresh batches load. No additional plumbing required.
- **Server-side enforcement.** Out of scope; gateway has no concept of "linked beans" today.
- **#43 (grinder rpm)** and **#44 (basket data)** are queued separately on the task list.

## Sequencing (single bundled implementation)

1. Add `useBeanLink.js` composable + unit-light tests via the e2e fixtures.
2. Add `BeanLinkBadge.vue`.
3. Refactor `RecipeEditorPage.vue` to use `useBeanLink` + linked-mode rendering. Replace mount hydration block.
4. Add bean+batch picker section to `PostShotReviewPage.vue`. Update save path.
5. Mock-server hooks for the new e2e tests.
6. Add the 4 e2e tests.
7. Run full suite; fix regressions if any.
8. Patch version bump (0.5.13 → 0.5.14).

The whole thing ships as one PR / one tag.
