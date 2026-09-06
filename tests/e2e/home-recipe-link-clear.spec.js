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
})
