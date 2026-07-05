# Code Review Action Plan

**Date:** 2026-06-23
**Source:** Full code review of Passione v0.9.3

## Phase 1: Central Limits File + Data Integrity Fixes ✅

**Goal:** Eliminate hardcoded, duplicated, and inconsistent numeric limits across the codebase.

### Completed

1. ✅ **Created `src/constants/limits.js`** — single source of truth for all min/max bounds
2. ✅ **Fixed weight exit max** (100 → 500) in `ProfileEditorPage.vue` and `AdvancedProfileEditorPage.vue`
3. ✅ **Fixed flow max** (8 → 25) across all editors — Bengle future-proofing
4. ✅ **Fixed recipe brew temp min** (50 → 0) — open range for experimental profiles
5. ✅ **Fixed steam temp min** (100 → 135)
6. ✅ **Fixed dose in max** (40 → 100) in `RecipeEditorPage.vue` and `PostShotReviewPage.vue`
7. ✅ **Fixed recommended dose range** (3–40 → 0–100) in `SimpleProfileEditorPage.vue`
8. ✅ **Fixed simple step duration max** (60 → 120) in `SimpleProfileEditorPage.vue`
9. ✅ **Fixed hot water volume min** (50 → 20) in `OperationSettingsPopup.vue` and `PresetEditPopup.vue`
10. ✅ **Replaced all inline numeric limits with constants imports** across 8 files
    - `RecipeEditorPage.vue`, `ProfileEditorPage.vue`, `AdvancedProfileEditorPage.vue`
    - `SimpleProfileEditorPage.vue`, `OperationSettingsPopup.vue`, `PresetEditPopup.vue`
    - `SteamPage.vue`, `PostShotReviewPage.vue`
    - verify: `npm run build` succeeds ✅

### Remaining

- [x] **Handle out-of-range values on load** — one-sided clamp in ValueInput preserves authored values above/below editor limits; visual indicator (warm accent border + text) signals out-of-range state. verify: `npm run build` ✅

## Phase 2: Recipe Editor Refactor ✅

**Goal:** Break the 1,530-line monolith into composables, i18n all strings, improve UX.

### Completed

10. ✅ **Extracted `useRecipeForm` composable**
11. ✅ **Extracted `useRecipeLiveApply` composable**
12. ✅ **Extracted `useRecipeOverlay` composable**
13. ✅ **Extracted `useRecipePersist` composable**
14. ✅ **i18n all hardcoded English strings** (24 new recipe.* keys)
15. ✅ **Inline profile picker** (ProfilePickerModal component)
16. ✅ **Inline operation settings** (expandable rows instead of popups)
17. ✅ **Ratio cascade unit test** (10 tests, Node built-in test runner)

### Results

- RecipeEditorPage: 1,530 → 1,065 lines (script setup: ~600 → ~320)
- 4 composables: 619 lines total
- 1 new component: ProfilePickerModal
- 10 unit tests: all passing
- E2e baseline: 7 pass / 6 fail (pre-existing) — zero regressions throughout

## Phase 3: Consistency & Cleanup

**Goal:** Resolve TODO items and eliminate duplicated components.

18. **Replace `confirm()` in `ProfileEditorPage` and `AdvancedProfileEditorPage`** with styled overlay (TODO item)
19. **Delete `BrewDialog.vue`** if unused (CLAUDE.md says it was removed)
20. **Merge `PresetEditPopup` and `OperationSettingsPopup`** field definitions
21. **Add e2e tests for limit boundaries** (pour-over weight exit, large dose, long duration)

## Notes

- Phase 1 is the highest impact — data integrity bugs (silent clamping of valid profile values) affect users now
- Phase 2 is a large refactor — should be done incrementally, one composable at a time, with tests between each extraction
- Phase 3 items are lower risk and can be done independently
- Per Karpathy guidelines: surgical changes only, match existing style, no speculative abstraction
- Per decent-playbook: `sb-018` — workflow context fields are the source of truth; `gen-030` — DE1 firmware never does volume stop