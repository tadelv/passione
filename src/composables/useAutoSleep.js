/**
 * Auto-sleep system — sends heartbeats to the server's presence API.
 *
 * The server handles sleep countdown and triggers sleep when the heartbeat
 * timeout expires. This composable:
 *   - Sends throttled heartbeats on user activity (mousedown/touchstart/keydown)
 *   - Sends heartbeats on machine state changes
 *   - Syncs the autoSleepMinutes setting to the server's presence config
 *   - On startup, loads the server's current sleepTimeoutMinutes as source of truth
 */

import { watch, onMounted, onUnmounted } from 'vue'
import { sendHeartbeat, getPresenceSettings, updatePresenceSettings } from '../api/rest.js'

const HEARTBEAT_THROTTLE_MS = 30_000 // 30 seconds

export function useAutoSleep(machine, settings) {
  let _activityCleanup = null
  let _lastHeartbeat = 0

  // ---- Throttled heartbeat --------------------------------------------------

  function _sendThrottled() {
    const now = Date.now()
    if (now - _lastHeartbeat < HEARTBEAT_THROTTLE_MS) return
    _lastHeartbeat = now
    sendHeartbeat().catch(() => {})
  }

  // ---- User activity tracking -----------------------------------------------

  function _onUserActivity() {
    _sendThrottled()
  }

  function _startActivityTracking() {
    const events = ['mousedown', 'touchstart', 'keydown']
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
    _sendThrottled()
    _syncSettingsToServer()
  }

  function stop() {
    _activityCleanup?.()
    _activityCleanup = null
  }

  // Send heartbeat on machine state changes
  watch(
    () => machine.state.value,
    () => _sendThrottled()
  )

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
