/**
 * Auto-sleep system — client-side countdown that puts the machine to sleep
 * after a configurable period of inactivity.
 *
 * Two-counter approach (matches Decenza QML):
 *   - sleepCountdownNormal: Reset on any user activity, counts down from
 *     autoSleepMinutes. Reset by touch/mouse and machine phase changes.
 *   - sleepCountdownStayAwake: Only set on auto-wake, never reset by
 *     user activity. Counts down independently.
 *
 * Sleep triggers when BOTH counters reach 0.
 * Paused during active operations (espresso, steam, hotWater, flush, descaling).
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const TICK_INTERVAL_MS = 60_000 // 1 minute

export function useAutoSleep(machine, settings) {
  const sleepCountdownNormal = ref(0)
  const sleepCountdownStayAwake = ref(0)

  let _tickInterval = null
  let _activityCleanup = null

  // ---- Derived ---------------------------------------------------------------

  /** Minutes remaining until sleep (the greater of the two counters). */
  const minutesRemaining = computed(() =>
    Math.max(sleepCountdownNormal.value, sleepCountdownStayAwake.value)
  )

  /** Whether auto-sleep is currently paused (during active operations). */
  const isPaused = computed(() => machine.isOperating.value)

  // ---- Core logic -----------------------------------------------------------

  function _resetNormalCountdown() {
    const minutes = settings.settings.autoSleepMinutes
    if (minutes > 0) {
      sleepCountdownNormal.value = minutes
    }
  }

  function _tick() {
    if (isPaused.value) return

    if (sleepCountdownNormal.value > 0) {
      sleepCountdownNormal.value--
    }
    if (sleepCountdownStayAwake.value > 0) {
      sleepCountdownStayAwake.value--
    }

    // Sleep when both counters reach 0 and auto-sleep is enabled
    if (
      settings.settings.autoSleepMinutes > 0 &&
      sleepCountdownNormal.value <= 0 &&
      sleepCountdownStayAwake.value <= 0 &&
      !machine.isSleeping.value &&
      !machine.isOperating.value
    ) {
      _triggerSleep()
    }
  }

  async function _triggerSleep() {
    try {
      await machine.requestState('sleeping')
    } catch (e) {
      console.warn('[useAutoSleep] Failed to trigger sleep:', e.message)
    }
  }

  // ---- User activity tracking -----------------------------------------------

  function _onUserActivity() {
    _resetNormalCountdown()
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

  // ---- Lifecycle ------------------------------------------------------------

  function start() {
    _resetNormalCountdown()
    _tickInterval = setInterval(_tick, TICK_INTERVAL_MS)
    _startActivityTracking()
  }

  function stop() {
    if (_tickInterval) {
      clearInterval(_tickInterval)
      _tickInterval = null
    }
    _activityCleanup?.()
    _activityCleanup = null
  }

  /**
   * Set the stay-awake counter (for auto-wake scenarios).
   * @param {number} minutes
   */
  function setStayAwake(minutes) {
    sleepCountdownStayAwake.value = minutes
  }

  // Reset normal countdown on machine phase changes
  watch(
    () => machine.state.value,
    () => _resetNormalCountdown()
  )

  // Restart countdown when autoSleepMinutes changes
  watch(
    () => settings.settings.autoSleepMinutes,
    () => _resetNormalCountdown()
  )

  onMounted(start)
  onUnmounted(stop)

  return {
    sleepCountdownNormal,
    sleepCountdownStayAwake,
    minutesRemaining,
    isPaused,
    setStayAwake,
    start,
    stop,
  }
}
