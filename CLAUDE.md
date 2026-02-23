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
- **Charts**: uPlot (real-time time-series for shot graphs)
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
sleeping → idle → heating → [ready]
idle → espresso → (preinfusion → pouring → done) → idle
idle → steam → idle
idle → hotWater → idle
idle → flush → idle
```

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

- **Pages** (`src/pages/`) handle routing and compose components into full views
- **Components** (`src/components/`) are reusable UI: charts, inputs, dialogs, settings tabs
- **Composables** (`src/composables/`) handle WebSocket/API connections, state management, and behavior
- **Settings** persist via ReaPrime's key-value store (`/api/v1/store/decenza-js/{key}`), managed by the `useSettings` composable with auto-load and debounced auto-save

## 1.0 Feature Scope

**Included in 1.0:**
- Core brewing flow: idle dashboard, espresso (live shot graph), steam, hot water, flush
- Profile management: browse, search, favorites, read-only detail, visual editor, recipe editor
- Shot history: paginated list, search, detail view, comparison overlay, post-shot review
- Visualizer: share code import, batch import from visualizer.coffee
- Layout customization: configurable home screen zones
- Screensaver, descaling wizard, settings (10 tabs)

**Deferred to 2.0:**
- AI shot analysis and dialing assistant
- Internationalization (i18n/translations)
- Bean info management

## Design Principles

- **Never use timers as guards/workarounds.** Use event-based flags and conditions instead. Only use timers for genuinely periodic tasks (polling, animation, heartbeats).
- Machine phase transitions drive navigation (espresso starts → show EspressoPage, etc.)
- Profile exit conditions: weight exits are independent of pressure/flow exits (app-side vs machine-side)
- Tare happens when frame 0 starts (after machine preheat)

## Interaction Patterns

- **Preset pills:** Single tap selects, double-tap on selected activates (starts operation), long-press (500ms) opens edit popup
- **ValueInput:** +/- buttons with press-and-hold repeat (80ms), drag-to-adjust on display (20px = 1 step), full keyboard support (arrows, PageUp/Down, Home/End)
- **Operation pages:** Show preset pills AND stop button during active operation. Settings sync to workflow API with 300ms debounce.
- **IdlePage espresso presets:** Two-step — first tap loads profile into workflow, second tap starts espresso. Long-press shows ProfilePreviewPopup
- **BrewDialog:** Optional pre-brew dialog (controlled by `showBrewDialog` setting). Shows temperature, dose, yield, ratio, grinder fields. Integrates with workflow API.
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
