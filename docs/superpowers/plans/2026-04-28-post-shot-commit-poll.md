# Post-shot commit-poll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing `/shots/latest` commit-poll for every user on `StopReasonOverlay` dismiss, not only those with Visualizer credentials, so the user never lands on Home before the gateway has committed the just-finished shot.

**Architecture:** Refactor `App.vue#onStopReasonDismiss` so the poll body is shared. The visualizer-vs-home decision moves from "should we poll?" to "where do we go on commit?". One e2e test drives the full pouringDone → overlay-dismiss → poll → home flow with no Visualizer creds.

**Tech Stack:** Vue 3 + Vite SPA, Playwright e2e tests, mock REST + WS server in `tests/`.

**Spec:** `docs/superpowers/specs/2026-04-28-post-shot-commit-poll-design.md`

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/App.vue` | Modify | `onStopReasonDismiss()` always polls; visualizer status only chooses the destination on commit. |
| `tests/mock-server.js` | Modify | Add `/api/v1/test/shots-latest-count` (GET) and `/api/v1/test/inject-fresh-shot` (POST) helpers + a `latestShotGetCount` counter; reset hook. |
| `tests/e2e/post-shot-flow.spec.js` | Create | One test: no Visualizer creds → state goes idle from espresso → overlay → poll runs → home. |

---

## Task 1: Mock-server hooks for shot-poll testing

**Files:**
- Modify: `tests/mock-server.js`

The test needs three things from the mock server:
- A counter on `GET /api/v1/shots/latest` so we can assert "the poll actually ran".
- A way to inject a fresh shot id into `mockShotsData` / `mockShotIds` mid-test (simulating a new shot landing on the gateway).
- A reset endpoint for the counter and any injected ids.

- [ ] **Step 1: Add counter state**

In `tests/mock-server.js`, near other test-only state declarations (e.g. after `mockBeanBatches`), add:

```js
let latestShotGetCount = 0
const injectedShotIds = []
```

- [ ] **Step 2: Hook `/api/v1/shots/latest` to count and honor injected ids**

Find the existing handler:

```js
if (path === '/api/v1/shots/latest' && method === 'GET') {
  const latest = mockShotsData[mockShotIds[0]]
  return latest ? json(latest) : json({ error: 'No shots' }, 404)
}
```

Replace with:

```js
if (path === '/api/v1/shots/latest' && method === 'GET') {
  latestShotGetCount++
  // Injected ids take priority — most recent injection wins.
  const injectedId = injectedShotIds[injectedShotIds.length - 1]
  if (injectedId && mockShotsData[injectedId]) {
    return json(mockShotsData[injectedId])
  }
  const latest = mockShotsData[mockShotIds[0]]
  return latest ? json(latest) : json({ error: 'No shots' }, 404)
}
```

- [ ] **Step 3: Add test-only endpoints**

Just before or after the existing `/api/v1/test/reset-skin` handler, add:

```js
if (path === '/api/v1/test/shot-poll-state' && method === 'GET') {
  return json({ latestShotGetCount, injectedShotIds: [...injectedShotIds] })
}

if (path === '/api/v1/test/reset-shot-poll-state' && method === 'POST') {
  latestShotGetCount = 0
  for (const id of injectedShotIds) {
    if (id?.startsWith('shot-injected-')) delete mockShotsData[id]
  }
  injectedShotIds.length = 0
  return json({ ok: true })
}

if (path === '/api/v1/test/inject-fresh-shot' && method === 'POST') {
  // Simulate the gateway committing a fresh shot. Adds an entry to
  // mockShotsData and registers it as the new "latest". Honors a
  // body-supplied id; falls back to a generated one.
  const id = body?.id ?? ('shot-injected-' + Date.now())
  const shot = {
    id,
    timestamp: body?.timestamp ?? new Date().toISOString(),
    workflow: body?.workflow ?? { name: 'Injected', profile: { title: 'Test' } },
    measurements: body?.measurements ?? [],
    metadata: body?.metadata ?? {},
  }
  mockShotsData[id] = shot
  injectedShotIds.push(id)
  return json(shot, 201)
}
```

- [ ] **Step 4: Sanity check**

Run:
```
npm run test:e2e -- --list
```
Expected: 92 tests listed (89 pre-existing + 3 cross-device-refresh). The mock server module loads cleanly.

- [ ] **Step 5: Commit**

```bash
git add tests/mock-server.js
git commit -m "test(mock): add shot-poll test hooks (counter + fresh-shot injection)"
```

Use the standard `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` footer.

---

## Task 2: Failing e2e test

**Files:**
- Create: `tests/e2e/post-shot-flow.spec.js`

This test exercises the *natural* post-shot flow (state-watcher-driven), as opposed to existing tests that stop espresso via the back button. It clears Visualizer settings up front so the no-poll path is exercised.

- [ ] **Step 1: Write the test file**

Create `tests/e2e/post-shot-flow.spec.js` with:

```js
/**
 * E2E test for post-shot commit-poll on the non-Visualizer path.
 *
 * When the user finishes a shot without Visualizer credentials configured,
 * the app must still poll /api/v1/shots/latest before navigating home, so
 * that the home page's last-shot widget sees the just-committed record.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8080'

test.describe('Post-shot commit-poll', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${BASE_URL}/api/v1/test/reset-shot-poll-state`)
  })

  test('without Visualizer creds, poll runs before navigating home', async ({ page, request }) => {
    test.setTimeout(60_000)

    // Make sure no Visualizer creds are persisted from a previous run.
    await page.addInitScript(() => {
      try {
        // Strip any cached visualizer settings before app boot.
        for (const k of Object.keys(localStorage)) {
          if (k.toLowerCase().includes('visualizer')) localStorage.removeItem(k)
        }
      } catch {}
    })

    await page.goto('/')
    await page.waitForSelector('.status-bar', { timeout: 10_000 })
    await page.waitForSelector('.idle-page', { timeout: 5_000 })

    // Drive: idle -> espresso (substate progresses to pouring within ~150ms via mock).
    await request.put(`${BASE_URL}/api/v1/machine/state/espresso`)
    await expect(page.locator('.status-bar__state')).toHaveText('espresso', { timeout: 5_000 })
    await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 5_000 })

    // Let the espresso page settle (substate -> pouring).
    await page.waitForTimeout(500)

    // Drive: espresso -> idle. This triggers App.vue's state watcher to fire the
    // post-shot path: stopReasonVisible=true, then onStopReasonDismiss after 3s.
    await request.put(`${BASE_URL}/api/v1/machine/state/idle`)

    // The StopReasonOverlay shows for 3s. While it shows, the user is still on /espresso.
    // Right after dismiss, the always-on poll should kick in. Inject a "fresh" shot
    // 2s after state-change so the poll sees a new id rather than timing out.
    await page.waitForTimeout(2_000)
    await request.post(`${BASE_URL}/api/v1/test/inject-fresh-shot`, {
      data: { id: 'shot-injected-fresh-1' },
    })

    // After overlay dismiss + poll detects fresh id, navigation should land on '/'
    // (no Visualizer creds means no /shot-review/{id} branch).
    await expect(page).toHaveURL(/\/#\/$|\/$/, { timeout: 15_000 })
    await expect(page.locator('.idle-page')).toBeVisible({ timeout: 5_000 })

    // Assert the poll actually ran — i.e. /api/v1/shots/latest was queried at least
    // once after we cleared the counter (priorLatestShotId snapshot at espresso start
    // already calls it once; the post-shot poll should add at least one more).
    const stateRes = await request.get(`${BASE_URL}/api/v1/test/shot-poll-state`)
    const state = await stateRes.json()
    expect(state.latestShotGetCount).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run the test against the CURRENT code (should fail)**

Run:
```
npm run test:e2e -- tests/e2e/post-shot-flow.spec.js
```

Expected: **FAIL**. Without Visualizer creds, the current code calls `goHome()` immediately on overlay dismiss without polling, so the post-overlay `latestShotGetCount` increment from the poll never happens. The assertion `toBeGreaterThanOrEqual(2)` will fail at value 1 (only the espresso-start `priorLatestShotId` snapshot fired).

If by chance the test's URL assertion passes but the count assertion fails, that's the expected outcome and you're done with Step 2.

If the test fails for a *different* reason (e.g. selector misses, timing issues with `pouringDone`), iterate the test until it fails specifically on the `latestShotGetCount` assertion. Reasons to adjust:

- `.idle-page` not visible after navigation: confirm the PUT-idle path actually ends up on `/` in the current build (it might bounce through `/screensaver` if `lingerOnEspressoPage=false` — but `useSettings.js:63` defaults `lingerOnEspressoPage: true`, so the StopReasonOverlay path is the natural flow).
- `latestShotGetCount` is 0: the espresso-start `getLatestShot()` may have raced ahead of `reset-shot-poll-state`. Move the reset to BEFORE the page goto if so.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/e2e/post-shot-flow.spec.js
git commit -m "test(e2e): failing test for post-shot commit-poll on non-Visualizer path"
```

Use the standard Co-Authored-By footer.

---

## Task 3: Refactor `onStopReasonDismiss` to always poll

**Files:**
- Modify: `src/App.vue:441-499` (the `onStopReasonDismiss` function)

- [ ] **Step 1: Replace the function body**

Find the existing `onStopReasonDismiss` function in `src/App.vue` (currently around lines 441–499). Replace it with:

```js
function onStopReasonDismiss() {
  if (!stopReasonVisible.value) return // already dismissed by route change
  stopReasonVisible.value = false

  // Visualizer users land on /shot-review/{id} on commit; everyone else on /.
  // The poll itself runs in BOTH cases — we should never navigate away from
  // /espresso until the gateway has committed the just-finished shot (or we
  // hit the deadline).
  const wantsReview =
    !!settings.settings.visualizerUsername &&
    !!settings.settings.visualizerShowAfterShot

  const sessionStart = lastShotStartMs
  const baselineId = priorLatestShotId
  const deadline = Date.now() + LATEST_SHOT_POLL_TIMEOUT_MS
  const isFreshShot = (shot) => {
    if (!shot?.id) return false
    if (baselineId != null) return shot.id !== baselineId
    const ts = shot.timestamp ?? shot.date
    const shotMs = ts ? Date.parse(ts) : NaN
    if (Number.isFinite(shotMs) && sessionStart > 0) return shotMs >= sessionStart - 5000
    return true
  }

  const goHome = () => { if (route.path !== '/') router.push('/') }
  const goReview = (shot) => router.replace(`/shot-review/${encodeURIComponent(shot.id)}`)

  const poll = () => {
    if (route.path !== '/espresso') return // user navigated away
    getLatestShot().then(shot => {
      if (isFreshShot(shot)) {
        if (wantsReview) goReview(shot)
        else goHome()
        return
      }
      if (Date.now() >= deadline) { goHome(); return }
      setTimeout(poll, LATEST_SHOT_POLL_INTERVAL_MS)
    }).catch(() => {
      if (Date.now() >= deadline) goHome()
      else setTimeout(poll, LATEST_SHOT_POLL_INTERVAL_MS)
    })
  }
  poll()
}
```

Key changes from the old code:
- Removed the early-return guard `if (!visualizer || !showAfterShot) goHome()`.
- `wantsReview` boolean computed up front.
- The poll's success branch chooses `goReview` vs `goHome` based on `wantsReview`.
- The poll's timeout branch and error path always go home.

The `LATEST_SHOT_POLL_INTERVAL_MS` and `LATEST_SHOT_POLL_TIMEOUT_MS` constants stay as they are.

- [ ] **Step 2: Verify build**

Run:
```
npm run build
```
Expected: clean build, no errors or warnings.

- [ ] **Step 3: Run the failing test from Task 2 — should now PASS**

Run:
```
npm run test:e2e -- tests/e2e/post-shot-flow.spec.js
```
Expected: **1 passed**.

If it still fails:
- Check that `priorLatestShotId` is being captured at espresso start (line 370 in App.vue) — the espresso-start `getLatestShot()` should have set it before our `inject-fresh-shot` runs. If `priorLatestShotId === null`, `isFreshShot` falls through to the timestamp branch which may or may not detect freshness depending on the injected timestamp.
- Add `console.log` statements inside `poll()` for debugging only; remove before commit.

- [ ] **Step 4: Run the full e2e suite to confirm no regressions**

Run:
```
npm run test:e2e
```
Expected: 92/92 passing (or 91/92 if the user-workflow.spec.js EspressoPage flake we saw on 2026-04-26 recurs — that flake passes when run in isolation and is unrelated to this work).

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "fix(post-shot): always poll for commit before navigating, regardless of Visualizer"
```

Use the standard Co-Authored-By footer.

---

## Task 4: Version bump + manual smoke + tag

**Files:**
- Modify: `package.json` (version bump)

- [ ] **Step 1: Bump patch version**

In `package.json`, change `"version": "0.5.12"` to `"version": "0.5.13"`.

- [ ] **Step 2: Commit the bump**

```bash
git add package.json
git commit -m "chore: bump version to 0.5.13"
```

Use the standard Co-Authored-By footer.

- [ ] **Step 3: Manual smoke check (before tagging)**

Run `npm run dev`. With the dev gateway pointed at a real DE1 (or a mock that lets you trigger pouringDone naturally):

1. Confirm Visualizer creds are NOT set in Settings.
2. Run a real or simulated shot through to completion.
3. Observe the StopReasonOverlay → 3 s → page stays on `/espresso` momentarily while the poll runs → navigates to `/`.
4. Confirm the IdlePage's last-shot widget shows the just-finished shot (not the previous session's record).

If smoke fails (e.g. user navigates Home before commit), report — don't proceed to tag.

If the user does not have a real DE1 available, skip this step and note "smoke test deferred" in the report.

- [ ] **Step 4: Tag and push**

Wait for explicit user authorization before this step. The user already authorized the previous tag push (`v0.5.12`); ask whether to push `v0.5.13` as well, or hold for further changes (e.g. bundling Tasks 19–21 into a larger release).

If user authorizes:

```bash
git tag v0.5.13
git push origin main
git push origin v0.5.13
```

If user wants to hold the tag, just push the commits to `main`:

```bash
git push origin main
```

- [ ] **Step 5: Update Obsidian feedback list**

Notify the user that item #42 (linger longer) is shipped. The user owns updating `Professional/Decent/Passione.md` (mark item done, append session notes for 2026-04-28). Do **not** edit the Obsidian file as part of plan execution.

---

## Self-Review Checklist

- **Spec coverage:** ✅
  - "Always poll regardless of Visualizer settings" → Task 3 (function refactor).
  - "Visualizer users still land on /shot-review" → Task 3 (`wantsReview` branch).
  - "Bail if user navigated away" → Task 3 (preserved from existing code).
  - "Single new e2e test" → Task 2.
  - Mock-server hooks needed by the test → Task 1.
  - Version bump + smoke → Task 4.
- **Placeholder scan:** No TBD / TODO / vague steps. The smoke-test step explicitly allows "deferred" if the developer doesn't have a real DE1 — that's a real fork, not a placeholder.
- **Type consistency:** `wantsReview`, `goHome`, `goReview`, `poll`, `isFreshShot`, `LATEST_SHOT_POLL_INTERVAL_MS`, `LATEST_SHOT_POLL_TIMEOUT_MS` — names consistent across spec, plan, and the inline code blocks.
- **Test endpoint names:** `/api/v1/test/reset-shot-poll-state`, `/api/v1/test/shot-poll-state`, `/api/v1/test/inject-fresh-shot` — matches across Task 1 (definition) and Task 2 (use).
