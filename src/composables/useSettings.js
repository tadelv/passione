/**
 * Composable for persisting app settings to Streamline-Bridge KV store.
 *
 * Settings are stored under the namespace "decenza-js" with one key per
 * settings group. On mount the composable loads all settings from the
 * server and merges them with defaults. Changes to any ref are debounced
 * and auto-saved back to the KV store.
 *
 * API:
 *   GET  /api/v1/store/decenza-js/{key}
 *   POST /api/v1/store/decenza-js/{key}
 */

import { ref, reactive, watch, onMounted } from 'vue'
import { getStoreValue, setStoreValue } from '../api/rest'

const NAMESPACE = 'decenza-js'
const SAVE_DEBOUNCE_MS = 800

// ---- Defaults ---------------------------------------------------------------

const DEFAULT_SETTINGS = {
  // Steam
  steamDuration: 30,
  steamFlow: 1.5,           // mL/s (actual value)
  steamTemperature: 160,
  keepSteamHeaterOn: false,
  steamDisabled: false,
  steamAutoFlushSeconds: 0,

  // Hot water
  hotWaterVolume: 200,
  hotWaterTemperature: 80,
  hotWaterDuration: 60,    // safety timeout (seconds)
  hotWaterFlow: 6.0,       // mL/s
  hotWaterMode: 'weight',  // 'weight' or 'volume'

  // Flush
  flushDuration: 5,
  flushFlowRate: 6.0,
  flushTemperature: 90,    // °C

  // Presets
  steamPitcherPresets: [],
  selectedSteamPitcherPreset: -1,
  waterVesselPresets: [],
  selectedWaterVesselPreset: -1,
  flushPresets: [],
  selectedFlushPreset: -1,
  workflowCombos: [],
  selectedWorkflowCombo: -1,

  // UI / layout
  waterLevelDisplayUnit: 'mm',  // 'mm' or 'ml'

  // Visualizer
  visualizerUsername: '',
  visualizerPassword: '',
  visualizerAutoUpload: false,
  visualizerMinDuration: 8,
  visualizerExtendedMetadata: false,
  visualizerShowAfterShot: false,
  lingerOnEspressoPage: true,
  defaultShotRating: 50,

  // Theme
  activeThemeName: 'default',
  customThemeColors: {},

  // Screensaver
  screensaverType: 'flipClock',    // 'disabled', 'flipClock', 'lastShot', 'ambientGlow'
  flipClock24h: true,
  flipClock3d: false,

  // Options
  waterRefillThreshold: 10,
  autoSleepMinutes: 30,

  // Espresso / Brew Dialog
  showBrewDialog: false,

  // Accessibility
  accessibilityEnabled: false,
  voiceAnnouncements: false,
  frameTickSounds: false,
  announcementMode: 'milestones',
  announcementInterval: 5,

  // DYE sticky metadata
  dyeBeanBrand: '',
  dyeBeanType: '',
  dyeRoastDate: '',
  dyeRoastLevel: '',
  dyeGrinderModel: '',
  dyeGrinderSetting: '',

}

// ---- Composable -------------------------------------------------------------

// Singleton state — shared across all consumers
let _instance = null

export function useSettings() {
  if (_instance) return _instance

  const loaded = ref(false)
  const settings = reactive({ ...DEFAULT_SETTINGS })

  // Debounce timers per key
  const _saveTimers = {}

  /**
   * Load a single key from the KV store. Merges server values over defaults.
   */
  async function _loadKey(key) {
    try {
      const data = await getStoreValue(NAMESPACE, key)
      if (data != null && typeof data === 'object' && !Array.isArray(data)) {
        // Merge each field from server into settings
        for (const [k, v] of Object.entries(data)) {
          if (k in settings) {
            settings[k] = v
          }
        }
      } else if (data != null && key in settings) {
        // Scalar value stored under its own key
        settings[key] = data
      }
    } catch {
      // Key doesn't exist yet — use defaults
    }
  }

  /**
   * Save a group of settings keys to the KV store.
   */
  async function _saveGroup(groupKey, keys) {
    const payload = {}
    for (const k of keys) {
      payload[k] = settings[k]
    }
    try {
      await setStoreValue(NAMESPACE, groupKey, payload)
    } catch (e) {
      console.warn(`[useSettings] Failed to save ${groupKey}:`, e.message)
    }
  }

  /**
   * Debounced save — schedules a save after SAVE_DEBOUNCE_MS of inactivity.
   */
  function _debouncedSave(groupKey, keys) {
    clearTimeout(_saveTimers[groupKey])
    _saveTimers[groupKey] = setTimeout(() => _saveGroup(groupKey, keys), SAVE_DEBOUNCE_MS)
  }

  // ---- Group definitions for batched load/save ----

  const GROUPS = {
    preferences: [
      'keepSteamHeaterOn', 'steamDisabled',
      'steamAutoFlushSeconds', 'waterLevelDisplayUnit',
      'autoSleepMinutes',
    ],
    steam: [
      'steamDuration', 'steamFlow', 'steamTemperature',
      'steamPitcherPresets', 'selectedSteamPitcherPreset',
    ],
    hotwater: [
      'hotWaterVolume', 'hotWaterTemperature', 'hotWaterDuration', 'hotWaterFlow',
      'hotWaterMode', 'waterVesselPresets', 'selectedWaterVesselPreset',
    ],
    flush: [
      'flushDuration', 'flushFlowRate', 'flushTemperature',
      'flushPresets', 'selectedFlushPreset',
    ],
    combos: [
      'workflowCombos', 'selectedWorkflowCombo',
    ],
    visualizer: [
      'visualizerUsername', 'visualizerPassword', 'visualizerAutoUpload',
      'visualizerMinDuration', 'visualizerExtendedMetadata',
      'visualizerShowAfterShot', 'defaultShotRating',
    ],
    theme: [
      'activeThemeName', 'customThemeColors',
    ],
    screensaver: [
      'screensaverType', 'flipClock24h', 'flipClock3d',
    ],
    options: [
      'waterRefillThreshold',
    ],
    espresso: [
      'showBrewDialog', 'lingerOnEspressoPage',
    ],
    accessibility: [
      'accessibilityEnabled', 'voiceAnnouncements', 'frameTickSounds',
      'announcementMode', 'announcementInterval',
    ],
    dye: [
      'dyeBeanBrand', 'dyeBeanType', 'dyeRoastDate', 'dyeRoastLevel',
      'dyeGrinderModel', 'dyeGrinderSetting',
    ],
  }

  // Build reverse lookup: settingKey → groupKey
  const _keyToGroup = {}
  for (const [groupKey, keys] of Object.entries(GROUPS)) {
    for (const k of keys) {
      _keyToGroup[k] = groupKey
    }
  }

  /**
   * Load all setting groups from the server.
   */
  async function load() {
    const promises = Object.keys(GROUPS).map(groupKey => _loadKey(groupKey))
    await Promise.allSettled(promises)
    _migrateSteamFlow()
    loaded.value = true
  }

  /**
   * One-time migration: steamFlow was stored as integer (e.g. 150 = 1.5 mL/s).
   * Convert to actual float. Also migrates presets and combos.
   */
  function _migrateSteamFlow() {
    if (settings.steamFlow > 10) {
      settings.steamFlow = settings.steamFlow / 100
    }
    // Migrate steam presets
    let presetsChanged = false
    for (const preset of settings.steamPitcherPresets) {
      if (preset.flow != null && preset.flow > 10) {
        preset.flow = preset.flow / 100
        presetsChanged = true
      }
    }
    if (presetsChanged) {
      settings.steamPitcherPresets = [...settings.steamPitcherPresets]
    }
    // Migrate combo steam settings
    let combosChanged = false
    for (const combo of settings.workflowCombos) {
      if (combo.steamSettings?.flow != null && combo.steamSettings.flow > 10) {
        combo.steamSettings.flow = combo.steamSettings.flow / 100
        combosChanged = true
      }
    }
    if (combosChanged) {
      settings.workflowCombos = [...settings.workflowCombos]
    }
  }

  /**
   * Force-save a specific setting immediately (bypasses debounce).
   */
  async function saveImmediate(key) {
    const groupKey = _keyToGroup[key]
    if (groupKey) {
      clearTimeout(_saveTimers[groupKey])
      await _saveGroup(groupKey, GROUPS[groupKey])
    }
  }

  /**
   * Update a setting value and trigger debounced save.
   */
  function set(key, value) {
    if (!(key in settings)) return
    settings[key] = value
  }

  /**
   * Get the current value of a setting.
   */
  function get(key) {
    return settings[key]
  }

  // Auto-save: watch each group and debounce save
  for (const [groupKey, keys] of Object.entries(GROUPS)) {
    watch(
      () => keys.map(k => settings[k]),
      () => {
        if (!loaded.value) return
        _debouncedSave(groupKey, keys)
      },
      { deep: true }
    )
  }

  _instance = {
    settings,
    loaded,
    load,
    set,
    get,
    saveImmediate,
  }

  return _instance
}
