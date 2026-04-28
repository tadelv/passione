# Bean-batch integrity + shot-edit picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop bean-batch metadata from drifting away from its linked bean record (root-cause fix in `RecipeEditorPage` mount hydration), and let users re-link a shot's bean+batch from `PostShotReviewPage`. Existing drifted shots auto-self-correct on next save.

**Architecture:** A new `useBeanLink` composable owns linked-mode state (selectedBeanId / selectedBatchId, linkedBean / linkedBatch, hydration via batch-id-first lookup). `RecipeEditorPage` already has linked-mode rendering for bean text fields — the refactor there is replacing the broken name-match hydration with `useBeanLink.hydrateFromContext`. `PostShotReviewPage` gets the full picker + linked-mode rendering and starts persisting `workflow.context.beanBatchId` on save.

**Tech Stack:** Vue 3 + Vite SPA, Playwright e2e, mock REST/WS server in `tests/`.

**Spec:** `docs/superpowers/specs/2026-04-28-bean-batch-integrity-design.md`

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/composables/useBeanLink.js` | Create | Linked-mode state owner: `selectedBeanId/BatchId`, `linkedBean/Batch`, `isLinked`, `enterLinked`, `clearLink`, `hydrateFromContext`. Watcher syncs bound `coffeeName`/`roaster` refs to bean record while linked. |
| `src/components/BeanLinkBadge.vue` | Create | Small "Linked: BeanName — batch | Clear" presentational component used in tab/page headers. |
| `src/pages/RecipeEditorPage.vue` | Modify | Adopt `useBeanLink`; replace mount-hydration block (lines 366-371) with `hydrateFromContext`. Existing linked-mode template stays. |
| `src/pages/PostShotReviewPage.vue` | Modify | Add bean+batch picker + linked-mode rendering on the bean/batch fields. Save path now writes `workflow.context.beanBatchId`. Linked-mode pegs `roaster`/`beanBrand`/`roastDate`/`roastLevel` to authoritative bean+batch values. |
| `src/composables/useWorkflow.js` | Modify (comment-only) | Document the invariant near the `beanBatchId` initialization. |
| `tests/mock-server.js` | Modify | Add `/api/v1/test/inject-bean-with-batch` and `/api/v1/test/inject-shot` test endpoints, plus a counter reset. |
| `tests/e2e/bean-batch-integrity.spec.js` | Create | Four e2e tests covering: recipe live-apply (user's scenario), linked-mode read-only behavior, shot-edit picker save, hydration with drifted text. |
| `package.json` | Modify | Bump `0.5.13` → `0.5.14`. |

---

## Task 1: `useBeanLink` composable

**Files:**
- Create: `src/composables/useBeanLink.js`

- [ ] **Step 1: Write the file**

```js
// src/composables/useBeanLink.js
/**
 * Bean-batch link helper used by RecipeEditor and PostShotReview.
 *
 * `selectedBeanId` and `selectedBatchId` are the canonical source of truth
 * for the link. While both are set and resolve to live bean+batch records,
 * `isLinked` is true — the consumer should render bound text refs
 * (`coffeeName`, `roaster`) read-only and trust the bean/batch records for
 * display. When unlinked, the consumer renders free-edit inputs.
 *
 * The watcher inside this composable keeps the bound `coffeeName` /
 * `roaster` refs pegged to the linked bean's values for as long as the
 * link is live, eliminating the drift class of bugs (typed text getting
 * out of sync with the linked bean record).
 *
 * @param {object} opts
 * @param {Ref<Array>} opts.beans       Reactive bean list (from inject('beans')).
 * @param {object}     opts.beansApi    useBeans() API (from inject('beansApi')).
 * @param {Ref<string>} opts.coffeeName Bound name ref. Updated when entering/exiting link.
 * @param {Ref<string>} opts.roaster    Bound roaster ref.
 */
import { ref, computed, watch } from 'vue'

export function useBeanLink({ beans, beansApi, coffeeName, roaster }) {
  const selectedBeanId = ref(null)
  const selectedBatchId = ref(null)
  const linkedBatch = ref(null)

  const linkedBean = computed(() =>
    selectedBeanId.value ? beans.value.find(b => b.id === selectedBeanId.value) : null
  )

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

  /**
   * Set the link to a specific bean (and optionally a specific batch). When
   * `batchId` is omitted, the bean's active batch is auto-selected.
   */
  async function enterLinked(beanId, batchId = null) {
    selectedBeanId.value = beanId
    if (batchId) {
      selectedBatchId.value = batchId
      try {
        linkedBatch.value = await beansApi.getBatch(batchId)
      } catch {
        linkedBatch.value = null
      }
    } else {
      try {
        const batch = await beansApi.activeBatchForBean(beanId)
        selectedBatchId.value = batch?.id ?? null
        linkedBatch.value = batch ?? null
      } catch {
        selectedBatchId.value = null
        linkedBatch.value = null
      }
    }
  }

  function clearLink() {
    selectedBeanId.value = null
    selectedBatchId.value = null
    linkedBatch.value = null
    // coffeeName/roaster keep their last value — user is now free-editing.
  }

  /**
   * Hydrate the link from a workflow context (or shot record). Uses
   * `ctx.beanBatchId` as the authoritative source — text-match was the
   * source of historical drift and is intentionally not used here.
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
    linkedBatch,
    isLinked,
    enterLinked,
    clearLink,
    hydrateFromContext,
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build (the composable is not yet imported anywhere; build sanity-checks the syntax).

- [ ] **Step 3: Commit**

```bash
git add src/composables/useBeanLink.js
git commit -m "feat(beans): add useBeanLink composable for linked-mode state"
```

Use the standard `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` footer.

---

## Task 2: `BeanLinkBadge` component

**Files:**
- Create: `src/components/BeanLinkBadge.vue`

- [ ] **Step 1: Write the file**

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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/BeanLinkBadge.vue
git commit -m "feat: add BeanLinkBadge presentational component"
```

Use the standard Co-Authored-By footer.

---

## Task 3: Refactor `RecipeEditorPage.vue` to use `useBeanLink`

The existing `RecipeEditorPage` has linked-mode rendering already (template lines 769-799 swap `<input>` for `<span>` based on `selectedBeanId`). The bug we're fixing is the broken mount hydration at lines 366-371 (name-match instead of batch-id lookup) and the duplicated link state (`selectedBeanId`, `selectedBatchId`, `selectedBatch` declared inline). Adopting `useBeanLink` consolidates the state and replaces the hydration block.

**Files:**
- Modify: `src/pages/RecipeEditorPage.vue`

- [ ] **Step 1: Read the file first**

Run: `cat src/pages/RecipeEditorPage.vue | head -50` then read sections around the bean-related code:
- Lines 30-46: `coffeeName`, `roaster`, `selectedBeanId`, `selectedBatchId`, `selectedBatch` declarations.
- Lines 148-176: `onBeanSelect`, `onBatchSelect`.
- Lines 247-275: `loadFromPreset` bean restoration.
- Lines 360-372: mount hydration with the name-match block.
- Lines 760-820: bean picker + linked-mode template (no change needed).

- [ ] **Step 2: Replace the link-state declarations**

In `<script setup>` section of `src/pages/RecipeEditorPage.vue`, find:

```js
const selectedBeanId = ref(null)
const batchesForBean = ref([])
const selectedBatchId = ref(null)
const selectedBatch = ref(null)
```

(Around line 40-43; the exact set of refs may include other neighbors — only replace the four bean-link-related refs above.)

Replace with:

```js
import { useBeanLink } from '../composables/useBeanLink'
// ...other imports unchanged...

const batchesForBean = ref([])
const {
  selectedBeanId,
  selectedBatchId,
  linkedBean,
  linkedBatch: selectedBatch, // alias to keep template references working
  isLinked,
  enterLinked,
  clearLink,
  hydrateFromContext,
} = useBeanLink({ beans, beansApi, coffeeName, roaster })
```

Note: the `import` line goes at the top with other imports. The destructured const goes in the same place the old refs were. The alias `linkedBatch: selectedBatch` keeps existing template usage working without renaming.

- [ ] **Step 3: Refactor `onBeanSelect`**

Find the existing `onBeanSelect` function (around lines 148-171). Replace its body with:

```js
async function onBeanSelect(beanId) {
  if (!beanId) {
    clearLink()
    coffeeName.value = ''
    roaster.value = ''
    batchesForBean.value = []
    return
  }
  await enterLinked(beanId)
  // The linked-mode watcher in useBeanLink already syncs coffeeName/roaster
  // to the bean record. Load batches for the picker dropdown.
  if (beansApi) {
    batchesForBean.value = await beansApi.getBatches(beanId).catch(() => []) ?? []
  }
}
```

- [ ] **Step 4: Refactor `onBatchSelect`**

Find the existing `onBatchSelect` function (around lines 173-176). Replace with:

```js
async function onBatchSelect(batchId) {
  if (!selectedBeanId.value) return
  await enterLinked(selectedBeanId.value, batchId)
}
```

- [ ] **Step 5: Replace mount hydration block**

Find the block starting `if (selectedIndex.value < 0) {` and inside it the `if (ctx.beanBatchId) {` block (around lines 366-371):

```js
if (ctx.beanBatchId) {
  selectedBatchId.value = ctx.beanBatchId
  // Find matching bean
  const matchingBean = beans.value.find(b => b.name === ctx.coffeeName && b.roaster === ctx.coffeeRoaster)
  if (matchingBean) selectedBeanId.value = matchingBean.id
}
```

Replace with:

```js
if (ctx.beanBatchId) {
  await hydrateFromContext(ctx)
  if (selectedBeanId.value && beansApi) {
    batchesForBean.value = await beansApi.getBatches(selectedBeanId.value).catch(() => []) ?? []
  }
}
```

If the surrounding function isn't already `async`, mark it `async`. The current code at this site is at the top level of the `<script setup>` block — wrap the whole `if (selectedIndex.value < 0) { ... }` block in an async IIFE or move it into an `async function hydrateNoPreset()` and call `await hydrateNoPreset()` from a top-level `await`. Pattern:

```js
async function hydrateFromWorkflowContext() {
  const ctx = workflow?.context
  if (!ctx) return
  doseIn.value = ctx.targetDoseWeight ?? 18.0
  doseOut.value = ctx.targetYield ?? 36.0
  if (doseIn.value > 0) ratioValue.value = +(doseOut.value / doseIn.value).toFixed(1)
  grinder.value = ctx.grinderModel ?? ''
  grinderSetting.value = ctx.grinderSetting ?? ''
  coffeeName.value = ctx.coffeeName ?? ''
  roaster.value = ctx.coffeeRoaster ?? ''
  if (ctx.grinderId) selectedGrinderId.value = ctx.grinderId
  if (ctx.beanBatchId) {
    await hydrateFromContext(ctx)
    if (selectedBeanId.value && beansApi) {
      batchesForBean.value = await beansApi.getBatches(selectedBeanId.value).catch(() => []) ?? []
    }
  }
}
```

Then replace the original top-level block:

```js
if (selectedIndex.value >= 0) {
  loadFromPreset(selectedIndex.value).then(overlayFromWorkflow)
} else {
  // Populate from workflow context
  const ctx = workflow?.context
  if (ctx) {
    // ...existing 13 lines including the old beanBatchId block...
  }
}
```

with:

```js
if (selectedIndex.value >= 0) {
  loadFromPreset(selectedIndex.value).then(overlayFromWorkflow)
} else {
  hydrateFromWorkflowContext()
}
```

- [ ] **Step 6: Refactor `loadFromPreset` bean section**

Find the bean restoration block in `loadFromPreset` (around lines 247-275):

```js
if (preset.selectedBeanId) {
  await onBeanSelect(preset.selectedBeanId)
} else {
  selectedBeanId.value = null
  selectedBatchId.value = null
  selectedBatch.value = null
  batchesForBean.value = []
}
// ...
if (preset.selectedBeanId && preset.selectedBatchId) {
  const batchId = preset.selectedBatchId
  if (batchesForBean.value.length > 0) {
    onBatchSelect(batchId)
  } else {
    _pendingBatchWatch = watch(batchesForBean, (batches) => {
      if (batches.length > 0) {
        onBatchSelect(batchId)
        _pendingBatchWatch?.()
        _pendingBatchWatch = null
      }
    })
  }
}
```

Replace with:

```js
if (preset.selectedBeanId) {
  if (preset.selectedBatchId) {
    await enterLinked(preset.selectedBeanId, preset.selectedBatchId)
  } else {
    await enterLinked(preset.selectedBeanId)
  }
  if (beansApi) {
    batchesForBean.value = await beansApi.getBatches(preset.selectedBeanId).catch(() => []) ?? []
  }
} else {
  clearLink()
  batchesForBean.value = []
}
```

The `_pendingBatchWatch` machinery is no longer needed — `enterLinked` resolves the batch synchronously via `getBatch(batchId)`. Remove the `let _pendingBatchWatch = null` declaration and the `_pendingBatchWatch?.()` call in the unmount handler if they're no longer referenced (search for `_pendingBatchWatch` and confirm).

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: clean build, no errors. If there are unused-variable warnings about `_pendingBatchWatch`, remove its declaration too.

- [ ] **Step 8: Run the recipe-editor e2e suite to confirm no regressions**

Run: `npm run test:e2e -- tests/e2e/recipe-editor.spec.js`
Expected: all passing (the existing tests don't exercise the drifted-text scenario, so they should still be green).

- [ ] **Step 9: Commit**

```bash
git add src/pages/RecipeEditorPage.vue
git commit -m "refactor(recipe-editor): use useBeanLink; fix mount hydration to lookup by batch id"
```

Use the standard Co-Authored-By footer.

---

## Task 4: Add bean+batch picker + save fix to `PostShotReviewPage.vue`

**Files:**
- Modify: `src/pages/PostShotReviewPage.vue`

The shot edit page currently displays `enrichedBean` as a read-only "Linked Bean: …" line with no edit affordance, and `save()` doesn't write `workflow.context.beanBatchId`. After this task: a `<select>` picker for the bean (mirroring `RecipeEditorPage`), linked-mode rendering for the bean text fields, and a save path that includes `beanBatchId`.

- [ ] **Step 1: Read the file**

Run: `cat src/pages/PostShotReviewPage.vue | head -60` and review:
- Lines 21-24: `beans`, `beansApi`, `grinders`, `grindersApi` injection.
- Lines 37-58: `enrichedBean` state and `enrichShot()` function.
- Lines 61-74: editable refs (`roaster`, `beanBrand`, `beanType`, `roastDate`, `roastLevel`, etc.).
- Lines 165-180 area: `loadShot()` — where shot fields populate the editable refs.
- Lines 259-309: `save()` — current payload without beanBatchId.
- Lines 392-449: the Coffee/Bean section template (around `<select v-model="roastLevel">`).

- [ ] **Step 2: Add useBeanLink and update imports**

In `<script setup>`, add the import near the top:

```js
import { useBeanLink } from '../composables/useBeanLink'
import BeanLinkBadge from '../components/BeanLinkBadge.vue'
```

After the existing `roaster`, `beanBrand` etc. ref declarations (around line 61-74), add:

```js
// Bean-batch link state. The bean text fields (`roaster`, `beanBrand`)
// are bound to coffeeName/roaster equivalents via useBeanLink so they
// read-only when linked.
const {
  selectedBeanId,
  selectedBatchId,
  linkedBean,
  linkedBatch,
  isLinked,
  enterLinked,
  clearLink,
  hydrateFromContext,
} = useBeanLink({ beans, beansApi, coffeeName: beanBrand, roaster })
```

Note: the existing local ref naming uses `beanBrand` for the bean's *name* and `roaster` for the roaster — `useBeanLink`'s `coffeeName` parameter is bound to `beanBrand` here (matching the existing field semantic).

- [ ] **Step 3: Replace `enrichShot` with `hydrateFromContext`**

Find the existing `enrichShot` function (lines 40-58):

```js
async function enrichShot(s) {
  enrichedBean.value = null
  enrichedGrinder.value = null
  if (s.beanBatchId && beansApi) {
    try {
      const batch = await beansApi.getBatch(s.beanBatchId)
      if (batch?.beanId) {
        const bean = await beansApi.getById(batch.beanId)
        if (bean) enrichedBean.value = { ...bean, batch }
      }
    } catch {}
  }
  if (s.grinderId && grindersApi) {
    try {
      const g = await grindersApi.getById(s.grinderId)
      if (g) enrichedGrinder.value = g
    } catch {}
  }
}
```

Replace with:

```js
async function enrichShot(s) {
  enrichedGrinder.value = null
  await hydrateFromContext({ beanBatchId: s.beanBatchId })
  if (s.grinderId && grindersApi) {
    try {
      const g = await grindersApi.getById(s.grinderId)
      if (g) enrichedGrinder.value = g
    } catch {}
  }
}
```

Also remove the `const enrichedBean = ref(null)` declaration (around line 37) — `linkedBean` from `useBeanLink` replaces it.

- [ ] **Step 4: Mark loadShot as async-safe**

Search for the call to `enrichShot(...)` in the file (likely inside `loadShot()`). The call should already be `await enrichShot(s)` — verify with `grep -n "enrichShot" src/pages/PostShotReviewPage.vue`. If it's a fire-and-forget call without `await`, change it to `await enrichShot(s)`.

- [ ] **Step 5: Add bean picker handlers**

Add these helpers in `<script setup>` near the existing functions (e.g. after `enrichShot`):

```js
async function onBeanSelect(beanId) {
  markDirty()
  if (!beanId) {
    clearLink()
    return
  }
  await enterLinked(beanId)
}

function onBatchSelect(batchId) {
  if (!selectedBeanId.value) return
  markDirty()
  enterLinked(selectedBeanId.value, batchId)
}

const batchesForBean = ref([])
watch(selectedBeanId, async (id) => {
  if (!id || !beansApi) {
    batchesForBean.value = []
    return
  }
  batchesForBean.value = await beansApi.getBatches(id).catch(() => []) ?? []
})
```

Add `import { watch } from 'vue'` to the existing `vue` import line if `watch` is not already imported.

- [ ] **Step 6: Update `save()` to write beanBatchId**

Find the `save()` function (lines 259-309). Locate the `workflow: { context: { ... } }` block (lines 289-296):

```js
workflow: {
  context: {
    coffeeName: beanType.value || undefined,
    coffeeRoaster: roaster.value || undefined,
    grinderModel: grinderModel.value || undefined,
    grinderSetting: grinderSetting.value || undefined,
  },
},
```

Replace with:

```js
workflow: {
  context: {
    coffeeName: beanType.value || undefined,
    coffeeRoaster: roaster.value || undefined,
    grinderModel: grinderModel.value || undefined,
    grinderSetting: grinderSetting.value || undefined,
    beanBatchId: selectedBatchId.value || null,
  },
},
```

This is the core save-path fix. `selectedBatchId.value` is `null` when unlinked, the linked batch id when linked.

- [ ] **Step 7: Update the Coffee section template**

Find the bean-related fields in the template — `Bean Brand` (line 405-412), `Bean Type` (line 414-421), `Roast Date` (line 423-434), `Roast Level` (line 436-442), and the `enrichedBean` display block (line 444-448).

Replace the entire block (from `<!-- Bean Brand -->` or equivalent first field comment, through the end of the `enrichedBean` div) with:

```vue
            <div class="review-page__field">
              <label class="review-page__label">Bean</label>
              <select class="review-page__select" :value="selectedBeanId" @change="onBeanSelect($event.target.value)">
                <option value="">Manual entry...</option>
                <option v-for="b in beans" :key="b.id" :value="b.id">{{ b.roaster }} — {{ b.name }}</option>
              </select>
            </div>

            <div v-if="isLinked && batchesForBean.length > 1" class="review-page__field">
              <label class="review-page__label">Batch</label>
              <select class="review-page__select" :value="selectedBatchId" @change="onBatchSelect($event.target.value)">
                <option v-for="b in batchesForBean" :key="b.id" :value="b.id">
                  {{ b.roastDate || b.id }}{{ b.roastLevel ? ` — ${b.roastLevel}` : '' }}
                </option>
              </select>
            </div>

            <BeanLinkBadge
              :linked="isLinked"
              :bean-name="linkedBean?.name ?? ''"
              :batch-label="linkedBatch?.roastDate ?? ''"
              @clear="clearLink"
            />

            <!-- Manual mode: free-text fields -->
            <template v-if="!isLinked">
              <div class="review-page__field">
                <label class="review-page__label">Bean Brand</label>
                <SuggestionField
                  v-model="beanBrand"
                  placeholder="Bean brand"
                  :suggestions="historySuggestions.beanBrand"
                />
              </div>

              <div class="review-page__field">
                <label class="review-page__label">Roast Date</label>
                <input
                  v-model="roastDate"
                  type="text"
                  inputmode="numeric"
                  pattern="\d{4}-\d{2}-\d{2}"
                  placeholder="YYYY-MM-DD"
                  maxlength="10"
                  class="review-page__input"
                />
              </div>

              <div class="review-page__field">
                <label class="review-page__label">Roast Level</label>
                <select v-model="roastLevel" class="review-page__select">
                  <option value="">--</option>
                  <option v-for="rl in ROAST_LEVELS" :key="rl" :value="rl">{{ rl }}</option>
                </select>
              </div>
            </template>

            <!-- Linked mode: read-only display of linked records -->
            <template v-else>
              <div class="review-page__field">
                <label class="review-page__label">Bean Brand</label>
                <span class="review-page__readonly">{{ beanBrand }}</span>
              </div>

              <div v-if="linkedBatch?.roastDate" class="review-page__field">
                <label class="review-page__label">Roast Date</label>
                <span class="review-page__readonly">{{ linkedBatch.roastDate }}</span>
              </div>

              <div v-if="linkedBatch?.roastLevel" class="review-page__field">
                <label class="review-page__label">Roast Level</label>
                <span class="review-page__readonly">{{ linkedBatch.roastLevel }}</span>
              </div>
            </template>
```

The `Bean Type` field (which historically may have meant the same as `Bean Brand` or held a free-text variety description) is folded into the linked-mode display. If your existing file shows `beanType` is a separate semantic field (e.g. used in `save()` for `workflow.context.coffeeName`), keep it as a free-text field outside the linked-mode template branch — it's not driven by the bean record.

Confirm by reading lines 290-291 of the existing save: `coffeeName: beanType.value || undefined`. So `beanType` IS the "coffee name" field. Keep it accessible (free-text in both modes) by adding it back BEFORE the `<template v-if="!isLinked">` branch:

```vue
            <div class="review-page__field">
              <label class="review-page__label">Bean Type / Variety</label>
              <SuggestionField
                v-if="!isLinked"
                v-model="beanType"
                placeholder="Bean type"
                :suggestions="historySuggestions.beanType"
              />
              <span v-else class="review-page__readonly">{{ linkedBean?.name ?? beanType }}</span>
            </div>
```

When linked, `beanType` displays the bean's name (the canonical "what is this coffee" label).

- [ ] **Step 8: Add `.review-page__readonly` style if missing**

Run: `grep -n "review-page__readonly" src/pages/PostShotReviewPage.vue`

If no match, add to the page's `<style scoped>` block (find the existing `.review-page__input` style as an anchor):

```css
.review-page__readonly {
  display: inline-block;
  padding: 0.5rem;
  color: var(--color-text-muted, rgba(255,255,255,0.6));
  font-style: italic;
}
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 10: Run the existing post-shot-review tests**

Run: `npm run test:e2e -- tests/e2e/user-workflow.spec.js`
Expected: passing (this test exercises shot review save flow at the end of the user-workflow spec).

- [ ] **Step 11: Commit**

```bash
git add src/pages/PostShotReviewPage.vue
git commit -m "feat(post-shot-review): bean+batch picker with linked-mode + persist beanBatchId"
```

Use the standard Co-Authored-By footer.

---

## Task 5: Mock-server hooks for bean-batch e2e tests

**Files:**
- Modify: `tests/mock-server.js`

The new e2e tests need to:
- Atomically inject a known bean+batch pair (caller-supplied ids).
- Inject a shot record into `mockShotsData` with caller-supplied `workflow.context` (used to seed shots with drifted text or a specific `beanBatchId`).
- Reset all of the above between tests.

- [ ] **Step 1: Add scenario state**

In `tests/mock-server.js`, near the existing test-state declarations (e.g. after the shot-poll state added in commit `41a16d5`), add:

```js
const injectedShotIdsForBeanTests = []
```

(The existing `injectedShotIds` array is for the shot-poll feature — keep them separate to avoid coupling reset semantics.)

- [ ] **Step 2: Add `inject-bean-with-batch` endpoint**

Near the other `/api/v1/test/...` handlers, add:

```js
if (path === '/api/v1/test/inject-bean-with-batch' && method === 'POST') {
  // Atomically create a bean and one batch, both with caller-supplied ids.
  // Body: { beanId, beanName, beanRoaster, batchId, roastDate?, roastLevel? }
  const beanId = body?.beanId ?? ('bean-injected-' + Date.now())
  const batchId = body?.batchId ?? ('batch-injected-' + Date.now())
  const bean = {
    id: beanId,
    name: body?.beanName ?? 'Injected Bean',
    roaster: body?.beanRoaster ?? 'Injected Roaster',
  }
  const batch = {
    id: batchId,
    beanId,
    roastDate: body?.roastDate ?? '2026-04-20',
    roastLevel: body?.roastLevel ?? 'Medium',
  }
  // Replace any existing entry with the same id (idempotent injection).
  const existingBean = mockBeans.findIndex(b => b.id === beanId)
  if (existingBean >= 0) mockBeans[existingBean] = bean
  else mockBeans.push(bean)
  if (!mockBeanBatches[beanId]) mockBeanBatches[beanId] = []
  const existingBatch = mockBeanBatches[beanId].findIndex(b => b.id === batchId)
  if (existingBatch >= 0) mockBeanBatches[beanId][existingBatch] = batch
  else mockBeanBatches[beanId].push(batch)
  return json({ beanId, batchId }, 201)
}

if (path === '/api/v1/test/inject-shot' && method === 'POST') {
  // Inject a shot record into mockShotsData with caller-supplied workflow.context.
  // Body: { shotId, context, timestamp? }
  const shotId = body?.shotId ?? ('shot-injected-bean-test-' + Date.now())
  const shot = {
    id: shotId,
    timestamp: body?.timestamp ?? new Date().toISOString(),
    workflow: {
      name: 'Injected Test Shot',
      profile: { title: 'Test Profile', id: 'test-profile-1' },
      context: body?.context ?? {},
    },
    measurements: [],
    metadata: {},
    annotations: { extras: {} },
  }
  mockShotsData[shotId] = shot
  if (!mockShotIds.includes(shotId)) mockShotIds.unshift(shotId)
  injectedShotIdsForBeanTests.push(shotId)
  return json(shot, 201)
}
```

- [ ] **Step 3: Add lookup endpoint for tests**

E2E tests need to inspect mock state after a save. Add:

```js
if (path.match(/^\/api\/v1\/test\/get-shot\/[^/]+$/) && method === 'GET') {
  const shotId = decodeURIComponent(path.split('/').pop())
  const shot = mockShotsData[shotId]
  return shot ? json(shot) : json({ error: 'Not found' }, 404)
}
```

(This is just a passthrough to `mockShotsData` for assertions.)

- [ ] **Step 4: Add a reset endpoint**

```js
if (path === '/api/v1/test/reset-bean-test-state' && method === 'POST') {
  for (const id of injectedShotIdsForBeanTests) {
    delete mockShotsData[id]
    const idx = mockShotIds.indexOf(id)
    if (idx >= 0) mockShotIds.splice(idx, 1)
  }
  injectedShotIdsForBeanTests.length = 0
  // Also clear injected beans/batches that the bean tests may have created.
  // Identify them by the `bean-injected-` / `batch-injected-` prefix.
  for (let i = mockBeans.length - 1; i >= 0; i--) {
    if (mockBeans[i].id?.startsWith('bean-injected-')) mockBeans.splice(i, 1)
  }
  for (const beanId of Object.keys(mockBeanBatches)) {
    mockBeanBatches[beanId] = mockBeanBatches[beanId].filter(b => !b.id?.startsWith('batch-injected-'))
    if (mockBeanBatches[beanId].length === 0) delete mockBeanBatches[beanId]
  }
  return json({ ok: true })
}
```

- [ ] **Step 5: Sanity check**

Run: `npm run test:e2e -- --list`
Expected: 93 tests listed (current count) plus whatever Plan-Task 6/7/8/9 will add.

- [ ] **Step 6: Commit**

```bash
git add tests/mock-server.js
git commit -m "test(mock): add bean-batch test hooks (inject-bean-with-batch, inject-shot, reset)"
```

---

## Task 6: E2E test — Recipe live-apply (the user's scenario)

**Files:**
- Create: `tests/e2e/bean-batch-integrity.spec.js`

- [ ] **Step 1: Write the test**

```js
/**
 * E2E tests for bean-batch integrity:
 *
 * 1. Recipe live-apply: changing the batch in recipe editor pushes to
 *    workflow even without saving the recipe.
 * 2. Linked-mode: bean text fields are read-only when a bean is linked.
 * 3. Shot edit picker: changing batch on PostShotReviewPage persists
 *    workflow.context.beanBatchId.
 * 4. Hydration with drifted text: opening a shot whose persisted text
 *    doesn't match the linked bean still renders the linked bean's
 *    authoritative values.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

test.describe('Bean-batch integrity', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${BASE_URL}/api/v1/test/reset-bean-test-state`)
  })

  test('recipe live-apply: changing batch updates workflow context without recipe save', async ({ page, request }) => {
    test.setTimeout(45_000)

    // Seed two batches under one bean.
    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-test-X', beanName: 'X-Bean', beanRoaster: 'X-Roaster',
              batchId: 'batch-X1', roastDate: '2026-04-01', roastLevel: 'Light' },
    })
    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-test-X', beanName: 'X-Bean', beanRoaster: 'X-Roaster',
              batchId: 'batch-X2', roastDate: '2026-04-20', roastLevel: 'Medium' },
    })

    // Open recipe editor.
    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.recipe-editor', { timeout: 5_000 })

    // Pick the bean (auto-selects active batch).
    const beanSelect = page.locator('.recipe-editor__column select').first()
    await beanSelect.selectOption('bean-test-X')

    // Wait for live-apply (300ms debounce + a buffer).
    await page.waitForTimeout(800)

    // Switch to batch X1 (might already be active; force-select for determinism).
    // The batch selector is inside .recipe-editor__batch-info or similar; use
    // the second select inside the Coffee column as the batch selector.
    const allCoffeeSelects = page.locator('.recipe-editor__column').first().locator('select')
    const count = await allCoffeeSelects.count()
    if (count >= 2) {
      await allCoffeeSelects.nth(1).selectOption('batch-X1')
      await page.waitForTimeout(800)
    }

    // Verify workflow.context.beanBatchId is now batch-X1 via REST.
    let workflowRes = await request.get(`${BASE_URL}/api/v1/workflow`)
    let workflow = await workflowRes.json()
    expect(workflow.context?.beanBatchId).toBe('batch-X1')

    // Switch to batch X2 — DON'T click any save button.
    await allCoffeeSelects.nth(1).selectOption('batch-X2')
    await page.waitForTimeout(800)

    // Live-apply must have pushed the change. Verify.
    workflowRes = await request.get(`${BASE_URL}/api/v1/workflow`)
    workflow = await workflowRes.json()
    expect(workflow.context?.beanBatchId).toBe('batch-X2')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- tests/e2e/bean-batch-integrity.spec.js`
Expected: 1 passed.

If the test fails:
- Selectors `.recipe-editor` / `.recipe-editor__column` / `.recipe-editor__batch-info` may not exist verbatim. Run `grep -n "class=\"recipe-editor" src/pages/RecipeEditorPage.vue | head -10` to verify the actual class names. Adjust selectors.
- The batch selector might be a different DOM index; print the page HTML at the relevant point with `await page.locator('.recipe-editor').innerHTML()` and `console.log` to debug.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bean-batch-integrity.spec.js
git commit -m "test(e2e): recipe live-apply pushes batch change to workflow without save"
```

---

## Task 7: E2E test — linked-mode read-only behavior

**Files:**
- Modify: `tests/e2e/bean-batch-integrity.spec.js`

- [ ] **Step 1: Append the test**

```js
  test('linked-mode renders bean text fields read-only; clear-link restores edit', async ({ page, request }) => {
    test.setTimeout(45_000)

    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-test-Y', beanName: 'Y-Bean', beanRoaster: 'Y-Roaster',
              batchId: 'batch-Y1', roastDate: '2026-04-15', roastLevel: 'Dark' },
    })

    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.recipe-editor', { timeout: 5_000 })

    // Initially no bean selected — Coffee Name should be a SuggestionField input.
    // Locate by the placeholder text.
    const nameInputBefore = page.locator('input[placeholder="Coffee name"]')
    await expect(nameInputBefore).toBeVisible({ timeout: 5_000 })

    // Pick bean Y.
    const beanSelect = page.locator('.recipe-editor__column select').first()
    await beanSelect.selectOption('bean-test-Y')
    await page.waitForTimeout(500)

    // After link: the input is replaced by .recipe-editor__readonly span.
    await expect(page.locator('input[placeholder="Coffee name"]')).toHaveCount(0)
    await expect(page.locator('.recipe-editor__readonly').filter({ hasText: 'Y-Bean' })).toBeVisible()

    // Locate the "Clear link" or equivalent. RecipeEditorPage uses BeanLinkBadge
    // (the new shared component) — its clear button has class .bean-link-badge__clear.
    // If no badge is rendered (depends on Task 3 keeping the existing in-page UI),
    // skip this assertion gracefully.
    const clearBtn = page.locator('.bean-link-badge__clear')
    if (await clearBtn.count() > 0) {
      await clearBtn.click()
      await page.waitForTimeout(300)
      // Free-edit returns: input is back.
      await expect(page.locator('input[placeholder="Coffee name"]')).toBeVisible({ timeout: 2_000 })
    }
  })
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- tests/e2e/bean-batch-integrity.spec.js`
Expected: 2 passed.

The clear-link assertion is gated on the badge being rendered. RecipeEditorPage post-Task-3 may or may not render the badge — Task 3 doesn't strictly require it (the existing in-page UI handles the link-clear via setting `selectedBeanId = ''` on the dropdown). If you want the badge in RecipeEditorPage, add a `<BeanLinkBadge>` next to the bean picker in Task 3. Recommended: yes, for consistency with PostShotReviewPage.

If Task 3 was done without adding the badge to RecipeEditorPage, the inner assertion silently no-ops (count is 0). The test still demonstrates the read-only behavior, which is the primary objective.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bean-batch-integrity.spec.js
git commit -m "test(e2e): linked-mode bean text fields are read-only"
```

---

## Task 8: E2E test — Shot edit picker save persists beanBatchId

**Files:**
- Modify: `tests/e2e/bean-batch-integrity.spec.js`

- [ ] **Step 1: Append the test**

```js
  test('shot edit page: changing bean+batch persists workflow.context.beanBatchId', async ({ page, request }) => {
    test.setTimeout(60_000)

    // Seed two beans, each with one batch.
    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-A', beanName: 'A-Bean', beanRoaster: 'A-Roaster',
              batchId: 'batch-A1', roastDate: '2026-04-01' },
    })
    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-B', beanName: 'B-Bean', beanRoaster: 'B-Roaster',
              batchId: 'batch-B1', roastDate: '2026-04-15' },
    })

    // Inject a shot record initially linked to batch-A1.
    const shotId = 'shot-bean-edit-1'
    await request.post(`${BASE_URL}/api/v1/test/inject-shot`, {
      data: {
        shotId,
        context: {
          beanBatchId: 'batch-A1',
          coffeeName: 'A-Bean',
          coffeeRoaster: 'A-Roaster',
        },
      },
    })

    await page.goto(`/#/shot-review/${shotId}`)
    await page.waitForSelector('.review-page', { timeout: 10_000 })

    // Wait for hydration to complete (linked-mode badge / Bean select shows A-Bean).
    await expect(page.locator('select').filter({ hasText: 'A-Bean' }).first())
      .toHaveValue('bean-A', { timeout: 5_000 })

    // Switch to bean B via the bean selector. Take the FIRST <select> inside .review-page
    // that has a 'Manual entry...' option (the Bean picker).
    const beanPicker = page.locator('.review-page select').filter({
      hasText: 'Manual entry...'
    }).first()
    await beanPicker.selectOption('bean-B')

    // Mark dirty; click save.
    await page.waitForTimeout(500)
    const saveBtn = page.locator('.review-page__save-btn')
    await expect(saveBtn).toBeEnabled({ timeout: 2_000 })
    await saveBtn.click()
    await page.waitForTimeout(1_000)

    // Verify mock-server now has updated workflow.context.beanBatchId.
    const res = await request.get(`${BASE_URL}/api/v1/test/get-shot/${shotId}`)
    const shot = await res.json()
    expect(shot.workflow?.context?.beanBatchId).toBe('batch-B1')
  })
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- tests/e2e/bean-batch-integrity.spec.js`
Expected: 3 passed.

If selectors don't resolve, try fallbacks:
- `.review-page__save-btn` is the standard save button class (referenced in `tests/e2e/user-workflow.spec.js`). Should exist.
- The Bean select dropdown depends on Task 4's exact template wording — adjust the `.filter({ hasText: 'Manual entry...' })` text if Task 4 used a different option label.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bean-batch-integrity.spec.js
git commit -m "test(e2e): shot edit page persists beanBatchId on save"
```

---

## Task 9: E2E test — Hydration with drifted text

**Files:**
- Modify: `tests/e2e/bean-batch-integrity.spec.js`

- [ ] **Step 1: Append the test**

```js
  test('hydration: drifted ctx text does not block linked-bean resolution', async ({ page, request }) => {
    test.setTimeout(45_000)

    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-real', beanName: 'Real-Bean', beanRoaster: 'Real-Roaster',
              batchId: 'batch-real-1', roastDate: '2026-04-10', roastLevel: 'Medium' },
    })

    // Seed shot with INTENTIONALLY DRIFTED text + a real beanBatchId.
    const shotId = 'shot-drifted-text-1'
    await request.post(`${BASE_URL}/api/v1/test/inject-shot`, {
      data: {
        shotId,
        context: {
          beanBatchId: 'batch-real-1',
          coffeeName: 'WRONG-NAME',
          coffeeRoaster: 'WRONG-ROASTER',
        },
      },
    })

    await page.goto(`/#/shot-review/${shotId}`)
    await page.waitForSelector('.review-page', { timeout: 10_000 })

    // Hydration must use batch-id, NOT name-match. The bean picker should
    // resolve to bean-real, and the visible name/roaster must be the
    // authoritative bean record values, not 'WRONG-NAME'/'WRONG-ROASTER'.
    await expect(page.locator('.review-page__readonly').filter({ hasText: 'Real-Bean' }))
      .toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.review-page__readonly').filter({ hasText: 'WRONG-NAME' }))
      .toHaveCount(0)
  })
})
```

(Note the closing `})` for the `describe` block.)

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- tests/e2e/bean-batch-integrity.spec.js`
Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bean-batch-integrity.spec.js
git commit -m "test(e2e): drifted ctx text does not block bean hydration"
```

---

## Task 10: Final verification + version bump + tag

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: 97/97 passing (93 prior + 4 new).

If any pre-existing tests fail, the most likely culprits are:
- `tests/e2e/recipe-editor.spec.js` — if Task 3 changed selectors. Most existing tests target `data-testid="recipe-doseIn"` and shouldn't break.
- `tests/e2e/user-workflow.spec.js` — uses `/shot-review/` and `.review-page__textarea` / `.review-page__save-btn`. Task 4's template change shouldn't affect these.

If a flake recurs (e.g. the `user-workflow.spec.js` EspressoPage flake), re-run that test in isolation to confirm.

- [ ] **Step 2: Bump patch version**

In `package.json`, change `"version": "0.5.13"` to `"version": "0.5.14"`.

- [ ] **Step 3: Commit the bump**

```bash
git add package.json
git commit -m "chore: bump version to 0.5.14"
```

Use the standard Co-Authored-By footer.

- [ ] **Step 4: Tag and push (subject to user authorization)**

The user has previously authorized push for v0.5.12 and v0.5.13 explicitly. For v0.5.14, ask before pushing the tag — the bundled feature is larger and a real DE1 smoke test is recommended before tagging.

If user authorizes:

```bash
git tag v0.5.14
git push origin main
git push origin v0.5.14
```

If user wants to hold:

```bash
git push origin main
```

- [ ] **Step 5: Update the Obsidian feedback list (user owns this)**

Notify the user that #41 is shipped. The user will mark the item done in `Professional/Decent/Passione.md` and append session notes for 2026-04-28 (or the actual ship date).

---

## Self-Review Checklist

- **Spec coverage:** ✅
  - **A. Investigation / root cause** → documented in spec; the implementation in Task 3 (hydration fix) and Task 4 (save-path fix) addresses both root causes.
  - **B. Validation/integrity fix** → Tasks 1, 3 (mount hydration + linked-mode adoption in RecipeEditor), 4 (linked-mode in PostShotReview).
  - **C. Shot edit picker** → Task 4 (PostShotReviewPage UI + save path).
  - **D. Tests** → Tasks 6 (recipe live-apply), 7 (linked-mode read-only), 8 (shot picker save), 9 (drifted hydration).
  - Mock-server hooks → Task 5.
  - Version bump → Task 10.
- **Placeholder scan:** No "TBD" / "TODO" / "implement later". The Task 5 reset endpoint deletes by `bean-injected-` / `batch-injected-` prefix — tests in Tasks 6-9 use bean ids `bean-test-X`, `bean-test-Y`, `bean-A`, `bean-B`, `bean-real` (which do NOT match the prefix). This is intentional: those tests reset state via the dedicated `reset-bean-test-state` endpoint which deletes the explicitly-tracked `injectedShotIdsForBeanTests` AND prefix-cleans injected beans. Bean ids without the prefix persist across tests; tests handle this via idempotent injection (Task 5 Step 2's "Replace any existing entry with the same id" logic). Confirmed safe.
- **Type consistency:** `selectedBeanId` / `selectedBatchId` / `linkedBean` / `linkedBatch` / `isLinked` / `enterLinked` / `clearLink` / `hydrateFromContext` — all consistent across composable, both pages, and tests.
- **Test endpoint names:** `/api/v1/test/inject-bean-with-batch`, `/api/v1/test/inject-shot`, `/api/v1/test/get-shot/:id`, `/api/v1/test/reset-bean-test-state` — defined in Task 5, used in Tasks 6-9.
- **Throttle / timing:** None of these tests rely on the 30s `useDataRefresh` throttle. They use 300-800ms waits for the recipe live-apply 300ms debounce.
