/**
 * Module-level cache of the full profile records list.
 *
 * Singleton by design — the cache is shared across all callers and survives
 * route navigation. Backing fetch returns the entire profile catalog from
 * /api/v1/profiles; cache it once per session.
 *
 * Call invalidate() whenever profiles are created, updated, or deleted.
 */

import { ref } from 'vue'
import { getProfiles } from '../api/rest.js'

const profiles = ref(null)
let inflight = null
let generation = 0

async function ensureLoaded() {
  if (profiles.value) return profiles.value
  if (inflight) return inflight
  const myGeneration = generation
  let myPromise
  myPromise = (async () => {
    try {
      const data = await getProfiles()
      const list = Array.isArray(data) ? data : (data?.records ?? [])
      if (myGeneration !== generation) {
        // Invalidation happened during fetch — return canonical fresh result.
        if (inflight === myPromise) inflight = null
        return ensureLoaded()
      }
      profiles.value = list
      return list
    } finally {
      if (inflight === myPromise) inflight = null
    }
  })()
  inflight = myPromise
  return inflight
}

function invalidate() {
  profiles.value = null
  inflight = null
  generation++
}

export function useProfilesCache() {
  return { profiles, ensureLoaded, invalidate }
}
