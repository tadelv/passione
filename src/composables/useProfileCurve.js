/**
 * Shared pure helpers for applying a recipe-level brew-temperature override to
 * a saved execution profile WITHOUT mutating the cached/original profile.
 *
 * A recipe's `brewTemperature` is an override expressed as the profile's
 * first-step temperature. It is applied as a DELTA — every step shifts by the
 * same amount, preserving the per-step temperature curve ([90, 86] + 4 °C
 * yields [94, 90], not [94, 94]). A flat absolute overwrite would flatten
 * gentle ramp-down profiles.
 *
 * REA profiles commonly serialize step temperatures as numeric strings
 * ("93.0"), so temps are coerced via Number() before arithmetic; non-numeric /
 * non-finite values fall back to the override value rather than poisoning the
 * curve. The override only applies when it is finite.
 *
 * Used by the recipe editor's live-apply path (useRecipeLiveApply) and by
 * loading a saved recipe into the live workflow (buildComboUpdate).
 */

/** First-step temperature (rounded to 1 decimal) used to anchor the delta. */
export function profileFirstStepTemp(profile) {
  if (!profile) return null
  const steps = profile.steps ?? profile.frames ?? []
  if (!steps.length) return null
  const t = Number(steps[0]?.temperature)
  return Number.isFinite(t) ? Math.round(t * 10) / 10 : null
}

/** True when applying brewTemperature would change the profile's first step. */
export function brewOverrideNeeded(profile, brewTemperature) {
  if (brewTemperature == null || !Number.isFinite(Number(brewTemperature))) return false
  const first = profileFirstStepTemp(profile)
  if (first == null) return false
  return Math.abs(Number(brewTemperature) - first) > 0.05
}

/**
 * Returns a deep clone with every step shifted by the delta from the first
 * step (first step anchored at brewTemperature), or null when there is no
 * profile / steps / finite override to apply. Input profile is never mutated.
 */
export function applyBrewTemperatureOverride(profile, brewTemperature) {
  if (!profile || brewTemperature == null) return null
  const bt = Number(brewTemperature)
  if (!Number.isFinite(bt)) return null
  const steps = profile.steps ?? profile.frames ?? []
  if (!steps.length) return null
  const clone = JSON.parse(JSON.stringify(profile))
  const cloneSteps = clone.steps ?? clone.frames
  const first = Number(cloneSteps[0]?.temperature)
  const delta = Number.isFinite(first) ? bt - Math.round(first * 10) / 10 : 0
  for (const s of cloneSteps) {
    const tv = Number(s.temperature)
    s.temperature = Number.isFinite(tv) ? Math.round((tv + delta) * 10) / 10 : bt
  }
  return clone
}
