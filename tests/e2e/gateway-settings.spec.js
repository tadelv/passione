/**
 * End-to-end tests for the Bridge settings tab, which reads/writes the
 * current Decaid /api/v1/settings schema.
 */

import { test, expect } from '@playwright/test'

async function loadBridgeTab(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__vueRouter.push('/settings/gateway'))
  await page.waitForSelector('.gateway-tab')
}

test('renders current-schema controls from live settings', async ({ page }) => {
  await loadBridgeTab(page)

  await expect(page.getByText('Weight flow multiplier')).toBeVisible()
  await expect(page.getByText('Volume flow multiplier')).toBeVisible()
  await expect(page.getByText('Hot water flow multiplier')).toBeVisible()
  await expect(page.getByText('Block tare during shot')).toBeVisible()

  // Values come from the mock settings response, not the fallback defaults.
  await expect(page.getByText('0.83x')).toBeVisible()

  // Decaid log levels are Java names, not lowercase shell levels.
  await expect(page.getByRole('button', { name: 'FINE', exact: true })).toHaveClass(/gateway-tab__seg--active/)
})
