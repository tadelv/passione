# API Call Reduction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate redundant, repeated, and wasteful REST/WebSocket calls identified in the API audit, plus gate the scale WebSocket on real device presence so it stops reconnecting every second when no scale is paired.

**Architecture:** All fixes are local: introduce module-level caches (matching the `useBeans` singleton pattern) for data that rarely changes within a session (shot ID list, profile list, all-shots aggregate); remove a 10 Hz heartbeat watcher; replace a full-ID-list count with `getShotsPaginated(1, 0).total`; tighten settings/workflow watcher ordering to remove a startup race; and reshape `useScale` so its `ReconnectingWebSocket` only opens when `useDevices.scaleConnected` is `true`.

**Tech Stack:** Vue 3 Composition API, vue-router (hash mode), `ReconnectingWebSocket` wrapper around browser `WebSocket`, REST via `sendCommand` in `src/api/rest.js`. No unit-test framework — verification is `npm run build` + Playwright (`npm run test:e2e`) + dev-server smoke checks where applicable.

**Caching invalidation strategy:** All module-level caches expose an `invalidate()` (or equivalent) function. The single source of truth for "shot list changed" is `src/composables/useShotData.js` — any save/delete in `PostShotReviewPage.vue`, `ShotDetailPage.vue`, or `ShotHistoryPage.vue` that mutates shots already routes through there or via `rest.js` write helpers. We add explicit `invalidate()` calls at every shot-write site rather than guessing TTLs.

**Commits:** One commit per task. Conventional Commits format. Subject ≤50 chars.

---

## Task 1: Remove redundant heartbeat watcher

**Files:**
- Modify: `src/composables/useAutoSleep.js:65-69`

**Step 1: Read context to confirm fix is safe**

Confirm in `src/composables/useAutoSleep.js:24-34` that `pointerdown` + `keydown` listeners already cover user activity, and in `src/composables/useMachine.js` that `state` is updated on every WS snapshot (~10 Hz).

**Step 2: Delete the watcher**

Remove lines 65-69 in `src/composables/useAutoSleep.js`:

```js
// Send heartbeat on machine state changes
watch(
  () => machine.state.value,
  () => sendHeartbeat().catch(() => {})
)
```

If the `watch` import is now unused, drop it from the import on line 11. Re-check — `watch` is still used on line 72 for `autoSleepMinutes`, so keep the import.

**Step 3: Verify**

```bash
npm run build
```

Expected: clean build, no unused-import warnings.

**Step 4: Commit**

```bash
git add src/composables/useAutoSleep.js
git commit -m "fix(autosleep): drop heartbeat watcher on machine state"
```

---

## Task 2: Replace full-ID fetch with paginated count in ShotHistoryTab

**Files:**
- Modify: `src/components/settings/ShotHistoryTab.vue:1-24`

**Step 1: Swap the import and call**

Replace the import on line 4:

```js
import { getShotsPaginated } from '../../api/rest.js'
```

Replace `loadShotCount` (lines 13-22):

```js
async function loadShotCount() {
  loading.value = true
  try {
    const result = await getShotsPaginated(1, 0)
    totalShots.value = result?.total ?? 0
  } catch {
    totalShots.value = null
  }
  loading.value = false
}
```

**Step 2: Verify**

```bash
npm run build
```

Expected: clean build.

**Step 3: Manually verify in dev server**

Run `npm run dev`, open Settings → History. Confirm "Total shots" shows the same count as before (compare with the count rendered on `/history`).

**Step 4: Commit**

```bash
git add src/components/settings/ShotHistoryTab.vue
git commit -m "perf(settings): use paginated total for shot count"
```

---

## Task 3: Add a module-level shot-ID-list cache

**Files:**
- Create: `src/composables/useShotIds.js`
- Modify: `src/api/rest.js` (add `invalidateShotIdsCache` calls at write sites — see Task 5)

**Step 1: Create the composable**

Write `src/composables/useShotIds.js`:

```js
/**
 * Module-level cache of the shot ID list.
 *
 * The full ID list is fetched once per session and reused by the detail
 * page (swipe nav) and any other consumer that needs the ordered ID list.
 * Call invalidate() whenever shots are created, deleted, or reordered.
 */

import { ref } from 'vue'
import { getShotIds as fetchShotIds } from '../api/rest.js'

const ids = ref(null) // null = not loaded yet
let inflight = null

async function ensureLoaded() {
  if (ids.value !== null) return ids.value
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const result = await fetchShotIds()
      ids.value = Array.isArray(result) ? result : (result?.ids ?? [])
      return ids.value
    } catch {
      ids.value = []
      return ids.value
    } finally {
      inflight = null
    }
  })()
  return inflight
}

function invalidate() {
  ids.value = null
  inflight = null
}

export function useShotIds() {
  return { ids, ensureLoaded, invalidate }
}
```

**Step 2: Verify the file parses**

```bash
npm run build
```

Expected: clean build (file is unused but should still type-check).

**Step 3: Commit**

```bash
git add src/composables/useShotIds.js
git commit -m "feat(shots): add module-level shot-id cache"
```

---

## Task 4: Use the shot-ID cache in ShotDetailPage

**Files:**
- Modify: `src/pages/ShotDetailPage.vue:9, 24-42, 100-103`

**Step 1: Swap imports**

In `src/pages/ShotDetailPage.vue` replace the current line 9 import set with:

```js
import { getShot, updateShot, deleteShot, callPluginEndpoint } from '../api/rest.js'
import { useShotIds } from '../composables/useShotIds'
```

(`getShotIds` is dropped; `useShotIds` is added.)

**Step 2: Replace `loadShotIds` with the cached version**

Replace lines 24-42:

```js
const shotIdsCache = useShotIds()
const allShotIds = shotIdsCache.ids
```

…and update the `currentIndex` / `positionText` computeds to handle the `null` "not loaded" state:

```js
const currentIndex = computed(() => {
  const list = allShotIds.value
  if (!list || !list.length) return -1
  return list.indexOf(shotId.value)
})

const positionText = computed(() => {
  const list = allShotIds.value
  if (!list || currentIndex.value < 0) return ''
  return `${currentIndex.value + 1} / ${list.length}`
})
```

…and update `navigateShot`:

```js
function navigateShot(delta) {
  const list = allShotIds.value
  if (!list || !list.length || currentIndex.value < 0) return
  let next = currentIndex.value + delta
  if (next < 0) next = list.length - 1
  if (next >= list.length) next = 0
  const nextId = list[next]
  if (nextId) router.replace(`/shot/${encodeURIComponent(nextId)}`)
}
```

**Step 3: Replace the onMounted call**

Lines 100-103 become:

```js
onMounted(() => {
  loadShot(shotId.value)
  shotIdsCache.ensureLoaded()
})
```

**Step 4: Wire delete invalidation**

Find the `deleteShot` call in `ShotDetailPage.vue` (search for `deleteShot(`). Immediately after a successful delete, call `shotIdsCache.invalidate()` before `router.back()` (or wherever the navigation happens).

**Step 5: Verify**

```bash
npm run build
```

Expected: clean build.

Manual check (`npm run dev`): open `/history`, click into a shot, swipe between shots — first swipe should not trigger a network fetch in DevTools after the initial page load. Open a different shot from `/history` again — confirm cached IDs are reused (no new `/api/v1/shots/ids` call).

**Step 6: Commit**

```bash
git add src/pages/ShotDetailPage.vue
git commit -m "perf(shot-detail): cache shot id list across mounts"
```

---

## Task 5: Invalidate the shot-ID cache at all write sites

**Files:**
- Modify: `src/pages/PostShotReviewPage.vue` (after every `saveShot`/`updateShot`/`deleteShot`)
- Modify: `src/pages/ShotHistoryPage.vue` (after delete)
- Modify: `src/composables/useShotData.js` IF it owns shot writes (read it to check)

**Step 1: Audit shot-write call sites**

Run:

```bash
```

Then use Grep tool with pattern `deleteShot\(|updateShot\(|saveShot\(|createShot\(` across `src/`. List every file/line.

**Step 2: At each write call site**

Import the cache composable:

```js
import { useShotIds } from '../composables/useShotIds'
```

Inside the component setup:

```js
const shotIdsCache = useShotIds()
```

After the awaited write resolves (success path), call:

```js
shotIdsCache.invalidate()
```

For PostShotReviewPage specifically — invalidate after the suggestion-feeding shot list mutates is unnecessary because that page only *reads*; but the page's own "save review" path (which creates/updates an annotation) should invalidate so the next ShotDetailPage open re-counts.

**Step 3: Verify**

```bash
npm run build
```

Manual: in dev server, delete a shot from `/history`. Re-open `ShotDetailPage` for a different shot. The position counter should reflect the new total (one less).

**Step 4: Commit**

```bash
git add -p
git commit -m "fix(shots): invalidate id cache on writes"
```

---

## Task 6: Cache PostShotReview suggestions module-level

**Files:**
- Modify: `src/pages/PostShotReviewPage.vue:90-145`

**Step 1: Lift suggestions cache out of the component**

At the top of the `<script setup>` block (above the `historySuggestions` declaration), add a module-level cache holder:

```js
// Module-level suggestion cache. Recomputed once per session, invalidated
// when the shot list changes (so a freshly-saved review's bean shows up).
let _suggestionsCache = null
let _suggestionsInflight = null
```

Replace `loadSuggestions` (lines 100-145) with:

```js
async function loadSuggestions() {
  if (_suggestionsCache) {
    historySuggestions.value = _suggestionsCache
    return
  }
  if (_suggestionsInflight) {
    historySuggestions.value = await _suggestionsInflight
    return
  }
  _suggestionsInflight = (async () => {
    try {
      const ids = await getShotIds()
      const idList = Array.isArray(ids) ? ids : (ids?.ids ?? [])
      const recentIds = idList.slice(0, 100)
      if (recentIds.length === 0) return historySuggestions.value
      const result = await getShots(recentIds)
      const shots = Array.isArray(result) ? result : (result?.shots ?? [])

      const sets = {
        roaster: new Set(),
        beanBrand: new Set(),
        beanType: new Set(),
        grinderModel: new Set(),
        grinderSetting: new Set(),
        barista: new Set(),
      }

      for (const raw of shots) {
        const n = normalizeShot(raw)
        const extras = raw.annotations?.extras ?? {}
        const meta = raw.metadata ?? {}
        if (n.coffeeRoaster) sets.roaster.add(n.coffeeRoaster)
        const beanBrandVal = extras.beanBrand ?? meta.beanBrand
        if (beanBrandVal) sets.beanBrand.add(beanBrandVal)
        if (n.coffeeName) sets.beanType.add(n.coffeeName)
        if (n.grinderModel) sets.grinderModel.add(n.grinderModel)
        if (n.grinderSetting != null) sets.grinderSetting.add(String(n.grinderSetting))
        const baristaVal = extras.barista ?? meta.barista
        if (baristaVal) sets.barista.add(baristaVal)
      }

      _suggestionsCache = {
        roaster: [...sets.roaster].sort(),
        beanBrand: [...sets.beanBrand].sort(),
        beanType: [...sets.beanType].sort(),
        grinderModel: [...sets.grinderModel].sort(),
        grinderSetting: [...sets.grinderSetting].sort(),
        barista: [...sets.barista].sort(),
      }
      return _suggestionsCache
    } catch {
      return historySuggestions.value
    } finally {
      _suggestionsInflight = null
    }
  })()
  const result = await _suggestionsInflight
  if (result) historySuggestions.value = result
}
```

**Step 2: Wire invalidation to the same triggers as Task 5**

After every successful save in this same file (the page's own save path), invalidate:

```js
_suggestionsCache = null
```

…immediately before navigating away. Locate the existing save handler (search for `saveAndExit` or similar) and add the line.

**Step 3: Verify**

```bash
npm run build
```

Manual: pull a shot, complete the review form. Open the page again from a second shot — DevTools should show no `/api/v1/shots/ids` or `/api/v1/shots?ids=...` request the second time.

**Step 4: Commit**

```bash
git add src/pages/PostShotReviewPage.vue
git commit -m "perf(post-shot): cache suggestion mining"
```

---

## Task 7: Cache AutoFavorites all-shots aggregate at module scope

**Files:**
- Modify: `src/pages/AutoFavoritesPage.vue:1-60`

**Step 1: Lift cache out of component reactive state**

At the top of `<script setup>`:

```js
let _allShotsCache = null
let _allShotsInflight = null
```

Replace `loadAllShots` (lines 38-59):

```js
async function loadAllShots() {
  loading.value = true
  if (_allShotsCache) {
    allShotsCache.value = _allShotsCache
    computeGroups(_allShotsCache)
    loading.value = false
    return
  }
  if (_allShotsInflight) {
    const cached = await _allShotsInflight
    allShotsCache.value = cached
    computeGroups(cached)
    loading.value = false
    return
  }
  _allShotsInflight = (async () => {
    const allShots = []
    let offset = 0
    const limit = 200
    try {
      while (true) {
        const result = await getShotsPaginated(limit, offset)
        const shots = result.items.map(normalizeShot)
        allShots.push(...shots)
        offset += shots.length
        if (offset >= result.total || shots.length === 0) break
      }
    } catch {
      toast?.error('Failed to load shots')
    }
    _allShotsCache = allShots
    return allShots
  })()
  const shots = await _allShotsInflight
  _allShotsInflight = null
  allShotsCache.value = shots
  computeGroups(shots)
  loading.value = false
}
```

**Step 2: Add an exported invalidator**

Below the cache vars:

```js
export function invalidateAutoFavorites() {
  _allShotsCache = null
  _allShotsInflight = null
}
```

(`<script setup>` exports work via `defineExpose` — but for a *module-level* function we use a plain named export from a sibling module. Simpler: move both the cache and the invalidator into a new file `src/composables/useAllShotsCache.js` and have `AutoFavoritesPage.vue` import it. See Step 3.)

**Step 3: Refactor into a sibling composable**

Actually do it in a sibling composable to keep the invalidator importable. Create `src/composables/useAllShotsCache.js`:

```js
import { ref } from 'vue'
import { getShotsPaginated } from '../api/rest.js'
import { normalizeShot } from './useShotNormalize'

const cache = ref(null)
let inflight = null

async function ensureLoaded() {
  if (cache.value) return cache.value
  if (inflight) return inflight
  inflight = (async () => {
    const allShots = []
    let offset = 0
    const limit = 200
    while (true) {
      const result = await getShotsPaginated(limit, offset)
      const shots = result.items.map(normalizeShot)
      allShots.push(...shots)
      offset += shots.length
      if (offset >= result.total || shots.length === 0) break
    }
    cache.value = allShots
    return allShots
  })().finally(() => { inflight = null })
  return inflight
}

function invalidate() {
  cache.value = null
  inflight = null
}

export function useAllShotsCache() {
  return { cache, ensureLoaded, invalidate }
}
```

Then collapse `loadAllShots` in `AutoFavoritesPage.vue` to:

```js
const allShotsCacheStore = useAllShotsCache()

async function loadAllShots() {
  loading.value = true
  try {
    const shots = await allShotsCacheStore.ensureLoaded()
    allShotsCache.value = shots
    computeGroups(shots)
  } catch {
    toast?.error('Failed to load shots')
  } finally {
    loading.value = false
  }
}
```

Add the import at the top:

```js
import { useAllShotsCache } from '../composables/useAllShotsCache'
```

**Step 4: Wire invalidation at every shot-write site (same set as Task 5)**

At every site that calls `shotIdsCache.invalidate()`, also call `useAllShotsCache().invalidate()`. Both caches go stale on the same events.

**Step 5: Verify**

```bash
npm run build
```

Manual: open `/auto-favorites`, navigate away, return — second visit should show data instantly (no network requests in DevTools). Save a shot review, then return to `/auto-favorites` — should refetch.

**Step 6: Commit**

```bash
git add src/composables/useAllShotsCache.js src/pages/AutoFavoritesPage.vue
git commit -m "perf(auto-favorites): cache aggregated shot list"
```

---

## Task 8: Module-level profile list cache

**Files:**
- Create: `src/composables/useProfilesCache.js`
- Modify: `src/pages/IdlePage.vue:111`
- Modify: `src/pages/ProfileSelectorPage.vue:128`
- Modify: `src/pages/ProfileInfoPage.vue:59`
- Modify: `src/pages/VisualizerMultiImportPage.vue:53`

**Step 1: Create the cache composable**

Write `src/composables/useProfilesCache.js`:

```js
/**
 * Module-level cache of the full profile records list.
 *
 * Invalidated on profile create/update/delete (call invalidate() at every
 * write site).
 */

import { ref } from 'vue'
import { getProfiles } from '../api/rest.js'

const profiles = ref(null)
let inflight = null

async function ensureLoaded() {
  if (profiles.value) return profiles.value
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const data = await getProfiles()
      profiles.value = Array.isArray(data) ? data : (data?.records ?? [])
      return profiles.value
    } finally {
      inflight = null
    }
  })()
  return inflight
}

function invalidate() {
  profiles.value = null
  inflight = null
}

export function useProfilesCache() {
  return { profiles, ensureLoaded, invalidate }
}
```

**Step 2: Replace each `getProfiles()` call**

For each of the four callsites listed above:

- Add import: `import { useProfilesCache } from '../composables/useProfilesCache'`
- Inside setup: `const profilesCache = useProfilesCache()`
- Replace `await getProfiles()` with `await profilesCache.ensureLoaded()`
- Drop the now-unused `getProfiles` import if no other usage remains in that file

For `IdlePage.vue:111` specifically — the call is inside `onComboSelect`. The cache will hit on every subsequent recipe tap.

**Step 3: Wire invalidation at profile-write sites**

Search for profile writes:

```
Use Grep tool: pattern `createProfile\(|updateProfile\(|deleteProfile\(|saveProfile\(` across src/
```

At each successful write, call `useProfilesCache().invalidate()`. Likely sites: profile editor pages (`SimpleProfileEditorPage.vue`, `RecipeEditorPage.vue` if it saves profiles, `ProfileSelectorPage.vue` if it has a delete action).

**Step 4: Verify**

```bash
npm run build
```

Manual: open `/profiles`, then `/`, tap a recipe — DevTools should show one `/api/v1/profiles` call total per session, not one per recipe tap.

**Step 5: Commit**

```bash
git add src/composables/useProfilesCache.js src/pages/IdlePage.vue src/pages/ProfileSelectorPage.vue src/pages/ProfileInfoPage.vue src/pages/VisualizerMultiImportPage.vue
# Plus any editor pages with invalidate() calls
git commit -m "perf(profiles): cache profile records list"
```

---

## Task 9: Run settings migration before arming watchers

**Files:**
- Modify: `src/composables/useSettings.js:215-290`

**Step 1: Reorder load + watcher arming**

Currently `_migrateSteamFlow()` runs *inside* `load()` and is only safe because `loaded.value` is `false` while it mutates settings. Make this contract explicit by:

1. Marking the migration-in-progress with a separate flag, OR
2. Arming the watchers *after* `load()` resolves.

Option 2 is cleaner. Refactor:

In `useSettings.js`, find the watcher loop at line 281-290 (`for (const [groupKey, keys] of Object.entries(GROUPS))`). Wrap it in a function:

```js
function _armWatchers() {
  for (const [groupKey, keys] of Object.entries(GROUPS)) {
    watch(
      () => keys.map(k => settings[k]),
      () => {
        if (!loaded.value) return
        _debouncedSave(groupKey, keys)
      },
      { deep: true }
    )
  }
}
```

Move the call *into* `load()`, after `_migrateSteamFlow()`:

```js
async function load() {
  const promises = Object.keys(GROUPS).map(groupKey => _loadKey(groupKey))
  await Promise.allSettled(promises)
  _migrateSteamFlow()
  _armWatchers()
  loaded.value = true
}
```

Remove the standalone `for` loop at the original location.

**Step 2: Verify**

```bash
npm run build
```

Manual: open dev server with a fresh profile (clear localStorage and the `/api/v1/store/decenza-js/*` keys via mock-server reset, or use a known-clean gateway). Watch DevTools network tab during page load — should see only `GET` calls for each settings group, no `PUT` calls fired by the migration mutating values.

**Step 3: Commit**

```bash
git add src/composables/useSettings.js
git commit -m "refactor(settings): arm watchers after migration"
```

---

## Task 10: Suppress operationSettings before settings.load

**Files:**
- Modify: `src/App.vue:581-591`
- Modify: `src/composables/useOperationSettings.js` (export `suppress` if not already exposed — line 187-191 already returns it)

**Step 1: Wrap settings.load + workflowReady in suppress/unsuppress**

Update `App.vue:581-591`:

```js
onMounted(async () => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('contextmenu', onContextMenu)

  // Prevent the steam/hotwater/flush watchers from firing PUTs during the
  // brief window between settings load completing and syncFromWorkflow
  // overwriting them with the gateway's actual workflow values.
  operationSettings.suppress()
  try {
    await Promise.all([settings.load(), workflowReady])
    operationSettings.syncFromWorkflow()
  } finally {
    // syncFromWorkflow already unsuppresses via its internal nextTick.
    // No-op here, but guarantee unsuppress if syncFromWorkflow throws.
    operationSettings.unsuppress()
  }
})
```

**Step 2: Confirm `unsuppress` is idempotent**

Read `src/composables/useOperationSettings.js` to confirm `unsuppress` is safe to call multiple times. If `syncFromWorkflow` already calls `unsuppress` via `nextTick`, the second call from the `finally` block is a no-op as long as `unsuppress` just sets a boolean — verify and adjust if it decrements a counter.

**Step 3: Verify**

```bash
npm run build
```

Manual: with DevTools open and the settings backend stable, reload the page. Should see zero spurious `PUT /api/v1/workflow` requests in the first 500 ms after load. (Compare against current behavior on a separate tab to confirm the difference.)

**Step 4: Commit**

```bash
git add src/App.vue
git commit -m "fix(operation-settings): suppress writes during boot race"
```

---

## Task 11: Make useGrinders consistent with useBeans (singleton inside closure)

**Files:**
- Modify: `src/composables/useGrinders.js`

**Step 1: Add an instance singleton**

Match the pattern used implicitly by App.vue for `useBeans` (mounted once at App level and provided via `inject`). For `useGrinders`, today the `entityCache` is module-level but `grinders`/`loading`/`error` are per-call. Make the *whole* composable a singleton by guarding instantiation:

```js
let _instance = null

export function useGrinders() {
  if (_instance) return _instance

  const grinders = ref([])
  const loading = ref(false)
  const error = ref(null)

  // ... existing functions ...

  onMounted(() => refresh())

  _instance = {
    grinders,
    loading,
    error,
    refresh,
    getById,
    create,
    update,
    remove,
  }
  return _instance
}
```

**Step 2: Verify**

```bash
npm run build
```

Manual: confirm grinders are still listed in any settings pane that uses them.

**Step 3: Commit**

```bash
git add src/composables/useGrinders.js
git commit -m "refactor(grinders): singleton composable"
```

---

## Task 12: Gate scale WebSocket on devices.scaleConnected

**Files:**
- Modify: `src/composables/useScale.js`
- Modify: `src/App.vue` (call site — pass devices into useScale, or restructure)

**Goal:** Today `useScale` opens its WS on mount and the WS's reconnect loop attempts a connection every 1 s → 2 s → 4 s … up to 30 s when no scale is paired. Even at the 30 s ceiling that's an avoidable connection storm. The `useDevices` WS already publishes `scaleConnected`. We should only hold the scale-snapshot WS open while a scale device is in `state === 'connected'`.

**Approach:** restructure `useScale` to accept an optional reactive `enabled` ref. Watch it; open the WS when it becomes true, close when false. App.vue passes `devices.scaleConnected` as the `enabled` source.

**Step 1: Refactor useScale to take an `enabled` arg**

Rewrite `src/composables/useScale.js`:

```js
import { ref, onUnmounted, watch, isRef } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'
import { tareScale as restTareScale } from '../api/rest'

export function useScale(enabled = true) {
  const isConnected = ref(false)
  const weight = ref(0)
  const batteryLevel = ref(null)
  const timestamp = ref(null)
  const flowRate = ref(0)
  let _prevWeight = null
  let _prevTime = null
  const SMOOTHING = 0.3
  let ws = null

  function onMessage(data) {
    timestamp.value = data.timestamp ?? null
    const newWeight = data.weight ?? 0
    const now = Date.now()
    if (_prevWeight !== null && _prevTime !== null) {
      const dt = (now - _prevTime) / 1000
      if (dt > 0 && dt < 2) {
        const raw = (newWeight - _prevWeight) / dt
        const clamped = Math.max(0, raw)
        flowRate.value = SMOOTHING * clamped + (1 - SMOOTHING) * flowRate.value
      }
    }
    _prevWeight = newWeight
    _prevTime = now
    weight.value = newWeight
    batteryLevel.value = data.batteryLevel ?? null
  }

  function _open() {
    if (ws) return
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/scale/snapshot`,
      (data) => {
        if (!isConnected.value) isConnected.value = true
        onMessage(data)
      }
    )
    ws.onConnectionChange = (connected) => {
      if (!connected) isConnected.value = false
    }
    ws.connect()
  }

  function _close() {
    ws?.close()
    ws = null
    isConnected.value = false
    weight.value = 0
    flowRate.value = 0
    batteryLevel.value = null
    _prevWeight = null
    _prevTime = null
  }

  // Honor the `enabled` source — open when true, close when false.
  if (isRef(enabled)) {
    watch(
      enabled,
      (v) => { v ? _open() : _close() },
      { immediate: true }
    )
  } else if (enabled) {
    _open()
  }

  function tare() {
    return restTareScale()
  }

  // Manual override (rarely needed — the watcher does the work)
  function connect() { _open() }
  function disconnect() { _close() }

  onUnmounted(_close)

  return {
    isConnected,
    weight,
    flowRate,
    batteryLevel,
    timestamp,
    tare,
    connect,
    disconnect,
  }
}
```

**Step 2: Restructure App.vue setup order**

`useScale()` must be called *after* `useDevices()` so we can pass `devices.scaleConnected`. Today the order is:

```js
const machine = useMachine()
const scale = useScale()
const devices = useDevices()
```

Reorder to:

```js
const machine = useMachine()
const devices = useDevices()
const scale = useScale(devices.scaleConnected)
```

Confirm nothing else in the surrounding lines depends on `scale` being defined before `devices` (it doesn't — `volumeMode` uses both but is constructed later on line 49).

**Step 3: Verify**

```bash
npm run build
```

Manual:

- With **no scale paired**: open dev server, open DevTools Network tab filtered for `ws`. Confirm only the `devices`, `machine`, and other always-on WSs open. The `scale/snapshot` WS should *not* appear.
- With **scale paired**: pair a scale via settings. Within ~1 s of `scaleConnected` going true the `scale/snapshot` WS should appear. Disconnect the scale → WS should close cleanly (no reconnect storm).

**Step 4: Commit**

```bash
git add src/composables/useScale.js src/App.vue
git commit -m "perf(scale): gate ws on device presence"
```

---

## Task 13: End-to-end verification

**Step 1: Run the full e2e suite**

```bash
npm run test:e2e
```

Expected: all tests pass. If any test relied on `useScale` always being connected, update the test fixture to wait for a paired scale device first.

**Step 2: Build production bundle**

```bash
npm run build
```

Expected: clean build, no warnings.

**Step 3: Smoke-test in dev server**

```bash
npm run dev
```

Walk through:
1. Idle → Espresso → Post-shot review → Save. Confirm no unexpected network spam in DevTools.
2. `/history` → click into a shot → swipe left/right between shots. Confirm one `/shots/ids` call total.
3. `/auto-favorites` → navigate away → return. Confirm second visit is instant with no fetch.
4. Settings → Steam tab → adjust temperature slider. Confirm one `PUT /api/v1/workflow` per debounce window, not per slider tick.
5. Reload page. Confirm zero spurious `PUT /api/v1/workflow` calls during boot.

**Step 4: Final commit (if any cleanup)**

```bash
git status
# Address any straggling changes from the smoke test
```

---

## Done

All 13 tasks complete. Net effect:
- ~10 Hz heartbeat watcher removed (saves dozens of REST calls per shot).
- Shot-ID list fetched once per session instead of per-page-mount (saves 5+ calls per typical history browsing flow).
- AutoFavorites pagination cached across navigations (saves N calls per `/auto-favorites` visit, where N = ceil(total_shots / 200)).
- Settings shot count uses paginated total (saves one full ID-list fetch every time the settings page opens).
- Profile list cached (saves one full profile-list fetch per recipe tap).
- Operation-settings boot race fixed (saves one spurious `PUT /api/v1/workflow` per app load).
- Scale WS only opens when a scale is actually present (eliminates the 1 s → 30 s reconnect loop forever).
