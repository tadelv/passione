# Streamline-Bridge API Gaps: Core Brewing & Profile Pages

> Cross-reference of Decenza DE1 QML features vs. Streamline-Bridge (ReaPrime) REST/WebSocket API
> API reference: `vendor/reaprime/doc/Skins.md`

---

## Summary

The Streamline-Bridge API covers the fundamental control plane well: machine state transitions, real-time snapshot streaming, profile CRUD, workflow management, shot history, scale tare, and key-value persistence. However, several Decenza features rely on BLE-level machine interactions or app-side logic that have no direct API mapping in Streamline-Bridge.

### Coverage Overview

| Area | Coverage | Notes |
|------|----------|-------|
| Machine state read/write | Good | States + snapshot WebSocket |
| Real-time telemetry | Good | Machine snapshot (~10Hz) + scale snapshot |
| Profile CRUD | Good | Full REST API with content-hash IDs |
| Profile upload to machine | Good | `POST /api/v1/machine/profile` |
| Workflow management | Good | `GET/PUT /api/v1/workflow` covers dose, grinder, coffee, steam, hot water, rinse |
| Shot history | Good | CRUD + measurements |
| Scale tare | Good | `PUT /api/v1/scale/tare` |
| Machine settings | Good | `GET/POST /api/v1/machine/settings` |
| Shot settings | Good | `POST /api/v1/machine/shotSettings` |
| Client persistence | Good | Key-value store API |
| Device management | Good | List, scan, connect |
| Water levels | Good | WebSocket stream |
| **Frame-level shot control** | **Missing** | No skip-to-next-frame command |
| **Shot timer** | **Missing** | No server-side shot timer; client must compute |
| **Scale flow rate** | **Missing** | Scale snapshot has weight but no weightFlow in docs |
| **Stop-at-weight orchestration** | **Partial** | REA does this server-side but no API to configure behavior |
| **Profile source/metadata** | **Partial** | Has metadata but no source classification (built-in/downloaded/user) |
| **Favorites/presets** | **Missing** | No server-side favorites or preset ordering |
| **Visualizer integration** | **Missing** | No upload/import from visualizer.coffee |
| **AI advice** | **Missing** | No AI integration API |

---

## Missing API Support (Detailed)

### 1. Frame Skip (Weight-Based Exit Condition)

- **Feature**: During espresso extraction, the app monitors scale weight and sends a BLE "SkipToNext" (0x0E) command when a frame's `exit_weight` threshold is reached. This is the app-side weight exit that operates independently of machine-side exit conditions.
- **QML Source**: `vendor/decenza/src/controllers/maincontroller.cpp` - `onShotSampleReceived()` checks `frame.exitWeight > 0` and calls `m_device->skipToNextFrame()`
- **What's needed**: Streamline-Bridge's `ShotController` already handles stop-at-weight for ending the shot. However, there is no REST/WebSocket API to send a "skip to next frame" command to the machine mid-shot. The skin would need either:
  - `POST /api/v1/machine/skipFrame` - Command to advance to next profile frame
  - OR: Streamline-Bridge handles frame-level weight exits server-side (reading `exit_weight` from the uploaded profile and monitoring scale weight per-frame)
- **Priority**: **Critical** - Frame-level weight exits are fundamental to advanced profiles (e.g., weight-based preinfusion exit). Without this, many profiles will not execute correctly.
- **Workaround**: If Streamline-Bridge's `ShotController` already handles per-frame weight exits internally (not just end-of-shot), this may already work. Needs verification.

### 2. Shot Timer

- **Feature**: The app displays a real-time shot timer during espresso, steam, hot water, and flush operations. In QML, this is `MachineState.shotTime` which starts when extraction begins and ticks at ~100ms resolution.
- **QML Source**: `vendor/decenza/src/machine/machinestate.h` - `m_shotTimer` (QTimer), `shotTimeChanged` signal
- **What's needed**: The machine snapshot WebSocket does not include a shot timer field. The skin must either:
  - Compute the timer client-side by tracking state transitions (detect when `state.substate` changes to `pouring` or operation starts, then calculate elapsed time from timestamps)
  - OR: Streamline-Bridge adds a `shotTime` or `elapsedTime` field to the snapshot WebSocket
- **Priority**: **Important** - Timer is displayed on every operation page (espresso, steam, hot water, flush). Client-side computation is feasible but requires careful state transition tracking.
- **Workaround**: Client-side timer is practical. Start timer when state transitions to an active operation, stop when it returns to idle. Use `snapshot.timestamp` differences for precision.

### 3. Scale Flow Rate (Weight-Based)

- **Feature**: The app displays scale-based flow rate (`MachineState.scaleFlowRate`) derived from weight change over time. This is distinct from the machine's flow sensor.
- **QML Source**: `vendor/decenza/src/machine/machinestate.h` - `scaleFlowRate()`, emitted via `scaleWeightChanged` signal
- **What's needed**: The scale snapshot WebSocket in Skins.md shows `weight` and `batteryLevel` but does not include `weightFlow` or flow rate. The skin needs either:
  - Streamline-Bridge adds `weightFlow` or `flowRate` to the scale snapshot
  - OR: Client computes flow rate from consecutive weight readings (delta weight / delta time)
- **Priority**: **Nice-to-have** - Client-side calculation is straightforward. Machine flow sensor data is already available in the machine snapshot. Scale flow rate is a secondary metric.
- **Workaround**: Compute client-side from scale weight deltas. Buffer 2-3 readings for smoothing.
- **Note**: The actual Streamline-Bridge scale snapshot implementation may already include `weightFlow` (the Skins.md docs show a simplified schema). The shot measurements in the shots API do include `weightFlow` in the `scale` object. Needs verification of the live WebSocket payload.

### 4. Cumulative Volume (Flow Integration)

- **Feature**: The app tracks cumulative volume by integrating flow rate over time (`MachineState.cumulativeVolume`). Used for volume-mode stop-at and display on EspressoPage.
- **QML Source**: `vendor/decenza/src/machine/machinestate.h` - `m_cumulativeVolume`, updated via `onFlowSample()`
- **What's needed**: The machine snapshot does not include cumulative volume. The skin needs either:
  - Streamline-Bridge adds `cumulativeVolume` to the snapshot
  - OR: Client integrates `snapshot.flow` over time (sum of `flow * deltaTime` for each sample)
- **Priority**: **Important** - Required for volume-mode stop-at display. Client-side integration is feasible but accumulates drift over time.
- **Workaround**: Client-side integration from machine snapshot flow data. The shot measurements API includes `volume` per measurement, suggesting Streamline-Bridge computes this internally. May just need to be added to the live snapshot.

### 5. Stop-at-Weight/Volume Configuration

- **Feature**: The app configures whether to stop by weight (scale) or volume (flow integration), with configurable target values. `MachineState.stopAtType`, `targetWeight`, `targetVolume`.
- **QML Source**: `vendor/decenza/src/machine/machinestate.h` - `StopAtType` enum, `setTargetWeight()`, `setTargetVolume()`
- **What's needed**: The workflow API includes `doseData.doseOut` (target output weight) and the profile has `target_weight`/`target_volume`, but there is no explicit API to:
  - Set/get the stop-at mode (weight vs volume)
  - Configure the target weight/volume independently of the profile
  - Get the current stop-at configuration
- **Priority**: **Critical** - Stop-at-weight is the primary shot termination mechanism. Streamline-Bridge's `ShotController` handles this server-side, but the skin needs to know what mode is active and what the target is to display progress bars correctly.
- **Workaround**: Use the workflow's `doseData.doseOut` as the target weight. For volume mode, use `profile.target_volume`. The skin may need to infer the stop-at mode from the profile/workflow configuration.

### 6. Profile Source Classification

- **Feature**: Profiles are classified by source: Built-in (D), Downloaded from Visualizer (V), User Created (U). These are displayed as colored badges in ProfileSelectorPage.
- **QML Source**: `vendor/decenza/src/controllers/maincontroller.h` - `ProfileSource` enum, `ProfileInfo.source`, separate list methods: `allBuiltInProfiles()`, `downloadedProfiles()`, `userCreatedProfiles()`
- **What's needed**: The Streamline-Bridge profiles API has `isDefault` (boolean) and `metadata` (flexible dict), but no explicit source classification. The skin needs either:
  - A `source` field on profiles (e.g., `"builtin"`, `"downloaded"`, `"user"`)
  - OR: Convention-based classification using existing fields (`isDefault=true` for built-in, metadata tags for downloaded, everything else is user-created)
- **Priority**: **Nice-to-have** - Can be approximated using `isDefault` + metadata conventions. The UI can show "Default" vs "User" as a simpler two-tier system.
- **Workaround**: Use `isDefault` for built-in profiles. Store `"source": "visualizer"` in profile metadata when importing. Everything else is user-created.

### 7. Profile Favorites and Ordering

- **Feature**: Users maintain an ordered list of favorite profiles (up to 50), displayed as pill-style presets on the IdlePage. Favorites can be drag-reordered.
- **QML Source**: `vendor/decenza/qml/pages/IdlePage.qml` - espresso presets from `Settings.favoriteProfiles`; `vendor/decenza/qml/pages/ProfileSelectorPage.qml` - favorites panel with drag-to-reorder
- **What's needed**: Streamline-Bridge has no concept of profile favorites or ordering. Options:
  - Use the key-value store: `POST /api/v1/store/decenza/favoriteProfiles` with an ordered array of profile IDs
  - OR: Add a favorites API to the profiles endpoint
- **Priority**: **Important** - Favorites are central to the IdlePage workflow (quick profile selection).
- **Workaround**: Use the key-value store API (`/api/v1/store/{namespace}/{key}`) to persist favorite profile IDs as an ordered JSON array. This is the recommended approach.

### 8. Operation Presets (Steam Pitchers, Water Vessels, Flush Presets, Bean Presets)

- **Feature**: Users maintain ordered lists of presets for each operation type: steam pitcher presets (name, emoji, duration, flow), water vessel presets (name, emoji, volume/weight, temperature), flush presets (name, emoji, duration, flow rate), and bean presets. Each supports drag-to-reorder, add/edit/delete.
- **QML Source**: `vendor/decenza/qml/pages/SteamPage.qml` - `Settings.steamPitcherPresets`; `HotWaterPage.qml` - `Settings.waterVesselPresets`; `FlushPage.qml` - `Settings.flushPresets`; `IdlePage.qml` - `Settings.beanPresets`
- **What's needed**: No server-side preset management. Use client-side persistence.
- **Priority**: **Important** - Presets are the primary UX for all operation pages.
- **Workaround**: Use the key-value store API to persist each preset list:
  - `POST /api/v1/store/decenza/steamPitcherPresets`
  - `POST /api/v1/store/decenza/waterVesselPresets`
  - `POST /api/v1/store/decenza/flushPresets`
  - `POST /api/v1/store/decenza/beanPresets`
  - Also persist selected preset indices and all other Settings values

### 9. Visualizer.coffee Integration

- **Feature**: Upload shots to visualizer.coffee for sharing/analysis. Import profiles from visualizer.coffee. Browse visualizer.coffee in embedded WebView.
- **QML Source**: `vendor/decenza/src/network/visualizeruploader.h` - shot upload; `vendor/decenza/src/network/visualizerimporter.h` - profile import; `vendor/decenza/qml/pages/VisualizerBrowserPage.qml` - embedded browser
- **What's needed**: No Streamline-Bridge API for Visualizer integration. The skin would need to:
  - Implement visualizer.coffee API calls directly from the browser (CORS permitting)
  - OR: Streamline-Bridge adds proxy/integration endpoints for visualizer.coffee
- **Priority**: **Nice-to-have** (Phase 4 feature) - Visualizer integration is valuable but not essential for core brewing.
- **Workaround**: Implement visualizer.coffee REST API calls directly from the Vue app. The visualizer.coffee API is public. For profile import, download the profile JSON and use `POST /api/v1/profiles` to save it. For shot upload, format the shot data and POST to visualizer.coffee directly.

### 10. AI Advice Integration

- **Feature**: Post-shot AI advice via conversation overlay. Uses system prompts for espresso vs filter extraction analysis.
- **QML Source**: `vendor/decenza/qml/pages/PostShotReviewPage.qml` - AI Advice section; `vendor/decenza/src/ai/aimanager.h`
- **What's needed**: No AI integration in Streamline-Bridge.
- **Priority**: **Nice-to-have** (Phase 4 feature) - Advanced feature, not required for core functionality.
- **Workaround**: Implement directly in the Vue app. Call an AI API (OpenAI, Anthropic, etc.) from the client with shot data as context. Store API key in client-side settings or the key-value store.

### 11. Headless Machine Detection

- **Feature**: The app detects headless DE1 machines (no Group Head Controller / touchscreen) and shows explicit stop buttons on operation pages. Non-headless machines have physical buttons.
- **QML Source**: `vendor/decenza/qml/pages/EspressoPage.qml` - `DE1Device.isHeadless` controls stop button visibility
- **What's needed**: The machine info endpoint (`GET /api/v1/machine/info`) returns `"GHC": true/false`, which indicates whether the machine has a Group Head Controller. `GHC: false` means headless.
- **Priority**: **Important** - Determines whether stop buttons are shown.
- **Workaround**: Already available. Use `GET /api/v1/machine/info` and check the `GHC` field. If `GHC === false`, the machine is headless and needs on-screen stop buttons.

### 12. Steam Heater Keep-Alive / Control

- **Feature**: The app maintains steam heater temperature by periodically resending steam settings (every 60 seconds). It also provides granular control: start heating, turn off heater, soft stop steam.
- **QML Source**: `vendor/decenza/qml/main.qml` - `steamHeaterTimer` (60s periodic); `MainController.startSteamHeating()`, `turnOffSteamHeater()`, `softStopSteam()`, `sendSteamTemperature()`
- **What's needed**: Streamline-Bridge has `POST /api/v1/machine/shotSettings` with `targetSteamTemp` and the workflow API has `steamSettings.targetTemperature`. However:
  - No explicit "start steam heating" command separate from "start steam operation"
  - No "soft stop" command (send 1-second timeout to trigger elapsed > target)
  - No periodic keep-alive mechanism exposed to skins
  - The skin can set `targetSteamTemp=0` to turn off the heater
- **Priority**: **Important** - Steam heater management is used on every steam operation and affects idle-state behavior.
- **Workaround**:
  - Use `POST /api/v1/machine/shotSettings` with `targetSteamTemp` to control heater (set to target temp to enable, 0 to disable)
  - Use `PUT /api/v1/machine/state/idle` to stop steam
  - Implement keep-alive timer client-side (resend shotSettings every 60s)
  - Soft stop: may need a new API endpoint or can be approximated by setting `targetSteamDuration` to 1 second via shotSettings

### 13. Steam Auto-Flush Countdown

- **Feature**: After steaming, during the Puffing substate, the app counts down and then automatically requests idle (triggering steam purge).
- **QML Source**: `vendor/decenza/qml/main.qml` - `steamAutoFlushTimer`, `steamAutoFlushCountdown`
- **What's needed**: This is client-side logic. The skin can detect the Puffing substate from the machine snapshot (`state.substate === "steamRinse"` or similar) and implement the countdown timer client-side.
- **Priority**: **Nice-to-have** - Can be implemented entirely client-side.
- **Workaround**: Monitor `snapshot.state.substate` for steam puffing state, run client-side countdown timer, then call `PUT /api/v1/machine/state/idle` when countdown expires.
- **Note**: Need to verify the exact substate string Streamline-Bridge uses for the DE1's puffing/purging state. The DE1 uses substate 20 internally; Skins.md lists `"steamRinse"` as a machine state but not explicitly as a substate during steam. This mapping needs verification.

### 14. D-Flow Recipe Conversion

- **Feature**: Convert between D-Flow (simplified phase-based) and Advanced (frame-based) profile editing modes. Apply recipe presets (Classic, Londinium, Turbo, Blooming, D-Flow).
- **QML Source**: `vendor/decenza/src/controllers/maincontroller.h` - `convertCurrentProfileToRecipe()`, `convertCurrentProfileToAdvanced()`, `applyRecipePreset()`, `uploadRecipeProfile()`
- **What's needed**: This is pure profile transformation logic (no machine communication). The skin needs to implement:
  - Phase-to-frame conversion: map Fill/Bloom/Infuse/Ramp/Pour/Decline parameters to DE1 profile frames
  - Frame-to-phase conversion: reverse mapping for editing
  - Preset definitions: built-in parameter sets for each recipe preset
- **Priority**: **Important** - RecipeEditorPage (D-Flow) is a Phase 2 feature.
- **Workaround**: Implement entirely in the Vue app. The conversion logic is mathematical (mapping phase parameters to DE1 frame arrays). This does not require any server-side API.

### 15. Shot Metadata Fields

- **Feature**: Post-shot metadata editing includes: bean brand, bean type, roast date, roast level, grinder model, grinder setting, barista, beverage type, dose, out (yield), TDS, EY, rating (enjoyment), notes.
- **QML Source**: `vendor/decenza/qml/pages/PostShotReviewPage.qml` - metadata fields
- **What's needed**: The shots API (`PUT /api/v1/shots/{id}`) supports `shotNotes` (string) and `metadata` (flexible dict). The workflow already includes `doseData`, `grinderData`, `coffeeData`. However, specific DYE (Describe Your Espresso) fields need standardization:
  - `metadata.rating` - Supported (flexible dict)
  - `metadata.barista` - Supported (flexible dict)
  - `metadata.tds`, `metadata.ey` - Need to be stored
  - `metadata.roastDate`, `metadata.roastLevel` - Need to be stored
  - `metadata.beverageType` - Need to be stored
- **Priority**: **Important** - Shot metadata is central to PostShotReviewPage.
- **Workaround**: Already supported. Use the `metadata` flexible dict in the shots API. Store all DYE fields there:
  ```json
  {
    "shotNotes": "Great shot",
    "metadata": {
      "rating": 85,
      "barista": "Alice",
      "tds": 8.5,
      "ey": 22.1,
      "roastDate": "2026-01-15",
      "roastLevel": "medium",
      "beverageType": "espresso",
      "beanBrand": "Local Roaster",
      "beanType": "Ethiopia Yirgacheffe"
    }
  }
  ```

### 16. Shot Metadata Autocomplete (History-Based)

- **Feature**: SuggestionField components provide autocomplete for metadata fields (bean brand, grinder model, etc.) based on values from previous shots.
- **QML Source**: `vendor/decenza/qml/pages/PostShotReviewPage.qml` - SuggestionField components
- **What's needed**: The skin needs to query previous shot metadata to build autocomplete lists. The shots API (`GET /api/v1/shots`) returns all shots with their workflows and metadata. The skin would need to:
  - Fetch recent shots
  - Extract unique values for each field
  - Build local autocomplete indexes
- **Priority**: **Nice-to-have** - UX improvement, not required for basic functionality.
- **Workaround**: Fetch shots via `GET /api/v1/shots`, extract unique metadata values client-side. Cache in local storage or the key-value store for faster subsequent loads.

### 17. Sticky Metadata (Cross-Shot Persistence)

- **Feature**: Certain metadata fields (bean brand, bean type, roast date, grinder, setting) are "sticky" - they persist from shot to shot until explicitly changed.
- **QML Source**: `vendor/decenza/qml/pages/PostShotReviewPage.qml` - sticky metadata sync back to Settings
- **What's needed**: Client-side persistence. Not a Streamline-Bridge API gap.
- **Priority**: **Important** - Improves UX significantly.
- **Workaround**: Use the key-value store API (`POST /api/v1/store/decenza/stickyMetadata`) to persist these values. Load on app start, update after each shot save.

### 18. Descaling Wizard

- **Feature**: Step-by-step descaling process with specific machine commands in sequence.
- **QML Source**: `vendor/decenza/qml/pages/DescalingPage.qml`
- **What's needed**: The machine state includes `descaling` state. The skin can request `PUT /api/v1/machine/state/descaling` (if supported - not explicitly listed in the valid states but `descaling` appears in the machine states list). The descaling wizard UI is client-side, but specific step sequencing commands may be needed.
- **Priority**: **Nice-to-have** (Phase 4 feature) - Infrequent operation.
- **Workaround**: Needs investigation. If `PUT /api/v1/machine/state/descaling` works, the wizard just monitors state transitions. The DE1 machine handles the descaling sequence internally once started.

### 19. Layout Configuration Persistence

- **Feature**: The IdlePage layout is JSON-configurable with zones, item types, scale multipliers, and Y-offsets. This configuration is persisted in Settings.
- **QML Source**: `vendor/decenza/qml/pages/IdlePage.qml` - `Settings.layoutConfiguration`
- **What's needed**: Client-side persistence only.
- **Priority**: **Important** - Core to the dashboard customization feature.
- **Workaround**: Use the key-value store API to persist layout configuration: `POST /api/v1/store/decenza/layoutConfiguration`.

### 20. Machine GHC State Detection (Substate Mapping)

- **Feature**: The app uses DE1's raw BLE substates for fine-grained state detection (e.g., substate 20 for Puffing during steam). The QML app uses integer substate values directly.
- **QML Source**: `vendor/decenza/qml/main.qml` - `DE1Device.subState === 20` for Puffing; `vendor/decenza/qml/pages/SteamPage.qml`
- **What's needed**: The machine snapshot includes `state.substate` as a string. Need to verify the mapping between DE1's numeric substates and Streamline-Bridge's string representations. Key substates:
  - Substate 20 (Puffing) - used for steam auto-flush countdown
  - `preparingForShot` - EspressoPreheating
  - `preinfusion` - Preinfusion
  - `pouring` - Pouring
  - `pouringDone` - Shot ending
- **Priority**: **Important** - Correct substate mapping is essential for phase-based navigation and UI behavior.
- **Workaround**: The machine snapshot's `state.substate` strings should cover the essential cases. Test with actual machine to verify `steamRinse` or equivalent substate appears during puffing.

---

## Features Fully Supported by Existing APIs

These Decenza features map cleanly to existing Streamline-Bridge APIs:

| Feature | API Endpoint | Notes |
|---------|-------------|-------|
| Machine state read | `GET /api/v1/machine/state` + `ws/v1/machine/snapshot` | Full state + real-time updates |
| Start/stop operations | `PUT /api/v1/machine/state/{state}` | espresso, steam, hotWater, flush, idle, sleeping |
| Real-time pressure/flow/temp | `ws/v1/machine/snapshot` | ~10Hz, all telemetry fields |
| Scale weight | `ws/v1/scale/snapshot` | Weight + battery |
| Scale tare | `PUT /api/v1/scale/tare` | Direct |
| Water level | `ws/v1/machine/waterLevels` | Current level + refill threshold |
| Profile CRUD | `GET/POST/PUT/DELETE /api/v1/profiles` | Full lifecycle with versioning |
| Profile upload to machine | `POST /api/v1/machine/profile` | Direct upload |
| Workflow management | `GET/PUT /api/v1/workflow` | Profile + dose + grinder + coffee + steam + hot water + rinse |
| Machine settings | `GET/POST /api/v1/machine/settings` | Fan, flush, hot water, steam flow, tank temp |
| Shot settings | `POST /api/v1/machine/shotSettings` | Steam temp/duration, hot water temp/volume, group temp |
| Shot history CRUD | `GET/PUT/DELETE /api/v1/shots/*` | Full shot records with measurements |
| Device discovery | `GET /api/v1/devices` + `GET /api/v1/devices/scan` | List + scan + connect |
| Machine info (GHC) | `GET /api/v1/machine/info` | Hardware info including GHC flag |
| Client persistence | `GET/POST/DELETE /api/v1/store/{ns}/{key}` | Any JSON value |
| USB charger control | `PUT /api/v1/machine/usb/enable\|disable` | Toggle |
| Profile import/export | `POST /api/v1/profiles/import` + `GET /api/v1/profiles/export` | Batch operations |
| Profile visibility | `PUT /api/v1/profiles/{id}/visibility` | visible/hidden/deleted |
| Steam/hot water/flush settings | `PUT /api/v1/workflow` (partial update) | Via workflow steamSettings/hotWaterData/rinseData |
| Connection status | `GET /api/v1/devices` | Device connection states |
| Temperature display | `ws/v1/machine/snapshot` | mixTemperature, groupTemperature, steamTemperature |

---

## Features Implementable Client-Side (No API Changes Needed)

These features require no Streamline-Bridge API changes and can be implemented entirely in the Vue skin:

| Feature | Implementation Strategy |
|---------|------------------------|
| Shot timer | Track state transitions from snapshot WebSocket, compute elapsed time client-side |
| Auto-sleep | Client-side inactivity timer, then `PUT /api/v1/machine/state/sleeping` |
| Screensaver | Pure client-side (CSS/Canvas animation) |
| Navigation (page routing) | Vue Router based on machine state from WebSocket |
| Completion overlays | Client-side animation triggered on state transition |
| Stop reason detection | Track manual stop vs state transition timing |
| Scale flow rate | Compute from consecutive weight deltas |
| Cumulative volume | Integrate flow rate from snapshots (sum flow * deltaTime) |
| D-Flow recipe conversion | Pure math: phase parameters to DE1 frame arrays |
| Profile graph visualization | Client-side chart from profile step data |
| Shot graph visualization | Client-side chart from snapshot stream data |
| ValueInput component | Pure Vue component |
| PresetPillRow component | Pure Vue component |
| Theme/styling | CSS variables |
| Keyboard shortcuts | Client-side event listeners |
| Preset persistence | Key-value store API |
| Layout configuration | Key-value store API |
| Sticky metadata | Key-value store API |
| Metadata autocomplete | Query shots API, extract unique values |
| Steam auto-flush countdown | Client-side timer + `PUT /api/v1/machine/state/idle` |
| Steam heater keep-alive | Client-side timer + `POST /api/v1/machine/shotSettings` |
| Brew-by-ratio calculation | Client-side: yield / dose |
| Progress bars | Client-side: current weight or volume / target |

---

## Recommended API Additions to Streamline-Bridge

Prioritized list of API enhancements that would significantly improve skin capabilities:

### High Priority

1. **Frame skip command**: `POST /api/v1/machine/skipFrame` - Advance to next profile frame. Critical for weight-based frame exits in advanced profiles. (Unless Streamline-Bridge already handles this server-side.)

2. **Stop-at configuration readback**: Add to snapshot or workflow response:
   ```json
   {
     "stopAt": {
       "type": "weight",
       "targetWeight": 36.0,
       "targetVolume": 0
     }
   }
   ```
   This lets the skin display the correct progress bar and target.

3. **Scale snapshot: add weightFlow**: Include computed weight flow rate in the scale WebSocket snapshot:
   ```json
   {
     "weight": 18.5,
     "weightFlow": 2.1,
     "batteryLevel": 85
   }
   ```

### Medium Priority

4. **Snapshot: add shot elapsed time**: Include `elapsedTime` (seconds since operation started) in the machine snapshot for accurate timer display.

5. **Snapshot: add cumulative volume**: Include `cumulativeVolume` (integrated flow) in the machine snapshot for volume-mode progress display.

6. **Workflow: add stop-at mode**: Include `stopAtType` ("weight" or "volume") in the workflow to indicate which termination mode is active.

### Low Priority

7. **Profile metadata: source classification**: Add optional `source` field to profile records for UI categorization (built-in, downloaded, user-created).

8. **Descaling state control**: Explicitly document whether `PUT /api/v1/machine/state/descaling` is a valid state transition, and what substates to expect.

---

## State/Substate Mapping Reference

### Machine States: Decenza QML vs Streamline-Bridge API

| Decenza Phase Enum | Streamline-Bridge State String | Notes |
|--------------------|-------------------------------|-------|
| `Disconnected` | (no connection) | WebSocket disconnected |
| `Sleep` | `sleeping` | |
| `Idle` | `idle` | |
| `Heating` | `heating` | |
| `Ready` | `idle` (substate?) | Decenza distinguishes Ready from Idle; SB may not |
| `EspressoPreheating` | `preheating` or `espresso` + `preparingForShot` | Need to verify |
| `Preinfusion` | `espresso` + `preinfusion` | |
| `Pouring` | `espresso` + `pouring` | |
| `Ending` | `espresso` + `pouringDone` | |
| `Steaming` | `steam` | |
| `HotWater` | `hotWater` | |
| `Flushing` | `flush` | |
| `Refill` | `needsWater` | |
| `Descaling` | `descaling` | |
| `Cleaning` | `cleaning` | |

### Key Substates

| Decenza Substate | Value | SB Equivalent | Usage |
|-----------------|-------|---------------|-------|
| Puffing | 20 | `steamRinse`? | Steam auto-flush trigger |
| FinalHeating | ? | `preparingForShot`? | Steam heating indicator |
| None/Idle | 0 | `idle` | Default |

**Action needed**: Verify these mappings against actual Streamline-Bridge snapshot data from a connected DE1 machine.
