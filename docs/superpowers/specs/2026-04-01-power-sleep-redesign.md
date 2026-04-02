# Power & Sleep Redesign

## Summary

Rewrite the Power & Sleep section of PreferencesTab to replace the repetitive 7-row-per-day schedule grid with schedule cards that group days naturally (weekday/weekend), wire auto-sleep to the server's presence API, and add heartbeat integration for presence tracking.

## Current Problems

1. **One schedule per day** — creates 7 separate API objects instead of using the API's multi-day grouping (`daysOfWeek: [1,2,3,4,5]`)
2. **Auto-sleep is local-only** — `autoSleepMinutes` saves to skin KV store but never syncs to `sleepTimeoutMinutes` on the presence API
3. **No heartbeat** — the skin never calls `POST /api/v1/machine/heartbeat` on user interaction, so the auto-sleep timer isn't reset by actual use
4. **No schedule deletion** — `deletePresenceSchedule` is imported but never called
5. **Silent error swallowing** — all API errors caught and ignored

## Design

### Auto-Sleep Row

A single row at the top with label and dropdown:
- Label: "Auto-sleep" with hint "Sleep after inactivity"
- Dropdown: Disabled / 15 min / 30 min / 45 min / 60 min
- **Syncs to server**: calls `updatePresenceSettings({ sleepTimeoutMinutes })` on change
- **Loads from server**: reads `sleepTimeoutMinutes` from `getPresenceSettings()` on mount, overriding any local value
- Remove `autoSleepMinutes` from local settings — this is now server-authoritative

### Wake Schedule Cards

Each schedule from the API renders as a card containing:

- **Time** (large, prominent) — tap opens native `<input type="time">` picker
- **Day pills** (M T W T F S S) — tap to toggle individual days on/off within this schedule. At least one day must remain selected (last active pill is non-togglable). Use long-press delete to remove the entire schedule.
- **Keep-awake badge** — shows "wake only" or "keep awake Xhr". Tap opens a small select dropdown (same pattern as other dropdowns in settings). Cycle-on-tap was considered but a dropdown is more discoverable and touch-friendly for this infrequently-changed value.
- **Enable/disable toggle** — switch on the right side of the card
- **Delete** — long-press (500ms) on the card shows a confirm action (consistent with Passione's long-press pattern)

All interactions save immediately to the API via `updatePresenceSchedule()`.

### Add Schedule Button

Dashed-border "+" button below the schedule cards. Creates a new schedule with sensible defaults:
- Time: 07:00
- Days: all 7 (empty array = every day in the API)
- Enabled: true
- keepAwakeFor: null

Calls `createPresenceSchedule()` and adds the returned schedule to local state.

### Heartbeat Integration

**Already implemented** in `src/composables/useAutoSleep.js` — sends heartbeats on user activity (pointerdown, keydown), syncs `autoSleepMinutes` to server, loads server settings on mount. No changes needed.

### Data Flow

**On mount:**
1. `getPresenceSettings()` → read `sleepTimeoutMinutes`, `userPresenceEnabled`
2. `getPresenceSchedules()` → read all schedules, store by ID

**Auto-sleep change:**
1. Update local state
2. `updatePresenceSettings({ sleepTimeoutMinutes: value })`

**Schedule edits (time, days, keepAwakeFor, enabled):**
1. Update local state immediately (optimistic)
2. `updatePresenceSchedule(id, updatedFields)`
3. On error: revert local state, show toast

**Add schedule:**
1. `createPresenceSchedule(defaults)` → get back object with ID
2. Add to local state

**Delete schedule:**
1. Long-press → confirm
2. `deletePresenceSchedule(id)`
3. Remove from local state

### Error Handling

Replace silent `.catch(() => {})` with toast notifications via the injected `toast` composable. Revert optimistic updates on failure.

### Settings Cleanup

- Remove `autoWakeEnabled` from `useSettings.js` defaults — the source of truth is `userPresenceEnabled` on the presence API
- Remove `autoSleepMinutes` from `useSettings.js` defaults — the source of truth is `sleepTimeoutMinutes` on the presence API
- Both are now read from the server on mount and written back on change
- Keep them in component-local refs instead

## Files to Change

| File | Change |
|------|--------|
| `src/components/settings/PreferencesTab.vue` | Full rewrite of Power & Sleep section |
| `src/composables/useSettings.js` | Remove `autoWakeEnabled` and `autoSleepMinutes` from defaults and groups |
| `src/composables/useAutoSleep.js` | Already handles heartbeat + auto-sleep sync — no changes needed |

## Interaction Details

| Element | Tap | Long-press |
|---------|-----|------------|
| Time display | Opens time picker | — |
| Day pill | Toggles day in schedule | — |
| Keep-awake badge | Opens dropdown to select duration | — |
| Enable toggle | Toggles schedule on/off | — |
| Schedule card (background) | — | Shows delete confirm |
| Add button | Creates new schedule | — |

### Keep-Awake Dropdown Options

wake only / 30 min / 1 hr / 2 hr / 4 hr

Kept short — covers the common cases. Can add more options later if needed.

## Out of Scope

- Editing schedules in a popup/dialog (decided against — direct manipulation only)
- Display brightness controls (separate concern)
- Wake-lock management (already handled in App.vue)
