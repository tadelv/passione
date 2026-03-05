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
  const meta = shot.metadata ?? {}

  // Dose — context first, then legacy doseData, then shot root
  if (result.doseIn == null) result.doseIn = ctx.targetDoseWeight ?? dd.doseIn ?? dd.dose ?? null
  if (result.doseOut == null) result.doseOut = ctx.targetYield ?? dd.doseOut ?? dd.targetWeight ?? null

  // Coffee — context first, then legacy coffeeData, then metadata
  if (result.coffeeName == null) result.coffeeName = ctx.coffeeName ?? coffee.name ?? meta.beanType ?? null
  if (result.coffeeRoaster == null) result.coffeeRoaster = ctx.coffeeRoaster ?? coffee.roaster ?? meta.roaster ?? null

  // Grinder — context first, then legacy grinderData, then metadata
  if (result.grinderModel == null) {
    result.grinderModel = ctx.grinderModel ?? grinder.model ?? [grinder.manufacturer, grinder.grinder ?? grinder.name].filter(Boolean).join(' ') || null
  }
  if (result.grinderSetting == null) result.grinderSetting = ctx.grinderSetting ?? grinder.setting ?? grinder.grindSetting ?? meta.grinderSetting ?? null

  // Entity IDs (for enrichment)
  result.grinderId = ctx.grinderId ?? null
  result.beanBatchId = ctx.beanBatchId ?? null

  // Metadata fields
  if (result.rating == null) result.rating = meta.rating ?? null

  return result
}
