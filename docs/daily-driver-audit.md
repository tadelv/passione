# Daily-driver audit — 2026-09-05

Baseline: Passione `d76dd9b` (0.9.5). One bounded audit pass: home, operation controls/navigation, recipe/workflow persistence, shot history/repeat, telemetry/chart performance, and gateway contracts. Not a claim of exhaustive coverage. All reproduction uses the local mock, never physical machine commands.

`vendor/reaprime`: ran `git pull --ff-only origin main`; already current at `a21c0145` (origin is `decentespresso/decaid`). The parent repository pins older `362f11d`; the working-tree submodule pointer is now `a21c0145` and should be included with this audit.

## Fix queue

### 1. P0 — failed Stop hides the running operation

`src/pages/EspressoPage.vue:stopAndGoBack` navigates home even when the idle PUT rejects. Reproduced with HTTP 503: machine remains `espresso`, URL becomes `/#/`, Stop disappears. Home start handlers likewise navigate on failure; operation-page and keyboard errors are swallowed. Modifier shortcuts can also turn browser commands (Ctrl/Cmd+W etc.) into machine commands.

Acceptance: failed commands are visible and retryable, failed Stop keeps controls; no optimistic start navigation; accepted requests use observed machine state for navigation. Do not put emergency Stop behind a pending start lock. Retain unmodified appliance shortcuts but ignore browser modifier chords/repeat events and respect handled events. Mock regression tests before implementation.

### 2. P1 — reopening the skin overwrites live workflow

`src/App.vue:applySelectedComboOnBoot` interprets divergence as permission to reload the saved recipe. Reproduced: live 20g/40g becomes saved 18g/36g merely by opening another skin page. This contradicts the explicit-save model and can write during an operation. Separately, `useRecipeLiveApply` no longer checks `refs.updating`, so slow asynchronous recipe hydration can emit intermediate/default form values; its timer remains non-null after firing and causes redundant unmount writes.

Acceptance: gateway workflow wins on startup; selected recipe remains a comparison baseline. Hydration is read-only even if lookups take longer than debounce; genuine edits still flush on exit and surface failed persistence without toast spam. Preserve saved recipes.

### 3. P1 — recipe/shot loading mixes identities and parameters

`useComboApply.buildComboUpdate` omits `selectedBatchId`/`selectedGrinderId` and `brewTemperature`; matching profile titles can hide different execution content. `LayoutWidget.repeatLastShot` omits IDs; history Load suppresses grinder setting when grinderId is present. Since workflow PUT deep-merges, omitted IDs retain a previous coffee/grinder's association. `useWorkflow.applyData` ignores explicit null clears. The same loaded shot can therefore show different next-shot parameters depending on entry point.

Acceptance: saved recipe loads authoritative entity links and its temperature curve override; explicit unlinks clear IDs locally and remotely without clearing omitted fields. Repeat and History Load use the same payload construction, retain grinder setting with linked grinders, and resolve linked coffee text for the live home display. No machine operation starts. Lookup failure must not publish mixed identities. Minimal shared helper(s), not a widget framework.

### 4. P1 — espresso timer omits preinfusion

`useMachine` starts all operation timers only at `pouring`; `useShotData` and saved-chart normalization anchor espresso at `preinfusion`. Espresso time and phase timeline thus undercount extraction and disagree with chart elapsed. Timer watchers also observe state/substate separately, making transitions with unchanged substate fragile.

Acceptance: espresso clock starts at preinfusion (or pouring when preinfusion absent), excludes preheat, freezes at pouringDone; steam/water/flush still start at pouring. Test repeated/direct transitions and mock preinfusion.

### 5. P1 — undersized home touch targets / keyboard Repeat

Measured targets fall below the repository's 44px minimum. A narrow last-shot card also inherits a full-width chart legend, and Repeat is nested in a keyboard-activated detail container. Apply a small accessibility/clarity pass: minimum target sizes, configured brew temperature in Shot Plan, compact legend, independent Repeat keyboard activation, and remove undefined preset bindings. Preserve all widget placements and storage.

## Home UX — keep the existing layout, improve its content first

Current seven widgets: Action Buttons, Shot Plan, Last Shot, Recipes, Navigation Buttons, Sleep Button, Scale Info. Six saved zones already support the core daily flow; no evidence warrants replacing their persistence model.

High-value next pass:
- **Touch targets:** measured at 1024×768: Tare 24px high, Repeat 28px, nav/Sleep 34px; coffee picker also compact. Raise to ≥44px without relocating the user's widgets.
- **Next-shot confidence:** retain coffee, dose/yield/ratio, grinder. Add configured brew temperature (distinct from actual heater temperature), and optional RPM/basket only when enabled. Explicit loading/failure status beats a success toast for a partially loaded recipe.
- **Last-shot usefulness:** show age/date and actual yield vs target, retain Repeat as load-only, distinguish loading/error/empty. Its full chart legend is excessive for a small card; compact/wrapping legend before a new widget type.
- **Readiness:** communicate disconnected/stale telemetry and missing scale separately from machine idle; do not equate idle with thermally ready. Current gateway shotState stream exposes sticky scaleLost (stop-at-weight disabled for the remainder of that shot).
- **Layout persistence:** load() runs on every home mount and falls back to defaults on transient GET failure; removed Sleep is reinserted by every validation because migration is not versioned. Address in a focused layout follow-up, preserving existing configurations.
- Screensaver/machine-power decoupling remains deliberately parked in `docs/deferred/screensaver-machine-decoupling.md`; this audit does not settle those design choices.

## Performance / API notes

- Baseline build succeeds: entry JS 283.64 kB (97.36 kB gzip); uPlot separately split at 52.27 kB (23.11 kB gzip). Unit suite passes, but pre-existing Vue lifecycle/watch-source warnings weaken the harness.
- Existing typed-array shot buffer and requestAnimationFrame drawing are appropriate; don't replace uPlot or add a cache framework. Buffer is bounded to 500 samples (about 50 seconds at 10Hz), so long shots lose their beginning. This is a data-retention UX limit, not measured CPU trouble.
- HistoryShotGraph normalizes twice per rebuild and deep-watches immutable shot records; candidates for measured cleanup. No tablet CPU/frame-time claim made from desktop mock runs.
- Removing startup workflow PUTs and redundant hydration/unmount writes is a concrete network win, especially on shared Wi-Fi/BLE hosts. Boot gating must remain intact.
- Current `/workflow` contract: FIFO independent deep-merged mutations; no server debounce, max 8 queued, 30s queue wait, 1 MiB bodies. Errors can follow partially applied machine writes; never report success after rejection.
- Current `/shots?ids=...` returns full records; paginated `/shots` and `/shots/latest` omit measurements. Existing query-based getShot is compatible. Server page size clamps to 100; cache requests 200 but advances by actual returned count (no skipped page).
- `/ws/v1/machine/shotState` now supplies stable shotId, decision/terminal reasons, scaleLost, and autonomous SAW. Current App guesses stop reasons from weight and runs duplicate latest-shot polling chains; a separate follow-up should consume authoritative events with older-gateway fallback. Do not claim a normal completion after disconnect.
- `useShotCache` derives the purported full ID list from its capped 200 summaries; visiting Auto Favorites before shot detail can truncate swipe navigation. Separate small correctness follow-up.

## Verification log

- Before fixes: `npm run test:unit`, `npm run build` pass.
- Mock reproduction: Stop 503 hides Stop while state remains espresso; startup replaces 20/40 with 18/36; recipe payload omits new batch/grinder IDs and temperature override.
- **#1 accepted, local commit `b3503fb`:** DeepSeek `deepseek-v4-flash` implemented user-command failure handling and keyboard guards. Supervisor rejected the first Stop watcher because a late response could create a watcher after unmount; worker corrected it to a setup-owned observed-state watcher. Descaling no longer fakes progress on rejection. Supervisor independently ran `npx playwright test command-errors.spec.js`: 11/11 pass. Worker additionally reported 110/110 baseline-regression e2e (excluding screenshots), then 36/36 focused after review; unit suite 40/40. No production machine testing.
- **#2 accepted, local commit `9266ec7`:** startup no longer writes saved recipes; read-only editor hydration waits for settings/workflow and preserves live operations even with no saved recipes. Supervisor required corrections for no-recipe operation resets, editable defaults during initialization, and pending-debounce writes during async hydration. Independent `reload-authority.spec.js` + `recipe-editor.spec.js`: 14/14 pass. Worker unit suite: 41/41. Intentional recipe profile/ID correctness stays in #3, not claimed fixed here.
- **#3 accepted, local commit `e2f0c71`:** shared recipe/shot payloads preserve links, legacy text and planned targets; explicit null clears are honored; temperature overrides preserve the curve, including same-ID profiles and numeric-string temperatures. Rejected several worker drafts until editor selection used detached validation, failed lookups made no PUT, busy forms were keyboard-inert, and real Repeat/History entry points produced identical payloads. Supervisor independently ran unit tests (0 failures), 12 recipe/reload tests and 6 final profile/Repeat/failure tests. Worker also verified the busy-keyboard test and production build. No-ID gateway echoes retain the selected catalog ID on subsequent Save. Remaining limitation: resolving catalog profile identity on initial startup (the gateway's raw Profile carries no ID) is not redesigned here; title-only legacy recipes remain ambiguous.
- **#4 accepted:** timer transitions now consume state/substate together from snapshots. Espresso includes preinfusion without resetting at pouring; other operations stay pouring-only; direct operation changes reset the clock even with an unchanged substate. The clock uses monotonic time and freezes at the final elapsed value. Supervisor independently verified the production build, 68/68 unit tests, and 9/9 espresso/steam timer + Repeat/History tests. Worker reported the new timer regression failed on the baseline. Its full nonscreenshot run had 134 passes and two Repeat/History failures that passed isolated reruns; full-suite stability is not claimed.
- **#5 remains open / unimplemented:** home touch targets, configured-temperature display, compact legend, and keyboard Repeat improvements are not included in this branch checkpoint.
- Existing `docs/screenshots/*.png` changes belong to the user and are excluded. Gateway reference updated to the audited `a21c0145755969056abad8c9851e13c32e330947`, available on its remote main branch.
- **#4 implemented (working tree, not committed):** espresso extraction timer now counts from `preinfusion` (pouring fallback when preinfusion is skipped) instead of pouring-only, continues without reset across preinfusion→pouring, excludes `preparingForShot`, and freezes at the exact final elapsed on `pouringDone`/exit (performance.now-anchored, monotonic). Replaced the split state/substate watchers in `useMachine` with a single `_onFlowChange` handler driven from `onMessage`, so a direct different-operation transition that leaves the substate unchanged (operation A/pouring → B/pouring) now resets and restarts B. Steam/hotWater/flush remain pouring-only; repeated identical snapshots never reset. Regression `tests/e2e/espresso-timer.spec.js` (deterministic: `page.routeWebSocket` feeds exact snapshot frames + `page.clock` fake time) ran red on baseline (3 failed: preinfusion counting, A→B same-substate restart, repeated-snapshot accumulation; 2 passed guard cases), then green 5/5 after the fix. Existing `steam-timer.spec.js` 2/2 green; unit suite 68/68; production build succeeds. Full e2e excluding screenshots: 134 passed, 2 flaky failures in audit-#3 `repeat-history-equivalence.spec.js` (workflow-PUT equivalence, unrelated to the timer) that pass 2/2 on every isolated rerun. No commit/push made.
