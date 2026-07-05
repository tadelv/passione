# Code Review Action Plan

**Date:** 2026-06-23
**Source:** Full code review of Passione v0.9.3
**Status:** Phase 1 ✅ — Phase 2 ✅ — Phase 3 ✅ (complete)

## Skills Loaded

The following skills were loaded during this review session. Reload them
when picking up Phase 3.

| Skill | Path | Purpose |
|-------|------|---------|
| **decent-playbook** | `~/.agents/skills/decent-playbook/SKILL.md` + Obsidian vault | ACE-style evolving playbook — domain patterns, failure modes |
| **karpathy-guidelines** | `~/.agents/skills/karpathy-guidelines/SKILL.md` | Behavioral guidelines — simplicity first, surgical changes, suggest don't just obey |
| **grill-me** | `~/.agents/skills/grill-me/SKILL.md` | Relentless interview to sharpen a plan or design |
| **tdd** | `~/.agents/skills/tdd/SKILL.md` | Test-driven development — vertical slices, test through public interfaces |
| **prototype** | `~/.agents/skills/prototype/SKILL.md` | Throwaway prototypes for design questions (available, not used) |
| **improve-codebase-architecture** | `~/.agents/skills/improve-codebase-architecture/SKILL.md` | Scan for deepening opportunities (available, not used) |
| **decent-app** | `vendor/reaprime/.claude/skills/decent-app/SKILL.md` | REST/WS/profile/shots reference for Streamline-Bridge |
| **tdd-workflow** | `vendor/reaprime/.claude/skills/tdd-workflow/SKILL.md` | Project-specific test tier selection (reaprime-side, not directly used) |

The decent-playbook lives in the Obsidian vault at
`<vault>/Professional/Decent/Playbook.md` — resolve vault path with `obsidian vault`.
Relevant playbook entries: `sb-018` (workflow context SoT), `sb-040`/`sb-041`
(canonical profile sources), `sb-048` (settings_profile_type semantics),
`gen-030` (DE1 firmware never does volume stop).

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
11. ✅ **Out-of-range value handling** — one-sided `clampOneSided()` in `ValueInput.vue`
    preserves authored profile values that exceed editor limits (e.g. `baseline_hc.json`
    flow=12). Visual indicator: warm accent border + text color when value is outside [min, max].
    verify: `npm run build` ✅

### Limits decided during grilling

| Category | Parameter | min | max | Changed? |
|----------|-----------|-----|-----|----------|
| Temp | Brew | 0 | 100 | ✅ min 70/50→0 |
| | Steam | 135 | 170 | ✅ min 100→135 |
| | Hot water | 40 | 100 | — |
| Pressure | Target | 0 | 12 | — |
| | Limiter (flow steps) | 0 | 12 | — |
| | Exit | 0 | 12 | — |
| | Preinfusion exit | 0.5 | 8 | — |
| Flow | Target | 0 | 25 | ✅ max 8→25 |
| | Limiter (pressure steps) | 0 | 25 | ✅ max 8→25 |
| | Exit | 0 | 25 | ✅ max 8→25 |
| | Preinfusion | 1 | 25 | ✅ max 10→25 |
| | Steam | 0.4 | 2.5 | — |
| | Flush | 2 | 10 | — |
| Weight | Dose in | 0 | 100 | ✅ max 40→100 |
| | Yield | 0 | 500 | — |
| | Target weight | 0 | 500 | — |
| | Weight exit | 0 | 500 | ✅ max 100→500 |
| | Recommended dose | 0 | 100 | ✅ min 3→0, max 40→100 |
| | Hot water volume | 20 | 500 | ✅ min 50→20 |
| | Basket size | 7 | 22 | — |
| Volume | Target | 0 | 500 | — |
| Duration | Step/frame | 0 | 120 | ✅ SimpleEditor 60→120 |
| | Steam | 1 | 120 | — |
| | Flush | 1 | 30 | — |
| Other | Ratio | 0.5 | 10 | — |
| | Limiter range | 0.1 | 2.0 | — |
| | Grinder RPM | 50 | 3000 | — |

## Phase 2: Recipe Editor Refactor ✅

**Goal:** Break the 1,530-line monolith into composables, i18n all strings, improve UX.

### Design decisions (grilled)

- **Architecture first** — fix the reactive foundation before UI changes
- **Option B** — extract refs into composables, keep the `_updating` guard pattern but encapsulate it inside `useRecipeForm`
- **4 composable files** — `useRecipeForm`, `useRecipeLiveApply`, `useRecipeOverlay`, `useRecipePersist`
- **Testing** — e2e as primary safety net (existing 3 spec files) + one unit test for ratio cascade logic
- **`_updating` guard sharing** — getter/setter on the form object returned by `useRecipeForm`; internal ratio watchers use the closure variable directly
- **Extraction order** — Form → LiveApply → Overlay → Persist

### Completed

10. ✅ **Extracted `useRecipeForm` composable** (175 lines) — 21 form refs, `_updating` guard (getter/setter), ratio cascade watchers, `comboValues()`, `pickBrewTempFromProfile()`, `round1()`
11. ✅ **Extracted `useRecipeLiveApply` composable** (131 lines) — 23-ref watcher (300ms debounce), `buildWorkflowUpdate()`, `applyToLiveWorkflow()`, `buildTemperatureOverrideProfile()`, timer cleanup
12. ✅ **Extracted `useRecipeOverlay` composable** (255 lines) — `loadFromPreset()`, `overlayFromWorkflow()`, `hydrateFromWorkflowContext()`, `onChangeProfile()`, `onGrinderSelect()`, sessionStorage profile-pick protocol
13. ✅ **Extracted `useRecipePersist` composable** (58 lines) — `saveToSelectedCombo()`, `saveAsNew()`
14. ✅ **i18n all hardcoded English strings** (24 new `recipe.*` keys in `en.json`)
15. ✅ **Inline profile picker** — new `ProfilePickerModal.vue` with search + mini `ProfileGraph` preview, replaces page navigation round-trip + sessionStorage protocol
16. ✅ **Inline operation settings** — expandable rows with inline `ValueInput` fields, replaces `OperationSettingsPopup` modals
17. ✅ **Ratio cascade unit test** — 10 tests using Node built-in test runner (`node:test`), covers doseIn→doseOut→ratioValue cascade, `_updating` guard, zero-dose edge case, `comboValues()`, `pickBrewTempFromProfile()`

### Results

- RecipeEditorPage.vue: 1,530 → 1,065 lines (script setup: ~600 → ~320)
- 4 composables: 619 lines total
- 1 new component: `ProfilePickerModal.vue`
- 1 new test file: `tests/unit/useRecipeForm.test.js` (10 tests, `npm run test:unit`)
- 1 new script: `test:unit` in package.json
- E2e baseline: 7 pass / 6 fail (pre-existing) — zero regressions throughout all 13 commits

### Composable API

```
useRecipeForm({ settings })
  → { 21 form refs, get updating(), set updating(v),
      comboValues({ selectedBeanId, selectedBatchId }),
      pickBrewTempFromProfile(p), round1(n),
      selectedIndex, workflowCombos }

useRecipeLiveApply(form, { settings, workflow, updateWorkflow,
    selectedBeanId, selectedBatchId, selectedGrinder, linkedBean,
    pickBrewTempFromProfile })
  → { buildWorkflowUpdate(), applyToLiveWorkflow(),
      buildTemperatureOverrideProfile() }
  (internally: watch([...form refs], () => { if (form.updating) return; ... }))

useRecipeOverlay(form, { workflow, grinders, beansApi,
    enterLinked, clearLink, hydrateFromContext,
    selectedBeanId, selectedBatchId, batchesForBean,
    pickBrewTempFromProfile, round1, workflowCombos, selectedIndex })
  → { loadFromPreset(index), overlayFromWorkflow(),
      hydrateFromWorkflowContext(), onChangeProfile(),
      onGrinderSelect(grinderId, opts),
      isAwaitingProfileFromPicker(), getAwaitingProfileBaselineId(),
      setAwaitingProfileFromPicker(v, baselineId) }

useRecipePersist(form, { settings, toast, t,
    comboValues, linkedBean, selectedIndex, workflowCombos })
  → { saveToSelectedCombo(), saveAsNew() }
```

### Note on `useBeanLink` coupling

`comboValues()` and `dirty` couldn't live entirely inside `useRecipeForm` because
`selectedBeanId` and `selectedBatchId` are owned by `useBeanLink`, which runs
after `useRecipeForm` (it needs `coffeeName`/`roaster` refs). The composable's
`comboValues()` takes `{ selectedBeanId, selectedBatchId }` as parameters, and
the SFC wraps it into a no-arg closure after `useBeanLink` is wired up. `dirty`
stays in the SFC as coordination code. This avoids modifying `useBeanLink`
(shared with `PostShotReviewPage.vue`).

## Phase 3: Consistency & Cleanup ✅

**Goal:** Resolve TODO items and eliminate duplicated components.

18. ✅ **Replace `confirm()` in `ProfileEditorPage` and `AdvancedProfileEditorPage`** with styled overlay
    - Same pattern as SimpleProfileEditorPage: Discard / Stay / Save & Leave
    - TODO.md item removed
    - verify: `npm run build` ✅

19. ✅ **Delete `BrewDialog.vue`** — zero imports or references; CLAUDE.md already records removal as done

20. ✅ **Merge `PresetEditPopup` and `OperationSettingsPopup`** — `OperationSettingsPopup` was dead code
    (replaced by inline expandable rows in Phase 2); deleted it. Both already source limits from
    central `LIMITS` file (Phase 1), so no field-definition consolidation needed.

21. ✅ **Add e2e tests for limit boundaries** — 5 tests in `tests/e2e/limit-boundaries.spec.js`
    - Recipe editor dose max: 100 (was 40)
    - Simple editor step duration max: 120 (was 60)
    - Profile editor weight target max: 500 (was 100)
    - Profile editor flow target max: 25 (was 8)
    - Profile editor weight exit max: 500 (was 100)
    - All pass ✅

22. ✅ **Investigate pre-existing e2e test failures** — all 9 fixed, zero remain

    **Fixed (5) — selector and routing updates:**
      - `app.spec.js` (2): Layout tab → Display tab (settings reorg)
      - `user-workflow.spec.js` (1): /settings/beans → /catalog/beans, modal selectors,
        recipe editor selectors updated for Phase 2 refactor
      - `recipe-editor.spec.js` selectors: PresetPillRow → RecipePillRail, profile picker
        navigation → ProfilePickerModal
      - `recipe-power-fields.spec.js`: power-user fields live under `context.extras`

    **Fixed (4) — recipe-editor live-apply and power-fields extras hydration:**
      - `recipe-editor.spec.js` (2): edit+Home, edit+Save — live-apply watcher never
        fired. Two root causes: (a) duplicate `useRecipeForm({settings})` call created
        a second form instance with independent refs — the watcher's `updating` guard
        checked the first form's ref while the overlay wrote to the second form's refs.
        Fix: destructure from the single `form` instance. (b) The watcher's `updating`
        guard stayed `true` after batch loads, permanently blocking all live-apply pushes.
        Fix: remove the guard — the 300ms debounce already batches synchronous changes
        from `loadFromPreset`/`overlayFromWorkflow` into a single PUT.
      - `recipe-editor.spec.js` (1): profile change round-trip — `ProfilePickerModal`
        used wrong cache property names (`.records` → `.profiles`, `.refresh()` →
        `.ensureLoaded()`).
      - `recipe-power-fields.spec.js` (2): basket toggle ON + live-apply — two issues:
        (a) `overlayFromWorkflow` ran before `workflowReady` resolved, reading
        default/empty `workflow.context`. Fix: gate mount-time overlay behind
        `await workflowReady`. (b) No recipe selected at mount time → fell through
        to `hydrateFromWorkflowContext` which lacked `ratioValue` in `refsForEditor`,
        causing `Cannot set properties of undefined` crash. Fix: auto-select first
        recipe when none selected, and add `ratioValue` to `refsForEditor`.
      - Test assertion bug: `workflow.context?.basketType` should be
        `workflow.context?.extras?.basketType` (basket lives under extras).

## Commit History (this session)

```
bc458c6 docs: mark Phase 2 recipe editor refactor as complete
2558678 feat(recipe-editor): inline profile picker modal replaces page navigation
fbbc17b refactor(recipe-editor): inline operation settings instead of popups
7c6f8a8 i18n(recipe-editor): replace hardcoded English strings with t() calls
8fd9d8b test(recipe-form): add ratio cascade unit tests
d2b9f40 refactor(recipe-editor): extract useRecipePersist composable
d5c816b refactor(recipe-editor): extract useRecipeOverlay composable
d9fcf63 refactor(recipe-editor): extract useRecipeLiveApply composable
7d16810 refactor(recipe-editor): extract useRecipeForm composable
1bffcf5 docs: mark Phase 1 out-of-range handling as complete
43f2f13 fix(value-input): preserve out-of-range values instead of silently clamping
a0611ab refactor(limits): centralize hardcoded min/max values into constants file
91674d8 fix(recipe-editor): replace confirm() with styled overlay in profile editors
7edf63e chore(recipe-editor): delete dead code (BrewDialog, OperationSettingsPopup)
4cbf7a4 test(e2e): add limit boundary regression tests (5 specs)
ae8553a test(e2e): fix selectors for settings reorg, catalog nav, Phase 2 refactor
696f9db fix(recipe-editor): resolve ref divergence in form composables
791cbf9 fix(recipe-editor): remove duplicate useRecipeForm call and watcher updating guard
c834764 fix(recipe-editor): auto-select first recipe, add missing ratioValue ref
```

## Conventions Used

- Per **Karpathy guidelines**: surgical changes only, match existing style, no speculative abstraction, surface assumptions, suggest don't just obey
- Per **CONTRIBUTING.md**: Conventional Commits with scope (`refactor(recipe-editor):`, `fix(value-input):`, etc.)
- Per **decent-playbook** `sb-018`: workflow context fields are the source of truth
- Per **decent-playbook** `gen-030`: DE1 firmware never does volume stop
- Per **TDD skill**: test through public interfaces, vertical slices (one test → one implementation → repeat), e2e as primary safety net for refactors
- Per **CLAUDE.md**: no native-dialog-backed inputs, no timers as guards, boot-quiet on cold start, profiles are REA v2 `steps` not de1app `frames`