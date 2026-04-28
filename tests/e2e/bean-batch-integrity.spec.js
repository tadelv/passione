/**
 * E2E tests for bean-batch integrity:
 *
 * 1. Recipe live-apply: changing the batch in recipe editor pushes to
 *    workflow even without saving the recipe.
 * 2. Linked-mode: bean text fields are read-only when a bean is linked.
 * 3. Shot edit picker: changing batch on PostShotReviewPage persists
 *    workflow.context.beanBatchId.
 * 4. Hydration with drifted text: opening a shot whose persisted text
 *    doesn't match the linked bean still renders the linked bean's
 *    authoritative values.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

test.describe('Bean-batch integrity', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${BASE_URL}/api/v1/test/reset-bean-test-state`)
  })

  test('recipe live-apply: changing batch updates workflow context without recipe save', async ({ page, request }) => {
    test.setTimeout(45_000)

    // Seed two batches under one bean.
    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-test-X', beanName: 'X-Bean', beanRoaster: 'X-Roaster',
              batchId: 'batch-X1', roastDate: '2026-04-01', roastLevel: 'Light' },
    })
    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-test-X', beanName: 'X-Bean', beanRoaster: 'X-Roaster',
              batchId: 'batch-X2', roastDate: '2026-04-20', roastLevel: 'Medium' },
    })

    // Open recipe editor.
    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.recipe-editor', { timeout: 5_000 })

    // Pick the bean (auto-selects active batch). The bean dropdown is the
    // first <select> in the Coffee column.
    const coffeeColumn = page.locator('.recipe-editor__column').first()
    const beanSelect = coffeeColumn.locator('select').first()
    await beanSelect.selectOption('bean-test-X')

    // Wait for live-apply (300ms debounce + a buffer).
    await page.waitForTimeout(800)

    // The recipe editor uses a button-toggle batch picker (not a <select>):
    //   <button>Switch batch (2)</button>
    //   then a list of <button>roastDate</button> items.
    // Open the picker, then click the X1 batch.
    const switchBatchBtn = coffeeColumn.locator('.recipe-editor__link-btn', { hasText: /Switch batch/ })
    await switchBatchBtn.click()
    await coffeeColumn.locator('.recipe-editor__batch-option', { hasText: '2026-04-01' }).click()
    await page.waitForTimeout(800)

    // Verify workflow.context.beanBatchId is now batch-X1 via REST.
    let workflowRes = await request.get(`${BASE_URL}/api/v1/workflow`)
    let workflow = await workflowRes.json()
    expect(workflow.context?.beanBatchId).toBe('batch-X1')

    // Switch to batch X2 — DON'T click any save button.
    // The button list may have collapsed after the prior selection; reopen if needed.
    const stillOpen = await coffeeColumn.locator('.recipe-editor__batch-list').count()
    if (stillOpen === 0) {
      await switchBatchBtn.click()
    }
    await coffeeColumn.locator('.recipe-editor__batch-option', { hasText: '2026-04-20' }).click()
    await page.waitForTimeout(800)

    // Live-apply must have pushed the change. Verify.
    workflowRes = await request.get(`${BASE_URL}/api/v1/workflow`)
    workflow = await workflowRes.json()
    expect(workflow.context?.beanBatchId).toBe('batch-X2')
  })

  test('linked-mode renders bean text fields read-only when bean is selected', async ({ page, request }) => {
    test.setTimeout(45_000)

    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-test-Y', beanName: 'Y-Bean', beanRoaster: 'Y-Roaster',
              batchId: 'batch-Y1', roastDate: '2026-04-15', roastLevel: 'Dark' },
    })

    await page.goto('/#/recipe/edit')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.recipe-editor', { timeout: 5_000 })

    // Initially no bean selected — Coffee Name should be a SuggestionField input.
    const nameInputBefore = page.locator('input[placeholder="Coffee name"]')
    await expect(nameInputBefore).toBeVisible({ timeout: 5_000 })

    // Pick bean Y.
    const coffeeColumn = page.locator('.recipe-editor__column').first()
    const beanSelect = coffeeColumn.locator('select').first()
    await beanSelect.selectOption('bean-test-Y')
    await page.waitForTimeout(500)

    // After link: the input is replaced by .recipe-editor__readonly span containing the bean's name.
    await expect(coffeeColumn.locator('input[placeholder="Coffee name"]')).toHaveCount(0)
    await expect(coffeeColumn.locator('.recipe-editor__readonly').filter({ hasText: 'Y-Bean' })).toBeVisible()
    await expect(coffeeColumn.locator('.recipe-editor__readonly').filter({ hasText: 'Y-Roaster' })).toBeVisible()

    // Clear the link by selecting "Manual entry...". The recipe editor uses
    // the dropdown's empty option for this, not BeanLinkBadge.
    await beanSelect.selectOption('')
    await page.waitForTimeout(300)

    // Free-edit returns: input is back.
    await expect(coffeeColumn.locator('input[placeholder="Coffee name"]')).toBeVisible({ timeout: 2_000 })
  })

  test('shot edit page: changing bean+batch persists workflow.context.beanBatchId', async ({ page, request }) => {
    test.setTimeout(60_000)

    // Seed two beans, each with one batch.
    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-A', beanName: 'A-Bean', beanRoaster: 'A-Roaster',
              batchId: 'batch-A1', roastDate: '2026-04-01' },
    })
    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-B', beanName: 'B-Bean', beanRoaster: 'B-Roaster',
              batchId: 'batch-B1', roastDate: '2026-04-15' },
    })

    // Inject a shot record initially linked to batch-A1.
    const shotId = 'shot-bean-edit-1'
    await request.post(`${BASE_URL}/api/v1/test/inject-shot`, {
      data: {
        shotId,
        context: {
          beanBatchId: 'batch-A1',
          coffeeName: 'A-Bean',
          coffeeRoaster: 'A-Roaster',
        },
      },
    })

    await page.goto(`/#/shot-review/${shotId}`)
    await page.waitForSelector('.review-page', { timeout: 10_000 })
    await page.waitForTimeout(1_000) // hydration

    // The Bean picker is the first <select> with a "Manual entry..." option in .review-page.
    const beanPicker = page.locator('.review-page select').filter({ hasText: 'Manual entry...' }).first()
    await expect(beanPicker).toHaveValue('bean-A', { timeout: 5_000 })

    // Switch to bean B.
    await beanPicker.selectOption('bean-B')
    await page.waitForTimeout(500)

    // Save.
    const saveBtn = page.locator('.review-page__save-btn')
    await expect(saveBtn).toBeEnabled({ timeout: 2_000 })
    await saveBtn.click()
    await page.waitForTimeout(1_000)

    // Verify mock-server now has updated workflow.context.beanBatchId.
    const res = await request.get(`${BASE_URL}/api/v1/test/get-shot/${shotId}`)
    const shot = await res.json()
    expect(shot.workflow?.context?.beanBatchId).toBe('batch-B1')
  })

  test('hydration: drifted ctx text does not block linked-bean resolution', async ({ page, request }) => {
    test.setTimeout(45_000)

    await request.post(`${BASE_URL}/api/v1/test/inject-bean-with-batch`, {
      data: { beanId: 'bean-real', beanName: 'Real-Bean', beanRoaster: 'Real-Roaster',
              batchId: 'batch-real-1', roastDate: '2026-04-10', roastLevel: 'Medium' },
    })

    // Seed shot with INTENTIONALLY DRIFTED text + a real beanBatchId.
    const shotId = 'shot-drifted-text-1'
    await request.post(`${BASE_URL}/api/v1/test/inject-shot`, {
      data: {
        shotId,
        context: {
          beanBatchId: 'batch-real-1',
          coffeeName: 'WRONG-NAME',
          coffeeRoaster: 'WRONG-ROASTER',
        },
      },
    })

    await page.goto(`/#/shot-review/${shotId}`)
    await page.waitForSelector('.review-page', { timeout: 10_000 })
    await page.waitForTimeout(1_000) // hydration

    // Hydration must use batch-id, NOT name-match. The visible name/roaster
    // must be the authoritative bean record values, not 'WRONG-NAME'.
    await expect(page.locator('.review-page__readonly').filter({ hasText: 'Real-Bean' }))
      .toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.review-page__readonly').filter({ hasText: 'Real-Roaster' }))
      .toBeVisible()
    await expect(page.locator('.review-page__readonly').filter({ hasText: 'WRONG-NAME' }))
      .toHaveCount(0)
  })
})
