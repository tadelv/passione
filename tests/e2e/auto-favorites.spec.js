/**
 * E2E test: Auto-Favorites page aggregates shot history correctly
 * and allows loading a group's profile into the workflow.
 */

import { test, expect } from '@playwright/test'

async function loadApp(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
}

test.describe('Auto-Favorites', () => {
  test('loads shots and displays grouped cards with metrics', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/auto-favorites'))
    await page.waitForTimeout(3000)

    // Group-by buttons should be visible with Bean + Profile selected by default
    const activeGroup = page.locator('.auto-fav__group-btn--active')
    await expect(activeGroup).toContainText('Bean + Profile')

    // Should show at least one card (mock has 2 shots with different profiles)
    const cards = page.locator('.auto-fav__card')
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThan(0)

    // Each card should have metrics
    const firstCard = cards.first()
    await expect(firstCard.locator('.auto-fav__card-count')).toContainText('shot')

    // Should show rating if available
    const metrics = firstCard.locator('.auto-fav__metric')
    const metricCount = await metrics.count()
    expect(metricCount).toBeGreaterThan(0)
  })

  test('switching group-by recomputes without reloading', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/auto-favorites'))
    await page.waitForTimeout(3000)

    // Count cards with default grouping (Bean + Profile)
    const initialCount = await page.locator('.auto-fav__card').count()

    // Switch to Profile only
    await page.getByRole('button', { name: 'Profile', exact: true }).click()
    await page.waitForTimeout(500)

    // Should recompute — may have different card count
    const profileCount = await page.locator('.auto-fav__card').count()
    expect(profileCount).toBeGreaterThan(0)

    // The active button should now be Profile
    const activeGroup = page.locator('.auto-fav__group-btn--active')
    await expect(activeGroup).toHaveText('Profile')

    // Switch to Bean
    await page.getByRole('button', { name: 'Bean', exact: true }).click()
    await page.waitForTimeout(500)

    const beanCount = await page.locator('.auto-fav__card').count()
    expect(beanCount).toBeGreaterThan(0)
  })

  test('Load button applies the group profile to workflow', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/auto-favorites'))
    await page.waitForTimeout(3000)

    // Click Load on the first card
    const loadBtn = page.locator('.auto-fav__action-btn').first()
    await expect(loadBtn).toContainText('Load')
    await loadBtn.click()

    // Should navigate to home
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/#\/$/)

    // Verify workflow was updated
    const workflow = await page.evaluate(async () => {
      const res = await fetch('/api/v1/workflow')
      return res.json()
    })

    // The loaded profile should be from one of the mock shots
    expect(workflow.profile).toBeTruthy()
    expect(workflow.profile.title).toBeTruthy()
  })

  test('Show Shots navigates to history with search', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__vueRouter.push('/auto-favorites'))
    await page.waitForTimeout(3000)

    // Click Show Shots on the first card
    const showBtn = page.locator('.auto-fav__action-btn--secondary').first()
    await expect(showBtn).toContainText('Show Shots')
    await showBtn.click()

    await page.waitForTimeout(1000)

    // Should navigate to history
    await expect(page).toHaveURL(/history/)
  })
})
