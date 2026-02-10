# Streamline-Bridge API Gaps for Decenza Feature Parity

Cross-reference of Decenza features against the Streamline-Bridge REST + WebSocket API (`vendor/reaprime/doc/Skins.md`). Each gap identifies a Decenza feature with no corresponding API support.

---

## Critical (Blocks Core Functionality)

### 1. Shot Timer / Elapsed Time
- **Decenza feature**: `MachineState.shotTime` provides a running shot timer (seconds) used on EspressoPage, SteamPage, and FlushPage
- **QML source**: `vendor/decenza/src/machine/machinestate.h` — `shotTime` property
- **Current API**: The machine snapshot provides `timestamp` but no `shotTime` or `elapsedTime` field
- **What's needed**: A `shotTime` field in the snapshot, or a `shotStartTimestamp` to calculate elapsed time from
- **Workaround**: Client-side timer started when state transitions to an operation state. Currently implemented in `useShotData.js` using `Date.now()` — functional but may drift from machine-side timing and does not account for preheating duration correctly.

### 2. Scale Flow Rate (Weight-Based)
- **Decenza feature**: `MachineState.scaleFlowRate` — weight change rate from scale, displayed on EspressoPage and used for flow-based weight estimation
- **QML source**: `vendor/decenza/src/machine/machinestate.h` — `scaleFlowRate` property
- **Current API**: Scale snapshot provides `weight` and `batteryLevel` only. Shot measurements include `weightFlow` but only in historical shot records.
- **What's needed**: `weightFlow` field in the real-time scale snapshot WebSocket stream
- **Workaround**: Client-side derivative calculation: `(weight[n] - weight[n-1]) / dt`. Works but is noisy without smoothing.

### 3. Cumulative Volume (Flow Integration)
- **Decenza feature**: `MachineState.cumulativeVolume` — integrated volume from flow meter, used for volume-mode stop-at and display
- **QML source**: `vendor/decenza/src/machine/machinestate.h` — `cumulativeVolume` property
- **Current API**: Machine snapshot provides `flow` but no cumulative volume. Shot measurements include a `volume` field but only in historical records.
- **What's needed**: A `cumulativeVolume` or `volume` field in the real-time machine snapshot
- **Workaround**: Client-side numerical integration of `flow * dt` from snapshot stream. Functional but may accumulate error differently than machine-side integration.

### 4. Stop-At-Weight / Target Weight Reached Event
- **Decenza feature**: The app monitors scale weight during espresso and sends a stop command when target weight is reached. `MachineState.targetWeightReached` signal triggers shot stop.
- **QML source**: `vendor/decenza/src/machine/machinestate.h` — `targetWeightReached` signal, `targetWeight` property
- **Current API**: Streamline-Bridge's `ShotController` handles stop-at-weight server-side. The skin does NOT need to implement this — Streamline-Bridge will stop the shot automatically.
- **What's needed**: Nothing for basic functionality. However, to display progress (weight/target, progress bar), the skin needs to know the target weight. This is available via `GET /api/v1/workflow` (`doseData.doseOut`) and in the profile's `target_weight` field.
- **Workaround**: Read target weight from workflow's `doseData.doseOut`. **Not actually a gap** for core stop-at-weight, but target weight display requires workflow fetch.

### 5. Real-Time Steam Flow Adjustment During Steaming
- **Decenza feature**: During steaming, user can adjust steam flow in real-time via slider. `MainController.setSteamFlowImmediate()` sends updated flow to machine immediately.
- **QML source**: `vendor/decenza/qml/pages/SteamPage.qml` (Live Flow Slider section)
- **Current API**: `POST /api/v1/machine/shotSettings` can update `steamSetting` (steam flow). `PUT /api/v1/workflow` can update `steamSettings.flow`. Unclear if updates during active steaming are applied immediately.
- **What's needed**: Confirmation that `POST /api/v1/machine/shotSettings` applies immediately during active steaming, not just when idle
- **Workaround**: Send `POST /api/v1/machine/shotSettings` with updated `steamSetting` field during steaming. Likely works but needs testing.

---

## Important (Blocks Significant Features)

### 6. Shot History Filtering (Server-Side)
- **Decenza feature**: Shot history page filters by profile name, roaster, bean type, and free-text search
- **QML source**: `vendor/decenza/qml/pages/ShotHistoryPage.qml` — filter system
- **Current API**: `GET /api/v1/shots/ids` returns all IDs. `GET /api/v1/shots?ids=...` returns specific shots. No filter parameters.
- **What's needed**: Server-side filtering: `GET /api/v1/shots?profile=...&roaster=...&bean=...&search=...` with pagination (`offset`, `limit`)
- **Workaround**: Fetch all shot IDs, then fetch shots in pages, filter client-side. Works but inefficient with large history (hundreds of shots).

### 7. Shot Metadata Fields (DYE)
- **Decenza feature**: Rich shot metadata: roaster, bean brand/type, roast date, roast level, grinder model/setting, barista, beverage type, TDS, EY, enjoyment rating (0-100), notes
- **QML source**: `vendor/decenza/qml/pages/PostShotReviewPage.qml`
- **Current API**: `PUT /api/v1/shots/{id}` supports `shotNotes` (string) and `metadata` (flexible JSON object with any fields like `rating`, `tags`, `favorite`, `barista`)
- **What's needed**: The flexible `metadata` field can store all DYE fields. **Not actually a strict gap** — the metadata object accepts arbitrary keys. Store all DYE fields as: `metadata.roaster`, `metadata.beanBrand`, `metadata.beanType`, `metadata.roastDate`, `metadata.roastLevel`, `metadata.grinder`, `metadata.grinderSetting`, `metadata.barista`, `metadata.beverageType`, `metadata.tds`, `metadata.ey`, `metadata.enjoyment`, and notes in `shotNotes`.
- **Workaround**: Use the flexible `metadata` object. **This works**, but querying/filtering by these fields requires client-side processing since there's no server-side indexing on metadata fields.

### 8. Unique Value Lists for Filters (Roasters, Beans, Profiles)
- **Decenza feature**: `shotHistory.uniqueProfiles`, `uniqueRoasters`, `uniqueBeans` — pre-computed distinct value lists for filter dropdowns
- **QML source**: `vendor/decenza/qml/pages/ShotHistoryPage.qml` — filter dropdowns
- **Current API**: No API for distinct metadata values across shots
- **What's needed**: `GET /api/v1/shots/filters` returning `{ profiles: [...], roasters: [...], beans: [...] }` or similar
- **Workaround**: Fetch all shots (or recent N shots), extract unique values client-side. Cache results.

### 9. Profile Categories (Built-in vs Downloaded vs User-Created)
- **Decenza feature**: Profiles are categorized by source: Decent built-in (D badge), Downloaded from Visualizer (V badge), User-created (U badge). Separate filter views for each.
- **QML source**: `vendor/decenza/qml/pages/ProfileSelectorPage.qml` — Filter Dropdown
- **Current API**: `GET /api/v1/profiles` returns profiles with `isDefault` boolean and `visibility` field. No `source` or `category` field distinguishing downloaded vs user-created.
- **What's needed**: A `source` field on profile records: `"default"`, `"visualizer"`, `"user"`. Or ability to set/get this via profile `metadata`.
- **Workaround**: Use `isDefault: true` for built-in. Store `source: "visualizer"` in profile `metadata` when importing from Visualizer. Profiles with `isDefault: false` and no `metadata.source` are user-created. Works but requires discipline at import time.

### 10. Profile Favorites (Ordered List)
- **Decenza feature**: User maintains an ordered list of favorite profiles, displayed on IdlePage and ProfileSelectorPage right panel. Drag-to-reorder. Max 50 favorites.
- **QML source**: `vendor/decenza/qml/pages/ProfileSelectorPage.qml` — Right Panel Favorites
- **Current API**: No favorite system in profiles API. Profiles have `metadata` (flexible) but no ordered favorite list.
- **What's needed**: Either a favorites field on the server or client-side storage
- **Workaround**: Store ordered favorite profile IDs in key-value store: `POST /api/v1/store/decenza-js/favoriteProfiles`. **This works well** — not really a gap since KV store is designed for this.

### 11. Machine Sub-State for Steam Puffing Detection
- **Decenza feature**: Detect steam puffing state (`DE1Device.subState === 20`) for auto-flush countdown and soft-stop behavior
- **QML source**: `vendor/decenza/qml/pages/SteamPage.qml` — `DE1Device.subState === 20`
- **Current API**: Snapshot includes `state.substate` as a string enum. The puffing substate may not be exposed or may be mapped to a different string.
- **What's needed**: Verify that `state.substate` includes a value for the puffing/purge phase during steaming. If Streamline-Bridge maps substate 20 to a named string, document what it is.
- **Workaround**: Monitor `state.substate` values during steam operation to discover the puffing substate string. If not available, auto-flush countdown can be time-based only.

### 12. Descaling Substates
- **Decenza feature**: Descaling page maps substates 8-12 to 5 visual progress steps
- **QML source**: `vendor/decenza/qml/pages/DescalingPage.qml` — Phase 2 progress mapping
- **Current API**: Machine states include `descaling` and `cleaning`. Substates listed include `cleaningStart`, `cleaingGroup`, `cleanSoaking`, `cleaningSteam` but no specific descaling substates.
- **What's needed**: Descaling-specific substates exposed in the snapshot (or numeric substates that can be mapped)
- **Workaround**: If descaling substates are not exposed, show an indeterminate progress bar during descaling. The wizard's preparation and rinse phases are client-side instruction steps that don't depend on substates.

### 13. GHC (Group Head Controller) Detection
- **Decenza feature**: `DE1Device.isHeadless` determines if the machine has physical buttons (GHC) or is headless. Headless machines show on-screen stop buttons.
- **QML source**: Various pages — `DE1Device.isHeadless` check for stop button visibility
- **Current API**: `GET /api/v1/machine/info` returns `{ GHC: true/false }`. The `GHC` field indicates whether a Group Head Controller is present.
- **What's needed**: **Not a gap** — `GHC` field in machine info tells us. `isHeadless = !machineInfo.GHC`.
- **Workaround**: N/A — supported.

---

## Nice-to-Have (Enhancement-Level)

### 14. Visualizer.coffee Integration API (Server-Side Proxy)
- **Decenza feature**: Upload shots to visualizer.coffee, import profiles via share codes
- **QML source**: `vendor/decenza/src/network/visualizeruploader.*`, `visualizerimporter.*`
- **Current API**: No visualizer.coffee proxy in Streamline-Bridge
- **What's needed**: `POST /api/v1/visualizer/upload` (proxy shot upload), `GET /api/v1/visualizer/profile/{shareCode}` (proxy profile fetch)
- **Workaround**: Direct HTTP from browser to visualizer.coffee API. CORS may be an issue — visualizer.coffee would need to allow cross-origin requests, or the skin can proxy through a service worker. Most likely works directly since visualizer.coffee is a public API.

### 15. Auto-Wake Scheduling
- **Decenza feature**: Per-day auto-wake timers (Mon-Sun with enable toggle + time picker)
- **QML source**: `vendor/decenza/qml/pages/settings/SettingsOptionsTab.qml` — Auto-Wake Timer
- **Current API**: No scheduling API in Streamline-Bridge
- **What's needed**: `POST /api/v1/machine/schedule` or client-side scheduling
- **Workaround**: Store schedule in KV store. Implement client-side: when skin is loaded and schedule triggers, send `PUT /api/v1/machine/state/idle` to wake. **Limitation**: only works when the skin is actively loaded in a browser. A Streamline-Bridge plugin would be more reliable.

### 16. Battery Charging Mode Control
- **Decenza feature**: Smart battery charging (Off/On/Night modes) with periodic resend
- **QML source**: `vendor/decenza/qml/pages/settings/SettingsPreferencesTab.qml` — Battery Charging
- **Current API**: `PUT /api/v1/machine/usb/enable` and `PUT /api/v1/machine/usb/disable` for USB charger. No smart charging mode API.
- **What's needed**: Charging mode API or the ability to set target charge levels
- **Workaround**: Use USB enable/disable as basic on/off. Smart charging logic (maintain 55-65% charge) would need battery level monitoring — currently no battery level in machine snapshot (only scale has batteryLevel). **Partially blocked** — DE1 battery level is not exposed in the API.

### 17. Machine Battery Level
- **Decenza feature**: Battery indicator showing current charge level and charging animation
- **QML source**: `vendor/decenza/qml/pages/settings/SettingsPreferencesTab.qml` — Battery indicator
- **Current API**: No machine battery level field in snapshot or machine info
- **What's needed**: `batteryLevel` field in machine info or snapshot
- **Workaround**: None — cannot display battery without data. Could be added as a Streamline-Bridge feature request.

### 18. Water Level in Milliliters
- **Decenza feature**: Water level display in both % and mL modes
- **QML source**: `vendor/decenza/qml/pages/settings/SettingsOptionsTab.qml` — Water Level Display mode
- **Current API**: Water levels WebSocket provides `currentLevel` (percentage) and `refillLevel`. No mL value.
- **What's needed**: `currentLevelMl` field in water level stream
- **Workaround**: Display percentage only. ML would require known tank capacity and percentage-to-volume conversion (tank is not perfectly linear). Can approximate with a lookup table.

### 19. Frame-by-Frame Skip Command
- **Decenza feature**: App sends `SkipToNext` BLE command (0x0E) when weight exit is triggered for a frame
- **QML source**: `vendor/decenza/src/machine/machinestate.h` — weight exit sends skip command
- **Current API**: No frame skip endpoint in REST API
- **What's needed**: `POST /api/v1/machine/skipFrame` or similar
- **Workaround**: **Not needed** — Streamline-Bridge's `ShotController` handles weight-based frame exits server-side. The skin should NOT need to send frame skips. Streamline-Bridge monitors the scale and handles all stop-at-weight logic internally.

### 20. Soft Stop Steam (1-Second Timeout)
- **Decenza feature**: `MainController.softStopSteam()` sends a 1-second steam timeout for graceful stop before requesting idle
- **QML source**: `vendor/decenza/qml/pages/SteamPage.qml` — Two-stage stop
- **Current API**: Can change machine state to idle via `PUT /api/v1/machine/state/idle`. Can update `targetSteamDuration` via `POST /api/v1/machine/shotSettings`.
- **What's needed**: A soft-stop mechanism or confirmation that setting `targetSteamDuration` to 1 during active steaming triggers a graceful stop
- **Workaround**: Set `targetSteamDuration` to 1 second via shotSettings, then request idle after a brief delay. Alternatively, just request idle directly — the machine may handle the purge cycle automatically.

### 21. Stop-at-Weight Calibration Learning
- **Decenza feature**: Learned lag compensation value (grams) for stop-at-weight. "Learn" button runs calibration shot.
- **QML source**: `vendor/decenza/qml/pages/settings/SettingsOptionsTab.qml` — Stop-at-Weight Calibration
- **Current API**: `GET/POST /api/v1/settings` has `weightFlowMultiplier` and `volumeFlowMultiplier` for projected weight/volume calculation
- **What's needed**: The multiplier settings serve a similar purpose. Automated learning/calibration is not available.
- **Workaround**: Expose `weightFlowMultiplier` in settings tab. Manual adjustment instead of automated learning.

### 22. MQTT Integration
- **Decenza feature**: MQTT broker connection for home automation with Home Assistant auto-discovery
- **QML source**: `vendor/decenza/qml/pages/settings/SettingsHomeAutomationTab.qml`
- **Current API**: No MQTT API in Streamline-Bridge
- **What's needed**: MQTT could be implemented as a Streamline-Bridge plugin
- **Workaround**: Not applicable for web skin. MQTT is a server-side concern. Could be implemented as a Streamline-Bridge plugin rather than a skin feature.

### 23. Profile Import from File
- **Decenza feature**: Import profiles from local file system (.json or .tcl files)
- **QML source**: `vendor/decenza/qml/pages/ProfileSelectorPage.qml` — "Import File" button
- **Current API**: `POST /api/v1/profiles` can create profiles from JSON. `POST /api/v1/profiles/import` handles batch import.
- **What's needed**: **Not a gap** — user can select a file in the browser, parse it client-side, and POST to profiles API.
- **Workaround**: N/A — supported via file input + profiles API.

---

## Not Applicable for Web Skin

These features from Decenza don't make sense in a web skin context:

| Feature | Reason |
|---------|--------|
| **BLE Direct Access** | Handled by Streamline-Bridge. Skin uses REST/WebSocket API. |
| **Window Management** | Browser handles window. No fullscreen/windowed toggle needed (can use Fullscreen API if desired). |
| **App Updates** | Skin is updated by redeploying via Streamline-Bridge skin API. No in-app updater needed. |
| **Device-to-Device Data Migration** | Server concern — Streamline-Bridge manages shots/profiles. |
| **Shot Import from DE1 App** | Native app feature. Profiles can be imported via profiles API. |
| **BLE Scan Logs** | Handled server-side by Streamline-Bridge. Logs available via `ws/v1/logs`. |
| **Translation/Language System** | Use standard vue-i18n. No in-app translation editor needed. |
| **Screen-On Keep-Alive** | Browser-specific. Can use Wake Lock API if available. |
| **Crash Report Dialog** | Web apps don't crash the same way. Use standard error boundaries. |
| **First-Run Welcome/Storage Setup** | No Android permissions needed. Could show a welcome on first load. |
| **Window Position Save/Restore** | Not applicable for browsers. |
| **Per-Page DPI Scaling** | Use CSS/responsive design instead. |
| **Profile TCL Converter** | Developer tool. If needed, do client-side in JavaScript. |
| **Shot Database Merge/Replace** | Server-side concern for Streamline-Bridge. |
| **GPS-Based Shot Map Location** | Could use browser Geolocation API, but low priority. |
| **Android Storage Permissions** | Not applicable for web. |

---

## Summary Matrix

| # | Feature | Severity | Has Workaround? | Blocks Phase |
|---|---------|----------|-----------------|-------------|
| 1 | Shot Timer | Critical | Yes (client-side timer) | 1 (EspressoPage) |
| 2 | Scale Flow Rate | Critical | Yes (client-side derivative) | 1 (EspressoPage) |
| 3 | Cumulative Volume | Critical | Yes (client-side integration) | 1 (EspressoPage volume mode) |
| 4 | Stop-At-Weight | Critical | N/A (handled server-side) | None |
| 5 | Real-Time Steam Flow | Critical | Likely works (needs testing) | 1 (SteamPage live) |
| 6 | Shot Filtering | Important | Yes (client-side filter) | 3 (ShotHistoryPage) |
| 7 | DYE Metadata Fields | Important | Yes (flexible metadata object) | 3 (PostShotReview) |
| 8 | Unique Filter Values | Important | Yes (client-side extraction) | 3 (ShotHistoryPage) |
| 9 | Profile Categories | Important | Yes (metadata convention) | 2 (ProfileSelector) |
| 10 | Profile Favorites | Important | Yes (KV store) | 1 (IdlePage presets) |
| 11 | Steam Puffing Substate | Important | Partial (needs investigation) | 1 (SteamPage auto-flush) |
| 12 | Descaling Substates | Important | Partial (indeterminate progress) | 5 (DescalingPage) |
| 13 | GHC/Headless Detection | Important | N/A (supported via machine info) | None |
| 14 | Visualizer Proxy | Nice-to-have | Yes (direct HTTP) | 5 (Visualizer) |
| 15 | Auto-Wake Schedule | Nice-to-have | Partial (requires browser open) | 4 (Settings) |
| 16 | Battery Charging Mode | Nice-to-have | Partial (USB on/off only) | 4 (Settings) |
| 17 | Machine Battery Level | Nice-to-have | None | 4 (Settings) |
| 18 | Water Level mL | Nice-to-have | Partial (approximation) | 4 (Settings) |
| 19 | Frame Skip Command | Nice-to-have | N/A (server-side handled) | None |
| 20 | Soft Stop Steam | Nice-to-have | Yes (shotSettings + idle) | 1 (SteamPage) |
| 21 | Weight Calibration | Nice-to-have | Partial (manual multiplier) | 4 (Settings) |
| 22 | MQTT | Nice-to-have | N/A (plugin concern) | 4 (Settings) |
| 23 | Profile File Import | Nice-to-have | N/A (supported) | None |

---

## Recommendations

### No-Action Items (Already Supported)
- Stop-at-weight (handled server-side by ShotController)
- GHC/headless detection (machine info `GHC` field)
- Profile CRUD including import/export
- Frame skip (handled server-side)
- Profile favorites (via KV store)
- DYE metadata (via flexible `metadata` object on shots)

### Client-Side Workarounds (Acceptable)
- Shot timer (client-side `Date.now()` tracking)
- Scale flow rate (client-side derivative)
- Cumulative volume (client-side flow integration)
- Shot filtering (client-side, acceptable for <1000 shots)
- Profile categories (metadata convention)

### Investigate / Test
- Real-time steam flow adjustment during active steaming
- Steam puffing substate string value
- Descaling substates in snapshot

### Feature Requests for Streamline-Bridge
1. **High priority**: `shotTime` or `shotStartTimestamp` in machine snapshot (eliminates client-side timer drift)
2. **Medium priority**: `weightFlow` in scale snapshot (cleaner than client-side derivative)
3. **Medium priority**: Server-side shot filtering with pagination
4. **Low priority**: Machine battery level in snapshot
5. **Low priority**: Water level in mL
