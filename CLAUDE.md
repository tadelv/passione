# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**Passione** is a web-based skin (UI) for Streamline-Bridge (ReaPrime) — a modern interface for the DE1 espresso machine. Built as a Vue 3 + Vite single-page application, served as a static skin from Streamline-Bridge's WebUI server.

### Repository Structure

- Root — The web skin source code (Vue + Vite SPA)
- `vendor/reaprime/` — Git submodule of Streamline-Bridge (the gateway we connect to via API)
- `vendor/decenza/` — Git submodule of the original Decenza DE1 Qt/QML app (historical reference)

## Tech Stack

- **Framework**: Vue 3 + Vite (Composition API, `<script setup>`)
- **Routing**: vue-router with hash history, lazy-loaded pages
- **Charts**: uPlot (real-time time-series for shot graphs)
- **i18n**: vue-i18n (`src/i18n/` with locale files)
- **Build output**: Static HTML/CSS/JS (Vite build → `dist/`)
- **Deployment**: Served by Streamline-Bridge as a WebUI skin at port 3000

## Streamline-Bridge API

The skin communicates with Streamline-Bridge running on the same device or local network.

### API Documentation

- **OpenAPI spec**: `vendor/reaprime/assets/api/rest_v1.yml`
- **AsyncAPI spec**: `vendor/reaprime/assets/api/websocket_v1.yml`
- **Skin development guide**: `vendor/reaprime/doc/Skins.md`

### Connection

- **REST API**: `http://<gateway>:8080/api/v1/...`
- **WebSocket**: `ws://<gateway>:8080/ws/v1/...`
- In production (served by Streamline-Bridge), gateway is `localhost:8080`
- In development, configure gateway IP via environment variable

### Machine States

```
sleeping → idle → heating → espresso/steam/hotWater/flush
idle → espresso → (preparingForShot → preinfusion → pouring → pouringDone) → idle
idle → steam → idle
idle → hotWater → idle
idle → flush → idle
```

Additional states: `booting`, `busy`, `calibration`, `selfTest`, `airPurge`, `fwUpgrade`, `needsWater`, `error`, `descaling`, `cleaning`, `steamRinse`, `skipStep` (transient during espresso).

### Snapshot Data Shape

The core real-time data structure (~10Hz via WebSocket):

```json
{
  "timestamp": "...",
  "state": { "state": "espresso", "substate": "pouring" },
  "flow": 2.5, "pressure": 9.1,
  "targetFlow": 2.5, "targetPressure": 9.0,
  "mixTemperature": 93.2, "groupTemperature": 93.0,
  "targetMixTemperature": 93.0, "targetGroupTemperature": 93.0,
  "profileFrame": 2, "steamTemperature": 135.5
}
```

## Architecture

- **API** (`src/api/`) — gateway config (`gateway.js`), REST client (`rest.js`), WebSocket client (`websocket.js`)
- **Pages** (`src/pages/`) — route targets, compose components into full views (lazy-loaded except IdlePage)
- **Components** (`src/components/`) — reusable UI: charts, inputs, dialogs, settings tabs
- **Composables** (`src/composables/`) — WebSocket/API connections, state management, and behavior
- **Router** (`src/router/`) — hash-based routing with 300ms navigation debounce
- **Settings** persist via ReaPrime's key-value store (`/api/v1/store/decenza-js/{key}`), managed by the `useSettings` composable with auto-load and debounced auto-save
- **Power/Sleep** — `useAutoSleep` composable manages sleep schedules, keep-awake, and wake timers via ReaPrime API

### Key Composables

- **`useMachine`** — WebSocket snapshot consumer (~10Hz). Exposes reactive refs for all telemetry. `PHASE_MAP` maps machine states to UI phases. `OPERATION_STATES` controls wake-lock protection (includes `fwUpgrade`, `selfTest`, `calibration`, `airPurge`). Exposes `firstFrame` promise that resolves on the first WS snapshot — installed as the `useBootReady` trigger.
- **`useBootReady`** — Module-level singleton coordinating cold-start work. Anything not user-blocking on first render should `await bootReady()` before firing (network or WS). The Teclast host shares its radio between Wi-Fi and BLE; a parallel HTTP/WS burst at boot starves GATT timing and drops the espresso-machine pairing. `useMachine` installs the trigger; consumers (`useBeans`, `useGrinders`, `useAutoSleep`, `useWaterLevels`, `useDisplay`, `useTimeToReady`, `useShotSettings`, LayoutWidget's last-shot card) gate behind it. 5s fallback so consumers never hang when no trigger is installed.
- **`useShotCache`** — Singleton cache of shot data: `ids` (ordered list), `slim` (paginated normalized summaries, capped at 200), `latest` (full record of the most recent shot, shared by the home-screen last-shot card so it doesn't run its own `/shots/latest` chain). `patch(id)` and `remove(id)` keep `latest` in sync when mutations land on the current id. `refreshLatest()` invalidates only `latest`; called from `App.vue` after every espresso ends — see [Gotchas](#gotchas) for why the espresso→idle hook must live in App, not LayoutWidget.
- **`useChartNormalize`** — Flattens a shot record into the per-series arrays uPlot consumes. Trims the `measurements` slice to the actual shot — `machine.state.substate ∈ {preinfusion, pouring, pouringDone}` — so preheat (`preparingForShot`) and post-shot `idle` samples don't bloat the x axis. Anchors `elapsed = 0` at the first kept sample so t=0 lines up with the espresso timer. Falls back to `m.machine?.timestamp` when the top-level `timestamp` is missing (gateway nests it). No-ops on flat/older records that lack `state.substate`.
- **`useShotNormalize`** — Central shot record normalizer. All pages that display shot data call `normalizeShot(raw)` to get a flat, display-ready object. Handles: dose (annotations → context → legacy), coffee, grinder, rating, notes, TDS/EY, profileName, barista, duration, profile ref. Do NOT add per-page normalization — extend this composable instead.
- **`useSimpleProfile`** — Pure functions for simple profile editing (settings_2a/2b). `extractSimpleParams()` reads params from profile root, `generateSimpleFrames()` creates the frames array, `buildProfileFromParams()` assembles the full API payload.

### Shot Data: Annotations vs Legacy

Shot records have two data schemas:
- **`annotations`** (new): `enjoyment`, `espressoNotes`, `actualDoseWeight`, `actualYield`, `drinkTds`, `drinkEy`, `extras` (barista, beanBrand, etc.)
- **Legacy** (deprecated): `shotNotes`, `metadata` (rating, barista, etc.)

The normalizer reads annotations first, falls back to legacy. The PostShotReviewPage writes both for backward compatibility with older gateways. When adding new shot fields, prefer `annotations` or `annotations.extras`.

### Workflow Context: extras

The gateway only round-trips a fixed set of top-level `WorkflowContext` fields (`targetDoseWeight`, `targetYield`, `grinderId`, `grinderModel`, `grinderSetting`, `beanBatchId`, `coffeeName`, `coffeeRoaster`, `finalBeverageType`). Anything outside that set is silently dropped. Fields the schema proposal lists as top-level (`grinderRpm`, `basketSize`, `basketType`) are **not yet implemented** on the gateway — write them under `context.extras.{grinderRpm,basketSize,basketType}` instead. Same rule for grinder records: extra fields like RPM range live under `grinder.extras.{rpmMin,rpmMax}`. When adding new context/grinder fields, curl-test the round-trip first; if the field doesn't survive, put it under `extras`.

The "power-user fields" feature (RPM + basket) is gated by `showGrinderRpm` / `showBasketData` toggles in Settings → Brewing. Both `RecipeEditorPage` and `PostShotReviewPage` render those fields conditionally and read/write only via `context.extras`.

### Bean-link denormalization

When a bean record is linked (`ctx.beanBatchId` set), the bean is the source of truth and the saved recipe combo drops `coffeeName`/`coffeeRoaster` — see `useBeanLink.enterLinked` (blanks the bound refs). The **live** workflow ctx, however, keeps them denormalized (sourced from the linked bean record in `buildWorkflowUpdate`) because these consumers read `ctx.coffeeName`/`ctx.coffeeRoaster` directly with no batch-id resolution: `IdlePage` shot-plan, `LayoutWidget` last-shot card, `ScreensaverPage` shot recap, `ShotDetailPage`, `ShotHistoryPage`, `AutoFavoritesPage`. Audit those read sites before dropping the text from the live ctx. `useComboDirty.BEAN_TEXT_KEYS` makes the dirty diff ignore the text fields when either side carries a `selectedBeanId`.

`RecipeEditorPage.overlayFromWorkflow` runs on every editor (re-)mount: `loadFromPreset` restores the *saved combo's* `selectedBeanId`/`selectedGrinderId` (the combo only mutates on explicit Save), then `overlayFromWorkflow` overlays the live workflow on top. Entity links (bean, grinder) are **not scalars** — they must be reconciled explicitly from `ctx.beanBatchId`/`ctx.grinderId` *before* the scalar overlay block, or the editor silently reverts a link the user changed-then-left-and-returned. When extending the overlay, treat entity links and scalars as separate concerns.

### Gotchas

Accumulated traps discovered the hard way. Read before changing the surface area below.

- **Espresso→idle hooks belong in `App.vue`, not in widgets.** `IdlePage` (and its `LayoutWidget` children) unmount the moment a shot starts and the router pushes `/espresso`. A `watch(machineState, ...)` inside a home-screen widget therefore never sees the espresso→idle edge — the watcher is registered again *after* the transition. `App.vue` is the only place that observes every state change. When the last-shot card or any home-screen state needs to react to "shot just ended", wire the hook into `App.vue`'s machine-state watcher and have it mutate cache state (e.g. `useShotCache.refreshLatest()`), letting the widget repaint reactively.
- **The gateway persists shots asynchronously.** A naive `setTimeout(refreshLatest, 3000)` after espresso ends is **unsafe** — if the gateway is slow, the refetch lands on the same (previous) shot id and re-caches the stale record, and there is no further trigger to retry. The correct pattern (in `App.vue`) is to snapshot `priorLatestShotId` at espresso *start*, then poll `/shots/latest` every ~500ms after espresso *end*, and only invoke `shotCache.refreshLatest()` once the returned id differs. Use a deadline (~15 s) and force a refresh anyway as a safety net.
- **Chart `measurements` arrays include preheat and idle tails.** A 13 s shot record commonly contains ~5 s of `(espresso, preparingForShot)` samples at the head and several seconds of `(idle, idle)` samples at the tail — `useChartNormalize` trims to `substate ∈ {preinfusion, pouring, pouringDone}`. If you ever add a new chart consumer, do **not** roll your own normalization that iterates the raw `measurements` array — go through `useChartNormalize.normalizeShotData` so the trim, elapsed-anchor, and timestamp fallbacks stay consistent. Older / flat records that lack `state.substate` are no-op'd, so the trim is safe to apply universally.
- **uPlot needs an explicit `incrs` for whole-second tick labels.** Without `incrs`, uPlot auto-picks ~0.5 s ticks for short shots, and the `toFixed(0) + 's'` formatter then renders `"0s, 1s, 1s, 2s, 2s..."` duplicates. Both x-axis configs in `useChartConfig.js` set `incrs: [1, 2, 5, 10, 15, 30, 60]`. Keep that in sync if you add a new chart config in the same file.
- **`useWorkflow.applyData` uses `??`, so server-returned `null` is ignored.** This is intentional (it lets partial-update echoes from the gateway preserve fields the response omits), but it means client-side "clear" actions for context fields like `coffeeName` / `coffeeRoaster` / `beanBatchId` won't visually clear on the home screen until the next full reload. If you need a true clear, mutate `workflow.context.<field> = null` locally after the PUT — don't rely on the server echo. Cross-reference: the bean-picker "Clear" button on `BeanPickerPopup` hits this constraint.
- **User runtime instructions override `.env.local`.** When the user states a host/port in chat ("rea is running on localhost"), override per-invocation (`VITE_GATEWAY_URL=… npm run dev -- --host`) rather than silently inheriting the file. If user instructions and config conflict, surface the conflict.

## Feature Scope

Core brewing flow, profile management (browse/search/favorites/visual editor/recipe editor/simple editor), shot history (list/detail/comparison/post-shot review/phase summary), auto-favorites, Visualizer import, layout customization, bean + grinder catalog (`/catalog` route with sub-tabs, reachable from the home-screen nav widget), bean info, screensaver (ambient glow / last shot recap / shot graph modes), power & sleep schedule management, descaling wizard, settings.

**Settings tabs:** Brewing, Power, Water, Display (layout + screensaver + theme), Visualizer, Bridge (device list + bridge config), Accessibility, About. Tab ids in the URL (`/settings/<id>`) are preserved across reorgs; renamed/removed ids redirect via `TAB_REDIRECTS` in `SettingsPage.vue`. Beans + Grinders live at `/catalog/{beans,grinders}` (not under Settings).

**Espresso Page:** Phase timeline (real-time extraction phases with tracking color), cup fill visualization, shot graph, info bar with pressure/flow/temp/weight.

**Profile Editors:** Three editor types — Simple (settings_2a/2b, 4-step), Recipe (settings_2c, named phases), Advanced (frame-by-frame). `ProfileInfoPage` auto-routes to the correct editor based on `legacy_profile_type`.

**Deferred:** AI shot analysis and dialing assistant, shot history sort controls (API limitation — only `orderBy: timestamp`), steam calibration wizard (blocked on ReaPrime orchestration API), weather widget (low priority).

**Parked design decisions** — see `docs/deferred/` for any feature waiting on a design call or a blocked dependency. Each file captures the goal, current coupling, subagent findings, proposed model, and open questions so work can resume without re-gathering context. Current entries:
- `docs/deferred/screensaver-machine-decoupling.md` — decouple screensaver visibility from machine power state so the app stays usable with the machine asleep. Touches `App.vue` (sleeping→screensaver auto-nav + wake handling) and `ScreensaverPage.vue` (wake button calls `setMachineState('idle')`). See the deferred doc for full coupling map.

## Design Principles

- **Never use timers as guards/workarounds.** Use event-based flags and conditions instead. Only use timers for genuinely periodic tasks (polling, animation, heartbeats).
- Machine phase transitions drive navigation (espresso starts → show EspressoPage, etc.)
- Profile exit conditions: weight exits are independent of pressure/flow exits (app-side vs machine-side)
- Tare happens when frame 0 starts (after machine preheat)
- **No native-dialog-backed inputs** (`type="date"`, `type="time"`, `type="color"`, etc.). The Android Flutter `flutter_inappwebview` host reloads the WebView when an Android native dialog dismisses (tracked in tadelv/reaprime#202). Use plain text inputs with `inputmode` + `pattern` hints. Server may also return ISO timestamps with time portions for date fields — slice to `YYYY-MM-DD` before binding.
- **Boot-quiet on cold start.** On the Teclast host, Wi-Fi and BLE share the same radio — a parallel burst of REST/WS handshakes at app boot starves GATT timing and the espresso-machine pairing drops. Anything that is not user-blocking on first render must `await bootReady()` before firing (REST GET, WS open). Only the machine + devices WS plus the workflow + settings load are allowed to run eagerly; everything else (beans/grinders refresh, presence sync, water-level WS, display WS, time-to-ready WS, shot-settings WS, last-shot fetch, update-available poll) lives behind the gate. When adding a new composable that touches the network on mount, default to gated unless you can argue for eager.

## Interaction Patterns

- **Terminology.** *Workflow* is runtime state — the single live brewing session the gateway is executing. *Recipes* are saved named bundles (profile + bean + grinder + dose + optional steam/hot-water/flush overrides) that load into the workflow on tap. Recipes live on IdlePage and in `RecipeEditorPage`. They never start an operation directly. *Operation presets* (steam / hot-water / flush) are a separate concept — quick-switch parameter sets for a single operation, lived on operation pages with tap-to-start. Recipes and operation presets both render via `PresetPillRow` with different interaction contracts. **Internal data note:** the persisted settings key is still `workflowCombos` (history — no migration); reader code continues to use that name, but user-visible strings use "recipe(s)".
- **Operation preset pills** (SteamPage / HotWaterPage / FlushPage): Single tap selects, double-tap on selected activates (starts operation), double-tap on unselected opens edit popup.
- **ValueInput:** +/- buttons with press-and-hold repeat (80ms), drag-to-adjust on display (20px = 1 step), full keyboard support (arrows, PageUp/Down, Home/End)
- **Operation pages:** Show preset pills AND stop button during active operation. Settings sync to workflow API with 300ms debounce.
- **IdlePage recipes:** Tap to load a recipe into the workflow. Double-tap to open the Recipe Editor (`/recipe/edit`). The Espresso action button is the one and only way to start a shot — tapping a recipe never starts an operation. The selected recipe pill shows a small **modified dot** whenever the live workflow has diverged from the saved recipe (see `useComboDirty.js`, lenient compare).
- **IdlePage shot-plan widget:** `IdlePage.shotPlanLines` is an array of `{kind, text}` items (kinds: `coffee` / `dose` / `grinder` / `ops`). The `coffee` row is its own tap target — opens `BeanPickerPopup`, which writes the selected bean's active batch into the live workflow ctx (`beanBatchId` + denormalized `coffeeName`/`coffeeRoaster`). The `ops` row is a single line of icon-prefixed chips for steam / hot-water / flush — emitted only when `workflow.{steamSettings,hotWaterData,rinseData}.duration > 0`, so disabled operations disappear. Don't push other operation-status concerns into the shotPlan widget; if a feature needs richer state, add a new widget type rather than overloading this one.
- **RecipeEditorPage** (`/recipe/edit`, legacy `/workflow/edit` and `/bean-info` redirect): Edits a recipe's fields. Field changes are **live-applied** to the running workflow (300ms debounce) but **never** touch the saved recipe. The saved recipe only mutates when the user explicitly taps **Save** (overwrite selected recipe) or **Save as New Recipe** (create a new one, prompts for a name via PresetEditPopup). Both buttons are visible only when the form diverges from the selected recipe (or, with no recipe selected, when any field has a value). Exit is always free — no Back button, no unsaved-changes dialog. Home in the BottomBar is the sole exit. Divergence is signaled by the modified dot on the pill, not by a modal. **Creation path is from-existing only**: users start from the live workflow (or a selected recipe) and tap Save as New Recipe. First-run users reach the editor via the nav-buttons widget and create their first recipe the same way.
- **BrewDialog:** Optional pre-brew dialog (controlled by `showBrewDialog` setting). Shows temperature, dose, yield, ratio, grinder fields. Integrates with workflow API.
- **ProfileSelectorPage:** Single click previews profile (shows graph + details in right panel). Explicit "Use Profile" button applies it. Toast confirmation on apply.
- **ShotHistoryPage:** Per-row Load (L) and Edit (E) buttons, tap opens detail. Server-side search with debounce and generation counter for race prevention. Shot count shows server total.
- **PhaseTimeline:** Horizontal progress bar on EspressoPage showing Preheat/Pre-infusion/Pouring/Ending. Active segment expands. Tracking color (green/amber/red) based on QML-ported thresholds for pressure/flow deviation.
- **PhaseSummaryPanel:** Collapsible table on ShotDetailPage and PostShotReviewPage. Computed client-side from measurements array.
- **SimpleProfileEditorPage:** 4-step editor for settings_2a (pressure) and settings_2b (flow). Live graph preview. Dirty detection with navigation guard. Routes via ProfileInfoPage edit button.
- **AutoFavoritesPage:** Client-side aggregation of all shots via paginated API. Groups by bean/profile/grinder. Load and Show Shots actions per group.
- **ScreensaverPage:** Wake is an explicit pill button ("Tap to wake") near the bottom of the screen — tapping elsewhere on the screensaver is inert. Keyboard still wakes on any key (see global shortcuts). Rationale: prevents accidental wake-on-brush, makes the wake affordance discoverable.
- **Global keyboard shortcuts:** E/S/W/F to start operations when idle; number keys match GHC positions (0=sleep, 1=flush, 2=espresso, 3=steam, 4=hot water); P for sleep; I/Space/Escape/Backspace to stop; H (home), R (recipes), T (history), comma (settings) for navigation; any key wakes from screensaver
- **Features not backed by ReaPrime API** should show a toast notification ("not yet available") rather than silently failing

## Build & Development

### Commands

```bash
npm install
npm run dev          # Vite dev server with HMR + API/WS proxy
npm run build        # Static output in dist/
npm run test:e2e     # Playwright end-to-end tests
npm run preview      # Preview production build
```

### CI/CD

- **Release**: GitHub Actions workflow (`.github/workflows/release.yml`) — triggered on version tags

### Test artifacts

- `docs/screenshots/*.png` are regenerated by `tests/e2e/screenshots.spec.js`. Expect them in "modified" state after any e2e run — exclude from unrelated commits and regenerate intentionally when you want fresh shots.

### Dev Proxy

Vite proxies `/api` → `VITE_GATEWAY_URL` and `/ws` → `VITE_WS_URL` (default: `localhost:8080`). Configure in `.env.local`:
```
VITE_GATEWAY_URL=http://192.168.1.100:8080
VITE_WS_URL=ws://192.168.1.100:8080
```

App code uses relative paths (`/api/v1/...`, `/ws/v1/...`) — the proxy handles routing to the gateway in dev mode.

### Skin Deployment

The `dist/` folder is a Streamline-Bridge skin. Include a `manifest.json`:
```json
{
  "id": "passione",
  "name": "Passione",
  "description": "A work of passion — a modern web interface for the DE1 espresso machine via Streamline-Bridge",
  "version": "1.0.0"
}
```

Install via Streamline-Bridge API:
```bash
curl -X POST http://localhost:8080/api/v1/webui/skins/install/github-branch \
  -H "Content-Type: application/json" \
  -d '{"repo": "owner/passione", "branch": "main"}'
```

## Design Context

### Brand Personality
**Warm, inviting, confident.** "What would a coffee machine UI look like if Apple designed it?" Dark mode only, Apple Home/Watch as the primary reference — clean dark surfaces, purposeful information density, confident typography.

### Design Principles
1. **Purposeful density** — Show the right information at the right time. Never show everything at once; never hide what matters now.
2. **Confidence through clarity** — Large, readable values. Unambiguous states. Machine state drives the UI.
3. **Warmth without whimsy** — Soft transitions, comfortable spacing, inviting colors. No bouncy animations, no gamification.
4. **Touch-native feel** — Double-tap actions, drag-to-adjust, two-step confirms. Fingers first, mouse second, keyboard as power-user bonus.
5. **Invisible complexity** — Progressive disclosure, not feature walls. Casual use is effortless, advanced use is discoverable.

### Accessibility
Target WCAG AAA where practical — enhanced contrast, comprehensive ARIA, keyboard navigation, 44–56px minimum touch targets.

Full design system details in `.impeccable.md`.

## Agent skills

### Issue tracker

GitHub Issues at `tadelv/passione` via `gh` CLI; mirror summary to Obsidian note `Professional/Decent/Passione.md`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical defaults (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`CONTEXT.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.
