/**
 * E2E tests for the recipe editor (formerly "workflow combo editor").
 *
 * Model summary:
 *  - The saved "recipe" (workflowCombos[i] in storage) is immutable until
 *    the user explicitly taps Save or Save as New Recipe.
 *  - Field edits live-apply to the gateway workflow (300ms debounce).
 *  - There is no unsaved-changes dialog and no Back button on this page —
 *    exit is always free via Home.
 *  - The selected recipe pill shows a "modified" dot whenever the live
 *    workflow diverges from the saved recipe.
 *
 * Covers:
 *  - Tapping a recipe pill on IdlePage does NOT start espresso.
 *  - Edit + exit (Home) without Save → live workflow carries the tweak,
 *    saved recipe is untouched (the default, zero-friction path).
 *  - Edit + Save → saved recipe persists the tweak, toast fires.
 *  - Edit + Save as New Recipe → a new recipe is created and selected.
 *  - Profile-change round-trip still updates the profile row.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

// A fully-populated recipe that exercises profile + context fields
const SAMPLE_RECIPE = {
  id: 'recipe-test-1',
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

async function seedRecipesKV(request, recipe = SAMPLE_RECIPE, selectedIndex = 0) {
  // The persisted key name is still `workflowCombos` — internal data key
  // was kept to avoid a storage migration. User-visible vocabulary is
  // "recipes" / "Save as New Recipe".
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/combos`, {
    data: {
      workflowCombos: [recipe],
      selectedWorkflowCombo: selectedIndex,
    },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function resetLayoutToDefault(request) {
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/layout`, {
    data: {
      version: 2,
      zones: {
        topLeft:     { widgets: ['scaleInfo'] },
        topRight:    { widgets: [] },
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

async function readRecipesKV(request) {
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

test.describe('Recipe editor', () => {
  test.beforeEach(async ({ request }) => {
    // Reset server state to a clean baseline — earlier test files may have
    // mutated the layout, workflow, machine state, and recipes in ways that
    // would break the assumptions of these tests.
    await request.put(`${BASE_URL}/api/v1/machine/state/idle`)
    await resetLayoutToDefault(request)
    await resetWorkflowToDefault(request)
    await seedRecipesKV(request)
  })

  test('tapping a recipe pill on IdlePage does NOT start espresso', async ({ page }) => {
    let startedEspresso = false
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/machine/state/espresso') && req.method() === 'PUT') {
        startedEspresso = true
      }
    })

    await loadAppAt(page, '/')
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

  test('edit then Home: live workflow takes new values, saved recipe untouched', async ({ page, request }) => {
    await loadAppAt(page, '/recipe/edit')
    await page.waitForSelector('.recipe-editor', { timeout: 5000 })
    await page.waitForTimeout(500)

    // Select the recipe pill (first — and only — recipe)
    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)

    // Bump doseIn by one step (0.1g) — makes the form dirty and triggers
    // live-apply. Targeted via data-testid so adding ValueInputs elsewhere
    // in the editor can't shift the selector.
    await page.locator('[data-testid="recipe-doseIn"] .value-input__btn[aria-label="Increase value"]').click()
    await page.waitForTimeout(600)  // wait for the 300ms live-apply debounce plus margin

    // The Save button should now be visible (dirty state)
    await expect(page.locator('[data-testid="wfe-save"]')).toBeVisible({ timeout: 2000 })

    // The modified dot should appear on the selected pill
    await expect(page.locator('.preset-pill-row__pill--modified')).toBeVisible({ timeout: 2000 })

    // Leave via the Home button — no dialog, no guard, no prompt
    await page.locator('.bottom-bar__home').click()
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/.*#\/$/)

    // Saved recipe should be UNTOUCHED (still 18)
    const kv = await readRecipesKV(request)
    expect(kv?.workflowCombos?.[0]?.doseIn).toBe(18)

    // Live workflow should reflect the incremented dose (18 + 0.1 = 18.1)
    const wf = await readWorkflow(request)
    expect(wf?.context?.targetDoseWeight).toBeGreaterThan(18)
  })

  test('edit then explicit Save: saved recipe persists the tweak', async ({ page, request }) => {
    await loadAppAt(page, '/recipe/edit')
    await page.waitForSelector('.recipe-editor', { timeout: 5000 })
    await page.waitForTimeout(500)

    // Select + tweak doseIn via the stepper
    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)
    await page.locator('[data-testid="recipe-doseIn"] .value-input__btn[aria-label="Increase value"]').click()
    await page.waitForTimeout(600)

    // Tap Save (explicit commit). useSettings has an 800ms debounced write
    // to the KV store — wait longer than that before reading storage.
    await page.locator('[data-testid="wfe-save"]').click()
    await page.waitForTimeout(1200)

    // Saved recipe should now reflect the tweak (18 → 18.1)
    const kv = await readRecipesKV(request)
    expect(kv?.workflowCombos?.[0]?.doseIn).toBeGreaterThan(18)

    // Live workflow should also reflect it
    const wf = await readWorkflow(request)
    expect(wf?.context?.targetDoseWeight).toBeGreaterThan(18)

    // The modified dot should clear (save succeeded → live equals saved)
    await expect(page.locator('.preset-pill-row__pill--modified')).toHaveCount(0)
  })

  test('Save as New Recipe: creates a new recipe and selects it', async ({ page, request }) => {
    await loadAppAt(page, '/recipe/edit')
    await page.waitForSelector('.recipe-editor', { timeout: 5000 })
    await page.waitForTimeout(500)

    // Select + tweak to enable Save as New Recipe
    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)
    await page.locator('[data-testid="recipe-doseIn"] .value-input__btn[aria-label="Increase value"]').click()
    await page.waitForTimeout(600)

    // Tap Save as New Recipe
    await page.locator('[data-testid="wfe-save-as-new"]').click()
    await page.waitForTimeout(300)

    // The rename popup opens on the freshly-created recipe
    await expect(page.locator('.preset-edit-popup')).toBeVisible({ timeout: 2000 })
    // Dismiss the popup with the auto-generated name intact
    await page.locator('.preset-edit-popup__btn--save').click()
    // useSettings has an 800ms debounced write to KV — wait it out
    await page.waitForTimeout(1200)

    // Storage now has 2 recipes, the new one selected
    const kv = await readRecipesKV(request)
    expect(kv?.workflowCombos?.length).toBe(2)
    expect(kv?.selectedWorkflowCombo).toBe(1)
    expect(kv?.workflowCombos?.[1]?.doseIn).toBeGreaterThan(18)
    // Original recipe is untouched
    expect(kv?.workflowCombos?.[0]?.doseIn).toBe(18)
  })

  test('profile change round-trip updates the profile row', async ({ page }) => {
    await loadAppAt(page, '/recipe/edit')
    await page.waitForSelector('.recipe-editor', { timeout: 5000 })
    await page.waitForTimeout(500)

    // Select the recipe — profile row should show Classic Blooming
    await page.locator('.preset-pill-row__pill').first().click()
    await page.waitForTimeout(300)
    await expect(page.locator('.recipe-editor__profile-name')).toContainText('Classic Blooming')

    // Click the Change button → navigates to /profiles?from=workflow
    await page.locator('.recipe-editor__change-btn').click()
    await page.waitForTimeout(500)

    // ProfileSelectorPage should show two profiles. Pick "Alternative Profile".
    const altProfile = page.getByText('Alternative Profile', { exact: false }).first()
    await expect(altProfile).toBeVisible({ timeout: 5000 })
    await altProfile.click()
    await page.waitForTimeout(400)

    // Click "Use Profile" to apply and return
    const useBtn = page.getByRole('button', { name: /Use Profile/i }).first()
    await expect(useBtn).toBeVisible({ timeout: 3000 })
    await useBtn.click()
    await page.waitForTimeout(800)

    // Back on the recipe editor, profile row should show the alternative profile
    await expect(page.locator('.recipe-editor__profile-name')).toContainText('Alternative Profile', { timeout: 5000 })
  })
})
