/**
 * E2E test for post-shot commit-poll on the non-Visualizer path.
 *
 * When the user finishes a shot without Visualizer credentials configured,
 * the app must still poll /api/v1/shots/latest before navigating home, so
 * that the home page's last-shot widget sees the just-committed record.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

test.describe('Post-shot commit-poll', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${BASE_URL}/api/v1/test/reset-shot-poll-state`)
  })

  test('without Visualizer creds, page does not navigate home until shot commits', async ({ page, request }) => {
    test.setTimeout(60_000)

    // Make sure no Visualizer creds are persisted from a previous run.
    await page.addInitScript(() => {
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.toLowerCase().includes('visualizer')) localStorage.removeItem(k)
        }
      } catch {}
    })

    await page.goto('/')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.idle-page', { timeout: 5_000 })

    // Reset shot-poll state AFTER the page boots (so we have a clean baseline).
    await request.post(`${BASE_URL}/api/v1/test/reset-shot-poll-state`)

    // Drive: idle -> espresso (substate progresses to pouring within ~150ms in mock).
    await request.put(`${BASE_URL}/api/v1/machine/state/espresso`)
    await expect(page.locator('.status-bar__state')).toHaveText('espresso', { timeout: 5_000 })
    await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 5_000 })

    // Let espresso settle (substate -> pouring) and let priorLatestShotId snapshot resolve.
    await page.waitForTimeout(500)

    // Drive: espresso -> idle. App.vue's state watcher fires the post-shot path.
    // StopReasonOverlay shows for 3s, then onStopReasonDismiss runs.
    await request.put(`${BASE_URL}/api/v1/machine/state/idle`)

    // The discriminator: 4s after PUT-idle is 1s past overlay dismiss. With the
    // bug, the page has already navigated to '/'. With the fix, the poll loop
    // is running and the page is still on '/espresso' (waiting for commit).
    await page.waitForTimeout(4_000)
    await expect(page).toHaveURL(/\/#\/espresso(\?|$)/, { timeout: 1_000 })
    await expect(page.locator('.espresso-page')).toBeVisible()

    // Inject the "fresh" shot so the next poll resolves and navigates home.
    await request.post(`${BASE_URL}/api/v1/test/inject-fresh-shot`, {
      data: { id: 'shot-injected-fresh-1' },
    })

    // Wait for the poll to detect the fresh id and navigate home.
    // Worst case: ~500ms until the next poll tick + small navigation buffer.
    await expect(page).toHaveURL(/\/#\/?$/, { timeout: 5_000 })
    await expect(page.locator('.idle-page')).toBeVisible({ timeout: 5_000 })
  })
})
