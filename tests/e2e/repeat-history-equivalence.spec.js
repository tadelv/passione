/**
 * Daily-driver audit #3 — Repeat (home last-shot) and History Load are the two
 * real entry points that load a shot into the live workflow. They must yield an
 * IDENTICAL payload for the same linked shot: authoritative bean batch + grinder
 * ids, resolved bean text + grinder setting, the PLANNED target (never an
 * overshoot), and no change to operation settings.
 *
 * We don't just assert the end state after one entry point — we capture the real
 * browser workflow PUT each entry point sends, reset the live context to a
 * *different* bean/grinder in between, then prove Repeat and History Load
 * restore the SAME authoritative shot identity (no stale leftover inherited
 * from the live context), operations are untouched, and nothing starts the
 * machine.
 */
import { test, expect } from '@playwright/test'

const B = 'http://localhost:8080'
const BEAN_ID = 'bean-eq', BATCH_ID = 'batch-eq', GRINDER_ID = 'grinder-eq'
const SHOT_ID = 'shot-eq-1'

async function seed(request) {
  await request.put(`${B}/api/v1/machine/state/idle`)
  await request.post(`${B}/api/v1/store/decenza-js/layout`, { data: { version: 2, zones: { topLeft: { widgets: ['scaleInfo'] }, topRight: { widgets: [] }, centerLeft: { widgets: ['actionButtons', 'shotPlan'] }, centerRight: { widgets: ['workflowCombos', 'lastShot'] }, bottomLeft: { widgets: ['navButtons'] }, bottomRight: { widgets: [] } } }, headers: { 'Content-Type': 'application/json' } })
  await request.post(`${B}/api/v1/test/inject-bean-with-batch`, { data: { beanId: BEAN_ID, beanName: 'Equality Bean', beanRoaster: 'Equality Roaster', batchId: BATCH_ID }, headers: { 'Content-Type': 'application/json' } })
  // Pre-load operations so we can assert Repeat/Load leave them untouched.
  await request.put(`${B}/api/v1/workflow`, { data: { profile: { title: 'Old', id: 'old-profile' }, context: { targetDoseWeight: 20, targetYield: 40 }, steamSettings: { targetTemperature: 160, duration: 30, flow: 1.5, stopAtTemperature: 0 } }, headers: { 'Content-Type': 'application/json' } })
  // A linked shot carrying planned targets (actual overshooted 44g, plan 36g).
  await request.post(`${B}/api/v1/test/inject-shot`, { data: {
    shotId: SHOT_ID,
    context: {
      beanBatchId: BATCH_ID,
      grinderId: GRINDER_ID, grinderModel: 'Equality Grinder', grinderSetting: '12',
      coffeeName: 'Old Stale', coffeeRoaster: 'Stale',
      targetDoseWeight: 18, targetYield: 36,
      extras: { grinderRpm: 900 },
    },
  }, headers: { 'Content-Type': 'application/json' } })
}

async function readWorkflow(request) {
  const r = await request.get(`${B}/api/v1/workflow`)
  return r.ok() ? r.json() : null
}

async function expectLoaded(wf) {
  expect(wf?.context?.beanBatchId).toBe(BATCH_ID)
  expect(wf?.context?.grinderId).toBe(GRINDER_ID)
  expect(wf?.context?.grinderModel).toBe('Equality Grinder')
  expect(wf?.context?.grinderSetting).toBe('12')
  expect(wf?.context?.coffeeName).toBe('Equality Bean') // resolved, not stale text
  expect(wf?.context?.targetYield).toBe(36) // planned, never overshoot
  expect(wf?.context?.extras?.grinderRpm).toBe(900)
  // Operations untouched.
  expect(wf?.steamSettings?.duration).toBe(30)
}

// Collect the browser's real workflow PUT bodies and any espresso machine start.
// A machine start can be signalled two ways: a state/command in a PUT/POST body
// OR a path-only command (e.g. PUT /api/v1/machine/state/espresso). Count both.
function isEspressoStart(url, req) {
  if (/\/machine\/state\/espresso$/.test(url) || /\/machine\/espresso$/.test(url)) return true
  let body = null
  try { body = req.postDataJSON() } catch { /* ignore */ }
  return body?.state === 'espresso' || body?.command === 'espresso'
}
function track(page) {
  const wfPuts = []
  const espressoStarts = []
  page.on('request', (req) => {
    const url = req.url()
    if (req.method() === 'PUT' && url.includes('/api/v1/workflow')) {
      wfPuts.push(req.postData() || '')
    }
    if (/\/api\/v1\/machine(\/state)?(?:\/[a-zA-Z]+)?$/.test(url) && (req.method() === 'PUT' || req.method() === 'POST')) {
      if (isEspressoStart(url, req)) espressoStarts.push(url)
    }
  })
  return { wfPuts, espressoStarts, wfCount: () => wfPuts.length }
}

test.describe('Home Repeat / History Load equivalence (audit #3)', () => {
  // Hermetic fixture: other spec files (e.g. post-shot-flow's inject-fresh-shot)
  // leave an injected-latest override in the shared mock (/shots/latest returns
  // it over the seeded shot). Clear that override AND any injected-shot residue
  // up front so this file's seed is authoritative, then tear down after so we
  // never leak into later files. Never touches production shot semantics.
  test.beforeEach(async ({ request }) => {
    await request.post(`${B}/api/v1/test/reset-shot-poll-state`)
    await request.post(`${B}/api/v1/test/reset-bean-test-state`)
  })
  test.afterEach(async ({ request }) => {
    await request.post(`${B}/api/v1/test/reset-shot-poll-state`)
    await request.post(`${B}/api/v1/test/reset-bean-test-state`)
  })

  test('home Repeat restores ids + bean text + setting + planned target, ops unchanged', async ({ page, request }) => {
    await seed(request)

    await page.goto('/')
    await page.waitForSelector('.layout-widget__repeat-btn', { timeout: 10000 })
    await page.waitForTimeout(600)
    await page.locator('.layout-widget__repeat-btn').click()
    await page.waitForTimeout(800)
    const wf = await readWorkflow(request)
    await expectLoaded(wf)
  })

  test('Repeat and History Load send the IDENTICAL authoritative workflow PUT; ops untouched, no machine start', async ({ page, request }) => {
    await seed(request)
    const { wfPuts, espressoStarts, wfCount } = track(page)

    // ---- 1. Home Repeat: capture the real browser PUT ----
    await page.goto('/')
    await page.waitForSelector('.layout-widget__repeat-btn', { timeout: 10000 })
    await page.waitForTimeout(600)
    const beforeRepeat = wfCount()
    await page.locator('.layout-widget__repeat-btn').click()
    await expect.poll(() => wfCount()).toBeGreaterThan(beforeRepeat)
    await page.waitForTimeout(400)
    const repeatBody = JSON.parse(wfPuts[wfPuts.length - 1])

    // ---- 2. Reset the live context to a DIFFERENT bean/grinder ----
    // If either entry point inherited a stale association (deep-merge keeping an
    // omitted id), it would now surface as a difference from the authoritative shot.
    await request.put(`${B}/api/v1/workflow`, { data: {
      profile: { title: 'Other', id: 'other-profile' },
      context: {
        targetDoseWeight: 20, targetYield: 40,
        coffeeName: 'Other Bean', coffeeRoaster: 'Other Roaster',
        grinderModel: 'Other Grinder', grinderSetting: '99',
        beanBatchId: null, grinderId: null,
      },
      steamSettings: { targetTemperature: 160, duration: 25, flow: 1.5, stopAtTemperature: 0 },
    }, headers: { 'Content-Type': 'application/json' } })

    // ---- 3. History row Load for the SAME shot: capture its PUT ----
    await page.goto('/#/history')
    const row = page.locator('.shot-history__row', { hasText: 'Test Profile' })
    await expect(row).toHaveCount(1, { timeout: 10000 })
    const beforeLoad = wfCount()
    await row.locator('.shot-history__action-btn--load').click()
    await expect.poll(() => wfCount()).toBeGreaterThan(beforeLoad)
    await page.waitForTimeout(400)
    const loadBody = JSON.parse(wfPuts[wfPuts.length - 1])

    // ---- 4. Identical payload from both entry points ----
    expect(loadBody).toEqual(repeatBody)

    // Both carry the authoritative linked shot identity (NOT the reset
    // 'Other Bean' / grinder '99' / Other Profile) and the planned target.
    expect(repeatBody.profile?.id).toBe('test-profile-1')
    expect(repeatBody.context?.beanBatchId).toBe(BATCH_ID)
    expect(repeatBody.context?.grinderId).toBe(GRINDER_ID)
    expect(repeatBody.context?.grinderModel).toBe('Equality Grinder')
    expect(repeatBody.context?.grinderSetting).toBe('12')
    expect(repeatBody.context?.coffeeName).toBe('Equality Bean')
    expect(repeatBody.context?.coffeeRoaster).toBe('Equality Roaster')
    expect(repeatBody.context?.targetYield).toBe(36)
    expect(repeatBody.context?.extras?.grinderRpm).toBe(900)

    // Operations untouched: the shot→workflow builder never sends steam/flush/water.
    expect(repeatBody.steamSettings).toBeUndefined()
    expect(repeatBody.rinseData).toBeUndefined()
    expect(repeatBody.hotWaterData).toBeUndefined()

    // No machine operation started on either entry point.
    expect(espressoStarts.length).toBe(0)
    const state = await (await request.get(`${B}/api/v1/machine/state`)).json()
    expect(state?.state).toBe('idle')

    // End state: both paths converged on the authoritative live context, and
    // neither PUT touched operations — the reset steam duration (25) is intact.
    const wf = await readWorkflow(request)
    expect(wf?.context?.beanBatchId).toBe(BATCH_ID)
    expect(wf?.context?.grinderId).toBe(GRINDER_ID)
    expect(wf?.context?.grinderSetting).toBe('12')
    expect(wf?.context?.coffeeName).toBe('Equality Bean')
    expect(wf?.context?.targetYield).toBe(36)
    expect(wf?.steamSettings?.duration).toBe(25) // untouched by Repeat AND Load
  })
})
