# New Screensaver Modes

## Summary

Add two new screensaver modes alongside the existing flip clock: **Last Shot Recap** and **Ambient Glow**. The user picks from four options in Settings > Screensaver: Flip Clock / Last Shot / Ambient Glow / Disabled.

## Screensaver Modes

### Last Shot Recap (`lastShot`)

Displays key stats from the most recent espresso on a black background:

- **Mini shot graph** — a simplified version of HistoryShotGraph, rendered at reduced opacity (~0.6). Shows pressure, flow, and weight curves.
- **Stats row** — shot time (large, primary), dose → yield, ratio. Uses chart palette colors (weight brown for dose/yield, subdued white for ratio).
- **Coffee info** — if the shot has coffee name or roaster (from workflow context), show it below the profile name in the same subdued style.
- **Profile name** — below stats, small, very low opacity.
- **Corner clock** — top-right, tiny, nearly invisible (opacity ~0.15). Shows current time.

Data source: call `getLatestShot()` + `getShot(id)` on mount, same as the last-shot widget in LayoutWidget. If no shot exists, fall back to the flip clock.

The display fades in gently on entry (1-2s opacity transition on the whole container).

### Ambient Glow (`ambientGlow`)

Pure visual ambiance on black background, CSS-only:

- **4-5 color blobs** — large (150-250px), heavily blurred (`filter: blur(40-50px)`), using the chart palette colors at low opacity (10-15%):
  - Pressure green (`#18c37e`)
  - Flow blue (`#4e85f4`)
  - Accent red (`#e94560`)
  - Weight brown (`#a2693d`)
- **Blob animation** — CSS `@keyframes` with slow translate + scale transforms, each blob on a different duration (30-60s) and delay, creating organic drifting. GPU-accelerated via `will-change: transform`.
- **Floating particles** — 5-8 tiny dots (2-4px), white at low opacity (0.15-0.3), each drifting on its own slow CSS animation (20-40s).
- **Subtle clock** — bottom center, very low opacity (0.1).

No JavaScript animation loop needed — pure CSS keyframes.

## Settings

Current `screensaverType` values: `'flipClock'`, `'disabled'`

Add: `'lastShot'`, `'ambientGlow'`

The screensaver settings tab already has a type selector. Add the new options to the segment group. Flip clock sub-settings (24h, 3D) remain and only show when flip clock is selected.

Each option in the selector should have a short description below it:
- **Flip Clock** — "Classic flip clock display"
- **Last Shot** — "Stats and graph from your last espresso"
- **Ambient Glow** — "Slow-drifting colors"
- **Disabled** — "Screen goes black"

## Files to Change

| File | Change |
|------|--------|
| `src/pages/ScreensaverPage.vue` | Add lastShot and ambientGlow template sections + styles |
| `src/composables/useSettings.js` | Update `screensaverType` comment to list new options |
| `src/components/settings/ScreensaverTab.vue` | Add new type options to selector |

## Interaction

All screensaver modes share the same wake behavior: tap/click anywhere calls `setMachineState('idle')`. The "Touch to wake" hint appears on all modes.

## Out of Scope

- Combining modes (shot stats over ambient background)
- Canvas/WebGL rendering
- Configurable blob colors or particle count
- Screensaver preview in settings
