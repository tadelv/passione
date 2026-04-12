/**
 * E2E tests for the workflow combo editor redesign.
 *
 * Covers:
 *  - Tapping a workflow combo pill on IdlePage does NOT start espresso.
 *  - Keep-changes path: live workflow takes new values, combo preset untouched.
 *  - Discard path: live workflow reverts, combo preset untouched.
 *  - Profile-change round-trip: Change → pick → Use Profile → verify row updates.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

// A fully-populated combo that exercises profile + context + operation sub-sections
const SAMPLE_COMBO = {
  id: 'combo-test-1',
  name: 'Morning',
  emoji: '',
  profileId: 'profile-test1234567890abcdef',
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
  includeSteam: false,
  steamSettings: { duration: 0 },
  includeFlush: false,
  flushSettings: { duration: 0 },
  includeHotWater: false,
  hotWaterSettings: { volume: 0 },
}

async function seedCombosKV(request, combo = SAMPLE_COMBO, selectedIndex = 0) {
  // The skin stores combos under namespace 'decenza-js' key 'combos'
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/combos`, {
    data: {
      workflowCombos: [combo],
      selectedWorkflowCombo: selectedIndex,
    },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function resetLayoutToDefault(request) {
  // Reset the layout KV entry so IdlePage renders the workflow combo row.
  // Earlier tests may have mutated the layout via the Layout Editor.
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/layout`, {
    data: {
      version: 2,
      zones: {
        topLeft:     { widgets: ['scaleInfo'] },
        topRight:    { widgets: ['fullscreen'] },
        centerLeft:  { widgets: ['actionButtons', 'shotPlan'] },
        centerRight: { widgets: ['workflowCombos', 'lastShot'] },
        bottomLeft:  { widgets: ['navButtons'] },
        bottomRight: { widgets: [] },
      },
    },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function resetWorkflowToDefault(request) {
  // Reset the mock workflow to a known baseline so the profile row and
  // live-apply assertions start from predictable values.
  await request.put(`${BASE_URL}/api/v1/workflow`, {
    data: {
      profile: {
        id: 'profile-test1234567890abcdef',
        title: 'Classic Blooming',
        author: 'Test Author',
      },
      context: {
        targetDoseWeight: 18,
        targetYield: 36,
        coffeeName: 'Test Beans',
        coffeeRoaster: 'Roaster X',
        grinderModel: 'Test Grinder',
        grinderSetting: '15',
      },
    },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function readCombosKV(request) {
  const res = await request.get(`${BASE_URL}/api/v1/store/decenza-js/combos`)
  if (!res.ok()) return null
  return await res.json()
}

async function readWorkflow(request) {
  const res = await request.get(`${BASE_URL}/api/v1/workflow`)
  if (!res.ok()) return null
  return await res.json()
}

async function loadAppAt(page, hashRoute = '/') {
  // Direct hash navigation avoids the router's 300ms navigation debounce
  // that otherwise swallows rapid router.push() calls just after page load.
  const url = hashRoute === '/' ? '/' : `/#${hashRoute}`
  await page.goto(url)
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  await page.waitForTimeout(200)
}

test.describe('Workflow combo editor redesign', () => {
  test.beforeEach(async ({ request }) => {
    // Reset server state to a clean baseline — earlier test files may have
    // mutated the layout, workflow, machine state, and combos in ways that
    // would break the assumptions of these tests. In particular:
    // user-workflow.spec.js ends with the machine in 'sleeping' state, which
    // causes App.vue to auto-navigate any subsequent route change to
    // /screensaver. We explicitly force the machine back to 'idle' here.
    await request.put(`${BASE_URL}/api/v1/machine/state/idle`)
    await resetLayoutToDefault(request)
    await resetWorkflowToDefault(request)
    await seedCombosKV(request)
  })

  test('tapping a workflow combo pill does NOT start espresso', async ({ page }) => {
    // Track any state transitions to espresso
    let startedEspresso = false
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/machine/state/espresso') && req.method() === 'PUT') {
        startedEspresso = true
      }
    })

    await loadAppAt(page, '/')
    // Wait for the workflow combos row to render
    await page.waitForTimeout(500)
    const pill = page.locator('.preset-pill-row__pill').first()
    await expect(pill).toBeVisible({ timeout: 5000 })

    // Tap multiple times — once to select, then twice more to try to activate
    await pill.click()
    await page.waitForTimeout(150)
    await pill.click()
    await page.waitForTimeout(150)
    await pill.click()
    await page.waitForTimeout(500)

    expect(startedEspresso).toBe(false)
  })

  test('keep-changes path: live workflow takes new values, combo preset untouched', async ({ page, request }) => {
    await loadAppAt(page, '/workflow/edit')
    await page.waitForSelector('.bean-info', { timeout: 5000 })
    await page.waitForTimeout(500)

    // Select the combo pill (first — and only — combo)
    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)

    // Click the first "Increase value" button (first ValueInput is doseIn, step 0.1)
    // This makes the form dirty and triggers live-apply
    await page.locator('.value-input__btn[aria-label="Increase value"]').first().click()
    await page.waitForTimeout(600)  // wait for the 300ms live-apply debounce plus margin

    // The Save button should now be visible (dirty state)
    await expect(page.locator('[data-testid="wfe-save"]')).toBeVisible({ timeout: 2000 })

    // Click the Back chevron on the BottomBar
    await page.locator('.bottom-bar__back').click()
    await page.waitForTimeout(300)

    // The UnsavedChangesDialog should be visible
    await expect(page.locator('[data-testid="ucd-keep-changes"]')).toBeVisible({ timeout: 2000 })

    // Click "Keep changes"
    await page.locator('[data-testid="ucd-keep-changes"]').click()
    await page.waitForTimeout(500)

    // Combo preset should be UNTOUCHED (still 18)
    const kv = await readCombosKV(request)
    expect(kv?.workflowCombos?.[0]?.doseIn).toBe(18)

    // Live workflow should reflect the incremented dose (18 + 0.1 = 18.1)
    const wf = await readWorkflow(request)
    expect(wf?.context?.targetDoseWeight).toBeGreaterThan(18)
  })

  test('discard path: live workflow reverts, combo preset untouched', async ({ page, request }) => {
    await loadAppAt(page, '/workflow/edit')
    await page.waitForSelector('.bean-info', { timeout: 5000 })
    await page.waitForTimeout(500)

    // Capture the pre-edit workflow state
    const preEdit = await readWorkflow(request)
    const originalDose = preEdit?.context?.targetDoseWeight ?? null

    // Select the combo and make it dirty
    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)
    await page.locator('.value-input__btn[aria-label="Increase value"]').first().click()
    await page.waitForTimeout(600)

    // Open the dialog via Back
    await page.locator('.bottom-bar__back').click()
    await page.waitForTimeout(300)

    // Click Discard
    await expect(page.locator('[data-testid="ucd-discard"]')).toBeVisible({ timeout: 2000 })
    await page.locator('[data-testid="ucd-discard"]').click()
    await page.waitForTimeout(700)

    // Combo preset stays at 18
    const kv = await readCombosKV(request)
    expect(kv?.workflowCombos?.[0]?.doseIn).toBe(18)

    // Live workflow reverted to the pre-edit snapshot (or at least not increased)
    const wf = await readWorkflow(request)
    if (originalDose != null) {
      expect(wf?.context?.targetDoseWeight).toBe(originalDose)
    }
  })

  test('profile change round-trip updates the profile row (bug fix)', async ({ page }) => {
    await loadAppAt(page, '/workflow/edit')
    await page.waitForSelector('.bean-info', { timeout: 5000 })
    await page.waitForTimeout(500)

    // Select the combo — profile row should show Classic Blooming
    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)
    await expect(page.locator('.bean-info__profile-name')).toContainText('Classic Blooming')

    // Click the Change button → navigates to /profiles?from=workflow
    await page.locator('.bean-info__change-btn').click()
    await page.waitForTimeout(500)

    // ProfileSelectorPage should show two profiles. Pick "Alternative Profile".
    // The page renders profile cards — find by visible text.
    const altProfile = page.getByText('Alternative Profile', { exact: false }).first()
    await expect(altProfile).toBeVisible({ timeout: 5000 })
    await altProfile.click()
    await page.waitForTimeout(400)

    // Click "Use Profile" to apply and return
    const useBtn = page.getByRole('button', { name: /Use Profile/i }).first()
    await expect(useBtn).toBeVisible({ timeout: 3000 })
    await useBtn.click()
    await page.waitForTimeout(800)

    // We should be back on the workflow editor, and the profile row should now
    // show the alternative profile — the watcher-with-awaitingProfileFromPicker
    // fix ensures this update is honored even though a combo is selected.
    await expect(page.locator('.bean-info__profile-name')).toContainText('Alternative Profile', { timeout: 5000 })
  })
})
