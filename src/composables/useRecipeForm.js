import { ref, computed, watch } from 'vue'
import { isComboModifiedVsForm } from './useComboDirty.js'

/**
 * Owns recipe-editor form state: 21 reactive refs (bean/grinder entity IDs
 * come from useBeanLink in the SFC), the _updating guard (exposed as a
 * getter/setter for cross-composable sharing), the linked ratio cascade
 * watchers, combo-values snapshot, and the pickBrewTempFromProfile helper.
 *
 * `comboValues()` takes { selectedBeanId, selectedBatchId } as parameters
 * because those refs are owned by useBeanLink, which runs after this
 * composable (it needs coffeeName/roaster from here). The SFC wraps
 * comboValues into a no-arg closure once useBeanLink is wired up.
 *
 * Other recipe-editor composables receive the returned form object:
 * - useRecipeLiveApply watches the refs and checks form.updating
 * - useRecipeOverlay writes to the refs during load (sets form.updating)
 * - useRecipePersist reads form.comboValues() for save/save-as-new
 */
export function useRecipeForm({ settings }) {
  // ---- Editable fields ----
  const coffeeName = ref('')
  const roaster = ref('')
  const grinder = ref('')
  const grinderSetting = ref('')
  const doseIn = ref(18.0)
  const doseOut = ref(36.0)
  const ratioValue = ref(2.0)

  // ---- Entity selection state ----
  const selectedGrinderId = ref(null)

  // ---- Profile state ----
  const profileTitle = ref('')
  const profileId = ref(null)
  // Recipe-level brew temperature override. Expressed in °C absolute; when
  // present, the live-apply path clones workflow.profile and overwrites every
  // step's `temperature` so the machine targets this value regardless of the
  // profile's own per-step variation. Stored on the combo (not on the saved
  // profile) so the shared gateway profile library is never mutated.
  const brewTemperature = ref(93)

  // ---- Power-user fields (gated by Settings → Preferences toggles) ----
  const grinderRpm = ref(1200)
  const basketSize = ref(18)
  const basketType = ref('')

  // ---- Optional operation settings (for combo) ----
  const includeSteam = ref(false)
  const steamDuration = ref(30)
  const steamFlow = ref(1.5)
  const steamTemperature = ref(160)

  const includeFlush = ref(false)
  const flushDuration = ref(5)
  const flushFlowRate = ref(6.0)

  const includeHotWater = ref(false)
  const hotWaterVolume = ref(200)
  const hotWaterTemperature = ref(80)

  // ---- Internal guard: prevents watcher feedback loops during batch loads ----
  // Exposed as a getter/setter so useRecipeLiveApply can check it and
  // useRecipeOverlay can set it. Internal ratio cascade watchers reference
  // the closure variable directly.
  const _updating = ref(false)

  // ---- Derived state from settings ----
  const workflowCombos = computed(() => settings?.settings?.workflowCombos ?? [])
  const selectedIndex = computed(() => settings?.settings?.selectedWorkflowCombo ?? -1)

  // Round to one decimal without going through `+(...).toFixed(1)`, which
  // re-parses the string and can leave residual float noise (e.g. 32.0000001
  // vs a literal 32). Math.round on the *10 scaled value is exact.
  function round1(n) {
    return Math.round(n * 10) / 10
  }

  // ---- Combo values snapshot ----
  // Reads all form refs into a plain object for dirty comparison and persistence.
  // Takes { selectedBeanId, selectedBatchId } as params because those refs are
  // owned by useBeanLink (which runs after this composable).
  function comboValues({ selectedBeanId, selectedBatchId } = {}) {
    const vals = {
      profileId: profileId.value,
      profileTitle: profileTitle.value,
      coffeeName: coffeeName.value,
      roaster: roaster.value,
      doseIn: doseIn.value,
      doseOut: doseOut.value,
      grinder: grinder.value,
      grinderSetting: grinderSetting.value,
      selectedBeanId: selectedBeanId?.value || null,
      selectedBatchId: selectedBatchId?.value || null,
      selectedGrinderId: selectedGrinderId.value || null,
      brewTemperature: brewTemperature.value,
      grinderRpm: grinderRpm.value ?? null,
      basketSize: basketSize.value ?? null,
      basketType: basketType.value || null,
      includeSteam: includeSteam.value,
      steamSettings: includeSteam.value ? { duration: steamDuration.value, flow: steamFlow.value, temperature: steamTemperature.value } : { duration: 0 },
      includeFlush: includeFlush.value,
      flushSettings: includeFlush.value ? { duration: flushDuration.value, flow: flushFlowRate.value } : { duration: 0 },
      includeHotWater: includeHotWater.value,
      hotWaterSettings: includeHotWater.value ? { volume: hotWaterVolume.value, temperature: hotWaterTemperature.value } : { volume: 0 },
    }
    return vals
  }

  // Pick the best-guess "brew temperature" to display as the initial value
  // for a loaded profile. Profiles store per-step temperatures (not a single
  // global value) — we take the first step's temperature, falling back to
  // tank_temperature or a 93 °C default.
  function pickBrewTempFromProfile(p) {
    if (!p) return null
    const steps = p.steps ?? p.frames ?? []
    if (steps.length > 0 && typeof steps[0].temperature === 'number') {
      return round1(steps[0].temperature)
    }
    if (typeof p.tank_temperature === 'number') return round1(p.tank_temperature)
    return null
  }

  // ---- Linked ratio: changing any of doseIn/doseOut/ratio updates the others ----
  watch(doseIn, (val) => {
    if (_updating.value) return
    _updating.value = true
    if (val > 0 && ratioValue.value > 0) {
      doseOut.value = round1(val * ratioValue.value)
    }
    _updating.value = false
  })

  watch(doseOut, (val) => {
    if (_updating.value) return
    _updating.value = true
    if (doseIn.value > 0 && val > 0) {
      ratioValue.value = round1(val / doseIn.value)
    }
    _updating.value = false
  })

  watch(ratioValue, (val) => {
    if (_updating.value) return
    _updating.value = true
    if (doseIn.value > 0 && val > 0) {
      doseOut.value = round1(doseIn.value * val)
    }
    _updating.value = false
  })

  return {
    // Form refs
    coffeeName, roaster, grinder, grinderSetting,
    doseIn, doseOut, ratioValue,
    selectedGrinderId,
    profileId, profileTitle, brewTemperature,
    grinderRpm, basketSize, basketType,
    includeSteam, steamDuration, steamFlow, steamTemperature,
    includeFlush, flushDuration, flushFlowRate,
    includeHotWater, hotWaterVolume, hotWaterTemperature,

    // Guard (shared Ref for cross-composable access — callers read/write .value)
    updating: _updating,

    // Derived state
    selectedIndex,
    workflowCombos,

    // Helpers
    comboValues,
    pickBrewTempFromProfile,
    round1,
  }
}