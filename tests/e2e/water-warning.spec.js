/**
 * E2E tests for the screensaver water warning indicator.
 *
 * The mock WebSocket sends `mockWaterLevels` once on connect, so each
 * state case sets the mock via the POST endpoint and then navigates —
 * loading the page opens a fresh WebSocket connection that receives the
 * new levels.
 *
 * Formula ported from Decenza's WaterLevelItem.qml:
 *   margin = currentLevel - 5 (sensor offset) - refillLevel
 *   > 7 ok, > 5 low, > 3 warning, else critical
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

async function setWaterLevels(request, currentLevel, refillLevel) {
  await request.post(`${BASE_URL}/api/v1/machine/waterLevels`, {
    data: { currentLevel, refillLevel },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function setScreensaverType(request, type) {
  // useSettings stores screensaver fields under the 'screensaver' KV key
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/screensaver`, {
    data: { screensaverType: type, flipClock24h: true, flipClock3d: false },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function openScreensaver(page) {
  await page.goto('/#/screensaver')
  await page.waitForSelector('.screensaver', { timeout: 5000 })
  // Give the WebSocket a moment to deliver the initial water-levels snapshot
  await page.waitForTimeout(400)
}

test.describe('Screensaver water warning', () => {
  test.beforeEach(async ({ request }) => {
    // Restore defaults in case an earlier test file left state that would
    // interact: flipClock screensaver type and a full tank.
    await setScreensaverType(request, 'flipClock')
    await setWaterLevels(request, 75, 0)
  })

  test('ok state — indicator is not rendered', async ({ page, request }) => {
    await setWaterLevels(request, 75, 0)  // margin = 75 - 5 - 0 = 70 → ok
    await openScreensaver(page)
    await expect(page.locator('[data-testid="screensaver-water-warning"]')).toHaveCount(0)
  })

  test('low state — shows LOW label', async ({ page, request }) => {
    await setWaterLevels(request, 16, 5)  // margin = 16 - 5 - 5 = 6 → low
    await openScreensaver(page)
    const warning = page.locator('[data-testid="screensaver-water-warning"]')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('LOW')
    await expect(warning).toHaveClass(/ssww--low/)
  })

  test('warning state — shows REFILL SOON label', async ({ page, request }) => {
    await setWaterLevels(request, 14, 5)  // margin = 14 - 5 - 5 = 4 → warning
    await openScreensaver(page)
    const warning = page.locator('[data-testid="screensaver-water-warning"]')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('REFILL SOON')
    await expect(warning).toHaveClass(/ssww--warning/)
  })

  test('critical state — shows REFILL NOW label', async ({ page, request }) => {
    await setWaterLevels(request, 8, 5)  // margin = 8 - 5 - 5 = -2 → critical
    await openScreensaver(page)
    const warning = page.locator('[data-testid="screensaver-water-warning"]')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('REFILL NOW')
    await expect(warning).toHaveClass(/ssww--critical/)
  })

  test('disabled screensaver mode — indicator not rendered even when critical', async ({ page, request }) => {
    await setScreensaverType(request, 'disabled')
    await setWaterLevels(request, 8, 5)  // critical water state
    await openScreensaver(page)
    await expect(page.locator('[data-testid="screensaver-water-warning"]')).toHaveCount(0)
  })
})
