/**
 * Issue #7 — home `comboEditor` widget.
 *
 * Verifies against the local mock (asserting on gateway workflow state, the
 * same convention the rest of the e2e suite uses):
 *   1. Default tool visibility (coffee/grind/input-ratio-output) and that
 *      Shot Plan no longer renders its own coffee row/picker.
 *   2. Dose edits live-PUT the workflow only (linked ratio semantics) and
 *      never touch the saved recipe/workflowCombos.
 *   3. Grind-setting edits flow through the same live workflow path.
 *   4. Brew-temperature edits PUT a per-step delta profile override, never a
 *      saved-profile mutation nor a saved-combo mutation.
 *   5. Unavailable values stay visible, inert, and marked "—".
 *   6. Configuration: fixed-order toggles, the last enabled tool cannot be
 *      switched off, and the config survives a reload (persisted save).
 *   7. comboEditor placement outside center zones is rejected on load.
 *   8. An edit made while a workflow PUT is in flight is not dropped.
 */
import { test, expect } from '@playwright/test'

const B = 'http://localhost:8080'
const DEFAULT_TOOLS = { coffee: true, grind: true, dose: true, temperature: false, grinderRpm: false, basket: false }

const PROFILE = {
  title: 'Numeric Profile', id: 'num-1',
  steps: [
    { name: 'Preinfuse', pump: 'pressure', pressure: 6, flow: 0, temperature: '93.0', seconds: 8, transition: 'fast' },
    { name: 'Pour', pump: 'flow', pressure: 0, flow: 2.5, temperature: '93.0', seconds: 30, transition: 'smooth' },
  ],
}

const SAVED_COMBO = {
  id: 'c1', name: 'Saved', profileTitle: 'Numeric Profile',
  coffeeName: 'Morning', roaster: 'R', grinder: 'TG', grinderSetting: '12',
  doseIn: 18, doseOut: 36,
  selectedBeanId: null, selectedBatchId: null, selectedGrinderId: null,
  includeSteam: false, steamSettings: { duration: 0 },
  includeFlush: false, flushSettings: { duration: 0 },
  includeHotWater: false, hotWaterSettings: { volume: 0 },
}

async function seed(request, { comboEditorTools = DEFAULT_TOOLS, profile = PROFILE, context = null } = {}) {
  await request.put(`${B}/api/v1/machine/state/idle`)
  await request.post(`${B}/api/v1/store/decenza-js/layout`, { data: { version: 2, zones: {
    topLeft: { widgets: ['scaleInfo'] }, topRight: { widgets: [] },
    centerLeft: { widgets: ['shotPlan', 'comboEditor'] }, centerRight: { widgets: ['workflowCombos'] },
    bottomLeft: { widgets: ['navButtons'] }, bottomRight: { widgets: [] },
  } }, headers: { 'Content-Type': 'application/json' } })
  await request.post(`${B}/api/v1/store/decenza-js/combos`, { data: { workflowCombos: [SAVED_COMBO], selectedWorkflowCombo: -1 }, headers: { 'Content-Type': 'application/json' } })
  await request.post(`${B}/api/v1/store/decenza-js/comboEditor`, { data: { comboEditorTools }, headers: { 'Content-Type': 'application/json' } })
  await request.put(`${B}/api/v1/workflow`, { data: {
    profile,
    context: context ?? { coffeeName: 'Morning', coffeeRoaster: 'R', targetDoseWeight: 18, targetYield: 36, grinderModel: 'TG', grinderSetting: '12' },
  }, headers: { 'Content-Type': 'application/json' } })
}

async function readWorkflow(request) {
  const r = await request.get(`${B}/api/v1/workflow`)
  return r.ok() ? r.json() : null
}

async function openWidget(page) {
  await page.goto('/')
  await page.waitForSelector('.combo-editor', { timeout: 15000 })
  await page.waitForTimeout(600)
}

test.describe('home comboEditor widget (issue #7)', () => {
  test('unavailable values stay visible and inert with —', async ({ page, request }) => {
    // A profile with no temperature steps → the configured brew temp is unknown.
    // The configured temperature tool must stay visible but inert with — while
    // the other (available) tools keep rendering — no reflow.
    await seed(request, {
      comboEditorTools: { ...DEFAULT_TOOLS, temperature: true },
      profile: { title: 'Step-less', id: 'step-less-1', steps: [] },
      context: { coffeeName: 'Morning', coffeeRoaster: 'R', targetDoseWeight: 18, targetYield: 36, grinderModel: 'TG', grinderSetting: '12' },
    })
    await openWidget(page)

    await expect(page.locator('[data-testid="combo-temp"] .combo-editor__na')).toBeVisible()
    await expect(page.locator('[data-testid="combo-temp"] .combo-editor__na')).toHaveText('—')
    // Available tools still render their controls in the same layout.
    await expect(page.locator('[data-testid="combo-doseIn"] .value-input')).toBeVisible()
    await expect(page.locator('[data-testid="combo-grind"] input[type="text"]')).toBeVisible()
    await expect(page.locator('[data-testid="combo-coffee"]')).toBeVisible()
  })

  test('default tools visible; Shot Plan no longer owns a coffee row', async ({ page, request }) => {
    await seed(request)
    await openWidget(page)

    // Default-visible tools.
    for (const id of ['combo-coffee', 'combo-grind', 'combo-doseIn', 'combo-ratio', 'combo-doseOut']) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible()
    }
    // Default-hidden tools.
    await expect(page.locator('[data-testid="combo-temp"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="combo-rpm"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="combo-basket"]')).toHaveCount(0)

    // Persistent affordance → full editor.
    await expect(page.locator('[data-testid="combo-edit"]')).toBeVisible()

    // Shot Plan: profile/summary remain, no coffee row, no picker entry point.
    await expect(page.locator('.layout-widget__shot-plan .layout-widget__profile')).toBeVisible()
    await expect(page.locator('.layout-widget__plan-summary')).toBeVisible()
    await expect(page.locator('.layout-widget__shot-plan')).not.toContainText('Select coffee')
    await expect(page.locator('.bean-picker')).toHaveCount(0)
  })

  test('dose/ratio edits live-PUT the workflow only (saved combo untouched)', async ({ page, request }) => {
    await seed(request)
    await openWidget(page)

    // Input +0.1: ratio preserved (2.0) → output recalculated = round1(18.1 * 2.0).
    await page.locator('[data-testid="combo-doseIn"] .value-input__btn').last().click()
    await expect.poll(async () => (await readWorkflow(request))?.context).toMatchObject({ targetDoseWeight: 18.1, targetYield: 36.2 })

    // Ratio +0.1: input preserved (18.1) → output recalculated = round1(18.1 * 2.1).
    await page.locator('[data-testid="combo-ratio"] .value-input__btn').last().click()
    await expect.poll(async () => (await readWorkflow(request))?.context).toMatchObject({ targetDoseWeight: 18.1, targetYield: 38 })

    // The saved recipe was never mutated.
    const kv = await (await request.get(`${B}/api/v1/store/decenza-js/combos`)).json()
    expect(kv.workflowCombos[0].doseIn).toBe(18)
    expect(kv.workflowCombos[0].doseOut).toBe(36)
  })

  test('grind-setting edit flows through the live workflow', async ({ page, request }) => {
    await seed(request)
    await openWidget(page)

    // Unlinked grinder → the shared GrinderSettingInput renders a text field.
    await page.locator('[data-testid="combo-grind"] input[type="text"]').fill('14')
    await expect.poll(async () => (await readWorkflow(request))?.context?.grinderSetting).toBe('14')
  })

  test('an edit made while a workflow PUT is in flight is not dropped', async ({ page, request }) => {
    await seed(request)
    await openWidget(page)

    // Widen the in-flight window so a second edit can land mid-PUT.
    await page.route('**/api/v1/workflow', async (route) => {
      if (route.request().method() === 'PUT') {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      await route.continue()
    })

    const firstPutStarted = new Promise((resolve) => {
      page.on('request', (req) => {
        if (req.method() === 'PUT' && req.url().endsWith('/api/v1/workflow')) resolve()
      })
    })

    // Edit A (18 → 18.1) starts a PUT; edit B (18.1 → 18.2) lands mid-flight.
    await page.locator('[data-testid="combo-doseIn"] .value-input__btn').last().click()
    await firstPutStarted
    await page.locator('[data-testid="combo-doseIn"] .value-input__btn').last().click()

    // The final gateway state must reflect edit B — A's completion must not
    // clear B's still-queued dirty state.
    await expect.poll(async () => (await readWorkflow(request))?.context?.targetDoseWeight).toBe(18.2)
  })

  test('brew-temperature edit PUTs a delta profile override; saved profile/combo untouched', async ({ page, request }) => {
    await seed(request, {
      comboEditorTools: { ...DEFAULT_TOOLS, temperature: true },
    })
    const profilePuts = []
    page.on('request', (req) => {
      if (req.method() === 'PUT' && /\/api\/v1\/profiles\//.test(req.url())) profilePuts.push(req.url())
    })
    await openWidget(page)

    // +0.5 °C on the temp row (step 0.5): delta override 93.0 → 93.5 on both steps.
    await page.locator('[data-testid="combo-temp"] .value-input__btn').last().click()
    await expect.poll(async () => {
      const wf = await readWorkflow(request)
      const steps = wf?.profile?.steps ?? []
      return steps.length ? Number(steps[0].temperature) : undefined
    }).toBe(93.5)

    // No saved-profile mutation (workflow override only) and no saved-combo change.
    expect(profilePuts).toEqual([])
    const kv = await (await request.get(`${B}/api/v1/store/decenza-js/combos`)).json()
    expect(kv.workflowCombos[0].doseIn).toBe(18)
  })

  test('comboEditor placement outside center zones is rejected on load', async ({ page, request }) => {
    // A stored layout that illegally places comboEditor in an edge zone must be
    // sanitized (validateLayout drops it), so no widget renders.
    await request.put(`${B}/api/v1/machine/state/idle`)
    await request.post(`${B}/api/v1/store/decenza-js/layout`, { data: { version: 2, zones: {
      topLeft: { widgets: ['scaleInfo'] }, topRight: { widgets: [] },
      centerLeft: { widgets: [] }, centerRight: { widgets: [] },
      bottomLeft: { widgets: ['navButtons', 'comboEditor'] }, bottomRight: { widgets: [] },
    } }, headers: { 'Content-Type': 'application/json' } })
    await request.post(`${B}/api/v1/store/decenza-js/comboEditor`, { data: { comboEditorTools: DEFAULT_TOOLS }, headers: { 'Content-Type': 'application/json' } })
    await request.put(`${B}/api/v1/workflow`, { data: {
      profile: PROFILE,
      context: { coffeeName: 'Morning', coffeeRoaster: 'R', targetDoseWeight: 18, targetYield: 36 },
    }, headers: { 'Content-Type': 'application/json' } })

    await page.goto('/')
    await page.waitForSelector('.layout-widget__nav', { timeout: 15000 })
    await page.waitForTimeout(600)
    await expect(page.locator('.combo-editor')).toHaveCount(0)
  })

  test('configuration: fixed-order toggles, last enabled tool cannot be switched off', async ({ page, request }) => {
    await seed(request)
    await openWidget(page)

    await page.evaluate(() => window.__vueRouter?.push?.({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })
    await page.locator('.edit-overlay__zone--centerLeft').click()
    await page.locator('.drawer__config-btn').click()
    await page.waitForSelector('[data-testid="comboEditor-config"]', { timeout: 5000 })

    // Fixed order: first row is Coffee, last is Basket.
    const labels = await page.locator('.drawer__config-row .drawer__config-label').allTextContents()
    expect(labels).toEqual(['Coffee', 'Grind setting', 'Input / Ratio / Output', 'Brew temperature', 'Grinder RPM', 'Basket'])

    // Turn off grind and coffee; dose must then be the only one left on, so its
    // toggle becomes disabled.
    await page.locator('[data-testid="comboEditor-tool-grind"] .settings-toggle').click()
    await page.locator('[data-testid="comboEditor-tool-coffee"] .settings-toggle').click()
    await expect(page.locator('[data-testid="comboEditor-tool-dose"] .settings-toggle')).toBeDisabled()

    // Persistence: wait past the settings module's 800ms debounced save, then
    // reload and prove the widget renders only the surviving tool.
    await expect.poll(async () => {
      const kv = await (await request.get(`${B}/api/v1/store/decenza-js/comboEditor`)).json()
      return kv?.comboEditorTools ?? null
    }).toMatchObject({ coffee: false, grind: false })
    await page.reload()
    await page.waitForSelector('.combo-editor', { timeout: 15000 })
    await expect(page.locator('[data-testid="combo-coffee"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="combo-grind"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="combo-doseIn"]')).toBeVisible()
  })
})
