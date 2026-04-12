# Deferred: Decouple Screensaver from Machine Power State

**Status:** Parked — design decisions pending
**Created:** 2026-04-12
**Origin:** Testing feedback item — "Screensaver close does not turn on machine (separate power handling)"

---

## The real goal (stated 2026-04-12)

> The user should be able to make adjustments, write down notes in shot history,
> check and edit profiles, etc. **without the need for the machine to be turned
> on and heating.** The machine should be able to sleep if needed, while the app
> remains fully usable.

This is a larger change than the original feedback item suggested. The original
feedback ("close doesn't turn on machine") is a symptom; the root cause is that
the app treats machine power state and UI visibility as the same thing.

---

## Root problem

The app currently has a hard coupling between **machine power state** and
**screensaver route visibility**. Specifically:

- `src/pages/ScreensaverPage.vue:57` — `wake()` calls `setMachineState('idle')`,
  so tapping the screensaver always wakes the DE1.
- `src/App.vue:247` — on initial connect, if `state === 'sleeping'`, auto-navigates
  to `/screensaver`.
- `src/App.vue:277-279` — on state transition to `sleeping`, auto-navigates to
  `/screensaver` regardless of what the user was doing.

Consequence: if you remove only the `setMachineState('idle')` call (the "obvious
shallow fix"), the user can dismiss the screensaver for a split second and then
the `App.vue` state watcher yanks them back into it. Peek-then-bounce-back.

---

## Subagent findings (2026-04-12)

Two parallel subagents (UX designer + long-time Decenza user persona) reviewed
an earlier proposal that suggested adding two buttons ("Start screensaver" and
"Sleep machine") to the StatusBar's left corner next to the machine state
indicator. Both agents converged on these points:

### Unanimous agreement

1. **Decoupling dismiss from wake is the right instinct.** Ship it.
2. **StatusBar left corner is the wrong home for actionable buttons.** UX
   designer: "by every convention in this app and Apple's design language,
   top-left status + connection dot is a *read-only indicator region*.
   Dropping two tap targets next to a passive label muddles a zone users
   have been trained to ignore for input."  Decenza user: "top bar is where
   I *glance*, not where I *act*."
3. **Don't move the existing Sleep button out of IdlePage.** Decenza user:
   "moving Sleep into a top-bar corner breaks my reach… I'll be hunting for
   it every morning for two weeks."
4. **"Start screensaver" vs "Sleep machine" as two peer buttons is leaky
   plumbing.** Decenza user: "In my head they're one thing — put it to bed."
   UX: "forces users to learn a distinction they don't have a mental model for."
5. **The opt-in "Wake machine on screensaver tap" setting is a smell.** UX:
   "If the new default is right, ship it. If it's wrong, don't ship it.
   Settings to paper over an ambiguous default are tech debt."
6. **Water level on screensaver should port Decenza's progressive blink pattern**
   from `vendor/decenza/qml/components/layout/items/WaterLevelItem.qml:19-45`
   (ok → low → warning → critical, blink cadence 2000/1000/500 ms). Decenza
   user: "I don't care about the number at 3 am; I care that the ambient glow
   turns amber when I'm about to be sad tomorrow morning."

### Where they diverged

- **UX designer** recommended: long-press the state label in StatusBar to open
  a power sheet (Apple Control Center pattern) — Screensaver / Sleep / Wake all
  in one place, progressive disclosure, zero new visual weight.
- **Decenza user** recommended: keep Sleep as a big placeable tile on IdlePage
  (Decenza's widget-system muscle memory); no top-bar buttons at all.

---

## Proposed new model (pending approval)

Two orthogonal concerns that cross exactly once (at the StatusBar label):

| Concept | What it is | Driven by |
|---|---|---|
| **Machine power state** | physical DE1 state (sleeping / idle / heating / espresso / …) | server-side presence heartbeat, user-invoked Sleep/Wake buttons |
| **App UI state** | current page (Idle, Profiles, History, Settings, Screensaver) | user navigation, **app-side inactivity timer** (independent from machine state) |

### Concrete changes

1. **Screensaver becomes an idle-timer overlay**, not a state-driven route.
   Trigger: app-side inactivity timer (reuses `pointerdown` / `keydown` events
   that `useAutoSleep` already listens to) OR manual invocation.
2. **Screensaver tap just dismisses.** Returns to whatever page the user was
   on. Machine power state is untouched.
3. **`App.vue` no longer auto-navigates to `/screensaver` on sleeping state.**
   Remove the two jumps at `App.vue:247` and `App.vue:277-279`. Keep the
   navigate-to-operation-route-on-state-change half for espresso/steam/etc.
4. **Browsing with a cold machine works.** IdlePage, ProfileSelectorPage,
   ShotHistoryPage, SettingsPage are all usable while `machineState === 'sleeping'`.
   StatusBar shows "sleeping" so the user knows where they stand.
5. **Sleep button expanded effect.** Pressing the existing Sleep button
   (`LayoutWidget.vue:227`) still sets machine to `sleeping`, but now *also*
   manually invokes the screensaver overlay. This is the "I'm done, going
   away" gesture that the Decenza user expected.
6. **Add a Wake button next to Sleep on IdlePage.** Visible always; emphasis
   changes based on state. When machine is sleeping, Wake is prominent;
   when idle, Sleep is prominent. Wake = `setMachineState('idle')`.
7. **Operation buttons transparently wake the machine.** Pressing
   Espresso/Steam/HotWater/Flush from a sleeping state calls
   `setMachineState('idle')` first (or the machine handles the heat phase
   automatically). No extra step, no modal.
8. **Screensaver becomes a component mounted overlay, not a router route** —
   so dismissing doesn't lose the current page context.

### Net file-level changes (preview)

**Deletions / edits:**
- `ScreensaverPage.vue:57` — `wake()` drops `setMachineState('idle')`, just
  sets a local dismiss flag.
- `App.vue:247` and `App.vue:277-279` — remove auto-navigate-to-screensaver-
  on-sleeping logic.
- `App.vue` — mount ScreensaverPage conditionally as an overlay, not via router.
- Router — delete the `/screensaver` route.

**New:**
- App-side inactivity timer driving screensaver overlay (new composable
  `useScreensaverIdle`, or extend `useAutoSleep`).
- Wake button on IdlePage paired with existing Sleep button.
- Operation buttons check machine state and call `setMachineState('idle')`
  transparently if sleeping.

---

## Open questions (pending user decision)

1. **Shared timeout vs two timers.** Should the app-side screensaver idle
   timer be a new independent setting, or share `autoSleepMinutes` with the
   server-side machine-sleep timeout? *Leaning toward share it — one number,
   both behaviors.*
2. **Overlay vs route.** Confirmed likely: overlay. `router.push('/screensaver')`
   is replaced by a component-level `<Screensaver v-if="screensaverVisible" />`
   mounted in App.vue. Current `/screensaver` route gets removed.
3. **Wake button visibility.** Always visible next to Sleep, or only when
   machine is sleeping? *Leaning toward always visible, state drives emphasis —
   parallels play/pause in media controls.*
4. **Sleep button also shows screensaver.** Should pressing the Sleep button
   also invoke the screensaver overlay immediately, or just sleep the machine
   and let the app-idle timer decide later? *Leaning toward show immediately —
   pressing Sleep is an explicit "I'm done."*

---

## References

### Code locations in this repo
- `src/App.vue:247` — auto-navigate to /screensaver on initial connect
- `src/App.vue:277-279` — auto-navigate on state transition to sleeping
- `src/pages/ScreensaverPage.vue:57` — `wake()` conflates dismiss with wake
- `src/components/LayoutWidget.vue:227` — existing Sleep button on IdlePage
- `src/composables/useAutoSleep.js` — presence heartbeat, activity events
- `src/composables/useWaterLevels.js` — water level WebSocket (already exists)
- `src/components/StatusBar.vue` — status label region

### Decenza reference patterns
- `vendor/decenza/qml/components/layout/items/SleepItem.qml:16-22` — `doSleep()`
  pattern (goes to sleep then shows screensaver)
- `vendor/decenza/qml/components/layout/items/ScreensaverItem.qml:60-72` —
  `activateScreensaver()` also sleeps DE1
- `vendor/decenza/qml/components/layout/items/WaterLevelItem.qml:19-45` —
  progressive blink warning (referenced for the water level work that is
  **not** blocked by this decoupling)
- `vendor/decenza/qml/pages/ScreensaverPage.qml:658-692` — tap-anywhere wake
  fused with DE1 wake

### Related specs already in repo
- `docs/superpowers/specs/2026-04-01-power-sleep-redesign.md` — different
  concern (PreferencesTab schedule cards), not overlapping but adjacent.
- `docs/superpowers/specs/2026-04-01-screensaver-modes-design.md` — the
  screensaver modes design (flip clock, ambient glow, etc.), relevant
  context for where this overlay is rendered.

---

## Next steps (when picking this back up)

1. Resolve the four open questions with the user.
2. Decide whether to split the spec by phase (e.g., phase 1: decoupling
   + Wake button; phase 2: operation-button transparent wake; phase 3:
   polish) or ship as one.
3. Write the implementation spec under `docs/superpowers/specs/`.
4. Run through writing-plans → executing-plans per the standard workflow.
