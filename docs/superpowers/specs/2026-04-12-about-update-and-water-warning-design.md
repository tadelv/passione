# About Tab Update Check + Screensaver Water Warning

**Date:** 2026-04-12
**Origin:** Testing feedback round 2 (see `professional/decent/passione.md`)
**Scope:** Two small, independent features bundled for convenience. A third item from the same feedback round — screensaver/power decoupling — is parked with full context in `docs/deferred/screensaver-machine-decoupling.md`.

## Summary

1. **About tab — Check for updates button.** A button on `AboutTab.vue` that triggers Streamline-Bridge's skin-update API, detects whether the installed version actually changed, and reloads the page only when a new version was installed.
2. **Screensaver — water warning indicator.** An ambient indicator that is invisible while water is OK and appears only when the water level reaches `low` / `warning` / `critical` states — ported from Decenza's `WaterLevelItem.qml` thresholds and blink cadence. Positioned at the top-right of `ScreensaverPage.vue`, visible across all modes except `disabled`.

Both features share one commit and one spec because each is a handful of file changes with no shared state. Bundling avoids overhead from two separate spec → plan cycles.

---

## Feature 1 — About tab "Check for updates" button

### Goal

Give the user a one-tap way to pull the latest Passione build from the gateway without an SSH session or curl. The button should tell the truth: reload when there's a new version, and say "up to date" when there isn't.

### API

`POST /api/v1/webui/skins/update` — triggers an update check for all installed skins. Response body is `{ message: string }` only — it does not report whether anything actually changed. `vendor/reaprime/assets/api/rest_v1.yml:2492`.

`GET /api/v1/webui/skins/{id}` — returns the full `WebUISkin` object, which includes the installed version. `vendor/reaprime/assets/api/rest_v1.yml:2256`. Used to detect whether an update landed.

### Interaction flow

1. User clicks **Check for updates** button on the About tab.
2. Button enters `checking` state: spinner icon + label text changes to *Checking…*. The button is disabled while in this state.
3. Client calls `POST /api/v1/webui/skins/update`, awaits completion.
4. Client calls `GET /api/v1/webui/skins/passione` to read the now-installed version.
5. Client compares the fetched `version` to the baked-in `__APP_VERSION__` (already in scope in `AboutTab.vue:5`).
   - **Versions differ** → button enters `updated` state (*Updated — reloading…*), waits a beat so the user sees the message, then reloads the page with a cache-busting query param: `window.location.href = window.location.pathname + '?v=' + Date.now() + window.location.hash`. The hash is preserved so the user lands back on the same route.
   - **Versions match** → button enters `current` state (*You're on the latest version*) for 3 seconds, then returns to `idle`.
6. On any error (network, non-2xx response, missing skin metadata): button returns to `idle` and shows inline error text (`Update check failed`) for 5 seconds. No toast — the About card layout is already a self-contained surface and inline feedback stays visually consistent with the rest of the card.

### UI details

- Button is placed below the existing Streamline-Bridge build-info block (inside the same `.about-tab__card`), separated by an `.about-tab__divider`.
- Style matches existing secondary buttons in settings (muted background, primary accent on hover). No new CSS patterns.
- Label and states are i18n-ready via `vue-i18n` keys:
  - `about.update.check` — "Check for updates"
  - `about.update.checking` — "Checking…"
  - `about.update.updated` — "Updated — reloading…"
  - `about.update.current` — "You're on the latest version"
  - `about.update.error` — "Update check failed"
- Accessible: button has `aria-busy` during the `checking` state so screen readers announce the async action. State messages live in an `aria-live="polite"` region so they're announced on change.

### New API helpers (`src/api/rest.js`)

Two thin wrappers:

```js
export function checkForSkinUpdates() {
  return sendCommand('/api/v1/webui/skins/update', 'POST')
}

export function getSkin(id) {
  return sendCommand(`/api/v1/webui/skins/${id}`)
}
```

Both reuse the existing `sendCommand` helper. No error transformation — errors bubble up to the component, which handles them locally.

### Skin ID resolution

The skin ID is `passione` (matches `manifest.json`). Hardcoded as a module-level constant in `AboutTab.vue` for clarity. If we ever rename the skin, this is a one-line change and no worse than hardcoding `__APP_VERSION__`.

### Files changed

- `src/components/settings/AboutTab.vue` — add button, states, handlers, styles.
- `src/api/rest.js` — add `checkForSkinUpdates()` and `getSkin()` helpers.
- `src/i18n/locales/en.json` — add the five new i18n keys under `about.update.*`.

### Out of scope

- **Auto-update on app launch.** Not in this spec. The button is manual by design.
- **Version-diff display.** We could show "0.4.1 → 0.4.2" on successful update, but that requires tracking the before-version before the POST. One extra API call for limited user value — YAGNI unless requested.

---

## Feature 2 — Screensaver water warning indicator

### Goal

When water is about to run out, the user should know *before* walking up to the machine for a morning shot. The indicator lives on the screensaver because that's the only thing on-screen when the user glances at the machine from across the room.

### Behavior

- **Invisible when water is OK.** Zero DOM, zero visual noise. The artistic screensaver modes (ambient glow, fluid, Game of Life) stay pristine.
- **Visible only when water state is `low`, `warning`, or `critical`.** Appears at the top-right of the screensaver, across all modes except `disabled` (which renders a black screen and intentionally shows nothing).
- **Blinks at Decenza's exact cadence**: `low` = 2000 ms, `warning` = 1000 ms, `critical` = 500 ms. Blink is a smooth opacity fade between the warning color and `rgba(255,255,255,0.15)` (not a hard on/off) — this matches the "warmth without whimsy" design principle.

### Label content

- Water-drop glyph + short text label:
  - `low` → **"LOW"**
  - `warning` → **"REFILL SOON"**
  - `critical` → **"REFILL NOW"**
- No raw number (per the user feedback: "I don't care about the number at 3am, I care that it's amber"). Also avoids the mm-vs-ml unit question.
- Colors use existing theme tokens:
  - `low` — `color: var(--color-text-secondary)` with amber tint (new CSS custom property `--color-water-low` added to theme: `#c89b3c`)
  - `warning` — `color: var(--color-warning)`
  - `critical` — `color: var(--color-error)`

### State calculation

The warning state is computed centrally and provided to the screensaver — not computed in the screensaver component itself. Rationale: the same state may later be reused by `StatusBar.vue` (which currently shows the raw number and could color-shift when not OK). Centralizing it avoids duplication.

Formula ported from `vendor/decenza/qml/components/layout/items/WaterLevelItem.qml:19-27`:

```js
const SENSOR_OFFSET_MM = 5  // sensor mounted above intake

const waterWarningState = computed(() => {
  if (!waterLevels.isConnected.value) return 'ok'  // avoid false "critical" on startup
  const current = waterLevels.currentLevel.value
  const refill = waterLevels.refillLevel.value
  // Decenza: margin = waterLevelMm - sensorOffset - waterRefillPoint = rawSensorMm - waterRefillPoint
  // ReaPrime's /ws/v1/machine/waterLevels semantics to be confirmed during implementation:
  //   - If currentLevel already includes the offset and refillLevel is raw → subtract offset
  //   - If both are raw (or both adjusted) → direct subtraction
  // Default to the Decenza formula verbatim; adjust in implementation if the values look wrong.
  const margin = current - SENSOR_OFFSET_MM - refill
  if (margin > 7) return 'ok'
  if (margin > 5) return 'low'
  if (margin > 3) return 'warning'
  return 'critical'
})
```

This lives in `App.vue` and is `provide()`'d under the key `waterWarningState`. Any component that needs it can `inject('waterWarningState')`.

**Implementation verification note:** the first ReaPrime unit readings seen in-dev should be compared against the physical tank state. If `margin` is consistently off by exactly `SENSOR_OFFSET_MM`, the offset subtraction is redundant and should be removed. This is a one-line fix and does not change the spec.

### New component — `src/components/ScreensaverWaterWarning.vue`

- Injects `waterWarningState` from App.vue.
- Renders nothing when state is `ok` (`v-if="warningState !== 'ok'"`).
- Single template: inline SVG drop icon + label text.
- CSS keyframes animation per state, using the Decenza cadence values. CSS variables drive the interval so state changes swap animation speed cleanly.
- Absolute-positioned at top-right of its parent (the `.screensaver` element), with `top: 16px; right: 24px;`. Uses `z-index: var(--z-overlay) + 1` to sit above all screensaver modes.
- Accessible: `role="status"` and `aria-live="polite"` so a state change is announced once; label text is the machine-readable source.

### ScreensaverPage integration

`src/pages/ScreensaverPage.vue` imports and mounts the new component as a direct child of the root `.screensaver` element, sibling to the mode-specific content. One line of template:

```vue
<ScreensaverWaterWarning v-if="ssType !== 'disabled'" />
```

The `disabled` exclusion matches the existing "screen goes black" intent of that mode.

### Files changed

- `src/App.vue` — add `waterWarningState` computed and `provide()` call.
- `src/components/ScreensaverWaterWarning.vue` — new component.
- `src/pages/ScreensaverPage.vue` — import and mount the new component.
- `src/assets/theme.css` — add `--color-water-low` CSS custom property.

### Out of scope (this spec)

- **Sound alarm.** Not requested.
- **StatusBar color shift.** Mentioned above as a potential future enhancement; hook is in place via the provided state.
- **Configurable thresholds.** Decenza's margins (7/5/3 mm) are baked in. If users want to tune them, that's a separate spec.

---

## Testing

Both features get Playwright e2e coverage in the existing `tests/e2e/` structure.

### Feature 1 — Check for updates

Use mock-server responses to cover all three outcomes:

1. **Happy path — update available.** Mock `POST /api/v1/webui/skins/update` → 200. Mock `GET /api/v1/webui/skins/passione` → `{ version: '0.5.0' }` (different from test build's `__APP_VERSION__`). Click button. Verify button shows *Updated — reloading…* then the page reloads (Playwright `page.waitForNavigation`).
2. **No update available.** Mock `POST` → 200. Mock `GET` → `{ version: <same as __APP_VERSION__> }`. Click button. Verify *You're on the latest version* appears and disappears after ~3 s. Verify page does not reload.
3. **Error path.** Mock `POST` → 500. Click button. Verify inline error *Update check failed* appears for ~5 s. Verify button is re-enabled after.

### Feature 2 — Water warning indicator

Mock the `/ws/v1/machine/waterLevels` WebSocket to push controlled `currentLevel` / `refillLevel` pairs. Visit `/screensaver`.

1. **OK state — indicator hidden.** Push `{ currentLevel: 30, refillLevel: 10 }` (margin 15 after offset → ok). Assert the `.screensaver-water-warning` element is not present in the DOM.
2. **Low state.** Push values producing margin ≈ 6. Assert the element exists, shows *LOW*, and has the low-state class applied.
3. **Warning state.** Push margin ≈ 4. Assert *REFILL SOON*.
4. **Critical state.** Push margin ≈ 2. Assert *REFILL NOW*.
5. **Disabled screensaver.** Switch `screensaverType` to `disabled`, push a critical value. Assert the indicator is not rendered (the whole mode is intentionally blank).
6. **Transition back to OK.** From a critical state, push a full tank. Assert the element unmounts.

No tests for the blink animation itself — CSS animations are validated visually; timing-based assertions would be flaky and provide little value beyond verifying that the `@keyframes` selector exists.

---

## Non-goals / explicitly deferred

- **Screensaver/power decoupling** (feedback item 4) — parked with full context in `docs/deferred/screensaver-machine-decoupling.md`. Do not touch `App.vue:247` or `App.vue:277-279` in this spec's implementation. Do not touch the `wake()` function in `ScreensaverPage.vue:57`. Those edits belong to the parked redesign.
- **Asteroids screensaver** (feedback item 2) — separate spec, separate session.

---

## Rollout

One branch, one PR, both features. Commits split cleanly by feature so the PR description and git log make sense:

1. `feat: add check-for-updates button to About tab`
2. `feat: add water warning indicator to screensaver`

CI covers both via the extended e2e suite. No migration, no config changes, no data model changes.
