/**
 * Dirty-state helpers for workflow combos and operation presets.
 *
 * Used by IdlePage / LayoutWidget to flag a selected workflow combo as
 * "modified" when the live workflow has diverged from the saved combo,
 * and by WorkflowEditorPage to flag the same thing based on its local
 * form state. Also exports a generic helper for operation presets
 * (steam / hot water / flush) once those preset rows are wired.
 */

// ---- Normalizers ----
//
// When an operation is "off" on a combo, only the duration (or volume)
// field matters. Persistence may have carried extra fields alongside a
// duration: 0 record, and the form rebuilds the "off" shape without
// them — these helpers strip the irrelevant sub-fields before compare.

export function effectiveSteam(s) {
  if (!s || (s.duration ?? 0) === 0) return { duration: 0 }
  return {
    duration: s.duration ?? 0,
    flow: s.flow ?? null,
    temperature: s.temperature ?? null,
  }
}

export function effectiveFlush(s) {
  if (!s || (s.duration ?? 0) === 0) return { duration: 0 }
  return {
    duration: s.duration ?? 0,
    flow: s.flow ?? null,
  }
}

export function effectiveHotWater(s) {
  if (!s || (s.volume ?? 0) === 0) return { volume: 0 }
  return {
    volume: s.volume ?? 0,
    temperature: s.temperature ?? null,
  }
}

// Scalar combo fields compared across both use cases. Split into:
//  - "identity" fields that describe the recipe itself
//  - "ref" fields that point at persisted bean/grinder records
const SCALAR_KEYS = [
  'profileId', 'profileTitle', 'coffeeName', 'roaster',
  'doseIn', 'doseOut', 'grinder', 'grinderSetting',
  'selectedBeanId', 'selectedBatchId', 'selectedGrinderId',
]

function norm(v) {
  if (v == null || v === '') return null
  return v
}

function scalarsDiffer(a, b, { requireSavedNonNull }) {
  for (const k of SCALAR_KEYS) {
    const saved = norm(b[k])
    const curr = norm(a[k])
    // Lenient mode: skip fields the saved combo never pinned. Used by
    // IdlePage, where the live workflow can carry leftovers from a prior
    // combo and those shouldn't read as "modified" against a combo that
    // never cared about them in the first place.
    if (requireSavedNonNull && saved == null) continue
    if (saved !== curr) return true
  }
  return false
}

/**
 * Project a live workflow object (from useWorkflow) into a combo-shaped
 * snapshot suitable for comparison against a saved workflow combo.
 *
 * Grinder setting and record IDs are string-normalized to dodge the
 * number-vs-string equality trap that already shows up in IdlePage's
 * combo load path.
 */
export function workflowToComboShape(workflow) {
  if (!workflow) return null
  const ctx = workflow.context ?? {}
  const ss = workflow.steamSettings
  const rd = workflow.rinseData
  const hw = workflow.hotWaterData

  return {
    profileId: workflow.profile?.id ?? null,
    profileTitle: workflow.profile?.title ?? null,
    coffeeName: ctx.coffeeName || null,
    roaster: ctx.coffeeRoaster || null,
    doseIn: ctx.targetDoseWeight ?? null,
    doseOut: ctx.targetYield ?? null,
    grinder: ctx.grinderModel || null,
    grinderSetting: ctx.grinderSetting != null ? String(ctx.grinderSetting) : null,
    selectedBeanId: null, // not pinned on the workflow — beanId is combo metadata
    selectedBatchId: ctx.beanBatchId ? String(ctx.beanBatchId) : null,
    selectedGrinderId: ctx.grinderId ? String(ctx.grinderId) : null,
    includeSteam: !!(ss && (ss.duration ?? 0) > 0),
    steamSettings: ss
      ? { duration: ss.duration ?? 0, flow: ss.flow ?? null, temperature: ss.targetTemperature ?? null }
      : { duration: 0 },
    includeFlush: !!(rd && (rd.duration ?? 0) > 0),
    flushSettings: rd
      ? { duration: rd.duration ?? 0, flow: rd.flow ?? null }
      : { duration: 0 },
    includeHotWater: !!(hw && (hw.volume ?? 0) > 0),
    hotWaterSettings: hw
      ? { volume: hw.volume ?? 0, temperature: hw.targetTemperature ?? null }
      : { volume: 0 },
  }
}

/**
 * String-normalize the record-reference fields on a saved combo so both
 * sides of a comparison see the same type for selectedGrinderId / etc.
 * The saved combo object is not mutated.
 */
export function normalizeSavedCombo(combo) {
  if (!combo) return null
  return {
    ...combo,
    grinderSetting: combo.grinderSetting != null ? String(combo.grinderSetting) : null,
    selectedBatchId: combo.selectedBatchId != null ? String(combo.selectedBatchId) : null,
    selectedGrinderId: combo.selectedGrinderId != null ? String(combo.selectedGrinderId) : null,
  }
}

/**
 * Lenient compare: used by IdlePage. Flags a saved combo as modified
 * when the live workflow differs on any field the saved combo
 * explicitly pinned. Fields the combo left null are skipped — the live
 * workflow may carry leftovers from a previously-loaded combo, and that
 * is not the user's change.
 */
export function isComboModifiedVsWorkflow(savedRaw, workflow) {
  if (!savedRaw || !workflow) return false
  const saved = normalizeSavedCombo(savedRaw)
  const current = workflowToComboShape(workflow)
  if (!current) return false

  if (scalarsDiffer(current, saved, { requireSavedNonNull: true })) return true

  if (saved.includeSteam) {
    const a = JSON.stringify(effectiveSteam(saved.steamSettings))
    const b = JSON.stringify(effectiveSteam(current.steamSettings))
    if (a !== b) return true
  }
  if (saved.includeFlush) {
    const a = JSON.stringify(effectiveFlush(saved.flushSettings))
    const b = JSON.stringify(effectiveFlush(current.flushSettings))
    if (a !== b) return true
  }
  if (saved.includeHotWater) {
    const a = JSON.stringify(effectiveHotWater(saved.hotWaterSettings))
    const b = JSON.stringify(effectiveHotWater(current.hotWaterSettings))
    if (a !== b) return true
  }
  return false
}

/**
 * Strict compare: used by WorkflowEditorPage. Every scalar field and
 * every include flag must match exactly. The form-shape object is built
 * by the editor from its own reactive refs — see comboValues() in
 * WorkflowEditorPage.vue.
 */
export function isComboModifiedVsForm(savedRaw, formShape) {
  if (!savedRaw || !formShape) return false
  const saved = normalizeSavedCombo(savedRaw)
  const current = normalizeSavedCombo(formShape) // string-normalize the form too

  if (scalarsDiffer(current, saved, { requireSavedNonNull: false })) return true

  if (current.includeSteam !== !!saved.includeSteam) return true
  if (current.includeFlush !== !!saved.includeFlush) return true
  if (current.includeHotWater !== !!saved.includeHotWater) return true

  if (JSON.stringify(effectiveSteam(current.steamSettings)) !== JSON.stringify(effectiveSteam(saved.steamSettings))) return true
  if (JSON.stringify(effectiveFlush(current.flushSettings)) !== JSON.stringify(effectiveFlush(saved.flushSettings))) return true
  if (JSON.stringify(effectiveHotWater(current.hotWaterSettings)) !== JSON.stringify(effectiveHotWater(saved.hotWaterSettings))) return true

  return false
}

/**
 * Generic preset-dirty check for operation presets (steam / hot water /
 * flush). Not yet consumed — operation preset pill rows are not wired
 * in the current UI — but left here so SteamPage / HotWaterPage /
 * FlushPage can opt in without touching this file when the preset row
 * lands. Pass a [[presetKey, liveKey], ...] mapping.
 *
 *   isPresetModified(
 *     presets[selectedIdx],
 *     settings.settings,
 *     [['duration', 'steamDuration'], ['flow', 'steamFlow']],
 *   )
 */
export function isPresetModified(preset, live, fieldPairs) {
  if (!preset || !live || !fieldPairs?.length) return false
  for (const [presetKey, liveKey] of fieldPairs) {
    const a = norm(preset[presetKey])
    const b = norm(live[liveKey])
    if (a == null && b == null) continue
    if (a !== b) return true
  }
  return false
}
