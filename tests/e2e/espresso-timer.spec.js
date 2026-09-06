/**
 * E2E regression tests for the espresso extraction timer (audit issue #4).
 *
 * Bug: `useMachine` started every operation timer only at the `pouring`
 * substate and tracked state/substate with two separate watchers, so:
 *   - espresso preinfusion was not counted (the espresso chart + shot clock
 *     anchor at preinfusion, but the phase-timeline timer started at pouring),
 *   - a direct different-operation transition that kept the same substate
 *     (operation A/pouring → operation B/pouring) was missed because the
 *     substate never changed, leaving B's timer never (re)started.
 *
 * Desired contract:
 *   - Espresso elapsed starts at `preinfusion` (or `pouring` when preinfusion
 *     is skipped), excludes `preparingForShot` preheat, continues without a
 *     reset across `preinfusion` → `pouring`, and freezes at `pouringDone`.
 *   - Steam/hotWater/flush stay pouring-only (preheat is still excluded).
 *   - Entering a NEW flowing operation resets the clock even if the substate
 *     is unchanged; repeated identical snapshots never reset.
 *
 * This spec drives the app's real machine WebSocket with crafted snapshot
 * frames (routeWebSocket) and a deterministic fake clock (page.clock), so the
 * exact substate sequence and elapsed time are controlled precisely. The mock
 * server cannot produce these sequences (it only ever emits preparingForShot →
 * pouring and never advances `preinfusion`), so frames are injected directly.
 *
 * Run (against a built dist/ served by the mock): npx playwright test tests/e2e/espresso-timer.spec.js
 */

import { test, expect } from '@playwright/test'

// ---- Frame + feed helpers --------------------------------------------------

function frame(state, substate) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    state: { state, substate },
    flow: 0,
    pressure: 0,
    targetFlow: 0,
    targetPressure: 0,
    mixTemperature: 93,
    groupTemperature: 93,
    targetMixTemperature: 93,
    targetGroupTemperature: 93,
    profileFrame: 0,
    steamTemperature: 140,
  })
}

/**
 * Intercept the machine snapshot WebSocket (so the mock can't push frames),
 * boot the app to a deterministic idle, and return a handle whose send(msg)
 * delivers a snapshot frame to the app. The real useMachine composable runs
 * in the app; this only controls which frames it observes.
 */
async function bootIdleWithSnapshotFeed(page) {
  let ws = null
  await page.routeWebSocket('**/ws/v1/machine/snapshot', (sock) => { ws = sock })
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  await expect.poll(() => !!ws, { timeout: 8000 }).toBe(true)
  await ws.send(frame('idle', 'ready'))
  await page.waitForSelector('.idle-page', { timeout: 10000 })
  await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 10000 })
  // Freeze the clock before any shot starts so every anchor/elapsed read below
  // is deterministic.
  await page.clock.install()
  return ws
}

/** Small real-time pause so Vue has flushed the updated shotTime into the DOM. */
async function settle() {
  await new Promise((r) => setTimeout(r, 25))
}

// ---- DOM reading helpers ---------------------------------------------------

/** Read the espresso page's phase-timeline clock (e.g. "2.5s") as seconds. */
async function espressoSeconds(page) {
  const text = await page.locator('.espresso-page .phase-timeline__time').textContent()
  return parseFloat(text.trim().replace(/s$/, ''))
}

/**
 * Read the steam page's timer text (e.g. "0:02 / 60s") as whole seconds from
 * the leading m:ss token.
 */
async function steamSeconds(page) {
  const text = await page.locator('.steam-page__timer-text').textContent()
  const m = text.trim().match(/(\d+):(\d{2})/)
  if (!m) return NaN
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

// ---- Tests -----------------------------------------------------------------

test.describe('Espresso extraction timer', () => {
  test('espresso counts preinfusion and pours continuously to pouringDone', async ({ page }) => {
    const ws = await bootIdleWithSnapshotFeed(page)

    // Preheat must not tick.
    await ws.send(frame('espresso', 'preparingForShot'))
    await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 10000 })
    await page.clock.fastForward(1500)
    await settle()
    expect(await espressoSeconds(page)).toBeLessThan(0.3)

    // Preinfusion starts the clock...
    await ws.send(frame('espresso', 'preinfusion'))
    await page.clock.fastForward(1200)
    await settle()
    const atPourStart = await espressoSeconds(page)
    // ...and is not zeroed when we roll into pouring (elapsed continues).
    await ws.send(frame('espresso', 'pouring'))
    await page.clock.fastForward(1800)
    await settle()
    const beforeDone = await espressoSeconds(page)

    // Freeze at pouringDone keeps the exact accumulated (incl. preinfusion).
    await ws.send(frame('espresso', 'pouringDone'))
    await page.clock.fastForward(600) // further time must not advance a frozen clock
    await settle()
    const frozen = await espressoSeconds(page)

    // preinfusion (1.2s) counted already while still in preinfusion.
    expect(Math.abs(atPourStart - 1.2)).toBeLessThan(0.35)
    // preinfusion 1.2 + pouring 1.8 = 3.0 — NOT a pouring-only ~1.8.
    expect(Math.abs(beforeDone - 3.0)).toBeLessThan(0.35)
    // frozen at ~3.0, and extra 0.6s after pouringDone did not accumulate.
    expect(Math.abs(frozen - 3.0)).toBeLessThan(0.35)
  })

  test('espresso with no preinfusion starts its clock at pouring', async ({ page }) => {
    const ws = await bootIdleWithSnapshotFeed(page)

    // idle → espresso directly in `pouring` (preinfusion skipped).
    await ws.send(frame('espresso', 'pouring'))
    await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 10000 })
    await page.clock.fastForward(3000)
    await settle()
    expect(Math.abs(await espressoSeconds(page) - 3.0)).toBeLessThan(0.35)
  })

  test('non-espresso operations still tick only from pouring (preheat excluded)', async ({ page }) => {
    const ws = await bootIdleWithSnapshotFeed(page)

    // Steam preheat must not tick.
    await ws.send(frame('steam', 'preparingForShot'))
    await expect(page.locator('.steam-page')).toBeVisible({ timeout: 10000 })
    await page.clock.fastForward(1500)
    await settle()
    expect(await steamSeconds(page)).toBe(0)

    // Steam only starts when it reaches pouring.
    await ws.send(frame('steam', 'pouring'))
    await page.clock.fastForward(2500)
    await settle()
    expect(await steamSeconds(page)).toBeGreaterThanOrEqual(2)
  })

  test('a direct A/pouring → B/pouring transition resets and restarts B', async ({ page }) => {
    const ws = await bootIdleWithSnapshotFeed(page)

    // A: espresso pouring — let 2s accumulate.
    await ws.send(frame('espresso', 'pouring'))
    await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 10000 })
    await page.clock.fastForward(2000)
    await settle()

    // B: steam enters directly at pouring with the SAME substate (pouring).
    // The old split state/substate watchers never restarted B here because the
    // substate did not change. The new code must reset and start fresh.
    await ws.send(frame('steam', 'pouring'))
    await expect(page.locator('.steam-page')).toBeVisible({ timeout: 10000 })
    await page.clock.fastForward(3000)
    await settle()
    const bSeconds = await steamSeconds(page)
    // B must be ~3s (its own pouring), NOT ~5s (A+B cumulative) and not stuck at 0.
    expect(bSeconds).toBeGreaterThanOrEqual(2)
    expect(bSeconds).toBeLessThan(4.5)
  })

  test('repeated identical snapshots never reset the running clock', async ({ page }) => {
    const ws = await bootIdleWithSnapshotFeed(page)

    await ws.send(frame('espresso', 'preinfusion'))
    await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 10000 })
    await page.clock.fastForward(1000)
    await settle()

    // A repeated identical preinfusion snapshot must not reset.
    await ws.send(frame('espresso', 'preinfusion'))
    await page.clock.fastForward(1000)
    await settle()

    await ws.send(frame('espresso', 'pouring'))
    await page.clock.fastForward(1000)
    await settle()

    // Repeated identical pouring snapshot must not reset either.
    await ws.send(frame('espresso', 'pouring'))
    await page.clock.fastForward(1000)
    await settle()

    await ws.send(frame('espresso', 'pouringDone'))
    await settle()
    // 4 × 1s across preinfusion + pouring, with no resets.
    expect(Math.abs(await espressoSeconds(page) - 4.0)).toBeLessThan(0.35)
  })
})
