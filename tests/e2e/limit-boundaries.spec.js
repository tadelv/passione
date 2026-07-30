/**
 * E2E tests for limit boundary values (Phase 1 of code review action plan).
 *
 * Verifies that the central limits file values are correctly wired into the
 * UI's ValueInput components across the two remaining editors (workflow
 * recipe editor + the single frame-by-frame profile editor):
 *
 *  - Recipe editor: dose max is 100 (was 40)
 *  - Advanced editor: frame duration max is 120 (was 60)
 *  - Advanced editor: weight target max is 500 (was 100)
 *  - Advanced editor: flow target max is 25 (was 8)
 *  - Advanced editor: weight exit max is 500 (was 100)
 *
 * Each test navigates to the editor, locates the relevant ValueInput
 * (via data-testid or aria-label), and asserts aria-valuemax matches the
 * LIMITS constant.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

async function loadAppAt(page, hashRoute = '/') {
  const url = hashRoute === '/' ? '/' : `/#${hashRoute}`
  await page.goto(url)
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  await page.waitForTimeout(300)
}

test.describe('Limit boundaries', () => {
  test.beforeEach(async ({ request }) => {
    await request.put(`${BASE_URL}/api/v1/machine/state/idle`)
  })

  test('recipe editor: dose max is 100 (was 40)', async ({ page }) => {
    await loadAppAt(page, '/recipe/edit')
    await page.waitForSelector('.recipe-editor', { timeout: 5000 })

    // data-testid falls through to the ValueInput root (which has role=spinbutton)
    const doseInput = page.locator('[data-testid="recipe-doseIn"]')
    await expect(doseInput).toHaveAttribute('aria-valuemax', '100')
  })

  test('advanced editor: frame duration max is 120 (was 60)', async ({ page }) => {
    await loadAppAt(page, '/advanced-editor')
    await page.waitForSelector('.profile-editor', { timeout: 5000 })

    // New profile auto-selects its first frame, so the frame editor panel
    // (not the settings panel) is visible by default.
    const durationInput = page.locator('[aria-label="Frame duration"]')
    await expect(durationInput).toHaveAttribute('aria-valuemax', '120')
  })

  test('advanced editor: weight target max is 500 (was 100)', async ({ page }) => {
    await loadAppAt(page, '/advanced-editor')
    await page.waitForSelector('.profile-editor', { timeout: 5000 })

    // Switch to the Profile Settings panel to reach the Stop-at field.
    await page.locator('.profile-editor__settings-btn').click()
    await page.waitForTimeout(100)

    const stopAtInput = page.locator('[aria-label="Stop-at value"]')
    await expect(stopAtInput).toHaveAttribute('aria-valuemax', '500')
  })

  test('advanced editor: flow target max is 25 (was 8)', async ({ page }) => {
    await loadAppAt(page, '/advanced-editor')
    await page.waitForSelector('.profile-editor', { timeout: 5000 })

    // Apply the Classic Espresso preset — its first frame ("Fill") is a
    // flow-mode frame, matching what the old Recipe-editor test exercised.
    await page.locator('.profile-editor__settings-btn').click()
    await page.waitForTimeout(100)
    await page.locator('.profile-editor__preset-pill').filter({ hasText: 'Classic Espresso' }).click()
    await page.waitForTimeout(100)

    // Switch back to the frame editor panel for the auto-selected "Fill" frame.
    await page.locator('.profile-editor__settings-btn').click()
    await page.waitForTimeout(100)

    const targetInput = page.locator('[aria-label="Flow setpoint"]')
    await expect(targetInput).toHaveAttribute('aria-valuemax', '25')
  })

  test('advanced editor: weight exit max is 500 when exit type is weight', async ({ page }) => {
    await loadAppAt(page, '/advanced-editor')
    await page.waitForSelector('.profile-editor', { timeout: 5000 })

    // First frame is selected by default. Enable exit condition.
    const exitCheckbox = page.locator('.profile-editor__section input[type="checkbox"]').first()
    await exitCheckbox.check()
    await page.waitForTimeout(100)

    // Select "Weight Over" as exit type
    const exitSelect = page.locator('.profile-editor__select')
    await exitSelect.selectOption('weight')
    await page.waitForTimeout(100)

    // Now the exit value input should have max 500
    const exitInput = page.locator('[aria-label="Exit condition value"]')
    await expect(exitInput).toHaveAttribute('aria-valuemax', '500')
  })
})