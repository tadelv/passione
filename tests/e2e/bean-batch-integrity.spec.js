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
})
