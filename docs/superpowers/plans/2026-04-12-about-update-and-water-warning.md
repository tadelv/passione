# About Update & Water Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two small testing-feedback features: a "Check for updates" button on the About tab that reloads only when a new skin version actually landed, and a warning-only water level indicator on the screensaver ported from Decenza's WaterLevelItem thresholds.

**Architecture:** Feature 1 adds two thin REST wrappers and a stateful button in `AboutTab.vue` that compares the fetched skin version to the baked-in `__APP_VERSION__`. Feature 2 centralizes a `waterWarningState` computed in `App.vue` (provide/inject) and renders a new `ScreensaverWaterWarning` component conditionally inside `ScreensaverPage.vue`. Both features land in one branch, one commit per feature, behind e2e coverage against the existing mock server.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), vue-i18n, Playwright e2e, Node mock-server.js, existing `useWaterLevels()` composable, existing `sendCommand()` REST helper.

**Spec:** `docs/superpowers/specs/2026-04-12-about-update-and-water-warning-design.md`

---

## File Structure

**Files to create:**
- `src/components/ScreensaverWaterWarning.vue` — the warning-only indicator
- `tests/e2e/about-update.spec.js` — e2e for Feature 1
- `tests/e2e/water-warning.spec.js` — e2e for Feature 2

**Files to modify:**
- `src/api/rest.js` — add `checkForSkinUpdates()` and `getSkin()`
- `src/components/settings/AboutTab.vue` — add button + state machine + handler
- `src/i18n/locales/en.json` — add `about.update.*` keys
- `src/App.vue` — add `waterWarningState` computed + `provide()`
- `src/pages/ScreensaverPage.vue` — import + mount the new component
- `src/assets/theme.css` — add `--color-water-low`
- `tests/mock-server.js` — add `mockWaterLevels.refillLevel`, add skin endpoints, add test-only reset helper

---

## Task 1: Add REST helpers for skin update + skin metadata

**Files:**
- Modify: `src/api/rest.js` (end of file, near existing `getBuildInfo`)

- [ ] **Step 1: Add the two helpers**

At the end of `src/api/rest.js`, after the existing `getBuildInfo` block, add:

```js
// ---------------------------------------------------------------------------
// Skin update / metadata
// ---------------------------------------------------------------------------

export function checkForSkinUpdates() {
  return sendCommand('/api/v1/webui/skins/update', 'POST')
}

export function getSkin(id) {
  return sendCommand(`/api/v1/webui/skins/${encodeURIComponent(id)}`)
}
```

- [ ] **Step 2: Verify the file still parses**

Run: `npx vite build`
Expected: build succeeds without errors touching `rest.js`.

- [ ] **Step 3: Commit**

```bash
git add src/api/rest.js
git commit -m "feat(rest): add checkForSkinUpdates and getSkin helpers"
```

---

## Task 2: Extend mock server with skin endpoints and richer water levels

**Files:**
- Modify: `tests/mock-server.js` (mock data block around line 77, REST handler around line 275, test helper)

- [ ] **Step 1: Update the water level mock state**

Replace the existing `mockWaterLevels` object (around line 77) with:

```js
const mockWaterLevels = {
  currentLevel: 75,
  refillLevel: 0,
  warningThresholdPercentage: 10,
}
```

This preserves backward compatibility (existing consumers ignore `refillLevel`) while giving tests a key to manipulate. Production `useWaterLevels.js` already reads `data.refillLevel ?? refillLevel.value`.

- [ ] **Step 2: Add a `mockSkin` data block near the other mock data**

Add above `const mockProfiles` (around line 82):

```js
const mockSkin = {
  id: 'passione',
  name: 'Passione',
  version: '0.0.0-test',
  description: 'Mock skin for tests',
}

let mockSkinUpdateResponse = { message: 'Skin update check completed' }
```

- [ ] **Step 3: Add the skin REST handlers inside `handleApi`**

Find the REST router section (inside `handleApi` — look for the existing `webui` or `info` block, otherwise add before the 404 fallback). Add:

```js
// WebUI skins
if (path === '/api/v1/webui/skins/update' && method === 'POST') {
  return json(mockSkinUpdateResponse)
}
if (path.startsWith('/api/v1/webui/skins/') && method === 'GET') {
  const id = decodeURIComponent(path.slice('/api/v1/webui/skins/'.length))
  if (id === mockSkin.id) return json(mockSkin)
  return json({ error: 'not found' }, 404)
}
```

- [ ] **Step 4: Add test-only mutation endpoint for mockSkin.version**

Still inside `handleApi`, add:

```js
// Test-only: mutate skin version between requests
if (path === '/test/set-skin-version' && method === 'POST') {
  if (body?.version) mockSkin.version = body.version
  return json(mockSkin)
}

// Test-only: force skin update to fail
if (path === '/test/set-skin-update-error' && method === 'POST') {
  mockSkinUpdateResponse = null  // sentinel — handler below returns 500 when null
  return json({ ok: true })
}

// Test-only: reset skin state back to defaults
if (path === '/test/reset-skin' && method === 'POST') {
  mockSkin.version = '0.0.0-test'
  mockSkinUpdateResponse = { message: 'Skin update check completed' }
  return json({ ok: true })
}
```

Then update the earlier `/api/v1/webui/skins/update` handler to respect the sentinel:

```js
if (path === '/api/v1/webui/skins/update' && method === 'POST') {
  if (mockSkinUpdateResponse === null) return json({ error: 'mock failure' }, 500)
  return json(mockSkinUpdateResponse)
}
```

- [ ] **Step 5: Run the existing e2e suite to verify no regressions**

Run: `npm run test:e2e -- --reporter=line`
Expected: PASS (all existing 76 tests pass — this change is additive only).

- [ ] **Step 6: Commit**

```bash
git add tests/mock-server.js
git commit -m "test(mock): add skin update endpoints and refillLevel mock"
```

---

## Task 3: Add i18n keys for the update button

**Files:**
- Modify: `src/i18n/locales/en.json`

- [ ] **Step 1: Find the existing `about` section**

The key already exists at `settings.about` = "About". The new keys go under a new top-level `about` block (so they stay close to the AboutTab component's semantics rather than under `settings`).

- [ ] **Step 2: Add the `about` block**

Add a new `"about"` section at the top level of the JSON (alphabetical placement near `common`):

```json
  "about": {
    "update": {
      "check": "Check for updates",
      "checking": "Checking…",
      "updated": "Updated — reloading…",
      "current": "You're on the latest version",
      "error": "Update check failed"
    }
  },
```

- [ ] **Step 3: Verify JSON parses**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('src/i18n/locales/en.json','utf8'))" && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/en.json
git commit -m "i18n: add about.update strings"
```

---

## Task 4: Implement the Check-for-updates button in AboutTab

**Files:**
- Modify: `src/components/settings/AboutTab.vue`

- [ ] **Step 1: Update the `<script setup>` block**

Replace the existing `<script setup>` block (lines 1-15) with:

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getBuildInfo, checkForSkinUpdates, getSkin } from '../../api/rest.js'

const SKIN_ID = 'passione'
const { t } = useI18n()

const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
const buildInfo = ref(null)

// Update-check state machine: 'idle' | 'checking' | 'updated' | 'current' | 'error'
const updateState = ref('idle')
let resetTimer = null

async function handleCheckForUpdates() {
  if (updateState.value === 'checking') return
  updateState.value = 'checking'
  clearTimeout(resetTimer)

  try {
    await checkForSkinUpdates()
    const skin = await getSkin(SKIN_ID)
    const newVersion = skin?.version
    if (newVersion && newVersion !== appVersion) {
      updateState.value = 'updated'
      // Brief pause so the user sees the message, then reload with cache-busting
      setTimeout(() => {
        const url = window.location.pathname + '?v=' + Date.now() + window.location.hash
        window.location.href = url
      }, 800)
    } else {
      updateState.value = 'current'
      resetTimer = setTimeout(() => { updateState.value = 'idle' }, 3000)
    }
  } catch (_err) {
    updateState.value = 'error'
    resetTimer = setTimeout(() => { updateState.value = 'idle' }, 5000)
  }
}

onMounted(async () => {
  try {
    buildInfo.value = await getBuildInfo()
  } catch {
    // Gateway may not support /info yet
  }
})
</script>
```

- [ ] **Step 2: Add the button to the template**

Inside the `.about-tab__card` div, immediately after the existing Streamline-Bridge `<template v-if="buildInfo">` block, add:

```vue
      <div class="about-tab__divider" />
      <div class="about-tab__section">
        <button
          class="about-tab__update-btn"
          :disabled="updateState === 'checking'"
          :aria-busy="updateState === 'checking'"
          @click="handleCheckForUpdates"
          data-testid="check-for-updates"
        >
          <span v-if="updateState === 'idle'">{{ t('about.update.check') }}</span>
          <span v-else-if="updateState === 'checking'">{{ t('about.update.checking') }}</span>
          <span v-else-if="updateState === 'updated'">{{ t('about.update.updated') }}</span>
          <span v-else-if="updateState === 'current'">{{ t('about.update.current') }}</span>
          <span v-else>{{ t('about.update.error') }}</span>
        </button>
        <div
          v-if="updateState === 'current' || updateState === 'error'"
          class="about-tab__update-feedback"
          role="status"
          aria-live="polite"
        >
          {{ updateState === 'current' ? t('about.update.current') : t('about.update.error') }}
        </div>
      </div>
```

- [ ] **Step 3: Add the styles**

Append to the `<style scoped>` block (before the closing tag):

```css
.about-tab__update-btn {
  min-width: 200px;
  padding: 12px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.about-tab__update-btn:hover:not(:disabled) {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.about-tab__update-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.about-tab__update-feedback {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  margin-top: 4px;
}
```

- [ ] **Step 4: Build to catch syntax errors**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/AboutTab.vue
git commit -m "feat(about): add Check for updates button with version-diff reload"
```

---

## Task 5: E2E test for the Check-for-updates button

**Files:**
- Create: `tests/e2e/about-update.spec.js`

- [ ] **Step 1: Write the three-case test**

Create `tests/e2e/about-update.spec.js`:

```js
/**
 * E2E tests for the About tab Check-for-updates button.
 *
 * Flow A (button-local state + spinner) and Flow C (version-diff reload)
 * per docs/superpowers/specs/2026-04-12-about-update-and-water-warning-design.md
 */
import { test, expect } from '@playwright/test'

async function loadAbout(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  await page.evaluate(() => window.__vueRouter.push('/settings'))
  await page.waitForTimeout(300)
  // Click the About tab
  await page.getByRole('button', { name: /About/i }).click()
  await page.waitForSelector('[data-testid="check-for-updates"]')
}

async function resetMockSkin(request) {
  await request.post('http://localhost:8080/test/reset-skin')
}

test.describe('About tab — Check for updates', () => {
  test.beforeEach(async ({ request }) => {
    await resetMockSkin(request)
  })

  test('no update available — shows current message and does not reload', async ({ page, request }) => {
    // Mock skin version equals the built app version (uses the test build's __APP_VERSION__)
    await loadAbout(page)

    // Read the current __APP_VERSION__ from the live app and set mock to match
    const appVersion = await page.evaluate(() => window.__APP_VERSION__ ?? '0.0.0')
    await request.post('http://localhost:8080/test/set-skin-version', {
      data: { version: appVersion },
    })

    const btn = page.locator('[data-testid="check-for-updates"]')
    await btn.click()

    // Current-state message appears
    await expect(btn).toContainText(/latest version/i, { timeout: 5000 })
    // And the button returns to idle after ~3s
    await expect(btn).toContainText(/Check for updates/i, { timeout: 5000 })

    // URL has NOT changed (no reload/no cache-busting query)
    expect(page.url()).not.toMatch(/\?v=\d+/)
  })

  test('update available — shows updated message and reloads with cache-busting', async ({ page, request }) => {
    await loadAbout(page)

    // Set mock skin to a version different from __APP_VERSION__
    await request.post('http://localhost:8080/test/set-skin-version', {
      data: { version: '99.99.99' },
    })

    const btn = page.locator('[data-testid="check-for-updates"]')
    const navigationPromise = page.waitForURL(/\?v=\d+/, { timeout: 5000 })
    await btn.click()
    await expect(btn).toContainText(/Updated/i, { timeout: 2000 })
    await navigationPromise
    expect(page.url()).toMatch(/\?v=\d+/)
  })

  test('server error — shows error message and re-enables button', async ({ page, request }) => {
    await loadAbout(page)

    // Force the update endpoint to 500
    await request.post('http://localhost:8080/test/set-skin-update-error')

    const btn = page.locator('[data-testid="check-for-updates"]')
    await btn.click()

    await expect(btn).toContainText(/Update check failed/i, { timeout: 5000 })
    // Error auto-clears after ~5s
    await expect(btn).toContainText(/Check for updates/i, { timeout: 7000 })
    // Button re-enabled
    await expect(btn).toBeEnabled()
  })
})
```

- [ ] **Step 2: Expose `__APP_VERSION__` on window for the test**

The test reads `window.__APP_VERSION__`. Add this exposure in `src/main.js` or wherever the app is bootstrapped. Grep first to find the right place:

Run: `grep -n "__APP_VERSION__" src/main.js 2>/dev/null || grep -rn "__APP_VERSION__" src/`

If nothing in `src/main.js`, add a single line near the top of `src/main.js`:

```js
if (typeof __APP_VERSION__ !== 'undefined') window.__APP_VERSION__ = __APP_VERSION__
```

- [ ] **Step 3: Run the new tests**

Run: `npm run test:e2e -- tests/e2e/about-update.spec.js --reporter=line`
Expected: 3 tests PASS.

If any fail, inspect the failure: the most likely causes are (a) the About tab button selector doesn't match the rendered tab label (adjust `getByRole('button', { name: /About/i })` to match the actual settings tabs pattern in the codebase — look at `src/pages/SettingsPage.vue` for the pattern), or (b) the mock server endpoints aren't reached (verify with `curl http://localhost:8080/test/reset-skin -X POST` while `npm run preview` runs against the mock).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/about-update.spec.js src/main.js
git commit -m "test: e2e coverage for About Check for updates button"
```

---

## Task 6: Add `waterWarningState` computed + provide in App.vue

**Files:**
- Modify: `src/App.vue` (near the existing `waterLevelDisplay` computed around line 89)

- [ ] **Step 1: Add the computed below the existing water level computeds**

Find the block that ends with `provide('waterLevelPercent', waterLevelPercent)` (around line 101). Directly before that `provide` line, add:

```js
const SENSOR_OFFSET_MM = 5  // sensor mounted above intake (from Decenza WaterLevelItem.qml)

const waterWarningState = computed(() => {
  if (!waterLevels.isConnected.value) return 'ok'
  const current = waterLevels.currentLevel.value
  const refill = waterLevels.refillLevel.value
  // margin = raw water - raw refill (Decenza formula; verify against hardware on first run)
  const margin = current - SENSOR_OFFSET_MM - refill
  if (margin > 7) return 'ok'
  if (margin > 5) return 'low'
  if (margin > 3) return 'warning'
  return 'critical'
})
```

- [ ] **Step 2: Provide it**

Add directly after the existing `provide('waterLevelPercent', waterLevelPercent)`:

```js
provide('waterWarningState', waterWarningState)
```

- [ ] **Step 3: Verify Vue imports**

`computed` is already imported in App.vue (it's used for `waterLevelDisplay`). No new import needed.

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.vue
git commit -m "feat(app): provide waterWarningState computed for screensaver reuse"
```

---

## Task 7: Add `--color-water-low` CSS variable

**Files:**
- Modify: `src/assets/theme.css`

- [ ] **Step 1: Find the color custom properties block**

Run: `grep -n "color-warning\|color-error" src/assets/theme.css | head -5`

The file has a block defining `--color-warning` and `--color-error`. Add a sibling variable.

- [ ] **Step 2: Add the new variable**

Locate the block (inside the `:root` or equivalent declaration) and add right after `--color-warning`:

```css
  --color-water-low: #c89b3c;
```

- [ ] **Step 3: Verify the CSS parses**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/assets/theme.css
git commit -m "feat(theme): add --color-water-low token for water warning indicator"
```

---

## Task 8: Create the ScreensaverWaterWarning component

**Files:**
- Create: `src/components/ScreensaverWaterWarning.vue`

- [ ] **Step 1: Write the component**

Create `src/components/ScreensaverWaterWarning.vue`:

```vue
<script setup>
import { computed, inject } from 'vue'

const warningState = inject('waterWarningState', null)

const label = computed(() => {
  switch (warningState?.value) {
    case 'low': return 'LOW'
    case 'warning': return 'REFILL SOON'
    case 'critical': return 'REFILL NOW'
    default: return ''
  }
})

const visible = computed(() => {
  const s = warningState?.value
  return s === 'low' || s === 'warning' || s === 'critical'
})

const stateClass = computed(() => {
  const s = warningState?.value
  if (s === 'low') return 'ssww--low'
  if (s === 'warning') return 'ssww--warning'
  if (s === 'critical') return 'ssww--critical'
  return ''
})
</script>

<template>
  <div
    v-if="visible"
    class="ssww"
    :class="stateClass"
    role="status"
    aria-live="polite"
    data-testid="screensaver-water-warning"
  >
    <svg class="ssww__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 C 8 10, 5 14, 5 17 A 7 7 0 0 0 19 17 C 19 14, 16 10, 12 3 Z" fill="currentColor" />
    </svg>
    <span class="ssww__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.ssww {
  position: absolute;
  top: 16px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  font-size: var(--font-md);
  font-weight: 700;
  letter-spacing: 0.08em;
  z-index: calc(var(--z-overlay) + 1);
  pointer-events: none;
  animation: ssww-blink var(--ssww-interval, 2000ms) ease-in-out infinite;
}

.ssww__icon {
  width: 16px;
  height: 16px;
}

.ssww--low {
  color: var(--color-water-low);
  --ssww-interval: 2000ms;
}

.ssww--warning {
  color: var(--color-warning);
  --ssww-interval: 1000ms;
}

.ssww--critical {
  color: var(--color-error);
  --ssww-interval: 500ms;
}

@keyframes ssww-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
</style>
```

- [ ] **Step 2: Build to verify syntax**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ScreensaverWaterWarning.vue
git commit -m "feat(screensaver): add ScreensaverWaterWarning component"
```

---

## Task 9: Mount the component inside ScreensaverPage

**Files:**
- Modify: `src/pages/ScreensaverPage.vue`

- [ ] **Step 1: Import the component**

In the `<script setup>` block, near the existing component imports (around line 5), add:

```js
import ScreensaverWaterWarning from '../components/ScreensaverWaterWarning.vue'
```

- [ ] **Step 2: Mount it inside the root `.screensaver` div**

In the template, immediately after the opening `<div class="screensaver" ...>` (around line 104), BEFORE the first mode-specific content block, add:

```vue
    <ScreensaverWaterWarning v-if="ssType !== 'disabled'" />
```

- [ ] **Step 3: Build to verify**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ScreensaverPage.vue
git commit -m "feat(screensaver): mount water warning indicator on all modes except disabled"
```

---

## Task 10: E2E test for the water warning indicator

**Files:**
- Create: `tests/e2e/water-warning.spec.js`

- [ ] **Step 1: Write the test**

Create `tests/e2e/water-warning.spec.js`:

```js
/**
 * E2E tests for the screensaver water warning indicator.
 *
 * The mock WebSocket sends `mockWaterLevels` once on connect, so each
 * state case sets the mock via POST and then navigates (new route load
 * opens a fresh WebSocket connection).
 *
 * Formula ported from Decenza WaterLevelItem.qml:
 *   margin = currentLevel - 5 (sensor offset) - refillLevel
 *   > 7 ok, > 5 low, > 3 warning, else critical
 */
import { test, expect } from '@playwright/test'

async function setWaterLevels(request, currentLevel, refillLevel) {
  await request.post('http://localhost:8080/api/v1/machine/waterLevels', {
    data: { currentLevel, refillLevel },
  })
}

async function openScreensaver(page) {
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  await page.evaluate(() => window.__vueRouter.push('/screensaver'))
  await page.waitForSelector('.screensaver', { timeout: 5000 })
  // Give the WebSocket a moment to deliver initial water-levels snapshot
  await page.waitForTimeout(300)
}

test.describe('Screensaver water warning', () => {
  test.afterEach(async ({ request }) => {
    // Reset water levels to default ok state
    await setWaterLevels(request, 75, 0)
  })

  test('ok state — indicator is not rendered', async ({ page, request }) => {
    await setWaterLevels(request, 75, 0)  // margin = 75 - 5 - 0 = 70 → ok
    await openScreensaver(page)
    await expect(page.locator('[data-testid="screensaver-water-warning"]')).toHaveCount(0)
  })

  test('low state — shows LOW label', async ({ page, request }) => {
    await setWaterLevels(request, 16, 5)  // margin = 16 - 5 - 5 = 6 → low
    await openScreensaver(page)
    const warning = page.locator('[data-testid="screensaver-water-warning"]')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('LOW')
    await expect(warning).toHaveClass(/ssww--low/)
  })

  test('warning state — shows REFILL SOON label', async ({ page, request }) => {
    await setWaterLevels(request, 14, 5)  // margin = 14 - 5 - 5 = 4 → warning
    await openScreensaver(page)
    const warning = page.locator('[data-testid="screensaver-water-warning"]')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('REFILL SOON')
    await expect(warning).toHaveClass(/ssww--warning/)
  })

  test('critical state — shows REFILL NOW label', async ({ page, request }) => {
    await setWaterLevels(request, 8, 5)  // margin = 8 - 5 - 5 = -2 → critical
    await openScreensaver(page)
    const warning = page.locator('[data-testid="screensaver-water-warning"]')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('REFILL NOW')
    await expect(warning).toHaveClass(/ssww--critical/)
  })

  test('disabled screensaver mode — indicator not rendered even when critical', async ({ page, request }) => {
    await setWaterLevels(request, 8, 5)  // critical
    await page.goto('/')
    await page.waitForSelector('.status-bar')
    // Set screensaver type to disabled via the settings KV store
    await page.evaluate(async () => {
      await fetch('/api/v1/store/decenza-js/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screensaverType: 'disabled' }),
      })
    })
    await page.evaluate(() => window.__vueRouter.push('/screensaver'))
    await page.waitForSelector('.screensaver', { timeout: 5000 })
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="screensaver-water-warning"]')).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npm run test:e2e -- tests/e2e/water-warning.spec.js --reporter=line`
Expected: 5 tests PASS.

Likely debug spots if anything fails:
1. **`setWaterLevels` doesn't reach the composable** — the mock server already supports the POST, but the composable reads via WebSocket push-on-connect. Verify by watching the browser console for the initial water level message.
2. **Screensaver type setting route** — the mock KV store may use a different path. Grep the existing test files and mock-server for the `decenza-js/settings` path and adjust if needed.
3. **Formula off by one** — if low/warning/critical fire at the wrong thresholds, it's likely the `SENSOR_OFFSET_MM` subtraction. Remove it from the App.vue formula and re-run — see the verification note in the spec.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/water-warning.spec.js
git commit -m "test: e2e coverage for screensaver water warning indicator"
```

---

## Task 11: Run the full suite and push

**Files:** None

- [ ] **Step 1: Run all e2e tests**

Run: `npm run test:e2e -- --reporter=line`
Expected: all tests pass (76 existing + 3 new About tests + 5 new water-warning tests = 84 total).

- [ ] **Step 2: Run build one last time**

Run: `npm run build`
Expected: clean production build with no errors or warnings related to the new code.

- [ ] **Step 3: Manual smoke test (if dev machine is connected to a gateway)**

```bash
npm run dev
```

Visit `/settings` → About tab → click **Check for updates**. On a real gateway with no update, expect the "You're on the latest version" message and no reload. Navigate to `/screensaver` with a full tank (the indicator is not shown). If you can simulate a low tank in the gateway, verify the indicator appears with the correct label and cadence.

- [ ] **Step 4: Final commit if any fixups were needed, then report**

Report back to the user with a summary of the two features shipped, test count, and confirmation that the parked screensaver/power decoupling work was not touched.

---

## Self-review

**Spec coverage check:**

- [x] About button click → spinner → version diff → reload or current message — Tasks 1, 4, 5
- [x] Error path shows inline error and re-enables button — Task 4 step 1, Task 5 error test
- [x] `checkForSkinUpdates()` + `getSkin()` REST helpers — Task 1
- [x] Five i18n keys under `about.update.*` — Task 3
- [x] Hardcoded `SKIN_ID = 'passione'` constant — Task 4 step 1
- [x] `waterWarningState` computed centralized in App.vue + provided — Task 6
- [x] Decenza thresholds 7/5/3 + sensor offset 5mm — Task 6
- [x] `ScreensaverWaterWarning.vue` component with labels LOW / REFILL SOON / REFILL NOW — Task 8
- [x] Blink cadence 2000 / 1000 / 500 ms via CSS custom property — Task 8
- [x] Theme token `--color-water-low` — Task 7
- [x] Absolute positioning top-right — Task 8 styles
- [x] Mounted in ScreensaverPage for all modes except disabled — Task 9
- [x] E2E coverage for both features — Tasks 5, 10
- [x] Parked decoupling work is NOT touched — enforced by not listing those files in any task, and by the test in Task 10 not calling `setMachineState`

**Placeholder scan:** No "TBD" / "implement later" / "similar to Task N" / "add appropriate error handling" language. Every step has exact code or exact commands.

**Type consistency:** `warningState` / `waterWarningState` is the provide/inject key name, consistently used in Task 6 and Task 8. The CSS class prefix `ssww--` is consistently used across the component template and stylesheet. The data-testid `screensaver-water-warning` is used in both Task 8 (component) and Task 10 (tests).

**Out-of-scope guard:** No task touches `App.vue:247`, `App.vue:277-279`, `ScreensaverPage.vue:57`, or `LayoutWidget.vue:227`. These are reserved for the parked decoupling work.
