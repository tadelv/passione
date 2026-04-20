/**
 * Module-level cache of summary shot records (no profiles, no measurements).
 *
 * Singleton by design — the cache is shared across all callers and survives
 * route navigation. Backing fetch paginates the entire shot history (200 per
 * page) which is expensive; do it once per session and only refetch after
 * an invalidate.
 *
 * Memory model: cached records are produced by `normalizeShotSlim` and stored
 * in a `shallowRef`. Each record is `markRaw`'d so Vue does not wrap it in a
 * deep reactive proxy. The `profile` object is intentionally dropped — it
 * carries the frame array and dominates retained size. Callers that need the
 * full profile (e.g. "Load profile into workflow") must refetch the shot by
 * id via `getShot(shot.id)`.
 *
 * Call invalidate() whenever shots are created, deleted, or have their
 * annotations/metadata mutated — i.e. whenever the AutoFavorites grouping
 * inputs could change.
 */

import { shallowRef, markRaw } from 'vue'
import { getShotsPaginated } from '../api/rest.js'
import { normalizeShotSlim } from './useShotNormalize'

const cache = shallowRef(null)
let inflight = null
let generation = 0

async function ensureLoaded() {
  if (cache.value) return cache.value
  if (inflight) return inflight
  const myGeneration = generation
  const myPromise = (async () => {
    try {
      const allShots = []
      let offset = 0
      const limit = 200
      while (true) {
        // Abandon early if invalidation happened during pagination —
        // the freshly-running fetch will produce the canonical result.
        if (myGeneration !== generation) break
        const result = await getShotsPaginated(limit, offset)
        for (const item of result.items) allShots.push(markRaw(normalizeShotSlim(item)))
        offset += result.items.length
        if (offset >= result.total || result.items.length === 0) break
      }
      if (myGeneration !== generation) {
        // Generation changed during fetch — clear our slot first so the
        // recursive call starts a fresh fetch instead of returning our own
        // promise (which would deadlock waiting on itself).
        if (inflight === myPromise) inflight = null
        return ensureLoaded()
      }
      cache.value = allShots
      return allShots
    } finally {
      // Only clear the inflight slot if it still points at our own promise.
      // invalidate() or a recursive ensureLoaded() may have already replaced it.
      if (inflight === myPromise) inflight = null
    }
  })()
  inflight = myPromise
  return inflight
}

function invalidate() {
  cache.value = null
  inflight = null
  generation++
}

export function useAllShotsCache() {
  return { cache, ensureLoaded, invalidate }
}
