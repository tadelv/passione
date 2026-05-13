# Settings Surface Review

**Date:** 2026-05-13
**Scope:** `src/pages/SettingsPage.vue` + all `src/components/settings/*.vue` (12 tabs)
**Sources:** parallel audit by `feature-dev:code-architect` (IA) and `impeccable`-style design critique

## Current State

12 tabs covering five different jobs glued onto one tab strip:

| # | Tab | Contents |
|---|-----|----------|
| 1 | Device | BT/USB device list, Scan, Tare Scale, connection error banner |
| 2 | Preferences | Power & Sleep (auto-sleep + wake schedules) / Water (unit + refill threshold) / Espresso (linger + showGrinderRpm + showBasketData) |
| 3 | Layout | "Edit Layout" button + "Reset to Default" |
| 4 | Visualizer | visualizer.coffee credentials, auto-upload, min duration, extended metadata, after-shot review, default rating |
| 5 | History | Total shot count + "Browse Shot History" nav button |
| 6 | Gateway | Bridge mode (read-only), log level, weight/flow multipliers, scale power mode, low-battery brightness cap, native Bridge settings link |
| 7 | Screensaver | Type picker + flip-clock 24h toggle |
| 8 | Themes | Color preset picker + per-token hex editor |
| 9 | Beans | Full bean catalog CRUD + batch sub-records |
| 10 | Grinders | Full grinder catalog CRUD |
| 11 | About | App version, donation blurb, Bridge version, check-for-updates |
| 12 | Accessibility | Screen reader/audio toggles, frame ticks, announcement mode, tests |

## Diagnosis

Two distinct problem layers:

1. **Information architecture** — five different jobs share one tab strip. Catalogs (Beans/Grinders) are not settings. Hardware concerns (Device/Gateway) are split. Some tabs are 2-button stubs (Layout, History). Preferences is a 777-line grab bag.
2. **Visual / interaction consistency** — three toggle styles, three section-header styles, mixed save semantics (auto-save vs explicit Save), `window.confirm()` mixed with inline confirm flows, ARIA inconsistency, banned `type="time"` / `type="color"` inputs still present.

## IA Reorg Proposals

### A. Beans + Grinders → dedicated `/catalog` route
Not settings — full CRUD with batch sub-records. Heavy use during dial-in, buried at tabs 9–10.

**Open question:** new 5th BottomBar slot vs `/catalog` subpage reachable from a non-bottombar entry point.

### B. Drop "History" tab
Only contains: total shot count + nav button. Stat moves to About card; nav already exists in BottomBar (T key).

### C. Merge Device + Gateway → "Bridge"
Both are physical-layer hardware (BT/USB, calibration multipliers, scale tare, Bridge config). Two sections inside one tab.

### D. Merge Layout + Screensaver → "Display"
Layout is 2 buttons; Screensaver is one picker + one toggle. Both about "what shows when not brewing." Themes optionally pulled in too.

### E. Split Preferences
Currently mixes Power & Sleep + Water + Espresso toggles. Either real split into "Power", "Brewing", "Water" tabs, or stronger section dividers inside one tab.

### F. Move misplaced toggles
- `showGrinderRpm` / `showBasketData` are currently in Preferences → Espresso. These control recipe-editor field visibility — move to a "Recipe" group.
- `visualizerShowAfterShot` / `defaultShotRating` are in Visualizer tab but are general brewing prefs (navigate to review after shot ends, default rating) — move to Brewing group.

### G. Reorder tabs by intent
Current order is arbitrary; Accessibility (global capability) buried last. Proposed grouping: Brewing setup → Catalogs → Appearance → System → About.

## Cross-Cutting Quality Fixes

### Q1. Unify toggle style
Three styles in use: pill ON/OFF (`AccessibilityTab.vue:65-73, 96-105`, `VisualizerTab.vue:197-203`, `GatewayTab.vue:135-141`, `ScreensaverTab.vue:44-52`), iOS-knob (`PreferencesTab.vue:341-347, 418-425, 433-441, 449-457`), segmented. Pick iOS-knob (already dominant). Extract `SettingsToggle.vue`.

### Q2. Extract `SettingsSection` + `SettingsRow` primitives
Replaces 9 ad-hoc layouts and 3 section-header treatments (h4-underlined / h3-floating / h1-centered). Forces consistent typography, spacing, ARIA, touch sizing.

### Q3. Replace `window.confirm` + silent destructive buttons
- `BeansTab.vue:141, 262` — delete bean / batch
- `GrindersTab.vue:125` — delete grinder
- `LayoutTab.vue` — Reset to Default (no confirm at all)
- `ThemesTab.vue` — reset (no confirm)

Use the inline double-tap-confirm pattern already in PreferencesTab wake-schedule deletes.

### Q4. Unify save semantics
Beans / Grinders / Visualizer require explicit Save; rest auto-persist on change. Pick one model per surface or be visually explicit when Save is required.

### Q5. Touch targets below 44px
- `PreferencesTab.vue:660` day pills 34×28
- `PreferencesTab.vue:604` keep-awake `<select>` 28px tall
- `BeansTab.vue` small buttons with `font-sm` and minimal padding

CLAUDE.md commits to 44–56px touch targets.

### Q6. Banned native dialogs
- `PreferencesTab.vue:323-329` — invisible `type="time"` overlay
- `ThemesTab.vue:167-171` — `type="color"`

Project rule (CLAUDE.md): "No native-dialog-backed inputs" — Android `flutter_inappwebview` reloads on native dialog dismiss.

### Q7. Copy fixes
- "Enable accessibility" → "Enable audio feedback" (purpose vs effect)
- Flip clock "24H/12H" pill toggle → segmented `12h | 24h`
- "Auto-upload" hint says "Plugin uploads shots automatically when enabled" (circular) → "Required for unattended uploads after each shot"
- Helper text leaks internal names ("recipe editor", "workflowCombos")

### Q8. ARIA inconsistency
Some toggles ship `role="switch" aria-checked`, others are bare buttons reading "ON". Apply uniformly through `SettingsToggle.vue` (Q1).

### Q9. Tab strip keyboard nav
`SettingsPage.vue:122-159` declares `role="tablist"` but has no arrow-key navigation. No overflow indicator.

## Per-Tab Notes

### AboutTab
Centered text + 60%-wide dividers feel like an iOS About modal, not a settings tab. "Check for Updates" is the load-bearing action but visually weakest (bordered secondary). Donation copy mixes purpose with monospace email.

### AccessibilityTab
"Enable accessibility" toggles audio features but doesn't announce via AT — wording misleads. Test buttons in their own column with own h4 — belong inline next to their toggles.

### PreferencesTab
Three-column layout treats Power/Water/Espresso as visual equals despite being three different domains. Wake-schedule cards (24px times, dense pill grid) hero this tab. Other sections feel like footnotes.

### DeviceTab
Tare Scale under "Scale" header but no per-scale status; if multiple scales connect, target is ambiguous.

### GatewayTab
- Mode shown as read-only `<span>` styled like editable text next to log-level segmented group — looks editable.
- Log-level capitalize via CSS — fragile.
- External Bridge-settings link styled as primary button without link-out icon.
- "Low battery brightness limit" describes state, not effect — "Dim screen on low battery" is better.

### BeansTab
- Create-bean form inlined above the list pushes content down — modal/sheet would be cleaner.
- Required-field asterisks with no legend.
- Per-batch `×` delete button — destructive action one tap away with no confirm.
- "No batches yet." inside an expanded bean — empty state inside empty state, no CTA.

### GrindersTab
Exposes "burrs" (free text) + "burrSize" (number) + "burrType" (enum) — three overlapping concepts; data quality drifts.

### LayoutTab
Entire tab is one paragraph + two buttons. Reset is red-outlined with no confirm — click and layout is gone. Could embed a layout preview / zone schematic, or merge into Display.

### ScreensaverTab
- Flip-clock 24h toggle uses "24H"/"12H" labels on a knob — confuses state with mode. Should be segmented `12h | 24h`.
- Type-specific config (flip-clock 24h) sits in its own column with its own h4 for a single toggle. Belongs inline under the selected type.

### ShotHistoryTab
Total shots stat uses `font-title` (huge) for a single number. Outsized vs the nav button below. Belongs as a row on Preferences or in About.

### ThemesTab
- Preset row mixes color presets with functional buttons (Random, Reset) inline — different actions disguised as siblings.
- Only `default` preset shows its color; others don't preview.
- Random button uses a rainbow gradient that ignores the user's theme.
- `type="color"` — banned (Q6).

### VisualizerTab
- "Test Connection" + "Save to Plugin" both styled primary; Save is load-bearing but visually outranked.
- "Last upload: shot {id}" — numeric id alone, no link/time. Reads as debug output.
- "After Shot" column mixes Visualizer-specific behavior with `defaultShotRating` (unrelated to Visualizer). Misplaced (F).

## Risks / Decisions

- **5th BottomBar slot vs `/catalog` subpage** — design call for proposal A.
- **Tab `id` deep-links** — if any feature deep-links `/settings/<id>`, removing or renaming `id` needs router redirects. Verify before dropping History or merging Device+Gateway.
- **Settings storage keys must NOT be renamed.** Tab/section labels are free. Storage keys (`visualizerShowAfterShot`, `showGrinderRpm`, `screensaverType`, etc.) are persisted via `useSettings` on the gateway under `/api/v1/store/decenza-js/{key}` and must be preserved.
- **ThemesTab `type="color"`** is a pre-existing rule violation — its replacement is its own design call (hex-only vs custom picker).
- **Catalog migration** if Beans/Grinders move out of settings — existing users have muscle memory; provide a one-shot redirect or breadcrumb.

## Triage

See `docs/plans/2026-05-13-settings-redesign.md` for one-task-per-proposal breakdown to triage (work / drop / defer).
