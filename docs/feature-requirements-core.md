# Feature Requirements: Core Brewing Pages & Profile/Recipe Pages

> Extracted from Decenza DE1 QML source (`vendor/decenza/qml/`)
> Source files: `main.qml`, `Theme.qml`, `pages/*.qml`, `components/*.qml`, `src/controllers/maincontroller.h`, `src/machine/machinestate.h`

---

## Table of Contents

1. [App Shell & Navigation (main.qml)](#1-app-shell--navigation)
2. [Theme & Styling (Theme.qml)](#2-theme--styling)
3. [Layout System](#3-layout-system)
4. [Status Bar](#4-status-bar)
5. [Core Brewing Pages](#5-core-brewing-pages)
   - [5.1 IdlePage](#51-idlepage)
   - [5.2 EspressoPage](#52-espressopage)
   - [5.3 SteamPage](#53-steampage)
   - [5.4 HotWaterPage](#54-hotwaterpage)
   - [5.5 FlushPage](#55-flushpage)
6. [Profile & Recipe Pages](#6-profile--recipe-pages)
   - [6.1 ProfileSelectorPage](#61-profileselectorpage)
   - [6.2 ProfileEditorPage](#62-profileeditorpage)
   - [6.3 ProfileInfoPage](#63-profileinfopage)
   - [6.4 RecipeEditorPage (D-Flow)](#64-recipeeditorpage-d-flow)
   - [6.5 PostShotReviewPage](#65-postshotreviewpage)
7. [Shared Components](#7-shared-components)
   - [7.1 ShotGraph](#71-shotgraph)
   - [7.2 ProfileGraph](#72-profilegraph)
   - [7.3 ValueInput](#73-valueinput)
   - [7.4 PresetPillRow](#74-presetpillrow)
   - [7.5 BottomBar](#75-bottombar)
   - [7.6 CircularGauge](#76-circulargauge)
   - [7.7 BrewDialog](#77-brewdialog)
   - [7.8 ProfilePreviewPopup](#78-profilepreviewpopup)
   - [7.9 ConnectionIndicator](#79-connectionindicator)
8. [Machine State & Controller Reference](#8-machine-state--controller-reference)
9. [Global Behaviors & Dialogs](#9-global-behaviors--dialogs)

---

## 1. App Shell & Navigation

**Source**: `vendor/decenza/qml/main.qml` (~2050 lines)

### Window Configuration
- Reference size: 960x600 pixels (tablet dp)
- Fullscreen on Android, `Window.AutomaticVisibility` on desktop
- Title: "Decenza"
- Background: `Theme.backgroundColor`
- Dynamic scaling: `Math.min(width/960, height/600) * scaleMultiplier * pageScaleMultiplier`
- Per-page scale overrides (Ctrl+mousewheel on Windows, persisted via Settings)

### Navigation Architecture
- **StackView** (`pageStack`) with instant transitions (no animation)
- `initialItem`: IdlePage
- Navigation guard: 300ms debounce to prevent double-tap during page transitions
- Navigation functions: `goToIdle()`, `goToEspresso()`, `goToSteam()`, `goToHotWater()`, `goToFlush()`, `goToSettings(tabIndex)`, `goToProfileEditor()`, `goToRecipeEditor()`, `goToProfileSelector()`, `goToVisualizerBrowser()`, `goToProfileImport()`, `goToShotMetadata(shotId)`, `goToDescaling()`, `goBack()`
- Profile editor routing: `goToProfileEditor()` checks `MainController.isCurrentProfileRecipe` and routes to D-Flow editor or Advanced editor accordingly
- Editor switching: `switchToRecipeEditor()` and `switchToAdvancedEditor()` use `replace()` to swap editors in-place

### Available Pages (Component declarations)
| Page | objectName | Navigation Type |
|------|-----------|-----------------|
| IdlePage | `idlePage` | Initial / replace |
| EspressoPage | `espressoPage` | Auto-replace on phase |
| SteamPage | `steamPage` | Auto-replace on phase |
| HotWaterPage | `hotWaterPage` | Auto-replace on phase |
| FlushPage | `flushPage` | Auto-replace on phase |
| SettingsPage | `settingsPage` | push |
| ProfileSelectorPage | `profileSelectorPage` | push |
| ProfileEditorPage | `profileEditorPage` | push |
| RecipeEditorPage | `recipeEditorPage` | push |
| DescalingPage | `descalingPage` | push / auto-replace |
| VisualizerBrowserPage | `visualizerBrowserPage` | push |
| ProfileImportPage | `profileImportPage` | push |
| BeanInfoPage | `beanInfoPage` | push |
| PostShotReviewPage | `postShotReviewPage` | push (with `editShotId`) |
| ProfileInfoPage | `profileInfoPage` | push |
| ScreensaverPage | (internal) | replace |

### Phase-Based Auto-Navigation
The `MachineState.onPhaseChanged()` handler in main.qml drives automatic page transitions:

| Machine Phase | Navigation Action |
|--------------|-------------------|
| `EspressoPreheating`, `Preinfusion`, `Pouring`, `Ending` | `replace(espressoPage)` if not already there |
| `Steaming` | `replace(steamPage)` if not already there |
| `HotWater` | `replace(hotWaterPage)` if not already there |
| `Flushing` | `replace(flushPage)` if not already there |
| `Descaling` | `replace(descalingPage)` if not already there |
| `Sleep` | Show screensaver (unless startup grace period or shutting down) |
| `Idle` / `Ready` (from operation page) | Show completion overlay, then navigate to IdlePage after 3s |

### Phase Change Side Effects
When entering operation phases from idle/ready:
- **Steaming**: `MainController.startSteamHeating()` (clears `steamDisabled`, forces heater on)
- **HotWater**: `MainController.applyHotWaterSettings()`
- **Flushing**: `MainController.applyFlushSettings()`
- **Ready**: Pre-loads all operation settings (steam, hot water, flush) for GHC-initiated starts
- **Idle**: Applies steam settings (sends 0 if `keepSteamHeaterOn=false`)

When steaming ends (→ Idle/Ready):
- If `keepSteamHeaterOn=false`: sends steam temperature 0 (disables heater)
- Stops and resets auto-flush timer

### Completion Overlay
- Shown when operation ends and returns to Idle/Ready while on an operation page
- Full-screen overlay with checkmark circle (120px, border=4px, `primaryColor`)
- Message: "Steam Complete" / "Hot Water Complete" / "Flush Complete"
- Value display: `shotTime` for steam/flush, `scaleWeight` for hot water
- Timer font for value display
- Instant fade-in, 200ms animated fade-out
- 3-second display before navigating to IdlePage

### Stop Reason Overlay (Espresso)
- Bottom-positioned pill overlay (`warningColor` background)
- Pop-in animation (punch: 100% -> 110% -> 100%)
- Shows for 3 seconds with 2-second fade-out
- Stop reasons:
  - "Stopped manually" (user pressed stop)
  - "Target weight reached" (app-side weight exit)
  - "Profile complete - DE1 stopped the shot" (machine-side completion)

### Auto-Sleep System
- Two-counter approach:
  - `sleepCountdownNormal`: Reset on user touch/activity, counts down from `autoSleepMinutes` (default 60)
  - `sleepCountdownStayAwake`: Only set on auto-wake, never reset by user activity
- Sleep triggers when BOTH counters reach 0
- 1-minute tick interval
- Paused during active operations (espresso, steam, hot water, flush, descaling, cleaning)
- Touch anywhere resets `sleepCountdownNormal`
- Phase changes reset `sleepCountdownNormal`

### Steam Auto-Flush
- Countdown starts when DE1 enters Puffing substate (subState === 20)
- Configurable duration: `Settings.steamAutoFlushSeconds`
- 100ms tick for smooth countdown display
- When countdown completes: turns off steam heater if `keepSteamHeaterOn=false`, then `DE1Device.requestIdle()`

### Steam Heater Keep-Alive
- 60-second periodic timer resends steam settings when:
  - `keepSteamHeaterOn=true` AND `steamDisabled=false` AND connected AND (Idle or Ready)

### Keyboard Shortcuts (Global)
| Key | Action | Condition |
|-----|--------|-----------|
| E | Start espresso | `MachineState.isReady` |
| S | Start steam | `MachineState.isReady` |
| W | Start hot water | `MachineState.isReady` |
| F | Start flush | `MachineState.isReady` |
| Space | Stop / Go to idle | Any |
| Ctrl+D | Toggle simulation mode | Any |

### Page Preloading
- Asynchronous Loaders pre-compile key pages at startup (IdlePage, EspressoPage, SteamPage, HotWaterPage, FlushPage, SettingsPage, ProfileSelectorPage, ProfileEditorPage, RecipeEditorPage)
- Loaders set `active=false` after compilation to free resources

### Startup Sequence
1. Restore window position (desktop only)
2. Initialize per-page scale settings
3. Keep screen on (Android)
4. Check for crash log from previous session -> show crash report dialog
5. Check for first run -> show welcome dialog OR check storage setup
6. Storage setup dialog (Android 11+ permissions)
7. Start Bluetooth scan (direct connect if saved scale exists)
8. Initialize sleep countdowns

---

## 2. Theme & Styling

**Source**: `vendor/decenza/qml/Theme.qml` (134 lines)

### Color Palette
| Token | Default Value | Notes |
|-------|--------------|-------|
| `backgroundColor` | `#1a1a2e` | Dynamic, customizable via Settings |
| `surfaceColor` | `#252538` | Dynamic |
| `primaryColor` | `#4e85f4` | Dynamic |
| `accentColor` | `#e94560` | Dynamic |
| `textColor` | `#e0e0e0` | Dynamic |
| `textSecondaryColor` | `#999999` | Dynamic |
| `borderColor` | `#3a3a55` | Dynamic |
| `successColor` | `#4caf50` | Static |
| `warningColor` | `#FFC107` | Static |
| `errorColor` | `#f44336` | Static |
| `highlightColor` | `#7B68EE` | Static |

### Chart Colors
| Series | Color | Goal Color |
|--------|-------|------------|
| Pressure | `#18c37e` | `#5fd9a8` |
| Flow | `#4e85f4` | `#8fb3f5` |
| Temperature | `#e73249` | `#f08090` |
| Weight | `#a2693d` | `#c49a6c` |

### Typography (Scaled)
| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `headingFont` | 32 | Bold | Page headings |
| `titleFont` | 24 | Bold | Section titles |
| `subtitleFont` | 18 | Bold | Subtitles |
| `bodyFont` | 18 | Normal | Body text |
| `labelFont` | 14 | Normal | Labels |
| `captionFont` | 12 | Normal | Captions |
| `valueFont` | 48 | Bold | Large values |
| `timerFont` | 72 | Bold | Timer display |

All font sizes use `Theme.scaled(px)` for responsive sizing.

### Layout Constants (Scaled)
| Token | Value | Usage |
|-------|-------|-------|
| `statusBarHeight` | 70 | Top status bar |
| `bottomBarHeight` | 70 | Bottom navigation bar |
| `pageTopMargin` | 80 | Content area top margin |
| `standardMargin` | 16 | Standard content margin |
| `gaugeSize` | 120 | Circular gauge diameter |
| `cardRadius` | 12 | Card corner radius |
| `dialogWidth` | 350 | Dialog content width |
| `refWidth` | 960 | Reference design width |
| `refHeight` | 600 | Reference design height |

### Spacing Constants (Scaled)
| Token | Value |
|-------|-------|
| `spacingSmall` | 4 |
| `spacingMedium` | 8 |
| `spacingLarge` | 16 |

### Touch Targets (Scaled)
| Token | Value |
|-------|-------|
| `touchTargetMin` | 44 |
| `touchTargetMedium` | 48 |
| `touchTargetLarge` | 56 |

### Dynamic Theming
- Colors are bound to `Settings.customThemeColors` (a JSON object)
- When `customThemeColors` is set, each color key overrides the default
- This allows user-customizable color themes

### Utility Functions
- `scaled(px)`: Returns `px * scale` for responsive sizing
- `emojiToImage(emoji)`: Converts emoji string to image path
  - `qrc:/icons/*` paths pass through unchanged
  - Unicode emoji -> codepoints -> `qrc:/emoji/<hex>.svg`

---

## 3. Layout System

**Source**: `vendor/decenza/qml/components/layout/`

The IdlePage uses a JSON-driven layout system that makes dashboard zones configurable.

### Layout Architecture
- **`LayoutBarZone`** (`LayoutBarZone.qml`, 31 lines): Horizontal bar zone (for top/bottom areas)
  - Properties: `zoneName`, `items` (array)
  - Renders items in a `RowLayout` via `LayoutItemDelegate` repeater
  - Height: `Theme.bottomBarHeight`

- **`LayoutCenterZone`** (`LayoutCenterZone.qml`, 101 lines): Center content zone (for main dashboard area)
  - Properties: `zoneName`, `items` (array), `zoneScale` (default 1.0)
  - Auto-calculates button sizing: `Math.min(Theme.scaled(150), availableWidth / buttonCount)`
  - Button height: `Theme.scaled(120)`
  - Auto-centering spacers when user has no explicit spacers
  - Scale transform on content row

- **`LayoutItemDelegate`** (`LayoutItemDelegate.qml`, 210 lines): Item factory/delegate
  - Routes `itemType` to specific QML component files in `items/` subdirectory
  - Two rendering modes:
    - **Compact mode** (bar zones): Uses original item components
    - **Center zone**: "Compiles" action buttons (espresso, steam, hotwater, flush, beans, history, settings, etc.) to `CustomItem.qml` with emoji+label+action properties
  - Compiled item actions: `togglePreset:espresso`, `navigate:profiles`, `command:sleep`, etc.
  - Long-press actions: `navigate:profiles`, `navigate:steam`, `navigate:hotwater`, `navigate:flush`, `navigate:beaninfo`, `command:quit`
  - Double-click actions mirror long-press actions

### Layout Item Types
| Type | Description | Auto-sized |
|------|------------|-----------|
| `espresso` | Espresso action button | No |
| `steam` | Steam action button | No |
| `hotwater` | Hot water action button | No |
| `flush` | Flush action button | No |
| `beans` | Bean info action button | No |
| `history` | History navigation button | No |
| `settings` | Settings navigation button | No |
| `autofavorites` | Auto-favorites button | No |
| `sleep` | Sleep command button | No |
| `quit` | Quit command button | No |
| `temperature` | Temperature readout | Yes |
| `waterLevel` | Water level indicator | Yes |
| `connectionStatus` | Connection status | Yes |
| `steamTemperature` | Steam temperature readout | Yes |
| `scaleWeight` | Scale weight readout | Yes |
| `weather` | Weather widget | Yes |
| `shotPlan` | Shot plan text | Yes |
| `spacer` | Flexible spacer | Fill |
| `custom` | Custom user item | No |
| `pageTitle` | Page title text | Yes |
| `separator` | Visual separator | Yes |
| `screensaverFlipClock` | Flip clock (screensaver) | Special |
| `screensaverPipes` | Pipes animation (screensaver) | Special |
| `screensaverAttractor` | Attractor animation (screensaver) | Special |
| `screensaverShotMap` | Shot map (screensaver) | Special |

### Layout Configuration Zones
The layout is configured via `Settings.layoutConfiguration` JSON with these zones:
- `topLeft` - Top bar, left side
- `topRight` - Top bar, right side
- `statusBar` - Status bar area
- `centerTop` - Center area, top row
- `centerMiddle` - Center area, middle row (main action buttons)
- `centerStatus` - Center status display area
- `bottomLeft` - Bottom bar, left side
- `bottomRight` - Bottom bar, right side

Each zone has:
- `items`: Array of item configurations
- `yOffset` (optional): Vertical offset for zone positioning
- `scale` (optional): Scale multiplier for the zone

---

## 4. Status Bar

**Source**: `vendor/decenza/qml/components/StatusBar.qml` (34 lines)

- Anchored to top, full width, height = `Theme.statusBarHeight`
- z-index: 600 (above completion overlay at 500)
- Hidden during screensaver
- Layout-driven from `Settings.layoutConfiguration.zones.statusBar`
- Uses `LayoutItemDelegate` repeater (same system as IdlePage zones)

---

## 5. Core Brewing Pages

### 5.1 IdlePage

**Source**: `vendor/decenza/qml/pages/IdlePage.qml` (~500 lines)

#### Overview
The main dashboard shown when the machine is idle/ready. Uses a JSON-configurable layout zone system.

#### Layout Structure
- 7 configurable zones with Y-offsets and scale multipliers
- Each zone renders via `LayoutBarZone` (top/bottom) or `LayoutCenterZone` (center)
- Zones loaded from `Settings.layoutConfiguration`
- Full-page layout computed from zone positions and sizes

#### Preset System
Multiple preset rows for different operations:
| Preset Type | Source | Description |
|------------|--------|-------------|
| Espresso | `Settings.favoriteProfiles` | Favorite profiles list |
| Steam | `Settings.steamPitcherPresets` | Pitcher presets |
| Hot Water | `Settings.waterVesselPresets` | Vessel presets |
| Flush | `Settings.flushPresets` | Flush presets |
| Beans | `Settings.beanPresets` | Bean/coffee presets |

#### Preset Interactions
- **Click**: Select preset
- **Double-click selected**: Start the operation
- **Long-press** (espresso only): Open `ProfilePreviewPopup`
- **Long-press** (other operations): Navigate to operation settings page

#### BrewDialog Integration
- Opens before starting espresso (configurable)
- Allows adjusting temperature, dose, ratio, yield before brewing
- See [BrewDialog component](#77-brewdialog) for full details

#### Shot Plan Text
- Displays brewing plan summary on the idle page
- Shows dose, yield, ratio, grinder info

#### Developer Mode
- 5-second long-press on top-right corner
- Simulates a completed shot (generates fake shot data)
- Only available in debug builds

#### Data Bindings
- `MachineState.phase` - Machine state display
- `Settings.layoutConfiguration` - Layout zone configuration
- `Settings.favoriteProfiles` - Espresso preset list
- `Settings.steamPitcherPresets` - Steam preset list
- `Settings.waterVesselPresets` - Hot water preset list
- `Settings.flushPresets` - Flush preset list
- `Settings.beanPresets` - Bean preset list
- `Settings.selectedFavoriteProfile` - Currently selected espresso preset index
- `Settings.selectedSteamPitcherPreset` - Currently selected steam preset index
- `Settings.selectedWaterVesselPreset` - Currently selected hot water preset index
- `Settings.selectedFlushPreset` - Currently selected flush preset index
- `Settings.selectedBeanPreset` - Currently selected bean preset index

---

### 5.2 EspressoPage

**Source**: `vendor/decenza/qml/pages/EspressoPage.qml` (~635 lines)

#### Overview
Live shot view displayed during espresso extraction. Shows real-time graph and key metrics.

#### Layout
- **Main area**: Full-screen `ShotGraph` component (with margins for status bar and bottom info bar)
- **Bottom info bar**: 100px height row of metrics
- **Preheating banner**: Shown during `EspressoPreheating` phase

#### Bottom Info Bar Items (left to right)
| Item | Display | Binding |
|------|---------|---------|
| Back button | Arrow icon | `pageStack.pop()` or `goToIdle()` |
| Timer | `MM:SS.s` | `MachineState.shotTime` |
| Pressure | `X.X bar` | `snapshot.pressure` (via WebSocket) |
| Flow | `X.X mL/s` | `snapshot.flow` |
| Temperature | `X.X°C` | `snapshot.mixTemperature` |
| Weight/Volume | `X.Xg` or `X.XmL` with progress bar | Weight: `MachineState.scaleWeight`, Volume: `MachineState.cumulativeVolume` |

#### Weight vs Volume Mode
- Determined by `MachineState.stopAtType`:
  - `StopAtType.Weight` -> Shows weight from scale, progress bar against `targetWeight`
  - `StopAtType.Volume` -> Shows volume from flow integration, progress bar against `targetVolume`
- Brew-by-ratio display: `"1:" + MainController.brewByRatio.toFixed(1)` (shown below weight)

#### Progress Bar
- Width: proportional to weight/volume progress
- Max width: 120px
- Color: `Theme.weightColor` (weight mode) or `Theme.flowColor` (volume mode)
- Height: 4px
- Shows alongside the weight/volume value

#### Stop Button
- Only visible on headless machines (`DE1Device.isHeadless`)
- Calls `DE1Device.requestIdle()` to stop the shot

#### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Escape | Stop shot (`DE1Device.requestIdle()`) |
| Space | Stop shot |
| Backspace | Stop shot |

#### Preheating State
- Shown when `MachineState.phase === Phase.EspressoPreheating`
- Centered banner: "Preheating..." text with secondary color
- Hides the ShotGraph until extraction begins

#### Accessibility
- Swipe left/right cycles through values (pressure, flow, temperature, weight)
- Two-finger tap announces full status (all values)
- Periodic timed announcements during extraction (configurable interval)

#### Data Bindings
- `MachineState.phase` - Current extraction phase
- `MachineState.shotTime` - Shot timer
- `MachineState.scaleWeight` - Current scale weight
- `MachineState.scaleFlowRate` - Scale flow rate
- `MachineState.cumulativeVolume` - Cumulative volume
- `MachineState.targetWeight` - Target weight
- `MachineState.targetVolume` - Target volume
- `MachineState.stopAtType` - Weight/Volume mode
- `MainController.brewByRatio` - Current brew ratio
- `DE1Device.isHeadless` - Headless machine flag
- ShotGraph receives data via C++ `ShotDataModel.registerSeries()`

---

### 5.3 SteamPage

**Source**: `vendor/decenza/qml/pages/SteamPage.qml` (~1049 lines)

#### Overview
Steam controls and heating indicator. Has two distinct views: live steaming view and settings view.

#### Two-View Architecture
- **Steaming View** (during `Phase.Steaming`): Timer, progress display, flow slider, stop button
- **Settings View** (when idle): Presets, duration/flow/temperature controls

#### Settings View Components

##### Pitcher Presets
- `PresetPillRow` with pitcher names and emojis
- Click: Select preset (loads its settings)
- Double-click selected: Start steaming
- Long-press (500ms) / Double-click: Open edit popup
- Drag-to-reorder (X axis)
- Add new preset button
- Presets stored as JSON array in `Settings.steamPitcherPresets`

##### Setting Controls (ValueInput components)
| Setting | Min | Max | Step | Suffix | Notes |
|---------|-----|-----|------|--------|-------|
| Duration | 1 | 120 | 1 | " s" | |
| Steam Flow | 40 | 250 | 5 | "" | Stored in 0.01 mL/s units, displayed as `value/100` |
| Temperature | 120 | 170 | 1 | "°C" | Global setting (not per-preset) |

##### Steam Heater Control
- Toggle switch for enabling/disabling steam heater
- When page opens: `MainController.startSteamHeating()` (forces heater on regardless of `keepSteamHeaterOn`)
- Back button: turns off heater if `keepSteamHeaterOn=false`

##### Heating Indicator
- Appears when `currentSteamTemp < targetSteamTemp - 5`
- Animated steam icon
- Progress bar: `currentSteamTemp / targetSteamTemp`
- Text: "Heating... X°C / Y°C"

#### Steaming View Components

##### Timer Display
- Large timer font: `MachineState.shotTime` formatted as `MM:SS`
- Progress bar below: `shotTime / duration`

##### Live Flow Slider
- During steaming, shows flow rate control
- Adjustable in real-time via `MainController.setSteamFlowImmediate()`

##### Stop Button (Headless machines)
- Two-stage stop:
  1. First press: `MainController.softStopSteam()` (sends 1-second timeout for soft stop)
  2. Second press: `DE1Device.requestIdle()` (triggers purge/puffing)
- Visual indicator shows "Stopping..." after first press
- Puffing state detection: `DE1Device.subState === 20`

#### Preset Edit Popup
- Fields: Name (text), Emoji (picker), Duration, Flow
- Save / Delete / Cancel buttons
- Delete confirmation for existing presets

#### Auto-Flush Countdown
- Shown during Puffing state when `Settings.steamAutoFlushSeconds > 0`
- Countdown display: `root.steamAutoFlushCountdown.toFixed(1) + "s"`
- Visual: countdown text above the timer

#### Data Bindings
- `MachineState.phase` - Steam phase detection
- `MachineState.shotTime` - Steam timer
- `DE1Device.subState` - Puffing detection (subState 20)
- `Settings.steamPitcherPresets` - Preset list
- `Settings.selectedSteamPitcherPreset` - Selected preset index
- `Settings.steamDuration` - Duration setting
- `Settings.steamFlow` - Flow setting
- `Settings.steamTemperature` - Temperature setting
- `Settings.keepSteamHeaterOn` - Heater control
- `Settings.steamDisabled` - Steam disabled flag
- `Settings.steamAutoFlushSeconds` - Auto-flush duration
- `root.steamAutoFlushCountdown` (from main.qml) - Live countdown value
- Snapshot data: `steamTemperature` for heating indicator

---

### 5.4 HotWaterPage

**Source**: `vendor/decenza/qml/pages/HotWaterPage.qml` (~770 lines)

#### Overview
Hot water dispensing controls with vessel presets and weight/volume modes.

#### Two-View Architecture
- **Dispensing View** (during `Phase.HotWater`): Progress display, weight readout, stop button
- **Settings View** (when idle): Presets, volume/weight, temperature controls

#### Settings View Components

##### Vessel Presets
- `PresetPillRow` with vessel names and emojis
- Identical interaction pattern to SteamPage presets
- Drag-to-reorder (X axis)
- Presets stored in `Settings.waterVesselPresets`

##### Weight/Volume Mode Toggle
- Two pill-style buttons: "Weight" and "Volume"
- Mode stored in `MachineState.stopAtType`
- Affects which target and progress display is used

##### Setting Controls
| Setting | Min | Max (Volume) | Max (Weight) | Step | Suffix |
|---------|-----|-------------|-------------|------|--------|
| Volume/Weight | 50 | 255 mL | 500 g | 10 | "mL" or "g" |
| Temperature | 40 | 100 | 100 | 1 | "°C" |

##### Scale Tare
- Auto-tare on page open (weight mode only)
- Calls `MachineState.tareScale()`

#### Dispensing View Components

##### Progress Display
- Weight mode: Live scale weight + progress bar toward target
  - `MachineState.scaleWeight` with progress bar
- Volume mode: Shows target volume only (no live tracking display)

##### Weight Readout
- Large value font: current weight
- Below: target weight or "of X g" / "of X mL"

##### Stop Button (Headless machines)
- Single press: `DE1Device.requestIdle()`
- Only visible when `DE1Device.isHeadless`

#### Preset Edit Popup
- Fields: Name (text), Emoji (picker), Volume/Weight, Temperature
- Save / Delete / Cancel buttons

#### Data Bindings
- `MachineState.phase` - Hot water phase detection
- `MachineState.scaleWeight` - Current scale weight
- `MachineState.stopAtType` - Weight/Volume mode
- `MachineState.targetWeight` - Target weight
- `MachineState.targetVolume` - Target volume
- `Settings.waterVesselPresets` - Preset list
- `Settings.selectedWaterVesselPreset` - Selected preset index
- `Settings.hotWaterVolume` - Volume setting
- `Settings.hotWaterTemperature` - Temperature setting

---

### 5.5 FlushPage

**Source**: `vendor/decenza/qml/pages/FlushPage.qml` (~693 lines)

#### Overview
Group head flush controls with presets and duration/flow settings.

#### Two-View Architecture
- **Flushing View** (during `Phase.Flushing`): Timer with progress bar, stop button
- **Settings View** (when idle): Presets, duration/flow controls

#### Settings View Components

##### Flush Presets
- `PresetPillRow` with preset names and emojis
- Identical interaction pattern to SteamPage/HotWaterPage presets
- Drag-to-reorder (X axis)
- Default new preset: `flow=6.0, seconds=5.0`
- Presets stored in `Settings.flushPresets`

##### Setting Controls
| Setting | Min | Max | Step | Suffix |
|---------|-----|-----|------|--------|
| Duration | 1 | 30 | 0.5 | " s" |
| Flow Rate | 2 | 10 | 0.5 | " mL/s" |

#### Flushing View Components

##### Timer with Progress Bar
- Large timer font: `MachineState.shotTime` formatted as seconds
- Progress bar: `shotTime / duration`
- Progress bar color: `Theme.primaryColor`
- Height: 6px, rounded corners

##### Stop Button (Headless machines)
- Single press: `DE1Device.requestIdle()`

#### Back Button Behavior
- Handles both pushed and replaced navigation cases
- If pushed (stack depth > 1): `pageStack.pop()`
- If replaced (stack depth == 1): `pageStack.replace(idlePage)`

#### Data Bindings
- `MachineState.phase` - Flush phase detection
- `MachineState.shotTime` - Flush timer
- `Settings.flushPresets` - Preset list
- `Settings.selectedFlushPreset` - Selected preset index
- `Settings.flushDuration` - Duration setting
- `Settings.flushFlowRate` - Flow rate setting

---

## 6. Profile & Recipe Pages

### 6.1 ProfileSelectorPage

**Source**: `vendor/decenza/qml/pages/ProfileSelectorPage.qml` (~747 lines)

#### Overview
Two-panel profile browser and selection interface.

#### Layout
- **Left panel**: All profiles list (flexible width)
- **Right panel**: Favorites list (380px fixed width)
- Separated by vertical divider

#### Left Panel - All Profiles

##### Filter Dropdown
| Filter | Source |
|--------|--------|
| Selected | `MainController.selectedProfiles` |
| Cleaning/Descale | `MainController.cleaningProfiles` |
| Decent Built-in | `MainController.allBuiltInProfiles` |
| Downloaded | `MainController.downloadedProfiles` |
| User Created | `MainController.userCreatedProfiles` |
| All Profiles | `MainController.allProfilesList` |

##### Profile List Item
- Profile title text
- Source indicator badge:
  - `D` (blue `#4a90d9`) - Decent built-in
  - `V` (green `#4ad94a`) - Downloaded from Visualizer
  - `U` (orange `#d9a04a`) - User created
- Favorite toggle (star icon)
- Overflow menu (three-dot button):
  - Edit (opens profile editor)
  - Delete / Remove (with confirmation dialog)

##### Non-Favorite Profile
- Shown with green pill indicator instead of star

##### Import Buttons
- "From Visualizer" - Opens VisualizerBrowserPage
- "From Tablet" / "Import File" (iOS variant) - Opens ProfileImportPage

#### Right Panel - Favorites

##### Favorites List
- Drag-to-reorder (Y axis)
- Edit button per profile (opens profile editor)
- Remove button per profile (removes from favorites)
- Maximum 50 favorites
- Drag visual: lifted item, dimmed placeholder

##### Profile Selection
- Click: Selects profile as current
- Sets as active profile on machine via `MainController.loadProfile(filename)`

#### Delete Confirmation Dialog
- Modal popup with warning text
- Shows favorite warning if profile is in favorites
- Special case: descale_wizard.json profiles handled differently
- Confirm / Cancel buttons

#### Data Bindings
- `MainController.availableProfiles` - All profiles list
- `MainController.selectedProfiles` - Selected/active profiles
- `MainController.allBuiltInProfiles` - Built-in profiles
- `MainController.cleaningProfiles` - Cleaning profiles
- `MainController.downloadedProfiles` - Downloaded profiles
- `MainController.userCreatedProfiles` - User-created profiles
- `MainController.allProfilesList` - Complete profiles list
- `MainController.currentProfileName` - Currently active profile name
- `Settings.favoriteProfiles` - Favorites list (ordered)

---

### 6.2 ProfileEditorPage

**Source**: `vendor/decenza/qml/pages/ProfileEditorPage.qml` (~2000+ lines)

#### Overview
Advanced frame-based profile editor with visual graph and step editor panel.

#### Layout
- **Left area**: `ProfileGraph` component (interactive, with frame selection)
- **Right panel**: Step editor for selected frame (scrollable)
- **Bottom bar**: Save / Save As / Discard / Back buttons

#### ProfileGraph Integration
- Click frame region to select it
- Double-click frame to edit (same as select)
- Selected frame highlighted with accent color
- Frame markers shown on graph

#### Frame List
- Vertical list of frame names/numbers
- Click to select
- Add frame button (inserts after selected)
- Delete frame button (with confirmation if > 1 frame)
- Move up/down buttons for reordering
- Duplicate frame button

#### Step Editor Panel (for selected frame)

##### Basic Properties
| Property | Type | Range | Notes |
|----------|------|-------|-------|
| Name | Text input | - | Frame name |
| Pump Mode | Radio: Pressure/Flow | - | Determines which target is active |
| Pressure | ValueInput | varies | Active when pump mode = pressure |
| Flow | ValueInput | varies | Active when pump mode = flow |
| Temperature | ValueInput | varies | Frame-specific temperature |
| Duration (Seconds) | ValueInput | varies | Frame duration |
| Transition | Radio: Instant/Smooth | - | How to ramp to target |

##### Exit Conditions
| Property | Type | Notes |
|----------|------|-------|
| `exit_if` | Checkbox | Enable machine-side exit condition |
| `exit_type` | Dropdown | `pressure_over`, `pressure_under`, `flow_over`, `flow_under` |
| Exit Pressure | ValueInput | Active when exit type is pressure |
| Exit Flow | ValueInput | Active when exit type is flow |
| `exit_weight` | ValueInput | **Independent** of `exit_if` flag - app-side weight exit |

##### Limiters
| Property | Type | Notes |
|----------|------|-------|
| `maxFlowOrPressure` | ValueInput | Maximum flow (in pressure mode) or pressure (in flow mode) |
| `maxFlowOrPressureRange` | ValueInput | Transition range for limiter |

#### Profile Operations
- **Save**: `MainController.saveProfile(filename)` - Overwrites existing file
- **Save As**: `MainController.saveProfileAs(filename, title)` - Creates new file
- **Discard**: Reloads from disk, discards unsaved changes
- **Unsaved Changes Dialog**: Shown when navigating away with modifications
  - "Save", "Discard", "Cancel" options
- **Switch to D-Flow Editor**: Confirmation dialog, then `root.switchToRecipeEditor()`

#### Frame Operations (MainController methods)
- `addFrame(afterIndex)` - Add new frame
- `deleteFrame(index)` - Delete frame
- `moveFrameUp(index)` - Swap with previous
- `moveFrameDown(index)` - Swap with next
- `duplicateFrame(index)` - Copy frame
- `setFrameProperty(index, property, value)` - Edit property
- `getFrameAt(index)` - Get frame data

#### Data Bindings
- `MainController.currentProfilePtr` - Current profile object
- `MainController.profileModified` - Unsaved changes flag
- `MainController.currentProfileName` - Profile name
- `MainController.frameCount()` - Number of frames
- Profile graph: `profileData.steps` array

---

### 6.3 ProfileInfoPage

**Source**: `vendor/decenza/qml/pages/ProfileInfoPage.qml` (249 lines)

#### Overview
Read-only profile details view with graph preview and metadata.

#### Layout
- `ScrollView` with `ColumnLayout`
- Bottom bar with back button

#### Sections

##### Header
- Profile title: `profileData.title` or fallback to `profileName`
- Author: "by [author]" (hidden if no author)

##### Profile Graph Card
- `ProfileGraph` component in card container
- Height: 220px (scaled)
- No frame selection (selectedFrameIndex = -1)
- "No profile data" message when steps array is empty

##### Settings Section (Card)
- **Stop at**: Type (Volume/Weight) + value (mL/g)
  - `profileData.stop_at_type === "volume"` → Volume, mL
  - Otherwise → Weight, g
- **Temperature**: `profileData.espresso_temperature` formatted to 1 decimal + "°C"
- **Frames**: `profileData.steps.length`

##### Profile Notes Section (Card)
- Full profile notes text
- Fallback: "No notes available for this profile."
- Text color: `textColor` if notes exist, `textSecondaryColor` if fallback

#### Properties
- `profileFilename` - Filename to load
- `profileName` - Display name fallback
- `profileData` - Loaded via `MainController.getProfileByFilename(profileFilename)`

---

### 6.4 RecipeEditorPage (D-Flow)

**Source**: `vendor/decenza/qml/pages/RecipeEditorPage.qml` (~1137 lines)

#### Overview
Simplified phase-based profile editor (D-Flow style). Converts between phase parameters and DE1 frames.

#### Layout
- **Left panel**: `ProfileGraph` + preset row
- **Right panel** (320px): ScrollView with recipe section cards
- **Bottom bar**: Save / Back buttons

#### Recipe Presets
| Preset | Description |
|--------|-------------|
| Classic | Traditional espresso profile |
| Londinium | Londinium-style lever profile |
| Turbo | Fast extraction profile |
| Blooming | Bloom-based extraction |
| D-Flow | Decline flow profile |

Applied via `MainController.applyRecipePreset(presetName)`

#### Recipe Sections

##### Core Settings
| Setting | Min | Max | Step | Suffix |
|---------|-----|-----|------|--------|
| Dose | 3 | 40 | 0.5 | "g" |
| Stop at | 0 | 100 | 1 | "g" |
| Ratio display | - | - | - | Computed: `stopAt / dose` |
| Notes | Text area | - | - | Free-form text |

##### Fill Phase
| Setting | Min | Max | Step | Suffix |
|---------|-----|-----|------|--------|
| Temperature | 80 | 100 | 1 | "°C" |
| Pressure | 1 | 6 | 0.5 | "bar" |
| Flow | 2 | 10 | 0.5 | "mL/s" |
| Exit Pressure | varies | varies | - | "bar" |
| Timeout | 5 | 60 | 1 | "s" |

##### Bloom Phase (Optional toggle)
| Setting | Min | Max | Step | Suffix | Notes |
|---------|-----|-----|------|--------|-------|
| Time | 1 | 30 | 1 | "s" | "Zero-flow pause for CO2 release" |

##### Infuse Phase
| Setting | Min | Max | Step | Suffix | Notes |
|---------|-----|-----|------|--------|-------|
| Pressure | 0 | 6 | 0.5 | "bar" | |
| Time | 0 | 60 | 1 | "s" | |
| By Weight | Checkbox | - | - | - | Enables weight-based infusion |
| Weight | 0 | 20 | 0.5 | "g" | Only when By Weight enabled |
| Volume | 10 | 200 | 10 | "mL" | |

##### Ramp Phase (Optional toggle)
| Setting | Min | Max | Step | Suffix |
|---------|-----|-----|------|--------|
| Time | 0.5 | 15 | 0.5 | "s" |

##### Pour Phase
| Setting | Min | Max | Step | Suffix | Notes |
|---------|-----|-----|------|--------|-------|
| Temperature | 80 | 100 | 1 | "°C" | |
| Mode | Radio: Pressure/Flow | - | - | Toggle between pressure/flow pour |
| Pressure | 3 | 12 | 0.5 | "bar" | Only when mode = Pressure |
| Flow | 0.5 | 6 | 0.5 | "mL/s" | Only when mode = Flow |
| Flow Limit | varies | varies | - | "mL/s" | Only when mode = Pressure |
| Pressure Limit | varies | varies | - | "bar" | Only when mode = Flow |

##### Decline Phase (Optional, only for Pressure pour)
| Setting | Min | Max | Step | Suffix | Notes |
|---------|-----|-----|------|--------|-------|
| To Pressure | 1 | (pour pressure - 1) | 0.5 | "bar" | Target decline pressure |
| Over Time | 5 | 60 | 1 | "s" | Decline duration |

#### Graph-Scroll Synchronization
- Scrolling the recipe sections highlights the corresponding frame region in the graph
- Clicking a frame region in the graph scrolls to the corresponding recipe section
- Mapping: `frameToSection` / `sectionToFrame` lookup

#### Switch to Advanced Editor
- Confirmation dialog: "This will convert to advanced frame mode"
- Calls `root.switchToAdvancedEditor()`
- Profile is converted via `MainController.convertCurrentProfileToAdvanced()`

#### Data Bindings
- `MainController.currentProfilePtr` - Current profile
- `MainController.isCurrentProfileRecipe` - Recipe mode check
- `MainController.profileModified` - Unsaved changes
- Recipe params via `MainController.getCurrentRecipeParams()` / `MainController.uploadRecipeProfile(params)`

---

### 6.5 PostShotReviewPage

**Source**: `vendor/decenza/qml/pages/PostShotReviewPage.qml` (~1461 lines)

#### Overview
Post-shot metadata editing, rating, and Visualizer upload. Shown after espresso extraction.

#### Properties
- `editShotId` - Shot ID to load and edit (always in edit mode)

#### Layout
- **Top**: 3-column GridLayout for metadata fields
- **Middle**: Shot graph (resizable)
- **Bottom**: Notes, rating, action buttons

#### Metadata Fields (3-column grid)
| Field | Type | Notes |
|-------|------|-------|
| Roaster / Bean Brand | SuggestionField | History-based autocomplete |
| Coffee / Bean Type | SuggestionField | History-based autocomplete |
| Roast Date | Text input | `yyyy-mm-dd` mask |
| Roast Level | Dropdown | Predefined levels |
| Grinder | SuggestionField | History-based autocomplete |
| Grinder Setting | SuggestionField | History-based autocomplete |
| Beverage Type | Dropdown | espresso, filter, etc. |
| Barista | SuggestionField | History-based autocomplete |

#### Measurement Fields
| Field | Min | Max | Step | Suffix |
|-------|-----|-----|------|--------|
| Dose | 0 | 40 | 0.5 | "g" |
| Out (yield) | 0 | 500 | 0.5 | "g" |
| TDS | 0 | 20 | 0.01 | "%" |
| EY (Extraction Yield) | 0 | 30 | 0.1 | "%" |

#### Rating Input
- Range: 0-100%
- Display: "Enjoyment" label
- Visual: star rating or percentage display

#### Notes
- `TextArea` with auto-sizing
- Minimum height: 100px
- Placeholder text

#### Shot Graph
- `HistoryShotGraph` component (variant of ShotGraph for historical data)
- Resizable height: 100-400px
- Height persisted in Settings
- Drag handle at bottom for resizing

#### Visualizer Integration
- Upload button: Uploads shot to visualizer.coffee
- Re-upload button: If previously uploaded
- Auto-save before upload (saves metadata first)
- Upload status display

#### AI Advice Feature
- Conversation overlay with AI assistant
- System prompts for espresso vs filter extraction
- User can ask questions about the shot
- Requires `MainController.aiManager` configured

#### SuggestionField Component
- Text input with dropdown autocomplete
- Populated from shot history (previous entries for same field)
- Filtered as user types

#### Sticky Metadata
- Bean brand, bean type, roast date, grinder, setting are "sticky"
- Values sync back to `Settings` for use in next shot
- Carried forward until explicitly changed

#### Unsaved Changes Tracking
- Tracks modifications to any field
- Warns on navigation away with unsaved changes

#### Data Bindings
- `MainController.lastSavedShotId` - Most recent shot ID
- `MainController.shotHistory` - Shot history storage
- `MainController.visualizer` - Visualizer uploader
- `MainController.aiManager` - AI advice manager
- Shot data loaded via `MainController.shotHistory.getShotData(shotId)`
- Settings: various `dye*` properties for sticky metadata

---

## 7. Shared Components

### 7.1 ShotGraph

**Source**: `vendor/decenza/qml/components/ShotGraph.qml` (363 lines)

#### Overview
Real-time shot graph using QtCharts. Displays live extraction data with goal lines.

#### Chart Configuration
- Transparent background
- Anti-aliasing enabled

#### Axes
| Axis | Min | Max | Visible | Notes |
|------|-----|-----|---------|-------|
| Time (X) | 0 | Dynamic | Yes | Max = data max + 5px padding |
| Pressure (Y) | 0 | 12 | Yes | Left axis |
| Temperature (Y) | 80 | 100 | No | Hidden, shared axis |
| Weight (Y) | 0 | targetWeight * 1.1 | Yes | Right axis |

#### Data Series
| Series | Color | Width | Style | Axis |
|--------|-------|-------|-------|------|
| Pressure (actual) | `#18c37e` | 3 | Solid | Pressure |
| Flow (actual) | `#4e85f4` | 3 | Solid | Pressure |
| Temperature (actual) | `#e73249` | 3 | Solid | Temperature |
| Weight (actual) | `#a2693d` | 3 | Solid | Weight |

#### Goal Series
| Series | Color | Width | Style | Segments |
|--------|-------|-------|-------|----------|
| Pressure goals | `#5fd9a8` | 2 | Dashed | Up to 5 segments |
| Flow goals | `#8fb3f5` | 2 | Dashed | Up to 5 segments |
| Temperature goal | `#f08090` | 2 | Dashed | 1 continuous |

Each goal series can have up to 5 discontinuous segments (for frames with different pump modes).

#### Markers
| Marker | Color | Style | Description |
|--------|-------|-------|-------------|
| Extraction start | `accentColor` | Dash-dot | When extraction begins (flow starts) |
| Stop marker | Red | Dash-dot | When shot stops |
| Frame markers (x10) | White 40% opacity | Dot | Frame transition boundaries |

#### Phase Marker Labels
- Small text labels at top of chart marking frame transitions
- Include transition reason suffix: `[W]` (weight), `[P]` (pressure), `[F]` (flow), `[T]` (time)

#### Pump Mode Indicator Bars
- Horizontal bars at chart bottom (4px height)
- Color: `flowColor` for flow mode, `pressureColor` for pressure mode
- One bar per frame, positioned at frame time range

#### Legend
- Custom overlay in top-left corner
- Semi-transparent background
- Shows colored dot + label for each visible series
- Series: Pressure, Flow, Temperature, Weight

#### C++ Integration
- Series registered via `ShotDataModel.registerSeries(series, type)`
- Data pushed from C++ side, QML just displays
- Live update as data streams in

---

### 7.2 ProfileGraph

**Source**: `vendor/decenza/qml/components/ProfileGraph.qml` (381 lines)

#### Overview
Static profile visualization using QtCharts. Shows the planned extraction profile (not live data).

#### Chart Configuration
- Same basic setup as ShotGraph
- Static data (not real-time)

#### Data Curves
| Curve | Color | Style | Segments |
|-------|-------|-------|----------|
| Pressure | `pressureColor` | Dashed | Up to 3 discontinuous |
| Flow | `flowColor` | Dashed | Up to 3 discontinuous |
| Temperature | `temperatureColor` | Dashed | 1 continuous |

Discontinuous segments handle frames with different pump modes (a pressure frame followed by a flow frame creates separate curve segments).

#### Frame Region Overlays
- Clickable regions covering each frame's time span
- Alternating background tint (subtle)
- Click: `frameSelected(index)` signal
- Double-click: `frameDoubleClicked(index)` signal
- Selected frame highlighted with `accentColor` tint

#### Pump Mode Indicator Bars
- Same as ShotGraph: colored bars at bottom indicating pressure/flow mode per frame

#### Properties
| Property | Type | Description |
|----------|------|-------------|
| `frames` | Array | Profile step data to visualize |
| `selectedFrameIndex` | int | Currently selected frame (-1 for none) |

#### Signals
| Signal | Parameters | Description |
|--------|-----------|-------------|
| `frameSelected` | `index` | Frame region clicked |
| `frameDoubleClicked` | `index` | Frame region double-clicked |

#### Curve Generation
- `updateCurves()` function generates curves from `frames` array
- Handles pump mode transitions (pressure ↔ flow)
- Calculates cumulative time for X axis
- Temperature curve is always continuous

---

### 7.3 ValueInput

**Source**: `vendor/decenza/qml/components/ValueInput.qml` (672 lines)

#### Overview
Compact numeric input with increment/decrement buttons, drag-to-adjust, and full-screen popup editor.

#### Visual Layout
```
[−]  value+suffix  [+]
```

#### Properties
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `value` | real | 0 | Current value |
| `from` | real | 0 | Minimum value |
| `to` | real | 100 | Maximum value |
| `stepSize` | real | 1 | Increment/decrement step |
| `decimals` | int | 1 | Decimal places for display |
| `suffix` | string | "" | Unit suffix (e.g., "g", "°C") |
| `displayText` | string | "" | Override display (if set, used instead of formatted value) |
| `valueColor` | color | primaryColor | Value text color |
| `accentColor` | color | primaryColor | Button accent color |
| `label` | string | "" | Accessible label |

#### Interactions
| Interaction | Action |
|-------------|--------|
| Tap `-` button | Decrement by `stepSize` |
| Tap `+` button | Increment by `stepSize` |
| Press and hold `-` / `+` | Repeat at 80ms interval |
| Tap value text | Open full-screen popup editor |
| Drag on value text | Adjust value (20 scaled pixels = 1 step) |
| Press value text | Show speech bubble with current value |

#### Speech Bubble
- Animated pop-in (scale 0 -> 1 with overshoot easing)
- Positioned above the value
- Background color: `valueColor`
- Shows formatted value + suffix
- Hides on release

#### Full-Screen Popup Editor
- Modal overlay
- Large value display
- `-` and `+` buttons (larger touch targets)
- Drag-to-adjust with larger sensitivity
- OK button to confirm

#### Accessibility
- Role: `Accessible.Slider`
- Keyboard: Arrow keys, Page Up/Down for larger steps
- Announces value changes

---

### 7.4 PresetPillRow

**Source**: `vendor/decenza/qml/components/PresetPillRow.qml` (272 lines)

#### Overview
Multi-row pill layout for preset selection with automatic row wrapping.

#### Visual Properties
| Property | Value |
|----------|-------|
| Pill height | 50px (scaled) |
| Pill radius | 10px (scaled) |
| Font size | 16px (scaled), bold |
| Horizontal padding | 40px (scaled) |
| Pill color (unselected) | `surfaceColor` |
| Pill color (selected) | `primaryColor` |

#### Row Distribution Algorithm
- Calculates total width of all pills
- Distributes across rows to balance widths
- Wraps when content exceeds available width

#### Properties
| Property | Type | Description |
|----------|------|-------------|
| `model` | Array | Preset data array |
| `currentIndex` | int | Selected preset index |
| `longPressEnabled` | bool | Enable long-press interaction |

#### Interactions
| Interaction | Signal |
|-------------|--------|
| Click | Select preset (updates `currentIndex`) |
| Double-click (selected) | Starts operation |
| Long-press (if enabled) | `longPressed(index)` signal |

#### Keyboard Navigation
- Left/Right arrows to navigate between pills
- Enter/Space to select focused pill

---

### 7.5 BottomBar

**Source**: `vendor/decenza/qml/components/BottomBar.qml` (99 lines)

#### Overview
Standard bottom navigation bar used across pages.

#### Layout
```
[Back Button]  Title  [Custom Content]  [Right Text]
```

#### Properties
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `title` | string | "" | Center title text |
| `barColor` | color | `Theme.primaryColor` | Bar background color |
| `rightText` | string | "" | Right-aligned text |

#### Components
- **Back button**: Full bar height (70px) square hitbox, arrow icon
  - Signal: `onBackClicked`
- **Title**: Center-aligned, `titleFont`, white color
- **Custom content area**: `default property alias` for child items
- **Right text**: Right-aligned, `bodyFont`, white color

---

### 7.6 CircularGauge

**Source**: `vendor/decenza/qml/components/CircularGauge.qml` (99 lines)

#### Overview
SVG Shape arc gauge for displaying pressure, temperature, or other values.

#### Arc Geometry
| Property | Value |
|----------|-------|
| Start angle | 135 degrees |
| Sweep angle | 270 degrees |
| Background arc opacity | 20% |
| Value arc opacity | 100% |
| Cap style | `RoundCap` |

#### Properties
| Property | Type | Description |
|----------|------|-------------|
| `value` | real | Current value |
| `minValue` | real | Minimum range |
| `maxValue` | real | Maximum range |
| `unit` | string | Unit label (e.g., "bar", "°C") |
| `label` | string | Bottom label text |
| `color` | color | Arc color |

#### Visual Elements
- Background arc: full sweep at 20% opacity
- Value arc: proportional sweep at full color intensity
- Center text: value (20px bold) + unit (label font)
- Label below arc

---

### 7.7 BrewDialog

**Source**: `vendor/decenza/qml/components/BrewDialog.qml` (657 lines)

#### Overview
Pre-brew settings dialog shown before starting espresso.

#### Layout
- Modal popup dialog
- Settings section with ValueInput controls
- Action buttons at bottom

#### Settings
| Setting | Min | Max | Step | Suffix | Notes |
|---------|-----|-----|------|--------|-------|
| Temperature | 70 | 100 | 0.5 | "°C" | |
| Dose | 1 | 50 | 0.5 | "g" | With "Read Scale" button |
| Ratio | 0.5 | 20 | 0.1 | "" | |
| Yield | 1 | 400 | 0.5 | "g" | |

#### Scale Read Feature
- "Read Scale" button reads current scale weight as dose
- Low dose warning when dose < 3g or scale read fails
- Visual: warning text in `warningColor`

#### Grinder Fields (Conditional)
- Only visible when `Settings.visualizerExtendedMetadata` is enabled
- Grinder model: `SuggestionField` with autocomplete
- Grinder setting: `SuggestionField` with autocomplete

#### Update Profile Buttons
- "Update Profile Temperature" - Saves new temperature back to profile
- "Update Profile Yield" - Saves new yield back to profile

#### Action Buttons
- **Clear**: Resets all fields to profile defaults
- **Cancel**: Closes dialog without applying
- **OK**: Applies overrides and starts brewing
  - Calls `MainController.activateBrewWithOverrides(dose, yield, temperature, grind)`

---

### 7.8 ProfilePreviewPopup

**Source**: `vendor/decenza/qml/components/ProfilePreviewPopup.qml` (172 lines)

#### Overview
Profile graph preview dialog, shown on long-press of espresso preset.

#### Layout
- 90% parent width, 50% parent height
- Modal with dim overlay
- Header: Profile name + "More Info" button + Close button
- Body: `ProfileGraph` component

#### Components
- **Header title**: Profile name (title font)
- **"More Info" button**: Navigates to `ProfileInfoPage` with profile data
- **Close button**: "X" icon
- **ProfileGraph**: Full preview of profile frames (no selection)

---

### 7.9 ConnectionIndicator

**Source**: `vendor/decenza/qml/components/ConnectionIndicator.qml` (72 lines)

#### Overview
Displays machine connection status.

#### States
| State | Color | Text |
|-------|-------|------|
| Online | `successColor` | "Online" |
| Offline | `errorColor` | "Offline" |

#### Detail Text
Shows connection details below status:
- "Machine" - Only DE1 connected
- "Machine + Scale" - DE1 + physical scale connected
- "Machine + Simulated Scale" - DE1 + FlowScale (estimated weight)

#### Visual
- Status text in `valueFont`
- Detail text in `labelFont`
- Color-coded by connection state

---

## 8. Machine State & Controller Reference

### MachineState Phases

**Source**: `vendor/decenza/src/machine/machinestate.h`

```
enum class Phase {
    Disconnected,
    Sleep,
    Idle,
    Heating,
    Ready,
    EspressoPreheating,   // Warming up for espresso
    Preinfusion,
    Pouring,
    Ending,
    Steaming,
    HotWater,
    Flushing,
    Refill,
    Descaling,
    Cleaning
};
```

### MachineState Key Properties
| Property | Type | Description |
|----------|------|-------------|
| `phase` | Phase enum | Current machine phase |
| `isFlowing` | bool | True during active extraction/dispensing |
| `isHeating` | bool | True during heating phases |
| `isReady` | bool | True when machine is ready for operation |
| `shotTime` | double | Shot timer (seconds) |
| `targetWeight` | double | Target weight for stop-at (default 36.0g) |
| `targetVolume` | double | Target volume for stop-at (default 36.0ml) |
| `scaleWeight` | double | Current scale weight |
| `scaleFlowRate` | double | Current scale flow rate |
| `cumulativeVolume` | double | Integrated volume from flow meter |
| `stopAtType` | StopAtType | Weight or Volume |

### MachineState Signals
| Signal | Description |
|--------|-------------|
| `phaseChanged` | Machine phase transitioned |
| `shotTimeChanged` | Shot timer updated |
| `targetWeightChanged` | Target weight changed |
| `targetVolumeChanged` | Target volume changed |
| `cumulativeVolumeChanged` | Volume accumulation updated |
| `stopAtTypeChanged` | Stop-at mode changed |
| `scaleWeightChanged` | Scale weight updated |
| `espressoCycleStarted` | Espresso cycle began (clear graph) |
| `shotStarted` | Extraction flow actually started |
| `shotEnded` | Extraction ended |
| `targetWeightReached` | Scale hit target weight |
| `targetVolumeReached` | Flow meter hit target volume |
| `tareCompleted` | Scale tare completed |

### MainController Key Q_INVOKABLE Methods (used from QML)

**Profile Management:**
- `loadProfile(filename)` - Load and activate a profile
- `saveProfile(filename)` - Save current profile
- `saveProfileAs(filename, title)` - Save as new file
- `deleteProfile(filename)` - Delete user/downloaded profile
- `getProfileByFilename(filename)` - Load profile data for preview
- `getCurrentProfile()` - Get current profile as QVariantMap
- `uploadProfile(profileData)` - Upload profile to machine
- `markProfileClean()` - Clear modified flag after save

**Frame Editing:**
- `addFrame(afterIndex)` - Add new frame
- `deleteFrame(index)` - Delete frame
- `moveFrameUp(index)` / `moveFrameDown(index)` - Reorder
- `duplicateFrame(index)` - Copy frame
- `setFrameProperty(index, property, value)` - Edit property
- `getFrameAt(index)` - Get frame data
- `frameCount()` - Number of frames

**Recipe (D-Flow):**
- `applyRecipePreset(presetName)` - Apply preset
- `uploadRecipeProfile(recipeParams)` - Upload recipe
- `getCurrentRecipeParams()` - Get current recipe parameters
- `createNewRecipe(title)` - Create new recipe
- `convertCurrentProfileToRecipe()` - Advanced -> D-Flow
- `convertCurrentProfileToAdvanced()` - D-Flow -> Advanced

**Brewing:**
- `activateBrewWithOverrides(dose, yield, temp, grind)` - Start with overrides
- `clearBrewOverrides()` - Clear overrides

**Steam:**
- `startSteamHeating()` - Force steam heater on
- `turnOffSteamHeater()` - Send 0°C
- `softStopSteam()` - Soft stop (1-second timeout)
- `sendSteamTemperature(temp)` - Set steam temp
- `setSteamTemperatureImmediate(temp)` - Real-time setting update
- `setSteamFlowImmediate(flow)` - Real-time setting update
- `setSteamTimeoutImmediate(timeout)` - Real-time setting update
- `applySteamSettings()` - Apply current settings to machine

**Settings Application:**
- `applyHotWaterSettings()` - Apply hot water settings
- `applyFlushSettings()` - Apply flush settings

**Profile Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `currentProfileName` | string | Active profile name |
| `baseProfileName` | string | Base profile name (before modifications) |
| `profileModified` | bool | Has unsaved changes |
| `isCurrentProfileRecipe` | bool | D-Flow mode profile |
| `targetWeight` | double | Target weight (read/write) |
| `brewByRatioActive` | bool | Ratio mode active |
| `brewByRatioDose` | double | Dose for ratio calculation |
| `brewByRatio` | double | Current brew ratio |
| `profileTargetTemperature` | double | Profile's target temperature |
| `profileTargetWeight` | double | Profile's target weight |
| `profileHasRecommendedDose` | bool | Profile has dose recommendation |
| `profileRecommendedDose` | double | Recommended dose value |

**Profile Lists:**
| Property | Description |
|----------|-------------|
| `availableProfiles` | All available profiles |
| `selectedProfiles` | Currently selected profiles |
| `allBuiltInProfiles` | Decent built-in profiles |
| `cleaningProfiles` | Cleaning/descale profiles |
| `downloadedProfiles` | Downloaded from Visualizer |
| `userCreatedProfiles` | User-created profiles |
| `allProfilesList` | Complete profile list |

---

## 9. Global Behaviors & Dialogs

### Global Dialogs (main.qml)

| Dialog | Trigger | Description |
|--------|---------|-------------|
| BLE Error | `BLEManager.onErrorOccurred` | Location/Bluetooth permission errors with "Open Settings" button |
| No Scale Found | `BLEManager.onFlowScaleFallback` | Using estimated weight (FlowScale) |
| Scale Disconnected | `BLEManager.onScaleDisconnected` | Physical scale lost connection |
| Shot Aborted No Scale | `MainController.onShotAbortedNoScale` | Shot stopped because saved scale not connected |
| Water Refill | `MachineState.phase === Refill` | Water tank needs refilling |
| Update Available | `UpdateChecker.onUpdatePromptRequested` | App update notification |
| Crash Report | Startup (if crash log exists) | Previous session crash details |
| Welcome | First run | Initial setup instructions |
| Storage Setup | Android first run | Request storage permissions |

### Popup Queue System
- Popups that arrive during screensaver are queued
- Queue is drained after waking (500ms delay for UI settle)
- Deduplication by popup ID
- Each popup's `onClosed` triggers `showNextPendingPopup()` to chain

### Accessibility
- Global tap handler reads nearest Text element (10mm radius search)
- Page change announcements via `announceCurrentPage()`
- `cleanForSpeech()` expands units for TTS (°C -> degrees Celsius, g -> grams, etc.)
- Translation edit mode overlay with "Done Editing" button and untranslated count badge

### Translation System
- `TranslationManager.translate(key, fallback)` pattern throughout
- `Tr` component for inline translatable text
- Edit mode: visual overlay for in-app translation editing

### Window Management
- On close: sends scale to sleep, then DE1 to sleep (150ms delay between), then quits (300ms delay)
- Window position saved/restored on desktop (not size)
- Fullscreen on Android, windowed on desktop

---

## 10. Streamline-Bridge API Gap Analysis

A detailed cross-reference of these feature requirements against the Streamline-Bridge REST/WebSocket API is documented separately in:

**[`/docs/streamline-bridge-gaps-core.md`](./streamline-bridge-gaps-core.md)**

### Critical Gaps (may block features)
- **Frame skip command**: No API to advance to next profile frame mid-shot (needed for weight-based frame exits)
- **Stop-at-weight/volume configuration**: No explicit API to read/set stop-at mode and target independently of profile

### Important Gaps (workarounds available)
- **Shot timer**: Not in snapshot; must be computed client-side from state transitions
- **Scale flow rate**: Not documented in scale snapshot WebSocket; compute from weight deltas
- **Cumulative volume**: Not in snapshot; integrate flow from machine snapshot
- **Profile favorites/ordering**: No server-side concept; use key-value store API
- **Operation presets**: No server-side preset management; use key-value store API
- **Steam heater granular control**: No explicit start-heating/soft-stop commands; approximate via shotSettings
- **Substate mapping verification**: Need to verify DE1 numeric substates map to Streamline-Bridge string substates

### No API Changes Needed (client-side implementation)
- Shot timer, auto-sleep, screensaver, navigation routing, completion overlays, D-Flow recipe conversion, all UI components, preset/layout/metadata persistence (via key-value store), steam auto-flush countdown, brew-by-ratio calculation, progress bars
