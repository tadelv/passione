/**
 * Composable for managing the configurable home screen layout.
 *
 * Layout configuration is stored in the Streamline-Bridge KV store
 * under the namespace "decenza-js" with key "layout". The v2 layout
 * defines 6 named zones. All zones support multiple widgets.
 * Center zones stack vertically, edge zones stack horizontally.
 *
 * API:
 *   GET  /api/v1/store/decenza-js/layout
 *   POST /api/v1/store/decenza-js/layout
 */

import { ref, readonly } from 'vue'
import { getStoreValue, setStoreValue } from '../api/rest'

const NAMESPACE = 'decenza-js'
const STORE_KEY = 'layout'

// ---- Zone & widget definitions (v2) ----------------------------------------

const ZONE_NAMES = [
  'topLeft',
  'topRight',
  'centerLeft',
  'centerRight',
  'bottomLeft',
  'bottomRight',
]

const ZONE_LABELS = {
  topLeft: 'Top Left',
  topRight: 'Top Right',
  centerLeft: 'Center Left',
  centerRight: 'Center Right',
  bottomLeft: 'Bottom Left',
  bottomRight: 'Bottom Right',
}

// Center zones stack vertically; edge zones stack horizontally
const STACK_ZONES = new Set(['centerLeft', 'centerRight'])

const WIDGET_TYPES = [
  'gauge',
  'actionButtons',
  'shotPlan',
  'lastShot',
  'workflowPresets',
  'steamPresets',
  'hotWaterPresets',
  'flushPresets',
  'clock',
  'waterLevel',
  'statusInfo',
  'navButtons',
  'connectionStatus',
  'scaleInfo',
  'fullscreen',
]

const WIDGET_LABELS = {
  gauge: 'Temperature Gauge',
  actionButtons: 'Action Buttons',
  shotPlan: 'Shot Plan',
  lastShot: 'Last Shot',
  workflowPresets: 'Workflow Presets',
  steamPresets: 'Steam Presets',
  hotWaterPresets: 'Hot Water Presets',
  flushPresets: 'Flush Presets',
  clock: 'Clock',
  waterLevel: 'Water Level',
  statusInfo: 'Status Info',
  navButtons: 'Navigation Buttons',
  connectionStatus: 'Connection Status',
  scaleInfo: 'Scale Info',
  fullscreen: 'Fullscreen Toggle',
}

// Which zones each widget type is allowed in
const WIDGET_ZONE_RULES = {
  gauge: 'center',
  actionButtons: 'center',
  shotPlan: 'center',
  lastShot: 'center',
  workflowPresets: 'center',
  steamPresets: 'center',
  hotWaterPresets: 'center',
  flushPresets: 'center',
  clock: 'any',
  waterLevel: 'any',
  statusInfo: 'edge',
  navButtons: 'edge',
  connectionStatus: 'edge',
  scaleInfo: 'edge',
  fullscreen: 'edge',
}

// ---- Default layout (v2) ----------------------------------------------------

const DEFAULT_LAYOUT = {
  version: 2,
  zones: {
    topLeft:     { widgets: ['connectionStatus', 'scaleInfo', 'waterLevel'] },
    topRight:    { widgets: ['fullscreen'] },
    centerLeft:  { widgets: ['gauge'] },
    centerRight: { widgets: ['actionButtons', 'shotPlan', 'workflowPresets'] },
    bottomLeft:  { widgets: ['navButtons'] },
    bottomRight: { widgets: [] },
  },
}

// ---- Singleton state --------------------------------------------------------

let _instance = null

export function useLayout() {
  if (_instance) return _instance

  const layout = ref(structuredClone(DEFAULT_LAYOUT))
  const loaded = ref(false)
  const loading = ref(false)

  /**
   * Validate a layout object. Returns a sanitised v2 copy or null if invalid.
   * Rejects v1 layouts (returns null so defaults apply).
   */
  function validateLayout(raw) {
    if (!raw || typeof raw !== 'object') return null
    if (!raw.zones || typeof raw.zones !== 'object') return null
    if (raw.version !== 2) return null

    const validated = { version: 2, zones: {} }

    for (const zoneName of ZONE_NAMES) {
      const zoneConfig = raw.zones[zoneName]
      if (!zoneConfig || !Array.isArray(zoneConfig.widgets)) {
        validated.zones[zoneName] = { widgets: [] }
        continue
      }
      const widgets = zoneConfig.widgets.filter(w => WIDGET_TYPES.includes(w))
      validated.zones[zoneName] = { widgets }
    }

    return validated
  }

  /**
   * Load layout from the KV store. Falls back to DEFAULT_LAYOUT
   * if no stored config exists or the stored value is invalid.
   */
  async function load() {
    loading.value = true
    try {
      const data = await getStoreValue(NAMESPACE, STORE_KEY)
      const validated = validateLayout(data)
      if (validated) {
        layout.value = validated
      } else {
        layout.value = structuredClone(DEFAULT_LAYOUT)
      }
    } catch {
      // Key does not exist yet or network error -- use defaults
      layout.value = structuredClone(DEFAULT_LAYOUT)
    } finally {
      loaded.value = true
      loading.value = false
    }
  }

  /**
   * Save the current layout to the KV store.
   */
  async function saveLayout() {
    try {
      await setStoreValue(NAMESPACE, STORE_KEY, layout.value)
    } catch (e) {
      console.warn('[useLayout] Failed to save layout:', e.message)
    }
  }

  /**
   * Set the widgets for a specific zone and persist.
   * Non-stack zones are limited to a single widget.
   */
  async function setZoneWidgets(zoneName, widgets) {
    if (!ZONE_NAMES.includes(zoneName)) return
    const filtered = widgets.filter(w => WIDGET_TYPES.includes(w))
    layout.value = {
      ...layout.value,
      zones: {
        ...layout.value.zones,
        [zoneName]: { widgets: filtered },
      },
    }
    await saveLayout()
  }

  /**
   * Clear all widgets from a zone and persist.
   */
  async function clearZone(zoneName) {
    await setZoneWidgets(zoneName, [])
  }

  /**
   * Replace the entire layout and persist.
   */
  async function setLayout(newLayout) {
    const validated = validateLayout(newLayout)
    if (!validated) return
    layout.value = validated
    await saveLayout()
  }

  /**
   * Reset to the default layout and persist.
   */
  async function resetLayout() {
    layout.value = structuredClone(DEFAULT_LAYOUT)
    await saveLayout()
  }

  _instance = {
    layout: readonly(layout),
    loaded: readonly(loaded),
    loading: readonly(loading),
    load,
    saveLayout,
    setZoneWidgets,
    clearZone,
    setLayout,
    resetLayout,
    WIDGET_TYPES,
    WIDGET_LABELS,
    WIDGET_ZONE_RULES,
    ZONE_NAMES,
    ZONE_LABELS,
    STACK_ZONES,
    DEFAULT_LAYOUT,
  }

  return _instance
}
