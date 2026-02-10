# Feature Requirements: History, Settings, and Advanced Pages

Comprehensive feature documentation extracted from the Decenza DE1 QML source code.
This document covers all pages in **Phases 3 and 4** of the porting plan.

---

## Table of Contents

1. [Shot History Page](#1-shot-history-page)
2. [Shot Detail Page](#2-shot-detail-page)
3. [Shot Comparison Page](#3-shot-comparison-page)
4. [Post-Shot Review Page](#4-post-shot-review-page)
5. [Settings Page (Container)](#5-settings-page-container)
6. [Settings: Bluetooth Tab](#6-settings-bluetooth-tab)
7. [Settings: Preferences Tab](#7-settings-preferences-tab)
8. [Settings: Options Tab](#8-settings-options-tab)
9. [Settings: Screensaver Tab](#9-settings-screensaver-tab)
10. [Settings: Visualizer Tab](#10-settings-visualizer-tab)
11. [Settings: AI Tab](#11-settings-ai-tab)
12. [Settings: Accessibility Tab](#12-settings-accessibility-tab)
13. [Settings: Themes Tab](#13-settings-themes-tab)
14. [Settings: Layout Tab](#14-settings-layout-tab)
15. [Settings: Language Tab](#15-settings-language-tab)
16. [Settings: Shot History Tab](#16-settings-shot-history-tab)
17. [Settings: Data Tab](#17-settings-data-tab)
18. [Settings: Home Automation (MQTT) Tab](#18-settings-home-automation-mqtt-tab)
19. [Settings: Update Tab](#19-settings-update-tab)
20. [Settings: About Tab](#20-settings-about-tab)
21. [Settings: Debug Tab](#21-settings-debug-tab)
22. [Screensaver Page](#22-screensaver-page)
23. [Descaling Page](#23-descaling-page)
24. [Visualizer Browser Page](#24-visualizer-browser-page)
25. [Visualizer Multi-Import Page](#25-visualizer-multi-import-page)
26. [Bean Info Page](#26-bean-info-page)
27. [AI Settings Page](#27-ai-settings-page)
28. [Dialing Assistant Page](#28-dialing-assistant-page)
29. [Community Browser Page](#29-community-browser-page)
30. [Auto-Favorites Page](#30-auto-favorites-page)
31. [Key Shared Components](#31-key-shared-components)
32. [Styled Form Components](#32-styled-form-components)
33. [Color Components (Theme Customization)](#33-color-components-theme-customization)
34. [Screensaver Components](#34-screensaver-components)
35. [UnsavedChangesDialog](#35-unsavedchangesdialog)
36. [SwipeableArea](#36-swipeablearea)
37. [Layout Widget Items](#37-layout-widget-items)
38. [Library Components](#38-library-components)
39. [C++ Data Model Reference](#39-c-data-model-reference)
40. [Web Skin Applicability Notes](#40-web-skin-applicability-notes)

---

## 1. Shot History Page

**Source**: `vendor/decenza/qml/pages/ShotHistoryPage.qml` (653 lines)

### Purpose
Paginated, filterable, selectable list of all saved espresso shots with multi-select for comparison.

### Layout
- Full-page vertical layout
- Top section: filter row + search
- Main section: scrollable shot list (ListView)
- Bottom section: action bar with pagination info and comparison button

### Data Model
- **Source**: `MainController.shotHistory` (C++ ShotHistory model)
- **Pagination**: `pageSize: 50`, `currentOffset: 0`, `hasMoreShots` flag, infinite scroll
- **Filter properties**: `filteredTotalCount` tracks filtered result count

### Filter System
- **Profile filter**: `StyledComboBox` bound to `MainController.shotHistory.uniqueProfiles` with "All Profiles" default
- **Roaster filter**: `StyledComboBox` bound to `MainController.shotHistory.uniqueRoasters` with "All Roasters" default
- **Bean filter**: `StyledComboBox` bound to `MainController.shotHistory.uniqueBeans` with "All Beans" default. **Cascading**: when roaster changes, bean list is filtered to that roaster's beans
- **Search field**: `StyledTextField` with 300ms debounce `Timer`, searches across profile name, bean brand, bean type, roaster, barista, notes
- Filters call `MainController.shotHistory.setFilter(profile, roaster, bean, search)` and reset offset to 0

### Shot List Delegate
Each shot row (height: `Theme.scaled(90)`):

| Element | Position | Style | Data |
|---------|----------|-------|------|
| Checkbox | Left, centered | 24x24 rounded rect, primaryColor when selected | `selectedShots.indexOf(shotId) >= 0` |
| Date/Time | Top-left after checkbox | `subtitleFont`, `textColor` | `Qt.formatDateTime(shot.timestamp, "yyyy-MM-dd hh:mm")` |
| Profile name | Below date | `bodyFont`, `textColor`, **bold** | `shot.profileName` with optional temp override in brackets |
| Bean + Grind info | Below profile | `captionFont`, `textSecondaryColor` | `"brand type | grinder @ setting"` |
| Dose/Yield | Right of bean info | `captionFont` | `dose.toFixed(1) + "g → " + output.toFixed(1) + "g"` |
| Duration | Far right top | `bodyFont`, `textSecondaryColor` | `formatDuration(shot.duration)` in `M:SS` format |
| Cloud icon | Right, top area | Small icon | Visible only if `shot.visualizerId > 0` (uploaded to visualizer) |
| Enjoyment % | Right center | `warningColor` for rating text | `shot.enjoyment + "%"` visible if > 0 |
| Load button | Right side | `warningColor` background, white text | Loads shot settings as current recipe |
| Edit button | Right side | Green `#2E7D32` background | Opens PostShotReviewPage in edit mode |
| Detail arrow | Far right | `primaryColor` | Chevron `>`, opens ShotDetailPage |

### Selection System
- `property var selectedShots: []` (array of shot IDs)
- Tap checkbox to toggle individual selection
- `toggleSelection(shotId)` adds/removes from array
- Header shows selection count: "N selected"
- "Select All" / "Deselect All" toggle in filter bar

### Actions
- **Open Detail**: `pageStack.push(ShotDetailPage, { shotId: id, shotIds: allVisibleIds, currentIndex: index })` - passes navigable shot ID list
- **Open Comparison**: `pageStack.push(ShotComparisonPage, { shotIds: selectedShots.sort() })` - sorts chronologically before passing
- **Load Shot**: `MainController.loadShotWithMetadata(shotId)` - loads profile + DYE metadata as current recipe
- **Edit Shot**: `pageStack.push(PostShotReviewPage, { editShotId: shotId })`

### Infinite Scroll
- `onAtYEndChanged`: when `atYEnd && hasMoreShots && !loading`, increment `currentOffset += pageSize` and call `loadMore()`
- Loading indicator (BusyIndicator) at bottom of list during fetch

---

## 2. Shot Detail Page

**Source**: `vendor/decenza/qml/pages/ShotDetailPage.qml` (1027 lines)

### Purpose
Individual shot review with graph, metadata, navigation between shots, AI analysis, and visualizer upload.

### Layout
- Top: Graph card with swipe navigation
- Middle: Metrics row
- Bottom: Scrollable info cards in 2-column grid
- Overlay: AI conversation panel (full screen)

### Properties
- `shotId`: Current shot ID
- `shotData`: Full shot object from database
- `shotIds: []`: Array of navigable shot IDs (from history page)
- `currentIndex`: Position in shotIds array

### Shot Graph
- **Component**: `HistoryShotGraph` in a card (height: `Theme.scaled(250)`)
- Wrapped in `SwipeableArea` for left/right swipe navigation between shots
- Position indicator: `"N / total"` text centered below graph (captionFont, textSecondaryColor)

### Metrics Row
Horizontal row of metric cards (each a small rounded rect):

| Metric | Color | Format |
|--------|-------|--------|
| Duration | textColor | `M:SS` |
| Dose | `dyeDoseColor` | `XX.Xg` |
| Output | `dyeOutputColor` | `XX.Xg` with optional target in parentheses |
| Ratio | textColor | `1:X.X` (output/dose) |
| Rating | `warningColor` | `XX%` |

### Info Cards (2-column grid)
Each is a bordered rounded rectangle with label (captionFont, textSecondaryColor) and value (bodyFont, textColor):

1. **Bean Info**: brand (bold), type, roast date, roast level
2. **Grinder Info**: model, setting
3. **Analysis**: TDS (`dyeTdsColor`), EY (`dyeEyColor`)
4. **Barista**: name
5. **Notes**: multiline text

### Actions (Bottom Bar)
- **View Debug Log**: Opens modal dialog (90% width x 80% height) with monospace scrollable `TextArea` showing `shot.debug_log`
- **Delete Shot**: Confirmation dialog ("Delete this shot? This cannot be undone."), then `MainController.shotHistory.deleteShot(shotId)`, navigates back
- **Upload to Visualizer**: If not uploaded, "Upload to Visualizer" button. If already uploaded, "Re-Upload" button. Calls `MainController.visualizer.uploadShot(shotId)`
- **AI Advice**: Opens AI conversation overlay
- **Email Prompt**: `Qt.openUrlExternally("mailto:?subject=...&body=...")` with shot summary as body (fallback for sharing)

### AI Conversation Overlay
- Full-screen semi-transparent overlay (`Qt.rgba(0, 0, 0, 0.7)`)
- Inner card with:
  - Title bar: "AI Shot Analysis" + Close button
  - Scrollable conversation history (markdown rendered via `textFormat: Text.MarkdownText`)
  - Loading state: `BusyIndicator` + "Thinking..."
  - Input row: `StyledTextField` + Send button
  - "Copy" button to copy last response to clipboard
- System prompt varies by `shot.beverageType`:
  - Espresso: includes extraction dynamics, pressure/flow analysis
  - Filter/pourover: adjusted for immersion/percolation
- Sends full shot data (pressure/flow/temp/weight arrays + metadata) as context

### Navigation
- Swipe left/right on graph to navigate between shots
- Updates `currentIndex`, loads new shot data
- Wraps: first shot swipe-left shows last, last shot swipe-right shows first

---

## 3. Shot Comparison Page

**Source**: `vendor/decenza/qml/pages/ShotComparisonPage.qml` (502 lines)

### Purpose
Compare multiple shots side-by-side with overlay graph and detailed metrics.

### Layout
- Top: Resizable comparison graph
- Middle: Curve toggle buttons
- Bottom: Shot details columns (scrollable)

### Properties
- `shotIds: []`: Array of shot IDs to compare
- `graphHeight`: Persisted preference for graph height
- `showPressure: true`, `showFlow: true`, `showWeight: true`: Curve visibility toggles

### Comparison Graph
- **Component**: `ComparisonGraph` (QtCharts ChartView)
- Wrapped in `SwipeableArea` for navigating the 3-shot sliding window
- **Sliding window**: Shows 3 shots at a time from the full list
- Window navigated by swiping or arrow buttons
- Position indicator: `"Shots N-M of total"` text

#### ComparisonGraph Details (from `components/ComparisonGraph.qml`)
- 3 shot color sets cycling based on window position:
  - Green: `#4CAF50` (pressure), `#81C784` (flow), `#A5D6A7` (weight)
  - Blue: `#2196F3` (pressure), `#64B5F6` (flow), `#90CAF9` (weight)
  - Orange: `#FF9800` (pressure), `#FFB74D` (flow), `#FFCC80` (weight)
- 9 LineSeries total (3 shots x 3 curves)
- Pressure: solid line, `graphLineWidth`
- Flow: dash line (`Qt.DashLine`), `graphLineWidth`
- Weight: dot line (`Qt.DotLine`), `graphLineWidth - 1`, scaled by /5 for display
- X axis: Time (s), 0 to max(15, maxTime + 0.5), 7 ticks
- Left Y axis: 0-12 (bar / mL/s), 5 ticks
- Weight Y axis: 0-12, hidden
- Background: `Qt.darker(Theme.surfaceColor, 1.3)`

### Graph Resize
- Drag handle below graph (small horizontal bar, `Theme.borderColor`)
- Min height: `Theme.scaled(150)`, Max height: `Theme.scaled(500)`
- Height persisted to settings

### Curve Toggle Buttons
Row of toggle buttons:
- **Pressure**: Solid line icon, `pressureColor` when active
- **Flow**: Dashed line icon, `flowColor` when active
- **Weight**: Dotted line icon, `weightColor` when active
- Each toggles corresponding `show*` property

### Shot Columns
Below graph, horizontally scrollable row of shot cards (one per visible shot):

Each column (color-coded matching graph):
| Field | Style |
|-------|-------|
| Profile name | bold, textColor |
| Date/Time | captionFont, textSecondaryColor |
| Duration | bodyFont |
| Dose | dyeDoseColor |
| Output | dyeOutputColor |
| Ratio | textColor |
| Rating | warningColor (if > 0) |
| Bean | textSecondaryColor |
| Roast | textSecondaryColor |
| TDS / EY | dyeTdsColor / dyeEyColor |
| Barista | textSecondaryColor |
| Notes | textSecondaryColor, multiline |

---

## 4. Post-Shot Review Page

**Source**: `vendor/decenza/qml/pages/PostShotReviewPage.qml` (1461 lines)

### Purpose
Full DYE (Describe Your Espresso) metadata editor. Used both after a shot and for editing existing shots.

### Layout
- Top: Resizable shot graph
- Middle: 3-column field grid
- Bottom: Action bar

### Modes
- **Post-shot review** (default): `editShotId === 0`, editing the current/last shot
- **Edit existing shot**: `editShotId > 0`, loaded from history

### Shot Graph
- `HistoryShotGraph` with resizable height
- Min: `Theme.scaled(100)`, Max: `Theme.scaled(400)`
- Height persisted to settings
- Drag handle for resizing

### Field Grid (3 columns)

**Column 1 - Bean Info:**

| Field | Type | Details |
|-------|------|---------|
| Roaster | `SuggestionField` | Auto-complete from previous roasters |
| Coffee | `SuggestionField` | Auto-complete, filtered by selected roaster |
| Roast date | `StyledTextField` | Input mask `yyyy-mm-dd` |
| Roast level | `StyledComboBox` | Options: Light, Medium-Light, Medium, Medium-Dark, Dark |

**Column 2 - Grinder/Beverage:**

| Field | Type | Details |
|-------|------|---------|
| Grinder | `SuggestionField` | Auto-complete from previous grinders |
| Grinder Setting | `SuggestionField` | Auto-complete, filtered by selected grinder |
| Beverage type | `StyledComboBox` | Options: espresso, filter, pourover, tea_portafilter, tea, calibrate, cleaning, descale, manual |
| Barista | `SuggestionField` | Auto-complete from previous baristas |

**Column 3 - Measurements:**

| Field | Type | Range | Step |
|-------|------|-------|------|
| Dose | `ValueInput` | 0-40g | 0.1 |
| Out (yield) | `ValueInput` | 0-500g | 0.1 |
| TDS | `ValueInput` | 0-20% | 0.01 |
| EY | `ValueInput` | 0-30% | 0.1 |

**Below grid (full width):**

| Field | Type | Details |
|-------|------|---------|
| Preset | Read-only text | Profile name used for the shot |
| Shot date | Read-only text | Timestamp of the shot |
| Rating | `RatingInput` | 0-100% with gradient slider + preset buttons |
| Notes | `TextArea` | Multiline, full-width |

### Sticky Metadata
- Bean info (roaster, coffee, roast date, roast level) and grinder info (grinder, setting, barista) are "sticky" -- they sync back to `Settings` so the next shot auto-populates these values
- Enjoyment/rating and notes are shot-specific, never sticky

### Unsaved Changes Tracking
- `hasUnsavedChanges` property tracks modifications
- `UnsavedChangesDialog` shown on back navigation if unsaved changes exist
- Options: "Discard", "Cancel", "Save"

### Actions (Bottom Bar)
- **Save Changes**: Saves all metadata to shot database
- **Upload / Re-Upload to Visualizer**: Same as ShotDetailPage
- **AI Advice**: Opens AI conversation overlay (same as ShotDetailPage)
- **Email Prompt**: mailto: link with shot summary

---

## 5. Settings Page (Container)

**Source**: `vendor/decenza/qml/pages/SettingsPage.qml` (484 lines)

### Purpose
Tab-based container for all settings categories.

### Layout
- Top: Horizontal scrollable tab bar
- Main: Tab content loaded via async `Loader` components

### Tab Bar
16 tabs, each loaded lazily:

| Index | Tab Name | Source File | Conditional |
|-------|----------|-------------|-------------|
| 0 | Bluetooth | SettingsBluetoothTab.qml | Always |
| 1 | Preferences | SettingsPreferencesTab.qml | Always |
| 2 | Options | SettingsOptionsTab.qml | Always |
| 3 | Screensaver | SettingsScreensaverTab.qml | Always |
| 4 | Visualizer | SettingsVisualizerTab.qml | Always |
| 5 | AI | SettingsAITab.qml | Always |
| 6 | Accessibility | SettingsAccessibilityTab.qml | Always |
| 7 | Themes | SettingsThemesTab.qml | Always |
| 8 | Layout | SettingsLayoutTab.qml | Always |
| 9 | Language | SettingsLanguageTab.qml | Always, with "untranslated" badge |
| 10 | History | SettingsShotHistoryTab.qml | Always |
| 11 | Data | SettingsDataTab.qml | Always |
| 12 | MQTT | SettingsHomeAutomationTab.qml | Always |
| 13 | Update | SettingsUpdateTab.qml | Conditional (platform check) |
| 14 | About | SettingsAboutTab.qml | Always |
| 15 | Debug | SettingsDebugTab.qml | Conditional (debug mode) |

### Features
- `requestedTabIndex` property for deep-linking to specific tab
- Save Theme Dialog: Popup for naming and saving custom themes (triggered from Themes tab)
- Each tab loaded as async `Loader` with `active: currentTab === index` (lazy loading)

---

## 6. Settings: Bluetooth Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsBluetoothTab.qml` (591 lines)

### Purpose
BLE device management for DE1 machine and scale.

### Layout
2-column: Machine (left) + Scale (right)

### Machine Column
- **Status**: Connected/Disconnected with color indicator (successColor/errorColor)
- **Scan button**: "Scan for DE1" / "Stop Scan" toggle
- **Firmware**: Version string, visible when connected
- **Discovered devices**: ListView showing `name (address)` for each BLEManager.discoveredDevices
  - Click to connect: `DE1Device.connectToDevice(address)`
- **Scan log**: Dark monospace scrolling TextArea showing BLE debug messages

### Scale Column
- **Status**: Connected / Virtual Scale (warningColor) / Simulated (warningColor) / Not Found (errorColor) / Disconnected
- **Scan button**: "Scan for Scales" (disabled during scanning)
- **Connected scale name**: Shows `ScaleDevice.name` when connected and not FlowScale
- **Virtual Scale notice**: Blue info box when FlowScale active (flow-based weight estimation)
- **Simulated Scale notice**: Yellow warning box when in simulation mode
- **Saved scale**: Shows `Settings.scaleType` with "Forget" button to clear saved scale
- **Weight display**: `MachineState.scaleWeight.toFixed(1) + " g"` with Tare button
- **Discovered scales**: ListView showing `name` and `type` for each BLEManager.discoveredScales
- **Scale log**: Monospace scrolling TextArea with Clear and Share Log buttons
- **Share Log Dialog**: Modal with email address (`decenzalogs@kulitorum.com`), copy-to-clipboard, and Share Log File button

### Web Skin Notes
BLE is managed by Streamline-Bridge. Replace with:
- `GET /api/v1/devices` for device listing
- `GET /api/v1/devices/scan` to trigger scanning
- `PUT /api/v1/scale/tare` for tare
- WebSocket for connection status updates

---

## 7. Settings: Preferences Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsPreferencesTab.qml` (599 lines)

### Purpose
Machine behavior preferences.

### Layout
3-column grid

### Column 1 - Sleep & Water
| Setting | Control | Range/Options |
|---------|---------|---------------|
| Auto-sleep timeout | ValueInput | 0-240 min, step 5. 0 = never |
| Refill Kit | StyledComboBox | Auto / Off / On |

### Column 2 - Power
| Setting | Control | Details |
|---------|---------|---------|
| Per-Screen Scale | StyledSwitch | Toggle per-screen DPI scaling |
| Battery Charging | StyledComboBox | Off / On / Night |
| Battery indicator | Visual | Animated battery icon showing current charge level, color changes by charging mode |

### Column 3 - Steam & Scale
| Setting | Control | Details |
|---------|---------|---------|
| Keep Steam Heater On | StyledSwitch | Keeps heater warm during idle |
| Auto-flush wand | ValueInput | 0-60 seconds, step 1. Time to flush after steaming. 0 = disabled |
| Virtual Scale | StyledSwitch | Enable flow-based weight estimation (no physical scale needed) |

### Web Skin Notes
- Auto-sleep: Map to `PUT /api/v1/machine/settings` with `autoSleep` field
- Battery/Steam: Same REST endpoint
- Virtual Scale: Streamline-Bridge handles this internally

---

## 8. Settings: Options Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsOptionsTab.qml` (820 lines)

### Purpose
Advanced machine and app options.

### Layout
3-column grid

### Column 1 - Mode
| Setting | Control | Details |
|---------|---------|---------|
| Offline/Simulation Mode | StyledSwitch | Enable offline mode for testing without machine |
| Shot Map | StyledComboBox + text | GPS-based location for shots. Options: GPS (auto) / Manual city entry. Shows current city. |

### Column 2 - Water & Machine
| Setting | Control | Details |
|---------|---------|---------|
| Water Level Display | StyledComboBox | ml / % display mode |
| Water Refill Threshold | ValueInput | 3-70mm, step 1. Warn when water drops below |
| Headless Machine | StyledSwitch | Single-press stop (no physical buttons on machine) |

### Column 3 - Scheduling
| Setting | Control | Details |
|---------|---------|---------|
| Auto-Wake Timer | Per-day schedule | 7 rows (Mon-Sun), each with enable toggle + time picker (HH:MM) |
| Stay Awake Duration | ValueInput | Minutes to keep machine awake after auto-wake |
| Stop-at-Weight Calibration | ValueInput + learn button | Learned lag compensation (grams). "Learn" button runs calibration shot |

### Web Skin Notes
- Most settings map to `GET/POST /api/v1/machine/settings`
- Auto-wake: May use `POST /api/v1/store/decenza-js/autoWake` for client-side persistence
- Shot map GPS: Not applicable for web skin; could use browser geolocation API

---

## 9. Settings: Screensaver Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsScreensaverTab.qml` (903 lines)

### Purpose
Configure screensaver type and type-specific options.

### Layout
- Left panel (250px): Video category selector (visible only in videos mode)
- Right panel (fill): Settings and status

### Screensaver Type Selector
`StyledComboBox` with 6 options:

| Index | Type | Display Name |
|-------|------|--------------|
| 0 | disabled | Turn Screen Off |
| 1 | videos | Videos & Images |
| 2 | pipes | 3D Pipes |
| 3 | flipclock | Flip Clock |
| 4 | attractor | Strange Attractors |
| 5 | shotmap | Shot Map |

When switching away from "videos" with cached content, shows **Clear Cache Dialog**:
- Shows cache size in MB
- Options: "Keep Videos" / "Delete Videos"
- Warning about slow re-download (one video every 3 minutes)

### Type-Specific Settings

**Videos mode:**
- Category list (ListView in left panel): Selectable categories from `ScreensaverManager.categories`
- Status row: Current category name, video count, cache usage (MB), download status, rate limit info
- Download progress bar (visible during download)
- Toggles: Cache Videos (on/off), Show Clock (on/off), Show Date (on/off, personal category only)
- Actions: Refresh Videos, Clear Personal Media (with confirmation dialog)

**Pipes mode:**
- Speed: ValueInput (0.1-2.0x, step 0.1)
- Camera rotation: ValueInput (10-300s, step 1)
- Show Clock: StyledSwitch

**Flip Clock mode:**
- 24-hour format: StyledSwitch
- 3D perspective: StyledSwitch

**Attractor mode:**
- Show Clock: StyledSwitch

**Shot Map mode:**
- Shape: StyledComboBox (Flat / Globe)
- Map texture: StyledComboBox (Dark / Bright / Satellite)
- Show Clock: StyledSwitch
- Show Profiles: StyledSwitch

### Clear Personal Media Dialog
- Confirmation with item count
- Indeterminate progress bar during deletion
- "Cancel" / "Delete All" (errorColor) buttons

### Web Skin Notes
Screensaver is a client-side feature. For web skin:
- Flip clock: Pure CSS/JS implementation
- Videos: Could stream from configured URL
- 3D modes (pipes, attractor, shotmap): WebGL / Three.js
- Detect idle via mouse/touch inactivity

---

## 10. Settings: Visualizer Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsVisualizerTab.qml` (438 lines)

### Purpose
Configure visualizer.coffee account and upload settings.

### Layout
2-column: Account (left, 350px) + Upload Settings (right)

### Account Column
| Element | Type | Details |
|---------|------|---------|
| Username/Email | TextField | `Settings.visualizerUsername`, email input hints, Enter jumps to password |
| Password | TextField | `Settings.visualizerPassword`, password echo mode |
| Test Connection | Button | Enabled when both fields filled. Shows result message (successColor/errorColor) |
| Sign up link | Text link | Opens `https://visualizer.coffee/users/sign_up` |

### Upload Settings Column
| Setting | Control | Details |
|---------|---------|---------|
| Auto-Upload Shots | StyledSwitch | `Settings.visualizerAutoUpload` |
| Minimum Duration | ValueInput | 0-30 sec, step 1. Skip aborted shots |
| Extended Metadata | StyledSwitch | Include bean/grinder/tasting notes with uploads |
| Edit After Shot | StyledSwitch | Open review page after each shot (visible only when extended metadata enabled) |
| Clear Notes on Start | StyledSwitch | Clear shot notes when starting new shot (visible only when extended metadata enabled) |
| Default Shot Rating | RatingInput (compact) | 0-100%, preset buttons in 2x2 grid. 0 = unrated (visible only when extended metadata enabled) |

### Web Skin Notes
Visualizer integration can be implemented as a direct HTTP client to the visualizer.coffee API, or proxied through Streamline-Bridge's store API for credential storage.

---

## 11. Settings: AI Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsAITab.qml` (503 lines)

### Purpose
Configure AI provider for shot analysis and dialing assistance.

### Layout
Full-width scrollable card with centered provider buttons, config fields, and conversation overlay.

### Provider Selection
Row of 5 provider buttons (90x56px each), centered:

| Provider | Description | Color when configured |
|----------|-------------|----------------------|
| OpenAI | GPT-4o | Green tint `rgba(0.2, 0.7, 0.3, 0.25)` |
| Anthropic | Claude | Green tint |
| Gemini | Flash | Green tint |
| OpenRouter | Multi | Green tint |
| Ollama | Local | Green tint |

Selected provider: `primaryColor` background, white text, bold name

### Recommendation Banner
Blue-tinted info box: "For shot analysis, we recommend Claude (Anthropic)..."

### Provider Configuration

**Cloud providers** (OpenAI, Anthropic, Gemini, OpenRouter):
- API Key: `StyledTextField` (password echo mode)
- Help text with provider-specific key URL

**OpenRouter additionally:**
- Model field: `StyledTextField` with placeholder `anthropic/claude-sonnet-4`
- Hint: "Enter model ID from openrouter.ai/models"

**Ollama:**
- Endpoint URL: `StyledTextField` with placeholder `http://localhost:11434`
- Model selector: `StyledComboBox` populated from `MainController.aiManager.ollamaModels`
- Refresh button to re-fetch model list
- Install hint: "ollama.ai -> run: ollama pull llama3.2"

### Test Connection & Cost
- Test Connection button (enabled when provider is configured)
- Cost estimates (shown when no test result):
  - OpenAI: ~$0.01/shot
  - Anthropic: ~$0.003/shot
  - Gemini: ~$0.002/shot
  - OpenRouter: "Varies by model"
  - Ollama: "Free"
- Continue Chat button (visible when configured, enabled if saved conversation exists)

### Conversation Overlay
Full-screen overlay with:
- Title: "AI Conversation"
- Clear button (destructive)
- Close button (X)
- Scrollable markdown conversation text
- "Thinking..." indicator with BusyIndicator
- Input: StyledTextField + Send button
- Auto-scrolls to bottom on new responses
- Saves conversation to storage on close

### Web Skin Notes
AI integration could either:
1. Use the AI provider directly from the browser (API key stored in client)
2. Proxy through Streamline-Bridge's store API for persistence
3. Be omitted for Phase 1 (advanced feature)

---

## 12. Settings: Accessibility Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsAccessibilityTab.qml` (310 lines)

### Purpose
Screen reader support and audio feedback for visually impaired users.

### Layout
Vertical stack of two cards

### Card 1 - Main Accessibility
| Setting | Control | Details |
|---------|---------|---------|
| Enable Accessibility | StyledSwitch | `AccessibilityManager.enabled` |
| Voice Announcements | StyledSwitch | `AccessibilityManager.ttsEnabled`. Announces enable/disable message |
| Frame Tick Sound | StyledSwitch | `AccessibilityManager.tickEnabled`. Plays tick on extraction frame changes |
| Tick Sound | ValueInput | 1-4 (Sound 1-4), step 1 |
| Tick Volume | ValueInput | 10-100%, step 10 |

All dependent settings dim (opacity 0.5) when accessibility is disabled.

### Card 2 - Extraction Announcements
| Setting | Control | Details |
|---------|---------|---------|
| Enable During Extraction | StyledSwitch | `AccessibilityManager.extractionAnnouncementsEnabled` |
| Mode | StyledComboBox | "Time + Milestones" / "Timed Updates" / "Weight Milestones" |
| Update Interval | ValueInput | 5-30 seconds, step 5. Visible when mode includes timed |

### Web Skin Notes
- TTS: Use Web Speech API (`speechSynthesis`)
- Tick sounds: Use Web Audio API
- Ensure proper ARIA attributes on all components

---

## 13. Settings: Themes Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsThemesTab.qml` (375 lines)

### Purpose
Visual theme customization with color picker and presets.

### Layout
2-column: Color list (left, 40%) + Color editor (right)

### Color Definitions
3 categories of editable colors:

**Core UI:**
| Name | Display |
|------|---------|
| backgroundColor | Background |
| surfaceColor | Surface |
| primaryColor | Primary |
| secondaryColor | Secondary |
| textColor | Text |
| textSecondaryColor | Text Secondary |
| accentColor | Accent |
| borderColor | Border |

**Status:**
| Name | Display |
|------|---------|
| successColor | Success |
| warningColor | Warning |
| errorColor | Error |

**Chart:**
| Name | Display |
|------|---------|
| pressureColor | Pressure |
| pressureGoalColor | Pressure Goal |
| flowColor | Flow |
| flowGoalColor | Flow Goal |
| temperatureColor | Temperature |
| temperatureGoalColor | Temp Goal |
| weightColor | Weight |

### Left Panel - Color List
- Theme name display: "Theme: [activeThemeName]"
- Scrollable list of `ColorSwatch` components grouped by category
- Each swatch: color preview rect + display name, highlighted when selected
- Reset button (destructive): `Settings.resetThemeToDefault()`

### Right Panel - Color Editor
- Current color name display
- Hex input: `StyledTextField` (monospace, `#RRGGBB` format, validates on edit)
- Color preview swatch (32x32)
- `ColorEditor` component (140px height): Hue/saturation/lightness visual picker
- Bi-directional sync between hex input and color editor (with feedback loop guard)

### Preset Themes
- Horizontal scrolling row of theme buttons
- Each: colored rectangle with theme name, white border when active
- Built-in themes: no delete button
- User themes: small "x" delete button on right side
- "+ Save" button at end to save current colors as named theme
- Active theme indicated by white 2px border

### Random Theme Button
- Full-width rainbow gradient button
- Generates palette from random hue (0-360), saturation (65-85%), lightness (50-60%)
- Calls `Settings.generatePalette()` and applies as "Custom" theme

### Web Skin Notes
Map directly to CSS custom properties. Theme persistence via `POST /api/v1/store/decenza-js/theme`.

---

## 14. Settings: Layout Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsLayoutTab.qml` (378 lines)

### Purpose
Customize the home screen (idle page) widget layout.

### Layout
2-column: Zone editors (left, scrollable) + Library panel (right, 260px)

### Zone System
8 customizable zones:

| Zone | Label | Features |
|------|-------|----------|
| statusBar | Status Bar (All Pages) | Visible on all pages |
| topLeft | Top Bar (Left) | Paired with topRight |
| topRight | Top Bar (Right) | Paired with topLeft |
| centerStatus | Center - Top | Position controls (Y offset, scale) |
| centerTop | Center - Action Buttons | Position controls |
| centerMiddle | Center - Info | Position controls |
| bottomLeft | Bottom Bar (Left) | Paired with bottomRight |
| bottomRight | Bottom Bar (Right) | Paired with bottomLeft |

### Zone Editor Features
Each `LayoutEditorZone` component:
- Zone label text
- Item list showing current widgets in the zone
- Per-item actions: tap to select, remove (x), move left/right, long-press custom items to edit
- Add button (+) to add widget from library
- Center zones additionally: up/down Y offset (+/-5), scale up/down (+/-0.05)

### Item Operations
- `onItemTapped`: Select/deselect for move operations
- `onItemRemoved`: Remove widget from zone
- `onMoveLeft`/`onMoveRight`: Reorder within zone
- `onAddItemRequested`: Add new widget of given type
- `onEditCustomRequested`: Open editor for custom/screensaver items

### Library Panel
- `LibraryPanel` component (260px width)
- Shows available widget types to add to zones
- Receives `selectedItemId`, `selectedFromZone`, `selectedZoneName` for context

### Safety
- `ensureSettingsAccessible()`: Called when leaving the tab. Checks all zones for a "settings" widget or custom widget with `navigate:settings` action. If none found, auto-adds settings widget to bottomRight zone.

### Custom Editors
- `CustomEditorPopup`: For editing custom widget properties (emoji, label, action, etc.)
- `ScreensaverEditorPopup`: For editing screensaver widget properties

### Web Skin Notes
Layout system maps well to a web drag-and-drop interface. Store layout configuration via `POST /api/v1/store/decenza-js/layout`.

---

## 15. Settings: Language Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsLanguageTab.qml` (528 lines)

### Purpose
Language selection, translation progress tracking, and community translation management.

### Layout
2-column: Language list (left, max 300px) + Translation info (right)

### Language List
- `ListView` bound to `TranslationManager.availableLanguages`
- Each delegate (44px height):
  - Display name + native name (if different): e.g., "German (Deutsch)"
  - Color coding: Green (successColor) for local, Blue (#2196F3) for remote/community
  - Translation percentage badge: e.g., "87%" (hidden for English, hidden for remote languages)
  - Highlighted background when selected
- Bottom buttons:
  - "Add...": Navigate to `AddLanguagePage.qml`
  - "Delete": Delete selected language (disabled for English). Shows confirmation dialog
  - "Update": Download latest community translations for selected language

### Translation Progress (right column)
- Language name + progress: "N / total" with ProgressBar
- Completion text: "Translation complete!" or "X strings need translation"
- English: Shows "English is the base language. You can customize the default text below."
- "Browse & Translate Strings..." button: Navigate to `StringBrowserPage.qml`
- "Submit to Community" button: Visible only when developer mode enabled and language is not English

### Scanning Overlay
Semi-transparent overlay with ProgressBar during `TranslationManager.scanning`

### Dialogs
- **Delete Confirmation**: Warning-bordered popup with "Delete Language?" title, language name, and "Cannot be undone" warning
- **Submission Result**: Success (green border) or Error (warning border) popup after translation upload
- **Retry Status**: Auto-shown popup when server is busy and retrying

### Web Skin Notes
The web skin will use its own i18n system (vue-i18n or similar). Translation management is not applicable for a web skin served from Streamline-Bridge.

---

## 16. Settings: Shot History Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsShotHistoryTab.qml` (638 lines)

### Purpose
Shot history management, import from DE1 app, and remote access (HTTP server).

### Layout
2-column: Shot history & import (left, 300px) + Remote access (right)

### Left Column - Shot History & Import
- **Navigate button**: "Shot History ->" opens ShotHistoryPage
- **Info text**: "All shots are stored locally on your device"
- **Stats**: Total shots count (primaryColor, bold)
- **Show on Idle screen**: StyledSwitch for `Settings.showHistoryButton`
- **Auto-Favorites**: StyledSwitch for `Settings.autoFavoritesEnabled` with description

**Import from DE1 App:**
- Overwrite existing: StyledSwitch
- Auto-detect DE1 app path: Shows green "Found: [path]" or gray "DE1 app not found"
- "Import from DE1 App" button (visible when path detected)
- ZIP import: FileDialog for .zip archives
- Folder import: FolderDialog for .shot file directories
- Progress bar during import with cancel button
- Result dialog: Shows imported/skipped/failed counts

### Right Column - Remote Access (HTTP Server)
- **Enable Server**: StyledSwitch for `Settings.shotServerEnabled`
- **Port**: TextField (digits only, 1024-65535), disabled while server is running
- **Server status**: Green/red dot + "Server Running" / "Server Stopped"
- **URL display**: Server URL in primaryColor bold, with Copy button (2-second "Copied" feedback)
- **Help text**: "Open this URL in any browser on your network"

### Web Skin Notes
- Shot history: Use `GET /api/v1/shots/ids` and `GET /api/v1/shots/{id}` from Streamline-Bridge
- Import: Not applicable for web skin (server-side concern)
- Remote access: Not applicable (the web skin IS the remote access)

---

## 17. Settings: Data Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsDataTab.qml` (676 lines)

### Purpose
Device-to-device data migration (import settings, profiles, shots, media from another Decenza device over WiFi).

### Layout
2-column: Share data / your data (left, 280px) + Import from another device (right)

### Left Column - Share Data
- **Server status**: Info text showing if HTTP server is running or needs to be enabled
- **Data summary grid**: Shots count, Profiles count

### Right Column - Import
**Device Discovery:**
- "Search for Devices" button with BusyIndicator during search
- Single device: Clickable card showing device name, platform, app version, IP address
- Multiple devices: ComboBox dropdown with Connect button
- No devices: Hint text "Make sure the other device has Remote Access enabled"
- Manual Connection: IP:port text field with Connect button (auto-prepends `http://` if missing)

**Connected State (manifest display):**
- Green dot + "Connected to: [deviceName]" with Disconnect button
- Data summary: "Profiles: N, Shots: N, Media: N, Settings: Yes/No"

**Import Operations:**
- Import All button (primary)
- Individual buttons: Import Settings, Import Profiles (count), Import Shots (count), Import Media (count)
- Cancel button during import
- Progress bar with percentage and current operation text

**Import Complete Popup:**
Checkmark icon + "Import Complete" with counts for settings, profiles, shots, media imported.

### Web Skin Notes
Data migration between devices is not applicable for the web skin. Shot and profile data is managed by Streamline-Bridge.

---

## 18. Settings: Home Automation (MQTT) Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsHomeAutomationTab.qml` (419 lines)

### Purpose
MQTT broker configuration for home automation integration.

### Layout
2-column: MQTT configuration (left, 300px) + Options and info (right)

### Left Column - MQTT Configuration
| Setting | Control | Details |
|---------|---------|---------|
| Enable MQTT | StyledSwitch | `Settings.mqttEnabled` |
| Broker Host | StyledTextField | `Settings.mqttBrokerHost` |
| Port | StyledTextField | Digits only, 1-65535. `Settings.mqttBrokerPort` |
| Username | StyledTextField | Optional. `Settings.mqttUsername` |
| Password | StyledTextField | Password echo mode. `Settings.mqttPassword` |
| Base Topic | StyledTextField | `Settings.mqttBaseTopic` |

- **Connection status**: Colored dot (green=connected) + status text
- **Connect/Disconnect buttons**

### Right Column - Options
**Publishing Options:**
| Setting | Control | Details |
|---------|---------|---------|
| Publish Interval | ComboBox | 100ms / 500ms / 1s / 5s |
| Retain Messages | StyledSwitch | Broker retains last value for new subscribers |

**Home Assistant:**
| Setting | Control | Details |
|---------|---------|---------|
| Auto-Discovery | StyledSwitch | Automatically creates sensors/switches in HA |
| Publish Discovery Now | Button | Manual HA discovery publish (enabled when connected) |

**REST API:**
- Info text pointing to Shot History tab for enabling
- When server running: Shows available endpoints (GET /api/state, GET /api/telemetry, POST /api/command) and server URL

### Web Skin Notes
MQTT could be implemented via WebSocket-to-MQTT bridge, but is likely out of scope for the initial web skin. The REST API section is informational only.

---

## 19. Settings: Update Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsUpdateTab.qml` (525 lines)

### Purpose
Software update management.

### Layout
2-column: Current version (left, 280px) + Update status (right)

### Left Column - Version Info
- App name: "Decenza" (14sp)
- Version: "v[AppVersion]" (accentColor, 22sp, bold)
- Build number: "Build [AppVersionCode]" (12sp, textSecondaryColor)
- Platform: Platform name or "SIMULATION MODE" (primaryColor, bold)
- **Easter egg**: Tap version card 7 times within 2 seconds to toggle developer translation upload mode

**Settings:**
| Setting | Control | Details |
|---------|---------|---------|
| Auto-check for updates | StyledSwitch | Check every hour |
| Include beta versions | StyledSwitch | Get early access to new features |

### Right Column - Update Status
- **Status indicator**: Green dot ("Up to date") or primary dot ("Update available: vX.Y.Z (Beta)")
- **Checking state**: BusyIndicator + "Checking for updates..."
- **Download progress**: Progress bar + percentage
- **Error message**: errorColor text

**Action buttons:**
- "Check Now" (enabled when not checking)
- "Download & Install" (visible when update available and can download)
- "View on GitHub" (visible when update available but can't auto-download, e.g., desktop)
- "What's New?" (visible when release notes available, opens popup)

**Release Notes Popup:**
- Modal with header showing version
- Scrollable TextArea with release notes
- Scroll-down indicator arrow (visible when more content below, bounces on click)
- Close button

### Web Skin Notes
Not applicable for web skin. The skin is updated by updating the deployment on Streamline-Bridge.

---

## 20. Settings: About Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsAboutTab.qml` (172 lines)

### Purpose
App information and credits.

### Content (scrollable)
1. **Title**: "Decenza" (32sp, primaryColor, bold, centered)
2. **Version**: "Version [version]" (bodyFont, centered)
3. Divider
4. **Story**: "Built by Michael Holm (Kulitorum) during Christmas 2025..."
5. Divider
6. **Donation section**:
   - Text: "If you find this app useful, donations are welcome but never expected."
   - PayPal button (blue #0070BA, 56px height): Opens PayPal donate link
   - Email: `paypal@kulitorum.com`
   - QR code image: `qrc:/qrcode.png` (150x150)
7. Divider
8. **Credits**: "Thanks to the Decent community and the de1app developers for inspiration."

### Web Skin Notes
Simple static page, easily implemented.

---

## 21. Settings: Debug Tab

**Source**: `vendor/decenza/qml/pages/settings/SettingsDebugTab.qml` (574 lines)

### Purpose
Developer tools for debugging, simulation, and data management.

### Layout
2-column layout

### Left Column
**Window Resolution** (Windows only):
- Resolution presets ComboBox: Decent Tablet (1200x800), various tablets, desktop HD/FHD
- Shows current window size

**Simulation Toggles:**
- Headless machine: StyledSwitch

**Profile Converter:**
- Convert DE1 app TCL profiles to native JSON
- Auto-detect DE1 app profiles path
- Overwrite toggle
- Progress bar during conversion
- Result dialog with success/skip/error counts

### Right Column
**Shot Database:**
- Current shots count
- "Merge..." button: Import and merge SQLite database
- "Replace..." button: Import and replace entire database
- FileDialog for .db files
- Result popup showing success/error

**Translation Developer Tools:**
- Enable translation upload toggle
- "Translate & Upload All" button: Batch process all languages (with cancel support)
- Progress indicators for translating/uploading states

### Web Skin Notes
Debug features are development-only. Window resolution is irrelevant. Profile conversion could be useful if Streamline-Bridge supports TCL profiles. Shot database management would use REST API instead.

---

## 22. Screensaver Page

**Source**: `vendor/decenza/qml/pages/ScreensaverPage.qml` (489 lines)

### Purpose
Full-screen screensaver display with 6 modes.

### Screensaver Modes

| Mode | Component | Description |
|------|-----------|-------------|
| videos | MediaPlayer + Image | Video slideshow with cross-fade images, credits bar |
| pipes | Quick3D scene | 3D animated pipes |
| flipclock | FlipClockScreensaver | Animated flip clock display |
| attractor | StrangeAttractorScreensaver | Mathematical strange attractor visualization |
| shotmap | ShotMapScreensaver | 3D globe/flat map showing shot locations |
| disabled | Rectangle | Black screen |

### Common Features
- **Clock display**: Configurable per mode. Shows time (and optionally date) overlay
- **"Touch to wake" hint**: Fades in, then fades out after a few seconds
- **Wake behavior**: On touch/click:
  1. Wake DE1 machine
  2. Wake scale
  3. Navigate to idle page

### Videos Mode Details
- `MediaPlayer` + `VideoOutput` for video playback
- Cross-fade `Image` for still images
- Credits bar at bottom
- Download progress indicator
- Fallback gradient animation when no media available

### Auto-Wake
- Wakes automatically on DE1 state change (e.g., machine turns on)
- Navigates to appropriate page based on new state

### Web Skin Notes
- Flip clock: CSS animations
- Videos: HTML5 video element
- 3D modes: Three.js / WebGL
- Disabled: CSS `background: black`
- Wake: Listen for touch/mouse events + WebSocket state changes

---

## 23. Descaling Page

**Source**: `vendor/decenza/qml/pages/DescalingPage.qml` (709 lines)

### Purpose
3-phase guided descaling wizard.

### Phase 1 - Preparation
- **Warning banner**: Yellow/warning, "Use citric acid only" message
- **Solution recipe**: "1540 ml water + 80g citric acid"
- **Steam heater control**: Toggle with temperature display (turns off steam heater for descaling)
- **5 setup steps** (numbered checklist):
  1. Remove shower screen
  2. Remove basket
  3. Fill water tank with solution
  4. Place container under group head
  5. Turn off steam heater
- **Start button**: "Start Descaling" (enabled when all conditions met)

### Phase 2 - In Progress
- **Progress bar**: Maps substates 8-12 to 5 visual steps
- **Timer**: Shows elapsed time
- **Warning**: "Do not stop the descaling process" (errorColor)
- **Emergency stop**: Visible only on headless machines (`DE1Device.isHeadless`)

### Phase 3 - Rinse Instructions
3 rinse steps:
1. Empty tank and refill with clean water
2. Rinse group head (flush 4+ liters of clean water)
3. Rinse steam line (5 cycles of ~100 seconds each)
- **Done button**: Returns to idle page

### Cleanup
On page destruction:
- Restores `steamDisabled = false`
- Re-uploads the current profile to machine

### Web Skin Notes
- Map to `PUT /api/v1/machine/state` with `descale` state
- Monitor progress via WebSocket snapshot (substates)
- Instructions are static content

---

## 24. Visualizer Browser Page

**Source**: `vendor/decenza/qml/pages/VisualizerBrowserPage.qml` (449 lines)

### Purpose
Import profiles from visualizer.coffee using share codes.

### Features
- **Share code input**: 4-character uppercase text field (`inputMask: ">AAAA"`)
- **Import Shared button**: Navigates to `VisualizerMultiImportPage` with the share code
- **Instructions**: How to find share codes on visualizer.coffee

### Duplicate Handling Dialog
When imported profile already exists:
- **Overwrite**: Replace existing profile
- **Save as New**: Save with rename dialog
- **Cancel**: Abort import

### Web Skin Notes
Implement via direct HTTP to visualizer.coffee API or through Streamline-Bridge's profile management.

---

## 25. Visualizer Multi-Import Page

**Source**: `vendor/decenza/qml/pages/VisualizerMultiImportPage.qml` (906 lines)

### Purpose
Batch import profiles from visualizer.coffee shared shots.

### Layout
Split: Profile list (45%) + Details panel (55%)

### Profile List
- Each profile shows:
  - Status icon with meaning:
    - Star: Importable (new profile)
    - Checkmark: Already imported (identical)
    - Red X: Invalid / parse error
    - "D" badge: Built-in/default profile
    - "V" badge: Downloaded from visualizer
  - Profile name
  - Frame count
  - Author (if available)

### Details Panel
- **Empty state**: Icon legend explaining all status icons
- **Selected profile**: Full profile details including frame list, author, source share code
- **Import button**: Import selected profile
- **Rename dialog**: For built-in profiles that have different frames

### Add by Code
- Inline `StyledTextField` for entering additional share codes
- "Add" button to fetch and add to the list

### Web Skin Notes
Profile import would use Streamline-Bridge's profile API: `POST /api/v1/profiles`.

---

## 26. Bean Info Page

**Source**: `vendor/decenza/qml/pages/BeanInfoPage.qml` (1214 lines)

### Purpose
Bean preset management and current session bean configuration.

### Layout
- Top: Bean presets bar (draggable pills)
- Main: 3-column DYE field grid (same as PostShotReviewPage)

### Bean Presets
- **Pill bar**: Horizontally scrollable row of pill-shaped buttons
- Each pill: preset name, colored background, removable
- **Drag to reorder**: Long-press and drag to change order
- **Add preset**: "+" button opens name input dialog
- **Edit preset**: Tap to load, long-press to rename
- **Delete preset**: Swipe or context action
- **Guest bean dialog**: For temporary bean settings without saving as preset
- Auto-saves current field values back to the selected preset when switching

### Modes
- **Normal mode** (`editShotId === 0`): Setting beans for the current session. Values sync to `Settings` for next shot
- **Edit mode** (`editShotId > 0`): Editing an existing shot's bean data

### Fields
Same 3-column layout as PostShotReviewPage (roaster, coffee, roast date, roast level, grinder, setting, beverage type, barista, dose, output, TDS, EY, rating, notes).

### Web Skin Notes
Bean presets stored via `POST /api/v1/store/decenza-js/beanPresets`. Field values via workflow API.

---

## 27. AI Settings Page

**Source**: `vendor/decenza/qml/pages/AISettingsPage.qml` (341 lines)

### Purpose
Standalone AI provider configuration page (also accessible from Settings AI tab).

### Features
Same as Settings AI Tab (#11). This is an alternate entry point for AI configuration, typically navigated to from shot pages when AI is not configured.

### Key Elements
- Provider selection buttons (OpenAI, Anthropic, Gemini, Ollama)
- API key input (password field)
- Ollama endpoint + model selector with refresh
- Test Connection button
- Cost estimates per provider
- Back navigation

---

## 28. Dialing Assistant Page

**Source**: `vendor/decenza/qml/pages/DialingAssistantPage.qml` (332 lines)

### Purpose
Display AI-generated dialing recommendations with follow-up conversation.

### States
1. **Loading**: BusyIndicator centered with "Analyzing your shot..." text
2. **Error**: Error message with "Go Back" button
3. **Success**: Scrollable markdown recommendation

### Layout (Success State)
- Scrollable `Flickable` with markdown-rendered `TextArea` (readOnly)
- Follow-up conversation: `StyledTextField` + "Ask" button
- Bottom buttons: "Copy to Clipboard" + "Done"
- Provider attribution footer: Shows which AI provider generated the analysis

### Markdown Rendering
Uses `textFormat: Text.MarkdownText` for rich text rendering of AI responses.

### Web Skin Notes
Can use browser's native markdown rendering library. AI requests would be handled client-side or proxied.

---

## 29. Community Browser Page

**Source**: `vendor/decenza/qml/pages/CommunityBrowserPage.qml` (274 lines)

### Purpose
Full-page browser for community-shared layout widgets (items, zones, layouts) with filtering, sorting, and download.

### Layout
- Top: Filter bar with 4 dropdowns + sort selector
- Main: GridView of library entries
- Bottom: Total count + "Add to Library" action button

### Filter Bar

| Filter | Type | Options |
|--------|------|---------|
| Type | ComboBox | All, Items, Zones, Layouts |
| Variable | ComboBox | All, %TEMP%, %PRESSURE%, %FLOW%, %WEIGHT%, %WATER%, %TIME%, %DATE%, %PROFILE%, %STATE%, %TARGET_WEIGHT%, %TARGET_TEMP%, %RATIO%, %DOSE%, %CONNECTED%, %GRIND% |
| Action | ComboBox | All, navigate:settings, navigate:history, navigate:profiles, navigate:profileEditor, navigate:recipes, navigate:descaling, navigate:ai, navigate:visualizer, navigate:autofavorites, navigate:steam, navigate:hotwater, navigate:flush, navigate:beaninfo, command:startEspresso, command:startSteam, command:startHotWater, command:startFlush, command:idle, command:tare, command:sleep, command:quit, togglePreset:espresso, togglePreset:steam, togglePreset:hotwater, togglePreset:flush, togglePreset:beans |
| Sort | ComboBox | Newest, Most Popular |

- Filters call `LibrarySharing.browseCommunity(type, variable, action, "", sort, page)` on change
- Reset to page 1 on filter change

### Grid View
- Cell size: `Theme.scaled(300) x Theme.scaled(200)`
- Delegate: `LibraryItemCard` component (from `components/library/`)
- Click to select (toggles `WidgetLibrary.selectedEntryId`)
- Double-click to download entry directly
- Infinite scroll: `onAtYEndChanged` triggers `loadMore()` for next page (20 per page)

### Download Behavior
- On double-click or "Add to Library" button press: `LibrarySharing.downloadEntry(serverId)`
- On success: Shows toast message "Downloaded!" (3-second duration, `Theme.successColor`)
- On failure: Shows toast with error message (`Theme.errorColor`)
- On already-exists: Shows toast "Already in library" (`Theme.warningColor`)

### Bottom Bar
- Total results count: `LibrarySharing.totalCommunityResults + " entries"` (textSecondaryColor)
- "Add to Library" button: Downloads selected entry (enabled when entry is selected)
- Loading indicator: Visible when `LibrarySharing.browsing === true`

### Web Skin Notes
This feature requires the community sharing server at `api.decenza.coffee`. For the web skin, implement as a browsable grid with filters and download-to-local-library capability. Authentication is anonymous via device ID header (`X-Device-Id`).

---

## 30. Auto-Favorites Page

**Source**: `vendor/decenza/qml/pages/AutoFavoritesPage.qml` (425 lines)

### Purpose
Quick-load recent bean+profile+grinder combinations from shot history, grouped by configurable criteria.

### Layout
- Top: Title bar with settings popup trigger
- Main: Scrollable ListView of auto-favorite entries
- Each entry: bean info, profile, grinder, recipe summary, load button

### Data Source
- `MainController.shotHistory.getAutoFavorites(groupBy, maxItems)`
- Parameters read from: `Settings.autoFavoritesGroupBy`, `Settings.autoFavoritesMaxItems`
- Auto-refreshes when `shotHistory.onShotSaved` signal fires

### Entry Delegate (100px height)
| Element | Position | Style | Data |
|---------|----------|-------|------|
| Bean brand + type | Top left | subtitleFont | `modelData.beanBrand + " " + modelData.beanType` |
| Profile name | Below beans | primaryColor, labelFont | `modelData.profileName` with `ProfileInfoButton` |
| Grinder info | Below profile | captionFont, visible based on groupBy | `modelData.grinderModel + " @ " + modelData.grinderSetting` |
| Recipe summary | Below grinder | captionFont, textSecondaryColor | `dose + "g -> " + yield + "g, " + shotCount + " shots, " + avgEnjoyment + "% avg"` |
| Load button | Right side | primaryColor bg, 70x50px | Loads the shot recipe into current session |

### Load Action
1. `MainController.loadShotWithMetadata(modelData.shotId)` -- loads profile, DYE metadata, dose/yield
2. `pageStack.pop()` -- returns to idle page

### Settings Popup
Accessed via gear icon in title bar:

| Setting | Control | Options |
|---------|---------|---------|
| Group by | ComboBox | Bean only / Profile only / Bean+Profile / Bean+Profile+Grinder |
| Max items | Slider/ComboBox | 5-50, step 5 |

Settings persist to `Settings.autoFavoritesGroupBy` and `Settings.autoFavoritesMaxItems`.

### Web Skin Notes
- Data: Use `GET /api/v1/shots/ids` to fetch shot history, then compute groupings client-side
- Load action: Use `PUT /api/v1/workflow` to apply the saved recipe
- Settings: Persist via `POST /api/v1/store/decenza-js/autoFavoritesConfig`

---

## 31. Key Shared Components

### HistoryShotGraph
**Source**: `vendor/decenza/qml/components/HistoryShotGraph.qml` (235 lines)

QtCharts ChartView with:
- **4 line series**: Pressure, Flow (shared left Y axis 0-12), Temperature (hidden right Y 80-100 degrees C), Weight (right Y auto-scaled)
- **Phase markers**: Up to 10 vertical dotted white lines with rotated labels showing transition reason: [W] weight, [P] pressure, [F] flow, [T] temperature
- **Axes**: Time X axis with auto-max, left Y axis for pressure/flow (0-12 bar / mL/s)
- **Background**: transparent with `Qt.darker(Theme.surfaceColor, 1.3)` plot area

**Web equivalent**: uPlot time-series chart with multi-axis support and vertical annotations.

### ComparisonGraph
**Source**: `vendor/decenza/qml/components/ComparisonGraph.qml` (210 lines)

QtCharts ChartView with:
- 9 LineSeries: 3 shots x 3 curve types (pressure solid, flow dashed, weight dotted)
- 3 color sets cycling: Green (#4CAF50/#81C784/#A5D6A7), Blue (#2196F3/#64B5F6/#90CAF9), Orange (#FF9800/#FFB74D/#FFCC80)
- Weight scaled by /5 for display alignment
- Time axis: 0 to max(15, maxTime + 0.5)

**Web equivalent**: uPlot with multiple series, custom line styles.

### RatingInput
**Source**: `vendor/decenza/qml/components/RatingInput.qml` (222 lines)

- 0-100% rating slider with gradient track
- Color interpolation: 0%=red `#ff4444`, 50%=yellow `#ffaa00`, 100%=green `#00cc6d`
- Preset buttons: 25% / 50% / 75% / 100%
- Compact mode: 2x2 grid layout for preset buttons
- Keyboard: Arrow keys (+/-1), PageUp/PageDown (+/-25)

**Web equivalent**: `<input type="range">` with CSS gradient background and preset buttons.

### SuggestionField
Auto-complete text field used in PostShotReviewPage and BeanInfoPage:
- Shows dropdown of matching suggestions from previous values
- Supports cascading: e.g., bean suggestions filtered by selected roaster
- Touch-friendly suggestion pills

### ValueInput
Numeric input with increment/decrement:
- `-` / `+` buttons on sides
- Configurable `from`, `to`, `stepSize`, `decimals`
- Optional `suffix` (e.g., "g", "s", "%")
- Optional `displayText` override

### SwipeableArea
Touch gesture handler:
- Detects horizontal swipe (left/right)
- Emits `swipedLeft` / `swipedRight` signals
- Used for shot navigation in detail/comparison pages

---

## 32. Styled Form Components

These components provide consistent styling across all form controls in the app. The web skin should implement equivalent CSS-based form components.

### StyledComboBox
**Source**: `vendor/decenza/qml/components/StyledComboBox.qml` (107 lines)

- Height: `Theme.scaled(36)`
- Auto-sizing popup width: Uses `TextMetrics` to measure widest option, sets popup min-width accordingly
- Background: `rgba(255,255,255,0.1)`, border-radius 6px
- Focus state: `primaryColor` border
- Indicator: "▼" character in `textSecondaryColor`
- Popup: max height `Theme.scaled(200)`, `surfaceColor` background, `borderColor` border, 1px
- Delegate: highlight with `primaryColor` background on hover/selection
- Font: inherited from parent (typically bodyFont)

**Web equivalent**: Custom `<select>` or dropdown component with matching dark-theme styles.

### StyledSwitch
**Source**: `vendor/decenza/qml/components/StyledSwitch.qml` (56 lines)

- Track: 48x28px container, inner track 44x24px
- Thumb: 18x18px circle
- Checked: track `primaryColor`, thumb `white`
- Unchecked: track `backgroundColor`, thumb `textSecondaryColor`
- Animation: 100ms slide (`Easing.OutQuad`)
- Accessibility: `Accessible.role: CheckBox`, announces "On" / "Off"

**Web equivalent**: CSS-only toggle switch with `<input type="checkbox">` and custom styling.

### StyledTabButton
**Source**: `vendor/decenza/qml/components/StyledTabButton.qml` (69 lines)

- Classic tab appearance: active tab has rounded top corners merging with content area
- Font: 13sp, bold when checked
- Active state: `backgroundColor` fill with `borderColor` border, bottom corners hidden (overlap with content area)
- Inactive state: transparent background, `textSecondaryColor` text
- `FocusIndicator` for keyboard navigation

**Web equivalent**: CSS tabs with `border-bottom: none` on active tab, matching rounded top corners.

### StyledTextField
**Source**: `vendor/decenza/qml/components/StyledTextField.qml` (54 lines)

- Disables Material Design floating placeholder animation
- Custom placeholder: simple `Text` that disappears on focus or when text is present (no animation)
- Font: 18sp
- Padding: 12px all sides
- Background: `backgroundColor`, border-radius 4px
- Focus state: `primaryColor` border
- Enter/Return key: dismisses keyboard (`Qt.inputMethod.hide()`)

**Web equivalent**: Standard `<input type="text">` with dark theme CSS, no floating labels.

### StyledIconButton
**Source**: `vendor/decenza/qml/components/StyledIconButton.qml` (112 lines)

- `RoundButton` base, 40x40px
- Supports text/emoji content OR image icon (`iconSource` property)
- Active/inactive states with configurable colors (`activeColor`, `inactiveColor`)
- Background states:
  - Default: transparent
  - Pressed: `rgba(1,1,1,0.15)`
  - Hovered: `rgba(1,1,1,0.08)`
- Uses `AccessibleTapHandler` for screen reader interaction
- Required `accessibleName` property for accessibility

**Web equivalent**: `<button>` with SVG/emoji icon, transparent background, hover/active states.

### SuggestionField
**Source**: `vendor/decenza/qml/components/SuggestionField.qml` (293 lines)

- Auto-complete text input with filtered suggestions dropdown
- When focused (not typing): shows all suggestions
- When typing: filters suggestions by text match
- Right-side buttons:
  - Clear (X in circle, 36px): clears text and emits `textEdited`
  - Dropdown arrow: toggles suggestion popup open/closed
- Popup: max height 250px, `surfaceColor` background, border-radius 4px
- Delegate height: 44px per suggestion row
- Empty state: "No matches - press Enter to add" message
- Keyboard navigation: Down/Up arrows for suggestion selection, Enter to accept, Escape to close
- 200ms close delay: allows clicking popup items before popup closes on blur
- Flags: `isActivelyTyping` (distinguishes focus vs typing), `justSelected` (prevents popup reopening after selection)
- Signals: `textEdited(text)`, `inputFocused()`
- Cascading support: parent provides filtered `suggestions` array (e.g., beans filtered by selected roaster)

**Web equivalent**: `<input>` with `<datalist>` or custom dropdown, debounced filtering, keyboard navigation.

---

## 33. Color Components (Theme Customization)

### ColorEditor
**Source**: `vendor/decenza/qml/components/ColorEditor.qml` (203 lines)

Full HSL color editing widget used in the Themes settings tab.

- **Layout**: Row with ColorWheel (130x130px) on left, sliders on right
- **Properties**: `hue` (0-360), `saturation` (0-100), `lightness` (0-100), `color` (computed from HSL)
- **Method**: `setColor(c)` -- sets HSL values from an external color (extracts hslHue, hslSaturation, hslLightness)
- **Optional**: `showBrightnessSlider` property to include screen brightness control

**Sliders** (3 horizontal gradient tracks):

| Slider | Gradient | Range | Thumb |
|--------|----------|-------|-------|
| Saturation | Gray to full saturation at current hue/lightness | 0-100% | 28px circle showing current color |
| Lightness | Black to white through current hue/saturation | 0-100% | 28px circle showing current color |
| Brightness | Black to white (linear) | 0-100% | 28px circle |

Each slider:
- Track: `Theme.scaled(24)` height, `Theme.scaled(12)` border-radius, gradient fill, `borderColor` border
- Thumb: 28px circle with white 2px border, positioned by value
- Touch: Drag anywhere on track to set value, extended hit area (-8px margins)
- Accessibility: `Accessible.role: Slider` with percentage announcements

**Web equivalent**: Canvas/SVG hue wheel + `<input type="range">` sliders with gradient backgrounds.

### ColorSwatch
**Source**: `vendor/decenza/qml/components/ColorSwatch.qml` (58 lines)

Individual color entry in the theme color list.

- Height: `Theme.scaled(44)`
- Layout: Row with color preview rect (32x32, 6px radius) + display name + hex value
- Selection: lighter surfaceColor background, left-side 3px `primaryColor` accent bar
- Click signal for selection

**Web equivalent**: Simple list item with color preview swatch and name.

### ColorWheel
**Source**: `vendor/decenza/qml/components/ColorWheel.qml` (151 lines)

Circular hue selector drawn on HTML5 Canvas.

- **Size**: Scales to fit container (`Math.min(width, height)`)
- **Ring**: 15% of wheel diameter, drawn as 360 gradient segments (1 per degree)
- **Center**: Semi-transparent circle showing current color preview (60% of inner radius)
- **Picker**: Ring-positioned circle indicator with white 3px border and shadow
- **Interaction**: Drag on ring to change hue (0-360). Only responds within ring area (+/-10px tolerance)
- **Drawing**: Canvas `getContext("2d")` with `arc()` segments filled with `Qt.hsla(i/360, 1.0, 0.5, 1.0)`

**Web equivalent**: SVG conic-gradient circle or Canvas-drawn hue wheel with pointer events.

---

## 34. Screensaver Components

### FlipClockScreensaver
**Source**: `vendor/decenza/qml/components/FlipClockScreensaver.qml` (395 lines)

Classic mechanical flip clock animation.

**Properties**:
- `use24Hour`: 12/24 hour format (from `ScreensaverManager.flipClockUse24Hour`)
- `use3D`: Optional perspective transform (5-degree X rotation)
- `flipDuration`: 800ms per digit flip

**Card Dimensions** (responsive):
- Card width: `min(width * 0.15, height * 0.35)`
- Card height: `cardWidth * 1.4`
- Digit gap: `cardWidth * 0.12`
- Pair gap: `cardWidth * 0.5`
- Corner radius: `cardWidth * 0.08`

**Colors**: Dark card (#2a2a2a / #1a1a1a), white digits (#f0f0f0), subtle outline (#404040)

**Flip Animation** (per digit, `FlipDigitCard` inline component):
- 4 layers: static bottom card, static top card (new digit), flipper front (old digit top half), flipper back (new digit bottom half)
- Front visible 0-90 degrees, back visible 90-180 degrees
- 3D rotation around X axis at card center gap
- `Easing.InOutQuad` for natural mechanical feel
- Divider line: black bar at center between halves

**Colon**: Two round dots at 30% and 70% vertical positions between hour and minute pairs

**Web equivalent**: CSS 3D transforms with `rotateX()` for flip animation, `perspective` container.

### PipesScreensaver
**Source**: `vendor/decenza/qml/components/PipesScreensaver.qml` (472 lines)

Classic Windows 3D pipes screensaver recreation using Qt Quick 3D.

**Properties**:
- `speed`: Growth rate (from `ScreensaverManager.pipesSpeed`)
- `cameraRotationDuration`: Camera orbit speed in seconds

**Scene Configuration**:
- Scene size: 400 units, grid: 20x20x20 voxels
- Pipe radius: 8 units, segment length: 1 voxel
- 8 pipe colors: Silver, Gold, Bronze, Royal Blue, Crimson, Forest Green, Dark Orchid, Dark Turquoise
- Camera: Orbiting perspective camera at distance 450, FOV 60 degrees

**Algorithm**:
1. Start new pipe at random unoccupied voxel with random direction
2. Grow segment-by-segment using voxel occupancy map
3. 30% chance to turn at each step (perpendicular to current direction)
4. Ball joints (spheres) at every turn
5. 2% chance to end pipe after 5+ segments
6. Start sphere (1.5x radius) and end sphere (1.4x, darker) mark pipe endpoints
7. 0.1% chance to clear everything and restart
8. When no valid starting position found (grid full), restart

**Rendering**: Instanced geometry (InstanceList) for cylinders and spheres. Animated tip sphere shows current growth point.

**Web equivalent**: Three.js scene with instanced cylinder/sphere geometry, voxel-based pathfinding.

### ShotMapScreensaver
**Source**: `vendor/decenza/qml/components/ShotMapScreensaver.qml` (532 lines)

World map showing espresso shot locations from the community.

**Properties**:
- `mapShape`: "flat" or "globe" (from `ScreensaverManager.shotMapShape`)
- `mapTexture`: "dark", "bright", or "satellite" (from `ScreensaverManager.shotMapTexture`)
- `showClock`: Clock overlay toggle
- `showProfiles`: Show top profiles overlay
- `widgetMode`: Smaller dots, no overlays (for embedding as layout widget)

**Data**:
- Fetches from `https://decenza.coffee/api/shots-latest.json` every 30 seconds
- Data shape: `{ shots: [{lat, lon, age}], top_profiles: [{name, count}] }`
- Shot opacity fades from 1.0 to 0.2 over 24 hours based on `age` field

**Flat Map View**:
- Web Mercator projection (latitude -85 to +85)
- Map image background with texture selection (dark/bright/satellite)
- Fallback grid canvas when images not loaded
- Shot markers: 20px outer glow circle + 8px inner solid dot
- New shots (< 1 minute): 3x pulsing scale animation (500ms per cycle)

**3D Globe View** (Qt Quick 3D):
- Earth sphere model with texture map
- Rotating node (360-degree orbit in 2 minutes)
- Shot markers as 3D spheres positioned on globe surface
- Two-light setup: main directional + fill light

**Overlays** (shared between views):
- Clock: 48px bold, top center
- Top Profiles: Right column, profile names + shot counts
- Stats: Bottom left, "N shots in the last 24 hours"
- "Touch to exit" hint: Bottom right

**Web equivalent**: Leaflet.js for flat map, Three.js with sphere for globe mode, fetch from same API endpoint.

### StrangeAttractorScreensaver
**Source**: `vendor/decenza/qml/components/StrangeAttractorScreensaver.qml` (67 lines)

Mathematical strange attractor visualization (thin QML wrapper around C++ renderer).

**Properties**:
- `pointsPerFrame: 500` (rendering density)
- `running`: Controls animation

**Components**:
- `StrangeAttractorRenderer`: C++ custom `QQuickItem` that does the actual rendering
- Attractor name label: Bottom-left corner, fades out over 10 seconds, reappears on attractor change
- Double-tap to randomize: Picks new attractor type via `renderer.randomize()`

**Web equivalent**: WebGL shader-based particle system or Canvas 2D with point rendering.

---

## 35. UnsavedChangesDialog

**Source**: `vendor/decenza/qml/components/UnsavedChangesDialog.qml` (160 lines)

Modal confirmation dialog for unsaved changes (used in profile editor, recipe editor, post-shot review).

**Properties**:
- `itemType`: "profile", "recipe", or "shot" (used in message text)
- `canSave`: Enables/disables Save button
- `showSaveAs`: Show "Save As" option (false for items that don't support it)

**Layout**: Centered modal dialog, width `Theme.scaled(400)`:
- Header: "Unsaved Changes" title with bottom divider
- Message: "You have unsaved changes to this [itemType]. What would you like to do?"
- Buttons: 2 or 3 buttons in equal-width grid

**Buttons**:

| Button | Color | Condition | Signal |
|--------|-------|-----------|--------|
| Discard | `errorColor` bg, white text | Always visible | `discardClicked()` |
| Save As | `primaryColor` border, transparent bg | `showSaveAs === true` | `saveAsClicked()` |
| Save | `primaryColor` bg, white text (or `buttonDisabled` if !canSave) | Always visible | `saveClicked()` |

- Button height: `Theme.scaled(50)`
- All buttons close the dialog before emitting signal
- Accessibility: Announces full dialog content on open

**Web equivalent**: Standard modal dialog with 2-3 action buttons.

---

## 36. SwipeableArea

**Source**: `vendor/decenza/qml/components/SwipeableArea.qml` (119 lines)

Horizontal swipe gesture detector with elastic bounce feedback.

**Properties**:
- `canSwipeLeft: true`, `canSwipeRight: true` -- Enable/disable per direction
- `swipeOffset: 0` -- Visual feedback offset (content shifts during swipe)
- `swipeThreshold: 80` -- Minimum distance (px) to trigger swipe
- `maxBounceDistance: 40` -- Maximum elastic bounce at edges

**Signals**: `swipedLeft()`, `swipedRight()`

**Gesture Detection Algorithm**:
1. On press: Record start position, begin tracking
2. On move (> 10px): Determine direction (horizontal vs vertical). If vertical, stop tracking (let parent scroll)
3. During horizontal tracking: Update `swipeOffset` for visual feedback. If at edge and can't swipe that direction, apply 0.3x elastic resistance
4. On release: If delta exceeds `swipeThreshold` and direction is allowed, emit swipe signal
5. Reset animation: 200ms `Easing.OutCubic` back to 0 offset

**Dynamic steal prevention**: Sets `preventStealing: true` on MouseArea only after confirming horizontal swipe, preventing parent Flickable from taking over.

**Web equivalent**: Touch event handlers with `touchmove` direction detection, CSS `transform: translateX()` for visual feedback.

---

## 37. Layout Widget Items

**Source**: `vendor/decenza/qml/components/layout/items/` (22 item types)

Each layout item has two rendering modes:
- **Compact mode** (`isCompact: true`): For bar zones (statusBar, topLeft, topRight, bottomLeft, bottomRight). Horizontal, minimal height.
- **Full mode** (`isCompact: false`): For center zones (centerStatus, centerTop, centerMiddle). Larger, vertical layout.

### Item Types

| Type | Source File | Compact Display | Full Display |
|------|-----------|-----------------|--------------|
| `temperature` | TemperatureItem.qml | `"93.2°C"` (temperatureColor) | Current temp + target temp + "Group Temp" label |
| `steamTemperature` | SteamTemperatureItem.qml | `"155°"` | Steam temp + target |
| `waterLevel` | WaterLevelItem.qml | `"78%"` or `"850 ml"` (color: error < 200ml, warning < 400ml) | Value + "Water Level" label |
| `connectionStatus` | ConnectionStatusItem.qml | Green/red dot + "Online"/"Offline" | `ConnectionIndicator` component |
| `scaleWeight` | ScaleWeightItem.qml | Weight text with tare on tap, ratio on double-tap, BrewDialog on long-press | Weight + "Scale Weight" label + BrewDialog |
| `shotPlan` | ShotPlanItem.qml | `ShotPlanText` component | Same with BrewDialog |
| `pageTitle` | PageTitleItem.qml | Profile name text | Profile name |
| `weather` | WeatherItem.qml | Flickable hourly forecast (emoji icons + temp) | Current conditions header + hourly scroll + location |
| `espresso` | EspressoItem.qml | Action button for espresso toggle | Same |
| `steam` | SteamItem.qml | Action button for steam toggle | Same |
| `hotWater` | HotWaterItem.qml | Action button for hot water | Same |
| `flush` | FlushItem.qml | Action button for flush | Same |
| `beans` | BeansItem.qml | Action button for beans/DYE | Same |
| `history` | HistoryItem.qml | Navigate to history | Same |
| `settings` | SettingsItem.qml | Navigate to settings | Same |
| `autoFavorites` | AutoFavoritesItem.qml | Navigate to auto-favorites | Same |
| `screensaver` | ScreensaverItem.qml | Navigate to screensaver | Same |
| `sleep` | SleepItem.qml | Sleep command button | Same |
| `quit` | QuitItem.qml | Quit command button | Same |
| `spacer` | SpacerItem.qml | Flexible space (`Layout.fillWidth`) | Same |
| `separator` | SeparatorItem.qml | Vertical line separator | Same |
| `custom` | CustomItem.qml | Custom text/emoji/action widget | Same (see below) |

### CustomItem (most complex)
**Source**: `vendor/decenza/qml/components/layout/items/CustomItem.qml` (352 lines)

Fully configurable widget supporting:
- **Text content**: with variable substitution (see below)
- **Emoji/icon**: SVG icon or Unicode emoji, rendered as image via `Theme.emojiToImage()`
- **Background color**: Configurable `backgroundColor` property
- **Text alignment**: left / center / right
- **Actions** (3 types): `action` (tap), `longPressAction` (long press), `doubleclickAction` (double click)

**Variable Substitution System** (21 variables):

| Variable | Source | Example |
|----------|--------|---------|
| `%TEMP%` | `DE1Device.temperature` | "93.2" |
| `%STEAM_TEMP%` | `DE1Device.steamTemperature` | "155°" |
| `%PRESSURE%` | `DE1Device.pressure` | "9.0" |
| `%FLOW%` | `DE1Device.flow` | "2.1" |
| `%WATER%` | `DE1Device.waterLevel` | "78" |
| `%WATER_ML%` | `DE1Device.waterLevelMl` | "850" |
| `%STATE%` | `DE1Device.stateString` | "Idle" |
| `%WEIGHT%` | `MachineState.scaleWeight` | "36.2" |
| `%SHOT_TIME%` | `MachineState.shotTime` | "28.5" |
| `%VOLUME%` | `MachineState.cumulativeVolume` | "42" |
| `%TARGET_WEIGHT%` | `MainController.targetWeight` | "36.0" |
| `%PROFILE%` | `MainController.currentProfileName` | "Londinium" |
| `%TARGET_TEMP%` | `MainController.profileTargetTemperature` | "93.0" |
| `%RATIO%` | `MainController.brewByRatio` | "2.0" |
| `%DOSE%` | `MainController.brewByRatioDose` | "18.0" |
| `%SCALE%` | `ScaleDevice.name` | "Lunar" |
| `%GRIND%` | `Settings.dyeGrinderSetting` | "4.5" |
| `%GRINDER%` | `Settings.dyeGrinderModel` | "Niche" |
| `%CONNECTED%` | Connection status | "Online" / "Offline" |
| `%TIME%` | Current time | "14:30" |
| `%DATE%` | Current date | "2026-02-10" |

**Action System** (3 categories):

| Action Prefix | Target Examples | Effect |
|---------------|----------------|--------|
| `togglePreset:` | espresso, steam, hotwater, flush, beans | Toggle preset on IdlePage |
| `navigate:` | settings, history, profiles, profileEditor, recipes, descaling, ai, visualizer, autofavorites, steam, hotwater, flush, beaninfo | Push page onto navigation stack |
| `command:` | sleep, startEspresso, startSteam, startHotWater, startFlush, idle, tare, quit | Execute machine command |

**Rendering**:
- Compact: Row with optional emoji (28px) + resolved text, optional colored background pill
- Full: Column with optional emoji (48px) above text, optional colored background rectangle
- Action buttons dim (0.5 opacity) when `DE1Device.guiEnabled === false`
- HTML support via `textFormat: Text.RichText` with XSS-like sanitization (`sanitizeHtml`)

### WeatherItem
**Source**: `vendor/decenza/qml/components/layout/items/WeatherItem.qml` (350 lines)

Weather forecast widget with WMO weather code to emoji mapping.

- **Data source**: `WeatherManager` C++ singleton (hourly forecast, location, provider)
- **Moon phase**: Calculates from synodic month (29.53059 days) relative to Jan 6, 2000 reference
- **Weather emojis**: Maps WMO icon names (clear, partly-cloudy, overcast, fog, drizzle, rain, snow, thunderstorm, etc.) to Unicode weather symbols
- **Compact mode**: Horizontal flickable list of hourly forecasts (hour + emoji + temperature)
- **Full mode**: Current conditions header (emoji + temperature + description + humidity + wind) + hourly scroll + location/provider label
- **Empty state**: "Set city in Settings → Options" when no weather data

### Web Skin Notes
For the web skin, layout items map to Vue components. The variable substitution system maps to computed properties bound to WebSocket snapshot data. Actions map to Vue Router navigation and REST API calls.

---

## 38. Library Components

### LibraryItemCard
**Source**: `vendor/decenza/qml/components/library/LibraryItemCard.qml` (574 lines)

Renders a library entry (item, zone, or layout) as a visual card with live preview or cached thumbnail.

**Display modes**:
- `displayMode: 0` (full preview): Shows full visual preview of the widget/zone/layout
- `displayMode: 1` (compact list): Smaller representation for list views

**Thumbnail priority**: Server thumbnail URL > Local cached thumbnail > Live preview rendering

**Entry types** with type badges:
- "ITEM" (primaryColor badge): Renders as `CustomItem` with `previewModelData`
- "ZONE" (accentColor badge): Renders as `LayoutCenterZone` or `LayoutBarZone` depending on zone name
- "LAYOUT" (successColor badge): Renders full mini-layout with all 8 zones

**Variable resolution for previews**: `resolveContent()` substitutes all 21 variable tokens with sample values for non-live preview

**Signals**: `clicked()`, `doubleClicked()`

### LibraryPanel
**Source**: `vendor/decenza/qml/components/library/LibraryPanel.qml` (793 lines)

Side panel for the layout editor combining local and community library.

**Tabs**: "My Library" (local) / "Community"

**Header**: Display mode toggle (grid/list icons), type filter buttons (I/Z/L toggles)

**Actions**:
- **Add** (+): Dropdown menu to save current Item/Zone/Layout to library
- **Apply** (←): Apply selected library entry to current zone
- **Delete** (trash): Delete with confirmation dialog (local entries or own server entries)
- **Share** (upload): Capture thumbnail and upload to community server
- **Type filters**: Toggle visibility of Items (I), Zones (Z), Layouts (L)

**Thumbnail capture system**: Off-screen `LibraryItemCard` instances with `layer.enabled` for FBO rendering. Two capture timers (200ms delay for component render):
- Local capture: Saves full + compact thumbnails on entry add
- Upload capture: Saves thumbnails then uploads with `LibrarySharing.uploadEntryWithThumbnails()`

**Community operations**: Browse All button navigates to `CommunityBrowserPage`. Download entries with pending-apply support (download then auto-apply to selected zone).

**Feedback**: Toast messages for upload/download/delete success/failure (3-second auto-dismiss).

---

## 39. C++ Data Model Reference

Key data structures from the C++ source that define the shapes the web skin must handle.

### Profile (profile.h)
**Source**: `vendor/decenza/src/profile/profile.h` (200 lines)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| title | string | "Default" | Profile name (stripped of leading "*") |
| author | string | "" | Profile author |
| profileNotes | string | "" | Description |
| beverageType | string | "espresso" | Category |
| profileType | string | "settings_2c" | de1app compat type |
| targetWeight | double | 36.0 | Stop-at-weight (grams) |
| targetVolume | double | 36.0 | Stop-at-volume (mL) |
| stopAtType | enum | Weight | Weight or Volume |
| espressoTemperature | double | 93.0 | Primary temperature (°C) |
| temperaturePresets | double[] | [88, 90, 93, 96] | Quick-adjust presets |
| hasRecommendedDose | bool | false | Whether dose is recommended |
| recommendedDose | double | 18.0 | Recommended dose (grams) |
| maximumPressure | double | 12.0 | Safety limit (bar) |
| maximumFlow | double | 6.0 | Safety limit (mL/s) |
| steps | ProfileFrame[] | [] | Extraction frames (max 20) |
| preinfuseFrameCount | int | 0 | Frames that are preinfusion |
| mode | enum | FrameBased | FrameBased or DirectControl |
| isRecipeMode | bool | false | Uses RecipeParams to generate frames |
| recipeParams | RecipeParams | {} | High-level recipe parameters |

### ProfileFrame (profileframe.h)
**Source**: `vendor/decenza/src/profile/profileframe.h` (83 lines)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| name | string | "" | Step name (e.g., "Preinfusion") |
| temperature | double | 93.0 | Target temp (°C, 0-127.5) |
| sensor | string | "coffee" | "coffee" (basket) or "water" (mix) |
| pump | string | "pressure" | "pressure" or "flow" control |
| transition | string | "fast" | "fast" (instant) or "smooth" (interpolate) |
| pressure | double | 9.0 | Target pressure (bar, 0-15.9375) |
| flow | double | 2.0 | Target flow (mL/s, 0-15.9375) |
| seconds | double | 30.0 | Max frame duration |
| volume | double | 0.0 | Max volume (mL, 0=no limit) |
| exitIf | bool | false | Enable machine-side exit condition |
| exitType | string | "" | "pressure_over/under", "flow_over/under" |
| exitPressureOver | double | 0.0 | Exit threshold (bar) |
| exitPressureUnder | double | 0.0 | Exit threshold (bar) |
| exitFlowOver | double | 0.0 | Exit threshold (mL/s) |
| exitFlowUnder | double | 0.0 | Exit threshold (mL/s) |
| exitWeight | double | 0.0 | App-side weight exit (grams) -- INDEPENDENT of exitIf |
| popup | string | "" | User notification text |
| maxFlowOrPressure | double | 0.0 | Limiter value (0=no limit) |
| maxFlowOrPressureRange | double | 0.6 | Limiter P/I range |

### RecipeParams (recipeparams.h)
**Source**: `vendor/decenza/src/profile/recipeparams.h` (69 lines)

High-level "coffee concept" parameters for the Recipe Editor (D-Flow style).

| Phase | Field | Default | Description |
|-------|-------|---------|-------------|
| Core | targetWeight | 36.0 | Stop-at-weight (g) |
| Core | dose | 18.0 | Input dose (g) |
| Fill | fillTemperature | 88.0 | °C |
| Fill | fillPressure | 3.0 | bar |
| Fill | fillFlow | 8.0 | mL/s |
| Fill | fillTimeout | 25.0 | seconds |
| Fill | fillExitPressure | 3.0 | Exit to infuse when over (bar) |
| Infuse | infuseEnabled | true | Enable soak phase |
| Infuse | infusePressure | 3.0 | Soak pressure (bar) |
| Infuse | infuseTime | 20.0 | Soak duration (seconds) |
| Infuse | infuseByWeight | false | Exit on weight vs time |
| Infuse | infuseWeight | 4.0 | Weight exit (grams) |
| Infuse | bloomEnabled | false | Pause with 0 flow |
| Infuse | bloomTime | 10.0 | Bloom pause (seconds) |
| Pour | pourTemperature | 93.0 | °C |
| Pour | pourStyle | "flow" | "pressure" or "flow" |
| Pour | pourPressure | 9.0 | Extraction pressure (bar) |
| Pour | pourFlow | 2.0 | Extraction flow (mL/s) |
| Pour | flowLimit | 0.0 | Max flow in pressure mode |
| Pour | pressureLimit | 6.0 | Max pressure in flow mode |
| Pour | rampEnabled | true | Enable transition ramp |
| Pour | rampTime | 5.0 | Ramp duration (seconds) |
| Decline | declineEnabled | false | Enable pressure ramp-down |
| Decline | declineTo | 6.0 | Target end pressure (bar) |
| Decline | declineTime | 30.0 | Ramp duration (seconds) |

**Presets**: `classic()` (9-bar Italian), `londinium()` (lever with decline), `turbo()` (fast high-extraction flow), `blooming()` (long bloom), `dflowDefault()` (Damian's style)

### ShotMetadata (visualizeruploader.h)
**Source**: `vendor/decenza/src/network/visualizeruploader.h` (28 lines)

DYE metadata structure sent with visualizer uploads:

| Field | Type | Description |
|-------|------|-------------|
| beanBrand | string | Roaster name |
| beanType | string | Coffee name |
| roastDate | string | ISO YYYY-MM-DD |
| roastLevel | string | Light / Medium / Dark |
| grinderModel | string | Grinder name |
| grinderSetting | string | Grind setting |
| beanWeight | double | Dose (grams) |
| drinkWeight | double | Yield (grams) |
| drinkTds | double | TDS measurement |
| drinkEy | double | Extraction yield % |
| espressoEnjoyment | int | 0-100 rating |
| espressoNotes | string | Shot notes |
| barista | string | Person who made it |

### Settings (settings.h, comprehensive)
**Source**: `vendor/decenza/src/core/settings.h` (710 lines)

Key settings categories and their web skin mapping:

| Category | Settings | Web API |
|----------|----------|---------|
| Machine | machineAddress, scaleAddress, scaleType | `GET /api/v1/devices` |
| Espresso | espressoTemperature, targetWeight, lastUsedRatio | `GET/PUT /api/v1/workflow` |
| Steam | steamTemperature, steamTimeout, steamFlow, keepSteamHeaterOn | `GET/PUT /api/v1/machine/shotSettings` |
| Hot Water | waterTemperature, waterVolume, waterVolumeMode | `GET/PUT /api/v1/machine/shotSettings` |
| Flush | flushFlow, flushSeconds | `GET/PUT /api/v1/machine/settings` |
| Presets | steamPitcherPresets, waterVesselPresets, flushPresets, beanPresets, favoriteProfiles | `POST /api/v1/store/decenza-js/*` |
| Theme | customThemeColors, colorGroups, activeThemeName, screenBrightness | `POST /api/v1/store/decenza-js/theme` |
| Visualizer | visualizerUsername/Password, autoUpload, extendedMetadata | `POST /api/v1/store/decenza-js/visualizer` |
| AI | aiProvider, *ApiKey, ollamaEndpoint/Model | `POST /api/v1/store/decenza-js/ai` |
| DYE | dyeBeanBrand/Type/RoastDate/Level, dyeGrinderModel/Setting, etc. | `PUT /api/v1/workflow` (metadata fields) |
| MQTT | mqttEnabled, mqttBrokerHost/Port/Username/Password, mqttBaseTopic | Not applicable (server-side) |
| Layout | layoutConfiguration (JSON string with 8 zones) | `POST /api/v1/store/decenza-js/layout` |
| Auto-Favorites | autoFavoritesEnabled, autoFavoritesGroupBy, autoFavoritesMaxItems | `POST /api/v1/store/decenza-js/autoFavorites` |

### LibrarySharing (librarysharing.h)
**Source**: `vendor/decenza/src/network/librarysharing.h` (163 lines)

Community widget sharing system:
- **Server**: `api.decenza.coffee`
- **Auth**: Anonymous via `X-Device-Id` header (stable UUID)
- **Operations**: Upload, browse (paginated with filters), download, delete (own entries only), flag/report
- **Browse filters**: type, variable tag, action tag, free text search, sort (newest/popular)
- **Thumbnail system**: Multipart upload with full + compact PNG thumbnails

---

## 40. Web Skin Applicability Notes

### Directly Applicable (implement in web skin)
- Shot History browsing and filtering (via REST API)
- Shot Detail view with graph
- Shot Comparison with overlay graph
- Post-Shot Review / Bean Info editing (via workflow API)
- Theme customization (CSS variables)
- Screensaver (client-side JS/CSS)
- Descaling wizard (state machine + REST)
- Visualizer integration (direct HTTP)
- Settings: Preferences, Options (via machine settings API)

### Partially Applicable (simplified or different approach)
- Bluetooth: Replaced by Streamline-Bridge device management API
- Layout: Web-native responsive layout system
- Accessibility: Standard web accessibility (ARIA, screen readers)
- AI: Direct API calls from browser or server-proxied

### Not Applicable for Web Skin
- Auto-Update (web assets updated via skin deployment)
- Debug: Window resolution, profile converter, database import
- Data Migration: Device-to-device transfer (server concern)
- Language/Translation: Use standard i18n library (vue-i18n)
- MQTT: Server-side concern (Streamline-Bridge can handle)
- Shot Import from DE1 App: Native app feature only
- BLE scan logs: Handled by Streamline-Bridge

### API Mapping Summary

| Feature | Streamline-Bridge API |
|---------|----------------------|
| Shot list | `GET /api/v1/shots/ids` |
| Shot data | `GET /api/v1/shots/{id}` |
| Machine state | `GET/PUT /api/v1/machine/state` |
| Machine settings | `GET/POST /api/v1/machine/settings` |
| Workflow/recipe | `GET/PUT /api/v1/workflow` |
| Profiles | `GET/POST /api/v1/profiles` |
| Scale tare | `PUT /api/v1/scale/tare` |
| Devices | `GET /api/v1/devices` |
| Key-value store | `GET/POST /api/v1/store/{ns}/{key}` |
| Real-time data | `ws/v1/machine/snapshot` (10Hz) |
| Scale data | `ws/v1/scale/snapshot` (5-10Hz) |
| Shot settings | `ws/v1/machine/shotSettings` |
| Water levels | `ws/v1/machine/waterLevels` |
