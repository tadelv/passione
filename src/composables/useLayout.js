/**
 * Composable for managing the configurable home screen layout.
 *
 * Layout configuration is stored in the Streamline-Bridge KV store
 * under the namespace "decenza-js" with key "layout". The layout
 * defines up to 8 named zones, each rendering a specific widget type.
 *
 * API:
 *   GET  /api/v1/store/decenza-js/layout
 *   POST /api/v1/store/decenza-js/layout
 */

import { ref, readonly } from 'vue'
import { getStoreValue, setStoreValue } from '../api/rest'

const NAMESPACE = 'decenza-js'
const STORE_KEY = 'layout'

// ---- Default layout (matches current IdlePage appearance) ----------------

const DEFAULT_LAYOUT = {
  version: 1,
  zones: {
    topBar: { type: 'statusInfo' },
    centerLeft: { type: 'gauge', config: { showLabel: true } },
    centerMain: { type: 'actionButtons' },
    centerRight: { type: 'shotPlan' },
    bottomBar: { type: 'navButtons' },
  },
}

// All supported widget types
const WIDGET_TYPES = [
  'gauge',
  'actionButtons',
  'presetPills',
  'shotPlan',
  'profileName',
  'clock',
  'waterLevel',
  'connectionStatus',
  'statusBar',
  'statusInfo',
  'bottomBar',
  'navButtons',
  'empty',
]

// Human-readable labels for widget types (used by LayoutTab)
const WIDGET_LABELS = {
  gauge: 'Temperature Gauge',
  actionButtons: 'Action Buttons',
  presetPills: 'Preset Pills',
  shotPlan: 'Shot Plan',
  profileName: 'Profile Name',
  clock: 'Clock',
  waterLevel: 'Water Level',
  connectionStatus: 'Connection Status',
  statusBar: 'Full Status Bar',
  statusInfo: 'Status Info',
  bottomBar: 'Bottom Bar',
  navButtons: 'Navigation Buttons',
  empty: 'Empty',
}

// All supported zone names
const ZONE_NAMES = [
  'topBar',
  'centerLeft',
  'centerMain',
  'centerRight',
  'bottomBar',
  'extraTop',
  'extraBottom',
  'extraOverlay',
]

// Human-readable labels for zone names (used by LayoutTab)
const ZONE_LABELS = {
  topBar: 'Top Bar',
  centerLeft: 'Center Left',
  centerMain: 'Center Main',
  centerRight: 'Center Right',
  bottomBar: 'Bottom Bar',
  extraTop: 'Extra Top',
  extraBottom: 'Extra Bottom',
  extraOverlay: 'Extra Overlay',
}

// ---- Singleton state -----------------------------------------------------

let _instance = null

export function useLayout() {
  if (_instance) return _instance

  const layout = ref(structuredClone(DEFAULT_LAYOUT))
  const loaded = ref(false)
  const loading = ref(false)

  /**
   * Validate a layout object. Returns a sanitised copy or null if invalid.
   */
  function validateLayout(raw) {
    if (!raw || typeof raw !== 'object') return null
    if (!raw.zones || typeof raw.zones !== 'object') return null

    const validated = {
      version: raw.version ?? 1,
      zones: {},
    }

    for (const [zoneName, zoneConfig] of Object.entries(raw.zones)) {
      if (!ZONE_NAMES.includes(zoneName)) continue
      if (!zoneConfig || typeof zoneConfig !== 'object') continue
      if (!WIDGET_TYPES.includes(zoneConfig.type)) continue

      validated.zones[zoneName] = {
        type: zoneConfig.type,
        ...(zoneConfig.config ? { config: zoneConfig.config } : {}),
      }
    }

    // Preserve optional statusBarConfig (controls StatusBar section visibility)
    if (raw.statusBarConfig && typeof raw.statusBarConfig === 'object') {
      validated.statusBarConfig = { ...raw.statusBarConfig }
    }

    // Must have at least one zone
    if (Object.keys(validated.zones).length === 0) return null

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
   * Update a single zone and persist.
   */
  async function setZone(zoneName, zoneConfig) {
    if (!ZONE_NAMES.includes(zoneName)) return
    if (!zoneConfig || !WIDGET_TYPES.includes(zoneConfig.type)) return

    layout.value = {
      ...layout.value,
      zones: {
        ...layout.value.zones,
        [zoneName]: {
          type: zoneConfig.type,
          ...(zoneConfig.config ? { config: zoneConfig.config } : {}),
        },
      },
    }
    await saveLayout()
  }

  /**
   * Remove a zone from the layout and persist.
   */
  async function removeZone(zoneName) {
    if (!layout.value.zones[zoneName]) return

    const newZones = { ...layout.value.zones }
    delete newZones[zoneName]
    layout.value = { ...layout.value, zones: newZones }
    await saveLayout()
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

  /**
   * Get the config for a specific zone, or null if the zone is not defined.
   */
  function getZone(zoneName) {
    return layout.value.zones[zoneName] ?? null
  }

  _instance = {
    layout: readonly(layout),
    loaded: readonly(loaded),
    loading: readonly(loading),
    load,
    saveLayout,
    setZone,
    removeZone,
    setLayout,
    resetLayout,
    getZone,
    WIDGET_TYPES,
    WIDGET_LABELS,
    ZONE_NAMES,
    ZONE_LABELS,
    DEFAULT_LAYOUT,
  }

  return _instance
}
