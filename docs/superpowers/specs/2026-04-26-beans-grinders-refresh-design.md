# Cross-device beans / grinders refresh

**Date:** 2026-04-26
**Status:** Spec — pending implementation
**Tracking:** Passione feedback list (`Professional/Decent/Passione.md`, item: "Beans / grinders data not refreshed")

## Problem

Beans, bean batches, and grinders are fetched once on composable mount and cached for the lifetime of the page. When the user adds beans or grinders on a second device (another tablet, phone, or browser tab), the first device's view stays stale until manual reload. The user reported this against the BeansTab specifically; the same issue applies to GrindersTab and to every consumer that reads from `useBeans` / `useGrinders` (IdlePage, RecipeEditorPage, BrewDialog, AutoFavoritesPage, useShotNormalize).

Streamline-Bridge's REST endpoints `/api/v1/beans`, `/api/v1/beans/{id}/batches`, and `/api/v1/grinders` currently expose no change-detection mechanism: no `ETag`, no `Last-Modified`, no WebSocket change channel.

## Goals

- When the user returns focus to the app (tab visibility, window focus, Android WebView resume), beans/grinders/batches refresh automatically.
- Refresh is silent on resume — no spinners or loading flicker for routine "nothing changed" cases. First-mount load keeps existing shimmer/loading state.
- Multi-device adds become visible without user intervention.
- Implementation is incremental: a self-contained client-side phase ships first, an ETag-conditional optimization ships when the upstream gateway supports it.

## Non-goals

- Concurrent edit conflict resolution (last-write-wins remains).
- Pull-to-refresh or manual refresh buttons.
- Active-page-only refresh — singleton fetches are cheap; complexity unjustified.
- Auto-refresh of unrelated entities (shots, profiles, settings) — out of scope, addressed separately if needed.
- Resolving feedback item #39 (roast-date crash) — that's a different Android WebView issue tracked in reaprime#202.

## Approach

Two phases.

**Phase 1 — visibility/focus refresh (client-only).** A new `useDataRefresh` composable owns a throttled global tick driven by `document.visibilitychange` and `window.focus`. `useBeans` and `useGrinders` become singletons, subscribe to the tick, and call their existing `refresh()` silently. `useBeans` additionally clears its `batchCache` and re-exposes the tick so `BeansTab` can refetch any expanded bean's batches.

**Phase 2 — ETag-conditional GET.** Once Streamline-Bridge adds `ETag` + `If-None-Match` support on `/api/v1/beans` and `/api/v1/grinders`, the REST client (`src/api/rest.js`) gains a small ETag cache layer. 304 responses return the same payload reference, eliminating render churn on no-change refreshes. No composable changes required. Backwards-compatible — degrades to Phase 1 behavior when the server omits `ETag`.

## Architecture

```
visibilitychange / window.focus
        │
        ▼
useDataRefresh (throttle 30s, hidden-tab guard)
        │  refreshTick++
        ├──────────► useBeans (singleton)
        │            ├─► fetchBeans → list swap (silent)
        │            ├─► batchCache.clear()
        │            └─► re-exposes refreshTick
        │                          │
        │                          └─► BeansTab watches → re-getBatches() for expanded beans
        └──────────► useGrinders (singleton)
                     └─► fetchGrinders → list swap (silent)
```

Singleton consumers (`IdlePage`, `RecipeEditorPage`, `BrewDialog`, `AutoFavoritesPage`, `useShotNormalize`) require no change — they reactively read `beans.value` / `grinders.value` and pick up updates for free.

## Components

### `src/composables/useDataRefresh.js` (new)

```js
import { ref } from 'vue'

const THROTTLE_MS = 30_000

const refreshTick = ref(0)
let lastFiredAt = 0
let bound = false

function maybeFire() {
  if (document.visibilityState !== 'visible') return
  const now = Date.now()
  if (now - lastFiredAt < THROTTLE_MS) return
  lastFiredAt = now
  refreshTick.value++
}

function bind() {
  if (bound) return
  bound = true
  document.addEventListener('visibilitychange', maybeFire)
  window.addEventListener('focus', maybeFire)
}

export function useDataRefresh() {
  bind()
  return { refreshTick }
}
```

- Listeners are app-lifetime (no `unbind`). Matches the existing singleton pattern in `useGrinders`.
- `lastFiredAt` is module-scope, not reactive — pure throttle gate.
- `visibilityState` guard prevents `focus` events from firing while the tab is still hidden (transitions can fire focus briefly).
- Tick starts at `0`; consumers skip the initial value to avoid double-fetching alongside their own `onMounted` fetch.

### `src/composables/useBeans.js` (modify)

- Wrap the existing factory with a `_instance` singleton cache, mirroring `useGrinders`.
- Add `lastRefreshFailed = ref(false)`.
- Add `silent` option to `refresh()`:
  - `silent: false` (default, mount-time path) — flips `loading.value`, sets `error` on failure, current behavior preserved.
  - `silent: true` — does not flip `loading.value`; on failure, sets `lastRefreshFailed = true` and preserves the prior `beans.value`.
- Subscribe to `useDataRefresh().refreshTick`:

```js
const { refreshTick } = useDataRefresh()
watch(refreshTick, async () => {
  if (refreshTick.value === 0) return
  await refresh({ silent: true })
  if (!error.value) lastRefreshFailed.value = false
  batchCache.clear()
})
```

- Re-export `refreshTick` and `lastRefreshFailed` in the returned object.

### `src/composables/useGrinders.js` (modify)

- Already a singleton — no factory change needed.
- Add `lastRefreshFailed = ref(false)` and the `silent` option on `refresh()` (same shape as `useBeans`).
- Subscribe to `refreshTick` (same pattern, no `batchCache`).
- Re-export `refreshTick` and `lastRefreshFailed`.

### `src/components/RefreshErrorBadge.vue` (new)

Tiny presentational component used in tab headers.

```vue
<template>
  <span v-if="failed" class="refresh-error-badge" title="Couldn't refresh — showing last known data">
    <!-- icon (e.g. cloud-off) -->
  </span>
</template>
<script setup>
defineProps({ failed: Boolean })
</script>
```

### `src/components/settings/BeansTab.vue` (modify)

- Pull `refreshTick` and `lastRefreshFailed` from `useBeans()`.
- Track expanded beans in `expandedBatches: ref(new Map())` (already partially modeled by current expand state — formalize as a Map of `beanId → batches[]` populated on expand).
- Watcher:
  ```js
  watch(refreshTick, async () => {
    if (refreshTick.value === 0) return
    for (const beanId of expandedBatches.value.keys()) {
      expandedBatches.value.set(beanId, await getBatches(beanId))
    }
  })
  ```
- Add `<RefreshErrorBadge :failed="lastRefreshFailed" />` next to the section heading.

### `src/components/settings/GrindersTab.vue` (modify)

- Pull `lastRefreshFailed` from `useGrinders()`.
- Add `<RefreshErrorBadge :failed="lastRefreshFailed" />` next to the section heading.

### `src/api/rest.js` (Phase 2 only — no changes in Phase 1)

Add a private ETag cache layer behind `getBeans` and `getGrinders`:

```js
const _etagCache = new Map() // url -> { etag, payload }

async function getWithEtag(url) {
  const cached = _etagCache.get(url)
  const headers = cached?.etag ? { 'If-None-Match': cached.etag } : {}
  const res = await fetch(url, { headers })
  if (res.status === 304 && cached) return cached.payload
  const payload = await res.json()
  const etag = res.headers.get('ETag')
  if (etag) _etagCache.set(url, { etag, payload })
  return payload
}
```

- Apply only to `getBeans` and `getGrinders` (and, if supported upstream, `getBeanBatches`).
- Cache keyed by full URL including query (`includeArchived`).
- 304 → return same array reference → singleton's `beans.value = payload` is a no-op for Vue reactivity → zero re-render churn.
- Feature-detected: response without `ETag` header skips cache write, falls through to current behavior.
- Mutating endpoints (POST/PUT/DELETE) untouched; cache entry naturally refreshes on the next GET that returns a new ETag.

## Data flow

1. App mounts. Each composable consumer triggers its own `onMounted` fetch (existing). `useDataRefresh.bind()` runs once, attaching listeners.
2. User backgrounds the tab / switches devices / locks screen.
3. User returns: `visibilitychange` → `visibilityState='visible'` → throttle gate (≥ 30 s since last fire) → `refreshTick++`.
4. `useBeans` watcher fires: `refresh({silent:true})` → `getBeans(...)` (Phase 2: with `If-None-Match`).
   - Phase 1: full payload returned, list swapped (Vue diffs for reactive renders).
   - Phase 2 + unchanged: `304`, same array reference returned, `beans.value = payload` is a no-op, no re-render.
   - Phase 2 + changed: 200 with new payload, list swapped, ETag cache updated.
5. On failure: `lastRefreshFailed = true`, list preserved, badge appears in tab header.
6. `useBeans` clears `batchCache`. `BeansTab` watcher re-calls `getBatches()` for any currently-expanded bean.
7. Next successful tick clears `lastRefreshFailed`.

## Error handling

| Scenario | Behavior |
|----------|----------|
| Mount-time fetch fails | Existing path: `loading=false`, `error=<msg>`, list empty. UI shows error/empty state. |
| Silent refresh fails | `lastRefreshFailed=true`, list preserved, `RefreshErrorBadge` visible in tab header. No toast. |
| Repeated silent failures | Badge stays on. No retry/backoff yet — next visibility-fire will retry naturally (≥ 30 s later). |
| Successful refresh after failure | `lastRefreshFailed=false`, badge clears. |
| Gateway absent / app fully offline | Top-bar device-connection indicator (existing) covers wholesale outage; data badges are secondary signal. |

## Testing

### Unit (Vitest)

- `useDataRefresh`:
  - Two `visibilitychange` events within 30 s → `refreshTick` increments once.
  - Event with `document.visibilityState='hidden'` → no increment.
  - Multiple `useDataRefresh()` calls → listeners attached once (idempotency).
- `useBeans` / `useGrinders`:
  - Singleton identity: `useBeans() === useBeans()`.
  - `refresh({silent:true})` does not toggle `loading.value`.
  - Failure path: `beans.value` preserved, `lastRefreshFailed=true`.
  - Recovery path: `lastRefreshFailed=false` after next successful fetch.
- `rest.js` ETag layer (Phase 2):
  - First call returns payload + caches ETag.
  - Second call sends `If-None-Match`; on 304, returns same payload reference.
  - 200 with new ETag updates cache.
  - Response without `ETag` header skips cache write.

### E2E (Playwright)

- Stub gateway: initial GET serves N beans → user backgrounds tab (stub `document.visibilityState`, dispatch `visibilitychange`) → fast-forward fake clock past 30 s → second GET fires → list updates without spinner.
- BeansTab batch refresh: expand bean A → tick fires → batches refetched and rerendered.
- Failure mode: stub second fetch as 500 → `RefreshErrorBadge` visible, list intact; stub third as 200 → badge clears.

## Out-of-scope but worth tracking

- **Concurrent edit conflicts.** Last-write-wins remains. Resolving requires server-side optimistic concurrency (`If-Match` with bean/grinder version or ETag) — a separate upstream feature.
- **Pull-to-refresh / manual refresh button.** Visibility/focus matches user mental model; manual control adds noise unless requested later.
- **WebSocket change events** (e.g., `beansChanged`, `grindersChanged`). Considered and rejected for this scope — overkill for low-frequency entities and large server-side surface area; ETag delivers the bandwidth/render win cheaply.

## Upstream coordination

File a feature request against `tadelv/reaprime`:

> **Title:** Add ETag / If-None-Match support on `/api/v1/beans` and `/api/v1/grinders`
>
> **Body:** Multi-device skin clients need a cheap way to detect "nothing changed since I last polled". The same pattern is already used for skin metadata (`WebUIReaMetadata.etag`). Proposal: compute a stable hash over the response payload (or storage version counter) and serve as `ETag`; honor `If-None-Match` with `304 Not Modified`. On the skin side this lets `useBeans` / `useGrinders` poll on tab visibility resume with near-zero cost when nothing has changed. Companion fix: tadelv/passione#<tracking-issue> (filled in after the Passione tracking issue is opened).

The Phase 2 client work blocks on this issue landing.

## Sequencing

1. Phase 1 implementation (`useDataRefresh`, singleton-ify `useBeans`, watchers, `RefreshErrorBadge`, BeansTab/GrindersTab wiring, tests).
2. File upstream issue.
3. Ship Phase 1 — fully resolves the user complaint.
4. When upstream lands, add ETag layer in `rest.js` + tests. Phase 2 ships transparently.
