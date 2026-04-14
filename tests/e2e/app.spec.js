/**
 * End-to-end tests for the Passione web skin.
 *
 * These tests run against the built dist/ served alongside a mock
 * Streamline-Bridge API on port 8080. The mock provides REST responses
 * and WebSocket streams so the app functions as if connected to a real
 * DE1 espresso machine.
 */

import { test, expect } from '@playwright/test'

// ---- Helpers ---------------------------------------------------------------

/**
 * Navigate to the app and wait for it to be fully loaded.
 * The app uses hash-based routing, so the idle page is at /#/
 */
async function loadApp(page) {
  // Collect console errors during the test
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  await page.goto('/')

  // Wait for the Vue app to mount by checking for the status bar
  await page.waitForSelector('.status-bar', { timeout: 10000 })

  return consoleErrors
}

// ---- Tests -----------------------------------------------------------------

test.describe('App loading', () => {
  test('loads the app and renders the IdlePage', async ({ page }) => {
    const consoleErrors = await loadApp(page)

    // The status bar should be visible
    await expect(page.locator('.status-bar')).toBeVisible()

    // The idle page should be rendered
    await expect(page.locator('.idle-page')).toBeVisible()
  })

  test('loads without JavaScript errors', async ({ page }) => {
    const consoleErrors = await loadApp(page)

    // Give the app a moment to finish async operations (settings load, WS connections)
    await page.waitForTimeout(2000)

    // Filter out expected warnings (WebSocket reconnection attempts, 404 from KV store)
    const realErrors = consoleErrors.filter((msg) => {
      // KV store 404s are expected (settings not yet saved)
      if (msg.includes('404') || msg.includes('Not found')) return false
      // WebSocket close/error during test lifecycle
      if (msg.includes('WebSocket')) return false
      // Failed to fetch can happen during teardown
      if (msg.includes('Failed to fetch')) return false
      return true
    })

    expect(realErrors).toEqual([])
  })
})

test.describe('StatusBar', () => {
  test('renders with machine state', async ({ page }) => {
    await loadApp(page)

    // The status bar should show the machine state
    const stateText = page.locator('.status-bar__state')
    await expect(stateText).toBeVisible()
    // Mock sends 'idle' state
    await expect(stateText).toHaveText('idle')
  })

  test('renders connection indicator', async ({ page }) => {
    await loadApp(page)

    // Connection indicator dot should be present (may appear in StatusBar and LayoutZone)
    const indicator = page.locator('.connection-indicator__dot').first()
    await expect(indicator).toBeVisible()
  })

  test('shows temperature values from mock data', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(2000)

    // Status bar should show mix/group temps
    const temps = page.locator('.status-bar__temp')
    await expect(temps.first()).toBeVisible()
    await expect(temps.first()).toContainText('92.5')
  })

  test('shows water level', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(2000)

    const waterLevel = page.locator('.status-bar__water')
    await expect(waterLevel).toBeVisible()
  })
})

test.describe('IdlePage action buttons', () => {
  test('shows Espresso, Steam, Hot Water, and Flush buttons', async ({ page }) => {
    await loadApp(page)

    // Wait for layout zones to render
    await page.waitForTimeout(1000)

    // Action buttons should be rendered via LayoutZone with type=actionButtons
    const espressoBtn = page.locator('.action-button', { hasText: 'Espresso' })
    const steamBtn = page.locator('.action-button', { hasText: 'Steam' })
    const hotWaterBtn = page.locator('.action-button', { hasText: 'Hot Water' })
    const flushBtn = page.locator('.action-button', { hasText: 'Flush' })

    await expect(espressoBtn).toBeVisible()
    await expect(steamBtn).toBeVisible()
    await expect(hotWaterBtn).toBeVisible()
    await expect(flushBtn).toBeVisible()
  })

  test('action buttons are clickable', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    // The Espresso button should be clickable (not disabled) since mock machine is 'idle'
    const espressoBtn = page.locator('.action-button', { hasText: 'Espresso' })
    await expect(espressoBtn).toBeVisible()
    await expect(espressoBtn).not.toHaveClass(/disabled/)

    // Click should not throw
    await espressoBtn.click()
  })

  test('action buttons have correct aria labels', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    // Check ARIA labels on action buttons
    await expect(page.locator('button[aria-label="Espresso"]')).toBeVisible()
    await expect(page.locator('button[aria-label="Steam"]')).toBeVisible()
    await expect(page.locator('button[aria-label="Hot Water"]')).toBeVisible()
    await expect(page.locator('button[aria-label="Flush"]')).toBeVisible()
  })
})

test.describe('StatusBar temps', () => {
  test('displays steam temperature', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(2000)

    const steam = page.locator('.status-bar__steam-temp')
    await expect(steam).toBeVisible()
    // Mock sends steamTemperature: 140.0
    await expect(steam).toContainText('140')
  })

  test('displays clock', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    const clock = page.locator('.status-bar__clock')
    await expect(clock).toBeVisible()
    const text = await clock.textContent()
    expect(text).toMatch(/\d{2}:\d{2}/)
  })
})

test.describe('Navigation', () => {
  test('can navigate to /settings', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/settings'))
    await page.waitForTimeout(500)

    await expect(page).toHaveURL(/.*#\/settings/)
  })

  test('can navigate to /history', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(500)

    await expect(page).toHaveURL(/.*#\/history/)
  })

  test('can navigate to /recipe/edit (legacy /workflow/edit and /bean-info redirect)', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    // Direct navigation to the new canonical route
    await page.evaluate(() => window.__vueRouter.push('/recipe/edit'))
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/.*#\/recipe\/edit/)

    // Legacy /workflow/edit should redirect to /recipe/edit
    await page.evaluate(() => window.__vueRouter.push('/workflow/edit'))
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/.*#\/recipe\/edit/)

    // Legacy /bean-info should also redirect to /recipe/edit
    await page.evaluate(() => window.__vueRouter.push('/bean-info'))
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/.*#\/recipe\/edit/)
  })
})

test.describe('WebSocket connection', () => {
  test('machine connects via WebSocket and updates state', async ({ page }) => {
    await loadApp(page)

    // Wait for WebSocket to connect and send data
    await page.waitForTimeout(2000)

    // The connection indicator should show connected (green dot)
    const dot = page.locator('.connection-indicator__dot--connected')
    await expect(dot.first()).toBeVisible()
  })
})

test.describe('ShotHistoryPage', () => {
  test('shows shots from API', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(1500)

    const rows = page.locator('.shot-history__row')
    await expect(rows).not.toHaveCount(0)

    const firstProfile = page.locator('.shot-history__profile').first()
    await expect(firstProfile).toBeVisible()
    await expect(firstProfile).not.toHaveText('Unknown Profile')
  })

  test('shows dose and duration from API data', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(1500)

    const meta = page.locator('.shot-history__meta').first()
    await expect(meta).toBeVisible()
    await expect(meta).toContainText('18.0g')
  })
})

test.describe('ProfileInfoPage', () => {
  test('loads profile details by ID', async ({ page }) => {
    await loadApp(page)
    // Wait past the 300ms router debounce guard
    await page.waitForTimeout(500)

    // Navigate via Vue Router
    await page.evaluate(() => {
      window.__vueRouter.push('/profile-info/profile-test1234567890abcdef')
    })
    await page.waitForTimeout(2500)

    // Should show the profile title (not "Profile not found")
    const title = page.locator('.profile-info__title')
    await expect(title).toBeVisible()
    await expect(title).toHaveText('Classic Blooming')
  })

  test('shows profile graph', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => {
      window.__vueRouter.push('/profile-info/profile-test1234567890abcdef')
    })
    await page.waitForTimeout(2500)

    // Profile graph should render
    const graph = page.locator('.profile-info__graph')
    await expect(graph).toBeVisible()
  })
})

test.describe('Layout Editor', () => {
  test('enters edit mode via query param and shows overlay', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    // Navigate to edit mode via in-app router
    await page.evaluate(() => window.__vueRouter.push({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })

    // Overlay should be visible with zone targets and Done pill
    await expect(page.locator('.edit-overlay')).toBeVisible()
    await expect(page.locator('.edit-overlay__done')).toBeVisible()

    // All 6 zones should be rendered
    const zones = page.locator('.edit-overlay__zone')
    await expect(zones).toHaveCount(6)

    // Widgets should be dimmed (idle-page--editing class applied)
    await expect(page.locator('.idle-page--editing')).toBeVisible()
  })

  test('tapping a zone opens the editor drawer', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    await page.evaluate(() => window.__vueRouter.push({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })

    // Click the Center Left zone
    await page.locator('.edit-overlay__zone--centerLeft').click()

    // Drawer should appear with the zone name
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('.drawer__title')).toContainText('Center Left')

    // Should show widgets (the default layout has gauges in centerLeft)
    const widgetRows = page.locator('.drawer__widget-name')
    await expect(widgetRows.first()).toBeVisible()
  })

  test('tapping a different zone switches the drawer', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    await page.evaluate(() => window.__vueRouter.push({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })

    // Open Center Left
    await page.locator('.edit-overlay__zone--centerLeft').click()
    await expect(page.locator('.drawer__title')).toContainText('Center Left')

    // Close drawer by clicking backdrop
    await page.locator('.drawer-backdrop').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(300)

    // Switch to Center Right
    await page.locator('.edit-overlay__zone--centerRight').click()
    await expect(page.locator('.drawer__title')).toContainText('Center Right')
  })

  test('Done button exits edit mode', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    await page.evaluate(() => window.__vueRouter.push({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })

    // Click Done
    await page.locator('.edit-overlay__done').click()
    await page.waitForTimeout(500)

    // Overlay should be gone
    await expect(page.locator('.edit-overlay')).not.toBeVisible()
    // URL should no longer have editLayout
    await expect(page).not.toHaveURL(/editLayout/)
  })

  test('can remove and add a widget', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    await page.evaluate(() => window.__vueRouter.push({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })

    // Open Center Left zone
    await page.locator('.edit-overlay__zone--centerLeft').click()
    await page.waitForSelector('[role="dialog"]', { timeout: 3000 })

    // Count initial widgets
    const initialCount = await page.locator('.drawer__row').count()
    expect(initialCount).toBeGreaterThan(0)

    // Remove the first widget
    await page.locator('.drawer__btn--remove').first().click()
    await page.waitForTimeout(300)

    // Should have one fewer widget
    const afterRemoveCount = await page.locator('.drawer__row').count()
    expect(afterRemoveCount).toBe(initialCount - 1)

    // Add a widget back — select from dropdown and click Add
    const select = page.locator('.drawer__select')
    if (await select.isVisible()) {
      await select.selectOption({ index: 1 })
      await page.locator('.drawer__add-btn').click()
      await page.waitForTimeout(300)

      const afterAddCount = await page.locator('.drawer__row').count()
      expect(afterAddCount).toBe(afterRemoveCount + 1)
    }
  })

  test('Settings Layout tab shows Edit Layout button', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    // Navigate to settings
    await page.goto('/#/settings')
    await page.waitForTimeout(1000)

    // Find and click the Layout tab
    const layoutTab = page.locator('text=Layout')
    await expect(layoutTab).toBeVisible()
    await layoutTab.click()
    await page.waitForTimeout(500)

    // Should show Edit Layout button
    const editBtn = page.locator('.layout-tab__edit-btn')
    await expect(editBtn).toBeVisible()
    await expect(editBtn).toHaveText('Edit Layout')

    // Should show Reset to Default button
    await expect(page.locator('.layout-tab__reset-btn')).toBeVisible()
  })

  test('Edit Layout button navigates to IdlePage in edit mode', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.goto('/#/settings')
    await page.waitForTimeout(1000)

    // Click Layout tab
    await page.locator('text=Layout').click()
    await page.waitForTimeout(500)

    // Click Edit Layout
    await page.locator('.layout-tab__edit-btn').click()
    await page.waitForTimeout(1000)

    // Should be on IdlePage in edit mode
    await expect(page).toHaveURL(/editLayout=true/)
    await expect(page.locator('.edit-overlay')).toBeVisible()
  })

  test('backdrop click closes the drawer', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    await page.evaluate(() => window.__vueRouter.push({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })

    // Open a zone drawer
    await page.locator('.edit-overlay__zone--centerLeft').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // Click the backdrop (top-left corner, outside the drawer)
    await page.locator('.drawer-backdrop').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(500)

    // Drawer should be closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })
})

test.describe('Pages load without errors', () => {
  const routes = [
    { path: '/#/', name: 'IdlePage' },
    { path: '/#/settings', name: 'SettingsPage' },
    { path: '/#/history', name: 'ShotHistoryPage' },
    { path: '/#/recipe/edit', name: 'RecipeEditorPage' },
  ]

  for (const route of routes) {
    test(`${route.name} loads without JS errors`, async ({ page }) => {
      const consoleErrors = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })

      await page.goto(route.path)
      await page.waitForSelector('.status-bar', { timeout: 10000 })
      await page.waitForTimeout(2000)

      // Filter expected errors
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
