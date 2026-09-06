/**
 * Daily-driver audit #3 — loading saved recipes on the HOME (IdlePage) must
 * switch coherent bean/grinder associations and clear them when a recipe is
 * unlinked — reflected both in the gateway workflow and the home shot plan.
 */
import { test, expect } from '@playwright/test'

const B = 'http://localhost:8080'

function recipe(id, name, overrides = {}) {
  return {
    id, name,
    coffeeName: 'Manual', roaster: '', grinder: 'TG', grinderSetting: '15',
    doseIn: 18, doseOut: 36,
    selectedBeanId: null, selectedBatchId: null, selectedGrinderId: null,
    includeSteam: false, steamSettings: { duration: 0 },
    includeFlush: false, flushSettings: { duration: 0 },
    includeHotWater: false, hotWaterSettings: { volume: 0 },
    ...overrides,
  }
}

async function reset(request) {
  await request.put(`${B}/api/v1/machine/state/idle`)
  await request.post(`${B}/api/v1/store/decenza-js/layout`, { data: { version: 2, zones: { topLeft: { widgets: ['scaleInfo'] }, topRight: { widgets: [] }, centerLeft: { widgets: ['actionButtons', 'shotPlan'] }, centerRight: { widgets: ['workflowCombos', 'lastShot'] }, bottomLeft: { widgets: ['navButtons'] }, bottomRight: { widgets: [] } } }, headers: { 'Content-Type': 'application/json' } })
  await request.put(`${B}/api/v1/workflow`, { data: { profile: { title: 'Default Profile', id: 'default-profile-001' }, context: { targetDoseWeight: 18, targetYield: 36 } }, headers: { 'Content-Type': 'application/json' } })
}

async function injectBean(request, beanId, name, batchId) {
  await request.post(`${B}/api/v1/test/inject-bean-with-batch`, { data: { beanId, beanName: name, beanRoaster: 'Roaster X', batchId }, headers: { 'Content-Type': 'application/json' } })
}

async function readWorkflow(request) {
  const r = await request.get(`${B}/api/v1/workflow`)
  return r.ok() ? r.json() : null
}

// Open the coffee picker from the shot-plan row and wait for the active-batch
// resolution that drives the --selected highlight to settle (so a not-yet-loaded
// popup can't false-positive a clean "nothing selected" state).
async function openPickerSettled(page) {
  await page.locator('.layout-widget__plan-text--coffee').first().click()
  const picker = page.locator('.bean-picker')
  await expect(picker).toBeVisible({ timeout: 5000 })
  await page.waitForResponse((r) => /\/api\/v1\/beans\/[^/]+\/batches$/.test(r.url()), { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(250)
  return picker
}

function countWorkflowPuts(page) {
  let count = 0
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/api/v1/workflow')) count++
  })
  return { count: () => count }
}

// Hold bean/batch lookups so a recipe load (which resolves its bean link) stays
// in-flight long enough to exercise the single-flight guards.
function delayBeanLookups(page, ms = 1200) {
  return page.route(/\/api\/v1\/(bean-batches\/[^/]+|beans\/[^/]+)$/, async (route) => {
    await new Promise((r) => setTimeout(r, ms))
    await route.continue()
  })
}

test.describe('Home recipe loading clears/switches associations (audit #3)', () => {
  test('linked A -> linked B -> manual clears beanBatchId + text on the gateway', async ({ page, request }) => {
    await reset(request)
    await injectBean(request, 'beanA', 'Bean A', 'batchA')
    await injectBean(request, 'beanB', 'Bean B', 'batchB')
    const comboA = recipe('ra', 'Recipe A', { selectedBeanId: 'beanA', selectedBatchId: 'batchA', coffeeName: '', roaster: '' })
    const comboB = recipe('rb', 'Recipe B', { selectedBeanId: 'beanB', selectedBatchId: 'batchB', coffeeName: '', roaster: '' })
    const comboManual = recipe('rm', 'Manual', { coffeeName: 'Manual Coffee' })
    await request.post(`${B}/api/v1/store/decenza-js/combos`, { data: { workflowCombos: [comboA, comboB, comboManual], selectedWorkflowCombo: -1 }, headers: { 'Content-Type': 'application/json' } })

    await page.goto('/')
    await page.waitForSelector('.preset-pill-row__pill', { timeout: 10000 })
    await page.waitForTimeout(500)

    // Tap Recipe A (bean-linked): association + denormalized text from the bean record.
    await page.locator('.preset-pill-row__pill').nth(0).click()
    await page.waitForTimeout(800)
    let wf = await readWorkflow(request)
    expect(wf?.context?.beanBatchId).toBe('batchA')
    expect(wf?.context?.coffeeName).toBe('Bean A')

    // Tap Recipe B: association switches to B's bean.
    await page.locator('.preset-pill-row__pill').nth(1).click()
    await page.waitForTimeout(800)
    wf = await readWorkflow(request)
    expect(wf?.context?.beanBatchId).toBe('batchB')
    expect(wf?.context?.coffeeName).toBe('Bean B')

    // Tap the manual recipe: no link → beanBatchId must clear, text becomes manual.
    await page.locator('.preset-pill-row__pill').nth(2).click()
    await page.waitForTimeout(800)
    wf = await readWorkflow(request)
    expect(wf?.context?.beanBatchId ?? null).toBeNull()
    expect(wf?.context?.coffeeName).toBe('Manual Coffee')

    // Home shot-plan reflects the manual coffee.
    const plan = page.locator('.layout-widget__plan-text--coffee').first()
    await expect(plan).toContainText('Manual Coffee', { timeout: 5000 })
  })

  test('client clears the bean link after a manual recipe (picker not re-highlighted); reload does not resurrect', async ({ page, request }) => {
    await reset(request)
    await injectBean(request, 'beanA', 'Bean A', 'batchA')
    const comboA = recipe('ra', 'Recipe A', { selectedBeanId: 'beanA', selectedBatchId: 'batchA', coffeeName: '', roaster: '' })
    const comboManual = recipe('rm', 'Manual', { coffeeName: 'Manual Coffee' })
    await request.post(`${B}/api/v1/store/decenza-js/combos`, { data: { workflowCombos: [comboA, comboManual], selectedWorkflowCombo: -1 }, headers: { 'Content-Type': 'application/json' } })

    await page.goto('/')
    await page.waitForSelector('.preset-pill-row__pill', { timeout: 10000 })
    await page.waitForTimeout(500)

    // Load the bean-linked recipe: gateway + app both carry batchA.
    await page.locator('.preset-pill-row__pill').nth(0).click()
    await page.waitForTimeout(800)
    let wf = await readWorkflow(request)
    expect(wf?.context?.beanBatchId).toBe('batchA')

    // Load the manual no-link recipe: gateway beanBatchId clears.
    await page.locator('.preset-pill-row__pill').nth(1).click()
    await page.waitForTimeout(800)
    wf = await readWorkflow(request)
    expect(wf?.context?.beanBatchId ?? null).toBeNull()

    const plan = page.locator('.layout-widget__plan-text--coffee').first()
    await expect(plan).toContainText('Manual Coffee', { timeout: 5000 })

    // CLIENT-side: open the coffee picker — no bean row may stay highlighted.
    // This only holds if the APP's own workflow cleared beanBatchId (the mock
    // omits the now-null key from the echo, so a preserve-on-omission client
    // would keep batchA and re-highlight Bean A here).
    const picker = await openPickerSettled(page)
    await expect(picker.locator('.bean-picker__row--selected')).toHaveCount(0)
    await page.keyboard.press('Escape')

    // A full reload (GET refresh) must not resurrect the cleared link either.
    await page.reload()
    await page.waitForSelector('.preset-pill-row__pill', { timeout: 10000 })
    await page.waitForTimeout(600)
    const plan2 = page.locator('.layout-widget__plan-text--coffee').first()
    await expect(plan2).toContainText('Manual Coffee', { timeout: 5000 })
    const picker2 = await openPickerSettled(page)
    await expect(picker2.locator('.bean-picker__row--selected')).toHaveCount(0)
  })

  test('single-flight: Repeat + coffee row cannot PUT while a recipe load is in flight', async ({ page, request }) => {
    await reset(request)
    await injectBean(request, 'beanB', 'Bean B', 'batchB')
    const linked = recipe('rb', 'Linked B', { selectedBeanId: 'beanB', selectedBatchId: 'batchB', coffeeName: '', roaster: '' })
    const manual = recipe('rm', 'Manual', { coffeeName: 'Manual Coffee' })
    await request.post(`${B}/api/v1/store/decenza-js/combos`, { data: { workflowCombos: [linked, manual], selectedWorkflowCombo: -1 }, headers: { 'Content-Type': 'application/json' } })
    // A shot so the Repeat button is present. No bean link: an (incorrect) Repeat
    // PUT during the busy window would clear beanBatchId and land AFTER the
    // recipe's — the exact stale-state bug single-flight must prevent.
    await request.post(`${B}/api/v1/test/inject-shot`, { data: { shotId: 'home-single-flight-shot', context: {} }, headers: { 'Content-Type': 'application/json' } })

    await page.goto('/')
    await page.waitForSelector('.preset-pill-row__pill', { timeout: 10000 })
    await page.waitForSelector('.layout-widget__repeat-btn', { timeout: 10000 })
    await page.waitForTimeout(600)

    const puts = countWorkflowPuts(page)
    await delayBeanLookups(page, 1200)

    // Deliberately select the bean-linked recipe (slow lookup holds recipeSelectionBusy).
    await page.locator('.preset-pill-row__pill').nth(0).click()
    await page.waitForTimeout(250) // busy; bean link still resolving

    // Attempt (a) Repeat and (b) the coffee row while the load is in flight.
    await page.locator('.layout-widget__repeat-btn').click({ force: true }).catch(() => {})
    await page.locator('.layout-widget__plan-text--coffee').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(250)

    // The recipe's own PUT has not fired yet (bean lookup still held), so any
    // workflow PUT now would be a single-flight violation.
    expect(puts.count()).toBe(0)
    await expect(page.locator('.bean-picker')).toHaveCount(0)

    // Load completes: EXACTLY one PUT (the recipe's), and its bean won.
    await expect.poll(() => puts.count()).toBe(1)
    const wf = await readWorkflow(request)
    expect(wf?.context?.beanBatchId).toBe('batchB')
    expect(wf?.context?.coffeeName).toBe('Bean B')
  })
})
