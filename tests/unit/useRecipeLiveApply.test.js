/**
 * Unit test for useRecipeLiveApply.buildTemperatureOverrideProfile — regression
 * coverage for the "changing brew temperature flattens every profile step to
 * the same value" bug.
 *
 * The recipe editor's brew temperature is an override expressed as the
 * profile's first-step temperature. The override must be applied as a DELTA —
 * every step shifts by the same amount, preserving the profile's per-step
 * temperature curve — not as an absolute overwrite of every step ([90, 86]
 * +2 °C must yield [92, 88], not [92, 92]).
 *
 * Run: node --test tests/unit/useRecipeLiveApply.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { ref, reactive } from 'vue'
import { useRecipeLiveApply } from '../../src/composables/useRecipeLiveApply.js'

function makeHarness() {
  const workflow = reactive({ profile: null })
  const refs = {
    brewTemperature: ref(93),
    coffeeName: ref(''), roaster: ref(''), grinder: ref(''), grinderSetting: ref(''),
    doseIn: ref(18), doseOut: ref(36), profileId: ref(null), profileTitle: ref(''),
    grinderRpm: ref(1200), basketSize: ref(18), basketType: ref(''),
    includeSteam: ref(false), steamDuration: ref(30), steamFlow: ref(1.5), steamTemperature: ref(160),
    includeFlush: ref(false), flushDuration: ref(5), flushFlowRate: ref(6),
    includeHotWater: ref(false), hotWaterVolume: ref(200), hotWaterTemperature: ref(80),
    selectedGrinderId: ref(null),
  }
  const ctx = {
    settings: { settings: {} },
    workflow,
    updateWorkflow: async () => {},
    selectedBeanId: ref(null), selectedBatchId: ref(null), selectedGrinder: ref(null), linkedBean: ref(null),
    pickBrewTempFromProfile: () => null,
  }
  const { buildTemperatureOverrideProfile } = useRecipeLiveApply(refs, ctx)
  return { workflow, refs, buildTemperatureOverrideProfile }
}

describe('buildTemperatureOverrideProfile — delta override', () => {

  it('shifts every step by the delta from the first step, not to the same value', () => {
    const { workflow, refs, buildTemperatureOverrideProfile } = makeHarness()
    workflow.profile = { steps: [{ temperature: 90 }, { temperature: 86 }] }
    refs.brewTemperature.value = 92
    const steps = buildTemperatureOverrideProfile().steps
    assert.deepEqual(steps.map(s => s.temperature), [92, 88])
  })

  it('preserves the per-step curve for a larger shift', () => {
    const { workflow, refs, buildTemperatureOverrideProfile } = makeHarness()
    workflow.profile = { steps: [{ temperature: 93 }, { temperature: 91.5 }, { temperature: 88 }] }
    refs.brewTemperature.value = 90
    const steps = buildTemperatureOverrideProfile().steps
    assert.deepEqual(steps.map(s => s.temperature), [90, 88.5, 85])
  })

  it('keeps the delta consistent when re-applied over an already-shifted profile', () => {
    // Gateway echoes the override back into workflow.profile; a second edit
    // must stay consistent with the first (92 -> 91 shifts [92, 88] to [91, 87]).
    const { workflow, refs, buildTemperatureOverrideProfile } = makeHarness()
    workflow.profile = { steps: [{ temperature: 92 }, { temperature: 88 }] }
    refs.brewTemperature.value = 91
    const steps = buildTemperatureOverrideProfile().steps
    assert.deepEqual(steps.map(s => s.temperature), [91, 87])
  })

  it('leaves non-step profile fields intact', () => {
    const { workflow, refs, buildTemperatureOverrideProfile } = makeHarness()
    workflow.profile = {
      title: 'My Profile',
      tank_temperature: 88,
      steps: [{ temperature: 90 }, { temperature: 86 }],
    }
    refs.brewTemperature.value = 92
    const override = buildTemperatureOverrideProfile()
    assert.equal(override.title, 'My Profile')
    assert.equal(override.tank_temperature, 88)
  })

  it('supports the legacy frames shape', () => {
    const { workflow, refs, buildTemperatureOverrideProfile } = makeHarness()
    workflow.profile = { frames: [{ temperature: 90 }, { temperature: 86 }] }
    refs.brewTemperature.value = 92
    const frames = buildTemperatureOverrideProfile().frames
    assert.deepEqual(frames.map(s => s.temperature), [92, 88])
  })

  it('returns null when brewTemperature is unset or no profile is loaded', () => {
    const { workflow, refs, buildTemperatureOverrideProfile } = makeHarness()
    refs.brewTemperature.value = null
    workflow.profile = { steps: [{ temperature: 90 }] }
    assert.equal(buildTemperatureOverrideProfile(), null)
    refs.brewTemperature.value = 92
    workflow.profile = null
    assert.equal(buildTemperatureOverrideProfile(), null)
  })
})
