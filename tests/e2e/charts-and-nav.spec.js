/**
 * E2E tests for charts, navigation links, and UI elements
 * that were reported as potentially broken.
 */

import { test, expect } from '@playwright/test'

async function loadApp(page) {
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  return consoleErrors
}

// ---- Shot Detail: chart renders ----

test.describe('ShotDetailPage chart', () => {
  test('renders a shot graph with canvas', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/shot/shot-2026-02-13-100000'))
    await page.waitForTimeout(3000)

    // The HistoryShotGraph should render a uPlot canvas
    const canvas = page.locator('.history-shot-graph__canvas canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })
  })
})

// ---- Shot Comparison: chart renders ----

test.describe('ShotComparisonPage chart', () => {
  test('renders comparison graph with two shots', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      window.__vueRouter.push({
        path: '/shot-comparison',
        query: { ids: 'shot-2026-02-13-100000,shot-2026-02-13-090000' }
      })
    })
    await page.waitForTimeout(3000)

    // Should show at least 2 shot columns
    const shotCols = page.locator('.comparison-page__shot-col')
    const count = await shotCols.count()
    expect(count).toBeGreaterThanOrEqual(2)

    // Comparison graph canvas should render
    const canvas = page.locator('.comparison-graph canvas')
    // ComparisonGraph uses a different class — check for any canvas in the graph area
    const graphCanvas = page.locator('.comparison-page__graph canvas')
    const anyCanvas = await graphCanvas.count() || await canvas.count()
    expect(anyCanvas).toBeGreaterThan(0)
  })
})

// ---- Shot History: Favorites link in BottomBar ----

test.describe('ShotHistoryPage bottom bar', () => {
  test('shows Favorites button in bottom bar', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(2000)

    const favBtn = page.locator('.shot-history__bottom-btn', { hasText: 'Favorites' })
    await expect(favBtn).toBeVisible()
  })

  test('Favorites button navigates to auto-favorites', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(2000)

    await page.locator('.shot-history__bottom-btn', { hasText: 'Favorites' }).click()
    await page.waitForTimeout(1000)

    await expect(page).toHaveURL(/auto-favorites/)
  })
})

// ---- Shot History: Load/Edit buttons have icon + text ----

test.describe('ShotHistoryPage action buttons', () => {
  test('shows Load and Edit buttons with text', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(2000)

    // Should have rows
    const rows = page.locator('.shot-history__row')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)

    // First row should have Load and Edit buttons with text
    const loadBtn = page.locator('.shot-history__action-btn--load').first()
    await expect(loadBtn).toBeVisible()
    await expect(loadBtn).toContainText('Load')

    const editBtn = page.locator('.shot-history__action-btn--edit').first()
    await expect(editBtn).toBeVisible()
    await expect(editBtn).toContainText('Edit')
  })
})

// ---- Status Bar: new layout (clock, temps, water) ----

test.describe('StatusBar redesign', () => {
  test('shows clock in center', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(2000)

    const clock = page.locator('.status-bar__clock')
    await expect(clock).toBeVisible()
    // Clock should show HH:MM format
    const text = await clock.textContent()
    expect(text).toMatch(/\d{2}:\d{2}/)
  })

  test('shows machine state on the left', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    const state = page.locator('.status-bar__state')
    await expect(state).toBeVisible()
    await expect(state).toHaveText('idle')
  })

  test('shows temperatures on the right', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(2000)

    // Mix/group temperature
    const temps = page.locator('.status-bar__temp')
    const count = await temps.count()
    expect(count).toBeGreaterThanOrEqual(2) // mix + group

    // Steam temperature
    const steam = page.locator('.status-bar__steam-temp')
    await expect(steam).toBeVisible()
  })
})

// ---- PostShotReviewPage: chart renders ----

test.describe('PostShotReviewPage chart', () => {
  test('renders shot graph', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/shot-review/shot-2026-02-13-100000'))
    await page.waitForTimeout(3000)

    const canvas = page.locator('.history-shot-graph__canvas canvas')
    await expect(canvas).toBeVisible({ timeout: 5000 })
  })
})
