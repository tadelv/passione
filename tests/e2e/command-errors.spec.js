/**
 * E2E regression tests for machine-command failure handling (audit issue #1).
 *
 * Acceptance contract under test:
 *  - A failed Stop leaves the user on the running operation with controls
 *    visible, an actionable error, and a working retry.
 *  - Operation starts never navigate on failure — navigation follows the
 *    observed (WS-reported) machine state, never the command response.
 *  - A delayed/late command response can never override a navigation that
 *    already happened from observed state.
 *  - Repeated in-flight start sends are de-duplicated; an emergency Stop is
 *    not queued behind a pending Start.
 *  - Modifier chords, key auto-repeat and composition never issue machine
 *    commands; unmodified appliance shortcuts still work.
 *  - Leaving an already-idle lingering espresso page issues no machine
 *    command.
 *
 * The gateway state endpoint can legitimately fail writes (400 / 503) and a
 * 2xx is not proof the WS state changed, so these tests drive assertions off
 * routes and WS-observed machine state, not source text.
 */

import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

// ---- Store seeding ---------------------------------------------------------

async function seedLinger(request, lingerOnEspressoPage) {
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/espresso`, {
    data: { lingerOnEspressoPage },
    headers: { 'Content-Type': 'application/json' },
  })
}

async function seedLayoutDefault(request) {
  await request.post(`${BASE_URL}/api/v1/store/decenza-js/layout`, {
    data: {
      version: 2,
      zones: {
        topLeft:     { widgets: ['scaleInfo'] },
        topRight:    { widgets: [] },
        centerLeft:  { widgets: ['actionButtons', 'shotPlan'] },
        centerRight: { widgets: ['workflowCombos', 'lastShot'] },
        bottomLeft:  { widgets: ['navButtons'] },
        bottomRight: { widgets: ['sleepButton'] },
      },
    },
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---- Machine helpers -------------------------------------------------------

async function driveMachine(request, state) {
  await request.put(`${BASE_URL}/api/v1/machine/state/${state}`)
}

async function bootIdle(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  await page.waitForSelector('.idle-page', { timeout: 10000 })
  await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 10000 })
  // Let initial auto-navigation settle so later pushes are not debounce-swallowed.
  await page.waitForTimeout(400)
}

async function startEspressoFromHome(page) {
  const espressoBtn = page.locator('.action-button', { hasText: 'Espresso' })
  await expect(espressoBtn).toBeVisible({ timeout: 10000 })
  await espressoBtn.click() // confirm
  await page.locator('.action-button--confirmed').click() // start
}

/** Drive the machine into a running espresso and land the app on /espresso. */
async function runMockEspresso(page, request) {
  await driveMachine(request, 'espresso')
  await expect(page.locator('.status-bar__state')).toHaveText('espresso', { timeout: 10000 })
  await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 10000 })
  // Let the espresso auto-nav land and the router debounce window pass.
  await page.waitForTimeout(600)
}

/** Count PUTs the page issues to any /api/v1/machine/state/{state} endpoint. */
function installStatePutTracker(page) {
  const puts = []
  page.on('request', (req) => {
    if (req.method() === 'PUT' && /\/api\/v1\/machine\/state\/[^/]+$/.test(new URL(req.url()).pathname)) {
      puts.push(new URL(req.url()).pathname.split('/').pop())
    }
  })
  return puts
}

/** Dispatch a synthetic keydown on the document (what the app listens to). */
async function dispatchKey(page, init) {
  await page.evaluate((eInit) => {
    const opts = { key: eInit.key, bubbles: true, cancelable: true }
    for (const k of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'repeat', 'isComposing']) {
      if (k in eInit) opts[k] = eInit[k]
    }
    const target = document.activeElement || document.body
    target.dispatchEvent(new KeyboardEvent('keydown', opts))
  }, init)
}

// ---- Tests -----------------------------------------------------------------

test.describe('Machine command failures stay visible and retryable', () => {
  test.beforeEach(async ({ request }) => {
    // Deterministic baseline for every test in this file: machine idle,
    // default home layout, linger-on-espresso restored to the app default.
    await driveMachine(request, 'idle')
    await seedLayoutDefault(request)
    await seedLinger(request, true)
  })

  test('failed Stop keeps the running espresso visible and retryable', async ({ page, request }) => {
    await seedLinger(request, false) // assert landing home after the successful retry
    await bootIdle(page)
    await runMockEspresso(page, request)

    // Gateway rejects the Stop write (write queue full).
    let failNext = true
    await page.route('**/api/v1/machine/state/idle', (route) => {
      if (failNext) {
        failNext = false
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Machine write queue is full' }),
        })
      }
      return route.continue()
    })

    const stopBtn = page.locator('.espresso-page__back')
    await expect(stopBtn).toBeVisible()
    await stopBtn.click()
    await page.waitForTimeout(800)

    // The machine never stopped, so the user must NOT have been sent home:
    // route stays on the espresso page, Stop is still there, an actionable
    // error is shown.
    await expect(page).toHaveURL(/\/#\/espresso($|\?)/)
    await expect(page.locator('.espresso-page')).toBeVisible()
    await expect(stopBtn).toBeVisible()
    await expect(stopBtn).toBeEnabled()
    await expect(page.locator('.status-bar__state')).toHaveText('espresso')
    const errToast = page.locator('.toast--error')
    await expect(errToast.first()).toBeVisible()
    await expect(errToast.first()).toContainText(/could not stop|still running/i)

    // Retry now succeeds: the machine stops and the app goes home.
    await page.unroute('**/api/v1/machine/state/idle')
    await stopBtn.click()
    await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 10000 })
    await expect(page.locator('.idle-page')).toBeVisible({ timeout: 10000 })
  })

  test('rejected espresso start from home stays home', async ({ page, request }) => {
    await bootIdle(page)

    const puts = installStatePutTracker(page)
    await page.route('**/api/v1/machine/state/espresso', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Machine write queue is full' }),
    }))

    await startEspressoFromHome(page)
    await page.waitForTimeout(800)

    // Failed start: no navigation, error shown, machine still idle.
    await expect(page).toHaveURL(/\/#\/?$/)
    await expect(page.locator('.idle-page')).toBeVisible()
    await expect(page.locator('.espresso-page')).not.toBeVisible()
    await expect(page.locator('.status-bar__state')).toHaveText('idle')
    const errToast = page.locator('.toast--error')
    await expect(errToast.first()).toBeVisible()
    await expect(errToast.first()).toContainText(/could not start espresso/i)
    expect(puts.filter((s) => s === 'espresso').length).toBe(1)

    await page.unroute('**/api/v1/machine/state/espresso')
  })

  test('delayed successful start cannot navigate ahead of observed state', async ({ page, request }) => {
    await bootIdle(page)

    // The gateway accepts the start write only after 2s — and the machine
    // never actually starts (the write never reaches the machine).
    let resolveFulfill
    const gate = new Promise((r) => { resolveFulfill = r })
    await page.route('**/api/v1/machine/state/espresso', async (route) => {
      await gate
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await startEspressoFromHome(page)

    // Long after the request resolved, observed state is still idle → the app
    // must still be home (navigation follows observed state, not the PUT).
    resolveFulfill()
    await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 10000 })
    await page.waitForTimeout(2600) // past the 2s acceptance
    await expect(page).toHaveURL(/\/#\/?$/)
    await expect(page.locator('.idle-page')).toBeVisible()
    await expect(page.locator('.espresso-page')).not.toBeVisible()

    // Once the machine genuinely starts (observed over WS), auto-navigation
    // still works normally.
    await driveMachine(request, 'espresso')
    await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 10000 })
    await driveMachine(request, 'idle')

    await page.unroute('**/api/v1/machine/state/espresso')
  })

  test('repeated in-flight start sends one request; Stop is not queued behind it', async ({ page, request }) => {
    await seedLinger(request, false)
    await bootIdle(page)

    const puts = installStatePutTracker(page)
    // First start write stays in flight for 4s (never reaches the machine).
    let resolveStart
    const startGate = new Promise((r) => { resolveStart = r })
    await page.route('**/api/v1/machine/state/espresso', async (route) => {
      await startGate
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // Two start attempts while the first is still pending.
    await startEspressoFromHome(page)
    await page.waitForTimeout(120)
    await startEspressoFromHome(page)
    await page.waitForTimeout(400)

    const espressoPuts = puts.filter((s) => s === 'espresso').length
    expect(espressoPuts).toBeLessThanOrEqual(1)

    // Machine genuinely starts (observed over WS) while the start PUT is
    // still in flight; the app navigates on the observed state.
    await driveMachine(request, 'espresso')
    await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(400)

    // Emergency Stop must not be blocked by the pending espresso start.
    await page.locator('.espresso-page__back').click()
    await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 10000 })
    await expect(page.locator('.idle-page')).toBeVisible({ timeout: 10000 })
    expect(puts.filter((s) => s === 'idle').length).toBe(1)

    // The delayed start finally resolves — it must NOT drag the app anywhere.
    resolveStart()
    await page.waitForTimeout(500)
    await expect(page.locator('.idle-page')).toBeVisible()
    await expect(page.locator('.espresso-page')).not.toBeVisible()

    await page.unroute('**/api/v1/machine/state/espresso')
  })

  test('modifier chords and key auto-repeat issue no commands; plain shortcut works', async ({ page, request }) => {
    await bootIdle(page)

    const puts = installStatePutTracker(page)

    // Browser/app chords must never become machine commands.
    for (const ev of [
      { key: 's', ctrlKey: true },
      { key: 'w', metaKey: true },
      { key: 'f', altKey: true },
      { key: '2', ctrlKey: true },
      { key: '3', altKey: true },
      { key: '1', metaKey: true },
    ]) {
      await dispatchKey(page, ev)
    }
    // OS auto-repeat must not re-trigger commands.
    for (let i = 0; i < 3; i++) {
      await dispatchKey(page, { key: 's', repeat: true })
      await dispatchKey(page, { key: ' ', repeat: true })
    }
    await page.waitForTimeout(400)

    expect(puts.length).toBe(0)
    await expect(page.locator('.idle-page')).toBeVisible()
    await expect(page.locator('.status-bar__state')).toHaveText('idle')

    // An unmodified shortcut still works: 's' starts steam.
    await page.keyboard.press('s')
    await expect(page.locator('.status-bar__state')).toHaveText('steam', { timeout: 10000 })
    await expect(page.locator('.steam-page')).toBeVisible({ timeout: 10000 })
    expect(puts.filter((s) => s === 'steam').length).toBe(1)

    await driveMachine(request, 'idle')
  })

  test('leaving an already-idle lingering espresso page sends no machine command', async ({ page, request }) => {
    await seedLinger(request, true)
    await bootIdle(page)

    const puts = installStatePutTracker(page)
    await runMockEspresso(page, request)

    // The shot ends on its own; with linger the app stays on the espresso
    // page while the machine reports idle.
    await driveMachine(request, 'idle')
    await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 10000 })
    await expect(page.locator('.espresso-page')).toBeVisible()

    // Back on the lingering page: just leave — no unnecessary machine command.
    await page.locator('.espresso-page__back').click()
    await expect(page.locator('.idle-page')).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/\/#\/?$/)
    await page.waitForTimeout(500)
    expect(puts.filter((s) => s === 'idle').length).toBe(0)
  })

  test('late Stop success never redirects after the user leaves the espresso page', async ({ page, request }) => {
    await seedLinger(request, true) // App won't auto-push on espresso→idle
    await bootIdle(page)
    await runMockEspresso(page, request)

    // Stop write is accepted only after the user has left the page.
    let resolveStop
    const gate = new Promise((r) => { resolveStop = r })
    await page.route('**/api/v1/machine/state/idle', async (route) => {
      await gate
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.locator('.espresso-page__back').click() // Stop now in flight
    await page.waitForTimeout(250)

    // The user navigates away (settings) while the Stop is still pending.
    await page.evaluate(() => window.__vueRouter.push('/settings'))
    await expect(page.locator('.settings-page')).toBeVisible({ timeout: 10000 })

    // The delayed Stop resolves successfully after the page is gone. It must
    // not navigate from an unmounted page or leave a redirect behind.
    resolveStop()
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/#\/settings/)

    // An idle snapshot arriving afterwards must keep the user on their route.
    await driveMachine(request, 'idle')
    await page.waitForTimeout(700)
    await expect(page).toHaveURL(/\/#\/settings/)
    await expect(page.locator('.idle-page')).not.toBeVisible()

    await page.unroute('**/api/v1/machine/state/idle')
  })

  test('Stop accepted but machine not idle keeps the espresso controls', async ({ page, request }) => {
    await bootIdle(page)
    await runMockEspresso(page, request)

    // Gateway accepts the Stop but the machine never stops (write never
    // reaches the machine) — user must stay on /espresso with Stop enabled.
    await page.route('**/api/v1/machine/state/idle', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    }))

    await page.locator('.espresso-page__back').click()
    await page.waitForTimeout(800)

    await expect(page).toHaveURL(/\/#\/espresso($|\?)/)
    await expect(page.locator('.espresso-page')).toBeVisible()
    await expect(page.locator('.espresso-page__back')).toBeEnabled()
    await expect(page.locator('.status-bar__state')).toHaveText('espresso')

    await page.unroute('**/api/v1/machine/state/idle')
    await driveMachine(request, 'idle')
  })

  test('machine reaching idle while a Stop is pending returns home on observed state', async ({ page, request }) => {
    await seedLinger(request, true) // only our observed-idle watch returns home
    await bootIdle(page)
    await runMockEspresso(page, request)

    // Hold the Stop write in flight (never resolved) so it cannot have
    // completed before the machine is observed to idle.
    await page.route('**/api/v1/machine/state/idle', async () => {
      await new Promise(() => {}) // never settles — request stays pending
    })

    await page.locator('.espresso-page__back').click() // Stop now in flight
    await page.waitForTimeout(250)

    // The machine idles on its own while the Stop write is still pending.
    await driveMachine(request, 'idle')
    await expect(page.locator('.idle-page')).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/\/#\/?$/)

    await page.unroute('**/api/v1/machine/state/idle')
  })

  test('repeated failing Stop shows a single actionable error', async ({ page, request }) => {
    await bootIdle(page)
    await runMockEspresso(page, request)

    // Every Stop write is rejected, but slowly — two taps overlap in flight.
    await page.route('**/api/v1/machine/state/idle', async (route) => {
      await new Promise((r) => setTimeout(r, 1200))
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Machine write queue is full' }),
      })
    })

    const stopBtn = page.locator('.espresso-page__back')
    await stopBtn.click()
    await page.waitForTimeout(150)
    await stopBtn.click()

    // One de-duplicated attempt → one error toast, and the espresso stays up.
    await expect(page.locator('.toast--error')).toHaveCount(1, { timeout: 4000 })
    await expect(page).toHaveURL(/\/#\/espresso($|\?)/)
    await expect(stopBtn).toBeEnabled()

    await page.unroute('**/api/v1/machine/state/idle')
    await driveMachine(request, 'idle')
  })

  test('rejected descaling start stays in preparation', async ({ page, request }) => {
    await bootIdle(page)
    await page.evaluate(() => window.__vueRouter.push('/descaling'))
    await expect(page.locator('.descaling-page')).toBeVisible({ timeout: 10000 })

    // Check off every preparation step so the Begin button is enabled.
    const items = page.locator('.descaling-page__check-item')
    const n = await items.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) await items.nth(i).click()
    const beginBtn = page.locator('.descaling-page__begin-btn')
    await expect(beginBtn).toBeEnabled({ timeout: 3000 })

    await page.route('**/api/v1/machine/state/descaling', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Machine write queue is full' }),
    }))

    await beginBtn.click()
    await page.waitForTimeout(600)

    // A rejected start must not fake progress into the in-progress cycle.
    await expect(page.locator('.descaling-page__begin-btn')).toBeVisible()
    await expect(page.locator('.descaling-page__stop-btn')).not.toBeVisible()
    const errToast = page.locator('.toast--error')
    await expect(errToast.first()).toBeVisible()
    await expect(errToast.first()).toContainText(/could not start descaling/i)
    await expect(page.locator('.status-bar__state')).toHaveText('idle')

    await page.unroute('**/api/v1/machine/state/descaling')
  })
})
