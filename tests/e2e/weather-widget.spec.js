/**
 * End-to-end tests for the `weather` home widget (issue #8).
 *
 * Runs against the local mock server (tests/mock-server.js) which serves a
 * weather.reaplugin websocket payload on /ws/v1/plugins/weather.reaplugin/weather
 * and counts socket connections for the single-owner assertion.
 *
 * Covers:
 *   1. A usable reading renders in both an edge zone and a center zone
 *      through exactly ONE shared plugin websocket.
 *   2. The widget can be added to an edge zone via the layout editor drawer
 *      (any-zone placement rule) and the drawer surfaces the plugin
 *      dependency hint.
 *
 * The pure state logic (WMO mapping, staleness, config/missing states,
 * unit/null handling) is unit-tested in tests/unit/weatherModel.test.js.
 */
import { test, expect } from '@playwright/test'

const B = 'http://localhost:8080'

async function seedLayout(request, zones) {
  await request.post(`${B}/api/v1/store/decenza-js/layout`, {
    data: { version: 2, zones },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function loadHome(page) {
  await page.goto('/')
  await page.waitForSelector('.idle-page', { timeout: 15000 })
}

async function resetWeatherConnections(request) {
  await request.post(`${B}/api/v1/test/reset-weather-connections`)
}

test.describe('Weather widget', () => {
  test('renders a usable reading in edge + center zones through one shared socket', async ({ page, request }) => {
    await resetWeatherConnections(request)
    await seedLayout(request, {
      topLeft: { widgets: ['weather'] },
      topRight: { widgets: [] },
      centerLeft: { widgets: ['weather'] },
      centerRight: { widgets: [] },
      bottomLeft: { widgets: ['navButtons'] },
      bottomRight: { widgets: ['sleepButton'] },
    })
    await loadHome(page)

    // Two placements, both showing the current reading.
    const readouts = page.locator('.weather-widget__readout')
    await expect(readouts).toHaveCount(2, { timeout: 15000 })

    // One compact edge + one spacious center layout with the same content.
    await expect(page.locator('.weather-widget__readout--edge')).toHaveCount(1)
    await expect(page.locator('.weather-widget__readout--center')).toHaveCount(1)

    // Metric units, current temp, today's high/low, humidity.
    await expect(page.locator('[data-testid="weather-current"]').first()).toHaveText('21°C')
    for (const readout of await readouts.all()) {
      await expect(readout).toContainText('H 24°')
      await expect(readout).toContainText('L 13°')
      await expect(readout).toContainText('58% humidity')
      await expect(readout.locator('.weather-widget__icon svg')).toHaveCount(1)
    }

    // Repeated placements must not open a second weather websocket.
    const { count } = await (await request.get(`${B}/api/v1/test/weather-connections`)).json()
    expect(count).toBe(1)

    // Leave the store clean for later specs (default layout applies on absence).
    await request.delete(`${B}/api/v1/store/decenza-js/layout`)
  })

  test('any-zone placement + dependency hint in the layout editor drawer', async ({ page, request }) => {
    await resetWeatherConnections(request)
    await seedLayout(request, {
      topLeft: { widgets: [] },
      topRight: { widgets: [] },
      centerLeft: { widgets: [] },
      centerRight: { widgets: [] },
      bottomLeft: { widgets: ['navButtons'] },
      bottomRight: { widgets: ['sleepButton'] },
    })
    await loadHome(page)

    // Let the initial home navigation + layout load settle before pushing a
    // same-route query change (hash router / nav debounce).
    await page.waitForTimeout(800)

    // Enter edit mode and open the edge top-left zone drawer.
    await page.evaluate(() => window.__vueRouter.push({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })
    await page.locator('.edit-overlay__zone--topLeft').click()
    await expect(page.locator('.drawer__title')).toContainText('Top Left')

    // Weather is offerable in an edge zone (rule 'any').
    const select = page.locator('.drawer__select')
    await expect(select.locator('option[value="weather"]')).toHaveCount(1)

    // Selecting it surfaces the plugin dependency hint.
    await select.selectOption('weather')
    await expect(page.locator('[data-testid="weather-dep-hint"]')).toBeVisible()

    await page.locator('.drawer__add-btn').click()
    await expect(page.locator('.idle-page__top-left .layout-widget--weather')).toHaveCount(1)

    // The hint stays visible once the widget is in place.
    await expect(page.locator('[data-testid="weather-dep-hint"]')).toBeVisible()

    // Center zones offer it too.
    await page.locator('.drawer-backdrop').click({ position: { x: 10, y: 10 } })
    await page.locator('.edit-overlay__zone--centerLeft').click()
    await expect(page.locator('.drawer__select option[value="weather"]')).toHaveCount(1)

    // Leave the store clean for later specs.
    await request.delete(`${B}/api/v1/store/decenza-js/layout`)
  })
})
