/**
 * End-to-end tests for the theme colour editor and its ColourPicker dialog.
 *
 * Covers two regressions found in review:
 *  1. Theme colours are not always hex — "Surprise me" stores hsl(...) values —
 *     and ColourPicker only understands #rrggbb, so an unparsed colour silently
 *     resolved to black. The picker must seed from the browser-resolved colour.
 *  2. The picker is a modal. Its pad/hue are div[role=group|slider], which the
 *     app's global shortcut handler does NOT exclude (it skips INPUT/TEXTAREA/
 *     SELECT/contentEditable/[role=spinbutton]), so keystrokes inside the dialog
 *     used to reach the appliance handler: a plain letter key would start a real
 *     machine operation, and Escape would stop a running one.
 *
 * These are integration proofs — they need the mock gateway's idle machine state
 * and observe real PUT /api/v1/machine/state/<s> requests.
 */

import { test, expect } from '@playwright/test'

/** ThemesTab lives under the Display tab (the old `themes` id redirects). */
async function loadThemesTab(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__vueRouter.push('/settings/display'))
  await page.waitForSelector('.themes-tab')
}

/** Record appliance state commands so we can prove none were issued. */
function trackStateCommands(page) {
  const commands = []
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/api/v1/machine/state/')) {
      commands.push(req.url())
    }
  })
  return commands
}

async function selectToken(page, label) {
  await page.locator('.themes-tab__swatch-row', { hasText: label }).first().click()
}

async function openPicker(page, label = 'Primary') {
  // The editor (and its swatch button) only renders once a token is selected.
  await selectToken(page, label)
  await page.locator('.themes-tab__preview-swatch').click()
  await expect(page.locator('.color-picker__card')).toBeVisible()
}

const parseHex = (hex) => hex.replace('#', '').slice(-6).match(/../g).map((x) => parseInt(x, 16))

test('seeds the picker from a random (hsl) palette instead of resolving to black', async ({ page }) => {
  await loadThemesTab(page)
  await selectToken(page, 'Primary')
  await page.locator('.themes-tab__random-btn').click()

  // The random palette stores hsl(...) for every token.
  const cssValue = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
  )
  expect(cssValue).toMatch(/^hsl/i)

  // Expected value comes from the browser's own CSS engine — an independent
  // oracle, not a reimplementation of the app's conversion.
  const expectedHex = await page.evaluate((value) => {
    const probe = document.createElement('span')
    probe.style.color = value
    document.body.appendChild(probe)
    const rgb = getComputedStyle(probe).color
    probe.remove()
    const [r, g, b] = rgb.match(/\d+/g).map(Number)
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
  }, cssValue)

  await openPicker(page)

  const actualHex = (await page.locator('.color-picker__preview-hex').textContent()).trim()
  // Allow ±2 per channel for rounding differences between the two conversions.
  const expected = parseHex(expectedHex)
  const actual = parseHex(actualHex)
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(expected[i] - actual[i]), `${actualHex} vs browser ${expectedHex}`).toBeLessThanOrEqual(2)
  }

  // The original regression: the hsl() value was unparseable and became black.
  await expect(page.locator('.color-picker__preview-hex')).not.toHaveText(/#000000/i)
})

test('control: shortcut keys DO act when no picker is open', async ({ page }) => {
  // Guards against a vacuous pass in the two tests below — proves the harness
  // actually observes machine commands from this route.
  const commands = trackStateCommands(page)
  await loadThemesTab(page)

  await page.keyboard.press('e')
  await expect.poll(() => commands.length, { timeout: 5000 }).toBeGreaterThan(0)
})

test('Escape closes the picker without issuing a machine command, and restores focus', async ({ page }) => {
  const commands = trackStateCommands(page)
  await loadThemesTab(page)
  await selectToken(page, 'Primary')
  await openPicker(page)

  // Points at the pad on open, so focus is genuinely inside the dialog.
  const focusedOnOpen = await page.evaluate(() => !!document.activeElement?.closest?.('.color-picker__card'))
  expect(focusedOnOpen).toBe(true)

  await page.keyboard.press('Escape')
  await expect(page.locator('.color-picker__card')).toBeHidden()
  await page.waitForTimeout(300)

  // Escape must not reach the appliance handler, where it stops an operation.
  expect(commands).toEqual([])

  // Focus returns to the control that opened the dialog.
  const restored = await page.evaluate(() => document.activeElement?.className ?? '')
  expect(restored).toContain('themes-tab__preview-swatch')
})

test('appliance shortcut keys do not act while the picker is open', async ({ page }) => {
  const commands = trackStateCommands(page)
  await loadThemesTab(page)
  await openPicker(page)

  // The dialog owns the keyboard: these would otherwise start espresso/steam/
  // flush and navigate, because the pad is a div the global handler does not skip.
  for (const key of ['e', '2', 's', 'w', 'f', 'h', 'p', 'i', ' ', 'Backspace']) {
    await page.keyboard.press(key === ' ' ? 'Space' : key)
  }
  await page.waitForTimeout(400)

  expect(commands).toEqual([])
  await expect(page.locator('.color-picker__card')).toBeVisible()
})

test('Tab is contained inside the dialog in both directions', async ({ page }) => {
  await loadThemesTab(page)
  await openPicker(page)

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab')
    const inside = await page.evaluate(() => !!document.activeElement?.closest?.('.color-picker__card'))
    expect(inside, `focus escaped on tab press ${i + 1}`).toBe(true)
  }
})

test('the picker is operable by keyboard alone (pad and hue respond to arrows)', async ({ page }) => {
  await loadThemesTab(page)
  await selectToken(page, 'Primary')
  await openPicker(page)

  const before = (await page.locator('.color-picker__preview-hex').textContent()).trim()

  // Focus starts on the pad; arrow keys must change saturation/value.
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  const afterPad = (await page.locator('.color-picker__preview-hex').textContent()).trim()
  expect(afterPad).not.toBe(before)

  // Hue slider carries slider semantics and responds to arrows.
  const hue = page.getByRole('slider', { name: 'Hue' })
  await expect(hue).toHaveAttribute('aria-valuenow', /\d+/)
  await hue.focus()
  await page.keyboard.press('ArrowRight')
  const afterHue = (await page.locator('.color-picker__preview-hex').textContent()).trim()
  expect(afterHue).not.toBe(afterPad)
})
