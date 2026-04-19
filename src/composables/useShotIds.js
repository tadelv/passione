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
