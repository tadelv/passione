import { test, expect } from '@playwright/test'

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

test.describe('Shot history layout', () => {
  test('wide viewport shows split layout with inline detail', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await loadApp(page)
    await navigateTo(page, '/history')
    await page.waitForTimeout(1500)

    // Should show wide layout
    await expect(page.locator('.shot-history--wide')).toBeVisible()
    await expect(page.locator('.shot-history__detail')).toBeVisible()

    // Click first shot row
    const firstRow = page.locator('.shot-history__row').first()
    await firstRow.click()
    await page.waitForTimeout(1000)

    // Detail panel should show the chart
    await expect(page.locator('.shot-history__detail-graph')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.shot-history__detail-profile')).toBeVisible()
  })

  test('narrow viewport navigates to detail page', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 })
    await loadApp(page)
    await navigateTo(page, '/history')
    await page.waitForTimeout(1500)

    // Should NOT show wide layout
    await expect(page.locator('.shot-history--wide')).toHaveCount(0)

    // Click first shot — should navigate away to detail page
    const firstRow = page.locator('.shot-history__row').first()
    await firstRow.click()
    await page.waitForTimeout(1000)

    await expect(page.locator('.shot-detail')).toBeVisible({ timeout: 5000 })
  })
})
