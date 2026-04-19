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
  inflight = (async () => {
    try {
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
      // Only commit if no invalidation occurred during the fetch.
      if (myGeneration === generation) cache.value = allShots
      return allShots
    } finally {
      inflight = null
    }
  })()
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
