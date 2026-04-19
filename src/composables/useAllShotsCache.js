/**
 * Module-level cache of all normalized shot records.
 *
 * Singleton by design — the cache is shared across all callers and survives
 * route navigation. Backing fetch paginates the entire shot history (200 per
 * page) which is expensive; do it once per session and only refetch after
 * an invalidate.
 *
 * Call invalidate() whenever shots are created, deleted, or have their
 * annotations/metadata mutated — i.e. whenever the AutoFavorites grouping
 * inputs could change.
 */

import { ref } from 'vue'
import { getShotsPaginated } from '../api/rest.js'
import { normalizeShot } from './useShotNormalize'

const cache = ref(null)
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
        const shots = result.items.map(normalizeShot)
        allShots.push(...shots)
        offset += shots.length
        if (offset >= result.total || shots.length === 0) break
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
