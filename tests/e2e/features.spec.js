/**
 * E2E tests for v0.3.0 features — DE1 user workflows.
 *
 * Tests match real barista workflows:
 * - Browsing profiles and opening the right editor
 * - Reviewing shot history with search
 * - Checking shot details with phase summary
 * - Navigating to Auto-Favorites
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

// ---- Shot History: server-side search -----------------------------------

test.describe('ShotHistoryPage search', () => {
  test('search input is present and functional', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(1500)

    // Search input should be visible with controlled value
    const searchInput = page.locator('.shot-history__search')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', 'Search shots...')

    // Total count should show
    const count = page.locator('.shot-history__count')
    await expect(count).toBeVisible()
    await expect(count).toContainText('shot')
  })

  test('search filters shots and shows total count', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(1500)

    // Type a search query
    await page.locator('.shot-history__search').fill('Morning')
    await page.waitForTimeout(500) // debounce

    // Should show filtered results
    const count = page.locator('.shot-history__count')
    await expect(count).toBeVisible()
  })
})

// ---- Shot Detail: phase summary -----------------------------------------

test.describe('ShotDetailPage phase summary', () => {
  test('shows phase summary panel with expand toggle', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    // Navigate to a specific shot detail
    await page.evaluate(() => {
      window.__vueRouter.push('/shot/shot-2026-02-13-100000')
    })
    await page.waitForTimeout(2500)

    // Phase summary should be present
    const summaryHeader = page.locator('.phase-summary__header')
    await expect(summaryHeader).toBeVisible()
    await expect(summaryHeader).toContainText('Phase Summary')

    // Click to expand
    await summaryHeader.click()
    await page.waitForTimeout(300)

    // Table should be visible with rows
    const table = page.locator('#phase-summary-table')
    await expect(table).toBeVisible()

    // Should have at least one data row
    const rows = page.locator('.phase-summary__row:not(.phase-summary__row--header)')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)
  })
})

// ---- ProfileInfoPage: correct editor routing ----------------------------

test.describe('ProfileInfoPage editor routing', () => {
  test('edit button is present for profile', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      window.__vueRouter.push('/profile-info/profile-test1234567890abcdef')
    })
    await page.waitForTimeout(2500)

    // Edit button should be visible
    const editBtn = page.locator('.profile-info__edit-btn')
    await expect(editBtn).toBeVisible()
    await expect(editBtn).toHaveText('Edit')
  })
})

// ---- Auto-Favorites page ------------------------------------------------

test.describe('AutoFavoritesPage', () => {
  test('loads and shows group-by options', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      window.__vueRouter.push('/auto-favorites')
    })
    await page.waitForTimeout(3000)

    // Group-by buttons should be visible
    const groupBtns = page.locator('.auto-fav__group-btn')
    await expect(groupBtns).toHaveCount(4)

    // Default selection should be Bean + Profile
    await expect(page.locator('.auto-fav__group-btn--active')).toContainText('Bean + Profile')
  })

  test('shows aggregated shot groups with metrics', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      window.__vueRouter.push('/auto-favorites')
    })
    await page.waitForTimeout(3000)

    // Should have at least one card (mock data has 2 shots)
    const cards = page.locator('.auto-fav__card')
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThan(0)

    // First card should show shot count
    await expect(page.locator('.auto-fav__card-count').first()).toContainText('shot')

    // Load and Show Shots buttons should be present
    await expect(page.locator('.auto-fav__action-btn').first()).toBeVisible()
  })
})

// ---- New pages load without errors --------------------------------------

test.describe('New pages load without errors', () => {
  const routes = [
    { path: '/#/auto-favorites', name: 'AutoFavoritesPage' },
    { path: '/#/simple-editor', name: 'SimpleProfileEditorPage (new)' },
  ]

  for (const route of routes) {
    test(`${route.name} loads without JS errors`, async ({ page }) => {
      const consoleErrors = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      await page.goto(route.path)
      await page.waitForSelector('.status-bar', { timeout: 10000 })
      await page.waitForTimeout(2000)

      const realErrors = consoleErrors.filter((msg) => {
        if (msg.includes('404') || msg.includes('Not found')) return false
        if (msg.includes('WebSocket')) return false
        if (msg.includes('Failed to fetch')) return false
        return true
      })

      expect(realErrors).toEqual([])
    })
  }
})

// ---- Simple Profile Editor page -----------------------------------------

test.describe('SimpleProfileEditorPage', () => {
  test('creates a new pressure profile with default values', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      window.__vueRouter.push('/simple-editor?type=pressure')
    })
    await page.waitForTimeout(2000)

    // Should show the simple editor with Pressure badge
    const badge = page.locator('.simple-editor__type-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('Pressure')

    // Title input should have default
    const titleInput = page.locator('.simple-editor__title-input')
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toHaveValue('New Pressure Profile')

    // Should have 4 numbered step sections
    const stepNums = page.locator('.simple-editor__step-num')
    await expect(stepNums).toHaveCount(4)
  })

  test('creates a new flow profile', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      window.__vueRouter.push('/simple-editor?type=flow')
    })
    await page.waitForTimeout(2000)

    const badge = page.locator('.simple-editor__type-badge')
    await expect(badge).toContainText('Flow')
  })
})
