/**
 * Daily-driver audit #3 carry-over (issue #2): deliberately selecting a saved
 * recipe in the recipe editor must apply that recipe's OWN execution profile to
 * the live workflow — not just re-use the current workflow profile for a
 * temperature override (the pre-fix behavior switched nothing when the recipe's
 * profile differed from the live one).
 *
 * Profile identity is the recipe's stored profileId; when it already equals the
 * live workflow's profile id, selection must NOT re-push the profile (the saved
 * recipe's selection PUT carries context only).
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

const RECIPE_B = {
  id: 'recipe-b-classic',
  name: 'Classic Recipe',
  emoji: '',
  profileId: 'profile-test1234567890abcdef', // Classic Blooming
  profileTitle: 'Classic Blooming',
  coffeeName: 'Test Beans',
  roaster: 'Roaster X',
  doseIn: 18,
  doseOut: 36,
  grinder: 'Test Grinder',
  grinderSetting: '15',
  selectedBeanId: null,
  selectedBatchId: null,
  selectedGrinderId: null,
  brewTemperature: 94,
  includeSteam: false,
  steamSettings: { duration: 0 },
  includeFlush: false,
  flushSettings: { duration: 0 },
  includeHotWater: false,
  hotWaterSettings: { volume: 0 },
}

const CLASSIC_ID = 'profile-test1234567890abcdef'
const ALT_ID = 'profile-alt0987654321fedcba'

async function seedRecipe(request) {
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/combos`, {
    data: { workflowCombos: [RECIPE_B], selectedWorkflowCombo: 0 },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function resetLayout(request) {
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/layout`, {
    data: { version: 2, zones: { topLeft: { widgets: ['scaleInfo'] }, topRight: { widgets: [] }, centerLeft: { widgets: ['actionButtons', 'shotPlan'] }, centerRight: { widgets: ['workflowCombos', 'lastShot'] }, bottomLeft: { widgets: ['navButtons'] }, bottomRight: { widgets: [] } } },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function setWorkflowProfile(request, id, title) {
  await request.put(`${BASE_URL}/api/v1/workflow`, {
    data: {
      profile: { id, title, author: 'Test Author' },
      context: { targetDoseWeight: 20, targetYield: 40, coffeeName: 'Live Coffee', coffeeRoaster: 'Live Roaster', grinderModel: 'Live Grinder', grinderSetting: '20' },
    },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function readWorkflow(request) {
  const res = await request.get(`${BASE_URL}/api/v1/workflow`)
  return res.ok() ? res.json() : null
}

function captureWorkflowPuts(page) {
  const bodies = []
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/api/v1/workflow')) {
      bodies.push({ postData: req.postData() || '' })
    }
  })
  return { count: () => bodies.length, bodies }
}

test.describe('Recipe editor selection applies the selected recipe profile', () => {
  test.beforeEach(async ({ request }) => {
    await request.put(`${BASE_URL}/api/v1/machine/state/idle`)
    await resetLayout(request)
    await seedRecipe(request)
  })

  test('selecting a recipe whose profile differs from the live one switches the execution profile (single PUT)', async ({ page, request }) => {
    await setWorkflowProfile(request, ALT_ID, 'Alternative Profile')

    const puts = captureWorkflowPuts(page)
    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.recipe-pill-rail__pill', { timeout: 10000 })
    await page.waitForTimeout(200)

    const before = puts.count()
    await page.locator('.recipe-pill-rail__pill').first().click()
    await page.waitForTimeout(1500)

    // Exactly one selection PUT (mount hydration stays read-only).
    expect(puts.count()).toBe(before + 1)

    // The live workflow now carries the selected recipe's profile with the
    // brew-temperature curve override applied (94 on a [93,93,93] profile stays
    // 94 by delta).
    const wf = await readWorkflow(request)
    expect(wf?.profile?.title).toBe('Classic Blooming')
    expect(Array.isArray(wf?.profile?.steps)).toBe(true)
    for (const s of wf.profile.steps) expect(s.temperature).toBe(94)
  })

  test('selecting a recipe whose profile is already live does not re-push the profile', async ({ page, request }) => {
    await setWorkflowProfile(request, CLASSIC_ID, 'Classic Blooming')

    const puts = captureWorkflowPuts(page)
    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.recipe-pill-rail__pill', { timeout: 10000 })
    await page.waitForTimeout(200)

    const before = puts.count()
    await page.locator('.recipe-pill-rail__pill').first().click()
    await page.waitForTimeout(1200)

    // One selection PUT, and its body must NOT carry a `profile` key (identity
    // match — profile already live, only context is sent).
    expect(puts.count()).toBe(before + 1)
    const selectionBody = puts.bodies[puts.bodies.length - 1]
    expect(JSON.parse(selectionBody.postData).profile).toBeUndefined()

    const wf = await readWorkflow(request)
    expect(wf?.profile?.title).toBe('Classic Blooming')
  })

  test('no-id gateway echo: saved recipe keeps the catalog profileId after selection + Save', async ({ page, request }) => {
    // Live profile differs so selection actually pushes the recipe's profile.
    await setWorkflowProfile(request, ALT_ID, 'Alternative Profile')

    // Gateway Profile.toJson carries NO id in a workflow echo — strip it from
    // every workflow PUT response so the editor sees exactly what a real
    // gateway returns (deep-merged profile content, no identity field).
    await page.route('**/api/v1/workflow', async (route) => {
      const req = route.request()
      if (req.method() !== 'PUT') return route.continue()
      const response = await route.fetch()
      const body = await response.json()
      if (body?.profile) delete body.profile.id
      await route.fulfill({ response, json: body })
    })

    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.recipe-pill-rail__pill', { timeout: 10000 })
    await page.waitForTimeout(300)

    // Deliberately select the saved recipe (Classic).
    await page.locator('.recipe-pill-rail__pill').first().click()
    await page.waitForTimeout(1200)

    // Make the form diverge (bump dose) so Save becomes available, then Save.
    await page.locator('[data-testid="recipe-doseIn"] .value-input__btn[aria-label="Increase value"]').click()
    await page.waitForTimeout(600)
    await page.locator('[data-testid="wfe-save"]').click()
    await page.waitForTimeout(1300) // debounced KV write

    // Even though every workflow echo lacked profile.id, the persisted recipe
    // must keep the CATALOG record id (identity never inferred from the echo).
    const res = await request.get(`${BASE_URL}/api/v1/store/decenza-js/combos`)
    const kv = res.ok() ? await res.json() : null
    expect(kv?.workflowCombos?.[0]?.profileId).toBe(CLASSIC_ID)
    expect(kv?.workflowCombos?.[0]?.profileTitle).toBe('Classic Blooming')
    expect(kv?.workflowCombos?.[0]?.doseIn).toBeGreaterThan(18)
  })
})
