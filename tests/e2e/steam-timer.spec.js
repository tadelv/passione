/**
 * E2E tests for steam/flush completion timer bug fix.
 *
 * Verifies that the completion overlay shows the correct elapsed time for
 * steam operations, rather than a stale time from a previous espresso shot.
 *
 * Bug: App.vue used shotData.elapsed() for steam/flush completion, but
 * shotData only tracks espresso. The fix uses machine.shotTime.value which
 * resets on every flowing state entry.
 *
 * Runs against the built dist/ served by mock-server.js on port 8080.
 */

import { test, expect } from '@playwright/test'

// ---- Helpers ----------------------------------------------------------------

async function loadApp(page) {
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  return consoleErrors
}

async function setMachineState(page, state) {
  await page.evaluate(async (s) => {
    await fetch(`/api/v1/machine/state/${s}`, { method: 'PUT' })
  }, state)
  await page.waitForTimeout(600)
}

// ---- Tests ------------------------------------------------------------------

test.describe('Steam completion timer', () => {
  test('steam completion overlay shows correct elapsed time', async ({ page }) => {
    await loadApp(page)

    // Ensure machine is idle
    await setMachineState(page, 'idle')
    await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 5000 })

    // Start steam
    await setMachineState(page, 'steam')
    await expect(page.locator('.status-bar__state')).toHaveText('steam', { timeout: 5000 })

    // Let the steam run for ~2 seconds so the timer accumulates
    await page.waitForTimeout(2000)

    // Stop steam by returning to idle — this triggers the completion overlay
    await setMachineState(page, 'idle')

    // The completion overlay should appear with a time value
    const overlay = page.locator('.completion-overlay')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    const valueEl = page.locator('.completion-overlay__value')
    await expect(valueEl).toBeVisible()

    const text = await valueEl.textContent()
    // The value should end with 's' and contain a number in a reasonable range
    // We waited ~2s, so expect between 1s and 5s (accounting for timing variance)
    const match = text.match(/([\d.]+)s/)
    expect(match).not.toBeNull()

    const elapsed = parseFloat(match[1])
    expect(elapsed).toBeGreaterThanOrEqual(1)
    expect(elapsed).toBeLessThanOrEqual(5)
  })

  test('steam completion does not show previous espresso time', async ({ page }) => {
    await loadApp(page)

    // Ensure machine is idle
    await setMachineState(page, 'idle')
    await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 5000 })

    // Run espresso for ~3 seconds
    await setMachineState(page, 'espresso')
    await expect(page.locator('.status-bar__state')).toHaveText('espresso', { timeout: 5000 })
    await page.waitForTimeout(3000)

    // Stop espresso
    await setMachineState(page, 'idle')

    // Wait for any completion overlay from espresso to dismiss (3s auto-dismiss + buffer)
    await page.waitForTimeout(4000)

    // Now start steam for a short duration (~1.5s)
    await setMachineState(page, 'steam')
    await expect(page.locator('.status-bar__state')).toHaveText('steam', { timeout: 5000 })
    await page.waitForTimeout(1500)

    // Stop steam
    await setMachineState(page, 'idle')

    // The completion overlay should appear
    const overlay = page.locator('.completion-overlay')
    await expect(overlay).toBeVisible({ timeout: 5000 })

    const valueEl = page.locator('.completion-overlay__value')
    await expect(valueEl).toBeVisible()

    const text = await valueEl.textContent()
    const match = text.match(/([\d.]+)s/)
    expect(match).not.toBeNull()

    const elapsed = parseFloat(match[1])
    // The steam ran for ~1.5s. The key assertion: it must be less than 3s,
    // proving we are NOT showing the stale espresso time.
    expect(elapsed).toBeLessThan(3)
    expect(elapsed).toBeGreaterThanOrEqual(0.5)
  })
})
