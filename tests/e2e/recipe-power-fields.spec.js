/**
 * E2E tests for the power-user recipe fields (#43, #44):
 * grinder RPM and basket data, gated by Settings → Preferences toggles.
 *
 * Each test seeds the powerUser settings group via the KV-store endpoint
 * BEFORE navigating, then asserts the recipe editor renders / hides the
 * gated fields. Hydration tests seed workflow.context directly and assert
 * the field values are picked up.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

async function setPowerUserSettings(request, { showGrinderRpm = false, showBasketData = false } = {}) {
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/powerUser`, {
    data: { showGrinderRpm, showBasketData },
  })
}

async function setWorkflowContext(request, ctxFields) {
  // Read current workflow then PUT with the new context fields merged in.
  const current = await (await request.get(`${BASE_URL}/api/v1/workflow`)).json()
  const merged = {
    ...current,
    context: { ...(current.context ?? {}), ...ctxFields },
  }
  await request.put(`${BASE_URL}/api/v1/workflow`, { data: merged })
}

// Power-user fields (grinderRpm, basketSize, basketType) live under
// context.extras, not at the top level of context — see CLAUDE.md:
// "write them under context.extras.{grinderRpm,basketSize,basketType}"
async function setWorkflowExtras(request, extras) {
  const current = await (await request.get(`${BASE_URL}/api/v1/workflow`)).json()
  const merged = {
    ...current,
    context: {
      ...(current.context ?? {}),
      extras: { ...(current.context?.extras ?? {}), ...extras },
    },
  }
  await request.put(`${BASE_URL}/api/v1/workflow`, { data: merged })
}

test.describe('Recipe-editor power-user fields', () => {
  test.beforeEach(async ({ request }) => {
    // Reset toggles + workflow power-user fields between tests.
    await setPowerUserSettings(request, { showGrinderRpm: false, showBasketData: false })
    await setWorkflowExtras(request, { grinderRpm: null, basketSize: null, basketType: null })
  })

  test('default OFF — RPM and basket fields are not rendered', async ({ page }) => {
    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.recipe-editor', { timeout: 5_000 })

    await expect(page.locator('[data-testid="recipe-grinderRpm-field"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="recipe-basket-section"]')).toHaveCount(0)
  })

  test('RPM toggle ON — RPM field renders and hydrates from workflow context', async ({ page, request }) => {
    await setPowerUserSettings(request, { showGrinderRpm: true })
    await setWorkflowExtras(request, { grinderRpm: 1200 })

    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.recipe-editor', { timeout: 5_000 })

    const rpmField = page.locator('[data-testid="recipe-grinderRpm-field"]')
    await expect(rpmField).toBeVisible({ timeout: 5_000 })
    // ValueInput exposes its current value via the spinbutton's aria-valuenow.
    await expect(rpmField.locator('[role="spinbutton"]')).toHaveAttribute('aria-valuenow', '1200')
  })

  test('Basket toggle ON — fields render and hydrate from workflow context', async ({ page, request }) => {
    await setPowerUserSettings(request, { showBasketData: true })
    await setWorkflowExtras(request, { basketSize: 18, basketType: 'IMS Competition' })

    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.recipe-editor', { timeout: 5_000 })

    const basketSection = page.locator('[data-testid="recipe-basket-section"]')
    await expect(basketSection).toBeVisible({ timeout: 5_000 })
    await expect(basketSection.locator('[role="spinbutton"]')).toHaveAttribute('aria-valuenow', '18')
    await expect(page.locator('[data-testid="recipe-basketType-input"]')).toHaveValue('IMS Competition')
  })

  test('typing into basket type input live-applies to workflow', async ({ page, request }) => {
    await setPowerUserSettings(request, { showBasketData: true })

    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.recipe-editor', { timeout: 5_000 })

    const typeInput = page.locator('[data-testid="recipe-basketType-input"]')
    await expect(typeInput).toBeVisible({ timeout: 5_000 })
    await typeInput.fill('VST 18')
    // Wait past the 300ms live-apply debounce + small buffer.
    await page.waitForTimeout(700)

    const workflow = await (await request.get(`${BASE_URL}/api/v1/workflow`)).json()
    expect(workflow.context?.basketType).toBe('VST 18')
  })
})
