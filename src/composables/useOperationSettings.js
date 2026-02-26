/**
 * Composable that bridges operation page settings with the Workflow API.
 *
 * When user changes steam/hotwater/flush settings on their respective pages,
 * this composable sends PUT /api/v1/workflow with the updated section.
 * It also loads initial values from the workflow on mount.
 *
 * This implements P0-3: Workflow Integration for Operation Pages.
 */

import { watch } from 'vue'
import { updateWorkflow as putWorkflow } from '../api/rest'

const DEBOUNCE_MS = 500

export function useOperationSettings(settings, workflow) {
  const _timers = {}

  /**
   * Debounced workflow update — waits for DEBOUNCE_MS of inactivity
   * before sending the update.
   */
  function _debouncedUpdate(key, payload) {
    clearTimeout(_timers[key])
    _timers[key] = setTimeout(async () => {
      try {
        await putWorkflow(payload)
      } catch (e) {
        console.warn(`[useOperationSettings] Failed to update ${key}:`, e.message)
      }
    }, DEBOUNCE_MS)
  }

  // ---- Load initial values from workflow ------------------------------------

  /**
   * Apply workflow data into settings. Call this after workflow is loaded.
   */
  function syncFromWorkflow() {
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
  }
}
