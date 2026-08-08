/**
 * Grinder grind-setting precision helpers.
 *
 * Grinder records carry optional step config (`settingSmallStep` /
 * `settingBigStep`, doubles — see GrindersTab and the DYE TDB import). When
 * steps are defined, the grind setting is a physical dial position: it must
 * snap to the step grid, and its decimal precision derives from the step
 * size (0.5-step → 1 decimal, 1-step → integers). Precision is capped at 2
 * decimal places. Without step config (stepless grinders, unlinked free
 * text), values are only capped at 2 decimals — no snapping.
 */

function round2(n) {
  return Math.round(n * 100) / 100
}

// Small-step grid to step by; falls back to the coarse step, then 0.5.
export function grinderSettingStep(grinder) {
  return grinder?.settingSmallStep ?? grinder?.settingBigStep ?? 0.5
}

// Display precision (decimal places) for the grinder's step, capped at 2.
export function grinderSettingDecimals(grinder) {
  const s = String(grinderSettingStep(grinder))
  const dot = s.indexOf('.')
  const d = dot === -1 ? 0 : s.length - dot - 1
  return Math.min(d, 2)
}

/**
 * Normalize a grind setting value for storage/display. With a defined step,
 * snap to the step grid (capped at 2 decimals); otherwise just cap at 2
 * decimals. Non-numeric strings (free text, "14 1400rpm" annotations) pass
 * through untouched.
 */
export function roundGrinderSetting(value, grinder) {
  if (value == null || value === '') return value
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  const step = grinder?.settingSmallStep ?? grinder?.settingBigStep
  if (step != null && step > 0) {
    return String(round2(Math.round(n / step) * step))
  }
  return String(round2(n))
}
