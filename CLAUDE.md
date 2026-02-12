# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**decenza-js** is a web-based skin (UI) for the Streamline-Bridge (ReaPrime) espresso machine gateway. The goal is to port the Decenza DE1 QML/C++ desktop/mobile app into a single-page web application served as a static skin from Streamline-Bridge's WebUI skin server.

The app replaces Decenza's QML→C++ calls with REST/WebSocket calls to the Streamline-Bridge API (port 8080), while preserving Decenza's GUI functionality and flexibility.

### Repository Structure

- `vendor/decenza/` — Git submodule of the original Decenza DE1 Qt/QML app (reference for UI porting)
- `vendor/reaprime/` — Git submodule of Streamline-Bridge (the gateway we connect to via API)
- Root — The web skin source code (Vue + Vite SPA)

### Key Reference Files

- **Streamline-Bridge API & skin development**: `vendor/reaprime/doc/Skins.md` (complete REST + WebSocket API reference)
- **Decenza QML pages to port**: `vendor/decenza/qml/pages/` (24 pages)
- **Decenza QML components to port**: `vendor/decenza/qml/components/` (45+ components)
- **Decenza C++ controllers** (behavior reference): `vendor/decenza/src/controllers/`, `vendor/decenza/src/machine/`
- **Profile system**: `vendor/decenza/src/profile/` (JSON format, frame-based extraction steps)
- **Decenza theme/styling**: `vendor/decenza/qml/Theme.qml`

## Tech Stack

- **Framework**: Vue 3 + Vite (Composition API, `<script setup>`)
- **Charts**: uPlot (real-time time-series for shot graphs)
- **Build output**: Static HTML/CSS/JS (Vite build → `dist/`)
- **Deployment**: Served by Streamline-Bridge as a WebUI skin at port 3000

## Streamline-Bridge API

The skin communicates with Streamline-Bridge running on the same device or local network.

### Connection

- **REST API**: `http://<gateway>:8080/api/v1/...`
- **WebSocket**: `ws://<gateway>:8080/ws/v1/...`
- In production (served by Streamline-Bridge), gateway is `localhost:8080`
- In development, configure gateway IP via environment variable

### Core WebSocket Streams

| Endpoint | Rate | Purpose |
|----------|------|---------|
| `ws/v1/machine/snapshot` | ~10Hz | Real-time pressure, flow, temp, state |
| `ws/v1/scale/snapshot` | 5-10Hz | Weight, battery level |
| `ws/v1/machine/shotSettings` | On change | Steam temp, hot water settings, group temp |
| `ws/v1/machine/waterLevels` | On change | Water tank level |

### Core REST Endpoints

- `GET/PUT /api/v1/machine/state` — Read/change machine state (idle, espresso, steam, hotWater, flush, sleeping)
- `GET/PUT /api/v1/workflow` — Read/update complete brewing recipe (profile + dose + grinder + coffee + steam + hot water + rinse). **This is the recommended API** for managing all brewing parameters.
- `GET/POST /api/v1/profiles` — Profile CRUD with content-based hash IDs
- `POST /api/v1/machine/profile` — Upload profile directly to machine
- `GET/POST /api/v1/machine/settings` — Machine settings (fan, flush, hot water flow, etc.)
- `PUT /api/v1/scale/tare` — Tare scale
- `GET /api/v1/devices` — List connected devices
- `GET /api/v1/devices/scan` — Trigger BLE scan
- `GET /api/v1/shots/ids`, `GET /api/v1/shots/{id}` — Shot history
- `GET/POST /api/v1/store/{namespace}/{key}` — Key-value store for client persistence

### Machine States

```
sleeping → idle → heating → [ready]
idle → espresso → (preinfusion → pouring → done) → idle
idle → steam → idle
idle → hotWater → idle
idle → flush → idle
```

### Snapshot Data Shape

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

## QML → Vue Porting Guide

### Mapping Concepts

| QML Concept | Vue Equivalent |
|-------------|----------------|
| `property var` / `Q_PROPERTY` | `ref()` / `reactive()` |
| Signal/slot connections | Composable with `watch()` / event emitters |
| `Component.onCompleted` | `onMounted()` |
| `StackView` page navigation | Vue Router |
| `Binding` / property binding | Template `{{ }}` / `:prop` binding |
| `Theme.qml` singleton | CSS variables / Pinia theme store |
| `ListView` / `Repeater` | `v-for` |
| `Timer` | `setInterval` / `useIntervalFn` from VueUse |

### Implementation Status (Decenza QML pages)

See `docs/implementation-tasks.md` for the full phased task list with status indicators.

**Phase 1 — Core brewing flow (done):**
- `IdlePage.vue` — Dashboard with gauge, presets (espresso favorites + steam/hotwater/flush), shot plan text
- `EspressoPage.vue` — Live shot graph with phase markers, volume mode, legend overlay
- `SteamPage.vue` — Presets, heater control, live flow slider, stop button
- `HotWaterPage.vue` — Presets, weight/volume mode, stop button
- `FlushPage.vue` — Presets, duration/flow, stop button

**Phase 2 — Profile & recipe management (partial):**
- `ProfileSelectorPage.vue` — Two-panel browser, favorites, search, single-click-to-apply
- `ProfileInfoPage.vue` — Read-only profile details with graph
- `ProfileEditorPage` — Not yet implemented (XL complexity)
- `RecipeEditorPage` — Not yet implemented (XL complexity)

**Phase 3 — History & settings (done):**
- `ShotHistoryPage.vue` — Paginated list, search, compare mode, per-row Load/Edit buttons, long-press
- `ShotDetailPage.vue` — Swipeable graph, metrics, rating, delete
- `ShotComparisonPage.vue` — Overlay graph, curve toggles, remove shot
- `PostShotReviewPage.vue` — Full DYE editor with suggestions, rating, unsaved changes guard
- `SettingsPage.vue` — Tab container with 9 settings tabs

**Phase 4 — Advanced features (done):**
- `ScreensaverPage.vue` — Flip clock mode
- `DescalingPage.vue` — 3-phase wizard
- `VisualizerBrowserPage.vue` — Share code import (scaffolded)
- `BeanInfoPage.vue` — Bean preset management

### Implemented Components (30)

**Core UI:** ActionButton, BottomBar, StatusBar, CircularGauge, ConnectionIndicator
**Charts:** ShotGraph (uPlot real-time), ProfileGraph (static), HistoryShotGraph, ComparisonGraph
**Input:** ValueInput (+/-, drag, hold-repeat, keyboard), TouchSlider, RatingInput, PresetPillRow
**Dialogs:** BrewDialog, PresetEditPopup, ProfilePreviewPopup, CompletionOverlay, StopReasonOverlay, ToastNotification
**Utility:** SwipeableArea, SuggestionField
**Settings tabs:** Gateway, Device, Preferences, Screensaver, Visualizer, ShotHistory, Options, Themes, About

### Composables (14)

**WebSocket/API:** useMachine, useScale, useShotSettings, useWaterLevels, useWorkflow
**State:** useShotData, useChartConfig, useSettings, useTheme, useVolumeMode
**Behavioral:** useAutoSleep, useSteamHeater, useOperationSettings, useToast

### Decenza Design Principles to Preserve

- **Never use timers as guards/workarounds.** Use event-based flags and conditions instead. Only use timers for genuinely periodic tasks (polling, animation, heartbeats).
- Machine phase transitions drive navigation (espresso starts → show EspressoPage, etc.)
- Profile exit conditions: weight exits are independent of pressure/flow exits (app-side vs machine-side)
- Tare happens when frame 0 starts (after machine preheat)

### Interaction Pattern Conventions

These interaction patterns must match the QML version:

- **Preset pills:** Single tap selects, double-tap on selected activates (starts operation), long-press (500ms) opens edit popup
- **ValueInput:** +/- buttons with press-and-hold repeat (80ms), drag-to-adjust on display (20px = 1 step), full keyboard support (arrows, PageUp/Down, Home/End)
- **Operation pages:** Show preset pills AND stop button during active operation (not just in settings view)
- **IdlePage espresso presets:** Two-step — first tap loads profile into workflow, second tap starts espresso. Long-press shows ProfilePreviewPopup
- **ProfileSelectorPage:** Single click applies profile (not just previews)
- **ShotHistoryPage:** Per-row Load (L) and Edit (E) buttons, long-press opens detail
- **Global keyboard shortcuts:** E/S/W/F to start operations when idle, Space/Escape to stop current operation
- **Features not backed by ReaPrime API** should show a toast notification ("not yet available") rather than silently failing

## Build & Development

### Development

```bash
npm install
npm run dev          # Vite dev server with HMR
```

Configure gateway in `.env.local`:
```
VITE_GATEWAY_URL=http://192.168.1.100:8080
VITE_WS_URL=ws://192.168.1.100:8080
```

### Production Build

```bash
npm run build        # Static output in dist/
```

### Skin Deployment

The `dist/` folder is a Streamline-Bridge skin. Include a `manifest.json`:
```json
{
  "id": "decenza-js",
  "name": "Decenza",
  "description": "Decenza DE1 web interface",
  "version": "0.1.0"
}
```

Install via Streamline-Bridge API:
```bash
# From GitHub branch
curl -X POST http://localhost:8080/api/v1/webui/skins/install/github-branch \
  -H "Content-Type: application/json" \
  -d '{"repo": "owner/decenza-js", "branch": "main"}'

# Or copy dist/ to Streamline-Bridge's web-ui/ directory
```

### Vite Config Notes

```javascript
// vite.config.js
export default {
  base: './',           // Relative paths for skin serving
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
}
```

## WebSocket Best Practices

- Always implement reconnection with exponential backoff (1s → 30s max)
- Buffer shot data points for chart rendering (~500 point rolling window)
- Track machine state transitions to trigger page navigation and shot recording
- Use separate WebSocket connections for machine snapshot and scale snapshot
