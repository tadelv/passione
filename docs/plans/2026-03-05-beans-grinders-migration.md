# Beans, Grinders & Workflow Context Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from legacy workflow fields to `context`-based model, add beans/grinders CRUD APIs and composables, add entity pickers to workflow editor and shot pages, add Settings tabs for bean/grinder management.

**Architecture:** New REST functions wrap the beans/batches/grinders endpoints. New `useBeans` and `useGrinders` composables manage entity state at app level. `useWorkflow` adds `context` with computed compat accessors for legacy fields. All consumers migrate from `doseData`/`grinderData`/`coffeeData` to `context.*`. BeanInfoPage gets inline entity pickers. Shot pages get editable entity pickers and enrichment from entity IDs.

**Tech Stack:** Vue 3 Composition API, Vite, existing `sendCommand` REST wrapper

**Design doc:** `docs/plans/2026-03-05-beans-grinders-migration-design.md`

---

### Task 1: REST API Functions for Beans, Batches, Grinders

**Files:**
- Modify: `src/api/rest.js` (append after line 367)

**Step 1: Add beans API functions**

Add after the Plugins section in `rest.js`:

```javascript
// ---------------------------------------------------------------------------
// Beans
// ---------------------------------------------------------------------------

export function getBeans(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return sendCommand(`/api/v1/beans${qs ? '?' + qs : ''}`)
}

export function getBean(id) {
  return sendCommand(`/api/v1/beans/${encodeURIComponent(id)}`)
}

export function createBean(data) {
  return sendCommand('/api/v1/beans', 'POST', data)
}

export function updateBean(id, data) {
  return sendCommand(`/api/v1/beans/${encodeURIComponent(id)}`, 'PUT', data)
}

export function deleteBean(id) {
  return sendCommand(`/api/v1/beans/${encodeURIComponent(id)}`, 'DELETE')
}

// ---------------------------------------------------------------------------
// Bean Batches
// ---------------------------------------------------------------------------

export function getBeanBatches(beanId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return sendCommand(`/api/v1/beans/${encodeURIComponent(beanId)}/batches${qs ? '?' + qs : ''}`)
}

export function createBeanBatch(beanId, data) {
  return sendCommand(`/api/v1/beans/${encodeURIComponent(beanId)}/batches`, 'POST', data)
}

export function getBeanBatch(id) {
  return sendCommand(`/api/v1/bean-batches/${encodeURIComponent(id)}`)
}

export function updateBeanBatch(id, data) {
  return sendCommand(`/api/v1/bean-batches/${encodeURIComponent(id)}`, 'PUT', data)
}

export function deleteBeanBatch(id) {
  return sendCommand(`/api/v1/bean-batches/${encodeURIComponent(id)}`, 'DELETE')
}

// ---------------------------------------------------------------------------
// Grinders
// ---------------------------------------------------------------------------

export function getGrinders(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return sendCommand(`/api/v1/grinders${qs ? '?' + qs : ''}`)
}

export function getGrinder(id) {
  return sendCommand(`/api/v1/grinders/${encodeURIComponent(id)}`)
}

export function createGrinder(data) {
  return sendCommand('/api/v1/grinders', 'POST', data)
}

export function updateGrinder(id, data) {
  return sendCommand(`/api/v1/grinders/${encodeURIComponent(id)}`, 'PUT', data)
}

export function deleteGrinder(id) {
  return sendCommand(`/api/v1/grinders/${encodeURIComponent(id)}`, 'DELETE')
}
```

**Step 2: Verify the dev server still starts**

Run: `npm run dev` — confirm no syntax errors.

**Step 3: Commit**

```bash
git add src/api/rest.js
git commit -m "feat: add REST API functions for beans, batches, and grinders"
```

---

### Task 2: useWorkflow Composable — Migrate to Context

**Files:**
- Modify: `src/composables/useWorkflow.js`

**Step 1: Rewrite useWorkflow to use context**

Replace the full file. Key changes:
- Add `context` to reactive workflow (with all WorkflowContext fields)
- `applyData()` reads `context` from server response, falls back to legacy fields
- Add computed compat accessors: `doseData`, `grinderData`, `coffeeData` that read from `context`
- These compat accessors let consumers work during incremental migration

```javascript
import { ref, reactive, computed, onMounted } from 'vue'
import { getWorkflow as fetchWorkflow, updateWorkflow as putWorkflow } from '../api/rest'

export function useWorkflow() {
  const loading = ref(false)
  const error = ref(null)

  const workflow = reactive({
    id: null,
    name: null,
    description: null,
    profile: null,
    context: {
      targetDoseWeight: null,
      targetYield: null,
      grinderId: null,
      grinderModel: null,
      grinderSetting: null,
      beanBatchId: null,
      coffeeName: null,
      coffeeRoaster: null,
      finalBeverageType: null,
      baristaName: null,
      drinkerName: null,
      extras: null,
    },
    steamSettings: null,
    hotWaterData: null,
    rinseData: null,
  })

  // Compat accessors — consumers can still read workflow.doseData etc.
  // These are non-reactive plain getters on the reactive object.
  Object.defineProperty(workflow, 'doseData', {
    get() {
      return {
        doseIn: workflow.context.targetDoseWeight,
        dose: workflow.context.targetDoseWeight,
        doseOut: workflow.context.targetYield,
        targetWeight: workflow.context.targetYield,
      }
    },
    enumerable: false,
  })
  Object.defineProperty(workflow, 'grinderData', {
    get() {
      return {
        model: workflow.context.grinderModel,
        grinder: workflow.context.grinderModel,
        name: workflow.context.grinderModel,
        manufacturer: null,
        setting: workflow.context.grinderSetting,
        grindSetting: workflow.context.grinderSetting,
      }
    },
    enumerable: false,
  })
  Object.defineProperty(workflow, 'coffeeData', {
    get() {
      return {
        name: workflow.context.coffeeName,
        roaster: workflow.context.coffeeRoaster,
      }
    },
    enumerable: false,
  })

  function applyData(data) {
    if (!data) return
    workflow.id = data.id ?? workflow.id
    workflow.name = data.name ?? workflow.name
    workflow.description = data.description ?? workflow.description
    workflow.profile = data.profile ?? workflow.profile
    workflow.steamSettings = data.steamSettings ?? workflow.steamSettings
    workflow.hotWaterData = data.hotWaterData ?? workflow.hotWaterData
    workflow.rinseData = data.rinseData ?? workflow.rinseData

    // Read context first, backfill from legacy
    const ctx = data.context
    const dd = data.doseData
    const gd = data.grinderData
    const cd = data.coffeeData
    if (ctx) {
      Object.assign(workflow.context, ctx)
    }
    // Backfill from legacy if context fields are still null
    if (dd) {
      if (workflow.context.targetDoseWeight == null) workflow.context.targetDoseWeight = dd.doseIn ?? dd.dose ?? null
      if (workflow.context.targetYield == null) workflow.context.targetYield = dd.doseOut ?? dd.targetWeight ?? null
    }
    if (gd) {
      if (workflow.context.grinderModel == null) workflow.context.grinderModel = gd.model ?? gd.grinder ?? gd.name ?? null
      if (workflow.context.grinderSetting == null) workflow.context.grinderSetting = gd.setting ?? gd.grindSetting ?? null
    }
    if (cd) {
      if (workflow.context.coffeeName == null) workflow.context.coffeeName = cd.name ?? null
      if (workflow.context.coffeeRoaster == null) workflow.context.coffeeRoaster = cd.roaster ?? null
    }
  }

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const data = await fetchWorkflow()
      applyData(data)
    } catch (e) {
      error.value = e.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function updateWorkflow(partial) {
    loading.value = true
    error.value = null
    try {
      const data = await putWorkflow(partial)
      applyData(data)
      return data
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  onMounted(refresh)

  return {
    workflow,
    loading,
    error,
    refresh,
    updateWorkflow,
  }
}
```

**Step 2: Verify dev server starts, no runtime errors on load**

**Step 3: Commit**

```bash
git add src/composables/useWorkflow.js
git commit -m "feat: migrate useWorkflow to context with legacy compat accessors"
```

---

### Task 3: useBeans Composable

**Files:**
- Create: `src/composables/useBeans.js`

**Step 1: Create the composable**

```javascript
import { ref, onMounted } from 'vue'
import {
  getBeans as fetchBeans,
  getBean as fetchBean,
  createBean as postBean,
  updateBean as putBean,
  deleteBean as removeBean,
  getBeanBatches as fetchBatches,
  createBeanBatch as postBatch,
  getBeanBatch as fetchBatch,
  updateBeanBatch as putBatch,
  deleteBeanBatch as removeBatch,
} from '../api/rest'

export function useBeans() {
  const beans = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Cache batches per bean and individual entities for enrichment
  const batchCache = new Map()
  const entityCache = new Map()

  async function refresh(params = {}) {
    loading.value = true
    error.value = null
    try {
      beans.value = await fetchBeans(params) ?? []
    } catch (e) {
      error.value = e.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function getById(id) {
    if (entityCache.has(id)) return entityCache.get(id)
    try {
      const bean = await fetchBean(id)
      if (bean) entityCache.set(id, bean)
      return bean
    } catch {
      return null
    }
  }

  async function create(data) {
    const bean = await postBean(data)
    beans.value = [...beans.value, bean]
    return bean
  }

  async function update(id, data) {
    const updated = await putBean(id, data)
    beans.value = beans.value.map(b => b.id === id ? updated : b)
    entityCache.set(id, updated)
    return updated
  }

  async function remove(id) {
    await removeBean(id)
    beans.value = beans.value.filter(b => b.id !== id)
    entityCache.delete(id)
    batchCache.delete(id)
  }

  async function getBatches(beanId, params = {}) {
    const cacheKey = `${beanId}:${JSON.stringify(params)}`
    if (batchCache.has(cacheKey)) return batchCache.get(cacheKey)
    const batches = await fetchBatches(beanId, params) ?? []
    batchCache.set(cacheKey, batches)
    return batches
  }

  async function getBatch(id) {
    return fetchBatch(id)
  }

  async function createBatch(beanId, data) {
    const batch = await postBatch(beanId, data)
    // Invalidate cache for this bean
    for (const key of batchCache.keys()) {
      if (key.startsWith(beanId)) batchCache.delete(key)
    }
    return batch
  }

  async function updateBatch(id, data) {
    return putBatch(id, data)
  }

  async function removeBatch(id) {
    return removeBatch(id)
  }

  /**
   * Returns the most recent non-frozen, non-archived batch for a bean.
   */
  async function activeBatchForBean(beanId) {
    const batches = await getBatches(beanId)
    const active = batches
      .filter(b => !b.frozen && !b.archived)
      .sort((a, b) => new Date(b.roastDate || b.createdAt) - new Date(a.roastDate || a.createdAt))
    return active[0] ?? null
  }

  onMounted(refresh)

  return {
    beans,
    loading,
    error,
    refresh,
    getById,
    create,
    update,
    remove,
    getBatches,
    getBatch,
    createBatch,
    updateBatch,
    removeBatch,
    activeBatchForBean,
  }
}
```

**Step 2: Commit**

```bash
git add src/composables/useBeans.js
git commit -m "feat: add useBeans composable with batch management and caching"
```

---

### Task 4: useGrinders Composable

**Files:**
- Create: `src/composables/useGrinders.js`

**Step 1: Create the composable**

```javascript
import { ref, onMounted } from 'vue'
import {
  getGrinders as fetchGrinders,
  getGrinder as fetchGrinder,
  createGrinder as postGrinder,
  updateGrinder as putGrinder,
  deleteGrinder as removeGrinder,
} from '../api/rest'

export function useGrinders() {
  const grinders = ref([])
  const loading = ref(false)
  const error = ref(null)

  const entityCache = new Map()

  async function refresh(params = {}) {
    loading.value = true
    error.value = null
    try {
      grinders.value = await fetchGrinders(params) ?? []
    } catch (e) {
      error.value = e.message || String(e)
    } finally {
      loading.value = false
    }
  }

  async function getById(id) {
    if (entityCache.has(id)) return entityCache.get(id)
    try {
      const grinder = await fetchGrinder(id)
      if (grinder) entityCache.set(id, grinder)
      return grinder
    } catch {
      return null
    }
  }

  async function create(data) {
    const grinder = await postGrinder(data)
    grinders.value = [...grinders.value, grinder]
    return grinder
  }

  async function update(id, data) {
    const updated = await putGrinder(id, data)
    grinders.value = grinders.value.map(g => g.id === id ? updated : g)
    entityCache.set(id, updated)
    return updated
  }

  async function remove(id) {
    await removeGrinder(id)
    grinders.value = grinders.value.filter(g => g.id !== id)
    entityCache.delete(id)
  }

  onMounted(refresh)

  return {
    grinders,
    loading,
    error,
    refresh,
    getById,
    create,
    update,
    remove,
  }
}
```

**Step 2: Commit**

```bash
git add src/composables/useGrinders.js
git commit -m "feat: add useGrinders composable with caching"
```

---

### Task 5: App.vue — Provide New Composables + Migrate targetWeight

**Files:**
- Modify: `src/App.vue`

**Step 1: Import and instantiate new composables**

After the existing composable imports (around line 10), add:
```javascript
import { useBeans } from './composables/useBeans'
import { useGrinders } from './composables/useGrinders'
```

After the existing composable instantiation block (around line 43), add:
```javascript
const { beans, ...beansApi } = useBeans()
const { grinders, ...grindersApi } = useGrinders()
```

**Step 2: Provide the new composables**

After the existing provide calls (around line 82), add:
```javascript
provide('beans', beans)
provide('beansApi', beansApi)
provide('grinders', grinders)
provide('grindersApi', grindersApi)
```

**Step 3: Migrate targetWeight to context**

Change line 57 from:
```javascript
provide('targetWeight', computed(() => workflow.doseData?.doseOut ?? 36))
```
to:
```javascript
provide('targetWeight', computed(() => workflow.context?.targetYield ?? 36))
```

Change line 207 from:
```javascript
lastTargetWeight = workflow.doseData?.doseOut ?? 36
```
to:
```javascript
lastTargetWeight = workflow.context?.targetYield ?? 36
```

**Step 4: Verify dev server loads without errors**

**Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat: provide beans/grinders composables, migrate targetWeight to context"
```

---

### Task 6: Migrate useVolumeMode.js

**Files:**
- Modify: `src/composables/useVolumeMode.js`

**Step 1: Update legacy field references**

Change line 39 from:
```javascript
return workflow.doseData?.doseOut ?? workflow.profile?.target_weight ?? 36
```
to:
```javascript
return workflow.context?.targetYield ?? workflow.profile?.target_weight ?? 36
```

Change line 79 from:
```javascript
const dose = workflow.doseData?.doseIn
```
to:
```javascript
const dose = workflow.context?.targetDoseWeight
```

**Step 2: Commit**

```bash
git add src/composables/useVolumeMode.js
git commit -m "refactor: migrate useVolumeMode to workflow context"
```

---

### Task 7: Migrate IdlePage.vue

**Files:**
- Modify: `src/pages/IdlePage.vue`

**Step 1: Update shotPlanLines computed (lines 28-62)**

Replace the legacy field reads (lines 31-59) with context reads:

```javascript
// Replace lines 31-33:
const ctx = workflow.context

// Replace lines 35-40 (coffee section):
if (ctx) {
  const coffeeName = ctx.coffeeName
  const roaster = ctx.coffeeRoaster
  if (coffeeName || roaster) {
    lines.push([roaster, coffeeName].filter(Boolean).join(' — '))
  }
}

// Replace lines 43-50 (dose section):
if (ctx) {
  const doseIn = ctx.targetDoseWeight
  const doseOut = ctx.targetYield
  if (doseIn || doseOut) {
    const parts = []
    if (doseIn) parts.push(`${doseIn}g in`)
    if (doseOut) parts.push(`${doseOut}g out`)
    lines.push(parts.join(' → '))
  }
}

// Replace lines 53-59 (grinder section):
if (ctx) {
  const grinderName = ctx.grinderModel
  const grinderSetting = ctx.grinderSetting
  if (grinderName || grinderSetting) {
    const parts = [grinderName, grinderSetting != null ? `@ ${grinderSetting}` : null].filter(Boolean)
    lines.push(parts.join(' '))
  }
}
```

**Step 2: Update combo apply logic (lines 93-106)**

Replace the legacy workflow update (lines 96, 100, 104) with context:

```javascript
// Replace lines 93-106 with:
update.context = {
  coffeeName: combo.coffeeName || null,
  coffeeRoaster: combo.roaster || null,
  targetDoseWeight: combo.doseIn ?? undefined,
  targetYield: combo.doseOut ?? undefined,
  grinderModel: combo.grinder || null,
  grinderSetting: combo.grinderSetting ?? null,
}
```

**Step 3: Commit**

```bash
git add src/pages/IdlePage.vue
git commit -m "refactor: migrate IdlePage to workflow context"
```

---

### Task 8: Migrate EspressoPage.vue

**Files:**
- Modify: `src/pages/EspressoPage.vue`

**Step 1: Update brew dialog computed props (lines 51-66)**

Replace with context reads:

```javascript
const brewDoseIn = computed(() => workflow?.context?.targetDoseWeight ?? 18)
const brewDoseOut = computed(() => workflow?.context?.targetYield ?? 36)
const brewGrinderName = computed(() => workflow?.context?.grinderModel ?? '')
const brewGrindSetting = computed(() => {
  const s = workflow?.context?.grinderSetting
  return s != null ? Number(s) || 0 : 0
})
```

**Step 2: Update all workflow writes to use context**

Replace `doseData`/`grinderData` writes (lines 69-85, 108-115, 140-150, 161-175) with context:

For dose updates (onBrewDialogStart, line 74):
```javascript
context: {
  ...workflow?.context,
  targetDoseWeight: doseIn,
  targetYield: doseOut,
}
```

For grinder updates (onBrewDialogUpdateGrinder, line 164):
```javascript
context: {
  ...workflow?.context,
  grinderModel: grinder.name,
  grinderSetting: String(grinder.setting),
}
```

For dose from last shot (around line 140):
```javascript
context: {
  ...workflow?.context,
  targetDoseWeight: lastShot.doseIn ?? lastShot.dose ?? undefined,
  targetYield: lastShot.doseOut ?? lastShot.targetWeight ?? undefined,
}
```

**Step 3: Update BrewDialog show-extended-fields prop (line 280)**

Change from:
```html
:show-extended-fields="!!workflow?.grinderData"
```
to:
```html
:show-extended-fields="!!workflow?.context?.grinderModel"
```

**Step 4: Commit**

```bash
git add src/pages/EspressoPage.vue
git commit -m "refactor: migrate EspressoPage to workflow context"
```

---

### Task 9: Create normalizeShot Helper

Shot normalization is duplicated across ShotHistoryPage, ShotDetailPage, PostShotReviewPage, and LayoutWidget. Extract to a shared helper that reads `context` first, falls back to legacy.

**Files:**
- Create: `src/composables/useShotNormalize.js`

**Step 1: Create the helper**

```javascript
/**
 * Normalize a shot record to flat fields, reading context first then legacy.
 * Used by shot history, detail, review, and layout widgets.
 */
export function normalizeShot(shot) {
  if (!shot) return shot
  const result = { ...shot }
  const w = shot.workflow ?? {}
  const ctx = w.context ?? {}
  const dd = w.doseData ?? {}
  const coffee = w.coffeeData ?? {}
  const grinder = w.grinderData ?? {}
  const meta = shot.metadata ?? {}

  // Dose — context first, then legacy doseData, then shot root
  if (result.doseIn == null) result.doseIn = ctx.targetDoseWeight ?? dd.doseIn ?? dd.dose ?? null
  if (result.doseOut == null) result.doseOut = ctx.targetYield ?? dd.doseOut ?? dd.targetWeight ?? null

  // Coffee — context first, then legacy coffeeData, then metadata
  if (result.coffeeName == null) result.coffeeName = ctx.coffeeName ?? coffee.name ?? meta.beanType ?? null
  if (result.coffeeRoaster == null) result.coffeeRoaster = ctx.coffeeRoaster ?? coffee.roaster ?? meta.roaster ?? null

  // Grinder — context first, then legacy grinderData, then metadata
  if (result.grinderModel == null) result.grinderModel = ctx.grinderModel ?? grinder.model ?? [grinder.manufacturer, grinder.grinder ?? grinder.name].filter(Boolean).join(' ') || null
  if (result.grinderSetting == null) result.grinderSetting = ctx.grinderSetting ?? grinder.setting ?? grinder.grindSetting ?? meta.grinderSetting ?? null

  // Entity IDs (for enrichment)
  result.grinderId = ctx.grinderId ?? null
  result.beanBatchId = ctx.beanBatchId ?? null

  // Metadata fields
  if (result.rating == null) result.rating = meta.rating ?? null

  return result
}
```

**Step 2: Commit**

```bash
git add src/composables/useShotNormalize.js
git commit -m "feat: add shared normalizeShot helper reading context first"
```

---

### Task 10: Migrate ShotHistoryPage.vue

**Files:**
- Modify: `src/pages/ShotHistoryPage.vue`

**Step 1: Import normalizeShot**

Add at top of script:
```javascript
import { normalizeShot } from '../composables/useShotNormalize'
```

**Step 2: Replace inline normalizeShot function (lines 54-99)**

Replace the existing `normalizeShot()` function body with a call to the shared helper. Keep any page-specific post-processing (search fields etc.) after the call.

**Step 3: Update search suggestion building (around lines 70-91)**

Update to use the normalized flat fields (`s.coffeeName`, `s.coffeeRoaster`, `s.grinderModel`) instead of reaching into `workflow.coffeeData`.

**Step 4: Commit**

```bash
git add src/pages/ShotHistoryPage.vue
git commit -m "refactor: migrate ShotHistoryPage to normalizeShot helper"
```

---

### Task 11: Migrate ShotDetailPage.vue

**Files:**
- Modify: `src/pages/ShotDetailPage.vue`

**Step 1: Import normalizeShot and inject beans/grinders APIs**

```javascript
import { normalizeShot } from '../composables/useShotNormalize'
const beansApi = inject('beansApi', null)
const grindersApi = inject('grindersApi', null)
```

**Step 2: Replace inline normalization (lines 53-89) with shared helper**

**Step 3: Add entity enrichment**

After normalization, if `shot.grinderId` or `shot.beanBatchId` exist, fetch entity details:

```javascript
const enrichedBean = ref(null)
const enrichedGrinder = ref(null)

async function enrichShot(shot) {
  if (shot.beanBatchId && beansApi) {
    beansApi.getBatch(shot.beanBatchId).then(batch => {
      if (batch) {
        // Find parent bean for extra details
        const beanId = batch.beanId
        if (beanId) beansApi.getById(beanId).then(b => { if (b) enrichedBean.value = b })
      }
    }).catch(() => {})
  }
  if (shot.grinderId && grindersApi) {
    grindersApi.getById(shot.grinderId).then(g => { if (g) enrichedGrinder.value = g }).catch(() => {})
  }
}
```

Show enriched data in the template (e.g., bean country/processing, grinder burrs) with fallback to flat `coffeeName`/`grinderModel` strings.

**Step 4: Add entity pickers for editing**

Inject beans/grinders lists. Add bean picker (dropdown), batch selector, grinder picker with setting-type-aware input. Wire save to `updateShot()` writing `workflow.context`.

**Step 5: Commit**

```bash
git add src/pages/ShotDetailPage.vue
git commit -m "feat: migrate ShotDetailPage to context with enrichment and entity pickers"
```

---

### Task 12: Migrate PostShotReviewPage.vue

**Files:**
- Modify: `src/pages/PostShotReviewPage.vue`

**Step 1: Import normalizeShot, inject beans/grinders**

```javascript
import { normalizeShot } from '../composables/useShotNormalize'
const beans = inject('beans', ref([]))
const beansApi = inject('beansApi', null)
const grinders = inject('grinders', ref([]))
const grindersApi = inject('grindersApi', null)
```

**Step 2: Replace populateFromShot (lines 113-134) to use normalizeShot**

**Step 3: Add entity enrichment (same pattern as Task 11)**

**Step 4: Update save logic (lines 199-224)**

Replace legacy field writes with context:

```javascript
await updateShot(shotId.value, {
  shotNotes: notes.value || undefined,
  metadata: { rating, barista, beanBrand, roastDate, roastLevel, beverageType, tds },
  workflow: {
    context: {
      targetDoseWeight: doseIn.value || undefined,
      targetYield: doseOut.value || undefined,
      coffeeName: beanType.value || undefined,
      coffeeRoaster: roaster.value || undefined,
      grinderModel: grinderModel.value || undefined,
      grinderSetting: grinderSetting.value || undefined,
      grinderId: selectedGrinderId.value || undefined,
      beanBatchId: selectedBatchId.value || undefined,
    },
  },
})
```

**Step 5: Add entity pickers (same pattern as Task 11)**

**Step 6: Commit**

```bash
git add src/pages/PostShotReviewPage.vue
git commit -m "feat: migrate PostShotReviewPage to context with entity pickers"
```

---

### Task 13: Migrate LayoutWidget.vue

**Files:**
- Modify: `src/components/LayoutWidget.vue`

**Step 1: Import normalizeShot**

**Step 2: Replace lines 144-161 with normalizeShot call**

Use `normalizeShot(shot)` then read flat fields: `s.coffeeName`, `s.coffeeRoaster`, `s.grinderModel`, `s.grinderSetting`, `s.doseIn`, `s.doseOut`.

**Step 3: Commit**

```bash
git add src/components/LayoutWidget.vue
git commit -m "refactor: migrate LayoutWidget to normalizeShot helper"
```

---

### Task 14: GrinderSettingInput Component

Create a reusable component for grinder setting input that adapts to setting type. Used in BeanInfoPage, ShotDetailPage, PostShotReviewPage.

**Files:**
- Create: `src/components/GrinderSettingInput.vue`

**Step 1: Create the component**

Props:
- `modelValue` (String/Number) — current setting value
- `grinder` (Object, optional) — managed grinder entity with `settingType`, `settingSmallStep`, `settingBigStep`, `settingValues`

Behavior:
- If `grinder?.settingType === 'preset'`: render a `<select>` with `grinder.settingValues`
- If `grinder?.settingType === 'numeric'`: render `<ValueInput>` with `step=grinder.settingSmallStep` (default 0.5)
- If no grinder entity: render plain `<input type="text">`

Emits `update:modelValue`.

**Step 2: Commit**

```bash
git add src/components/GrinderSettingInput.vue
git commit -m "feat: add GrinderSettingInput adapting to grinder setting type"
```

---

### Task 15: BeanInfoPage.vue — Full Rewrite with Entity Pickers

**Files:**
- Modify: `src/pages/BeanInfoPage.vue`

This is the largest task. The page keeps its existing structure (preset pills, columns, operation settings) but replaces free-text coffee/grinder fields with entity pickers.

**Step 1: Add imports and inject beans/grinders**

```javascript
import GrinderSettingInput from '../components/GrinderSettingInput.vue'

const beans = inject('beans', ref([]))
const beansApi = inject('beansApi', null)
const grinders = inject('grinders', ref([]))
const grindersApi = inject('grindersApi', null)
```

**Step 2: Add entity selection state**

```javascript
const selectedBeanId = ref(null)
const selectedBatchId = ref(null)
const selectedGrinderId = ref(null)
const selectedBatch = ref(null)
const selectedGrinder = computed(() => grinders.value.find(g => g.id === selectedGrinderId.value) ?? null)
const batchesForBean = ref([])
```

**Step 3: Replace coffee column with bean picker**

- `<select>` bound to `selectedBeanId`, listing `beans.value` (show "roaster — name")
- Option for "None (manual)" at top
- On bean change: auto-select active batch, load batches list
- Show batch info inline (roast date, days since roast, weight remaining)
- "Switch batch" link if multiple batches
- "+" button calls inline create dialog (roaster + name fields)
- "Manage..." link: `router.push('/settings/beans')`
- When no bean selected: show free-text `coffeeName` and `roaster` inputs (fallback)

**Step 4: Replace grinder column with grinder picker**

- `<select>` bound to `selectedGrinderId`, listing `grinders.value` (show model)
- Option for "None (manual)" at top
- Replace grinder setting `<input>` with `<GrinderSettingInput>` passing `selectedGrinder`
- "+" button for inline create (model name)
- "Manage..." link: `router.push('/settings/grinders')`
- Free-text fallback when no grinder selected

**Step 5: Update saveToWorkflow to write context**

```javascript
async function saveToWorkflow() {
  const ctx = {
    targetDoseWeight: doseIn.value,
    targetYield: doseOut.value,
    coffeeName: coffeeName.value || null,
    coffeeRoaster: roaster.value || null,
    grinderModel: selectedGrinder.value?.model ?? grinder.value || null,
    grinderSetting: grinderSetting.value ?? null,
  }
  if (selectedGrinderId.value) ctx.grinderId = selectedGrinderId.value
  if (selectedBatchId.value) ctx.beanBatchId = selectedBatchId.value

  const workflowUpdate = { context: ctx }
  // Operation settings unchanged...
  workflowUpdate.steamSettings = includeSteam.value ? ... : ...
  workflowUpdate.rinseData = includeFlush.value ? ... : ...
  workflowUpdate.hotWaterData = includeHotWater.value ? ... : ...

  await updateWorkflow(workflowUpdate)
}
```

**Step 6: Update comboValues and loadFromPreset**

Combos now store entity IDs (`grinderId`, `beanBatchId`) alongside display strings. `loadFromPreset` restores entity selections.

**Step 7: Commit**

```bash
git add src/pages/BeanInfoPage.vue
git commit -m "feat: rewrite BeanInfoPage with entity pickers and context writes"
```

---

### Task 16: BeansTab Settings Component

**Files:**
- Create: `src/components/settings/BeansTab.vue`

**Step 1: Create the component**

Structure:
- Inject `beans`, `beansApi`
- Header with "Add Bean" button and archived toggle
- Bean list: each row shows roaster + name, expand to show batches
- Inline edit form for bean (roaster, name, country, processing, variety)
- Batch sub-list per bean: roast date, days since, weight remaining, frozen badge
- "Add Batch" button per bean — inline form (roast date, weight, price, currency)
- Delete bean/batch with confirmation dialog

Follow the existing settings tab patterns from `PreferencesTab.vue` (inject settings, reactive local state, debounced save).

**Step 2: Commit**

```bash
git add src/components/settings/BeansTab.vue
git commit -m "feat: add BeansTab settings component for bean/batch management"
```

---

### Task 17: GrindersTab Settings Component

**Files:**
- Create: `src/components/settings/GrindersTab.vue`

**Step 1: Create the component**

Structure:
- Inject `grinders`, `grindersApi`
- Header with "Add Grinder" button and archived toggle
- Grinder list: model name, burrs info
- Create/edit form: model (required), burrs, burrSize, burrType, settingType
- Conditional fields:
  - numeric: `settingSmallStep`, `settingBigStep` (ValueInput)
  - preset: `settingValues` list with add/remove/reorder
- Delete with confirmation

**Step 2: Commit**

```bash
git add src/components/settings/GrindersTab.vue
git commit -m "feat: add GrindersTab settings component for grinder management"
```

---

### Task 18: Register New Settings Tabs

**Files:**
- Modify: `src/pages/SettingsPage.vue`

**Step 1: Add tabs to TABS array (around line 9)**

Add two entries:
```javascript
{ id: 'beans', label: 'Beans' },
{ id: 'grinders', label: 'Grinders' },
```

**Step 2: Add lazy imports to tabComponents (around line 56)**

```javascript
defineAsyncComponent(() => import('../components/settings/BeansTab.vue')),
defineAsyncComponent(() => import('../components/settings/GrindersTab.vue')),
```

Ensure the array indices match the TABS order.

**Step 3: Commit**

```bash
git add src/pages/SettingsPage.vue
git commit -m "feat: register BeansTab and GrindersTab in settings page"
```

---

### Task 19: Final Verification & Cleanup

**Step 1: Search for any remaining legacy field usage**

```bash
grep -rn 'doseData\|grinderData\|coffeeData' src/
```

Any remaining references should be in the compat accessors in `useWorkflow.js` only. If other files still reference them, migrate those too.

**Step 2: Verify dev server runs cleanly**

Run: `npm run dev` — navigate through all affected pages.

**Step 3: Verify production build**

Run: `npm run build` — ensure no build errors.

**Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup after beans/grinders migration"
```
