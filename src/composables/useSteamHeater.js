/**
 * Steam heater control composable.
 *
 * Manages steam heater state: forcing heater on when SteamPage opens,
 * heating indicator display, keep-alive periodic resend, and turning
 * off heater when leaving SteamPage (if keepSteamHeaterOn is false).
 *
 * API:
 *   POST /api/v1/machine/shotSettings   { targetSteamTemp }
 *   PUT  /api/v1/workflow               { steamSettings }
 */

import { ref, computed, watch, onUnmounted } from 'vue'
import { updateShotSettings } from '../api/rest'

const KEEP_ALIVE_INTERVAL_MS = 60_000 // 60 seconds

export function useSteamHeater(machine, settings) {
  const heaterActive = ref(false)
  let _keepAliveInterval = null

  // ---- Derived ---------------------------------------------------------------

  const currentSteamTemp = computed(() => machine.steamTemperature.value)

  const targetTemp = computed(() => settings.settings.steamTemperature || 160)

  /** True when current steam temp is below target - 5 (heater is catching up). */
  const isHeatingUp = computed(() =>
    heaterActive.value && currentSteamTemp.value < (targetTemp.value - 5)
  )

  /** Heating progress as a 0-1 ratio. */
  const heatProgress = computed(() =>
    targetTemp.value > 0
      ? Math.min(1, currentSteamTemp.value / targetTemp.value)
      : 0
  )

  // ---- Actions ---------------------------------------------------------------

  /**
   * Force the steam heater on — sends steam temperature via shotSettings.
   * Called when SteamPage opens, regardless of keepSteamHeaterOn setting.
   */
  async function startHeating() {
    heaterActive.value = true
    settings.settings.steamDisabled = false
    await _sendSteamTemp(targetTemp.value)
    _startKeepAlive()
  }

  /**
   * Turn off the steam heater — sends 0 temperature.
   */
  async function stopHeating() {
    heaterActive.value = false
    _stopKeepAlive()
    await _sendSteamTemp(0)
  }

  /**
   * Apply current steam settings to the machine.
   * Called when user changes temperature, duration, or flow.
   */
  async function applySettings() {
    if (heaterActive.value) {
      await _sendSteamTemp(targetTemp.value)
    }
  }

  /**
   * Call when leaving the steam page. Turns off heater if keepSteamHeaterOn
   * is false. If keepSteamHeaterOn is true, keeps the keep-alive running.
   */
  async function onLeave() {
    if (!settings.settings.keepSteamHeaterOn) {
      await stopHeating()
    }
  }

  // ---- Internal -------------------------------------------------------------

  async function _sendSteamTemp(temp) {
    try {
      await updateShotSettings({ targetSteamTemp: temp })
    } catch (e) {
      console.warn('[useSteamHeater] Failed to send steam temp:', e.message)
    }
  }

  function _startKeepAlive() {
    _stopKeepAlive()
    if (!settings.settings.keepSteamHeaterOn) return

    _keepAliveInterval = setInterval(async () => {
      // Only resend if keepSteamHeaterOn is still on, heater is active,
      // machine is idle or ready, and not steam-disabled
      if (
        settings.settings.keepSteamHeaterOn &&
        !settings.settings.steamDisabled &&
        heaterActive.value &&
        machine.isConnected.value &&
        machine.isReady.value
      ) {
        await _sendSteamTemp(targetTemp.value)
      }
    }, KEEP_ALIVE_INTERVAL_MS)
  }

  function _stopKeepAlive() {
    if (_keepAliveInterval) {
      clearInterval(_keepAliveInterval)
      _keepAliveInterval = null
    }
  }

  // Watch keepSteamHeaterOn changes to start/stop keep-alive
  watch(
    () => settings.settings.keepSteamHeaterOn,
    (keepOn) => {
      if (keepOn && heaterActive.value) {
        _startKeepAlive()
      } else if (!keepOn) {
        _stopKeepAlive()
      }
    }
  )

  // Watch for steaming end — if steaming was in progress and machine returns
  // to idle, turn off heater if keepSteamHeaterOn is false
  watch(
    () => machine.state.value,
    (newState, oldState) => {
      if (oldState === 'steam' && newState !== 'steam') {
        if (!settings.settings.keepSteamHeaterOn) {
          stopHeating()
        }
      }
    }
  )

  onUnmounted(() => {
    _stopKeepAlive()
  })

  return {
    heaterActive,
    isHeatingUp,
    heatProgress,
    currentSteamTemp,
    targetTemp,
    startHeating,
    stopHeating,
    applySettings,
    onLeave,
  }
}
