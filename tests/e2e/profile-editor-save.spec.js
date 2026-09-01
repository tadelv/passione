/**
 * Profile editor save-flow regression tests.
 *
 * Covers two bugs that shipped together (tadelv/passione):
 *  - `isDirty` compared against a non-reactive snapshot (`let originalSnapshot`),
 *    so after a successful save the computed kept its stale cached `true`:
 *    the "Modified" badge stayed lit, navigating away always popped the
 *    unsaved-changes dialog, and Save & Leave fired a redundant second save.
 *  - The editor never adopted the new content-hash id the gateway returns for
 *    a default-profile fork (or an execution-change PUT), so the route kept
 *    pointing at the original record and reopening showed the old profile
 *    without the saved changes.
 */
import { test, expect } from '@playwright/test'

const DEFAULT_ID = 'profile-test1234567890abcdef'

async function openEditorAt(page, hashRoute) {
  await page.goto(hashRoute)
  await page.waitForSelector('.profile-editor__frame-row', { timeout: 10000 })
  await page.waitForTimeout(300)
}

async function setWeightExit(page, grams) {
  await page.locator('.profile-editor__section input[type="checkbox"]').first().check()
  await page.waitForTimeout(50)
  await page.locator('.profile-editor__select').selectOption('weight')
  await page.waitForTimeout(50)
  // exit step is 0.5 g per click
  const exitInput = page.locator('[aria-label="Exit condition value"]')
  const clicks = Math.round(grams / 0.5)
  for (let i = 0; i < clicks; i++) {
    await exitInput.locator('[aria-label="Increase value"]').click()
  }
  return exitInput
}

test.describe('profile editor save flow', () => {
  test.beforeEach(async ({ request }) => {
    await request.put('http://localhost:8080/api/v1/machine/state/idle')
  })

  test('save clears the dirty state — no unsaved-changes popup on navigation', async ({ page }) => {
    await openEditorAt(page, `/#/advanced-editor/${DEFAULT_ID}`)

    await setWeightExit(page, 5)
    expect(await page.locator('.profile-editor__dirty-badge').isVisible()).toBe(true)

    await page.locator('.profile-editor__bar-btn--save').click()
    await page.waitForTimeout(800)

    // After a successful save the badge must clear and leaving must not prompt.
    expect(await page.locator('.profile-editor__dirty-badge').isVisible()).toBe(false)

    await page.keyboard.press('h') // Home shortcut
    await page.waitForTimeout(400)
    expect(await page.locator('.profile-editor__confirm').isVisible()).toBe(false)
    expect(await page.locator('.profile-editor').isVisible()).toBe(false)
  })

  test('saving a default profile adopts the fork id so the changes reopen', async ({ page }) => {
    await openEditorAt(page, `/#/advanced-editor/${DEFAULT_ID}`)

    await setWeightExit(page, 5)
    await page.locator('.profile-editor__bar-btn--save').click()
    await page.waitForTimeout(800)

    // Route must now point at the forked child (content-hash id), not the default.
    const url = page.url()
    expect(url).not.toContain(`advanced-editor/${DEFAULT_ID}`)
    expect(url).toContain('advanced-editor/profile%3A')

    // Reload at the new route — the weight exit must be there.
    await openEditorAt(page, url)
    expect(await page.locator('.profile-editor__section input[type="checkbox"]').first().isChecked()).toBe(true)
    await expect(page.locator('.profile-editor__select')).toHaveValue('weight')
    await expect(page.locator('[aria-label="Exit condition value"]')).toHaveAttribute('aria-valuenow', '5')
  })

  test('typing digits into a ValueInput does not trigger global shortcuts', async ({ page }) => {
    await openEditorAt(page, '/#/advanced-editor')

    await page.locator('[aria-label="Frame duration"]').focus()
    await page.keyboard.type('40')
    await page.waitForTimeout(400)

    const state = await (await page.request.get('http://localhost:8080/api/v1/machine/state')).json()
    expect(state.state).toBe('idle')
    expect(await page.locator('.profile-editor').isVisible()).toBe(true)
  })
})
