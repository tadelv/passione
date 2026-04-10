/**
 * Capture screenshots of key pages for README documentation.
 * Run with: npx playwright test tests/e2e/screenshots.spec.js
 */
import { test } from '@playwright/test'

const SCREENSHOT_DIR = 'docs/screenshots'

async function loadApp(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  // Wait for WebSocket data to populate gauges
  await page.waitForTimeout(2000)
}

test.describe('Screenshots', () => {
  test('idle page — home screen', async ({ page }) => {
    await loadApp(page)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/idle-page.png` })
  })

  test('idle page — layout edit mode', async ({ page }) => {
    await loadApp(page)
    await page.evaluate(() => window.__vueRouter.push({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })
    await page.screenshot({ path: `${SCREENSHOT_DIR}/layout-edit-mode.png` })
  })

  test('idle page — layout drawer open', async ({ page }) => {
    await loadApp(page)
    await page.evaluate(() => window.__vueRouter.push({ path: '/', query: { editLayout: 'true' } }))
    await page.waitForSelector('.edit-overlay', { timeout: 5000 })
    await page.locator('.edit-overlay__zone--centerRight').click()
    await page.waitForSelector('[role="dialog"]', { timeout: 3000 })
    await page.screenshot({ path: `${SCREENSHOT_DIR}/layout-editor-drawer.png` })
  })

  test('settings page', async ({ page }) => {
    await loadApp(page)
    await page.evaluate(() => window.__vueRouter.push('/settings'))
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/settings-page.png` })
  })

  test('shot history page', async ({ page }) => {
    await loadApp(page)
    await page.evaluate(() => window.__vueRouter.push('/history'))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/shot-history.png` })
  })

  test('bean info page', async ({ page }) => {
    await loadApp(page)
    await page.evaluate(() => window.__vueRouter.push('/bean-info'))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bean-info.png` })
  })

  test('profile info page', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)
    await page.evaluate(() => window.__vueRouter.push('/profile-info/profile-test1234567890abcdef'))
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/profile-info.png` })
  })

  test('profile selector page', async ({ page }) => {
    await loadApp(page)
    await page.evaluate(() => window.__vueRouter.push('/profiles'))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/profile-selector.png` })
  })

  test('auto-favorites page', async ({ page }) => {
    await loadApp(page)
    await page.evaluate(() => window.__vueRouter.push('/auto-favorites'))
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/auto-favorites.png` })
  })

  test('shot detail page', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)
    await page.evaluate(() => window.__vueRouter.push('/shot/shot-2026-02-13-100000'))
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/shot-detail.png` })
  })

  test('shot detail — phase summary expanded', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)
    await page.evaluate(() => window.__vueRouter.push('/shot/shot-2026-02-13-100000'))
    await page.waitForTimeout(3000)
    const header = page.locator('.phase-summary__header')
    if (await header.isVisible()) {
      await header.click()
      await page.waitForTimeout(300)
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/shot-detail-phase-summary.png` })
  })

  test('simple profile editor', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)
    await page.evaluate(() => window.__vueRouter.push('/simple-editor?type=pressure'))
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/simple-editor.png` })
  })

  test('shot comparison page', async ({ page }) => {
    await loadApp(page)
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      window.__vueRouter.push({
        path: '/shot-comparison',
        query: { ids: 'shot-2026-02-13-100000,shot-2026-02-13-090000' }
      })
    })
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/shot-comparison.png` })
  })
})
