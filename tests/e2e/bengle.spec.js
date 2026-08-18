/**
 * End-to-end tests for the capability-gated Bengle settings tab.
 *
 * Decaid advertises machine capabilities via GET /api/v1/machine/capabilities
 * (empty for a plain DE1, the full seven-token set for a compatible Bengle).
 * Passione shows the Bengle tab only when a capability surface is present.
 */

import { test, expect } from '@playwright/test'

const BENGLE_CAPS = [
  'cupWarmer',
  'integratedScale',
  'stopAtWeight',
  'ledStrip',
  'scaleCalibration',
  'preheat',
  'wakeSchedule',
]

async function setCapabilities(request, capabilities) {
  await request.post('/api/v1/machine/capabilities', { data: { capabilities } })
}

async function loadApp(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
}

test.describe('Bengle settings tab', () => {
  test.afterEach(async ({ request }) => {
    await setCapabilities(request, [])
  })

  test('hides the Bengle tab without a Bengle capability surface', async ({ page, request }) => {
    await setCapabilities(request, [])
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/settings'))
    await page.waitForSelector('.settings-page')

    await expect(page.locator('.settings-page__tab', { hasText: 'Bengle' })).toHaveCount(0)
  })

  test('shows Bengle controls when capabilities are advertised', async ({ page, request }) => {
    await setCapabilities(request, BENGLE_CAPS)
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/settings'))
    await page.waitForSelector('.settings-page')

    const bengleTab = page.locator('.settings-page__tab', { hasText: 'Bengle' })
    await expect(bengleTab).toBeVisible()
    await bengleTab.click()

    await expect(page.getByText('Cup warmer', { exact: true })).toBeVisible()
    await expect(page.getByText('Lighting', { exact: true })).toBeVisible()
    await expect(page.getByText('Integrated scale calibration', { exact: true })).toBeVisible()
  })
})
