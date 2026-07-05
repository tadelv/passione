/**
 * Unit test for useRecipeForm ratio cascade logic.
 *
 * Verifies that changing doseIn/doseOut/ratioValue updates the linked fields
 * correctly, that the _updating guard prevents infinite loops, and that
 * round1 prevents float noise.
 *
 * Run: node --test tests/unit/useRecipeForm.test.js
 */
import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import { effectScope } from 'vue'
import { useRecipeForm } from '../../src/composables/useRecipeForm.js'

function createForm() {
  const scope = effectScope(true)
  const form = scope.run(() => useRecipeForm({ settings: null }))
  return { form, scope }
}

describe('useRecipeForm ratio cascade', () => {

  it('changing doseIn with ratio set updates doseOut', async () => {
    const { form, scope } = createForm()
    try {
      form.doseIn.value = 18
      form.ratioValue.value = 2.5
      // doseIn change triggers watcher → doseOut = 18 * 2.5 = 45
      // Need to wait for the watcher to flush
      await new Promise(r => setTimeout(r, 0))
      assert.equal(form.doseOut.value, 45)
    } finally { scope.stop() }
  })

  it('changing doseOut with doseIn set updates ratioValue', async () => {
    const { form, scope } = createForm()
    try {
      form.doseIn.value = 18
      form.doseOut.value = 54
      await new Promise(r => setTimeout(r, 0))
      // ratio = 54 / 18 = 3.0
      assert.equal(form.ratioValue.value, 3)
    } finally { scope.stop() }
  })

  it('changing ratioValue with doseIn set updates doseOut', async () => {
    const { form, scope } = createForm()
    try {
      form.doseIn.value = 20
      form.ratioValue.value = 1.5
      await new Promise(r => setTimeout(r, 0))
      // doseOut = 20 * 1.5 = 30
      assert.equal(form.doseOut.value, 30)
    } finally { scope.stop() }
  })

  it('cascade reconciles all three values (doseIn → doseOut → ratio → doseOut)', async () => {
    const { form, scope } = createForm()
    try {
      form.doseIn.value = 3
      form.ratioValue.value = 7.333
      await new Promise(r => setTimeout(r, 10))
      // Cascade: doseIn watcher sets doseOut=round1(3*7.333)=22
      //   → doseOut watcher sets ratio=round1(22/3)=7.3
      //   → ratioValue watcher sets doseOut=round1(3*7.3)=21.9
      // Final state: all three values are consistent with each other
      assert.equal(form.doseOut.value, 21.9)
      assert.equal(form.ratioValue.value, 7.3)
      assert.equal(form.doseIn.value, 3)
      // Verify consistency: doseOut / doseIn = ratioValue
      assert.equal(Math.round((form.doseOut.value / form.doseIn.value) * 10) / 10, form.ratioValue.value)
    } finally { scope.stop() }
  })

  it('guard prevents watcher feedback loops during batch updates', async () => {
    const { form, scope } = createForm()
    try {
      form.updating = true
      form.doseIn.value = 18
      form.doseOut.value = 36
      form.ratioValue.value = 2.0
      form.updating = false
      // Wait for any watchers that might have fired
      await new Promise(r => setTimeout(r, 10))
      // All values should remain as set — no cascade should have triggered
      assert.equal(form.doseIn.value, 18)
      assert.equal(form.doseOut.value, 36)
      assert.equal(form.ratioValue.value, 2)
    } finally { scope.stop() }
  })

  it('zero doseIn does not trigger cascade', async () => {
    const { form, scope } = createForm()
    try {
      form.doseIn.value = 18
      form.ratioValue.value = 2.0
      await new Promise(r => setTimeout(r, 0))
      form.doseIn.value = 0
      await new Promise(r => setTimeout(r, 0))
      // doseOut should not change (guard: val > 0)
      assert.equal(form.doseOut.value, 36)
    } finally { scope.stop() }
  })

  it('comboValues includes all form fields', () => {
    const { form, scope } = createForm()
    try {
      form.doseIn.value = 18
      form.doseOut.value = 36
      form.coffeeName.value = 'Test Coffee'
      form.includeSteam.value = true
      form.steamDuration.value = 45

      const vals = form.comboValues()
      assert.equal(vals.doseIn, 18)
      assert.equal(vals.doseOut, 36)
      assert.equal(vals.coffeeName, 'Test Coffee')
      assert.equal(vals.includeSteam, true)
      assert.deepEqual(vals.steamSettings, { duration: 45, flow: 1.5, temperature: 160 })
    } finally { scope.stop() }
  })

  it('pickBrewTempFromProfile extracts first step temperature', () => {
    const { form, scope } = createForm()
    try {
      const temp = form.pickBrewTempFromProfile({
        steps: [{ temperature: 95.0 }, { temperature: 93.0 }]
      })
      assert.equal(temp, 95)
    } finally { scope.stop() }
  })

  it('pickBrewTempFromProfile falls back to tank_temperature', () => {
    const { form, scope } = createForm()
    try {
      const temp = form.pickBrewTempFromProfile({
        steps: [],
        tank_temperature: 90.5
      })
      assert.equal(temp, 90.5)
    } finally { scope.stop() }
  })

  it('pickBrewTempFromProfile returns null for empty profile', () => {
    const { form, scope } = createForm()
    try {
      assert.equal(form.pickBrewTempFromProfile(null), null)
      assert.equal(form.pickBrewTempFromProfile({}), null)
    } finally { scope.stop() }
  })
})