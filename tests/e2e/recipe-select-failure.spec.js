/**
 * Daily-driver audit #3 — a recipe whose referenced bean/profile cannot resolve
 * must fail BEFORE any workflow PUT, leave the form and selected recipe intact,
 * and surface one error (no partial/other recipe published).
 */
import { test, expect } from '@playwright/test'

const B = 'http://localhost:8080'

const PLAIN = {
  id: 'p', name: 'Plain', profileId: 'profile-test1234567890abcdef', profileTitle: 'Classic Blooming',
  doseIn: 18, doseOut: 36, grinder: 'TG', grinderSetting: '15',
  includeSteam: false, steamSettings: { duration: 0 }, includeFlush: false, flushSettings: { duration: 0 },
  includeHotWater: false, hotWaterSettings: { volume: 0 },
}
// References a bean that does NOT exist → lookup must fail before PUT.
const GHOST = {
  id: 'g', name: 'Ghost', selectedBeanId: 'ghost-bean-xyz',
  doseIn: 20, doseOut: 40, grinder: 'TG', grinderSetting: '15',
  includeSteam: false, steamSettings: { duration: 0 }, includeFlush: false, flushSettings: { duration: 0 },
  includeHotWater: false, hotWaterSettings: { volume: 0 },
}

async function reset(request, recipes, selected = 0) {
  await request.put(`${B}/api/v1/machine/state/idle`)
  await request.post(`${B}/api/v1/store/decenza-js/layout`, { data: { version: 2, zones: { topLeft: { widgets: ['scaleInfo'] }, topRight: { widgets: [] }, centerLeft: { widgets: ['actionButtons', 'shotPlan'] }, centerRight: { widgets: ['workflowCombos', 'lastShot'] }, bottomLeft: { widgets: ['navButtons'] }, bottomRight: { widgets: [] } } }, headers: { 'Content-Type': 'application/json' } })
  await request.put(`${B}/api/v1/workflow`, { data: { profile: { title: 'Classic Blooming', id: 'profile-test1234567890abcdef' }, context: { targetDoseWeight: 18, targetYield: 36 } }, headers: { 'Content-Type': 'application/json' } })
  await request.post(`${B}/api/v1/store/decenza-js/combos`, { data: { workflowCombos: recipes, selectedWorkflowCombo: selected }, headers: { 'Content-Type': 'application/json' } })
}

function countPuts(page) {
  let n = 0
  page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('/api/v1/workflow')) n++ })
  return () => n
}test('editor selecting a recipe with an unresolvable bean issues NO PUT and leaves state', async ({ page, request }) => {
  await reset(request, [PLAIN, GHOST], 0)
  const puts = countPuts(page)
  await page.goto('/#/recipe/edit')
  await expect(page.locator('.recipe-pill-rail__pill')).toHaveCount(2, { timeout: 10000 })
  await page.waitForTimeout(400)

  // Select the ghost-bean recipe.
  await page.locator('.recipe-pill-rail__pill').nth(1).click()
  await page.waitForTimeout(800)

  // No workflow PUT happened.
  expect(puts()).toBe(0)
  // Selected recipe is unchanged (still Plain), live workflow untouched.
  const wf = await (await request.get(`${B}/api/v1/workflow`)).json()
  expect(wf.context.targetDoseWeight).toBe(18)
  expect(wf.context.beanBatchId ?? null).toBeNull()
})
