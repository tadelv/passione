/**
 * Volume mode composable for EspressoPage.
 *
 * Provides volume tracking alongside weight mode. Determines which
 * mode is active based on the current profile's stop_at_type, integrates
 * flow for cumulative volume, and computes brew-by-ratio.
 *
 * Modes:
 *   - "weight": Show scale weight with progress bar against target weight
 *   - "volume": Show cumulative volume from flow integration with
 *               progress bar against target volume
 */

import { ref, computed, watch } from 'vue'

export function useVolumeMode(machine, scale, workflow) {
  const cumulativeVolume = ref(0)
  let _lastTimestamp = null

  // ---- Mode detection -------------------------------------------------------

  /** 'weight' or 'volume' based on current profile's stop_at_type */
  const stopAtType = computed(() => {
    const profile = workflow.profile
    if (!profile) return 'weight'
    // Streamline-Bridge profiles may use stop_at_type or target_volume > 0
    if (profile.stop_at_type === 'volume') return 'volume'
    if (profile.target_volume && profile.target_volume > 0 && (!profile.target_weight || profile.target_weight === 0)) {
      return 'volume'
    }
    return 'weight'
  })

  const isVolumeMode = computed(() => stopAtType.value === 'volume')

  // ---- Targets --------------------------------------------------------------

  const targetWeight = computed(() => {
    return workflow.context?.targetYield ?? workflow.profile?.target_weight ?? 36
  })

  const targetVolume = computed(() => {
    return workflow.profile?.target_volume ?? 36
  })

  // ---- Progress -------------------------------------------------------------

  /** Progress as 0-1 in current mode. */
  const progress = computed(() => {
    if (isVolumeMode.value) {
      return targetVolume.value > 0
        ? Math.min(1, cumulativeVolume.value / targetVolume.value)
        : 0
    }
    return targetWeight.value > 0
      ? Math.min(1, scale.weight.value / targetWeight.value)
      : 0
  })

  /** Current display value (weight or volume). */
  const displayValue = computed(() =>
    isVolumeMode.value ? cumulativeVolume.value : scale.weight.value
  )

  /** Current display target. */
  const displayTarget = computed(() =>
    isVolumeMode.value ? targetVolume.value : targetWeight.value
  )

  /** Suffix for display. */
  const displaySuffix = computed(() =>
    isVolumeMode.value ? 'mL' : 'g'
  )

  // ---- Brew-by-ratio --------------------------------------------------------

  /** Current brew ratio: output / dose. */
  const brewByRatio = computed(() => {
    const dose = workflow.context?.targetDoseWeight
    if (!dose || dose <= 0) return 0
    const output = isVolumeMode.value ? cumulativeVolume.value : scale.weight.value
    return output / dose
  })

  // ---- Flow integration for volume mode ------------------------------------

  function _integrateFlow() {
    // Integrate flow (mL/s) over time to get cumulative volume (mL).
    // Called each time machine snapshot updates during espresso.
    const now = Date.now()
    if (_lastTimestamp !== null) {
      const dt = (now - _lastTimestamp) / 1000 // seconds
      const flowRate = machine.flow.value ?? 0
      if (dt > 0 && dt < 1 && flowRate > 0) {
        cumulativeVolume.value += flowRate * dt
      }
    }
    _lastTimestamp = now
  }

  function reset() {
    cumulativeVolume.value = 0
    _lastTimestamp = null
  }

  // Integrate flow during espresso
  watch(machine.snapshot, () => {
    if (machine.state.value === 'espresso') {
      _integrateFlow()
    }
  })

  // Reset on espresso start
  watch(machine.state, (newState, oldState) => {
    if (newState === 'espresso' && oldState !== 'espresso') {
      reset()
    }
  })

  return {
    stopAtType,
    isVolumeMode,
    targetWeight,
    targetVolume,
    cumulativeVolume,
    progress,
    displayValue,
    displayTarget,
    displaySuffix,
    brewByRatio,
    reset,
  }
}
