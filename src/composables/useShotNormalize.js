/**
 * Normalize a shot record to flat fields, reading context first then legacy.
 * Used by shot history, detail, review, and layout widgets.
 */
export function normalizeShot(shot) {
  if (!shot) return shot
  const result = { ...shot }
  const w = shot.workflow ?? {}
  const ctx = w.context ?? {}
  const dd = w.doseData ?? {}
  const coffee = w.coffeeData ?? {}
  const grinder = w.grinderData ?? {}
  const ann = shot.annotations ?? {}
  const meta = shot.metadata ?? {}

  // Dose — annotations first, then context, then legacy doseData, then shot root
  if (result.doseIn == null) result.doseIn = ann.actualDoseWeight ?? ctx.targetDoseWeight ?? dd.doseIn ?? dd.dose ?? null
  if (result.doseOut == null) result.doseOut = ann.actualYield ?? ctx.targetYield ?? dd.doseOut ?? dd.targetWeight ?? null

  // Target yield — strictly the planned weight, never the actual reading
  if (result.targetYield == null) result.targetYield = ctx.targetYield ?? dd.doseOut ?? dd.targetWeight ?? null

  // Actual final weight from measurements — read the last non-zero scale
  // sample so the UI can show what landed in the cup separately from the
  // target. Falls back to the pre-flattened weight[] array if present.
  if (result.finalWeight == null) {
    let fw = null
    if (Array.isArray(shot.weight) && shot.weight.length > 0) {
      for (let i = shot.weight.length - 1; i >= 0; i--) {
        const v = Number(shot.weight[i])
        if (Number.isFinite(v) && v > 0) { fw = v; break }
      }
    } else if (Array.isArray(shot.measurements) && shot.measurements.length > 0) {
      for (let i = shot.measurements.length - 1; i >= 0; i--) {
        const m = shot.measurements[i]
        const v = Number(m?.scale?.weight ?? m?.weight)
        if (Number.isFinite(v) && v > 0) { fw = v; break }
      }
    }
    // Fall back to annotations.actualYield if the measurements don't carry
    // scale data (some shot records only persist machine telemetry).
    result.finalWeight = fw ?? ann.actualYield ?? null
  }

  // Coffee — context first, then legacy coffeeData, then metadata
  if (result.coffeeName == null) result.coffeeName = ctx.coffeeName ?? coffee.name ?? meta.beanType ?? null
  if (result.coffeeRoaster == null) result.coffeeRoaster = ctx.coffeeRoaster ?? coffee.roaster ?? meta.roaster ?? null

  // Grinder — context first, then legacy grinderData, then metadata
  if (result.grinderModel == null) {
    const fallbackName = [grinder.manufacturer, (grinder.grinder ?? grinder.name)].filter(Boolean).join(' ') || null
    result.grinderModel = ctx.grinderModel ?? grinder.model ?? fallbackName
  }
  if (result.grinderSetting == null) result.grinderSetting = ctx.grinderSetting ?? grinder.setting ?? grinder.grindSetting ?? meta.grinderSetting ?? null

  // Entity IDs (for enrichment)
  result.grinderId = ctx.grinderId ?? null
  result.beanBatchId = ctx.beanBatchId ?? null

  // Rating & notes — annotations first, then legacy metadata/shotNotes
  if (result.rating == null) result.rating = ann.enjoyment ?? meta.rating ?? null
  if (result.notes == null) result.notes = ann.espressoNotes ?? shot.shotNotes ?? null

  // TDS / EY from annotations
  if (result.tds == null) result.tds = ann.drinkTds ?? meta.tds ?? null
  if (result.ey == null) result.ey = ann.drinkEy ?? null

  // Profile name and object reference
  if (result.profileName == null) result.profileName = w.profile?.title ?? w.name ?? null
  if (!result.profile && w.profile) result.profile = w.profile

  // Barista — annotations.extras first, then legacy metadata
  const extras = ann.extras ?? {}
  if (result.barista == null) result.barista = extras.barista ?? meta.barista ?? null

  // Duration — derived from measurements if not already present
  if (result.duration == null && Array.isArray(result.measurements) && result.measurements.length >= 2) {
    const first = result.measurements[0]
    const last = result.measurements[result.measurements.length - 1]
    const getTs = (m) => {
      if (m.elapsed != null) return m.elapsed
      const ts = m.machine?.timestamp ?? m.timestamp ?? m.scale?.timestamp
      return ts ? (typeof ts === 'number' && ts > 1e12 ? ts / 1000 : new Date(ts).getTime() / 1000) : 0
    }
    const d = getTs(last) - getTs(first)
    if (d > 0) result.duration = d
  }

  return result
}
