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

test.describe('Shot history navigation', () => {
  test('wide viewport: row click navigates to detail page', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await loadApp(page)
    await navigateTo(page, '/history')
    await page.waitForTimeout(1500)

    // No split layout — list spans the full width
    await expect(page.locator('.shot-history__detail')).toHaveCount(0)

    const firstRow = page.locator('.shot-history__row').first()
    await firstRow.click()
    await page.waitForTimeout(1000)

    await expect(page.locator('.shot-detail')).toBeVisible({ timeout: 5000 })
  })

  test('narrow viewport: row click navigates to detail page', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 })
    await loadApp(page)
    await navigateTo(page, '/history')
    await page.waitForTimeout(1500)

    await expect(page.locator('.shot-history__detail')).toHaveCount(0)

    const firstRow = page.locator('.shot-history__row').first()
    await firstRow.click()
    await page.waitForTimeout(1000)

    await expect(page.locator('.shot-detail')).toBeVisible({ timeout: 5000 })
  })
})
