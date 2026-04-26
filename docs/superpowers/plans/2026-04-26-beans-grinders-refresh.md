# Cross-device beans / grinders refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make beans, bean batches, and grinders refresh automatically when the user returns focus to the app, so multi-device adds become visible without manual reload.

**Architecture:** A new `useDataRefresh` composable owns a throttled global tick driven by `document.visibilitychange` and `window.focus`. `useBeans` and `useGrinders` subscribe to the tick and call their existing `refresh()` silently; `useBeans` also clears its `batchCache`. A small `RefreshErrorBadge` shows in tab headers when a silent refresh fails. ETag-conditional GETs (Phase 2) are out of scope for this plan — gated on an upstream Streamline-Bridge feature; a separate plan will be written once that lands.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Playwright e2e tests, mock REST server in `tests/mock-server.js`.

**Spec:** `docs/superpowers/specs/2026-04-26-beans-grinders-refresh-design.md`

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/composables/useDataRefresh.js` | Create | Singleton: visibility/focus listeners + 30 s throttle + global `refreshTick` ref. |
| `src/composables/useGrinders.js` | Modify | Add `silent` option + `lastRefreshFailed` ref + tick watcher. |
| `src/composables/useBeans.js` | Modify | Singleton-ify; add `silent` option + `lastRefreshFailed` ref + tick watcher; clear `batchCache` on tick. |
| `src/components/RefreshErrorBadge.vue` | Create | Tiny presentational component shown in tab headers when `failed=true`. |
| `src/components/settings/BeansTab.vue` | Modify | Render badge; watch tick to refetch expanded beans' batches. |
| `src/components/settings/GrindersTab.vue` | Modify | Render badge. |
| `tests/mock-server.js` | Modify | Add a `?refresh-scenario=` query hook (or test-only POST endpoint) so e2e tests can stage a "second GET returns N+1 beans" or "second GET returns 500". |
| `tests/e2e/cross-device-refresh.spec.js` | Create | Playwright tests covering visibility refresh, batch re-fetch, error badge. |

---

## Task 1: `useDataRefresh` composable

**Files:**
- Create: `src/composables/useDataRefresh.js`

- [ ] **Step 1: Write the file**

```js
// src/composables/useDataRefresh.js
/**
 * Singleton composable that drives client-side data freshness on tab resume.
 *
 * Listens for `visibilitychange` (tab/page becomes visible) and `focus` events,
 * and increments a shared `refreshTick` ref no more than once every 30 s.
 * Consumers (useBeans, useGrinders) watch the tick and refetch silently.
 */
import { ref } from 'vue'

const THROTTLE_MS = 30_000

const refreshTick = ref(0)
let lastFiredAt = 0
let bound = false

function maybeFire() {
  if (typeof document === 'undefined') return
  if (document.visibilityState !== 'visible') return
  const now = Date.now()
  if (now - lastFiredAt < THROTTLE_MS) return
  lastFiredAt = now
  refreshTick.value++
}

function bind() {
  if (bound) return
  bound = true
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', maybeFire)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', maybeFire)
  }
}

export function useDataRefresh() {
  bind()
  return { refreshTick }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useDataRefresh.js
git commit -m "feat(refresh): add useDataRefresh composable for tab-resume tick"
```

---

## Task 2: `useGrinders` — silent refresh + tick subscription

**Files:**
- Modify: `src/composables/useGrinders.js`

- [ ] **Step 1: Add `silent` option, `lastRefreshFailed` ref, and tick watcher**

Replace the entire file with:

```js
/**
 * Composable for managing grinder entities via the REST API.
 *
 * Provides a reactive grinder list with CRUD operations and a
 * Map-based entity cache for single-grinder lookups.
 *
 * Subscribes to useDataRefresh; refreshes silently when the user
 * returns focus to the app.
 */

import { ref, onMounted, watch } from 'vue'
import {
  getGrinders as fetchGrinders,
  getGrinder as fetchGrinder,
  createGrinder as postGrinder,
  updateGrinder as putGrinder,
  deleteGrinder as removeGrinder,
} from '../api/rest'
import { useDataRefresh } from './useDataRefresh'

const entityCache = new Map()

let _instance = null

export function useGrinders() {
  if (_instance) return _instance

  const grinders = ref([])
  const loading = ref(false)
  const error = ref(null)
  const lastRefreshFailed = ref(false)

  /**
   * @param {object} [params] - Query params for fetchGrinders.
   * @param {object} [opts]
   * @param {boolean} [opts.silent=false] - If true, do not flip `loading`
   *   and preserve `grinders.value` on failure (sets `lastRefreshFailed`).
   */
  async function refresh(params = {}, opts = {}) {
    const silent = opts.silent === true
    if (!silent) loading.value = true
    error.value = null
    try {
      const data = await fetchGrinders(params)
      grinders.value = Array.isArray(data) ? data : (data?.grinders ?? [])
      if (silent) lastRefreshFailed.value = false
    } catch (e) {
      error.value = e
      if (silent) lastRefreshFailed.value = true
    } finally {
      if (!silent) loading.value = false
    }
  }

  async function getById(id) {
    if (entityCache.has(id)) return entityCache.get(id)
    const data = await fetchGrinder(id)
    if (data) entityCache.set(id, data)
    return data
  }

  async function create(data) {
    const created = await postGrinder(data)
    if (created) {
      grinders.value.push(created)
      entityCache.set(created.id, created)
    }
    return created
  }

  async function update(id, data) {
    const updated = await putGrinder(id, data)
    if (updated) {
      const idx = grinders.value.findIndex(g => g.id === id)
      if (idx !== -1) grinders.value[idx] = updated
      entityCache.set(id, updated)
    }
    return updated
  }

  async function remove(id) {
    await removeGrinder(id)
    grinders.value = grinders.value.filter(g => g.id !== id)
    entityCache.delete(id)
  }

  onMounted(() => refresh())

  const { refreshTick } = useDataRefresh()
  watch(refreshTick, async () => {
    if (refreshTick.value === 0) return
    await refresh({}, { silent: true })
  })

  _instance = {
    /** Reactive list of all grinders. */
    grinders,
    /** Whether a fetch is in progress. */
    loading,
    /** Last error from an API call, or null. */
    error,
    /** True if the most recent silent refresh failed. */
    lastRefreshFailed,
    /** Reload the grinder list from the API. */
    refresh,
    /** Fetch a single grinder by ID (cached). */
    getById,
    /** Create a new grinder. */
    create,
    /** Update an existing grinder. */
    update,
    /** Delete a grinder. */
    remove,
    /** Global refresh tick from useDataRefresh (re-exposed for components). */
    refreshTick,
  }
  return _instance
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/composables/useGrinders.js
git commit -m "feat(grinders): silent refresh on tab resume"
```

---

## Task 3: `useBeans` — singleton + silent refresh + tick subscription

**Files:**
- Modify: `src/composables/useBeans.js`

- [ ] **Step 1: Add `silent` option, `lastRefreshFailed`, singleton wrapping, tick watcher**

Replace the entire file with:

```js
/**
 * Composable for coffee bean and batch management via REST.
 *
 * Singleton — same instance returned on every call. Fetches the bean list on
 * first mount and exposes reactive state plus CRUD helpers, with Map-based
 * caching for individual beans and batch queries. Subscribes to useDataRefresh;
 * silently refreshes the bean list and invalidates the batch cache when the
 * user returns focus to the app.
 */

import { ref, onMounted, watch } from 'vue'
import {
  getBeans as fetchBeans,
  getBean as fetchBean,
  createBean as postBean,
  updateBean as putBean,
  deleteBean as destroyBean,
  getBeanBatches as fetchBeanBatches,
  getBeanBatch as fetchBeanBatch,
  createBeanBatch as postBeanBatch,
  updateBeanBatch as putBeanBatch,
  deleteBeanBatch as destroyBeanBatch,
} from '../api/rest'
import { useDataRefresh } from './useDataRefresh'

let _instance = null

export function useBeans() {
  if (_instance) return _instance

  const beans = ref([])
  const loading = ref(false)
  const error = ref(null)
  const lastRefreshFailed = ref(false)

  /** Cache for individual bean entities (keyed by id). */
  const entityCache = new Map()

  /** Cache for batch list queries (keyed by `${beanId}:${JSON.stringify(params)}`). */
  const batchCache = new Map()

  // ---------------------------------------------------------------------------
  // Beans CRUD
  // ---------------------------------------------------------------------------

  /**
   * Fetch all beans, optionally with query params.
   * @param {object} [params]
   * @param {object} [opts]
   * @param {boolean} [opts.silent=false] - If true, do not flip `loading`
   *   and preserve `beans.value` on failure (sets `lastRefreshFailed`).
   */
  async function refresh(params, opts = {}) {
    const silent = opts.silent === true
    if (!silent) loading.value = true
    error.value = null
    try {
      const data = await fetchBeans(params)
      beans.value = Array.isArray(data) ? data : (data?.beans ?? [])
      if (silent) lastRefreshFailed.value = false
    } catch (e) {
      error.value = e.message || String(e)
      if (silent) lastRefreshFailed.value = true
    } finally {
      if (!silent) loading.value = false
    }
  }

  /** Fetch a single bean by id. Uses cache when available. */
  async function getById(id) {
    if (entityCache.has(id)) return entityCache.get(id)
    loading.value = true
    error.value = null
    try {
      const data = await fetchBean(id)
      entityCache.set(id, data)
      return data
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Create a new bean. Appends to the reactive list. */
  async function create(data) {
    loading.value = true
    error.value = null
    try {
      const created = await postBean(data)
      beans.value.push(created)
      entityCache.set(created.id, created)
      return created
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Update an existing bean. Syncs list and cache. */
  async function update(id, data) {
    loading.value = true
    error.value = null
    try {
      const updated = await putBean(id, data)
      const idx = beans.value.findIndex((b) => b.id === id)
      if (idx !== -1) beans.value[idx] = updated
      entityCache.set(id, updated)
      return updated
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Delete a bean. Removes from list and cache. */
  async function remove(id) {
    loading.value = true
    error.value = null
    try {
      await destroyBean(id)
      beans.value = beans.value.filter((b) => b.id !== id)
      entityCache.delete(id)
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // ---------------------------------------------------------------------------
  // Batches
  // ---------------------------------------------------------------------------

  /** Fetch batches for a bean. Results are cached by beanId + params. */
  async function getBatches(beanId, params) {
    const cacheKey = `${beanId}:${JSON.stringify(params)}`
    if (batchCache.has(cacheKey)) return batchCache.get(cacheKey)
    loading.value = true
    error.value = null
    try {
      const data = await fetchBeanBatches(beanId, params)
      const batches = Array.isArray(data) ? data : (data?.batches ?? [])
      batchCache.set(cacheKey, batches)
      return batches
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Fetch a single batch by id. */
  async function getBatch(id) {
    loading.value = true
    error.value = null
    try {
      return await fetchBeanBatch(id)
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Create a batch for a bean. Invalidates batch cache for that bean. */
  async function createBatch(beanId, data) {
    loading.value = true
    error.value = null
    try {
      const created = await postBeanBatch(beanId, data)
      // Invalidate all cached batch queries for this bean
      for (const key of batchCache.keys()) {
        if (key.startsWith(`${beanId}:`)) batchCache.delete(key)
      }
      return created
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Update a batch. */
  async function updateBatch(id, data) {
    loading.value = true
    error.value = null
    try {
      return await putBeanBatch(id, data)
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Delete a batch. */
  async function removeBatch(id) {
    loading.value = true
    error.value = null
    try {
      await destroyBeanBatch(id)
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Return the most recent active batch for a bean — i.e. non-frozen,
   * non-archived, sorted by roastDate (or createdAt) descending.
   */
  async function activeBatchForBean(beanId) {
    const batches = await getBatches(beanId)
    const active = batches.filter(
      (b) => !b.frozen && !b.archived
    )
    active.sort((a, b) => {
      const dateA = a.roastDate || a.createdAt || ''
      const dateB = b.roastDate || b.createdAt || ''
      return dateB.localeCompare(dateA)
    })
    return active[0] ?? null
  }

  onMounted(refresh)

  // Subscribe to global resume tick: silent refresh + invalidate batch cache.
  const { refreshTick } = useDataRefresh()
  watch(refreshTick, async () => {
    if (refreshTick.value === 0) return
    await refresh(undefined, { silent: true })
    batchCache.clear()
  })

  _instance = {
    beans,
    loading,
    error,
    lastRefreshFailed,
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
    refreshTick,
  }
  return _instance
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/composables/useBeans.js
git commit -m "feat(beans): singleton + silent refresh on tab resume"
```

---

## Task 4: `RefreshErrorBadge` component

**Files:**
- Create: `src/components/RefreshErrorBadge.vue`

- [ ] **Step 1: Write the file**

```vue
<script setup>
defineProps({
  failed: { type: Boolean, default: false },
})
</script>

<template>
  <span
    v-if="failed"
    class="refresh-error-badge"
    role="status"
    aria-label="Couldn't refresh — showing last known data"
    :title="'Couldn\'t refresh — showing last known data'"
  >
    <!-- inline SVG: cloud-off icon, sized to header line height -->
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.1 3.51 3.51 2.1l18.39 18.39-1.41 1.41-2.55-2.55Q17.32 20 16 20H6q-2.485 0-4.243-1.757Q0 16.485 0 14q0-2.225 1.412-3.85.964-1.108 2.378-1.6L2.1 3.51Zm6.34 4.51L21.6 21.18Q22.97 19.97 23.5 18.13 24 16.36 24 14.5q0-2.485-1.757-4.243Q20.485 8.5 18 8.5q-.36 0-.7.04Q16.5 5.5 13.85 4.115 11.2 2.73 8.5 3.06l-.06 4.96Z"
      />
    </svg>
  </span>
</template>

<style scoped>
.refresh-error-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 0.5rem;
  color: var(--color-warning, #d97706);
  cursor: help;
  vertical-align: middle;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RefreshErrorBadge.vue
git commit -m "feat: add RefreshErrorBadge component"
```

---

## Task 5: Wire badge into `GrindersTab.vue`

**Files:**
- Modify: `src/components/settings/GrindersTab.vue`

- [ ] **Step 1: Read current file**

Run: `cat src/components/settings/GrindersTab.vue | head -40`

Note the `<script setup>` injection block and the `<template>` header element. `grindersApi` is injected and exposes `lastRefreshFailed` after Task 2.

- [ ] **Step 2: Add import + computed wiring**

In the `<script setup>` block of `src/components/settings/GrindersTab.vue`, after the existing imports and `inject` calls, add:

```js
import RefreshErrorBadge from '../RefreshErrorBadge.vue'
import { computed } from 'vue'

// grindersApi is already injected above; expose its lastRefreshFailed reactively
const refreshFailed = computed(() => grindersApi?.lastRefreshFailed?.value ?? false)
```

If `computed` is already imported, do not add it twice. If `grindersApi` isn't already in `inject` calls, add `const grindersApi = inject('grindersApi', null)` next to the other injections.

- [ ] **Step 3: Add badge to header**

In the `<template>` block of `src/components/settings/GrindersTab.vue`, find the section header element (first `<h2>` or section title for the grinders list). Add the badge immediately after the heading text:

```vue
<h2>
  Grinders
  <RefreshErrorBadge :failed="refreshFailed" />
</h2>
```

(Use the existing heading element — only add the `<RefreshErrorBadge>` line. Do not change other markup.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/GrindersTab.vue
git commit -m "feat(grinders): show refresh-error badge in tab header"
```

---

## Task 6: Wire badge + batch refresh watcher into `BeansTab.vue`

**Files:**
- Modify: `src/components/settings/BeansTab.vue`

The current file uses `inject('beans')` and `inject('beansApi')` — `beansApi` exposes `refreshTick`, `lastRefreshFailed`, and `getBatches` after Task 3. The current expand handler stores batches in a reactive `batchesByBean` object keyed by bean id (lines 11, 88).

- [ ] **Step 1: Add import + watcher + computed wiring**

In the `<script setup>` block of `src/components/settings/BeansTab.vue`, after the existing imports and `inject` calls, add:

```js
import RefreshErrorBadge from '../RefreshErrorBadge.vue'
import { watch, computed } from 'vue'

const refreshFailed = computed(() => beansApi?.lastRefreshFailed?.value ?? false)

// When useDataRefresh fires, the global tick increments and useBeans clears its
// batchCache. Re-fetch batches for any currently-expanded bean so the open
// section shows fresh data without the user collapsing/reopening it.
watch(
  () => beansApi?.refreshTick?.value,
  async (tick, oldTick) => {
    if (!tick || tick === oldTick) return
    for (const beanId of Object.keys(batchesByBean)) {
      try {
        batchesByBean[beanId] = await beansApi.getBatches(beanId)
      } catch {
        // Silent — useBeans flips lastRefreshFailed; per-bean failure is OK.
      }
    }
  }
)
```

If `watch` or `computed` is already imported, do not add it twice.

- [ ] **Step 2: Add badge to bean list header**

In the `<template>` block of `src/components/settings/BeansTab.vue`, find the section header element for the bean list (first `<h2>` or equivalent). Add the badge immediately after the heading text:

```vue
<h2>
  Coffee beans
  <RefreshErrorBadge :failed="refreshFailed" />
</h2>
```

(Use the existing heading element — only add the `<RefreshErrorBadge>` line. Do not change other markup.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/BeansTab.vue
git commit -m "feat(beans): show refresh-error badge + refetch expanded batches on resume"
```

---

## Task 7: Mock-server hooks for refresh tests

**Files:**
- Modify: `tests/mock-server.js`

We need test-only state hooks so e2e tests can stage:
- A "second GET returns N+1 beans" scenario (simulating a multi-device add).
- A "next GET returns 500" scenario (silent failure → badge).
- A counter showing how many times `/beans` and `/grinders` have been hit.

- [ ] **Step 1: Add scenario state and reset endpoint**

In `tests/mock-server.js`, near the other mock state declarations (`mockMachineState`, etc.), add:

```js
// ---- Refresh-test scenario state (e2e only) -----------------------------

let beansFailNextGet = false
let grindersFailNextGet = false
let beansGetCount = 0
let grindersGetCount = 0
```

Find the existing test-reset endpoint (search for `/api/v1/test/reset-skin`). Below it, add a new reset endpoint that clears scenario state:

```js
if (path === '/api/v1/test/reset-refresh-state' && method === 'POST') {
  beansFailNextGet = false
  grindersFailNextGet = false
  beansGetCount = 0
  grindersGetCount = 0
  return json({ ok: true })
}

if (path === '/api/v1/test/refresh-state' && method === 'GET') {
  return json({
    beansFailNextGet,
    grindersFailNextGet,
    beansGetCount,
    grindersGetCount,
  })
}

if (path === '/api/v1/test/fail-next-beans-get' && method === 'POST') {
  beansFailNextGet = true
  return json({ ok: true })
}

if (path === '/api/v1/test/fail-next-grinders-get' && method === 'POST') {
  grindersFailNextGet = true
  return json({ ok: true })
}

if (path === '/api/v1/test/add-bean' && method === 'POST') {
  // Simulate another device adding a bean — bypass POST handler and inject directly.
  const bean = { id: 'bean-injected-' + Date.now(), ...(body || {}) }
  mockBeans.push(bean)
  return json(bean, 201)
}

if (path === '/api/v1/test/add-grinder' && method === 'POST') {
  const grinder = { id: 'grinder-injected-' + Date.now(), ...(body || {}) }
  mockGrinders.push(grinder)
  return json(grinder, 201)
}
```

- [ ] **Step 2: Hook into beans GET**

Replace the existing handler:

```js
if (path === '/api/v1/beans' && method === 'GET') {
  return json(mockBeans)
}
```

With:

```js
if (path === '/api/v1/beans' && method === 'GET') {
  beansGetCount++
  if (beansFailNextGet) {
    beansFailNextGet = false
    return json({ error: 'Simulated failure' }, 500)
  }
  return json(mockBeans)
}
```

- [ ] **Step 3: Hook into grinders GET**

Replace the existing handler:

```js
if (path === '/api/v1/grinders' && method === 'GET') {
  return json(mockGrinders)
}
```

With:

```js
if (path === '/api/v1/grinders' && method === 'GET') {
  grindersGetCount++
  if (grindersFailNextGet) {
    grindersFailNextGet = false
    return json({ error: 'Simulated failure' }, 500)
  }
  return json(mockGrinders)
}
```

- [ ] **Step 4: Hook into beans/{id}/batches GET**

Replace the existing handler:

```js
if (path.match(/^\/api\/v1\/beans\/[^/]+\/batches$/) && method === 'GET') {
  return json([])
}
```

With:

```js
if (path.match(/^\/api\/v1\/beans\/[^/]+\/batches$/) && method === 'GET') {
  const beanId = decodeURIComponent(path.split('/')[4])
  // mockBeanBatches keyed by beanId, falling back to empty array
  return json((mockBeanBatches && mockBeanBatches[beanId]) || [])
}
```

Then near `mockBeans` declaration, add:

```js
const mockBeanBatches = {} // beanId -> [{ id, roastDate, ... }]
```

And add a helper test endpoint to inject batches:

```js
if (path.match(/^\/api\/v1\/test\/add-batch\/[^/]+$/) && method === 'POST') {
  const beanId = decodeURIComponent(path.split('/').pop())
  const batch = { id: 'batch-injected-' + Date.now(), ...(body || {}) }
  mockBeanBatches[beanId] = [...(mockBeanBatches[beanId] || []), batch]
  return json(batch, 201)
}
```

- [ ] **Step 5: Verify build still runs**

Run: `npm run test:e2e -- --list` (lists tests without running — sanity check that mock-server still parses).
Expected: list of existing tests, no syntax errors.

- [ ] **Step 6: Commit**

```bash
git add tests/mock-server.js
git commit -m "test(mock): add refresh-test scenario hooks (failure injection, bean/batch add)"
```

---

## Task 8: E2E test — visibility refresh updates beans list silently

**Files:**
- Create: `tests/e2e/cross-device-refresh.spec.js`

- [ ] **Step 1: Write the test**

```js
// tests/e2e/cross-device-refresh.spec.js
import { test, expect } from '@playwright/test'

const SETTINGS_URL = '/#/settings'

test.beforeEach(async ({ request }) => {
  await request.post('/api/v1/test/reset-refresh-state')
})

test('visibility refresh picks up bean added by another device', async ({ page, request }) => {
  // Navigate to Settings → Beans tab. Reads mockBeans (initially empty).
  await page.goto(SETTINGS_URL)
  await page.getByRole('tab', { name: /Beans/i }).click()

  // Confirm initial state: no beans listed.
  await expect(page.locator('.beans-tab__row')).toHaveCount(0)

  // Simulate another device adding a bean.
  await request.post('/api/v1/test/add-bean', {
    data: { roaster: 'External', name: 'Other Device Bean' },
  })

  // Force the throttle to allow an immediate fire by waiting < 30s but
  // resetting the lastFiredAt via a fresh page reload would defeat the test.
  // Instead, evaluate in the page: zero out the throttle by directly
  // dispatching multiple events after manipulating Date.now() via a hook,
  // OR simply wait the throttle window. We use the latter for correctness.
  await page.waitForTimeout(30_500)

  // Trigger visibility refresh: simulate tab becoming visible.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // Bean appears without page reload.
  await expect(page.getByText('Other Device Bean')).toBeVisible({ timeout: 5_000 })
})
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- tests/e2e/cross-device-refresh.spec.js`
Expected: PASS.

If it fails, check:
- That `useDataRefresh` listener is bound (Task 1).
- That `useBeans` watches the tick (Task 3).
- That the throttle window has elapsed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/cross-device-refresh.spec.js
git commit -m "test(e2e): visibility refresh picks up cross-device bean add"
```

---

## Task 9: E2E test — BeansTab refetches expanded batches on resume

**Files:**
- Modify: `tests/e2e/cross-device-refresh.spec.js`

- [ ] **Step 1: Append the test**

Add after the existing test:

```js
test('expanding a bean and resuming the tab refetches its batches', async ({ page, request }) => {
  // Seed a bean and one batch.
  await request.post('/api/v1/test/add-bean', {
    data: { id: 'bean-coverage', roaster: 'X', name: 'Coverage Bean' },
  })
  // (server assigns id; we'll discover it after fetch)

  await page.goto(SETTINGS_URL)
  await page.getByRole('tab', { name: /Beans/i }).click()

  // Expand the bean to load its batches (initially empty).
  const row = page.getByText('Coverage Bean')
  await row.click()
  await expect(page.locator('.beans-tab__batch-row, .beans-tab__no-batches')).toBeVisible()

  // Discover the bean id from the visible row's data attribute (test fixture
  // requires BeansTab rows to expose `data-bean-id`; if not present, derive
  // from the request log or query the API).
  const beanId = await page.evaluate(() => {
    const el = document.querySelector('[data-bean-id]')
    return el?.getAttribute('data-bean-id')
  })
  expect(beanId).toBeTruthy()

  // Simulate another device adding a batch to this bean.
  await request.post(`/api/v1/test/add-batch/${beanId}`, {
    data: { roastDate: '2026-04-25', roastLevel: 'Medium' },
  })

  // Wait throttle, fire visibility.
  await page.waitForTimeout(30_500)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // Batch appears in the still-expanded section.
  await expect(page.getByText('2026-04-25')).toBeVisible({ timeout: 5_000 })
})
```

- [ ] **Step 2: Add `data-bean-id` to BeansTab row template (if missing)**

Run: `grep -n "data-bean-id" src/components/settings/BeansTab.vue`
- If found, skip this step.
- If not found, in `src/components/settings/BeansTab.vue`, find the row element rendered for each bean (likely a `v-for` over `filteredBeans`), and add `:data-bean-id="bean.id"` to it. Example:

```vue
<div class="beans-tab__row" :data-bean-id="bean.id" @click="toggleBean(bean)">
```

- [ ] **Step 3: Run the test**

Run: `npm run test:e2e -- tests/e2e/cross-device-refresh.spec.js`
Expected: both tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/cross-device-refresh.spec.js src/components/settings/BeansTab.vue
git commit -m "test(e2e): expanded batches refetched on tab resume"
```

---

## Task 10: E2E test — silent failure shows badge, recovery clears it

**Files:**
- Modify: `tests/e2e/cross-device-refresh.spec.js`

- [ ] **Step 1: Append the test**

```js
test('silent refresh failure shows error badge; success clears it', async ({ page, request }) => {
  await page.goto(SETTINGS_URL)
  await page.getByRole('tab', { name: /Grinders/i }).click()

  // No badge initially.
  await expect(page.locator('.refresh-error-badge')).toHaveCount(0)

  // Stage failure for the next /grinders GET.
  await request.post('/api/v1/test/fail-next-grinders-get')

  // Trigger a visibility refresh.
  await page.waitForTimeout(30_500)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // Badge appears.
  await expect(page.locator('.refresh-error-badge')).toBeVisible({ timeout: 5_000 })

  // Trigger another refresh — this one succeeds and should clear the badge.
  await page.waitForTimeout(30_500)
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await expect(page.locator('.refresh-error-badge')).toHaveCount(0, { timeout: 5_000 })
})
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- tests/e2e/cross-device-refresh.spec.js`
Expected: all three tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/cross-device-refresh.spec.js
git commit -m "test(e2e): silent refresh failure surfaces error badge"
```

---

## Task 11: Final verification — full e2e + manual smoke

- [ ] **Step 1: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: all tests PASS, including the three new ones in `cross-device-refresh.spec.js`.

If any pre-existing tests broke, the most likely cause is the singleton conversion of `useBeans` — re-check that `App.vue` still sees the expected return shape (`beans`, `loading`, `error`, plus everything else the existing code reads).

- [ ] **Step 2: Manual smoke — dev server**

Run: `npm run dev`

In two browser tabs (or one tab + one curl shell pointed at the dev gateway):
1. Tab A: open `/#/settings` → Beans tab.
2. Tab B (curl): `curl -X POST http://localhost:8080/api/v1/test/add-bean -d '{"roaster":"Manual","name":"Smoke Test"}' -H 'Content-Type: application/json'` (or use the real beans POST through Tab B's browser).
3. Tab A: switch away (focus another window) for >30 s, switch back.
4. Bean should appear without manual reload, no spinner flicker.

- [ ] **Step 3: Update the Obsidian feedback list**

Notify the user that the user-facing item is shipped. The user owns updating the Obsidian feedback list (`Professional/Decent/Passione.md`, item: "Beans / grinders data not refreshed"). Do **not** edit the Obsidian file as part of plan execution.

- [ ] **Step 4: Final commit / PR**

If working on a feature branch and the user has confirmed PR creation, follow the project's standard `gh pr create` workflow. Otherwise, leave the branch ready for review.

---

## Phase 2 (out of scope for this plan)

ETag-conditional GETs on `/api/v1/beans` and `/api/v1/grinders` ship in a separate plan once the upstream Streamline-Bridge feature lands. That work touches only `src/api/rest.js` (cache layer + `If-None-Match` header) and adds a small e2e test that asserts a 304 response is returned and `beansGetCount` advances without `beans.value` being replaced. Tracking issue: `tadelv/reaprime#203`.

---

## Self-Review Checklist

- **Spec coverage:** ✅
  - Visibility/focus driver → Task 1.
  - Singleton-ify `useBeans` → Task 3.
  - Silent refresh + `lastRefreshFailed` → Tasks 2, 3.
  - Tick subscription + batch cache invalidation → Tasks 2, 3.
  - `RefreshErrorBadge` component → Task 4.
  - Tab integration → Tasks 5, 6.
  - Mock-server scenario hooks → Task 7.
  - E2E for cross-device add → Task 8.
  - E2E for batch refresh → Task 9.
  - E2E for silent failure badge → Task 10.
  - Phase 2 (ETag) → Deferred to future plan, called out explicitly.
- **Placeholder scan:** No TBD/TODO/vague steps in actionable tasks. The Phase 2 section explicitly defers; the upstream issue number is intentionally a placeholder.
- **Type consistency:** `lastRefreshFailed` and `refreshTick` named consistently across composables, components, and tests. `silent: true` option name consistent. Mock-server endpoint names consistent across server and tests.
- **Throttle gotcha:** Tasks 8/9/10 each `waitForTimeout(30_500)` to clear the throttle. This is slow for a test suite — acceptable trade-off for now (3 × 30s = 90s extra). If suite duration becomes a problem, expose `useDataRefresh` throttle as a configurable export and override in tests.
