# Settings Redesign — Task Plan

**Date:** 2026-05-13
**Source:** `docs/settings-review.md`
**Status:** Triage pending — work through one by one, mark decision: ✅ work / ❌ drop / ⏸ defer

Each task is independently shippable. Larger tasks list smaller sub-steps. Effort and risk are rough first-pass estimates.

---

## Quick Wins (low risk, high impact)

### T1. Rename "Gateway" tab → "Bridge"
- **Files:** `src/pages/SettingsPage.vue:9-22` (TABS label only; keep `id: 'gateway'` for deep-links)
- **Effort:** trivial (1 line)
- **Risk:** none — labels only
- **Decision:** ✅ Work

### T2. Drop History tab, fold shot count into About
- **Files:** remove `src/components/settings/ShotHistoryTab.vue`; update `src/pages/SettingsPage.vue` TABS; add shot-count row to `src/components/settings/AboutTab.vue`
- **Effort:** small
- **Risk:** low — verify no deep-links to `/settings/history`
- **Decision:** ✅ Work

### T3. Move misplaced toggles into a "Brewing" section in Preferences
Move into one new Brewing section:
- `lingerOnEspressoPage` (already in PreferencesTab/Espresso)
- `showGrinderRpm` (from PreferencesTab/Espresso)
- `showBasketData` (from PreferencesTab/Espresso)
- `visualizerShowAfterShot` (from VisualizerTab → keep dependency hint on Visualizer username)
- `defaultShotRating` (from VisualizerTab)
- **Files:** `src/components/settings/PreferencesTab.vue`, `src/components/settings/VisualizerTab.vue`
- **Effort:** small (template reorder, no storage-key changes)
- **Risk:** none — keys preserved
- **Decision:** ✅ Work

### T4. Copy fixes pass
- "Enable accessibility" → "Enable audio feedback" (`AccessibilityTab.vue`)
- Flip-clock 24h toggle → segmented `12h | 24h` (`ScreensaverTab.vue:44-52`)
- "Auto-upload" helper → "Required for unattended uploads after each shot" (`VisualizerTab.vue:204`)
- "Low battery brightness limit" → "Dim screen on low battery" (`GatewayTab.vue`)
- Strip helper-text leakage of internal names ("recipe editor", "workflowCombos")
- **Effort:** small
- **Risk:** none
- **Decision:** ✅ Work

### T5. Replace `window.confirm` + silent destructives with inline confirm
Reuse the PreferencesTab wake-schedule double-tap-confirm pattern. Sites:
- `BeansTab.vue:141` — delete bean
- `BeansTab.vue:262` — delete batch
- `GrindersTab.vue:125` — delete grinder
- `LayoutTab.vue` — Reset to Default (no confirm today)
- `ThemesTab.vue` — reset (no confirm today)
- **Effort:** medium (extract reusable confirm primitive, or copy-pattern per site)
- **Risk:** low
- **Decision:** ✅ Work

### T6. Replace banned native dialogs
- `PreferencesTab.vue:323-329` — `type="time"` → text input with `inputmode="numeric"` + `pattern="HH:MM"`, matching the BeansTab date pattern
- `ThemesTab.vue:167-171` — `type="color"` → hex-only text input or custom picker (design call)
- **Effort:** small (time) + medium (color picker decision)
- **Risk:** crash class on Android WebView — currently a known violation per CLAUDE.md
- **Decision:** ✅ Work — **time only**; color picker deferred until model decision (hex-only vs custom picker)

---

## Primitives (medium effort, unlocks consistency)

### T7. Extract `SettingsToggle.vue`
Unify three toggle styles (pill ON/OFF, iOS-knob, segmented) into one component. iOS-knob style preferred (already dominant in PreferencesTab). Component handles `role="switch"`, `aria-checked`, 44px+ touch target.
- **Files:** new `src/components/settings/SettingsToggle.vue`; replace usages in `AccessibilityTab`, `VisualizerTab`, `GatewayTab`, `ScreensaverTab`, `PreferencesTab`
- **Effort:** medium
- **Risk:** visual regression across all settings tabs — covered by Playwright screenshots
- **Decision:** ✅ Work

### T8. Extract `SettingsSection` + `SettingsRow` primitives
Replaces 9 ad-hoc layouts and 3 section-header treatments. Forces consistent typography, spacing, touch sizing.
- **Files:** new `src/components/settings/SettingsSection.vue` + `SettingsRow.vue`; gradual adoption per tab
- **Effort:** medium-large (component design + per-tab refactor)
- **Risk:** visual regression — large surface
- **Decision:** ✅ Work — `SettingsSection` primitive landed in PR 1; per-tab adoption rides along with PR 3/4/5 structural rewrites. `SettingsRow` deferred until row shapes settle after structural moves.

### T9. Tab-strip keyboard nav + overflow indicator
`SettingsPage.vue:122-159` has `role="tablist"` but no arrow-key navigation; horizontal overflow has no indicator.
- **Effort:** small-medium
- **Risk:** low
- **Decision:** ✅ Work

---

## Structural Reorgs (need decisions before work)

### T10. Beans + Grinders → dedicated `/catalog` route
Pull Beans and Grinders out of Settings into their own page with sub-tabs.
- **Decision needed:** 5th BottomBar slot vs `/catalog` reached from another entry point (e.g. recipe editor link, settings shortcut)
- **Files:** new `src/pages/CatalogPage.vue`; move `BeansTab.vue` + `GrindersTab.vue` content; router entry; BottomBar update; redirect from `/settings/beans` and `/settings/grinders` if deep-linked
- **Effort:** large
- **Risk:** medium — muscle-memory disruption; needs redirect for any external deep-links
- **Decision:** ✅ Work — **5th BottomBar slot** ('Catalog' with sub-tabs Beans/Grinders)

### T11. Merge Device + Gateway → "Bridge"
Two sections in one tab: "Connected Devices" + "Bridge Settings". Tare scale becomes a calibration action alongside weight/flow multipliers.
- **Files:** new `src/components/settings/BridgeTab.vue` (or rename `GatewayTab.vue`); fold `DeviceTab.vue` content; `SettingsPage.vue` TABS update
- **Effort:** medium
- **Risk:** low — both surfaces are operator/admin-facing
- **Decision:** ✅ Work

### T12. Merge Layout + Screensaver → "Display"
Layout (2 buttons) + Screensaver (1 picker + 1 toggle) → one Display tab. Consider folding Themes in too.
- **Decision needed:** include Themes (deep color editor) or keep separate?
- **Files:** new `DisplayTab.vue` or rename `LayoutTab.vue`; merge `ScreensaverTab.vue` + `ThemesTab.vue` content; `SettingsPage.vue` TABS update
- **Effort:** small-medium
- **Risk:** low
- **Decision:** ✅ Work — **include Themes** (single Display tab: layout + screensaver + theme presets/editor). T20+T21 land inside the Display tab's Themes section.

### T13. Split Preferences into clear sections (or tabs)
Currently 777-line grab bag: Power & Sleep + Water + Espresso.
- **Decision needed:** split into separate "Power", "Water", "Brewing" tabs vs strengthen section dividers inside one tab
- **Files:** new tab components for Power / Water / Brewing; remove `PreferencesTab.vue`; `SettingsPage.vue` TABS
- **Effort:** medium
- **Risk:** low (storage keys preserved)
- **Decision:** ✅ Work — **separate tabs**: Power, Water, Brewing. T3 toggles land in the new Brewing tab.

### T14. Reorder Settings tabs by intent
Proposed grouping: Brewing setup → Catalogs (if not split out via T10) → Appearance → System → About. Accessibility currently buried last; consider whether to lift earlier.
- **Files:** `src/pages/SettingsPage.vue:9-22` reorder TABS array
- **Effort:** trivial
- **Risk:** none — labels and order only
- **Decision:** ✅ Work

---

## Per-Tab Polish (small, independent)

### T15. AboutTab — make "Check for Updates" the visual primary
Current bordered secondary styling demotes the most-tapped action.
- **Files:** `src/components/settings/AboutTab.vue`
- **Effort:** small
- **Decision:** ✅ Work

### T16. AccessibilityTab — inline test buttons next to their toggles
Currently in their own column with separate h4. They're tools paired to specific toggles.
- **Files:** `src/components/settings/AccessibilityTab.vue`
- **Effort:** small
- **Decision:** ✅ Work

### T17. BeansTab — modal/sheet for create-bean form
Currently inlined above list, pushes content down.
- **Files:** `src/components/settings/BeansTab.vue`
- **Effort:** medium
- **Risk:** low
- **Decision:** ✅ Work

### T18. BeansTab — CTA on empty-batch state
"No batches yet." → "Add the first batch" with action.
- **Files:** `src/components/settings/BeansTab.vue:439-440`
- **Effort:** trivial
- **Decision:** ✅ Work

### T19. GrindersTab — consolidate overlapping burr fields
"burrs" (free text) + "burrSize" (number) + "burrType" (enum) overlap. Pick a model that prevents drift.
- **Decision needed:** drop one, or treat free-text as a display-only summary derived from size+type
- **Files:** `src/components/settings/GrindersTab.vue`; data model
- **Effort:** medium
- **Risk:** medium — existing grinder records have free-text burrs filled in
- **Decision:** ✅ Work — **drop free-text `burrs`**, keep `burrSize` + `burrType`. Need a one-shot migration path for existing records (display-only fallback or backfill).

### T20. ThemesTab — separate functional buttons from preset row
Random/Reset are inline with color presets, disguised as siblings. Move to a footer action bar.
- **Files:** `src/components/settings/ThemesTab.vue:97-114`
- **Effort:** small
- **Decision:** ✅ Work

### T21. ThemesTab — show color previews for all presets
Only `default` previews its color today. Inline-style swatch for each preset.
- **Files:** `src/components/settings/ThemesTab.vue`
- **Effort:** small
- **Decision:** ✅ Work

### T22. VisualizerTab — demote "Test Connection", promote "Save to Plugin"
Save is the load-bearing action; styling currently equal.
- **Files:** `src/components/settings/VisualizerTab.vue:152-167`
- **Effort:** trivial
- **Decision:** ✅ Work

### T23. VisualizerTab — humanize "Last upload: shot {id}"
Add relative time + link to the shot detail page.
- **Files:** `src/components/settings/VisualizerTab.vue:184-188`
- **Effort:** small
- **Decision:** ✅ Work

### T24. ScreensaverTab — inline type-specific config under the selected type
Flip-clock 24h toggle is in its own column with its own h4 for a single control.
- **Files:** `src/components/settings/ScreensaverTab.vue`
- **Effort:** small
- **Decision:** ✅ Work

### T25. GatewayTab — Bridge-settings link gets link-out icon, lose primary styling
Currently looks like a primary action; it's a navigation away.
- **Files:** `src/components/settings/GatewayTab.vue:147-155`
- **Effort:** trivial
- **Decision:** ✅ Work

---

## Execution Sequence (decided)

All 25 tasks triaged ✅ Work. Variant choices: T6 time only, T10 BottomBar slot, T12 include Themes, T13 separate tabs (Power/Water/Brewing), T19 drop free-text burrs.

Sequenced into 6 PRs by dependency:

### PR 1 — Primitives + zero-risk quick wins
- **T7** `SettingsToggle.vue` (iOS-knob, `role="switch"`, 44px+ target)
- **T8** `SettingsSection` + `SettingsRow` primitives (gradual adoption starts here)
- **T1** Gateway → Bridge label
- **T4** Copy fixes pass
- **T9** Tab-strip keyboard nav + overflow indicator
- _Rationale:_ primitives unblock the structural refactors that follow; copy/label changes are free.

### PR 2 — Safety pass
- **T5** Inline confirm pattern across BeansTab, GrindersTab, LayoutTab, ThemesTab
- **T6** Replace `type="time"` in PreferencesTab wake schedule (color picker still deferred)
- _Rationale:_ self-contained, independent of structural moves.

### PR 3 — Structural moves I (simple merges)
- **T2** Drop History tab, fold shot count into About
- **T11** Device + Gateway → "Bridge" tab (two sections)
- **T12** Layout + Screensaver + Themes → "Display" tab
- **T20** Themes Random/Reset to footer action bar (inside Display)
- **T21** All theme presets show color preview (inside Display)
- **T24** Screensaver type-specific config inline under selected type
- **T25** Bridge-settings external link gets link-out icon, demoted from primary
- _Rationale:_ contained structural moves; per-tab polish lands inside the merged tabs at the same time.

### PR 4 — Preferences split + tab reorder
- **T13** Split Preferences → Power / Water / Brewing tabs
- **T3** Move misplaced toggles (`lingerOnEspressoPage`, `showGrinderRpm`, `showBasketData`, `visualizerShowAfterShot`, `defaultShotRating`) into the new Brewing tab
- **T14** Reorder TABS by intent (Brewing setup → Appearance → System → About; lift Accessibility)
- _Rationale:_ T3 needs Brewing tab to exist; reorder lands once the final tab set is known.

### PR 5 — Catalog destination
- **T10** Beans + Grinders → 5th BottomBar slot "Catalog" with sub-tabs; `/settings/beans` + `/settings/grinders` redirects
- **T17** BeansTab create-bean modal/sheet
- **T18** BeansTab empty-batch CTA
- **T19** GrindersTab drop free-text `burrs`; keep `burrSize` + `burrType`; backfill or display-only fallback for existing records
- _Rationale:_ largest blast radius; catalog polish lands together with the move.

### PR 6 — Remaining polish
- **T15** AboutTab: promote "Check for Updates" to primary
- **T16** AccessibilityTab: inline test buttons next to their toggles
- **T22** VisualizerTab: promote "Save to Plugin", demote "Test Connection"
- **T23** VisualizerTab: humanize "Last upload" (relative time + link to shot)
- _Rationale:_ independent cleanup; can ship anytime after PR 1.

## Open follow-ups (parked)

- **T6 color picker** — design call on ThemesTab `type="color"` replacement (hex-only text input vs custom picker). Pick before PR 3 if Themes folds into Display.
- **T19 burr backfill** — if existing records have only free-text `burrs` filled (e.g. "63mm flat"), decide: best-effort parse into size+type, or migration prompt on grinder edit.

## Risks Carried Over

- Settings storage keys are persisted on the gateway under `/api/v1/store/decenza-js/{key}`. **Never rename keys.** Tab IDs (`id` field in TABS array) drive `/settings/<id>` deep-links — preserve or add router redirects when removing/renaming.
- Playwright screenshots in `tests/e2e/screenshots.spec.js` cover settings tabs. Expect regen after structural changes — review intent before regenerating.
