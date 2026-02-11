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
  // Auto-sleep
  autoSleepMinutes: 60,

  // Steam
  steamDuration: 30,
  steamFlow: 150,          // stored in 0.01 mL/s units
  steamTemperature: 160,
  keepSteamHeaterOn: false,
  steamDisabled: false,
  steamAutoFlushSeconds: 0,

  // Hot water
  hotWaterVolume: 200,
  hotWaterTemperature: 80,
  hotWaterMode: 'weight',  // 'weight' or 'volume'

  // Flush
  flushDuration: 5,
  flushFlowRate: 6.0,

  // Presets
  steamPitcherPresets: [],
  selectedSteamPitcherPreset: -1,
  waterVesselPresets: [],
  selectedWaterVesselPreset: -1,
  flushPresets: [],
  selectedFlushPreset: -1,
  beanPresets: [],
  selectedBeanPreset: -1,
  favoriteProfiles: [],
  selectedFavoriteProfile: -1,

  // UI / layout
  waterLevelDisplayUnit: '%',  // '%' or 'ml'

  // Visualizer
  visualizerUsername: '',
  visualizerPassword: '',
  visualizerAutoUpload: false,
  visualizerMinDuration: 8,
  visualizerExtendedMetadata: false,
  visualizerShowAfterShot: false,
  defaultShotRating: 50,

  // Theme
  activeThemeName: 'default',
  customThemeColors: {},

  // Screensaver
  screensaverType: 'flipClock',    // 'disabled', 'flipClock'
  flipClock24h: true,
  flipClock3d: false,

  // Options
  waterRefillThreshold: 10,
  headlessMode: false,
  autoWakeEnabled: false,
  autoWakeSchedule: {
    mon: { enabled: false, time: '07:00' },
    tue: { enabled: false, time: '07:00' },
    wed: { enabled: false, time: '07:00' },
    thu: { enabled: false, time: '07:00' },
    fri: { enabled: false, time: '07:00' },
    sat: { enabled: false, time: '08:00' },
    sun: { enabled: false, time: '08:00' },
  },
  stayAwakeDuration: 60,

  // Shot History
  showLastShotOnIdle: false,
  autoFavorites: false,

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
      'autoSleepMinutes', 'keepSteamHeaterOn', 'steamDisabled',
      'steamAutoFlushSeconds', 'waterLevelDisplayUnit',
    ],
    steam: [
      'steamDuration', 'steamFlow', 'steamTemperature',
      'steamPitcherPresets', 'selectedSteamPitcherPreset',
    ],
    hotwater: [
      'hotWaterVolume', 'hotWaterTemperature', 'hotWaterMode',
      'waterVesselPresets', 'selectedWaterVesselPreset',
    ],
    flush: [
      'flushDuration', 'flushFlowRate',
      'flushPresets', 'selectedFlushPreset',
    ],
    profiles: [
      'favoriteProfiles', 'selectedFavoriteProfile',
    ],
    beans: [
      'beanPresets', 'selectedBeanPreset',
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
      'waterRefillThreshold', 'headlessMode',
      'autoWakeEnabled', 'autoWakeSchedule', 'stayAwakeDuration',
    ],
    history: [
      'showLastShotOnIdle', 'autoFavorites',
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
    loaded.value = true
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
