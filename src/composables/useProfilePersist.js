/**
 * Save policy for profile editors, matching the REA Profiles API contract
 * (vendor/reaprime/doc/Profiles.md):
 *
 *  - Default (bundled) profiles cannot have their `profile` field modified via
 *    PUT — only metadata. Editing a default's execution fields must instead
 *    POST a NEW child profile with `parentId` set to the default's id.
 *  - PUT that changes execution fields makes the server delete the old record
 *    and return a NEW content-hash id. Callers MUST adopt the returned record's
 *    id; the old id no longer exists.
 *
 * Returns the saved ProfileRecord (with its possibly-new id). Callers should
 * set their local `record` to it and, if the route is id-based and the id
 * changed, replace the route.
 */

import { createProfile, updateProfile } from '../api/rest.js'

export async function persistProfile(reaProfile, record) {
  const isDefault = record?.isDefault === true
  const existingId = record?.id

  if (existingId && !isDefault) {
    // User profile: update in place. Server may hand back a new hash id.
    return await updateProfile(existingId, reaProfile)
  }

  // New profile, or a fork of a default (defaults are immutable execution-wise).
  const body = { profile: reaProfile }
  if (isDefault && existingId) body.parentId = existingId
  return await createProfile(body)
}
