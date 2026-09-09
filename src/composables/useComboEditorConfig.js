/**
 * Config for the home `comboEditor` widget: which quick-edit tools are
 * visible. Tool ordering is fixed in v1 (no reordering); visibility is a
 * plain boolean per tool, persisted under the `comboEditorTools` setting.
 *
 * Invariant: at least one quick-edit tool is always enabled. The UI refuses
 * to toggle off the last enabled tool and normalizeComboEditorTools restores
 * defaults for any externally-corrupted all-off config, so a stored/loaded
 * config can never end up with zero tools.
 */

export const COMBO_EDITOR_TOOL_ORDER = [
  'coffee',
  'grind',
  'dose',
  'temperature',
  'grinderRpm',
  'basket',
]

export const COMBO_EDITOR_TOOL_DEFAULTS = {
  coffee: true,
  grind: true,
  dose: true,
  temperature: false,
  grinderRpm: false,
  basket: false,
}

/** Sanitize a stored config: known keys only, booleans, all-off → defaults. */
export function normalizeComboEditorTools(raw) {
  const out = {}
  let any = false
  for (const key of COMBO_EDITOR_TOOL_ORDER) {
    const v = raw && typeof raw === 'object' ? raw[key] : undefined
    // Explicit booleans win; absent keys fall back to that tool's default so
    // a partial stored config never silently hides a default-visible tool.
    out[key] = typeof v === 'boolean' ? v : COMBO_EDITOR_TOOL_DEFAULTS[key]
    any = any || out[key]
  }
  if (!any) Object.assign(out, COMBO_EDITOR_TOOL_DEFAULTS)
  return out
}
