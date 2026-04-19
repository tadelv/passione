/**
 * Presence & idle management composable.
 *
 * Follows the recommended pattern from Skins.md:
 *   - On user activity: send heartbeat to prevent machine auto-sleep
 *   - Server handles the actual sleep countdown via heartbeat timeout
 *   - Display dimming is handled by the sleep state watcher in App.vue
 *   - Syncs autoSleepMinutes setting to server's presence config
 */

import { watch, onMounted, onUnmounted } from 'vue'
import { sendHeartbeat, getPresenceSettings, updatePresenceSettings } from '../api/rest.js'

export function useAutoSleep(machine, settings, display) {
  let _activityCleanup = null

  // ---- User activity handling ------------------------------------------------

  function _onUserActivity() {
    // Signal presence to server (server throttles to 30s internally)
    sendHeartbeat().catch(() => {})
  }

  function _startActivityTracking() {
    const events = ['pointerdown', 'keydown']
    for (const event of events) {
      document.addEventListener(event, _onUserActivity, { passive: true })
    }
    _activityCleanup = () => {
      for (const event of events) {
        document.removeEventListener(event, _onUserActivity)
      }
    }
  }

  // ---- Sync settings to server ---------------------------------------------

  async function _syncSettingsToServer() {
    const minutes = settings.settings.autoSleepMinutes
    if (minutes == null) return  // Not yet loaded from server
    try {
      await updatePresenceSettings({
        sleepTimeoutMinutes: minutes,
        userPresenceEnabled: true,
      })
    } catch {
      // Server may not support presence API yet
    }
  }

  // ---- Lifecycle ------------------------------------------------------------

  function start() {
    _startActivityTracking()
    // Send initial heartbeat
    sendHeartbeat().catch(() => {})
    _syncSettingsToServer()
  }

  function stop() {
    _activityCleanup?.()
    _activityCleanup = null
  }

  // Re-sync when autoSleepMinutes changes
  watch(
    () => settings.settings.autoSleepMinutes,
    () => _syncSettingsToServer()
  )

  onMounted(async () => {
    // Load server's current presence settings as source of truth
    try {
      const serverSettings = await getPresenceSettings()
      if (serverSettings?.sleepTimeoutMinutes != null) {
        settings.settings.autoSleepMinutes = serverSettings.sleepTimeoutMinutes
      }
    } catch {
      // Server may not support presence API yet — use local value
    }

    start()
  })

  onUnmounted(stop)

  return { start, stop }
}
