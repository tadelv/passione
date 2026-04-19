/**
 * Module-level cache of the shot ID list.
 *
 * Singleton by design — `ids` is shared module state, not per-caller.
 * The full ID list is fetched once per session and reused by the detail
 * page (swipe nav) and any other consumer that needs the ordered ID list.
 * Call invalidate() whenever shots are created, deleted, or reordered.
 */

import { ref } from 'vue'
import { getShotIds as fetchShotIds } from '../api/rest.js'

const ids = ref(null) // null = not loaded yet
let inflight = null
let generation = 0

async function ensureLoaded() {
  if (ids.value !== null) return ids.value
  if (inflight) return inflight
  const myGeneration = generation
  inflight = (async () => {
    try {
      const result = await fetchShotIds()
      const list = Array.isArray(result) ? result : (result?.ids ?? [])
      // Only commit to the cache if no invalidation happened during the fetch.
      if (myGeneration === generation) ids.value = list
      return list
    } catch {
      // Don't poison the cache — leave ids null so the next call retries.
      return []
    } finally {
      inflight = null
    }
  })()
  return inflight
}

function invalidate() {
  ids.value = null
  inflight = null
  generation++
}

export function useShotIds() {
  return { ids, ensureLoaded, invalidate }
}
