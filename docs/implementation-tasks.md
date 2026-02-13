# Decenza-JS Implementation Tasks

Comprehensive phased task list for achieving feature parity between the Qt/QML Decenza DE1 app and the Vue+Vite web skin.

> **Existing codebase**: 16 pages, 30 components, 14 composables, 16 routes, complete REST + WebSocket API integration.

> **Status Legend**: `[x]` = Done, `[~]` = Partial, `[ ]` = Not started, `[!]` = Blocked / needs API

---

## Phase 0 — Foundation Improvements

Fix and enhance the existing code to support all features across subsequent phases.

### P0-1. Settings Persistence Composable (`useSettings`) `[x]`
- **Description**: Create a composable that reads/writes app settings to Streamline-Bridge's key-value store (`/api/v1/store/decenza-js/{key}`). Should support auto-loading on mount, reactive refs for each setting, and debounced auto-save on change. Settings include: layout configuration, theme colors, favorite profiles, presets (steam/hotwater/flush/bean), auto-sleep minutes, headless mode, keep-steam-heater-on, water level display mode, and all other client-side preferences.
- **QML Reference**: `vendor/decenza/src/core/settings.h` (all `Q_PROPERTY` settings)
- **API**: `GET/POST /api/v1/store/decenza-js/{key}`
- **Dependencies**: None
- **Complexity**: M
- **Blocked**: No

### P0-2. Theme System with CSS Custom Properties `[x]`
- **Description**: Enhance `useTheme.js` to support dynamic theming. Load theme from settings, apply as CSS custom properties on `:root`. Support theme presets (built-in named themes), custom color overrides, and random palette generation. Store active theme in key-value store.
- **QML Reference**: `vendor/decenza/qml/Theme.qml`, `SettingsThemesTab.qml`
- **API**: `POST /api/v1/store/decenza-js/theme`
- **Dependencies**: P0-1
- **Complexity**: M
- **Blocked**: No

### P0-3. Workflow Integration for Operation Pages `[x]`
- **Description**: Connect SteamPage, HotWaterPage, and FlushPage settings to the workflow API. When user changes steam duration/flow/temperature, send `PUT /api/v1/workflow` with updated `steamSettings`. Same for hot water (`hotWaterData`) and flush (`rinseData`). Load initial values from workflow on page mount. Currently pages use local `ref()` values that are not persisted or sent to the machine.
- **QML Reference**: `MainController.applySteamSettings()`, `MainController.applyHotWaterSettings()`, `MainController.applyFlushSettings()`
- **API**: `PUT /api/v1/workflow` (partial updates for `steamSettings`, `hotWaterData`, `rinseData`)
- **Dependencies**: None
- **Complexity**: S
- **Blocked**: No

### P0-4. Machine State Mapping Improvements `[x]`
- **Description**: Enhance `useMachine.js` to track derived states: `isReady` (idle or ready states), `isHeating`, `isFlowing`, `isConnected`. Map Streamline-Bridge states/substates to Decenza phases. Add `shotTime` computation from snapshot timestamps (currently done in `useShotData.elapsed()` but not reactive). Track `previousState` for transition detection.
- **QML Reference**: `vendor/decenza/src/machine/machinestate.h` (Phase enum, isReady, isFlowing, isHeating)
- **API**: `ws/v1/machine/snapshot` (state field)
- **Dependencies**: None
- **Complexity**: S
- **Blocked**: No

### P0-5. Completion Overlay Component `[x]`
- **Description**: Implement the operation completion overlay shown when steam/hotwater/flush ends. Full-screen overlay with checkmark circle, completion message ("Steam Complete", etc.), and display value (shotTime for steam/flush, scaleWeight for hot water). Auto-dismiss after 3 seconds, then navigate to idle. Triggered from App.vue when machine returns to idle/ready from an operation state.
- **QML Reference**: `vendor/decenza/qml/main.qml` (Completion Overlay section, lines ~108-113)
- **API**: None (client-side UI)
- **Dependencies**: P0-4
- **Complexity**: S
- **Blocked**: No

### P0-6. Stop Reason Overlay (Espresso) `[x]`
- **Description**: Bottom-positioned pill overlay shown after espresso ends. Displays stop reason: "Stopped manually", "Target weight reached", or "Profile complete". Animated pop-in, 3-second display with fade-out. Determine reason from: user-initiated stop (manual), weight >= target (weight exit), or machine-side completion.
- **QML Reference**: `vendor/decenza/qml/main.qml` (Stop Reason Overlay section)
- **API**: None (client-side, derived from state transitions and weight data)
- **Dependencies**: P0-4
- **Complexity**: S
- **Blocked**: No

### P0-7. Keyboard Shortcuts `[x]`
- **Description**: Add global keyboard shortcuts: E (start espresso), S (start steam), W (start hot water), F (start flush) when machine is ready; Space/Escape to stop current operation and return to idle. Implemented as a global `keydown` listener registered in App.vue.
- **QML Reference**: `vendor/decenza/qml/main.qml` (Keyboard Shortcuts section)
- **API**: `PUT /api/v1/machine/state/{state}`
- **Dependencies**: P0-4
- **Complexity**: S
- **Blocked**: No

### P0-8. Auto-Sleep System `[x]`
- **Description**: Implement client-side auto-sleep countdown. Two counters: `sleepCountdownNormal` (reset on user activity), `sleepCountdownStayAwake` (set on auto-wake). Sleep when both reach 0. Configurable timeout from settings. Pause during active operations. Touch/mouse activity resets normal counter.
- **QML Reference**: `vendor/decenza/qml/main.qml` (Auto-Sleep System section)
- **API**: `PUT /api/v1/machine/state/sleeping`
- **Dependencies**: P0-1, P0-4
- **Complexity**: M
- **Blocked**: No

### P0-9. Navigation Guard (Debounce) `[x]`
- **Description**: Add 300ms navigation debounce to prevent double-tap during page transitions. Wrap router navigation calls with a guard that ignores rapid successive calls.
- **QML Reference**: `vendor/decenza/qml/main.qml` (Navigation guard: 300ms debounce)
- **API**: None (client-side)
- **Dependencies**: None
- **Complexity**: S
- **Blocked**: No

---

## Phase 1 — Core Brewing Flow (Complete the 5 Main Pages)

### P1-1. PresetPillRow Component `[x]`
- **Description**: Multi-row pill layout for preset selection. Shows array of presets as horizontal pill buttons with emoji + label. Supports: click to select, double-click-selected to start operation, long-press to edit, drag-to-reorder. Auto-wraps across rows based on available width. Selected pill highlighted with primary color.
- **QML Reference**: `vendor/decenza/qml/components/PresetPillRow.qml` (272 lines)
- **API**: None (purely UI, data from settings)
- **Dependencies**: None
- **Complexity**: M
- **Blocked**: No

### P1-2. Preset Edit Popup Component `[x]`
- **Description**: Modal popup for editing a preset (steam pitcher, hot water vessel, flush, or bean preset). Fields: name (text), emoji (picker or text input), and operation-specific settings (duration/flow for steam, volume/temperature for hot water, etc.). Save/Delete/Cancel buttons. Delete with confirmation for existing presets.
- **QML Reference**: SteamPage.qml (Preset Edit Popup section), HotWaterPage.qml, FlushPage.qml
- **API**: Saves to settings store via P0-1
- **Dependencies**: P0-1, P1-1
- **Complexity**: M
- **Blocked**: No

### P1-3. IdlePage — Preset Systems `[x]`
- **Description**: Add preset rows to IdlePage for each operation: espresso (favorite profiles), steam (pitcher presets), hot water (vessel presets), flush (flush presets). Click selects preset, double-click starts operation with selected preset's settings. Long-press on espresso preset opens ProfilePreviewPopup.
- **QML Reference**: `vendor/decenza/qml/pages/IdlePage.qml` (Preset System section)
- **API**: `PUT /api/v1/workflow` (to apply preset settings), `POST /api/v1/store/decenza-js/favoriteProfiles`
- **Dependencies**: P0-1, P0-3, P1-1
- **Complexity**: M
- **Blocked**: No

### P1-4. IdlePage — Shot Plan Text `[x]`
- **Description**: Display brewing plan summary on idle page showing dose, yield, ratio, grinder info from the current workflow. E.g., "18.0g in / 36.0g out (1:2.0) | Niche Zero @ 2.5".
- **QML Reference**: `vendor/decenza/qml/pages/IdlePage.qml` (Shot Plan Text section)
- **API**: `GET /api/v1/workflow` (doseData, grinderData)
- **Dependencies**: None
- **Complexity**: S
- **Blocked**: No

### P1-5. IdlePage — Configurable Layout System `[x]`
- **Description**: Implement the JSON-driven layout system from Decenza. 8 configurable zones (topLeft, topRight, statusBar, centerTop, centerMiddle, centerStatus, bottomLeft, bottomRight) with per-zone items, Y-offsets, and scale multipliers. Build LayoutBarZone (horizontal) and LayoutCenterZone (center buttons) renderers. Use LayoutItemDelegate-style factory to render each item type.
- **QML Reference**: `vendor/decenza/qml/components/layout/LayoutBarZone.qml`, `LayoutCenterZone.qml`, `LayoutItemDelegate.qml`
- **API**: `GET/POST /api/v1/store/decenza-js/layout`
- **Dependencies**: P0-1
- **Complexity**: XL
- **Blocked**: No

### P1-6. BrewDialog Component `[x]`
- **Description**: Pre-brew settings dialog shown before starting espresso (configurable via settings). Allows adjusting temperature, dose, ratio, yield before brewing. "Read Scale" button reads current scale weight as dose. Grinder fields (conditional on extended metadata setting). "Update Profile Temperature" and "Update Profile Yield" buttons save back to workflow.
- **QML Reference**: `vendor/decenza/qml/components/BrewDialog.qml` (657 lines)
- **API**: `PUT /api/v1/workflow` (doseData, profile temperature), `GET scale weight` from scale composable
- **Dependencies**: P0-1, P0-3
- **Complexity**: L
- **Blocked**: No

### P1-7. EspressoPage — Phase Markers and Goal Lines `[x]`
- **Description**: Enhance ShotGraph to show frame transition markers (vertical lines at frame boundaries), phase labels at chart top showing transition reason ([W], [P], [F], [T]), and pump mode indicator bars at chart bottom (colored bars showing pressure vs flow mode per frame). Requires tracking `profileFrame` changes from snapshot data.
- **QML Reference**: `vendor/decenza/qml/components/ShotGraph.qml` (Markers, Phase Marker Labels, Pump Mode Indicator Bars sections)
- **API**: `ws/v1/machine/snapshot` (profileFrame field)
- **Dependencies**: None
- **Complexity**: L
- **Blocked**: No

### P1-8. EspressoPage — Volume Mode Support `[x]`
- **Description**: Add volume mode support alongside weight mode. Determined by profile's `stop_at_type` (weight or volume). Volume mode shows cumulative volume from flow integration, progress bar against target volume. Weight mode shows scale weight with progress bar against target weight. Brew-by-ratio display below weight.
- **QML Reference**: `vendor/decenza/qml/pages/EspressoPage.qml` (Weight vs Volume Mode section)
- **API**: Workflow profile `target_volume`/`target_weight`, snapshot flow for volume integration
- **Dependencies**: None
- **Complexity**: M
- **Blocked**: No

### P1-9. EspressoPage — Legend Overlay `[x]`
- **Description**: Custom legend overlay in top-left corner of the shot graph. Semi-transparent background, colored dot + label for each visible series (Pressure, Flow, Temperature, Weight). Matches Decenza's chart legend.
- **QML Reference**: `vendor/decenza/qml/components/ShotGraph.qml` (Legend section)
- **API**: None (client-side UI)
- **Dependencies**: None
- **Complexity**: S
- **Blocked**: No

### P1-10. SteamPage — Presets Integration `[x]`
- **Description**: Add pitcher preset row to SteamPage settings view. Load preset settings (duration, flow) on selection. Double-click starts steaming. Long-press opens edit popup. Persist presets to settings store. Wire steam settings changes to workflow API.
- **QML Reference**: `vendor/decenza/qml/pages/SteamPage.qml` (Pitcher Presets section)
- **API**: `PUT /api/v1/workflow` (steamSettings), `POST /api/v1/store/decenza-js/steamPitcherPresets`
- **Dependencies**: P0-1, P0-3, P1-1, P1-2
- **Complexity**: M
- **Blocked**: No

### P1-11. SteamPage — Steam Heater Control `[x]`
- **Description**: Add steam heater toggle switch. When page opens, force heater on (send steam temperature via shotSettings). Heating indicator when current temp < target - 5. Keep-alive: if `keepSteamHeaterOn=true`, periodically resend steam settings. Back button turns off heater if `keepSteamHeaterOn=false`.
- **QML Reference**: `vendor/decenza/qml/pages/SteamPage.qml` (Steam Heater Control, Heating Indicator sections)
- **API**: `POST /api/v1/machine/shotSettings` (targetSteamTemp), `PUT /api/v1/workflow` (steamSettings)
- **Dependencies**: P0-1
- **Complexity**: M
- **Blocked**: No

### P1-12. SteamPage — Live Flow Slider and Soft Stop `[x]`
- **Description**: During steaming, show adjustable flow rate slider that sends immediate flow updates. Implement two-stage stop for headless machines: first press soft-stops (1-second timeout), second press requests idle. Detect puffing state from substate. Auto-flush countdown display when `steamAutoFlushSeconds > 0`.
- **QML Reference**: `vendor/decenza/qml/pages/SteamPage.qml` (Live Flow Slider, Stop Button, Auto-Flush Countdown sections)
- **API**: `POST /api/v1/machine/shotSettings` (for real-time flow adjustment), `PUT /api/v1/machine/state/idle`
- **Dependencies**: P0-1
- **Complexity**: M
- **Blocked**: Partially — real-time steam flow adjustment may need specific shotSettings fields. Check if `steamFlow` in shotSettings is updated immediately by Streamline-Bridge.

### P1-13. HotWaterPage — Presets and Scale Tare `[x]`
- **Description**: Add vessel preset row to HotWaterPage settings view. Auto-tare scale on page open in weight mode. Load preset settings on selection. Wire volume/weight and temperature to workflow API hotWaterData.
- **QML Reference**: `vendor/decenza/qml/pages/HotWaterPage.qml` (Vessel Presets, Scale Tare sections)
- **API**: `PUT /api/v1/workflow` (hotWaterData), `PUT /api/v1/scale/tare`, `POST /api/v1/store/decenza-js/waterVesselPresets`
- **Dependencies**: P0-1, P0-3, P1-1, P1-2
- **Complexity**: M
- **Blocked**: No

### P1-14. FlushPage — Presets Integration `[x]`
- **Description**: Add flush preset row to FlushPage settings view. Load preset settings (duration, flow) on selection. Wire settings to workflow API rinseData.
- **QML Reference**: `vendor/decenza/qml/pages/FlushPage.qml` (Flush Presets section)
- **API**: `PUT /api/v1/workflow` (rinseData), `POST /api/v1/store/decenza-js/flushPresets`
- **Dependencies**: P0-1, P0-3, P1-1, P1-2
- **Complexity**: M
- **Blocked**: No

### P1-15. ProfilePreviewPopup Component `[x]`
- **Description**: Modal dialog for profile graph preview, shown on long-press of espresso preset. 90% width, 50% height. Header with profile name + "More Info" button + close. Body contains ProfileGraph component. "More Info" navigates to ProfileInfoPage.
- **QML Reference**: `vendor/decenza/qml/components/ProfilePreviewPopup.qml` (172 lines)
- **API**: None (uses already-loaded profile data)
- **Dependencies**: P2-3 (ProfileInfoPage route)
- **Complexity**: S
- **Blocked**: No

### P1-16. StatusBar — Layout-Driven Rendering `[ ]`
- **Description**: Enhance StatusBar to use the layout system's statusBar zone configuration rather than hard-coded items. Render items from `Settings.layoutConfiguration.zones.statusBar` using the same LayoutItemDelegate system. Includes: temperature, waterLevel, connectionStatus, steamTemperature, scaleWeight, etc.
- **QML Reference**: `vendor/decenza/qml/components/StatusBar.qml` (34 lines)
- **API**: Layout config from store
- **Dependencies**: P1-5 (layout system)
- **Complexity**: M
- **Blocked**: No

---

## Phase 2 — Profile & Recipe Management

### P2-1. ProfileSelectorPage `[x]`
- **Description**: Two-panel profile browser. Left panel: filterable list of all profiles (by source: built-in, downloaded, user-created, cleaning). Right panel: favorites list with drag-to-reorder. Profile list items show title, source badge (D/V/U), favorite star, overflow menu (edit, delete). Click to select as active profile. Import buttons for Visualizer and file import.
- **QML Reference**: `vendor/decenza/qml/pages/ProfileSelectorPage.qml` (747 lines)
- **API**: `GET /api/v1/profiles` (with visibility filter), `PUT /api/v1/workflow` (to set active profile), `POST /api/v1/store/decenza-js/favoriteProfiles`, `DELETE /api/v1/profiles/{id}`
- **Dependencies**: P0-1
- **Complexity**: XL
- **Blocked**: No

### P2-2. ProfileEditorPage (Advanced Frame Editor) `[x]`
- **Description**: Frame-based profile editor with interactive ProfileGraph (left) and step editor panel (right). Click frame region on graph to select. Frame list with add/delete/move/duplicate. Step editor panel: name, pump mode (pressure/flow), target value, temperature, duration, transition type, exit conditions (pressure/flow/weight), limiters. Save/Save As/Discard buttons with unsaved changes tracking.
- **QML Reference**: `vendor/decenza/qml/pages/ProfileEditorPage.qml` (2000+ lines)
- **API**: `PUT /api/v1/profiles/{id}` (save), `POST /api/v1/profiles` (save as), `POST /api/v1/machine/profile` (upload to machine), `PUT /api/v1/workflow` (set as active)
- **Dependencies**: ProfileGraph component enhancements (clickable frame regions)
- **Complexity**: XL
- **Blocked**: No

### P2-3. ProfileInfoPage (Read-Only View) `[x]`
- **Description**: Read-only profile details with graph preview, settings summary (stop-at type/value, temperature, frame count), and profile notes. Scrollable layout with card sections.
- **QML Reference**: `vendor/decenza/qml/pages/ProfileInfoPage.qml` (249 lines)
- **API**: `GET /api/v1/profiles/{id}`
- **Dependencies**: None
- **Complexity**: S
- **Blocked**: No

### P2-4. RecipeEditorPage (D-Flow Editor) `[x]`
- **Description**: Simplified phase-based profile editor with recipe sections: Core (dose, stop-at, ratio, notes), Fill (temp, pressure, flow, exit pressure, timeout), Bloom (optional toggle, time), Infuse (pressure, time, by-weight option), Ramp (optional, time), Pour (temp, mode pressure/flow, value, limits), Decline (optional, target, duration). Recipe presets (Classic, Londinium, Turbo, Blooming, D-Flow). Graph-scroll sync. Switch to Advanced Editor with conversion confirmation.
- **QML Reference**: `vendor/decenza/qml/pages/RecipeEditorPage.qml` (1137 lines)
- **API**: `PUT /api/v1/workflow` (to upload recipe as profile + settings), `POST /api/v1/profiles` (save)
- **Dependencies**: P2-2 (for editor switching)
- **Complexity**: XL
- **Blocked**: Partially — D-Flow recipe parameter ↔ frame conversion must be implemented client-side (no server API for this). Reference: `vendor/decenza/src/controllers/maincontroller.*` recipe methods.

### P2-5. ProfileGraph — Interactive Frame Selection `[x]`
- **Description**: Enhance ProfileGraph component with clickable frame regions. Alternating background tint per frame, click emits `frameSelected(index)`, selected frame highlighted with accent color. Frame boundaries as vertical overlays.
- **QML Reference**: `vendor/decenza/qml/components/ProfileGraph.qml` (Frame Region Overlays section)
- **API**: None (client-side UI)
- **Dependencies**: None
- **Complexity**: M
- **Blocked**: No

### P2-6. Router Updates for Profile/Recipe Pages `[x]`
- **Description**: Add routes: `/profiles` (ProfileSelectorPage), `/profile-editor` (ProfileEditorPage), `/recipe-editor` (RecipeEditorPage), `/profile-info/:id` (ProfileInfoPage). Handle profile editor routing: check if current profile is recipe mode, route to D-Flow or Advanced editor accordingly. Support editor switching via `router.replace()`.
- **QML Reference**: `vendor/decenza/qml/main.qml` (Navigation functions, Profile editor routing)
- **API**: None
- **Dependencies**: P2-1, P2-2, P2-3, P2-4
- **Complexity**: S
- **Blocked**: No

---

## Phase 3 — Shot History

### P3-1. ShotHistoryPage `[x]`
- **Description**: Paginated, filterable, selectable list of saved espresso shots. Filter by profile, roaster, bean (cascading). Search with 300ms debounce. Each row: timestamp, profile name, bean/grind info, dose/yield, duration, rating, cloud upload indicator, load/edit/detail buttons. Checkbox multi-select for comparison. Infinite scroll (pageSize 50). "Compare" button opens ShotComparisonPage.
- **QML Reference**: `vendor/decenza/qml/pages/ShotHistoryPage.qml` (653 lines)
- **API**: `GET /api/v1/shots/ids`, `GET /api/v1/shots?ids=...`
- **Dependencies**: None
- **Complexity**: XL
- **Blocked**: Partially — filtering by profile/roaster/bean requires client-side filtering since Streamline-Bridge shots API doesn't support server-side filtering. See API gaps doc.

### P3-2. HistoryShotGraph Enhancements `[x]`
- **Description**: Enhance the HistoryShotGraph component to support loading historical shot data from the Streamline-Bridge shots API. Parse `measurements` array into uPlot format. Add phase markers from frame transitions. Support resizable height with drag handle (min 100px, max 400px, persisted).
- **QML Reference**: `vendor/decenza/qml/components/HistoryShotGraph.qml` (235 lines)
- **API**: `GET /api/v1/shots/{id}` (measurements array)
- **Dependencies**: None
- **Complexity**: M
- **Blocked**: No

### P3-3. ShotDetailPage `[x]`
- **Description**: Individual shot review with: graph card (swipeable between shots), metrics row (duration, dose, output, ratio, rating), info cards (bean info, grinder, analysis TDS/EY, barista, notes). Action bar: view debug log, delete shot (with confirmation), upload to Visualizer, AI advice button. Swipe left/right on graph navigates between shots from history list.
- **QML Reference**: `vendor/decenza/qml/pages/ShotDetailPage.qml` (1027 lines)
- **API**: `GET /api/v1/shots/{id}`, `DELETE /api/v1/shots/{id}`, `PUT /api/v1/shots/{id}` (for notes/metadata)
- **Dependencies**: P3-2
- **Complexity**: L
- **Blocked**: Partially — Visualizer upload and AI advice are advanced features; core detail view is not blocked.

### P3-4. ShotComparisonPage `[x]`
- **Description**: Compare multiple shots with overlay graph. ComparisonGraph with 3-shot sliding window using 3 color sets (green/blue/orange). Curve toggle buttons (pressure/flow/weight). Resizable graph with drag handle. Shot detail columns below graph showing metrics per shot.
- **QML Reference**: `vendor/decenza/qml/pages/ShotComparisonPage.qml` (502 lines), `ComparisonGraph.qml` (210 lines)
- **API**: `GET /api/v1/shots?ids=...`
- **Dependencies**: P3-2
- **Complexity**: L
- **Blocked**: No

### P3-5. PostShotReviewPage (DYE Metadata Editor) `[x]`
- **Description**: Full DYE editor with: resizable shot graph, 3-column field grid (bean info, grinder/beverage, measurements), rating input (0-100% gradient slider with presets), notes textarea. SuggestionField component for autocomplete from previous values. Sticky metadata (bean/grinder info persisted for next shot). Unsaved changes tracking with confirmation dialog. Upload to Visualizer button. Two modes: post-shot (current/last shot) and edit existing shot.
- **QML Reference**: `vendor/decenza/qml/pages/PostShotReviewPage.qml` (1461 lines)
- **API**: `PUT /api/v1/shots/{id}` (save metadata), `GET /api/v1/shots/{id}`, `POST /api/v1/store/decenza-js/stickyMetadata`
- **Dependencies**: P3-2, P0-1
- **Complexity**: XL
- **Blocked**: Partially — shot metadata storage is limited; see API gaps for TDS, EY, beverage type, roast level fields.

### P3-6. SuggestionField Component `[x]`
- **Description**: Auto-complete text field for metadata entry. Shows dropdown of matching suggestions from previous shot values. Supports cascading (e.g., bean suggestions filtered by selected roaster). Touch-friendly suggestion pills.
- **QML Reference**: `vendor/decenza/qml/pages/PostShotReviewPage.qml` (SuggestionField references)
- **API**: `GET /api/v1/shots` (to build suggestion lists from historical metadata)
- **Dependencies**: None
- **Complexity**: M
- **Blocked**: No

### P3-7. RatingInput Component `[x]`
- **Description**: 0-100% rating slider with gradient track (red to yellow to green). Preset buttons (25%/50%/75%/100%). Compact mode with 2x2 button grid. Keyboard support (arrow keys +/-1, PageUp/Down +/-25).
- **QML Reference**: `vendor/decenza/qml/components/RatingInput.qml` (222 lines)
- **API**: None (client-side UI)
- **Dependencies**: None
- **Complexity**: S
- **Blocked**: No

### P3-8. Router Updates for History Pages `[x]`
- **Description**: Add routes: `/history` (ShotHistoryPage), `/shot/:id` (ShotDetailPage), `/shot-comparison` (ShotComparisonPage with shotIds query param), `/shot-review/:id?` (PostShotReviewPage). Handle post-shot auto-navigation when `editAfterShot` setting is enabled.
- **QML Reference**: `vendor/decenza/qml/main.qml` (navigation functions)
- **API**: None
- **Dependencies**: P3-1, P3-3, P3-4, P3-5
- **Complexity**: S
- **Blocked**: No

---

## Phase 4 — Settings & Configuration

### P4-1. SettingsPage Container `[x]`
- **Description**: Tab-based container for all settings categories. Horizontal scrollable tab bar with lazy-loaded tab content. 12-16 tabs depending on applicability. `requestedTabIndex` for deep-linking. Each tab as a separate Vue component loaded via dynamic `component` or `v-if`.
- **QML Reference**: `vendor/decenza/qml/pages/SettingsPage.qml` (484 lines)
- **API**: None (container only)
- **Dependencies**: None
- **Complexity**: M
- **Blocked**: No

### P4-2. Settings: Device Management Tab `[x]`
- **Description**: Replaces QML Bluetooth tab. Shows connected devices from Streamline-Bridge device API. Scan button triggers BLE scan. Device list with connect action. Scale section: weight display + tare button, connected scale info. Machine section: firmware version, connection status.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsBluetoothTab.qml` (591 lines)
- **API**: `GET /api/v1/devices`, `GET /api/v1/devices/scan`, `PUT /api/v1/devices/connect?deviceId=...`, `PUT /api/v1/scale/tare`, `GET /api/v1/machine/info`
- **Dependencies**: P4-1
- **Complexity**: M
- **Blocked**: No

### P4-3. Settings: Preferences Tab `[x]`
- **Description**: Machine behavior preferences: auto-sleep timeout (ValueInput 0-240 min), keep steam heater on (toggle), auto-flush wand duration (ValueInput 0-60s), USB charging mode (Off/On/Night combo), headless machine toggle.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsPreferencesTab.qml` (599 lines)
- **API**: `POST /api/v1/machine/settings` (for machine settings), `POST /api/v1/store/decenza-js/preferences` (for app settings), `PUT /api/v1/machine/usb/enable|disable`
- **Dependencies**: P4-1, P0-1
- **Complexity**: M
- **Blocked**: No

### P4-4. Settings: Options Tab `[x]`
- **Description**: Advanced options: water level display mode (ml/%), water refill threshold, headless machine toggle, auto-wake timer (7-day schedule with enable toggle + time picker per day), stay-awake duration after auto-wake.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsOptionsTab.qml` (820 lines)
- **API**: `POST /api/v1/machine/settings`, `POST /api/v1/store/decenza-js/autoWake`, `POST /api/v1/machine/waterLevels`
- **Dependencies**: P4-1, P0-1
- **Complexity**: L
- **Blocked**: Partially — auto-wake scheduling requires client-side timer implementation; there is no server-side auto-wake API in Streamline-Bridge.

### P4-5. Settings: Themes Tab `[x]`
- **Description**: Visual theme customization. Left panel: scrollable color swatch list organized by category (Core UI, Status, Chart). Right panel: hex input + color picker (hue/saturation/lightness). Preset theme buttons with save/delete. Random theme generator.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsThemesTab.qml` (375 lines)
- **API**: `POST /api/v1/store/decenza-js/theme`
- **Dependencies**: P4-1, P0-2
- **Complexity**: L
- **Blocked**: No

### P4-6. Settings: Layout Tab `[ ]`
- **Description**: Home screen layout customizer. 8 zone editors showing current widgets. Per-item actions: remove, move left/right. Add button opens library panel. Center zones have Y-offset and scale controls. Library panel shows available widget types. Safety check ensures settings widget is always accessible.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsLayoutTab.qml` (378 lines)
- **API**: `POST /api/v1/store/decenza-js/layout`
- **Dependencies**: P4-1, P1-5
- **Complexity**: XL
- **Blocked**: No

### P4-7. Settings: Visualizer Tab `[x]`
- **Description**: Visualizer.coffee account configuration. Username/password fields with test connection button. Upload settings: auto-upload toggle, minimum duration, extended metadata toggle, edit-after-shot toggle, default shot rating.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsVisualizerTab.qml` (438 lines)
- **API**: `POST /api/v1/store/decenza-js/visualizer` (credentials), direct HTTP to visualizer.coffee API
- **Dependencies**: P4-1, P0-1
- **Complexity**: M
- **Blocked**: No

### P4-8. Settings: AI Tab `[x]`
- **Description**: AI provider configuration: provider selection buttons (OpenAI, Anthropic, Gemini, OpenRouter, Ollama), API key input, model selection for Ollama/OpenRouter, test connection, cost estimates. Conversation overlay for testing.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsAITab.qml` (503 lines)
- **API**: `POST /api/v1/store/decenza-js/ai` (settings), direct HTTP to AI provider APIs
- **Dependencies**: P4-1, P0-1
- **Complexity**: L
- **Blocked**: No

### P4-9. Settings: Accessibility Tab `[x]`
- **Description**: Accessibility settings: enable/disable toggle, voice announcements via Web Speech API, frame tick sounds via Web Audio API, extraction announcement modes (timed/milestones), update interval.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsAccessibilityTab.qml` (310 lines)
- **API**: `POST /api/v1/store/decenza-js/accessibility`
- **Dependencies**: P4-1, P0-1
- **Complexity**: M
- **Blocked**: No

### P4-10. Settings: About Tab `[x]`
- **Description**: Static about page: app title, version, build info, story/credits text, donation section with PayPal link and QR code.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsAboutTab.qml` (172 lines)
- **API**: None (static content)
- **Dependencies**: P4-1
- **Complexity**: S
- **Blocked**: No

### P4-11. Settings: Shot History Tab `[x]`
- **Description**: Shot history management: navigate button to history page, total shots count, show-on-idle toggle, auto-favorites toggle. Remote access section is informational only (the web skin IS remote access).
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsShotHistoryTab.qml` (638 lines)
- **API**: `GET /api/v1/shots/ids` (count), `POST /api/v1/store/decenza-js/historySettings`
- **Dependencies**: P4-1, P0-1
- **Complexity**: S
- **Blocked**: No

### P4-12. Settings: Gateway (REA) Settings Tab `[x]`
- **Description**: Web-specific settings tab for Streamline-Bridge configuration: gateway mode, log level, weight/volume flow multipliers, scale power mode, preferred machine ID. Replaces some Debug tab features.
- **QML Reference**: N/A (web-specific, replaces non-applicable tabs)
- **API**: `GET/POST /api/v1/settings`
- **Dependencies**: P4-1
- **Complexity**: M
- **Blocked**: No

### P4-13. Router Update for Settings `[x]`
- **Description**: Add route: `/settings/:tab?` (SettingsPage with optional tab index). Support deep-linking from other pages (e.g., "configure AI" link from shot detail).
- **QML Reference**: `vendor/decenza/qml/main.qml` (`goToSettings(tabIndex)`)
- **API**: None
- **Dependencies**: P4-1
- **Complexity**: S
- **Blocked**: No

---

## Phase 5 — Advanced Features

### P5-1. ScreensaverPage `[x]`
- **Description**: Full-screen screensaver with multiple modes. Flip clock: pure CSS/JS animated clock. Disabled: black screen. "Touch to wake" hint. Wake behavior: send wake command to machine + navigate to idle. Detect idle via mouse/touch inactivity timer. Additional modes (pipes, attractor, shotmap) can use WebGL/Three.js but are lower priority.
- **QML Reference**: `vendor/decenza/qml/pages/ScreensaverPage.qml` (489 lines)
- **API**: `PUT /api/v1/machine/state/idle` (wake machine)
- **Dependencies**: P0-1, P0-8
- **Complexity**: L (flip clock mode: M; 3D modes: XL)
- **Blocked**: No

### P5-2. Settings: Screensaver Tab `[x]`
- **Description**: Screensaver type selector (disabled, flip clock, videos, pipes, attractor, shot map). Type-specific settings: flip clock (24h toggle, 3D perspective), pipes (speed, rotation, clock), etc.
- **QML Reference**: `vendor/decenza/qml/pages/settings/SettingsScreensaverTab.qml` (903 lines)
- **API**: `POST /api/v1/store/decenza-js/screensaver`
- **Dependencies**: P4-1, P5-1
- **Complexity**: M
- **Blocked**: No

### P5-3. DescalingPage (Wizard) `[x]`
- **Description**: 3-phase guided descaling wizard. Phase 1: preparation checklist (5 steps), solution recipe, steam heater control. Phase 2: progress bar mapping substates 8-12 to 5 visual steps, timer, warning text, emergency stop. Phase 3: rinse instructions (3 steps), done button. Cleanup on destroy: restore steam, re-upload profile.
- **QML Reference**: `vendor/decenza/qml/pages/DescalingPage.qml` (709 lines)
- **API**: `PUT /api/v1/machine/state/descaling` (start), `ws/v1/machine/snapshot` (track substates), `POST /api/v1/machine/shotSettings` (steam heater control), `POST /api/v1/machine/profile` (restore profile)
- **Dependencies**: P0-4
- **Complexity**: L
- **Blocked**: Partially — need to verify that Streamline-Bridge supports descaling state transition and exposes descaling substates in snapshot.

### P5-4. VisualizerBrowserPage `[x]`
- **Description**: Profile import from visualizer.coffee via share codes. 4-character code input, import button navigates to multi-import view. Duplicate handling dialog (overwrite/save as new/cancel).
- **QML Reference**: `vendor/decenza/qml/pages/VisualizerBrowserPage.qml` (449 lines)
- **API**: Direct HTTP to visualizer.coffee API, `POST /api/v1/profiles` (save imported profile)
- **Dependencies**: None
- **Complexity**: M
- **Blocked**: No

### P5-5. VisualizerMultiImportPage `[x]`
- **Description**: Batch import from visualizer.coffee. Split layout: profile list (45%) showing status icons + details panel (55%). Import individual or all profiles. Status icons: importable, already imported, invalid, built-in, downloaded.
- **QML Reference**: `vendor/decenza/qml/pages/VisualizerMultiImportPage.qml` (906 lines)
- **API**: Direct HTTP to visualizer.coffee, `POST /api/v1/profiles`
- **Dependencies**: P5-4
- **Complexity**: L
- **Blocked**: No

### P5-6. BeanInfoPage `[x]`
- **Description**: Bean preset management page. Top: draggable preset pill bar. Main: 3-column DYE field grid (same as PostShotReviewPage). Add/edit/delete/reorder presets. Guest bean dialog for temporary settings. Auto-save values back to selected preset.
- **QML Reference**: `vendor/decenza/qml/pages/BeanInfoPage.qml` (1214 lines)
- **API**: `POST /api/v1/store/decenza-js/beanPresets`, `PUT /api/v1/workflow` (coffeeData, grinderData)
- **Dependencies**: P0-1, P3-6, P3-7
- **Complexity**: L
- **Blocked**: No

### P5-7. Visualizer Shot Upload Service `[!]`
- **Description**: Implement visualizer.coffee upload: authenticate with stored credentials, format shot data (measurements + metadata) for visualizer API, upload with progress feedback. Auto-upload option for shots above minimum duration. Re-upload for already-uploaded shots.
- **QML Reference**: `vendor/decenza/src/network/visualizeruploader.*`
- **API**: Direct HTTP to visualizer.coffee API, `POST /api/v1/store/decenza-js/visualizer` (credentials)
- **Dependencies**: P4-7
- **Complexity**: L
- **Blocked**: No

### P5-8. AI Shot Analysis Service `[x]`
- **Description**: Client-side AI integration for shot analysis. Format shot data (pressure/flow/temp/weight arrays + metadata) as context. Support multiple providers (OpenAI, Anthropic, Gemini, OpenRouter, Ollama) with configured API keys. Conversation overlay with markdown rendering. System prompts vary by beverage type.
- **QML Reference**: `vendor/decenza/qml/pages/ShotDetailPage.qml` (AI Conversation Overlay), `SettingsAITab.qml`
- **API**: Direct HTTP to AI provider APIs, `POST /api/v1/store/decenza-js/ai`
- **Dependencies**: P4-8
- **Complexity**: L
- **Blocked**: No

### P5-9. Dialing Assistant Page `[x]`
- **Description**: Display AI-generated dialing recommendations with follow-up conversation. Loading/error/success states. Scrollable markdown recommendation. Follow-up input. Copy to clipboard + done buttons.
- **QML Reference**: `vendor/decenza/qml/pages/DialingAssistantPage.qml` (332 lines)
- **API**: AI provider APIs
- **Dependencies**: P5-8
- **Complexity**: M
- **Blocked**: No

### P5-10. Router Updates for Advanced Features `[x]`
- **Description**: Add routes: `/screensaver`, `/descaling`, `/visualizer-import`, `/visualizer-multi-import`, `/bean-info`, `/dialing-assistant`. Handle auto-navigation to screensaver on sleep and descaling on descale state.
- **Dependencies**: P5-1 through P5-9
- **Complexity**: S
- **Blocked**: No

---

## Phase 6 — Polish & Quality

### P6-1. Touch Gesture Support `[x]`
- **Description**: Implement SwipeableArea component for touch swipe gestures. Used for shot navigation in detail/comparison pages. Detect horizontal swipe (left/right) with threshold and velocity.
- **QML Reference**: `vendor/decenza/qml/components/SwipeableArea`
- **Complexity**: S
- **Blocked**: No

### P6-2. ValueInput Enhancements `[x]`
- **Description**: Add drag-to-adjust (20px = 1 step), speech bubble on press, full-screen popup editor on tap, press-and-hold repeat at 80ms interval. Currently only has basic +/- buttons.
- **QML Reference**: `vendor/decenza/qml/components/ValueInput.qml` (672 lines)
- **Complexity**: M
- **Blocked**: No

### P6-3. Page Transition Animations `[x]`
- **Description**: Add smooth page transitions. Instant for auto-navigation (machine state changes), subtle slide for user-initiated navigation. Vue Router transition component with CSS animations.
- **Complexity**: S
- **Blocked**: No

### P6-4. Accessibility (ARIA) `[x]`
- **Description**: Add proper ARIA attributes to all interactive elements. Ensure keyboard navigation works throughout. Screen reader announcements for state changes. Focus management on page transitions.
- **Complexity**: M
- **Blocked**: No

### P6-5. Performance Optimization `[x]`
- **Description**: Profile chart rendering with `requestAnimationFrame` throttling. Optimize WebSocket message handling (batch reactive updates). Virtual scrolling for long lists (shot history, profile list). Lazy-load routes.
- **Complexity**: M
- **Blocked**: No

### P6-6. Error Handling & Toast Notifications `[x]`
- **Description**: Global error handling for API failures. Toast notification system for user feedback (success/error/warning). Connection lost banner. Retry logic for failed API calls.
- **Complexity**: M
- **Blocked**: No

### P6-7. i18n Foundation `[x]`
- **Description**: Set up vue-i18n with English as base language. Extract all user-facing strings to locale files. Support for future language additions.
- **Complexity**: M
- **Blocked**: No

### P6-8. Responsive Layout for Different Screen Sizes `[x]`
- **Description**: Ensure all pages work well on tablet (960x600 reference), desktop (1920x1080), and mobile portrait/landscape. Use CSS container queries or media queries. Scale-based sizing matching Decenza's `Theme.scaled()`.
- **Complexity**: L
- **Blocked**: No

---

## Task Dependency Summary

```
Phase 0 (Foundation):
  P0-1 (Settings) ← P0-2 (Theme), P0-8 (Auto-Sleep)
  P0-4 (Machine State) ← P0-5 (Completion Overlay), P0-6 (Stop Reason), P0-7 (Keyboard)

Phase 1 (Core Brewing):
  P1-1 (PresetPillRow) ← P1-2 (Preset Edit), P1-3 (Idle Presets), P1-10-14 (All preset pages)
  P0-1 + P0-3 ← All preset/settings integrations
  P1-5 (Layout System) ← P1-16 (StatusBar Layout), P4-6 (Layout Settings)

Phase 2 (Profiles):
  P2-5 (Interactive ProfileGraph) ← P2-2 (Profile Editor)
  P2-2 ↔ P2-4 (Editor switching)

Phase 3 (History):
  P3-2 (HistoryShotGraph) ← P3-3 (Detail), P3-4 (Comparison), P3-5 (Review)
  P3-6 (SuggestionField) + P3-7 (RatingInput) ← P3-5 (Review)

Phase 4 (Settings):
  P4-1 (Container) ← All settings tabs
  P0-1 (Settings Composable) ← Most settings tabs

Phase 5 (Advanced):
  P4-7 (Visualizer Settings) ← P5-7 (Upload Service)
  P4-8 (AI Settings) ← P5-8 (AI Service) ← P5-9 (Dialing)
```

---

## Complexity Legend

| Size | Description | Estimated Scope |
|------|-------------|-----------------|
| S | Small | Single component or simple function, <100 lines |
| M | Medium | Component with moderate logic, 100-300 lines |
| L | Large | Full page or complex component, 300-700 lines |
| XL | Extra Large | Major feature with multiple sub-components, 700+ lines |

---

## User Interaction Parity Status

Comparison of QML user interactions vs JS implementation (updated Feb 2026).

### Fully Matched Interactions

| Interaction | Pages | Notes |
|-------------|-------|-------|
| Single tap to select preset | All preset pages | PresetPillRow handles select |
| Double-tap to activate (start operation) | All preset pages | PresetPillRow handles activate |
| Long-press to edit preset | Steam, HotWater, Flush | Opens PresetEditPopup |
| Add preset button | Steam, HotWater, Flush | Creates new preset |
| ValueInput +/- buttons | All settings pages | With press-and-hold repeat |
| ValueInput drag-to-adjust | All settings pages | 20px = 1 step |
| ValueInput keyboard (arrows, PageUp/Down) | All settings pages | Full keyboard support |
| Keyboard shortcuts (E/S/W/F to start, Space/Escape to stop) | Global (App.vue) | Implemented in App.vue |
| Swipe left/right on shot graph | ShotDetail | SwipeableArea component |
| Search with debounce | ShotHistory, ProfileSelector | 300ms debounce |
| Star/favorite toggle | ProfileSelector | Click to toggle |
| Mode toggle (Weight/Volume) | HotWater | Pill buttons |
| Espresso stop button | Espresso | Back button + keyboard shortcuts |
| Shot comparison curve toggles | ShotComparison | Pressure/Flow/Weight toggles |
| Delete confirmation | ShotDetail | Two-step confirmation |
| Unsaved changes navigation guard | PostShotReview | Discard/Stay/Save dialog |
| Profile preview on long-press | IdlePage | ProfilePreviewPopup |
| Auto-navigation on machine state change | Global (App.vue) | All operation states |
| Completion overlay (Steam/HotWater/Flush) | Global (App.vue) | 3s auto-dismiss |
| Stop reason overlay (Espresso) | Global (App.vue) | Manual/weight/profile |
| Per-row Load/Edit buttons | ShotHistory | Load profile, edit metadata |
| Stop buttons during operations | Steam, HotWater, Flush | Red stop button in live view |
| Preset pills during active operations | Steam, HotWater, Flush | Switch presets mid-operation |
| Remove shot from comparison | ShotComparison | X button per shot |
| Espresso favorite presets (two-step) | IdlePage | Tap loads, double-tap starts |

### Not Yet Implemented (deferred)

| Interaction | Pages | Reason |
|-------------|-------|--------|
| Drag-to-reorder presets | All preset pages | Phase 6 (touch gestures) |
| Profile drag-to-reorder favorites | ProfileSelector | Phase 6 (touch gestures) |
| Graph resize handle | ShotComparison, PostShotReview | Phase 6 (touch gestures) |
| Developer mode easter egg (5s long-press) | IdlePage | Low priority |
| Accessibility swipe/announce | Espresso | Phase 6 (accessibility) |
| Two-stage stop (soft stop + purge) | Steam | Edge case for headless machines |

### Features Not Supported by ReaPrime API

| Feature | Status | Notes |
|---------|--------|-------|
| Visualizer.coffee upload | Shows UI, not functional | Requires direct HTTP to visualizer.coffee (CORS) |
| AI shot analysis | Shows UI, not functional | Requires AI provider API keys + direct HTTP |
| Dialing assistant | Shows UI, not functional | Depends on AI service |
| Auto-wake scheduling | Client-side only | No server-side timer in ReaPrime |
| Profile editor (frame editing) | Not implemented | API supports CRUD but editor is XL UI work |
| D-Flow recipe conversion | Not implemented | Client-side algorithm needed |

### Overall Completion

| Phase | Done | Partial | Not Started | Total | % |
|-------|------|---------|-------------|-------|---|
| Phase 0 | 7 | 2 | 0 | 9 | 89% |
| Phase 1 | 14 | 1 | 1 | 16 | 91% |
| Phase 2 | 3 | 0 | 3 | 6 | 50% |
| Phase 3 | 7 | 1 | 0 | 8 | 94% |
| Phase 4 | 10 | 0 | 3 | 13 | 77% |
| Phase 5 | 5 | 1 | 1 | 10 | 55% |
| Phase 6 | 4 | 2 | 2 | 8 | 63% |
| **Total** | **50** | **7** | **10** | **70** | **76%** |
