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

  test('shows temperature value from mock data', async ({ page }) => {
    await loadApp(page)

    // Wait for WebSocket data to arrive
    await page.waitForTimeout(1000)

    // Temperature should display the mock value (92.5)
    const tempElement = page.locator('.status-bar__temp')
    await expect(tempElement).toBeVisible()
    await expect(tempElement).toContainText('92.5')
  })

  test('shows water level', async ({ page }) => {
    await loadApp(page)

    // Wait for WebSocket data
    await page.waitForTimeout(1000)

    // Water level should show 75% (from mock data)
    const waterLevel = page.locator('.status-bar__water')
    await expect(waterLevel).toBeVisible()
    await expect(waterLevel).toContainText('75%')
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

test.describe('CircularGauge', () => {
  test('displays temperature value', async ({ page }) => {
    await loadApp(page)

    // Wait for WebSocket data to populate the gauge
    await page.waitForTimeout(1500)

    // The gauge renders inside a LayoutZone. Look for the gauge component.
    const gauge = page.locator('.circular-gauge')
    await expect(gauge.first()).toBeVisible()

    // The gauge should show the mock temperature (92.5)
    const gaugeNumber = page.locator('.circular-gauge__number')
    await expect(gaugeNumber.first()).toBeVisible()
    await expect(gaugeNumber.first()).toHaveText('92.5')
  })

  test('has proper ARIA attributes', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1500)

    // The gauge has role="meter" with ARIA value attributes
    const gauge = page.locator('[role="meter"]')
    await expect(gauge.first()).toBeVisible()

    // Check that aria-valuenow reflects the temperature
    const valuenow = await gauge.first().getAttribute('aria-valuenow')
    expect(parseFloat(valuenow)).toBeCloseTo(92.5, 0)
  })
})

test.describe('Navigation', () => {
  test('clicking Settings navigates to /settings', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    // Find the Settings nav button (rendered by LayoutZone with navButtons type)
    const settingsBtn = page.locator('.layout-zone__nav-btn', { hasText: 'Settings' })
    await expect(settingsBtn).toBeVisible()

    // Click it
    await settingsBtn.click()

    // Wait for navigation
    await page.waitForTimeout(500)

    // URL should contain #/settings
    await expect(page).toHaveURL(/.*#\/settings/)
  })

  test('clicking History navigates to /history', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    const historyBtn = page.locator('.layout-zone__nav-btn', { hasText: 'History' })
    await expect(historyBtn).toBeVisible()

    await historyBtn.click()
    await page.waitForTimeout(500)

    await expect(page).toHaveURL(/.*#\/history/)
  })

  test('clicking Beans navigates to /bean-info', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(1000)

    const beansBtn = page.locator('.layout-zone__nav-btn', { hasText: 'Beans' })
    await expect(beansBtn).toBeVisible()

    await beansBtn.click()
    await page.waitForTimeout(500)

    await expect(page).toHaveURL(/.*#\/bean-info/)
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

test.describe('Pages load without errors', () => {
  const routes = [
    { path: '/#/', name: 'IdlePage' },
    { path: '/#/settings', name: 'SettingsPage' },
    { path: '/#/history', name: 'ShotHistoryPage' },
    { path: '/#/bean-info', name: 'BeanInfoPage' },
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
