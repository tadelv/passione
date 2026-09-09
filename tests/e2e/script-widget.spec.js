/**
 * End-to-end tests for the Script Widget home widget (issue #9).
 *
 * Runs against the local mock server. Covers the supported contract:
 *   1. any-zone placement; two placements = two independent sandboxed
 *      runtimes sharing one applied source, each with its own zone/density
 *   2. sandbox restrictions: allow-scripts only, opaque origin — the child
 *      cannot reach the parent DOM and the parent cannot read the child
 *   3. initial state exists before the source runs; later state updates flow
 *      as `passione-state` events without re-running initialization
 *   4. the exposed snapshot is frozen/serialized, never a live Vue object
 *   5. draft edits autosave but never affect Home; Apply recreates runtimes;
 *      Test uses a disposable preview and never replaces the applied source;
 *      Reset example restores the state/event-driven example
 *   6. syntax + runtime errors are contained ("Script error" on Home, detailed
 *      in the Test preview); one failing placement does not kill another
 *   7. normal browser networking still works (no privileged proxy needed)
 */
import { test, expect } from '@playwright/test'

const B = 'http://localhost:8080'

const SCRIPT_LAYOUT = {
  version: 2,
  zones: {
    topLeft: { widgets: ['scriptWidget'] },
    topRight: { widgets: [] },
    centerLeft: { widgets: ['scriptWidget'] },
    centerRight: { widgets: [] },
    bottomLeft: { widgets: ['navButtons'] },
    bottomRight: { widgets: ['sleepButton'] },
  },
}

const WORKFLOW_CTX = {
  profile: { id: 'profile:test', title: 'Test Profile' },
  context: {
    coffeeName: 'Morning Bean',
    coffeeRoaster: 'Roaster X',
    beanBatchId: 'batch-1',
    targetDoseWeight: 18,
    targetYield: 36,
    grinderId: 'grinder-9',
    grinderModel: 'Niche Zero',
    grinderSetting: '12',
  },
}

async function seed(request, { applied = '', draft = '' } = {}) {
  await request.put(`${B}/api/v1/machine/state/idle`)
  await request.post(`${B}/api/v1/store/decenza-js/layout`, {
    data: SCRIPT_LAYOUT,
    headers: { 'Content-Type': 'application/json' },
  })
  await request.post(`${B}/api/v1/store/decenza-js/scriptWidget`, {
    data: { scriptWidgetDraft: draft, scriptWidgetApplied: applied },
    headers: { 'Content-Type': 'application/json' },
  })
  await request.put(`${B}/api/v1/workflow`, {
    data: WORKFLOW_CTX,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function cleanup(request) {
  await request.put(`${B}/api/v1/machine/state/idle`)
  await request.delete(`${B}/api/v1/store/decenza-js/scriptWidget`).catch(() => {})
  await request.delete(`${B}/api/v1/store/decenza-js/layout`).catch(() => {})
}

async function loadHome(page) {
  await page.goto('/')
  await page.waitForSelector('.idle-page', { timeout: 15000 })
}

// Click an in-app nav target and confirm the route actually settled. The
// router debounces same-session navigations by 300ms (double-tap protection),
// so a click can be silently dropped when it lands too soon after another
// route commit; retrying after the debounce window keeps the test on the UI
// path without touching production timing.
async function clickNav(page, locator, expectedHash) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await locator.click()
    try {
      await page.waitForFunction(
        (h) => (window.location.hash || '#/') === h,
        expectedHash,
        { timeout: 3000 }
      )
      return
    } catch {
      /* swallowed by the nav debounce or a route race — retry past the window */
    }
    await page.waitForTimeout(400)
  }
  throw new Error(`Navigation to ${expectedHash} did not settle`)
}

// In-app UI navigation (never raw hash gotos): the home screen lives at '#/'
// and the mock machine never leaves idle during navigation.
async function goSettings(page) {
  await clickNav(page, page.locator('.layout-widget__nav').getByText('Settings', { exact: true }), '#/settings')
  await clickNav(page, page.getByRole('tab', { name: 'Display', exact: true }), '#/settings/display')
  await page.waitForSelector('[data-testid="script-widget-source"]', { timeout: 15000 })
}

async function goHome(page) {
  await clickNav(page, page.locator('.bottom-bar__home'), '#/')
  await page.waitForSelector('.idle-page', { timeout: 15000 })
}

// Resolve placement runtimes fresh every call: layout/settings loads can
// recreate a widget (and therefore its frame), so stale Frame handles detach.
async function getFrames(page) {
  const out = {}
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    try {
      const zone = await frame.evaluate(() => (window.passione?.widget?.zone) || null)
      if (zone) out[zone] = frame
    } catch {
      /* frame torn down mid-read */
    }
  }
  return out
}

async function waitForPlacements(page, zones) {
  await expect.poll(async () => {
    const frames = await getFrames(page)
    return zones.every((z) => frames[z]) ? 'ready' : 'loading'
  }, { timeout: 15000 }).toBe('ready')
}

// Read one placement; null when its runtime is not (yet) present.
async function readPlacement(page, zone) {
  const frames = await getFrames(page)
  const frame = frames[zone]
  if (!frame) return null
  try {
    return await frame.evaluate(() => {
      const d = document.body.dataset
      return {
        zone: d.zone,
        density: d.density,
        runs: d.runs,
        machine: d.machine,
        temp: d.temp,
        dose: d.dose,
        yield: d.yield,
        ratio: d.ratio,
        coffee: d.coffee,
        profile: d.profile,
        isolated: d.isolated,
        frozen: d.frozen,
        events: d.events,
        text: (document.body.textContent || '').trim(),
        machineConnected: d.machineConnected,
        scaleConnected: d.scaleConnected,
        battery: d.battery,
      }
    })
  } catch {
    return null
  }
}

// Applied/draft sources shared by several tests. Kept to plain string
// concatenation so the spec file needs no nested-template escaping.
const RENDER_SOURCE = [
  'function render(state) {',
  "  document.body.dataset.machine = String(state.machine && state.machine.state)",
  "  document.body.dataset.temp = String(state.machine && state.machine.temperature)",
  "  document.body.dataset.machineConnected = String(state.machine && state.machine.connected)",
  "  document.body.dataset.scaleConnected = String(state.scale && state.scale.connected)",
  "  document.body.dataset.battery = String(state.scale && state.scale.battery)",
  "  document.body.dataset.dose = String(state.workflow && state.workflow.dose)",
  "  document.body.dataset.yield = String(state.workflow && state.workflow.yield)",
  "  document.body.dataset.ratio = String(state.workflow && state.workflow.ratio)",
  "  document.body.dataset.coffee = String(state.workflow && state.workflow.coffeeName)",
  "  document.body.dataset.profile = String(state.workflow && state.workflow.profileTitle)",
  '  document.body.dataset.frozen = String(Object.isFrozen(state) && Object.isFrozen(window.passione))',
  "  document.body.dataset.events = String((Number(document.body.dataset.events) || 0) + 1)",
  '}',
  'function boot() {',
  '  window.__runCount = (window.__runCount || 0) + 1',
  "  document.body.dataset.runs = String(window.__runCount)",
  "  document.body.dataset.zone = passione.widget.zone",
  "  document.body.dataset.density = passione.widget.density",
  '  let parentReachable = true',
  '  try { parentReachable = !!(window.top.document && window.top.document.body) } catch (e) { parentReachable = false }',
  "  document.body.dataset.isolated = parentReachable ? 'no' : 'yes'",
  '  render(passione.state)',
  '}',
  'boot()',
  "window.addEventListener('passione-state', function (e) { render(e.detail) })",
].join('\n')

const MARKER = (id) => `document.body.textContent = '${id}'`

test.describe('Script Widget', () => {
  test('any-zone placements run the same source in independent sandboxed runtimes with per-placement context', async ({ page, request }) => {
    test.setTimeout(60000)
    const mainErrors = []
    page.on('pageerror', (err) => mainErrors.push(String(err?.message || err)))
    await seed(request, { applied: RENDER_SOURCE })
    await loadHome(page)

    // Two placements (edge topLeft + center centerLeft) → two runtimes.
    await waitForPlacements(page, ['topLeft', 'centerLeft'])
    expect(Object.keys(await getFrames(page)).length).toBe(2)

    // Per-placement widget context inside each runtime.
    const densityByZone = {}
    for (const zone of ['topLeft', 'centerLeft']) {
      await expect.poll(async () => (await readPlacement(page, zone)) ?? null, { timeout: 15000 }).toBeTruthy()
      const data = await readPlacement(page, zone)
      densityByZone[data.zone] = data.density
    }
    expect(densityByZone.topLeft).toBe('compact')
    expect(densityByZone.centerLeft).toBe('full')

    // Every runtime iframe is allow-scripts only (never allow-same-origin).
    const sandboxAttrs = await page.evaluate(() =>
      [...document.querySelectorAll('iframe.script-widget__frame')].map((f) => f.getAttribute('sandbox'))
    )
    expect(sandboxAttrs.length).toBe(2)
    for (const attr of sandboxAttrs) expect(attr).toBe('allow-scripts')

    // Both placements expose the seeded workflow state (same applied source,
    // independent DOMs): dose/yield/ratio, coffee, profile, live temperature.
    for (const zone of ['topLeft', 'centerLeft']) {
      await expect.poll(async () => (await readPlacement(page, zone))?.machine).toBe('idle')
      const data = await readPlacement(page, zone)
      expect(data.dose).toBe('18')
      expect(data.yield).toBe('36')
      expect(data.ratio).toBe('2')
      expect(data.coffee).toBe('Morning Bean')
      expect(data.profile).toBe('Test Profile')
      // machine.connected mirrors the devices feed (actual DE1 connectivity),
      // which the mock does not emulate — so it is false and machine
      // telemetry stays null (never coerced to 0/'').
      expect(data.machineConnected).toBe('false')
      expect(data.temp).toBe('null')
      // The scale telemetry channel is live in the mock, proving the
      // connected → live-telemetry path end-to-end.
      await expect.poll(async () => (await readPlacement(page, zone))?.scaleConnected).toBe('true')
      expect((await readPlacement(page, zone)).battery).toBe('100')
    }

    // Isolated: the child cannot read the parent document…
    await expect.poll(async () => (await readPlacement(page, 'topLeft'))?.isolated).toBe('yes')
    // …and the parent cannot read into the opaque-origin child document.
    const parentAccess = await page.evaluate(() => {
      const frame = document.querySelector('iframe.script-widget__frame')
      try { return frame.contentDocument == null ? 'blocked' : 'reachable' } catch { return 'blocked' }
    })
    expect(parentAccess).toBe('blocked')

    expect(mainErrors).toEqual([])
    await cleanup(request)
  })

  test('later state updates dispatch passione-state without re-running initialization; snapshot stays frozen', async ({ page, request }) => {
    test.setTimeout(60000)
    const mainErrors = []
    page.on('pageerror', (err) => mainErrors.push(String(err?.message || err)))
    await seed(request, { applied: RENDER_SOURCE })
    await loadHome(page)

    await waitForPlacements(page, ['centerLeft'])
    await expect.poll(async () => (await readPlacement(page, 'centerLeft'))?.machine).toBe('idle')
    const baseline = await readPlacement(page, 'centerLeft')
    expect(baseline.runs).toBe('1')
    const baselineEvents = Number(baseline.events)

    // Drive a real machine state change through the mock gateway.
    await request.put(`${B}/api/v1/machine/state/heating`)
    await expect.poll(async () => (await readPlacement(page, 'centerLeft'))?.machine).toBe('heating')

    const after = await readPlacement(page, 'centerLeft')
    // Initialization ran exactly once — the update arrived as an event.
    expect(after.runs).toBe('1')
    expect(Number(after.events)).toBeGreaterThan(baselineEvents)
    expect(after.frozen).toBe('true')

    // window.passione carries the new snapshot and is read-only: writing to it
    // either throws (strict) or silently no-ops (sloppy), but never mutates.
    const frames = await getFrames(page)
    const inside = await frames.centerLeft.evaluate(() => {
      let assignThrew = false
      try { window.passione.state.machine.state = 'mutated' } catch { assignThrew = true }
      return {
        machineState: window.passione.state.machine.state,
        frozenState: Object.isFrozen(window.passione.state),
        frozenTop: Object.isFrozen(window.passione),
        assignThrew,
      }
    })
    expect(inside.machineState).toBe('heating')
    expect(inside.frozenState).toBe(true)
    expect(inside.frozenTop).toBe(true)

    // Null semantics survive serialization and updates: with no machine device
    // in the mock feed, connected stays false and temperature stays null
    // (never 0/''), even as machine state updates keep arriving. The
    // connected=true → live-telemetry mapping is covered by the unit tests.
    const data = await readPlacement(page, 'centerLeft')
    expect(data.machineConnected).toBe('false')
    expect(data.temp).toBe('null')

    expect(mainErrors).toEqual([])
    await request.put(`${B}/api/v1/machine/state/idle`)
    await cleanup(request)
  })

  test('draft edits autosave but never touch Home; Apply recreates runtimes; Test and Reset do not apply', async ({ page, request }) => {
    test.setTimeout(90000)
    const mainErrors = []
    page.on('pageerror', (err) => mainErrors.push(String(err?.message || err)))
    await seed(request, { applied: MARKER('SRC-v1'), draft: MARKER('SRC-v2') })

    await loadHome(page)
    await waitForPlacements(page, ['topLeft'])
    await expect.poll(async () => (await readPlacement(page, 'topLeft'))?.text).toBe('SRC-v1')

    // Draft edits must not leak into Home before Apply.
    await goSettings(page)
    const editor = page.locator('[data-testid="script-widget-source"]')
    await expect(editor).toHaveValue(MARKER('SRC-v2')) // seeded draft survived boot load
    await editor.fill(MARKER('SRC-v3'))
    await page.waitForTimeout(1200) // let the 800ms settings autosave debounce fire

    await goHome(page)
    await waitForPlacements(page, ['topLeft'])
    await expect.poll(async () => (await readPlacement(page, 'topLeft'))?.text).toBe('SRC-v1')

    // Apply copies the persisted draft onto the applied source and persists
    // immediately: the flash (success feedback) only appears after the KV
    // write completes, so the server state is observable right away.
    await goSettings(page)
    const editor2 = page.locator('[data-testid="script-widget-source"]')
    await expect(editor2).toHaveValue(MARKER('SRC-v3')) // draft autosave persisted
    await page.locator('[data-testid="script-widget-apply"]').click()
    await expect(page.locator('[data-testid="script-widget-applied-flash"]')).toBeVisible({ timeout: 10000 })
    await expect.poll(async () => {
      const kv = await (await request.get(`${B}/api/v1/store/decenza-js/scriptWidget`)).json()
      return kv?.scriptWidgetApplied ?? null
    }, { timeout: 10000 }).toBe(MARKER('SRC-v3'))

    await goHome(page)
    await waitForPlacements(page, ['topLeft'])
    await expect.poll(async () => (await readPlacement(page, 'topLeft'))?.text).toBe('SRC-v3')

    // Test runs a disposable preview from the editor and never replaces the
    // applied source.
    await goSettings(page)
    const editor3 = page.locator('[data-testid="script-widget-source"]')
    await editor3.fill(MARKER('SRC-test-preview'))
    await page.locator('[data-testid="script-widget-test"]').click()
    const previewFrame = page.frames().find((f) => f !== page.mainFrame() && f.url().startsWith('about:srcdoc'))
    expect(previewFrame).toBeTruthy()
    await expect.poll(async () =>
      previewFrame.evaluate(() => (document.body ? (document.body.textContent || '').trim() : null))
    ).toBe('SRC-test-preview')

    // Reset example restores the example (not applied).
    await page.locator('[data-testid="script-widget-reset"]').click()
    const resetText = await editor3.inputValue()
    expect(resetText).toContain('passione-state')

    // Home still runs the applied v3 source — Test/Reset never applied.
    await goHome(page)
    await waitForPlacements(page, ['topLeft'])
    await expect.poll(async () => (await readPlacement(page, 'topLeft'))?.text).toBe('SRC-v3')

    expect(mainErrors).toEqual([])
    await cleanup(request)
  })

  test('syntax errors and runtime exceptions stay contained; one failing placement does not kill another', async ({ page, request }) => {
    test.setTimeout(60000)

    // Placement-dependent crash: only the compact (edge) runtime throws.
    const ZONE_CRASH_SOURCE = [
      "if (passione.widget.density === 'compact') { throw new Error('edge boom') }",
      "document.body.textContent = 'alive-center'",
    ].join('\n')
    await seed(request, { applied: ZONE_CRASH_SOURCE })
    await loadHome(page)

    // The crashed compact placement shows the local fallback; its sibling
    // keeps running (no intentional cross-placement teardown).
    await waitForPlacements(page, ['centerLeft'])
    await expect(page.locator('[data-testid="script-widget-error"]')).toHaveCount(1, { timeout: 15000 })
    await expect(page.locator('[data-testid="script-widget-error"]')).toHaveText('Script error')
    await expect.poll(async () => (await readPlacement(page, 'centerLeft'))?.text).toBe('alive-center')
    // Home chrome still works.
    await expect(page.locator('.layout-widget__nav')).toBeVisible()

    // Syntax error → contained fallback on both placements, app intact.
    await cleanup(request)
    await seed(request, { applied: 'function (' })
    await page.goto('/')
    await page.waitForSelector('.idle-page', { timeout: 15000 })
    await expect(page.locator('[data-testid="script-widget-error"]')).toHaveCount(2, { timeout: 15000 })
    for (const box of await page.locator('[data-testid="script-widget-error"]').all()) {
      await expect(box).toHaveText('Script error')
    }
    await expect(page.locator('.layout-widget__nav')).toBeVisible()

    // Runtime exception detail shows in the Settings Test preview only.
    await goSettings(page)
    await page.locator('[data-testid="script-widget-source"]').fill("throw new Error('boom-detail')")
    await page.locator('[data-testid="script-widget-test"]').click()
    const testError = page.locator('[data-testid="script-widget-test-error"]')
    await expect(testError).toHaveCount(1, { timeout: 15000 })
    await expect(testError).toContainText('boom-detail')

    // Test error never leaked onto Home: the applied source is still the
    // (broken) syntax-error script, so Home keeps its own contained
    // "Script error" fallbacks — not the Test preview's boom-detail.
    await goHome(page)
    await expect(page.locator('[data-testid="script-widget-error"]')).toHaveCount(2, { timeout: 15000 })
    await expect(page.locator('[data-testid="script-widget-test-error"]')).toHaveCount(0)
    // Home is fully functional after the intentional crashes.
    await expect(page.locator('.layout-widget__nav')).toBeVisible()
    await cleanup(request)
  })

  test('normal browser networking works inside the runtime — no Passione proxy involved', async ({ page, request }) => {
    test.setTimeout(60000)
    const mainErrors = []
    page.on('pageerror', (err) => mainErrors.push(String(err?.message || err)))
    const FETCH_SOURCE = [
      "fetch('http://localhost:8080/api/v1/machine/state')",
      '  .then(function (r) { return r.json() })',
      "  .then(function (d) { document.body.textContent = 'state=' + d.state })",
      "  .catch(function () { document.body.textContent = 'fetch-fail' })",
    ].join('\n')
    await seed(request, { applied: FETCH_SOURCE })
    await loadHome(page)

    await waitForPlacements(page, ['topLeft'])
    await expect.poll(async () => (await readPlacement(page, 'topLeft'))?.text).toBe('state=idle')
    expect(mainErrors).toEqual([])
    await cleanup(request)
  })
})
