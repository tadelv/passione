/**
 * E2E tests for cross-device beans/grinders refresh.
 *
 * The skin auto-refreshes its bean and grinder lists when the user returns
 * focus to the tab (visibilitychange / focus events), throttled to once
 * every 30s. Tests dispatch the events directly and wait the throttle.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

async function loadBeans(page) {
  await page.goto('/#/settings/beans')
  await page.waitForSelector('.status-bar', { timeout: 10_000 })
  await page.waitForSelector('.beans-tab__title', { timeout: 5_000 })
}

async function fireVisibilityRefresh(page) {
  // Wait past the 30s throttle window in useDataRefresh, then dispatch
  // visibilitychange so the singleton tick increments.
  await page.waitForTimeout(30_500)
  await page.evaluate(() => {
    try {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
    } catch (_) {
      // Property may already be defined and not configurable; dispatchEvent alone
      // should suffice since the page is already focused in headless Chrome.
    }
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

test.describe('Cross-device refresh', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${BASE_URL}/api/v1/test/reset-refresh-state`)
  })

  test('visibility refresh picks up bean added by another device', async ({ page, request }) => {
    // Override the default 30s test timeout — fireVisibilityRefresh waits 30.5s.
    test.setTimeout(60_000)

    // Initial state: no beans (mockBeans is the live array; tests run in
    // declaration order against a process-wide mock server, but reset-refresh-state
    // does NOT clear mockBeans — the test must seed and assert relative deltas).
    await loadBeans(page)

    // Snapshot the rendered count, then inject a bean from "another device".
    const initialCount = await page.locator('.beans-tab__bean').count()

    await request.post(`${BASE_URL}/api/v1/test/add-bean`, {
      data: { roaster: 'External', name: 'Other Device Bean' },
    })

    // Bean should NOT be visible yet (no refresh trigger).
    await expect(page.getByText('Other Device Bean')).toHaveCount(0)

    await fireVisibilityRefresh(page)

    // Bean appears without page reload.
    await expect(page.getByText('Other Device Bean')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.beans-tab__bean')).toHaveCount(initialCount + 1)
  })

  test('expanded bean batches refetch on tab resume', async ({ page, request }) => {
    test.setTimeout(60_000)

    const beanId = 'bean-coverage-task9'
    // Seed: known bean + initial batch (visible to test as "100g")
    await request.post(`${BASE_URL}/api/v1/test/add-bean`, {
      data: { id: beanId, roaster: 'Coverage Roaster', name: 'Coverage Bean Task9' },
    })
    await request.post(`${BASE_URL}/api/v1/test/add-batch/${beanId}`, {
      data: { id: 'batch-initial', roastDate: '2026-04-01', weight: 100 },
    })

    await loadBeans(page)

    // Click the bean row to expand and load its batches.
    await page.locator('.beans-tab__bean-row', { hasText: 'Coverage Bean Task9' }).click()
    await expect(page.getByText('100g')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('250g')).toHaveCount(0)

    // Simulate another device adding a batch with weight 250g.
    await request.post(`${BASE_URL}/api/v1/test/add-batch/${beanId}`, {
      data: { id: 'batch-new', roastDate: '2026-04-25', weight: 250 },
    })

    // Without refresh, the new batch should NOT yet be visible.
    await expect(page.getByText('250g')).toHaveCount(0)

    await fireVisibilityRefresh(page)

    // After refresh, the new batch appears in the still-expanded section.
    await expect(page.getByText('250g')).toBeVisible({ timeout: 5_000 })
    // Initial batch is still visible too.
    await expect(page.getByText('100g')).toBeVisible()
  })

  test('silent refresh failure shows error badge; success clears it', async ({ page, request }) => {
    test.setTimeout(120_000) // two throttle windows + assertions

    await page.goto('/#/settings/grinders')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.grinders-tab__title', { timeout: 5_000 })

    // No badge initially.
    await expect(page.locator('.refresh-error-badge')).toHaveCount(0)

    // Stage failure for the next /grinders GET.
    await request.post(`${BASE_URL}/api/v1/test/fail-next-grinders-get`)

    // First visibility refresh: server returns 500, lastRefreshFailed -> true, badge appears.
    await fireVisibilityRefresh(page)
    await expect(page.locator('.refresh-error-badge')).toBeVisible({ timeout: 5_000 })

    // Second visibility refresh: failure flag is one-shot and already self-cleared, so the
    // server returns 200 normally, lastRefreshFailed -> false, badge disappears.
    await fireVisibilityRefresh(page)
    await expect(page.locator('.refresh-error-badge')).toHaveCount(0, { timeout: 5_000 })
  })
})
