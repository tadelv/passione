/**
 * Centralized profile-cache invalidation.
 *
 * Any code path that creates, updates, or deletes a profile should call
 * invalidateProfileCaches() so all dependent caches stay in sync. Adding a
 * new profile-related cache means adding it here once instead of touching
 * every profile-write call site.
 */

import { useProfilesCache } from './useProfilesCache'

export function invalidateProfileCaches() {
  useProfilesCache().invalidate()
}
