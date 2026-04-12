/**
 * E2E tests for the About tab "Check for updates" button.
 *
 * Covers the three outcomes of the state machine:
 *   1. No update available — shows "You're on the latest version" and does NOT reload.
 *   2. Update available (mock skin version ≠ __APP_VERSION__) — reloads with cache-busting.
 *   3. Server error — shows inline error and re-enables the button.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

async function loadAbout(page) {
  // Direct hash navigation avoids the router's 300ms debounce quirk.
  await page.goto('/#/settings/about')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  await page.waitForSelector('[data-testid="check-for-updates"]', { timeout: 5000 })
}

async function resetSkin(request) {
  await request.post(`${BASE_URL}/api/v1/test/reset-skin`)
}

test.describe('About tab — Check for updates', () => {
  test.beforeEach(async ({ request }) => {
    await resetSkin(request)
  })

  test('no update available — shows current message and does not reload', async ({ page, request }) => {
    await loadAbout(page)

    // Align the mock skin version with the live app's __APP_VERSION__
    const appVersion = await page.evaluate(() => window.__APP_VERSION__ ?? '0.0.0')
    await request.post(`${BASE_URL}/api/v1/test/set-skin-version`, {
      data: { version: appVersion },
      headers: { 'Content-Type': 'application/json' },
    })

    const btn = page.locator('[data-testid="check-for-updates"]')
    await btn.click()

    // Current-state message appears
    await expect(btn).toContainText(/latest version/i, { timeout: 5000 })

    // URL has NOT gained a cache-busting query param
    expect(page.url()).not.toMatch(/\?v=\d+/)

    // Button returns to idle after ~3s
    await expect(btn).toContainText(/Check for updates/i, { timeout: 5000 })
  })

  test('update available — shows updated message and reloads with cache-busting', async ({ page, request }) => {
    await loadAbout(page)

    // Set mock skin to a version different from __APP_VERSION__
    await request.post(`${BASE_URL}/api/v1/test/set-skin-version`, {
      data: { version: '99.99.99' },
      headers: { 'Content-Type': 'application/json' },
    })

    const btn = page.locator('[data-testid="check-for-updates"]')
    const navigationPromise = page.waitForURL(/\?v=\d+/, { timeout: 5000 })
    await btn.click()
    await expect(btn).toContainText(/Updated/i, { timeout: 2000 })
    await navigationPromise
    expect(page.url()).toMatch(/\?v=\d+/)
  })

  test('server error — shows error message and re-enables button', async ({ page, request }) => {
    await loadAbout(page)

    // Force the update endpoint to return 500
    await request.post(`${BASE_URL}/api/v1/test/set-skin-update-error`)

    const btn = page.locator('[data-testid="check-for-updates"]')
    await btn.click()

    await expect(btn).toContainText(/Update check failed/i, { timeout: 5000 })
    // Error auto-clears after ~5s
    await expect(btn).toContainText(/Check for updates/i, { timeout: 7000 })
    await expect(btn).toBeEnabled()
  })
})
