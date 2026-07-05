/**
 * E2E tests for limit boundary values (Phase 1 of code review action plan).
 *
 * Verifies that the central limits file values are correctly wired into the
 * UI's ValueInput components across three editors:
 *
 *  - Recipe editor: dose max is 100 (was 40)
 *  - Simple editor: step duration max is 120 (was 60)
 *  - Profile editor: weight target max is 500 (was 100)
 *  - Profile editor: flow target max is 25 (was 8)
 *  - Profile editor: weight exit max is 500 (was 100)
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

  test('simple editor: step duration max is 120 (was 60)', async ({ page }) => {
    await loadAppAt(page, '/simple-editor')
    await page.waitForSelector('.simple-editor', { timeout: 5000 })

    const durationInput = page.locator('[aria-label="Preinfusion duration"]')
    await expect(durationInput).toHaveAttribute('aria-valuemax', '120')
  })

  test('profile editor: weight target max is 500 (was 100)', async ({ page }) => {
    await loadAppAt(page, '/profile-editor')
    await page.waitForSelector('.recipe-editor', { timeout: 5000 })

    const stopAtInput = page.locator('[aria-label="Stop-at value"]')
    await expect(stopAtInput).toHaveAttribute('aria-valuemax', '500')
  })

  test('profile editor: flow target max is 25 (was 8)', async ({ page }) => {
    await loadAppAt(page, '/profile-editor')
    await page.waitForSelector('.recipe-editor', { timeout: 5000 })
    await page.waitForTimeout(300)

    // The "Fill" phase has pump=flow (max=25). It's not expanded by default
    // (default expanded is "Pour"). Click the Fill phase header to expand it.
    const fillHeader = page.locator('.recipe-editor__phase-header').filter({ hasText: 'Fill' })
    await fillHeader.click()
    await page.waitForTimeout(200)

    const targetInput = page.locator('[aria-label="Fill target"]')
    await expect(targetInput).toHaveAttribute('aria-valuemax', '25')
  })

  test('profile editor: weight exit max is 500 when exit type is weight', async ({ page }) => {
    await loadAppAt(page, '/profile-editor')
    await page.waitForSelector('.recipe-editor', { timeout: 5000 })
    await page.waitForTimeout(300)

    // Expand the Fill phase
    const fillHeader = page.locator('.recipe-editor__phase-header').filter({ hasText: 'Fill' })
    await fillHeader.click()
    await page.waitForTimeout(200)

    // The phase body is now visible. Enable exit condition.
    const fillPhase = page.locator('.recipe-editor__phase').filter({ hasText: 'Fill' })
    const exitCheckbox = fillPhase.locator('.recipe-editor__section input[type="checkbox"]').first()
    await exitCheckbox.check()
    await page.waitForTimeout(100)

    // Select "Weight Over" as exit type
    const exitSelect = fillPhase.locator('select').first()
    await exitSelect.selectOption('weight')
    await page.waitForTimeout(100)

    // Now the exit value input should have max 500
    const exitInput = page.locator('[aria-label="Fill exit value"]')
    await expect(exitInput).toHaveAttribute('aria-valuemax', '500')
  })
})