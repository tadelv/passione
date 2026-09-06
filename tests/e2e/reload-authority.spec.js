/**
 * E2E tests for the "reopen / reload does not overwrite the live workflow"
 * contract (daily-driver audit issue #2) and for read-only asynchronous
 * hydration in the recipe editor.
 *
 * Contract under test:
 *  - The gateway's live workflow is authoritative at startup. Opening the skin
 *    or the recipe editor must issue NO workflow PUT, even when the selected
 *    saved recipe disagrees with the live state. The saved recipe is only a
 *    comparison baseline (modified dot / Save buttons).
 *  - Mount-time hydration of the recipe editor is read-only, even when slow
 *    async bean lookups outlast the 300ms live-apply debounce. It must not
 *    publish intermediate/default forms, must not write on unmount, and must
 *    not throw / leave an unhandled rejection if the component unmounts before
 *    hydration resolves.
 *  - Deliberately selecting a saved recipe in the editor is an intentional user
 *    action that MUST still apply once after its hydration completes.
 *
 * Slow lookups are simulated with Playwright route interception (no mock
 * changes): bean / batch endpoints are held ~800ms, comfortably past the 300ms
 * debounce that used to publish intermediate forms.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'
const BEAN_ID = 'bean-reload1'
const BATCH_ID = 'batch-reload1'

// A plain, bean-less recipe whose dose differs from the live workflow.
const PLAIN_RECIPE = {
  id: 'morning-reload',
  name: 'Morning',
  profileId: 'profile-test1234567890abcdef',
  profileTitle: 'Classic Blooming',
  coffeeName: 'Test Beans',
  roaster: 'Roaster X',
  doseIn: 18,
  doseOut: 36,
  grinder: 'Test Grinder',
  grinderSetting: '15',
  includeSteam: false,
  steamSettings: { duration: 0 },
  includeFlush: false,
  flushSettings: { duration: 0 },
  includeHotWater: false,
  hotWaterSettings: { volume: 0 },
}

// A bean-linked recipe used to exercise slow hydration on an explicit select.
const BEAN_RECIPE = {
  id: 'afternoon-reload',
  name: 'Afternoon',
  selectedBeanId: BEAN_ID,
  selectedBatchId: BATCH_ID,
  doseIn: 20,
  doseOut: 40,
  grinder: 'Reload Grinder',
  grinderSetting: '12',
  includeSteam: false,
  steamSettings: { duration: 0 },
  includeFlush: false,
  flushSettings: { duration: 0 },
  includeHotWater: false,
  hotWaterSettings: { volume: 0 },
}

async function seedRecipes(request, recipes, selectedIndex = 0) {
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/combos`, {
    data: { workflowCombos: recipes, selectedWorkflowCombo: selectedIndex },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function setWorkflow(request, payload) {
  await request.put(`${BASE_URL}/api/v1/workflow`, {
    data: payload,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function setWorkflowDefault(request) {
  await setWorkflow(request, {
    profile: { id: 'profile-test1234567890abcdef', title: 'Classic Blooming', author: 'Test Author' },
    context: { targetDoseWeight: 18, targetYield: 36, grinderModel: 'Test Grinder', grinderSetting: '15', coffeeName: 'Test Beans', coffeeRoaster: 'Roaster X' },
  })
}

async function readWorkflow(request) {
  const res = await request.get(`${BASE_URL}/api/v1/workflow`)
  if (!res.ok()) return null
  return await res.json()
}

async function resetLayout(request) {
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/layout`, {
    data: { version: 2, zones: { topLeft: { widgets: ['scaleInfo'] }, topRight: { widgets: [] }, centerLeft: { widgets: ['actionButtons', 'shotPlan'] }, centerRight: { widgets: ['workflowCombos', 'lastShot'] }, bottomLeft: { widgets: ['navButtons'] }, bottomRight: { widgets: [] } } },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function injectBean(request) {
  await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
    data: { beanId: BEAN_ID, beanName: 'Reload Bean', beanRoaster: 'Reload Roaster', batchId: BATCH_ID },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function loadEditor(page) {
  await page.goto('/#/recipe/edit')
  await page.waitForSelector('.recipe-editor', { timeout: 10000 })
  await page.waitForSelector('.recipe-pill-rail__pill', { timeout: 10000 })
}

// Hold bean/batch lookups so a hydration that touches them outlasts the
// editor's 300ms live-apply debounce.
function delayBeanLookups(page, ms = 800) {
  return page.route(/\/api\/v1\/(bean-batches\/[^/]+|beans\/[^/]+\/batches)/, async (route) => {
    await new Promise((r) => setTimeout(r, ms))
    await route.continue()
  })
}

function countWorkflowPuts(page) {
  let count = 0
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/api/v1/workflow')) count++
  })
  return { count: () => count }
}

test.describe('Reload / startup authority', () => {
  test.beforeEach(async ({ request }) => {
    await request.put(`${BASE_URL}/api/v1/machine/state/idle`)
    await resetLayout(request)
    await setWorkflowDefault(request)
  })

  test('opening the recipe editor over a diverged live workflow issues NO workflow PUT and hydrates gateway values', async ({ page, request }) => {
    await seedRecipes(request, [PLAIN_RECIPE])
    await setWorkflow(request, {
      profile: { id: 'profile-alt0987654321fedcba', title: 'Alternative Profile', author: 'Test Author' },
      context: { targetDoseWeight: 20, targetYield: 40 },
    })

    const puts = countWorkflowPuts(page)
    await loadEditor(page)
    // Give hydration plenty of time to settle — it must stay read-only.
    await page.waitForTimeout(700)

    expect(puts.count()).toBe(0)

    // Gateway dose (20) wins over the saved recipe's (18).
    await expect(page.locator('[data-testid="recipe-doseIn"]')).toHaveAttribute('aria-valuenow', '20', { timeout: 10000 })

    // Form has diverged from the selected saved recipe → modified is accurate.
    await expect(page.locator('[data-testid="recipe-modified-badge"]')).toBeVisible({ timeout: 3000 })

    // Gateway is untouched.
    const wf = await readWorkflow(request)
    expect(wf?.context?.targetDoseWeight).toBe(20)
    expect(wf?.context?.targetYield).toBe(40)
  })

  test('slow bean hydration during editor mount is read-only (no intermediate or stale-default PUT)', async ({ page, request }) => {
    await seedRecipes(request, [PLAIN_RECIPE])
    await injectBean(request)
    // Live workflow links a bean (forces async batch hydration on mount) and
    // diverges from the saved dose.
    await setWorkflow(request, {
      profile: { id: 'profile-alt0987654321fedcba', title: 'Alternative Profile', author: 'Test Author' },
      context: { targetDoseWeight: 20, targetYield: 40, beanBatchId: BATCH_ID },
    })

    const puts = countWorkflowPuts(page)
    await delayBeanLookups(page)
    await loadEditor(page)
    await page.waitForTimeout(1500)

    // Read-only hydration must never reach the gateway.
    expect(puts.count()).toBe(0)

    // Once the slow lookups resolve, the editor reflects the gateway dose.
    await expect(page.locator('[data-testid="recipe-doseIn"]')).toHaveAttribute('aria-valuenow', '20', { timeout: 10000 })

    const wf = await readWorkflow(request)
    expect(wf?.context?.targetDoseWeight).toBe(20)
  })

  test('selecting a bean-linked saved recipe applies exactly once after slow hydration', async ({ page, request }) => {
    await seedRecipes(request, [PLAIN_RECIPE, BEAN_RECIPE])
    await injectBean(request)
    await setWorkflowDefault(request)

    const puts = countWorkflowPuts(page)
    await delayBeanLookups(page)
    await loadEditor(page)
    await page.waitForTimeout(500)

    // Deliberately pick the bean-linked recipe (second pill). This is an
    // intentional user action and must apply exactly once — not during the
    // slow hydration, and not again on the way out.
    const before = puts.count()
    await page.locator('.recipe-pill-rail__pill').nth(1).click()
    await page.waitForTimeout(1800)

    expect(puts.count()).toBe(before + 1)

    // The selected bean recipe's dose reached the gateway.
    const wf = await readWorkflow(request)
    expect(wf?.context?.targetDoseWeight).toBe(20)
    expect(wf?.context?.targetYield).toBe(40)
  })

  test('unmounting while slow hydration is in flight leaves no stray PUT and no page error', async ({ page, request }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    const failedReqs = []
    page.on('requestfailed', (req) => failedReqs.push(req.url()))

    await seedRecipes(request, [PLAIN_RECIPE])
    await injectBean(request)
    await setWorkflow(request, {
      profile: { id: 'profile-alt0987654321fedcba', title: 'Alternative Profile', author: 'Test Author' },
      context: { targetDoseWeight: 20, targetYield: 40, beanBatchId: BATCH_ID },
    })

    const puts = countWorkflowPuts(page)
    await delayBeanLookups(page, 1200)

    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.recipe-editor', { timeout: 10000 })
    // Let the router's 300ms navigation-debounce window pass (a push inside it
    // after the initial goto is silently dropped), then leave (Home) while the
    // slow bean hydration is still resolving.
    await page.waitForTimeout(450)
    await page.locator('.bottom-bar__home').click()
    await page.waitForTimeout(2000)

    expect(puts.count()).toBe(0)
    expect(errors).toEqual([])
    expect(failedReqs.filter((u) => u.includes('/api/v1/bean-batches') || u.includes('/api/v1/beans'))).toEqual([])
    await expect(page).toHaveURL(/\/#\/$/)
  })

  test('no saved recipes + live operations enabled: a dose edit preserves steam/flush/hotwater', async ({ page, request }) => {
    await seedRecipes(request, [])
    await setWorkflow(request, {
      profile: { id: 'profile-test1234567890abcdef', title: 'Classic Blooming', author: 'Test Author' },
      context: { targetDoseWeight: 18, targetYield: 36 },
      steamSettings: { targetTemperature: 160, duration: 30, flow: 1.5, stopAtTemperature: 0 },
      rinseData: { targetTemperature: 90, duration: 5, flow: 6 },
      hotWaterData: { targetTemperature: 80, volume: 200, duration: 60, flow: 6 },
    })

    const puts = countWorkflowPuts(page)
    await page.goto('/#/recipe/edit')
    const dose = page.locator('[data-testid="recipe-doseIn"]')
    await expect(dose).toBeVisible({ timeout: 10000 })
    await dose.locator('.value-input__btn[aria-label="Increase value"]').click()
    await page.waitForTimeout(600)

    // Dose reached the gateway AND operations were NOT silently disabled.
    const wf = await readWorkflow(request)
    expect(wf?.context?.targetDoseWeight).toBeGreaterThan(18)
    expect(wf?.steamSettings?.duration).toBe(30)
    expect(wf?.rinseData?.duration).toBe(5)
    expect(wf?.hotWaterData?.volume).toBe(200)
    expect(puts.count()).toBeGreaterThan(0) // the dose edit did live-apply
  })

  test('delayed initial workflow keeps the editor read-only/loading until hydration (no defaults PUT)', async ({ page, request }) => {
    await seedRecipes(request, [PLAIN_RECIPE])
    await setWorkflowDefault(request)
    const puts = countWorkflowPuts(page)

    await page.route('**/api/v1/workflow', async (route) => {
      const req = route.request()
      if (req.method() === 'GET') await new Promise((r) => setTimeout(r, 900))
      await route.continue()
    })

    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.recipe-editor', { timeout: 10000 })

    // While the initial workflow is still in flight the editable form is hidden
    // behind a loading state, so form defaults cannot be edited or pushed.
    await expect(page.locator('.recipe-editor__loading')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('[data-testid="recipe-doseIn"]')).toHaveCount(0)

    // Once the workflow arrives the editor hydrates (form now editable).
    await expect(page.locator('[data-testid="recipe-doseIn"]')).toBeVisible({ timeout: 10000 })
    expect(puts.count()).toBe(0)
  })

  test('edit then slow recipe selection then immediate Home issues no intermediate write', async ({ page, request }) => {
    // The selected slow recipe links a bean UNIQUE to this selection (never
    // warmed by mount hydration), so its lookup is genuinely uncached/in-flight
    // when the user leaves — not warmed by a prior helper's network ordering.
    const LEAVE_BEAN = 'bean-leave-unique'
    const LEAVE_BATCH = 'batch-leave-unique'
    const LEAVE_RECIPE = { ...BEAN_RECIPE, id: 'afternoon-leave', selectedBeanId: LEAVE_BEAN, selectedBatchId: LEAVE_BATCH }
    await seedRecipes(request, [PLAIN_RECIPE, LEAVE_RECIPE])
    await setWorkflowDefault(request)
    await injectBean(request)
    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: LEAVE_BEAN, beanName: 'Leave Bean', beanRoaster: 'R', batchId: LEAVE_BATCH },
      headers: { 'Content-Type': 'application/json' },
    })
    const puts = countWorkflowPuts(page)
    await delayBeanLookups(page, 1200)

    await page.goto('/#/recipe/edit')
    await expect(page.locator('.recipe-pill-rail__pill')).toHaveCount(2, { timeout: 10000 })
    await page.waitForTimeout(400) // let mount hydration settle so the leave is unambiguous

    // A genuine dose edit arms the 300ms debounce...
    await page.locator('[data-testid="recipe-doseIn"] .value-input__btn[aria-label="Increase value"]').click()
    // ...then the user picks the slow (uncached) bean-linked recipe and leaves
    // (hash→home) while the selection is still resolving.
    await page.locator('.recipe-pill-rail__pill').nth(1).click()
    await page.evaluate(() => { window.location.hash = '/#/' })
    await expect(page).toHaveURL(/\/#\/$/, { timeout: 5000 })
    await page.waitForTimeout(1800)

    // Neither the pre-hydration defaults, the pending dose edit, nor the
    // in-flight selection reached the gateway (leaving abandons the selection).
    expect(puts.count()).toBe(0)
  })

  test('cleared gateway coffee text is not resurrected from the saved recipe baseline', async ({ page, request }) => {
    // Saved recipe pins coffee "Test Beans"; the live workflow has explicitly
    // cleared coffee/roaster. The saved recipe must not resurrect that text
    // into the form and then back to the gateway on a later edit.
    await seedRecipes(request, [PLAIN_RECIPE])
    await setWorkflow(request, {
      profile: { id: 'profile-test1234567890abcdef', title: 'Classic Blooming', author: 'Test Author' },
      context: { targetDoseWeight: 18, targetYield: 36, coffeeName: null, coffeeRoaster: null },
    })

    await page.goto('/#/recipe/edit')
    await expect(page.locator('[data-testid="recipe-doseIn"]')).toBeVisible({ timeout: 10000 })
    await page.locator('[data-testid="recipe-doseIn"] .value-input__btn[aria-label="Increase value"]').click()
    await page.waitForTimeout(600)

    const wf = await readWorkflow(request)
    expect(wf?.context?.targetDoseWeight).toBeGreaterThan(18)
    expect(wf?.context?.coffeeName ?? null).toBeNull()
    expect(wf?.context?.coffeeRoaster ?? null).toBeNull()
  })
})
