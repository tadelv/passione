# Testing Feedback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 bugs/visual issues and implement 2 features from user testing feedback.

**Architecture:** Bug fixes target specific composables and components (steam timer in App.vue, shot normalization in ComparisonGraph). Visual fixes are CSS-only changes in ScreensaverPage.vue. The shot history layout adds a responsive split-pane pattern. Fluid dynamics adds a new canvas-based screensaver mode.

**Tech Stack:** Vue 3 (Composition API), uPlot, CSS, Canvas 2D, Playwright (e2e tests)

---

### Task 1: Fix Steam/Flush Completion Timer (Bug)

**Root cause:** `App.vue:336` calls `shotData.elapsed()` for the completion overlay of steam/hotWater/flush operations. But `shotData` only tracks espresso — `shotData.start()` is never called for steam/flush, so `elapsed()` returns `_stoppedElapsed` frozen from the *previous* espresso, producing wrong values like 9s or 69s.

**Fix:** Use `machine.shotTime.value` (the general-purpose timer from `useMachine.js` that resets on every flowing state entry) instead of `shotData.elapsed()` for non-espresso completion overlays.

**Files:**
- Modify: `src/App.vue:336`
- Test: `tests/e2e/steam-timer.spec.js` (new)

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/steam-timer.spec.js`:

```javascript
/**
 * E2E test: Steam completion overlay shows correct elapsed time.
 *
 * Verifies that when steam runs for ~2 seconds, the completion overlay
 * displays a time close to 2s (not a stale espresso duration).
 */

import { test, expect } from '@playwright/test'

async function loadApp(page) {
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  return consoleErrors
}

async function setMachineState(page, state) {
  await page.evaluate(async (s) => {
    await fetch(`/api/v1/machine/state/${s}`, { method: 'PUT' })
  }, state)
  await page.waitForTimeout(600)
}

test('steam completion overlay shows correct elapsed time', async ({ page }) => {
  await loadApp(page)

  // Ensure idle
  await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 5000 })

  // Start steam
  await setMachineState(page, 'steam')
  await expect(page.locator('.status-bar__state')).toHaveText('steam', { timeout: 5000 })
  await expect(page.locator('.steam-page')).toBeVisible({ timeout: 5000 })

  // Let it run for ~2 seconds
  await page.waitForTimeout(2000)

  // Stop steam (back to idle)
  await setMachineState(page, 'idle')

  // Completion overlay should appear with a time close to 2s (1-4s range)
  const overlay = page.locator('.completion-overlay')
  await expect(overlay).toBeVisible({ timeout: 5000 })

  const valueText = await page.locator('.completion-overlay__value').textContent()
  const seconds = parseFloat(valueText)
  expect(seconds).toBeGreaterThanOrEqual(1)
  expect(seconds).toBeLessThanOrEqual(5)
})

test('steam completion does not show previous espresso time', async ({ page }) => {
  await loadApp(page)
  await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 5000 })

  // Run a fake espresso for ~3 seconds
  await setMachineState(page, 'espresso')
  await page.waitForTimeout(3000)
  await setMachineState(page, 'idle')
  await page.waitForTimeout(2000) // let overlay dismiss

  // Now run steam for ~1 second
  await setMachineState(page, 'steam')
  await expect(page.locator('.steam-page')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(1500)
  await setMachineState(page, 'idle')

  // Completion overlay time should be ~1-2s, NOT ~3s from the espresso
  const overlay = page.locator('.completion-overlay')
  await expect(overlay).toBeVisible({ timeout: 5000 })

  const valueText = await page.locator('.completion-overlay__value').textContent()
  const seconds = parseFloat(valueText)
  expect(seconds).toBeLessThan(3)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "steam completion"`
Expected: FAIL — the elapsed time will be wrong (stale espresso value or 0).

- [ ] **Step 3: Fix the timer source in App.vue**

In `src/App.vue`, change line 336 from:

```javascript
      const elapsed = shotData.elapsed()
```

to:

```javascript
      const elapsed = machine.shotTime.value
```

This uses the general-purpose timer from `useMachine.js` which correctly resets when entering any flowing state and ticks independently per operation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- --grep "steam completion"`
Expected: PASS — completion overlay shows correct ~2s elapsed time.

- [ ] **Step 5: Verify with real Streamline-Bridge**

Start the simulator: `cd vendor/reaprime && ./flutter_with_commit.sh run -d macos --dart-define=simulate=1`
Start dev server: `npm run dev`
Manually trigger steam, verify the completion overlay shows correct time.

- [ ] **Step 6: Commit**

```bash
git add src/App.vue tests/e2e/steam-timer.spec.js
git commit -m "fix: use machine timer for steam/flush completion overlay

The completion overlay was using shotData.elapsed() which only tracks
espresso recordings. For steam/flush, this returned the stale value
from the previous espresso. Switch to machine.shotTime.value which
correctly resets per-operation."
```

---

### Task 2: Fix Compare Shots Empty Charts (Bug)

**Root cause:** `ComparisonGraph.vue:buildData()` expects flat arrays (`shot.elapsed[]`, `shot.pressure[]`, etc.) but the API returns shots in measurements array format (`shot.measurements[]` with nested `machine`/`scale` objects). The `normalizeShotData()` function in `HistoryShotGraph.vue` handles this transformation, but `ComparisonGraph.vue` doesn't use it.

**Fix:** Extract `normalizeShotData()` from `HistoryShotGraph.vue` into a shared utility (`src/composables/useChartNormalize.js`), then use it in both `HistoryShotGraph.vue` and `ComparisonGraph.vue`.

**Files:**
- Create: `src/composables/useChartNormalize.js`
- Modify: `src/components/HistoryShotGraph.vue` (import from shared utility)
- Modify: `src/components/ComparisonGraph.vue` (normalize shots before building data)
- Test: `tests/e2e/shot-comparison.spec.js` (new)

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/shot-comparison.spec.js`:

```javascript
/**
 * E2E test: Shot comparison page renders charts with data.
 *
 * Verifies that comparing two shots from history produces a chart
 * with actual data points (not empty).
 */

import { test, expect } from '@playwright/test'

async function loadApp(page) {
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  return consoleErrors
}

async function navigateTo(page, path) {
  await page.evaluate((p) => {
    window.__vueRouter._skipDebounce = true
    return window.__vueRouter.push(p)
  }, path)
  await page.waitForTimeout(500)
}

test('comparison page renders chart with data for two shots', async ({ page }) => {
  await loadApp(page)

  // Navigate to comparison page with two known mock shot IDs
  await navigateTo(page, '/shot-comparison?ids=shot-2026-02-13-100000,shot-2026-02-13-090000')
  await page.waitForTimeout(1500)

  // Page should render (not show "Select at least 2 shots")
  await expect(page.locator('.comparison-page__graph')).toBeVisible({ timeout: 5000 })

  // The uPlot canvas should have been created
  const canvas = page.locator('.comparison-graph__canvas canvas')
  await expect(canvas).toBeVisible({ timeout: 5000 })

  // Verify the legend shows shot profile names
  const legends = page.locator('.comparison-graph__legend-label')
  await expect(legends).toHaveCount(2, { timeout: 3000 })
})

test('comparison page shows curve toggle buttons', async ({ page }) => {
  await loadApp(page)

  await navigateTo(page, '/shot-comparison?ids=shot-2026-02-13-100000,shot-2026-02-13-090000')
  await page.waitForTimeout(1500)

  // Curve toggle buttons should be visible
  await expect(page.locator('.comparison-page__toggle').nth(0)).toBeVisible()
  await expect(page.locator('.comparison-page__toggle').nth(1)).toBeVisible()
  await expect(page.locator('.comparison-page__toggle').nth(2)).toBeVisible()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- --grep "comparison page renders"`
Expected: FAIL — canvas won't be rendered because buildData() returns null (empty arrays).

- [ ] **Step 3: Extract normalizeShotData into shared utility**

Create `src/composables/useChartNormalize.js`:

```javascript
/**
 * Normalize shot data from any API format into flat arrays for charting.
 *
 * Handles three formats:
 * 1) Pre-flattened: { elapsed[], pressure[], flow[], weight[], ... }
 * 2) Measurements with nested machine/scale: { measurements: [{ machine: {...}, scale: {...} }] }
 * 3) Measurements flat: { measurements: [{ pressure, flow, weight, ... }] }
 *
 * Returns: { elapsed, pressure, targetPressure, flow, targetFlow,
 *            temperature, targetTemperature, weight, phaseMarkers }
 */
export function normalizeShotData(shot) {
  if (!shot) return null

  // Already in flat format — use directly
  if (shot.elapsed?.length) return shot

  // Measurements array format
  const measurements = shot.measurements
  if (!Array.isArray(measurements) || measurements.length === 0) return null

  const elapsed = []
  const pressure = []
  const targetPressure = []
  const flow = []
  const targetFlow = []
  const temperature = []
  const targetTemperature = []
  const weight = []

  // Determine base timestamp for elapsed time calculation
  const first = measurements[0]
  let baseTime = 0
  if (first.timestamp != null) {
    const parsed = typeof first.timestamp === 'string' ? new Date(first.timestamp).getTime() : Number(first.timestamp)
    baseTime = parsed > 1e12 ? parsed / 1000 : parsed
  }

  // Track profile frame changes for phase markers
  const phaseMarkers = []
  let lastFrame = null

  for (let i = 0; i < measurements.length; i++) {
    const m = measurements[i]

    // Calculate elapsed time
    let t = 0
    if (m.elapsed != null) {
      t = Number(m.elapsed)
    } else if (m.timestamp != null) {
      const parsed = typeof m.timestamp === 'string' ? new Date(m.timestamp).getTime() : Number(m.timestamp)
      const seconds = parsed > 1e12 ? parsed / 1000 : parsed
      t = seconds - baseTime
    } else {
      t = i * 0.1
    }
    elapsed.push(t)

    // Detect nested (machine/scale) vs flat entries
    const hasMachine = m.machine != null && typeof m.machine === 'object'
    const hasScale = m.scale != null && typeof m.scale === 'object'

    if (hasMachine) {
      const mc = m.machine
      pressure.push(mc.pressure ?? 0)
      targetPressure.push(mc.targetPressure ?? 0)
      flow.push(mc.flow ?? 0)
      targetFlow.push(mc.targetFlow ?? 0)
      temperature.push(mc.mixTemperature ?? mc.groupTemperature ?? 0)
      targetTemperature.push(mc.targetMixTemperature ?? mc.targetGroupTemperature ?? 0)

      const frame = mc.profileFrame
      if (frame != null && frame !== lastFrame) {
        const label = lastFrame == null ? 'Start' : `Frame ${frame}`
        phaseMarkers.push({ time: t, label })
        lastFrame = frame
      }
    } else {
      pressure.push(m.pressure ?? 0)
      targetPressure.push(m.targetPressure ?? 0)
      flow.push(m.flow ?? 0)
      targetFlow.push(m.targetFlow ?? 0)
      temperature.push(m.mixTemperature ?? m.temperature ?? m.groupTemperature ?? 0)
      targetTemperature.push(m.targetMixTemperature ?? m.targetTemperature ?? m.targetGroupTemperature ?? 0)

      const frame = m.profileFrame
      if (frame != null && frame !== lastFrame) {
        const label = lastFrame == null ? 'Start' : `Frame ${frame}`
        phaseMarkers.push({ time: t, label })
        lastFrame = frame
      }
    }

    if (hasScale) {
      weight.push(m.scale.weight ?? 0)
    } else {
      weight.push(m.weight ?? 0)
    }
  }

  if (elapsed.length > 0) {
    phaseMarkers.push({ time: elapsed[elapsed.length - 1], label: 'End' })
  }

  return {
    elapsed,
    pressure,
    targetPressure,
    flow,
    targetFlow,
    temperature,
    targetTemperature,
    weight,
    phaseMarkers: phaseMarkers.length > 1 ? phaseMarkers : (shot.phaseMarkers ?? []),
  }
}
```

- [ ] **Step 4: Update HistoryShotGraph.vue to use shared utility**

In `src/components/HistoryShotGraph.vue`, replace the local `normalizeShotData` function with an import:

Remove lines 38-148 (the entire `function normalizeShotData(shot) { ... }` block).

Add import at line 5:
```javascript
import { normalizeShotData } from '../composables/useChartNormalize.js'
```

- [ ] **Step 5: Update ComparisonGraph.vue to normalize shots**

In `src/components/ComparisonGraph.vue`, add import at line 2:
```javascript
import { normalizeShotData } from '../composables/useChartNormalize.js'
```

Then modify `buildData()` to normalize each shot before extracting arrays. Change lines 33-42:

```javascript
  const shotDatasets = props.shots.map(shot => {
    const flat = normalizeShotData(shot) || {}
    const elapsed = flat.elapsed ?? []
    for (const t of elapsed) allTimes.add(t)
    return {
      elapsed,
      pressure: flat.pressure ?? [],
      flow: flat.flow ?? [],
      weight: flat.weight ?? [],
    }
  })
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:e2e -- --grep "comparison page"`
Expected: PASS — charts render with data.

Also run existing tests to ensure no regressions:
Run: `npm run test:e2e`

- [ ] **Step 7: Commit**

```bash
git add src/composables/useChartNormalize.js src/components/HistoryShotGraph.vue src/components/ComparisonGraph.vue tests/e2e/shot-comparison.spec.js
git commit -m "fix: comparison charts now render shot data correctly

Extract normalizeShotData() into shared useChartNormalize.js utility.
ComparisonGraph now normalizes measurements-array format shots into
flat arrays before building the chart, matching HistoryShotGraph."
```

---

### Task 3: Brighten Ambient Glow Blobs (Visual)

**Files:**
- Modify: `src/pages/ScreensaverPage.vue` (CSS only)

- [ ] **Step 1: Increase blob opacity values**

In `src/pages/ScreensaverPage.vue`, update the radial-gradient alpha values from 0.3-0.45 to 0.6-0.75:

```
.screensaver__blob--green:   rgba(24, 195, 126, 0.45)  → rgba(24, 195, 126, 0.7)
.screensaver__blob--blue:    rgba(78, 133, 244, 0.35)  → rgba(78, 133, 244, 0.6)
.screensaver__blob--red:     rgba(233, 69, 96, 0.4)    → rgba(233, 69, 96, 0.65)
.screensaver__blob--brown:   rgba(162, 105, 61, 0.4)   → rgba(162, 105, 61, 0.65)
.screensaver__blob--green2:  rgba(24, 195, 126, 0.3)   → rgba(24, 195, 126, 0.55)
```

Also increase particle base opacity:
```
.screensaver__particle base: rgba(255, 255, 255, 0.2) → rgba(255, 255, 255, 0.35)
```

- [ ] **Step 2: Verify visually**

Start dev server, set screensaver type to "Ambient Glow" in settings, trigger sleep.
The blobs should now be noticeably brighter and more vivid.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ScreensaverPage.vue
git commit -m "style: brighten ambient glow screensaver blobs

Increase radial-gradient alpha values from 0.3-0.45 to 0.55-0.7
and particle base opacity from 0.2 to 0.35 for better visibility."
```

---

### Task 4: Fix Last Shot Screensaver Clock Visibility (Visual)

**Files:**
- Modify: `src/pages/ScreensaverPage.vue` (CSS only)

- [ ] **Step 1: Increase clock opacity**

In `src/pages/ScreensaverPage.vue`, update the `.screensaver__shot-clock` color:

```css
/* Line 347 */
color: rgba(255, 255, 255, 0.15);  →  color: rgba(255, 255, 255, 0.4);
```

Also increase the ambient glow clock:
```css
/* Line 498 */
color: rgba(255, 255, 255, 0.1);  →  color: rgba(255, 255, 255, 0.25);
```

- [ ] **Step 2: Verify visually**

Start dev server, set screensaver type to "Last Shot", trigger sleep.
The clock should now be clearly readable as a subtle background element.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ScreensaverPage.vue
git commit -m "style: increase screensaver clock visibility

Last-shot clock: 0.15 → 0.4 opacity
Ambient glow clock: 0.1 → 0.25 opacity"
```

---

### Task 5: Shot History Width-Aware Layout (Feature)

**Approach:** On screens wider than 960px, show a split layout: shot list on the left (~40%), shot detail with chart on the right (~60%). Clicking a shot loads it in the right panel instead of navigating away. On narrow screens, keep current behavior (navigate to ShotDetailPage). This follows the existing pattern from `VisualizerMultiImportPage`.

**Files:**
- Modify: `src/pages/ShotHistoryPage.vue`
- Modify: `src/assets/responsive.css` (if needed)

- [ ] **Step 1: Add selected shot state and inline detail panel**

In `src/pages/ShotHistoryPage.vue` `<script setup>`, add:

```javascript
import HistoryShotGraph from '../components/HistoryShotGraph.vue'
import PhaseSummaryPanel from '../components/PhaseSummaryPanel.vue'
import { getShot } from '../api/rest.js'

const selectedShot = ref(null)
const loadingDetail = ref(false)
const isWideLayout = ref(false)

let resizeObserver = null

function checkWidth() {
  isWideLayout.value = window.innerWidth >= 960
}

async function selectShot(shot) {
  if (!isWideLayout.value) {
    openShot(shot)
    return
  }
  const id = shot.id || shot.shotId
  if (!id) return
  loadingDetail.value = true
  try {
    const raw = await getShot(id)
    if (raw) {
      selectedShot.value = normalizeShot(raw)
    }
  } catch {
    selectedShot.value = null
  }
  loadingDetail.value = false
}
```

In `onMounted`, add width check:
```javascript
onMounted(() => {
  loadInitial()
  checkWidth()
  window.addEventListener('resize', checkWidth)
})
```

Add cleanup in a new `onUnmounted`:
```javascript
import { onMounted, onUnmounted } from 'vue'

onUnmounted(() => {
  window.removeEventListener('resize', checkWidth)
})
```

- [ ] **Step 2: Update template for split layout**

Wrap existing list and add detail panel:

```html
<div class="shot-history" :class="{ 'shot-history--wide': isWideLayout }">
  <div class="shot-history__main">
    <!-- existing filter, compare bar, shot list -->
    ...
  </div>

  <!-- Inline detail panel (wide layout only) -->
  <div v-if="isWideLayout" class="shot-history__detail">
    <div v-if="loadingDetail" class="shot-history__detail-loading">Loading...</div>
    <template v-else-if="selectedShot">
      <div class="shot-history__detail-graph">
        <HistoryShotGraph :shot="selectedShot" />
      </div>
      <div class="shot-history__detail-info">
        <span class="shot-history__detail-profile">
          {{ selectedShot.profileName || 'Unknown Profile' }}
        </span>
        <span class="shot-history__detail-meta">
          {{ formatDoseYield(selectedShot) }}
          <template v-if="selectedShot.duration"> · {{ formatDuration(selectedShot.duration) }}</template>
        </span>
      </div>
      <PhaseSummaryPanel :measurements="selectedShot?.measurements ?? []" />
    </template>
    <div v-else class="shot-history__detail-empty">Select a shot to preview</div>
  </div>
</div>
```

Update `onRowClick` to use `selectShot`:
```javascript
function onRowClick(shot, event) {
  if (event.detail >= 2) {
    openShot(shot)
    return
  }
  if (compareMode.value) {
    toggleSelect(shot)
  } else {
    selectShot(shot)
  }
}
```

- [ ] **Step 3: Add CSS for split layout**

```css
.shot-history--wide {
  flex-direction: row;
}

.shot-history--wide .shot-history__main {
  flex: 0 0 40%;
  max-width: 40%;
  border-right: 1px solid var(--color-border);
}

.shot-history__detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.shot-history__detail-graph {
  height: 300px;
  min-height: 200px;
  flex-shrink: 0;
  padding: 8px 16px;
}

.shot-history__detail-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 16px;
}

.shot-history__detail-profile {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
}

.shot-history__detail-meta {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

.shot-history__detail-loading,
.shot-history__detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}
```

- [ ] **Step 4: Write e2e test for wide layout**

Create `tests/e2e/shot-history-layout.spec.js`:

```javascript
import { test, expect } from '@playwright/test'

async function loadApp(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
}

async function navigateTo(page, path) {
  await page.evaluate((p) => {
    window.__vueRouter._skipDebounce = true
    return window.__vueRouter.push(p)
  }, path)
  await page.waitForTimeout(500)
}

test('wide viewport shows split layout with inline detail', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await loadApp(page)
  await navigateTo(page, '/history')
  await page.waitForTimeout(1500)

  // Should show wide layout
  await expect(page.locator('.shot-history--wide')).toBeVisible()
  await expect(page.locator('.shot-history__detail')).toBeVisible()

  // Click first shot row
  const firstRow = page.locator('.shot-history__row').first()
  await firstRow.click()
  await page.waitForTimeout(1000)

  // Detail panel should show the chart
  await expect(page.locator('.shot-history__detail-graph')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.shot-history__detail-profile')).toBeVisible()
})

test('narrow viewport navigates to detail page', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 })
  await loadApp(page)
  await navigateTo(page, '/history')
  await page.waitForTimeout(1500)

  // Should NOT show wide layout
  await expect(page.locator('.shot-history--wide')).not.toBeVisible()

  // Click first shot — should navigate to detail page
  const firstRow = page.locator('.shot-history__row').first()
  await firstRow.click()
  await page.waitForTimeout(1000)

  await expect(page.locator('.shot-detail')).toBeVisible({ timeout: 5000 })
})
```

- [ ] **Step 5: Run all tests**

Run: `npm run test:e2e`
Expected: All tests pass including new layout tests.

- [ ] **Step 6: Verify visually at different widths**

Test with dev server at 1200px, 960px, 800px, and 600px widths.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ShotHistoryPage.vue tests/e2e/shot-history-layout.spec.js
git commit -m "feat: shot history split layout on wide screens

On viewports >= 960px, show shot list (40%) and inline detail panel
(60%) with chart and phase summary. Narrow viewports keep the
existing navigate-to-detail behavior."
```

---

### Task 6: Fluid Dynamics Screensaver (Feature)

**Approach:** Add a new "Fluid" screensaver mode using Canvas 2D with a simplified Navier-Stokes fluid simulation. The simulation renders flowing color fields using the existing brand palette (green/blue/brown/red). Runs at ~30fps, GPU-friendly with minimal CPU overhead. Autonomous — no user interaction needed.

**Files:**
- Create: `src/components/FluidCanvas.vue`
- Modify: `src/pages/ScreensaverPage.vue` (add fluid mode)
- Modify: `src/components/settings/ScreensaverTab.vue` (add option)
- Modify: `src/composables/useSettings.js` (no change needed — screensaverType already supports any string value)

- [ ] **Step 1: Create FluidCanvas component**

Create `src/components/FluidCanvas.vue` — a self-contained Canvas 2D component that implements a grid-based fluid simulation:

- 64x64 simulation grid (downsampled from screen resolution)
- Velocity field with advection and diffusion
- Color field mapped to brand palette
- Autonomous sources that slowly drift, injecting color
- Bilinear interpolation for smooth upscaling to canvas
- `requestAnimationFrame` loop, capped at ~30fps
- Cleans up on unmount

The component should accept no props and emit no events — fully autonomous.

- [ ] **Step 2: Integrate into ScreensaverPage**

In `src/pages/ScreensaverPage.vue`:

Add import:
```javascript
import FluidCanvas from '../components/FluidCanvas.vue'
```

Add template section after ambient glow:
```html
<!-- Fluid Dynamics Mode -->
<div v-else-if="ssType === 'fluid'" class="screensaver__fluid">
  <FluidCanvas />
  <span class="screensaver__fluid-clock">{{ hours }}:{{ minutes }}</span>
</div>
```

Add CSS:
```css
.screensaver__fluid {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.screensaver__fluid-clock {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: var(--font-md);
  color: rgba(255, 255, 255, 0.25);
  font-variant-numeric: tabular-nums;
  z-index: 1;
}
```

- [ ] **Step 3: Add to screensaver settings**

In `src/components/settings/ScreensaverTab.vue`, add to `TYPES` array:

```javascript
{ value: 'fluid', label: 'Fluid', desc: 'Flowing colors with fluid dynamics' },
```

- [ ] **Step 4: Verify visually**

Set screensaver to "Fluid" in settings, trigger sleep. Observe smooth, organic color flow. Verify performance is acceptable (~30fps, low CPU).

- [ ] **Step 5: Commit**

```bash
git add src/components/FluidCanvas.vue src/pages/ScreensaverPage.vue src/components/settings/ScreensaverTab.vue
git commit -m "feat: add fluid dynamics screensaver mode

New Canvas 2D screensaver with grid-based fluid simulation using
brand palette colors. Autonomous color sources drift slowly,
producing organic flowing patterns at ~30fps."
```
