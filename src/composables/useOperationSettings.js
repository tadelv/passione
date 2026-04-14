/**
 * Composable that bridges operation page settings with the Workflow API.
 *
 * When user changes steam/hotwater/flush settings on their respective pages,
 * this composable sends PUT /api/v1/workflow with the updated section.
 * It also loads initial values from the workflow on mount.
 *
 * Updates flow through the provided `updateWorkflow` callback (from
 * useWorkflow) so the shared reactive workflow state is kept in sync with
 * the server's response — avoiding stale reads elsewhere in the app.
 *
 * This implements P0-3: Workflow Integration for Operation Pages.
 */

import { watch, nextTick } from 'vue'

const DEBOUNCE_MS = 500

export function useOperationSettings(settings, workflow, updateWorkflow, toast = null) {
  const _timers = {}
  let _suppressed = false
  // Coalesce noisy back-to-back failures (network blip while typing) into a
  // single user-facing toast per ~3 s window.
  let _lastErrorAt = 0

  /**
   * Suppress watcher-driven API calls (e.g. during bulk combo loading).
   * Clears any pending debounced updates.
   */
  function suppress() {
    _suppressed = true
    for (const key of Object.keys(_timers)) {
      clearTimeout(_timers[key])
    }
  }

  /** Resume watcher-driven API calls. */
  function unsuppress() {
    _suppressed = false
  }

  /**
   * Debounced workflow update — waits for DEBOUNCE_MS of inactivity
   * before sending the update.
   */
  function _debouncedUpdate(key, payload) {
    if (_suppressed) return
    clearTimeout(_timers[key])
    _timers[key] = setTimeout(async () => {
      try {
        // Route through the workflow composable so the reactive `workflow`
        // object is updated from the server response. Consumers that read
        // from `workflow.steamSettings` / `workflow.rinseData` /
        // `workflow.hotWaterData` (e.g. WorkflowEditorPage) then see a
        // consistent view.
        await updateWorkflow(payload)
      } catch (e) {
        console.warn(`[useOperationSettings] Failed to update ${key}:`, e.message)
        const now = Date.now()
        if (toast && now - _lastErrorAt > 3000) {
          _lastErrorAt = now
          toast.error?.(`Failed to save ${key} settings`)
        }
      }
    }, DEBOUNCE_MS)
  }

  // ---- Load initial values from workflow ------------------------------------

  /**
   * Apply workflow data into settings. Call this after workflow is loaded,
   * or after navigating back to an operation page to pick up changes made
   * elsewhere. Suppressed during the write so the watchers don't bounce the
   * same values back to the server.
   */
  function syncFromWorkflow() {
    suppress()
    // Steam
    if (workflow.steamSettings) {
      if (workflow.steamSettings.duration != null) {
        settings.settings.steamDuration = workflow.steamSettings.duration
      }
      if (workflow.steamSettings.flow != null) {
        settings.settings.steamFlow = workflow.steamSettings.flow
      }
      if (workflow.steamSettings.targetTemperature != null) {
        settings.settings.steamTemperature = workflow.steamSettings.targetTemperature
      }
    }

    // Hot water
    if (workflow.hotWaterData) {
      if (workflow.hotWaterData.volume != null) {
        settings.settings.hotWaterVolume = workflow.hotWaterData.volume
      }
      if (workflow.hotWaterData.targetTemperature != null) {
        settings.settings.hotWaterTemperature = workflow.hotWaterData.targetTemperature
      }
      if (workflow.hotWaterData.duration != null) {
        settings.settings.hotWaterDuration = workflow.hotWaterData.duration
      }
      if (workflow.hotWaterData.flow != null) {
        settings.settings.hotWaterFlow = workflow.hotWaterData.flow
      }
    }

    // Flush (rinse)
    if (workflow.rinseData) {
      if (workflow.rinseData.duration != null) {
        settings.settings.flushDuration = workflow.rinseData.duration
      }
      if (workflow.rinseData.flow != null) {
        settings.settings.flushFlowRate = workflow.rinseData.flow
      }
      if (workflow.rinseData.targetTemperature != null) {
        settings.settings.flushTemperature = workflow.rinseData.targetTemperature
      }
    }

    // Wait for Vue's watcher flush to drain before re-arming, so the
    // assignments above don't trigger a redundant PUT echoing the values
    // we just received from the server.
    nextTick(unsuppress)
  }

  // ---- Watch settings and push to workflow ----------------------------------

  // Steam settings → workflow.steamSettings
  watch(
    () => [
      settings.settings.steamDuration,
      settings.settings.steamFlow,
      settings.settings.steamTemperature,
    ],
    ([duration, flow, temperature]) => {
      if (!settings.loaded.value) return
      _debouncedUpdate('steam', {
        steamSettings: {
          targetTemperature: temperature,
          duration: duration,
          flow: flow,
        },
      })
    }
  )

  // Hot water settings → workflow.hotWaterData
  watch(
    () => [
      settings.settings.hotWaterVolume,
      settings.settings.hotWaterTemperature,
      settings.settings.hotWaterDuration,
      settings.settings.hotWaterFlow,
    ],
    ([volume, temperature, duration, flow]) => {
      if (!settings.loaded.value) return
      _debouncedUpdate('hotwater', {
        hotWaterData: {
          targetTemperature: temperature,
          volume: volume,
          duration: duration,
          flow: flow,
        },
      })
    }
  )

  // Flush settings → workflow.rinseData
  watch(
    () => [
      settings.settings.flushDuration,
      settings.settings.flushFlowRate,
      settings.settings.flushTemperature,
    ],
    ([duration, flow, temperature]) => {
      if (!settings.loaded.value) return
      _debouncedUpdate('flush', {
        rinseData: {
          targetTemperature: temperature,
          duration: duration,
          flow: flow,
        },
      })
    }
  )

  return {
    syncFromWorkflow,
    suppress,
    unsuppress,
  }
}
