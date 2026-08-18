# Decaid Bengle API parity plan

**Date:** 2026-08-18
**Status:** Implemented
**Scope:** Fix Bengle scale telemetry, adopt current Bengle capability APIs, and expose supported Bengle features in Passione.

## Sources reviewed

- Decaid OpenAPI diff from Passione's recorded submodule commit `feb1427f` to current vendor commit `362f11d`:
  - `vendor/reaprime/assets/api/rest_v1.yml`
  - `vendor/reaprime/assets/api/websocket_v1.yml`
- Decaid implementation and device contract:
  - `vendor/reaprime/doc/Api.md`
  - `vendor/reaprime/doc/DeviceManagement.md:730-757`
  - A013 telemetry commits `68b3c110` and `633f6f68`
  - Current-firmware feature commits `0d25645b`, `27185ffc`, `1fb6db2e`, `76e7c37c`, and `0710bfe8`
- Passione scale/device flow:
  - `src/App.vue:42-44,68,202`
  - `src/composables/useScale.js:18-76`
  - `src/composables/useDevices.js:27-58`
  - `src/components/LayoutWidget.vue:308-320`
  - scale-gating commit `ef67d84`
- Read-only checks against `http://de1tablet.home:8080` on 2026-08-18.

## Findings

### 1. Scale root cause

The live Bengle exposes working scale data:

- `/ws/v1/scale/snapshot` opens successfully.
- It first emits `{"status":"connected"}`.
- It then emits snapshots such as `{"weight":0.0,"weightFlow":0.01,"battery":100,...}`.

At the same time, both `GET /api/v1/devices` and `/ws/v1/devices` report:

```json
{
  "name": "Bengle scale",
  "id": "bengle-internal-F2:5C:EB:CF:54:9F",
  "state": "disconnected",
  "type": "scale",
  "available": false
}
```

Passione calls `useScale(devices.scaleConnected)` (`src/App.vue:44`). Since `useDevices.scaleConnected` only accepts a scale device whose state is `connected` (`src/composables/useDevices.js:50-52`), Passione never opens the working scale socket.

This is also contrary to the scale WebSocket contract, which says clients keep `/ws/v1/scale/snapshot` open across scale connection cycles and use its `connected` / `disconnected` status frames (`vendor/reaprime/assets/api/websocket_v1.yml:54-66,481-513`). That contract already existed at the old vendor commit; the April optimization in `ef67d84` introduced the regression.

**Required fix:** stop using the device list to gate scale telemetry. Keep the scale socket open after the boot-ready gate and derive scale connection state from its own status/snapshot frames.

### 2. A013 data is deliberately split across existing APIs

Current Decaid decodes Bengle's A013 packet once and fans it into existing abstractions (`vendor/reaprime/doc/DeviceManagement.md:738-753`):

- Machine pressure/flow/temperature remains on `/ws/v1/machine/snapshot`.
- Integrated weight and firmware gravimetric flow use `/ws/v1/scale/snapshot`.
- Milk-probe temperature uses `/ws/v1/sensors/<id>/snapshot`.

Passione should not add a second weight source from the machine stream. The unified scale stream is the correct source for DE1 scales and Bengle's integrated scale.

The live sensor API currently returns a Bengle probe:

```json
{
  "id": "F2:5C:EB:CF:54:9F-milkprobe",
  "info": {
    "name": "Bengle Milk Probe",
    "vendor": "DecentEspresso",
    "data": [{"key":"temperature","type":"number","unit":"°C"}]
  }
}
```

Its WebSocket streams live values (observed `27.25°C`). Live Decaid requires the BLE-colon ID to remain unescaped in the WS path; percent-encoding the whole path segment returns `{"error":"not found"}`. Build the URL from the trusted server-returned ID with `encodeURI`, not `encodeURIComponent`.

### 3. Relevant REST additions and changed contracts

Semantic comparison of `rest_v1.yml` found these user-facing Bengle changes:

| Surface | Current contract | Passione today |
|---|---|---|
| `GET /machine/capabilities` | Compatible Bengle returns all seven tokens: `cupWarmer`, `integratedScale`, `stopAtWeight`, `ledStrip`, `scaleCalibration`, `preheat`, `wakeSchedule`; plain DE1/outdated Bengle returns `[]` (`rest_v1.yml:388-403,5303-5337`) | Not called |
| `GET/PUT /machine/cupWarmer` | State now includes setpoint, RAM-only manual `enabled`, and live `currentTemperature`; explicit `enabled:false` preserves setpoint (`rest_v1.yml:405-456,5339-5378`) | No client/UI |
| `GET/PUT /machine/cupWarmer/preheat` | Firmware-owned scheduled pre-warm with `enabled`, `leadMinutes` 0-120, and read-only `active` (`rest_v1.yml:457-504,5380-5405`) | No client/UI |
| `GET/PUT /machine/ledStrip` | Firmware-persisted front/back awake/sleep palettes; `frontSwitch` is derived/read-only; commit is now a compatibility no-op; reset is a truthful re-read (`rest_v1.yml:505-613,5407-5445`) | No client/UI |
| `GET/PUT /machine/scaleCalibration` | Async `zero`, `latch`, `abort`; latch needs 1-10000 g; returns 202 accepted or 409 rejected with state (`rest_v1.yml:614-697,5447-5516`) | No client/UI |
| Presence schedules | Existing `/presence/*` writes now sync automatically to Bengle firmware wake windows and inactivity timeout | Passione already has the required Power UI |
| Integrated SAW | Existing `WorkflowContext.targetYield` is reflected into Bengle firmware | Passione already writes target yield; verify only |

The live Bengle returned all seven capabilities and valid read responses from cup warmer, preheat, LED, and scale-calibration endpoints.

### 4. Additional API drift found while reviewing the spec

`GatewayTab.vue` does not match the current settings schema:

- It reads/writes `weightMultiplier` and `flowMultiplier`; Decaid exposes `weightFlowMultiplier`, `volumeFlowMultiplier`, and `hotWaterFlowMultiplier` (`rest_v1.yml:6023-6035`).
- Its log-level values are lowercase `debug/info/warn/error`; Decaid uses Java logging names such as `FINE`, `INFO`, `WARNING`, and `SEVERE`.
- New booleans `blockTareDuringShot` and `keepAwake` are not exposed (`rest_v1.yml:6050,6095`).

This is not the Bengle scale root cause, but it belongs in the API-parity pass because the current controls display incorrect defaults and can send unsupported fields.

### 5. New Decaid APIs that are not needed for this task

The same vendor range also added managed firmware catalog/apply/cancel, DE1 sensor calibration, plugin source writes, replay/debug endpoints, Derek streaming, richer sync results, and new settings/shot schemas. Do not add unused client wrappers or UI now. Add them only with a concrete Passione feature.

## Execution plan

### Phase 1 — Fix scale telemetry first

**Files:** `src/composables/useScale.js`, `src/App.vue`, `src/components/LayoutWidget.vue`, `tests/mock-server.js`, one focused test.

1. Remove `devices.scaleConnected` as the `useScale` enable source.
2. Open the scale socket once after `bootReady()` and leave it open until app teardown, matching Decaid's contract and Passione's cold-boot radio rule.
3. Parse frames by shape:
   - `status: connected` → `isConnected = true`.
   - `status: disconnected` → clear connection state and stale readings.
   - snapshot with `weight` → update telemetry and mark connected.
   - transport close → mark disconnected; let `ReconnectingWebSocket` reconnect.
4. Provide/watch `scale.isConnected` from `App.vue` for the scale widget and connection toast. Keep device-list state only for scan/connect UI.
5. Update the mock scale contract: status frame, `battery` rather than stale `batteryLevel`, and device-provided `weightFlow`.
6. Add a regression check where the devices feed has no connected scale but the scale socket emits connected + snapshot; the UI must show scale data, not “No scale”.

**Verify:** `npm run test:unit`, focused Playwright test, `npm run build`, then read-only smoke against the live Bengle. Confirm one persistent scale WS, current weight/flow/battery, tare button availability, and no reconnect churn.

### Phase 2 — Add capability discovery and REST wrappers

**Files:** `src/api/rest.js`, new `src/composables/useMachineCapabilities.js`, `src/App.vue`, tests.

1. Add only the wrappers needed now: capabilities, cup-warmer state/update, preheat state/update, LED get/update/reset, and scale-calibration get/command.
2. Preserve structured HTTP errors in `sendCommand` (`status` and parsed body) so 404/409/503 can produce correct UI states instead of generic failures.
3. Add one singleton capability composable. Refresh after each machine connect/reconnect, reset on disconnect, and gate the first fetch behind `bootReady()`.
4. Use capability tokens as the UI contract. Do not infer support from model name alone. If machine info says Bengle but capabilities are empty, show an outdated-firmware/unavailable state rather than partial controls.

**Verify:** mock `[]` and full capability sets; reconnect refresh must not let an older request overwrite newer state.

### Phase 3 — Expose Bengle controls in one conditional settings tab

**Files:** new `src/components/settings/BengleTab.vue`, `src/pages/SettingsPage.vue`, `src/i18n/locales/en.json`, REST mock/tests.

Use one conditional **Bengle** tab rather than scattering new controls across existing tabs. This keeps the diff and discovery path small; the tab appears only when at least one Bengle capability is advertised.

Sections:

1. **Cup warmer** (`cupWarmer`, `preheat`)
   - Manual enable, whole-degree 0-80°C setpoint, current mat temperature.
   - Scheduled pre-warm enable, 0-120 minute lead, read-only active state.
   - Preserve the important API distinction: disabling manual heat must send `enabled:false` without zeroing the stored setpoint.
2. **Lighting** (`ledStrip`)
   - Editable front/back awake/sleeping palettes.
   - Show derived front-switch colours read-only.
   - Use plain validated hex inputs and swatches; do not use `input type="color"` because native dialogs reload the Android WebView.
   - Save is already persistent; do not call the no-op commit endpoint. “Reload from machine” calls reset.
3. **Integrated-scale calibration** (`scaleCalibration`)
   - Show current step, detected cell, sub-state, remaining seconds, and status.
   - Explicit actions for precision zero, weighted latch, and abort.
   - Validate known mass before the request and display a 409 rejection reason/state.
   - Poll only while a calibration step is active; stop at a terminal/idle state or when the tab deactivates.

GET on tab activation and after mutations. Poll current cup-warmer temperature only while this tab is active if field testing shows the static refresh is insufficient.

**Verify:** tab absent on DE1/empty capabilities; each section gated by its token; request payloads and 404/409/503 states covered; 44px controls, keyboard focus, labels, and reduced-motion behavior retained.

### Phase 4 — Expose the Bengle milk probe and stop-at-temperature

**Files:** new `src/composables/useMilkProbe.js`, `src/pages/SteamPage.vue`, steam workflow/settings/recipe helpers, mock/tests.

1. After boot readiness, discover `/api/v1/sensors` and select the server-declared `Bengle Milk Probe`.
2. Subscribe to its snapshot socket using the returned ID without percent-encoding colons; close/re-discover across machine changes.
3. Show live milk temperature on `SteamPage` only when a probe is present.
4. Expose `steamSettings.stopAtTemperature` (0 disables; current API range 0-80°C) in live steam settings and saved recipe steam settings so the value survives normal Passione workflows.
5. Keep stop behavior in Decaid/Bengle firmware; Passione only writes the workflow target and displays telemetry.

**Verify:** sensor absent/present/reconnect cases, live temperature update, target round-trip, disabled value `0`, and recipe save/load.

### Phase 5 — Correct adjacent gateway-settings drift

**Files:** `src/components/settings/GatewayTab.vue`, REST mock/tests.

1. Rename controls to current schema fields: weight-flow, volume-flow, and hot-water-flow multipliers.
2. Use current log-level enum values.
3. Expose `blockTareDuringShot` and `keepAwake` only if useful alongside the existing scale/power controls.
4. On write failure, restore the prior value and show a toast instead of silently leaving optimistic stale state.

**Verify:** load the live settings response without fallback defaults; assert each write uses a schema-valid key/value.

### Phase 6 — Integration and live hardware verification

1. Run `npm run test:unit`, `npm run test:e2e`, and `npm run build`.
2. Do not include the already-modified `docs/screenshots/*.png` in implementation commits unless screenshots are intentionally regenerated and reviewed.
3. Test against `de1tablet.home:8080` with per-invocation `VITE_GATEWAY_URL` / `VITE_WS_URL`, overriding `.env.local`.
4. Read-only verify capabilities and all Bengle GETs first.
5. With the machine owner present, verify controlled writes in this order: cup-warmer enable/setpoint/disable, preheat toggle, LED save/reload, tare, milk stop target. Run physical scale calibration last because it changes hardware calibration state and requires both load-cell steps.
6. Verify plain DE1 behavior with the mock server: no Bengle tab, normal external-scale telemetry unchanged, and no extra network burst before `bootReady()`.

## Suggested commit sequence

1. `fix(scale): follow persistent scale websocket contract`
2. `feat(api): add Bengle capability clients`
3. `feat(bengle): add capability-gated settings`
4. `feat(bengle): show milk probe telemetry`
5. `fix(settings): align with Decaid schema`
6. `test(bengle): cover current Decaid surfaces`
7. `chore(vendor): update Decaid and Decenza pointers`

Keep the user's unrelated screenshot modifications out of these commits.

## Success criteria

- Bengle weight, firmware gravimetric flow, battery, tare, shot graph, progress, and scale widget all work through `/ws/v1/scale/snapshot` even when `/ws/v1/devices` labels the virtual scale disconnected.
- Passione keeps one scale socket open across status changes and derives connection state from scale status frames.
- Plain DE1/external-scale behavior remains unchanged.
- Compatible Bengle exposes cup warmer, pre-warm, LEDs, calibration, wake schedule behavior, integrated SAW, and milk-probe temperature through capability/sensor-driven UI.
- Unsupported/outdated machines do not see dead controls.
- No new cold-boot network burst, native-dialog input, duplicate telemetry source, or speculative wrappers for unused APIs.
