/**
 * Presence & idle management composable.
 *
 * Follows the recommended pattern from Skins.md:
 *   - On user activity: send heartbeat to prevent machine auto-sleep + restore display
 *   - After local idle timeout: dim display (screensaver-like)
 *   - Server handles the actual sleep countdown via heartbeat timeout
 *   - Syncs autoSleepMinutes setting to server's presence config
 */

import { watch, onMounted, onUnmounted } from 'vue'
import { sendHeartbeat, getPresenceSettings, updatePresenceSettings } from '../api/rest.js'

const LOCAL_DIM_TIMEOUT_MS = 60_000 // Dim display after 60s of no user activity

export function useAutoSleep(machine, settings, display) {
  let _activityCleanup = null
  let _idleTimer = null

  // ---- User activity handling ------------------------------------------------

  function _onUserActivity() {
    // Signal presence to server (server throttles to 30s internally)
    sendHeartbeat().catch(() => {})

    // Restore display if dimmed
    display?.restore()

    // Reset local idle timer
    _resetIdleTimer()
  }

  function _resetIdleTimer() {
    clearTimeout(_idleTimer)
    _idleTimer = setTimeout(() => {
      // Dim display when user is idle locally
      display?.dim()
    }, LOCAL_DIM_TIMEOUT_MS)
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
    _resetIdleTimer()
    // Send initial heartbeat
    sendHeartbeat().catch(() => {})
    _syncSettingsToServer()
  }

  function stop() {
    clearTimeout(_idleTimer)
    _activityCleanup?.()
    _activityCleanup = null
  }

  // Send heartbeat on machine state changes
  watch(
    () => machine.state.value,
    () => sendHeartbeat().catch(() => {})
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
