# Post-shot commit-poll for non-visualizer users

**Date:** 2026-04-28
**Status:** Spec — pending implementation
**Tracking:** Passione feedback list (`Professional/Decent/Passione.md`, item: "linger on live shot a bit longer, so that the shot is definitely saved on server")

## Problem

After a shot ends and the `StopReasonOverlay` dismisses (3 s post-`pouringDone`), `App.vue#onStopReasonDismiss` decides where to navigate next. Today the logic is gated on whether the user has Visualizer credentials configured AND has opted in to `visualizerShowAfterShot`:

- **Visualizer configured + opted-in:** poll `/shots/latest` every 500 ms (up to a 4 s deadline) until a *fresh* shot id appears, then `router.replace('/shot-review/{id}')`. On timeout → `router.push('/')`.
- **Anything else:** `goHome()` immediately. **No commit-poll.**

The non-poll path causes a race: the gateway persists shots asynchronously, so the user can land on Home with the last-shot widget still showing the *previous* session's record. The fix is to run the same commit-poll for everyone; only the destination on commit differs.

## Goals

- Guarantee that the user does not navigate away from `/espresso` until the just-finished shot has been committed server-side (or a 4 s timeout has elapsed).
- Preserve the current Visualizer routing — visualizer users continue to land on `/shot-review/{id}`.
- Preserve the existing escape hatches: if the user manually navigates away (Home, Settings, Recipe Editor, etc.) the poll bails and does not hijack their navigation.

## Non-goals

- Increasing the `StopReasonOverlay` display window beyond the existing 3 s.
- Making the deadline user-configurable.
- Adding visible feedback ("waiting for server…") during the poll — the existing overlay → fade transition is enough cover for the typical commit latency.
- Polling for anything other than `/shots/latest` (no full shot-list refresh, no batches, no profiles).

## Approach

Refactor `onStopReasonDismiss` in `src/App.vue` so the poll body is shared. The visualizer-vs-home decision moves from "should we poll?" to "where do we go on commit?".

Pseudocode (final shape):

```js
function onStopReasonDismiss() {
  if (!stopReasonVisible.value) return
  stopReasonVisible.value = false

  const wantsReview =
    !!settings.settings.visualizerUsername &&
    !!settings.settings.visualizerShowAfterShot

  const sessionStart = lastShotStartMs
  const baselineId = priorLatestShotId
  const deadline = Date.now() + LATEST_SHOT_POLL_TIMEOUT_MS
  const isFreshShot = (shot) => { /* unchanged */ }

  const goHome = () => { if (route.path !== '/') router.push('/') }
  const goReview = (shot) => router.replace(`/shot-review/${encodeURIComponent(shot.id)}`)

  const poll = () => {
    if (route.path !== '/espresso') return // user navigated away — bail
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

Differences from the current code:

1. The early-return `if (!visualizer || !showAfterShot) goHome()` is removed.
2. `wantsReview` boolean computed once at function entry; used inside the poll's commit branch.
3. Both branches reach the same `goHome()` on timeout.

The `LATEST_SHOT_POLL_INTERVAL_MS` and `LATEST_SHOT_POLL_TIMEOUT_MS` constants stay as-is.

## Behavior matrix

| Visualizer creds + opt-in | Commit observed | Timeout reached | User navigated away mid-poll |
|---------------------------|-----------------|-----------------|------------------------------|
| Yes                       | `/shot-review/{id}` | `/`         | poll bails, no navigation    |
| No                        | `/`             | `/`             | poll bails, no navigation    |

## Components

### `src/App.vue` (modify)

- `onStopReasonDismiss()` only. Refactor as above.
- No new constants, no new imports, no new refs.
- Removed: the early `goHome()` return that skipped the poll.

## Data flow

1. Espresso ends → `pouringDone` fires → `lastShotStartMs` and `priorLatestShotId` were captured at espresso start.
2. `StopReasonOverlay` displays for 3 s.
3. Overlay dismiss → `onStopReasonDismiss()` runs.
4. Poll loop runs (always now, not gated by Visualizer settings).
5. On fresh shot → branch on `wantsReview`; navigate accordingly.
6. On 4 s deadline → `router.push('/')`.
7. On user-driven navigation → poll bails.

## Error handling

Same as today:
- `getLatestShot()` rejection → re-poll (or timeout-and-home).
- No fresh shot before deadline → home.
- User navigates away mid-poll → bail (no `router.push` from poll).

## Testing

One new e2e test, ideally added to whichever spec covers post-shot flow today (search `tests/e2e/` for the existing post-shot navigation tests; add to that file rather than creating a new one):

- Setup: visualizer creds **not** configured. Mock `/shots/latest` to return a stable baseline id for the first two polls, then a new id on the third.
- Action: drive a full shot (start espresso → pouringDone → wait for overlay dismiss).
- Assert:
  - The router does **not** navigate to `/` immediately on overlay dismiss.
  - The mock receives at least 2 calls to `/shots/latest`.
  - The router eventually lands on `/`.

Existing tests for the visualizer path should continue passing untouched (the `wantsReview` branch preserves their flow exactly).

## Out-of-scope but worth tracking

- **Configurable timeout / overlay duration.** Could be a setting, but the existing 4 s commit window has been field-tested via the Visualizer flow — same value is appropriate for the home flow.
- **Visible "waiting…" indicator.** Could be added if the 4 s feels invisible; defer until users notice.
- **Refreshing other entities (e.g., the IdlePage last-shot widget) on commit.** That widget already reads from the shots cache; if the user navigates home immediately after our poll confirms the commit, the widget should pick it up. If it doesn't, that's a separate fix.

## Sequencing

1. Refactor `onStopReasonDismiss` per the pseudocode above.
2. Update or add the e2e test as described.
3. Manual smoke: start a real shot without Visualizer creds; confirm Home shows the just-finished shot (not the previous one) on landing.
4. Ship as a patch release.
