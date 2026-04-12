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

- **`useMachine`** — WebSocket snapshot consumer (~10Hz). Exposes reactive refs for all telemetry. `PHASE_MAP` maps machine states to UI phases. `OPERATION_STATES` controls wake-lock protection (includes `fwUpgrade`, `selfTest`, `calibration`, `airPurge`).
- **`useShotNormalize`** — Central shot record normalizer. All pages that display shot data call `normalizeShot(raw)` to get a flat, display-ready object. Handles: dose (annotations → context → legacy), coffee, grinder, rating, notes, TDS/EY, profileName, barista, duration, profile ref. Do NOT add per-page normalization — extend this composable instead.
- **`useSimpleProfile`** — Pure functions for simple profile editing (settings_2a/2b). `extractSimpleParams()` reads params from profile root, `generateSimpleFrames()` creates the frames array, `buildProfileFromParams()` assembles the full API payload.

### Shot Data: Annotations vs Legacy

Shot records have two data schemas:
- **`annotations`** (new): `enjoyment`, `espressoNotes`, `actualDoseWeight`, `actualYield`, `drinkTds`, `drinkEy`, `extras` (barista, beanBrand, etc.)
- **Legacy** (deprecated): `shotNotes`, `metadata` (rating, barista, etc.)

The normalizer reads annotations first, falls back to legacy. The PostShotReviewPage writes both for backward compatibility with older gateways. When adding new shot fields, prefer `annotations` or `annotations.extras`.

## Feature Scope

Core brewing flow, profile management (browse/search/favorites/visual editor/recipe editor/simple editor), shot history (list/detail/comparison/post-shot review/phase summary), auto-favorites, Visualizer import, layout customization, bean info, screensaver (ambient glow / last shot recap / shot graph modes), power & sleep schedule management, descaling wizard, settings.

**Espresso Page:** Phase timeline (real-time extraction phases with tracking color), cup fill visualization, shot graph, info bar with pressure/flow/temp/weight.

**Profile Editors:** Three editor types — Simple (settings_2a/2b, 4-step), Recipe (settings_2c, named phases), Advanced (frame-by-frame). `ProfileInfoPage` auto-routes to the correct editor based on `legacy_profile_type`.

**Deferred:** AI shot analysis and dialing assistant, shot history sort controls (API limitation — only `orderBy: timestamp`), steam calibration wizard (blocked on ReaPrime orchestration API), weather widget (low priority).

**Parked design decisions** — see `docs/deferred/` for any feature waiting on a design call or a blocked dependency. Each file captures the goal, current coupling, subagent findings, proposed model, and open questions so work can resume without re-gathering context. Current entries:
- `docs/deferred/screensaver-machine-decoupling.md` — decouple screensaver visibility from machine power state so the app stays usable with the machine asleep. Affects `App.vue:247`, `App.vue:277-279`, `ScreensaverPage.vue:57`, `LayoutWidget.vue:227`.

## Design Principles

- **Never use timers as guards/workarounds.** Use event-based flags and conditions instead. Only use timers for genuinely periodic tasks (polling, animation, heartbeats).
- Machine phase transitions drive navigation (espresso starts → show EspressoPage, etc.)
- Profile exit conditions: weight exits are independent of pressure/flow exits (app-side vs machine-side)
- Tare happens when frame 0 starts (after machine preheat)

## Interaction Patterns

- **Terminology.** *Operation presets* (steam / hot-water / flush) are quick-switch parameter sets for a single operation — they live on operation pages and have tap-to-start. *Workflow combos* are bundled recipe state (profile + bean + grinder + dose + optional steam/hot-water/flush overrides) — they live on IdlePage and in `WorkflowEditorPage`, and they never start an operation directly. Both render via the `PresetPillRow` component, but with different interaction contracts.
- **Operation preset pills** (SteamPage / HotWaterPage / FlushPage): Single tap selects, double-tap on selected activates (starts operation), double-tap on unselected opens edit popup.
- **ValueInput:** +/- buttons with press-and-hold repeat (80ms), drag-to-adjust on display (20px = 1 step), full keyboard support (arrows, PageUp/Down, Home/End)
- **Operation pages:** Show preset pills AND stop button during active operation. Settings sync to workflow API with 300ms debounce.
- **IdlePage workflow combos:** Tap to load combo into workflow. Double-tap to open the Workflow Editor (`/workflow/edit`). The Espresso action button is the one and only way to start a shot — tapping a workflow combo never starts an operation.
- **WorkflowEditorPage** (`/workflow/edit`, legacy `/bean-info` redirects): Edit workflow combos. Field changes are **live-applied** to the running workflow (300ms debounce) without touching the saved combo. Explicit `Save` / `Save as New` buttons persist changes to the combo. Back with unsaved changes opens `UnsavedChangesDialog` with four actions: Save, Save as New, Discard (reverts live workflow to the pre-edit snapshot), Keep changes (keeps live workflow values; combo untouched).
- **BrewDialog:** Optional pre-brew dialog (controlled by `showBrewDialog` setting). Shows temperature, dose, yield, ratio, grinder fields. Integrates with workflow API.
- **ProfileSelectorPage:** Single click previews profile (shows graph + details in right panel). Explicit "Use Profile" button applies it. Toast confirmation on apply.
- **ShotHistoryPage:** Per-row Load (L) and Edit (E) buttons, tap opens detail. Server-side search with debounce and generation counter for race prevention. Shot count shows server total.
- **PhaseTimeline:** Horizontal progress bar on EspressoPage showing Preheat/Pre-infusion/Pouring/Ending. Active segment expands. Tracking color (green/amber/red) based on QML-ported thresholds for pressure/flow deviation.
- **PhaseSummaryPanel:** Collapsible table on ShotDetailPage and PostShotReviewPage. Computed client-side from measurements array.
- **SimpleProfileEditorPage:** 4-step editor for settings_2a (pressure) and settings_2b (flow). Live graph preview. Dirty detection with navigation guard. Routes via ProfileInfoPage edit button.
- **AutoFavoritesPage:** Client-side aggregation of all shots via paginated API. Groups by bean/profile/grinder. Load and Show Shots actions per group.
- **Global keyboard shortcuts:** E/S/W/F to start operations when idle, Space/Escape to stop current operation
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
