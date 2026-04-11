/**
 * E2E tests for the Shot Comparison page.
 *
 * Verifies that comparing two shots renders charts correctly,
 * including proper normalization of measurements-format shot data
 * into flat arrays for the ComparisonGraph component.
 */

import { test, expect } from '@playwright/test'

// ---- Helpers ---------------------------------------------------------------

async function loadApp(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
}

async function navigateTo(page, path) {
  await page.evaluate((p) => {
    window.__vueRouter._skipDebounce = true
    return window.__vueRouter.push(p)
  }, path)
  await page.waitForTimeout(500)
}

// ---- Tests -----------------------------------------------------------------

test.describe('ShotComparisonPage', () => {
  test('renders a visible chart canvas when comparing two shots', async ({ page }) => {
    await loadApp(page)

    await navigateTo(page, {
      path: '/shot-comparison',
      query: { ids: 'shot-2026-02-13-100000,shot-2026-02-13-090000' },
    })
    await page.waitForTimeout(3000)

    // The comparison graph area should be visible
    const graph = page.locator('.comparison-page__graph')
    await expect(graph).toBeVisible()

    // A uPlot canvas should have been rendered inside the graph
    const canvas = page.locator('.comparison-graph__canvas canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })
  })

  test('legend shows 2 shot labels', async ({ page }) => {
    await loadApp(page)

    await navigateTo(page, {
      path: '/shot-comparison',
      query: { ids: 'shot-2026-02-13-100000,shot-2026-02-13-090000' },
    })
    await page.waitForTimeout(3000)

    const labels = page.locator('.comparison-graph__legend-label')
    await expect(labels).toHaveCount(2)
  })

  test('curve toggle buttons are visible', async ({ page }) => {
    await loadApp(page)

    await navigateTo(page, {
      path: '/shot-comparison',
      query: { ids: 'shot-2026-02-13-100000,shot-2026-02-13-090000' },
    })
    await page.waitForTimeout(3000)

    const toggles = page.locator('.comparison-page__toggle')
    await expect(toggles).toHaveCount(3)

    // All three should be visible: Pressure, Flow, Weight
    await expect(toggles.nth(0)).toBeVisible()
    await expect(toggles.nth(1)).toBeVisible()
    await expect(toggles.nth(2)).toBeVisible()
  })
})
