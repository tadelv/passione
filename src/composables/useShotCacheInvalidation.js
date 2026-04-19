/**
 * Centralized shot-cache invalidation.
 *
 * Any code path that creates, deletes, or mutates a shot record should call
 * invalidateShotCaches() so all dependent caches (id list, all-shots
 * aggregate, ...) stay in sync. Adding a new shot-related cache means
 * adding it here once instead of touching every shot-write call site.
 */

import { useShotIds } from './useShotIds'
import { useAllShotsCache } from './useAllShotsCache'

export function invalidateShotCaches() {
  useShotIds().invalidate()
  useAllShotsCache().invalidate()
}
