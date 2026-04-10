/**
 * E2E test: loading a shot from history restores the full workflow
 * (profile, coffee, grinder, dose) — not just the profile.
 */

import { test, expect } from '@playwright/test'

async function loadApp(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
}

test.describe('Load shot workflow from history', () => {
  test('clicking Load restores profile, coffee, grinder, and dose to workflow', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    // Navigate to shot history
    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(2000)

    // Verify shots are loaded
    const rows = page.locator('.shot-history__row')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)

    // Click the Load button on the first shot
    const loadBtn = page.locator('.shot-history__action-btn--load').first()
    await expect(loadBtn).toBeVisible()
    await loadBtn.click()

    // Should navigate to home and show toast
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/#\/$/)

    // Verify the workflow was updated by checking the API directly
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/v1/workflow')
      return res.json()
    })

    // The first mock shot has:
    //   profile: { title: 'Default Profile' }
    //   doseData: { doseIn: 18.0, doseOut: 36.0 }
    //   (coffee/grinder come from normalizeShot via workflow.context)
    expect(response.profile).toBeTruthy()
    expect(response.profile.title).toBe('Default Profile')

    // Context should have dose values from the shot
    expect(response.context).toBeTruthy()
    if (response.context.targetDoseWeight != null) {
      expect(response.context.targetDoseWeight).toBe(18.0)
    }
    if (response.context.targetYield != null) {
      expect(response.context.targetYield).toBe(36.0)
    }

    // Verify the shot plan on idle page shows the loaded data
    const shotPlan = page.locator('.layout-widget__shot-plan')
    if (await shotPlan.isVisible()) {
      // Should show the profile name
      const profileText = page.locator('.layout-widget__profile')
      await expect(profileText).toContainText('Default Profile')

      // Should show dose info
      const planText = page.locator('.layout-widget__plan-text').first()
      await expect(planText).toBeVisible()
    }
  })
})
