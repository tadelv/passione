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

- [ ] **Handle out-of-range values on load** — display actual value even if > max, don't silently clamp (e.g. `baseline_hc.json` flow=12)

## Phase 2: Recipe Editor Refactor

**Goal:** Break the 1,530-line monolith into composables, i18n all strings, improve UX.

### Tasks

10. **Extract `useRecipeForm` composable** — form refs + linked ratio watchers + dirty tracking
11. **Extract `useRecipeLiveApply` composable** — buildWorkflowUpdate + applyToLiveWorkflow + the watcher
12. **Extract `useRecipePersist` composable** — comboValues + saveToSelectedCombo + saveAsNew
13. **Extract `useRecipeOverlay` composable** — loadFromPreset + overlayFromWorkflow + sessionStorage protocol
14. **Convert 23 individual refs to a single reactive form object** with one watchEffect
15. **i18n all hardcoded English strings** in the recipe editor template
16. **Inline profile picker** (modal with search + mini graph) instead of page navigation
17. **Inline operation settings** (expandable rows instead of popups)

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