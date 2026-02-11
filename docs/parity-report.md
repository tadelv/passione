# Feature Parity Report: Decenza-JS Vue vs Original QML

> Audit date: 2026-02-11
> Auditor: parity-checker agent
> Build status: PASSES (`npm run build` completes without errors)

---

## Executive Summary

The Vue web skin implements the Phase 1 core brewing flow pages (Idle, Espresso, Steam, Hot Water, Flush) and the foundational infrastructure (WebSocket composables, REST API client, router, theme). The codebase is well-structured and functionally solid. Several issues were found and fixed during this audit (theme values, timer formatting, progress bar sizing, press-and-hold behavior). Remaining gaps are documented below, organized by severity.

### Issues Fixed During This Audit

| File | Issue | Fix |
|------|-------|-----|
| `src/assets/theme.css` | `--status-bar-height` was 56px, QML is 70px | Changed to 70px |
| `src/assets/theme.css` | `--bottom-bar-height` was 56px, QML is 70px | Changed to 70px |
| `src/assets/theme.css` | `--page-top-margin` was 64px, QML is 80px | Changed to 80px |
| `src/assets/theme.css` | Missing DYE measurement colors | Added `--color-dye-*` vars |
| `src/assets/theme.css` | Missing `--button-default` variable | Added |
| `src/pages/IdlePage.vue:197` | Connection label used `--font-value` (48px!) for a small label | Changed to `--font-label` (14px) |
| `src/pages/EspressoPage.vue` | Timer displayed as `XX.Xs` instead of `M:SS.s` format | Added MM:SS.s formatter |
| `src/pages/EspressoPage.vue` | Preheating banner used accent background pill, QML uses centered secondary text | Changed to centered text, secondary color |
| `src/pages/EspressoPage.vue` | Progress bar height was 8px (`--spacing-small`), QML is 4px | Changed to 4px, max-width 120px |
| `src/pages/SteamPage.vue` | Timer showed `XX.Xs`, QML uses `MM:SS` format | Added MM:SS formatter |
| `src/pages/FlushPage.vue` | Progress bar height was 8px, QML is 6px | Changed to 6px |
| `src/components/ValueInput.vue` | No press-and-hold repeat (QML: 80ms repeat) | Added pointer-event-based hold repeat |
| `src/components/ActionButton.vue` | No hover state (QML: lighter on hover) | Added `filter: brightness(1.1)` on hover |
| `src/components/BottomBar.vue` | Missing `rightText` prop (QML has it) | Added prop and rendering |
| `src/components/PresetPillRow.vue` | Pill height 42px, QML is 50px; padding 20px, QML is 40px; font 15px, QML is 16px | Fixed all values |
| `src/App.vue` | Auto-navigation used `router.push` (adds to history), QML uses `replace` | Changed to `router.replace` |

---

## 1. Theme / Design Audit

**File**: `src/assets/theme.css` vs `vendor/decenza/qml/Theme.qml`

### Colors -- MATCH
All 12 core colors match the QML defaults exactly:
- `backgroundColor` (#1a1a2e), `surfaceColor` (#252538), `primaryColor` (#4e85f4), `secondaryColor` (#c0c5e3), `textColor` (#ffffff), `textSecondaryColor` (#a0a8b8), `accentColor` (#e94560), `successColor` (#00cc6d), `warningColor` (#ffaa00), `highlightColor` (#ffaa00), `errorColor` (#ff4444), `borderColor` (#3a3a4e)

### Chart Colors -- MATCH
All 7 chart line colors match: pressure (#18c37e), pressureGoal (#69fdb3), flow (#4e85f4), flowGoal (#7aaaff), temperature (#e73249), temperatureGoal (#ffa5a6), weight (#a2693d)

### Font Sizes -- MATCH
All 8 font tokens match the QML `scaled()` values at 1.0 scale:
heading (32px), title (24px), subtitle (18px), body (18px), label (14px), caption (12px), value (48px), timer (72px)

### Layout Constants -- FIXED
| Token | QML Value | Vue Before | Vue After |
|-------|-----------|------------|-----------|
| statusBarHeight | 70 | 56 | **70** |
| bottomBarHeight | 70 | 56 | **70** |
| pageTopMargin | 80 | 64 | **80** |

### Spacing/Radii -- MATCH
All spacing, radius, touch target, gauge, and chart constants match.

### Missing from CSS
- **Dynamic theming**: QML colors are bound to `Settings.customThemeColors` allowing user overrides. The CSS has no mechanism for runtime theme switching. **Recommendation**: Use CSS variable overrides via JavaScript to support custom themes (load from KV store on init).
- **Scaled dimensions**: QML uses `Theme.scaled(value)` which multiplies by a responsive scale factor. CSS uses fixed pixel values. This is acceptable for web (responsive layout via flexbox/grid instead of manual scaling) but means the layout won't dynamically adapt to very different screen sizes the same way QML does.

---

## 2. Page-by-Page Comparison

### 2.1 IdlePage (`src/pages/IdlePage.vue` vs `vendor/decenza/qml/pages/IdlePage.qml`)

**Overall**: Basic idle page structure is present. Layout is simpler than QML's zone-based system.

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| CircularGauge temperature display | Yes | Yes | Match |
| ConnectionIndicator | Yes (Online/Offline text, detail text) | Dot + label | Partial -- Vue shows dot + text but misses detail text ("Machine + Scale" etc.) |
| Water level bar | Yes | Yes | Match |
| Profile name display | Yes | Yes | Match |
| Action buttons (E/S/HW/F) | Yes (via layout system) | Yes (hardcoded) | Match (simpler) |
| Shot plan text | Yes (ShotPlanText component) | Yes (computed from workflow) | Added by frontend-dev |
| JSON-configurable layout zones | 7 zones via Settings.layoutConfiguration | No | **Major gap** -- layout is hardcoded |
| Preset rows (espresso, steam, HW, flush) | Yes (PresetPillRow per operation) | No | **Gap** -- no preset system on idle page |
| BrewDialog before espresso | Yes (configurable) | No | **Gap** -- no pre-brew dialog |
| Long-press/double-click on action buttons | Yes (navigate to settings / start) | No | **Gap** -- only single click |
| Developer mode (5s long-press) | Yes | No | Not needed for web |

**Remaining gaps**:
- Configurable layout zone system (major complexity -- defer to later phase)
- Preset integration on IdlePage (needs PresetPillRow + KV store persistence)
- BrewDialog integration (Phase 2 feature)

### 2.2 EspressoPage (`src/pages/EspressoPage.vue` vs `vendor/decenza/qml/pages/EspressoPage.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| Full-screen ShotGraph | Yes | Yes | Match |
| Bottom info bar (timer, pressure, flow, temp, weight) | Yes (100px height) | Yes (100px) | Match |
| Timer format MM:SS.s | Yes | **Fixed** | Was showing seconds only |
| Preheating banner | Centered text, secondary color | **Fixed** | Was accent background pill |
| Weight progress bar (4px, max 120px) | Yes | **Fixed** | Was 8px, no max-width |
| Weight vs Volume mode | Yes (stopAtType) | No | **Gap** -- always shows weight mode |
| Brew-by-ratio display | Yes ("1:X.X" below weight) | No | **Gap** |
| Stop button (headless only) | Yes (DE1Device.isHeadless) | Always shows back/stop | Acceptable difference |
| Keyboard shortcuts (Esc/Space/Backspace) | Yes | Yes (via App.vue global handler) | Match |
| Back button | Yes | Yes | Match |

**Remaining gaps**:
- Volume mode display (needs cumulative volume tracking)
- Brew-by-ratio display (needs dose data from workflow)

### 2.3 SteamPage (`src/pages/SteamPage.vue` vs `vendor/decenza/qml/pages/SteamPage.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| Two-view architecture (live/settings) | Yes | Yes | Match |
| Timer display (MM:SS format) | Yes | **Fixed** | Was showing seconds |
| Timer progress bar | Yes | Yes | Match |
| Heating indicator | Yes (steam icon + progress + temp) | Yes | Match |
| Duration ValueInput (1-120, step 1, suffix " s") | Yes | Yes | Match |
| Steam Flow ValueInput (40-250, step 5) | Yes | Yes | Match |
| Temperature ValueInput (120-170, step 1, suffix "deg C") | Yes | Yes | Match |
| Live flow slider during steaming | Yes (real-time via setSteamFlowImmediate) | Partial (ValueInput, no API call) | **Gap** -- adjustment doesn't send to machine |
| Pitcher presets (PresetPillRow) | Yes (with edit popup) | No | **Gap** -- no presets on steam page |
| Steam heater control toggle | Yes | No | **Gap** |
| Auto-flush countdown | Yes (puffing detection) | No | **Gap** (depends on substate detection) |
| Two-stage stop button | Yes (soft stop then idle) | No | **Gap** |
| Duration adjust buttons during steaming | Yes (+5s/-5s) | Yes | Match |
| BottomBar with settings summary | Yes | Yes | Match |

**Remaining gaps**:
- Pitcher presets (PresetPillRow + PresetEditPopup + KV store)
- Real-time flow adjustment API call during steaming
- Steam heater on/off control
- Auto-flush countdown (needs puffing substate investigation)

### 2.4 HotWaterPage (`src/pages/HotWaterPage.vue` vs `vendor/decenza/qml/pages/HotWaterPage.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| Two-view architecture (live/settings) | Yes | Yes | Match |
| Weight/Volume mode toggle | Yes (pill buttons) | Yes | Match |
| Volume/Weight ValueInput (50-255/500, step 10) | Yes | Yes | Match |
| Temperature ValueInput (40-100, step 1) | Yes | Yes | Match |
| Live weight display + progress bar | Yes | Yes | Match |
| Volume mode display | Target only, no live tracking | Target only | Match |
| Vessel presets | Yes (PresetPillRow) | No | **Gap** |
| Auto-tare on page open (weight mode) | Yes | No | **Gap** |
| BottomBar with settings summary | Yes | Yes | Match |

**Remaining gaps**:
- Vessel presets (PresetPillRow + KV store)
- Auto-tare on page open

### 2.5 FlushPage (`src/pages/FlushPage.vue` vs `vendor/decenza/qml/pages/FlushPage.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| Two-view architecture (live/settings) | Yes | Yes | Match |
| Timer with progress bar | Yes (6px height) | **Fixed** | Was 8px |
| Duration ValueInput (1-30, step 0.5, suffix " s") | Yes | Yes | Match |
| Flow Rate ValueInput (2-10, step 0.5, suffix " mL/s") | Yes | Yes | Match |
| Flush presets | Yes (PresetPillRow) | No | **Gap** |
| BottomBar with settings summary | Yes | Yes | Match |
| Back button navigation (pushed vs replaced) | Yes | Always pushes to "/" | Acceptable |

**Remaining gaps**:
- Flush presets (PresetPillRow + KV store)

---

## 3. Component Comparison

### 3.1 ShotGraph (`src/components/ShotGraph.vue` vs QML `ShotGraph.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| 8 data series (P, Pgoal, F, Fgoal, T, Tgoal, W) | Yes | Yes | Match |
| Correct colors from Theme | Yes | Yes | Match |
| Dashed goal lines | Yes | Yes | Match |
| Custom legend overlay | Yes (top-left, semi-transparent) | Yes (bottom) | Slightly different position |
| Pressure axis (0-12) | Yes | Yes | Match |
| Temperature axis (80-100, hidden) | Yes | Yes (right side, visible) | Minor difference |
| Weight axis (right, dynamic) | Yes | Yes | Match |
| Frame markers | Yes (10 dotted lines + labels) | No | **Gap** -- no frame markers on live chart |
| Pump mode indicator bars | Yes (4px colored bars at bottom) | No | **Gap** |
| Extraction start marker | Yes (dash-dot) | No | **Gap** |

**Remaining gaps**: Frame transition markers and pump mode bars (enhancement, not blocking)

### 3.2 ProfileGraph (`src/components/ProfileGraph.vue` vs QML `ProfileGraph.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| 3 series (pressure, flow, temp) as dashed goal lines | Yes | Yes | Match |
| Frame boundary overlays (alternating backgrounds) | Yes | Yes | Match |
| Frame selection highlighting | Yes (accent tint) | Yes (accent tint) | Match |
| Click to select frame | Yes (frameSelected signal) | Yes (frame-selected emit) | Match |
| Pump mode indicator bars | Yes | Yes | Match |
| Frame name labels | Yes | Yes | Match |
| Correct goal colors | Yes | Yes | Match |
| Discontinuous curve segments for pump mode changes | Yes | Yes (null values create gaps) | Match |

**Status**: Good parity.

### 3.3 StatusBar (`src/components/StatusBar.vue` vs QML `StatusBar.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| ConnectionIndicator + state text | Yes | Yes | Match |
| Profile name center | Yes | Yes | Match |
| Temperature display | Yes | Yes | Match |
| Water level | Yes | Yes | Match |
| Height = statusBarHeight | Uses Theme.statusBarHeight (70) | Uses `--status-bar-height` (now 70) | **Fixed** |
| Layout-driven from Settings | Yes (LayoutItemDelegate) | No (hardcoded) | **Gap** -- QML layout is configurable |
| z-index 600 | Yes | z-index: 10 | Minor -- no conflict in current setup |

### 3.4 BottomBar (`src/components/BottomBar.vue` vs QML `BottomBar.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| Back button (square hitbox, arrow icon) | Yes (full bar height) | Yes (full bar height) | Match |
| Title text (bold, white) | Yes | Yes | Match |
| Custom content area (slot) | Yes (default property alias) | Yes (slot) | Match |
| rightText prop | Yes | **Fixed** (added) | Was missing |
| barColor prop | Yes | Yes | Match |
| Height = bottomBarHeight | Uses Theme.bottomBarHeight (70) | Uses `--bottom-bar-height` (now 70) | **Fixed** |
| Back button signal | Yes (backClicked) | Yes (back emit) | Match |

### 3.5 ActionButton (`src/components/ActionButton.vue` vs QML `ActionButton.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| Size 150x120 | Yes (scaled) | Yes (fixed) | Match |
| Icon + label layout | Yes (Column) | Yes (flex column) | Match |
| Disabled state (gray bg, dimmed icon, secondary text) | Yes | Yes | Match |
| Pressed state (darker) | Yes (Qt.darker 1.2) | Yes (brightness 0.85) | Match |
| Hover state (lighter) | Yes (Qt.lighter 1.1) | **Fixed** (brightness 1.1) | Was missing |
| Border radius | buttonRadius (12px) | var(--radius-button) (12px) | Match |
| Color animation on state change | Yes (100ms) | Yes (transition 0.1s) | Match |
| Long-press / double-click support | Yes (via AccessibleTapHandler) | No | **Gap** -- Vue has no long-press/double-click |
| Keyboard support (Enter/Space) | Yes | No explicit handler (native button) | Acceptable |
| Accessibility | Full (TalkBack integration) | Basic (no ARIA roles beyond button) | **Gap** |

### 3.6 CircularGauge (`src/components/CircularGauge.vue` vs QML `CircularGauge.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| Arc geometry (135 start, 270 sweep) | Yes | Yes | Match |
| Background arc at 20% opacity | Yes | Yes | Match |
| Value arc proportional | Yes | Yes | Match |
| RoundCap | Yes | Yes (stroke-linecap="round") | Match |
| Center value text (20px bold) | Yes | Yes | Match |
| Unit text (label font) | Yes | Yes | Match |
| Label below arc | Yes | Yes | Match |
| Stroke width 8px (scaled) | Yes | 8px (default prop) | Match |
| implicitWidth = gaugeSize (120) | Yes | size prop default 120 | Match |

**Status**: Good parity.

### 3.7 ConnectionIndicator (`src/components/ConnectionIndicator.vue` vs QML `ConnectionIndicator.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| Online: successColor | Yes | Yes | Match |
| Offline: errorColor | Yes | Yes | Match |
| "Online"/"Offline" text (valueFont) | Yes | No (dot only) | **Gap** -- QML shows large text, Vue is just a dot |
| Detail text ("Machine + Scale" etc.) | Yes | No | **Gap** |
| isFlowScale detection | Yes | No | **Gap** |

The QML ConnectionIndicator is a full component showing "Online"/"Offline" in large text plus detail text. The Vue version is a simple colored dot. The IdlePage compensates by showing the text separately, but the component itself has less functionality.

### 3.8 ValueInput (`src/components/ValueInput.vue` vs QML `ValueInput.qml`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| +/- buttons | Yes | Yes | Match |
| Center value display | Yes | Yes | Match |
| Min/max clamping | Yes | Yes | Match |
| Step-based rounding | Yes | Yes | Match |
| Press-and-hold repeat (80ms) | Yes | **Fixed** | Was missing |
| Drag-to-adjust | Yes (20 scaled px = 1 step) | No | **Gap** |
| Tap value to open full-screen popup | Yes | No | **Gap** |
| Speech bubble on press | Yes (animated pop-in) | No | **Gap** |
| Keyboard navigation (arrows, Page Up/Down) | Yes | No | **Gap** |
| displayText override prop | Yes | No | **Gap** |
| valueColor prop | Yes | Yes | Match |
| Suffix prop | Yes | Yes | Match |
| Height 56px | Yes (scaled) | 56px | Match |

**Major gap**: The QML ValueInput has a rich interaction model (drag, popup editor, speech bubble) that the Vue version doesn't have. The basic increment/decrement works, and press-and-hold was added in this audit.

### 3.9 TouchSlider (`src/components/TouchSlider.vue`)

No direct QML equivalent (QML uses ValueInput's drag feature instead). The TouchSlider is a web-native range input with +/- buttons. This is a Vue-specific implementation that serves the same purpose as the drag feature in QML's ValueInput.

### 3.10 HistoryShotGraph (`src/components/HistoryShotGraph.vue`)

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| All 8 series (same as ShotGraph) | Yes | Yes | Match |
| Phase marker vertical lines + labels | Yes | Yes | Match |
| Transition reason suffixes ([W], [P], [F], [T]) | Yes | Yes | Match |
| Interactive (cursor, zoom) | Yes | Yes | Match |
| Auto-fit axes to shot data | Yes | Yes | Match |

**Status**: Good parity.

---

## 4. Composable Audit

### 4.1 useMachine.js

| Feature | Expected | Implemented | Status |
|---------|----------|-------------|--------|
| WebSocket to /ws/v1/machine/snapshot | Yes | Yes | Match |
| Reconnection with exponential backoff | Yes (1s-30s) | Yes (via ReconnectingWebSocket) | Match |
| State extraction (state.state, state.substate) | Yes | Yes | Match |
| All telemetry fields (pressure, flow, temp, etc.) | Yes | Yes | Match |
| steamTemperature | Yes | Yes | Match |
| profileFrame | Yes | Yes | Match |
| requestState action | Yes | Yes | Match |

**Status**: Complete.

### 4.2 useScale.js

| Feature | Expected | Implemented | Status |
|---------|----------|-------------|--------|
| WebSocket to /ws/v1/scale/snapshot | Yes | Yes | Match |
| weight field | Yes | Yes | Match |
| batteryLevel field | Yes | Yes | Match |
| tare() action | Yes | Yes | Match |
| Flow rate (derivative) | Workaround needed | No | **Gap** -- not computing flow rate from weight deltas |

### 4.3 useShotSettings.js

| Feature | Expected | Implemented | Status |
|---------|----------|-------------|--------|
| WebSocket to /ws/v1/machine/shotSettings | Yes | Yes | Match |
| Steam settings fields | Yes | Yes | Match |
| Hot water settings fields | Yes | Yes | Match |

**Status**: Complete.

### 4.4 useWaterLevels.js

| Feature | Expected | Implemented | Status |
|---------|----------|-------------|--------|
| WebSocket to /ws/v1/machine/waterLevels | Yes | Yes | Match |
| currentLevel, refillLevel | Yes | Yes | Match |

**Status**: Complete.

### 4.5 useWorkflow.js

| Feature | Expected | Implemented | Status |
|---------|----------|-------------|--------|
| REST GET/PUT /api/v1/workflow | Yes | Yes | Match |
| All workflow sections | Yes | Yes | Match |
| Loading/error states | Yes | Yes | Match |

**Status**: Complete.

### 4.6 useShotData.js

| Feature | Expected | Implemented | Status |
|---------|----------|-------------|--------|
| Rolling buffer (500 points) | Yes | Yes | Match |
| uPlot-compatible data format | Yes | Yes | Match |
| Typed arrays for performance | Yes | Yes | Match |
| start/stop/addPoint/reset | Yes | Yes | Match |
| elapsed() timer function | Yes | Yes (client-side Date.now) | Match (workaround) |

**Status**: Complete. Note that elapsed time is computed client-side, which may drift from machine-side timing.

### 4.7 useChartConfig.js

| Feature | Expected | Implemented | Status |
|---------|----------|-------------|--------|
| COLORS match Theme.qml | Yes | Yes | Match |
| Shot chart: 4 axes, 8 series | Yes | Yes | Match |
| Profile chart: 3 axes, 4 series | Yes | Yes | Match |
| profileFramesToData conversion | Yes | Yes | Match |
| Discontinuous segments (null values) | Yes | Yes | Match |

**Status**: Complete.

---

## 5. App.vue & Router Audit

### Router (`src/router/index.js`)

- Uses `createWebHashHistory` (correct for static skin deployment)
- 5 routes matching Phase 1 pages
- No lazy loading (all pages imported eagerly -- acceptable for 5 pages)

### App.vue Navigation

| Feature | QML | Vue | Status |
|---------|-----|-----|--------|
| Phase-based auto-navigation | Yes (StackView.replace) | Yes (router.replace) | **Fixed** -- was push |
| Navigation debounce (300ms) | Yes | Yes (added by frontend-dev) | Match |
| Shot data start/stop on espresso transitions | Yes | Yes | Match |
| Completion overlay (steam/HW/flush) | Yes (3s, checkmark, value) | Yes | Match |
| Stop reason overlay (espresso) | Yes (punch animation, 3 reasons) | Yes | Match |
| Keyboard shortcuts (E/S/W/F/Space) | Yes | Yes | Match |
| Provide/inject for shared data | N/A (QML uses singletons) | Yes | Appropriate |
| Sleep state handling | Yes (screensaver) | No | **Gap** -- no sleep/screensaver |

---

## 6. API Layer Audit

### REST API (`src/api/rest.js`)

Comprehensive coverage of the Streamline-Bridge API:
- Machine state (GET/PUT)
- Workflow (GET/PUT)
- Profiles (CRUD + import/export/upload)
- Shot settings (GET/POST)
- Machine settings (GET/POST)
- Scale tare
- Devices (list/scan/connect)
- Shots history (CRUD)
- Key-value store (CRUD)
- Water levels
- USB charger
- REA settings
- Sensors

**Status**: Very thorough. All documented Streamline-Bridge endpoints are covered.

### WebSocket (`src/api/websocket.js`)

- ReconnectingWebSocket with exponential backoff (1s to 30s max)
- Clean JSON parsing with error handling
- Connection state tracking
- Proper cleanup on close

**Status**: Matches CLAUDE.md best practices exactly.

### Gateway (`src/api/gateway.js`)

- Correct dev/production URL switching
- Production uses relative paths and derives WS from window.location
- Development reads from Vite env vars

**Status**: Complete.

---

## 7. Summary of Remaining Gaps (by priority)

### High Priority (blocking core UX)

1. **Preset system on operation pages** -- Steam, Hot Water, and Flush pages all lack preset rows. The QML versions have PresetPillRow with drag-to-reorder, add/edit/delete, and double-click-to-start. Components (PresetPillRow, PresetEditPopup) now exist but are not wired into the operation pages yet.

2. **ValueInput drag-to-adjust and popup editor** -- The QML ValueInput has a rich touch interaction model (drag on value to scrub, tap to open full-screen popup). The Vue version only has +/- buttons and press-and-hold. This is the most-used control in the app.

3. **Settings not sent to machine** -- Steam, Hot Water, and Flush settings are local refs but never sent to the Streamline-Bridge API when changed or when operations start. Need to call `updateShotSettings()` or `updateWorkflow()` with the user's chosen values.

### Medium Priority (expected features)

4. **Brew-by-ratio display on EspressoPage** -- Shows "1:X.X" below weight during extraction
5. **Volume mode on EspressoPage** -- Needs `cumulativeVolume` tracking (client-side flow integration)
6. **Auto-tare on HotWaterPage open** (weight mode)
7. **ConnectionIndicator detail text** -- "Machine + Scale" / "Machine + Simulated Scale"
8. **Configurable layout zones on IdlePage** -- QML has a full JSON-driven zone layout system
9. **Scale flow rate computation** -- Client-side derivative from weight stream
10. **Sleep/screensaver handling** -- Auto-sleep timers, screensaver page

### Low Priority (polish)

11. **ShotGraph frame markers and pump mode bars** during live extraction
12. **BrewDialog** pre-brew settings dialog
13. **ProfilePreviewPopup** on long-press of espresso preset
14. **ActionButton long-press / double-click** support
15. **ValueInput speech bubble** animation on press
16. **Dynamic theme colors** from Settings/KV store

---

## 8. Concurrent Agent Changes Noted

During this audit, other agents (frontend-dev, api-dev) made concurrent changes:
- **App.vue** was enhanced with CompletionOverlay, StopReasonOverlay, keyboard shortcuts, and navigation debounce
- **IdlePage.vue** was updated with shot plan text and workflow injection
- **New components** were created: CompletionOverlay.vue, StopReasonOverlay.vue, PresetPillRow.vue, PresetEditPopup.vue, ProfilePreviewPopup.vue

All concurrent changes were accounted for in this audit. No conflicts were detected.
