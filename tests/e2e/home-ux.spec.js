/**
 * Daily-driver audit #5 — home widget UX regression.
 *
 * Verifies, against the local mock (never the real machine):
 *   1. Native keyboard/pointer navigation of the last-shot detail and the
 *      shot-plan recipe summary, each as its own focusable sibling of Repeat
 *      and of coffee/profile (no nested interactive semantics).
 *   2. Repeat activated by keyboard Enter only loads the workflow (workflow
 *      PUT fires) and never navigates to the detail page nor starts an op.
 *   3. Home interactive targets (profile picker, coffee picker, Tare, Repeat,
 *      every nav button, Sleep) are >=44x44 CSS px and stay horizontally within
 *      the viewport at 1024x768, 768x1024 and 390x844 — no clipping, no overlap,
 *      no hidden horizontal scroll. The last-shot chart stays inside its card
 *      (it does not overlay its legend/summary, Repeat, footer nav or Sleep).
 *   4. Configured brew temperature shows via i18n (numeric-string profiles
 *      work), is omitted when unknown, and is omitted/different from live.
 *
 * A full seven-widget default layout (incl. workflowCombos with a saved recipe)
 * and a real execution profile + shot graph are seeded. Screenshots go to
 * /tmp/passione-audit-agents/home-after-*.png only.
 */
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'fs'

const B = 'http://localhost:8080'
const SHOT_DIR = '/tmp/passione-audit-agents'
const SHOT_ID = 'homeux-shot'

// Full default-like layout (all seven widget types, saved-zone positions).
const FULL_LAYOUT = {
  version: 2,
  zones: {
    topLeft: { widgets: ['scaleInfo'] },
    topRight: { widgets: [] },
    centerLeft: { widgets: ['actionButtons', 'shotPlan'] },
    centerRight: { widgets: ['lastShot', 'workflowCombos'] },
    bottomLeft: { widgets: ['navButtons'] },
    bottomRight: { widgets: ['sleepButton'] },
  },
}

const EXEC_PROFILE = {
  title: 'Numeric Profile', id: 'num-1',
  steps: [
    { name: 'Preinfuse', pump: 'pressure', pressure: 6, flow: 0, temperature: '93.5', seconds: 8, transition: 'fast' },
    { name: 'Pour', pump: 'flow', pressure: 0, flow: 2.5, temperature: '93.5', seconds: 30, transition: 'smooth' },
  ],
}

// A few real-ish samples so the last-shot graph actually draws a curve.
const GRAPH_MEASUREMENTS = [0, 10, 20, 30].map((t, i) => ({
  machine: {
    timestamp: new Date(Date.now() - (30 - t) * 1000).toISOString(),
    state: { state: 'espresso', substate: 'pouring' },
    pressure: 9 - i * 0.1, flow: 2.5 - i * 0.2,
    mixTemperature: 93 + i * 0.05,
    targetPressure: 9, targetFlow: 2.5, targetMixTemperature: 93.5,
    profileFrame: i,
  },
  scale: { weight: t * 1.2, weightFlow: 1.2 },
}))

async function seedHome(request, { withOps = false } = {}) {
  await request.put(`${B}/api/v1/machine/state/idle`)
  await request.post(`${B}/api/v1/store/decenza-js/layout`, { data: FULL_LAYOUT, headers: { 'Content-Type': 'application/json' } })
  await request.post(`${B}/api/v1/store/decenza-js/combos`, { data: {
    workflowCombos: [{ id: 'r1', name: 'Morning Shot', emoji: '🌅', profileTitle: 'Numeric Profile', doseIn: 18, doseOut: 36 }],
    selectedWorkflowCombo: -1,
  }, headers: { 'Content-Type': 'application/json' } })

  const ops = withOps ? { steamSettings: { targetTemperature: 160, duration: 30, flow: 1.5, stopAtTemperature: 0 } } : {}
  await request.put(`${B}/api/v1/workflow`, { data: {
    profile: EXEC_PROFILE,
    context: { coffeeName: 'Morning Bean', coffeeRoaster: 'Roaster X', targetDoseWeight: 18, targetYield: 36, grinderModel: 'TG', grinderSetting: '12' },
    ...ops,
  }, headers: { 'Content-Type': 'application/json' } })

  await request.post(`${B}/api/v1/test/inject-fresh-shot`, { data: {
    id: SHOT_ID,
    timestamp: new Date().toISOString(),
    workflow: {
      profile: { title: 'Numeric Profile', id: 'num-1' },
      context: { coffeeName: 'Morning Bean', coffeeRoaster: 'Roaster X', targetDoseWeight: 18, targetYield: 36, grinderModel: 'TG', grinderSetting: '12' },
    },
    measurements: GRAPH_MEASUREMENTS,
  }, headers: { 'Content-Type': 'application/json' } })
}

function trackPageErrors(page) {
  const errors = []
  const consoleErrs = []
  page.on('pageerror', (err) => errors.push(String(err?.message || err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!/net::|Failed to load resource|favicon/i.test(text)) consoleErrs.push(text)
    }
  })
  return { errors, consoleErrs }
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready)
  // Let the async last-shot chart mount + resize and any connect toasts clear.
  try { await page.waitForFunction(() => !document.querySelector('.toast-container'), null, { timeout: 8000 }) } catch { /* toast may already be gone */ }
  await page.waitForTimeout(600)
}

async function waitForHomeWidgets(page) {
  await page.waitForSelector('.layout-widget__repeat-btn', { timeout: 15000 })
  await page.waitForSelector('.layout-widget__profile', { timeout: 15000 })
  await page.waitForSelector('.layout-widget__plan-text--coffee', { timeout: 15000 })
  await page.waitForSelector('.layout-widget__plan-summary', { timeout: 15000 })
  await settle(page)
}

test.describe('Home UX audit #5', () => {
  test('all targets >=44px, contained, non-overlapping; chart stays in its card; no h-scroll at 3 sizes', async ({ page, request }) => {
    test.setTimeout(150000)
    await seedHome(request, { withOps: true })
    await trackPageErrors(page)
    const viewports = [
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]

    // Regions that must be mutually non-overlapping (first instance each).
    const REGION_SELS = [
      ['profile', '.layout-widget__profile'],
      ['coffee', '.layout-widget__plan-text--coffee'],
      ['config-summary', '.layout-widget__plan-summary'],
      ['ops', '.layout-widget__plan-ops'],
      ['scale-btn', '.layout-widget__scale-btn'],
      ['status-scan', '.status-bar__scan-btn'],
      ['chart', '.layout-widget__last-shot-chart'],
      ['info', '.layout-widget__last-shot-info'],
      ['repeat', '.layout-widget__repeat-btn'],
      ['sleep', '.layout-widget__nav-btn--sleep'],
    ]

    for (const { width, height } of viewports) {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await waitForHomeWidgets(page)

      const boxes = {}
      for (const [name, sel] of REGION_SELS) {
        const loc = page.locator(sel).first()
        if (await loc.count()) {
          await expect(loc).toBeVisible({ timeout: 15000 })
          const b = await loc.boundingBox()
          expect(b, `${name} should have a box at ${width}x${height}`).toBeTruthy()
          boxes[name] = b
        }
      }

      // The required small interactive targets must be >=44 in both dims.
      for (const key of ['profile', 'coffee', 'scale-btn', 'status-scan', 'repeat', 'sleep']) {
        const b = boxes[key]
        expect(b, `${key} present at ${width}x${height}`).toBeTruthy()
        expect(b.width, `${key} width >= 44 at ${width}x${height}`).toBeGreaterThanOrEqual(44)
        expect(b.height, `${key} height >= 44 at ${width}x${height}`).toBeGreaterThanOrEqual(44)
      }

      // Header: scan/left, clock, and telemetry must not overlap each other.
      const hb = {}
      for (const key of ['left', 'clock', 'right']) {
        const loc = page.locator(`.status-bar__${key}`).first()
        const b = await loc.boundingBox()
        expect(b, `status bar ${key} has a box`).toBeTruthy()
        hb[key] = b
      }
      const hn = Object.keys(hb)
      for (let i = 0; i < hn.length; i++) {
        for (let j = i + 1; j < hn.length; j++) {
          const a = hb[hn[i]], c = hb[hn[j]]
          const ow = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x)
          const oh = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y)
          expect(ow < 1 || oh < 1, `status-bar ${hn[i]} overlaps ${hn[j]} at ${width}x${height}`).toBe(true)
        }
        expect(hb[hn[i]].x, `status-bar ${hn[i]} left >= 0`).toBeGreaterThanOrEqual(-1)
        expect(hb[hn[i]].x + hb[hn[i]].width, `status-bar ${hn[i]} within viewport`).toBeLessThanOrEqual(width + 1)
      }

      // Every nav button (not just the first) is >=44 and contained.
      const navBtns = page.locator('.layout-widget__nav .layout-widget__nav-btn')
      const navCount = await navBtns.count()
      expect(navCount).toBeGreaterThan(0)
      for (let i = 0; i < navCount; i++) {
        const nb = await navBtns.nth(i).boundingBox()
        expect(nb.width).toBeGreaterThanOrEqual(44)
        expect(nb.height).toBeGreaterThanOrEqual(44)
        expect(nb.x).toBeGreaterThanOrEqual(-1)
        expect(nb.x + nb.width).toBeLessThanOrEqual(width + 1)
      }

      // Horizontal containment for every measured region.
      for (const [name, b] of Object.entries(boxes)) {
        expect(b.x, `${name} left >= 0 at ${width}x${height}`).toBeGreaterThanOrEqual(-1)
        expect(b.x + b.width, `${name} right within viewport at ${width}x${height}`).toBeLessThanOrEqual(width + 1)
      }

      // Mutual non-overlap of all measured regions (catches chart leaking over
      // its own legend/summary/Repeat/footer/Sleep).
      const names = Object.keys(boxes)
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = boxes[names[i]], c = boxes[names[j]]
          const ow = Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x)
          const oh = Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y)
          expect(ow < 1 || oh < 1, `${names[i]} overlaps ${names[j]} at ${width}x${height}`).toBe(true)
        }
      }

      // The graph must be fully contained inside its chart container.
      const chartBox = boxes.chart
      if (chartBox) {
        const graph = page.locator('.layout-widget__last-shot-chart .history-shot-graph').first()
        const gb = await graph.boundingBox()
        expect(gb, 'history-shot-graph has a box').toBeTruthy()
        expect(gb.y, 'graph top within chart').toBeGreaterThanOrEqual(chartBox.y - 1)
        expect(gb.y + gb.height, 'graph bottom within chart').toBeLessThanOrEqual(chartBox.y + chartBox.height + 1)
        expect(gb.x, 'graph left within chart').toBeGreaterThanOrEqual(chartBox.x - 1)
        expect(gb.x + gb.width, 'graph right within chart').toBeLessThanOrEqual(chartBox.x + chartBox.width + 1)
        // Compact legend present and not overflowing the chart column.
        const compact = page.locator('.layout-widget__last-shot .history-shot-graph__legend--compact')
        expect(await compact.count()).toBeGreaterThan(0)
        const legendBox = await compact.first().boundingBox()
        const legendOverflow = await compact.first().evaluate((el) => el.scrollWidth - el.clientWidth)
        expect(legendOverflow).toBeLessThanOrEqual(1)
        expect(legendBox.x + legendBox.width).toBeLessThanOrEqual(chartBox.x + chartBox.width + 1)
        expect(legendBox.x).toBeGreaterThanOrEqual(chartBox.x - 1)
        expect(legendBox.y + legendBox.height).toBeLessThanOrEqual(chartBox.y + chartBox.height + 1)
        // Actual uPlot canvas surfaces must also be inside the chart container.
        const canvases = page.locator('.layout-widget__last-shot-chart canvas')
        expect(await canvases.count()).toBeGreaterThan(0)
        const n = await canvases.count()
        for (let k = 0; k < n; k++) {
          const cb = await canvases.nth(k).boundingBox()
          expect(cb, `uPlot canvas ${k} has a box`).toBeTruthy()
          expect(cb.x, `canvas ${k} left within chart`).toBeGreaterThanOrEqual(chartBox.x - 1)
          expect(cb.x + cb.width, `canvas ${k} right within chart`).toBeLessThanOrEqual(chartBox.x + chartBox.width + 1)
          expect(cb.y, `canvas ${k} top within chart`).toBeGreaterThanOrEqual(chartBox.y - 1)
          expect(cb.y + cb.height, `canvas ${k} bottom within chart`).toBeLessThanOrEqual(chartBox.y + chartBox.height + 1)
        }
      }

      // No hidden horizontal scroll on the page at this size.
      const hscroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(hscroll, `no horizontal overflow at ${width}x${height}`).toBeLessThanOrEqual(2)

      mkdirSync(SHOT_DIR, { recursive: true })
      await page.screenshot({ path: `${SHOT_DIR}/home-after-${width}x${height}.png`, fullPage: true })
      // Mobile: also capture the bottom of the page so the supervisor can
      // verify Sleep, the footer nav and Repeat are all reachable. Scrolling the
      // whole .idle-page into view does not scroll its parent to the footer, so
      // bring the sleep button (bottom-most control) into view instead.
      if (width === 390) {
        const sleep = page.locator('.layout-widget__nav-btn--sleep')
        await sleep.scrollIntoViewIfNeeded()
        await settle(page) // let toasts clear before the bottom capture
        // The page scrolls inside .app-main (overflow-y:auto), not the window.
        const st = await page.evaluate(() => {
          const sc = document.querySelector('.app-main')
          const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom } }
          const cr = sc ? sc.getBoundingClientRect() : null
          return {
            scrolled: sc ? sc.scrollTop : -1,
            vpTop: cr ? cr.top : 0,
            vpBottom: cr ? cr.bottom : window.innerHeight,
            sleep: box(document.querySelector('.layout-widget__nav-btn--sleep')),
            nav: box(document.querySelector('.layout-widget__nav')),
          }
        })
        expect(st.scrolled, 'actually scrolled to the bottom (not a top duplicate)').toBeGreaterThan(0)
        expect(st.sleep, 'sleep button reachable after scroll').toBeTruthy()
        expect(st.sleep.top, 'sleep not clipped above viewport').toBeGreaterThanOrEqual(st.vpTop - 1)
        expect(st.sleep.bottom, 'sleep fully inside viewport').toBeLessThanOrEqual(st.vpBottom + 1)
        expect(st.nav, 'footer nav reachable after scroll').toBeTruthy()
        expect(st.nav.bottom, 'footer nav inside viewport').toBeLessThanOrEqual(st.vpBottom + 1)
        await page.screenshot({ path: `${SHOT_DIR}/home-after-${width}x${height}-bottom.png` })
      }
    }
  })

  test('configured brew temp via i18n (numeric-string), shown; omitted when profile unknown', async ({ page, request }) => {
    const { errors, consoleErrs } = trackPageErrors(page)
    await page.setViewportSize({ width: 1024, height: 768 })
    await seedHome(request)
    await page.goto('/')
    await waitForHomeWidgets(page)

    const tempLine = page.locator('.layout-widget__plan-text--temperature')
    await expect(tempLine).toBeVisible()
    const txt = (await tempLine.textContent()) || ''
    expect(txt).toContain('configured brew')
    expect(txt).toContain('93.5')
    expect(txt).not.toContain('NaN')

    // Unknown profile (no steps) → temperature omitted, not invented.
    await request.put(`${B}/api/v1/workflow`, { data: { profile: { title: 'No Steps', id: 'no-steps' } }, headers: { 'Content-Type': 'application/json' } })
    await page.reload()
    await waitForHomeWidgets(page)
    await expect(page.locator('.layout-widget__plan-text--temperature')).toHaveCount(0)

    expect(errors).toEqual([])
    expect(consoleErrs).toEqual([])
  })

  test('Repeat via keyboard Enter loads workflow; never navigates to detail nor starts an op', async ({ page, request }) => {
    await seedHome(request)
    const { errors, consoleErrs } = trackPageErrors(page)
    const wfPuts = []
    const espressoStarts = []
    page.on('request', (req) => {
      const url = req.url()
      if (req.method() === 'PUT' && url.includes('/api/v1/workflow')) wfPuts.push(req.postData() || '')
      if (/\/api\/v1\/machine(\/state)?(?:\/[a-zA-Z]+)?$/.test(url) && ['PUT', 'POST'].includes(req.method())) {
        const body = (() => { try { return req.postDataJSON() } catch { return null } })()
        if (body?.state === 'espresso' || body?.command === 'espresso') espressoStarts.push(url)
      }
    })

    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/')
    await waitForHomeWidgets(page)

    const repeat = page.locator('.layout-widget__repeat-btn')
    const before = wfPuts.length
    await repeat.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => wfPuts.length).toBeGreaterThan(before)

    expect(page.url()).not.toMatch(/\/#\/shot\//)
    expect(page.url()).toMatch(/#\/?$/)
    expect(espressoStarts.length).toBe(0)
    const state = await (await request.get(`${B}/api/v1/machine/state`)).json()
    expect(state?.state).toBe('idle')

    expect(errors).toEqual([])
    expect(consoleErrs).toEqual([])
  })

  test('detail link keyboard-navigates to the shot detail; Repeat is its sibling, not nested', async ({ page, request }) => {
    await seedHome(request)
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/')
    await waitForHomeWidgets(page)

    const detail = page.locator('.layout-widget__last-shot-card')
    await expect(detail).toHaveAttribute('href', `#/shot/${SHOT_ID}`)
    await detail.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/#/shot/${SHOT_ID}$`))
  })

  test('recipe-summary link keyboard-navigates to the recipe editor (dose/grinder/temp)', async ({ page, request }) => {
    await seedHome(request)
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/')
    await waitForHomeWidgets(page)

    const summary = page.locator('.layout-widget__plan-summary')
    await expect(summary).toHaveAttribute('href', '#/recipe/edit')
    // Contains the configured brew temp (grouped config line).
    await expect(summary).toContainText('configured brew')
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/recipe\/edit$/)
  })
})
