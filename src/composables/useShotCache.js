/**
 * Singleton cache of shot data — both the ordered ID list (for swipe nav)
 * and a paginated walk of slim shot summaries (for AutoFavorites grouping).
 *
 * Module-level state is shared across all callers and survives route nav.
 *
 * - `ids` — plain ref, full ordered ID list. Cheap endpoint.
 * - `slim` — shallowRef of `markRaw`'d records produced by `normalizeShotSlim`.
 *   The full paginated walk (200/page) is expensive; do it once per session.
 *   Each record drops `profile` (frame array dominates retained size).
 *   Capped at MAX_SLIM most-recent records to bound memory on devices with
 *   deep shot history. AutoFavoritesPage aggregation is bounded by this cap.
 *
 * On any shot mutation:
 *   - `patch(id)` — single GET → re-normalize → splice into `slim`. If the id
 *     is new, prepend to both arrays.
 *   - `remove(id)` — splice from both, no fetch.
 *   - `refresh()` — escape hatch; nukes both. Used after structural changes.
 */

import { ref, shallowRef, markRaw } from 'vue'
import {
  getShotIds as fetchShotIds,
  getLatestShot,
  getShotsPaginated,
  getShot,
} from '../api/rest.js'
import { normalizeShotSlim } from './useShotNormalize'

const MAX_SLIM = 200

const ids = ref(null)
const slim = shallowRef(null)
// Full record for the most-recent shot. Shared by the home-screen
// last-shot widget so it doesn't fire its own /shots/latest + /shots/<id>
// chain (plus retries) alongside whatever the history page is doing.
const latest = shallowRef(null)
let idsInflight = null
let slimInflight = null
let latestInflight = null
let generation = 0

async function ensureIds() {
  if (ids.value !== null) return ids.value
  if (slim.value) {
    ids.value = slim.value.map((s) => s.id ?? s.shotId).filter((v) => v != null)
    return ids.value
  }
  if (idsInflight) return idsInflight
  const myGeneration = generation
  const myPromise = (async () => {
    try {
      const result = await fetchShotIds()
      const list = Array.isArray(result) ? result : (result?.ids ?? [])
      if (myGeneration !== generation) {
        if (idsInflight === myPromise) idsInflight = null
        return ensureIds()
      }
      ids.value = list
      return list
    } catch {
      return []
    } finally {
      if (idsInflight === myPromise) idsInflight = null
    }
  })()
  idsInflight = myPromise
  return idsInflight
}

async function ensureSlim() {
  if (slim.value) return slim.value
  if (slimInflight) return slimInflight
  const myGeneration = generation
  const myPromise = (async () => {
    try {
      const allShots = []
      let offset = 0
      const limit = 200
      while (true) {
        if (myGeneration !== generation) break
        const result = await getShotsPaginated(limit, offset)
        for (const item of result.items) {
          allShots.push(markRaw(normalizeShotSlim(item)))
        }
        offset += result.items.length
        if (allShots.length >= MAX_SLIM) break
        if (offset >= result.total || result.items.length === 0) break
      }
      if (allShots.length > MAX_SLIM) allShots.length = MAX_SLIM
      if (myGeneration !== generation) {
        if (slimInflight === myPromise) slimInflight = null
        return ensureSlim()
      }
      slim.value = allShots
      // Free side-effect: derive ids if not loaded.
      if (ids.value === null) {
        ids.value = allShots.map((s) => s.id ?? s.shotId).filter((v) => v != null)
      }
      return allShots
    } finally {
      if (slimInflight === myPromise) slimInflight = null
    }
  })()
  slimInflight = myPromise
  return slimInflight
}

/**
 * Resolve the most-recent shot record. Used by the home-screen last-shot
 * widget; previously the widget did its own getLatestShot + getShot chain
 * with a 5-retry × 2 s loop on empty, which was the worst-case offender on
 * cold start. Now the chain runs once per session and is shared.
 *
 * Returns the full shot record (same shape as `getShot`). Returns null if
 * the gateway has no shots yet.
 */
async function ensureLatest() {
  if (latest.value) return latest.value
  if (latestInflight) return latestInflight
  const myGeneration = generation
  const myPromise = (async () => {
    try {
      const summary = await getLatestShot()
      if (!summary?.id) return null
      const full = await getShot(summary.id)
      if (myGeneration !== generation) return null
      if (full) latest.value = markRaw(full)
      return latest.value
    } finally {
      if (latestInflight === myPromise) latestInflight = null
    }
  })()
  latestInflight = myPromise
  return latestInflight
}

/**
 * Force a re-fetch of the latest shot — used after an espresso ends so the
 * widget picks up the freshly-saved record. Cheaper than `refresh()` because
 * it leaves the slim and ids caches intact.
 */
async function refreshLatest() {
  latest.value = null
  latestInflight = null
  return ensureLatest()
}

function refresh() {
  ids.value = null
  slim.value = null
  latest.value = null
  idsInflight = null
  slimInflight = null
  latestInflight = null
  generation++
}

async function patch(id) {
  if (!id) return
  const raw = await getShot(id)
  if (!raw) return
  const updated = markRaw(normalizeShotSlim(raw))
  if (slim.value) {
    const list = slim.value
    const idx = list.findIndex((s) => (s.id ?? s.shotId) === id)
    if (idx >= 0) {
      const next = list.slice()
      next[idx] = updated
      slim.value = next
    } else {
      const next = [updated, ...list]
      if (next.length > MAX_SLIM) next.length = MAX_SLIM
      slim.value = next
    }
  }
  if (ids.value !== null && !ids.value.includes(id)) {
    ids.value = [id, ...ids.value]
  }
  // Keep `latest` in sync — when a shot mutation lands on the current
  // most-recent id, the widget should see the update without its own fetch.
  if (latest.value && (latest.value.id ?? latest.value.shotId) === id) {
    latest.value = markRaw(raw)
  }
}

function remove(id) {
  if (!id) return
  if (slim.value) {
    slim.value = slim.value.filter((s) => (s.id ?? s.shotId) !== id)
  }
  if (ids.value !== null) {
    ids.value = ids.value.filter((v) => v !== id)
  }
  if (latest.value && (latest.value.id ?? latest.value.shotId) === id) {
    latest.value = null
    latestInflight = null
  }
}

export function useShotCache() {
  return { ids, slim, latest, ensureIds, ensureSlim, ensureLatest, refresh, refreshLatest, patch, remove }
}
