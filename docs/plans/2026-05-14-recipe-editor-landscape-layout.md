# Recipe Editor — small-landscape layout redesign

**Status:** planned
**Target:** `RecipeEditorPage` (`/recipe/edit`)
**Date:** 2026-05-14

## Why

On small landscape tablets (~1024×600 Teclast skin) the current editor stacks
everything vertically: top header row → profile pair → 3-column field grid →
three stacked operation accordions → BottomBar. On a 600px-tall screen this
scrolls, which fights the live-apply / quick-tweak model (the editor is meant
for "pop in, change one field, pop out").

Goal: fit the whole editor in one landscape viewport, no scroll, while keeping
44–56px touch targets. Use the horizontal space the layout currently wastes.

## Target layout

```
┌────────┬──────────────────────────────────────────────────┐
│RECIPES │ COFFEE            │ GRINDER            [Save] [+] │
│ ● Morn │ Bean ▾ Aurora     │ Grndr ▾ Niche                 │
│ ○ Decaf│ batch · basket    │ Setting · RPM                 │
│ ○ Sprcl├───────────────────┼───────────────────────────────┤
│ ○ ...  │ DOSE + PROFILE    │ OPERATIONS                    │
│        │ In/Out/Ratio      │ ☑ Steam      160°·30s      ›  │
│ [+New] │ Profile  nm [Chg] │ ☐ Flush      —             ›  │
│        │ Temp  [93°C]      │ ☐ Hot Water  —             ›  │
├────────┴───────────────────┴───────────────────────────────┤
│ [BottomBar]                                                │
└────────────────────────────────────────────────────────────┘
```

- **Left rail** replaces the horizontal `PresetPillRow` — reclaims the top
  header row's height; a vertical list scales better than a wrapping pill row
  when there are many recipes.
- **2×2 quadrant grid** fills the wide area: Coffee | Grinder / Dose+Profile |
  Operations. Every quadrant is fixed-height — nothing expands inline.
- **Operations** become a calm 3-row summary list (toggle + summary text +
  chevron). No accordions. Editing a operation's fields happens in an overlay.
- **Save / Save as New** move to the top-right of the quadrant area (still
  visible only when `dirty`).

## Components

### NEW `src/components/RecipePillRail.vue`
Vertical recipe rail. Thin component — reuses `PresetPillRow`'s select +
double-tap-edit interaction logic, but vertical layout, baked-in `+New`
button, and an explicit per-row edit affordance.

- Props: `presets`, `selectedIndex`, `modified`, `ariaLabel`.
- Events: `select(index)`, `edit(index)`, `new`.
- **Editable names preserved** (explicit user requirement): double-tap a row
  still emits `edit` → unchanged `onComboEdit` → existing `PresetEditPopup`
  (`operationType="combo"`, name + emoji). A rail row has horizontal room the
  pill didn't — also add a small pencil button on the selected row so name
  editing is discoverable, not double-tap-only.
- Does **not** need `activate` / `confirmActivate` — `RecipeEditorPage`
  already passes `confirm-activate="false"`, so the rail drops that path.
- `PresetPillRow` stays untouched — still used by `LayoutWidget`.

### NEW `src/components/OperationSettingsPopup.vue`
Modal for one operation's fields, opened from an operations summary row.

- Props: `visible`, `operationType` (`'steam' | 'flush' | 'hotwater'`).
- v-model bindings for that operation's fields + the `include` flag (the
  field refs stay owned by `RecipeEditorPage` — they are already wired into
  the live-apply watcher, `comboValues()`, and `buildWorkflowUpdate()`; do
  not move that ownership).
- Live-apply: editing a field in the popup mutates the parent ref → existing
  watcher fires → workflow updates. "Done" only closes; there is no Save /
  Cancel for fields (consistent with the rest of the editor).
- Single instance in the parent driven by an `activeOperation` ref; not three
  instances.
- `PresetEditPopup` is **not** reused — its `combo` type only does name/emoji
  and it has Save/Cancel/Delete semantics that don't fit live-apply.

### MODIFY `src/pages/RecipeEditorPage.vue`
- Swap `PresetPillRow` → `RecipePillRail`; wire `new` → existing
  `onSaveAsNewClick`.
- Restructure template: rail + 2×2 quadrant grid. Move Save / Save as New
  into the quadrant-area header.
- Replace the three operation accordions with the operations summary list
  (toggle = `includeSteam` / `includeFlush` / `includeHotWater`; row body /
  chevron sets `activeOperation` and opens the popup).
- Operation summary text computeds (e.g. `160 °C · 30 s`, or `—` when off).
- Rework `<style scoped>`: rail + quadrant grid; degrade to stacked below a
  width breakpoint so the page still works off the target tablet.
- No change to `comboValues()`, `buildWorkflowUpdate()`, `overlayFromWorkflow`,
  dirty tracking, or the live-apply watcher — this is a presentational
  restructure only.

### MODIFY `src/i18n/locales/en.json`
New strings: operation summary labels, "Include in this recipe", rail `+New`
label, any quadrant section headers not already keyed.

## Build sequence

Each step is independently shippable.

1. **`RecipePillRail` + swap.** New component, replace `PresetPillRow` in
   `RecipeEditorPage` only. Old grid + accordions stay below for now. Verify
   select / double-tap-edit / pencil-edit / modified-dot / `+New` all work.
2. **`OperationSettingsPopup` + summary list.** Replace the three accordions
   with the summary list + popup. Verify include toggles and in-popup field
   edits still live-apply to the workflow.
3. **Quadrant layout.** Restructure to rail + 2×2 grid, move Save buttons,
   rework CSS. Verify no-scroll at 1024×600 and graceful stacked fallback
   when narrow.

## Decisions

- **New `RecipePillRail` rather than an `orientation` prop on `PresetPillRow`** —
  layout, sizing, the `+New` button, and the pencil affordance differ enough
  that a shared component would be mostly branches. The duplicated interaction
  logic is small; not worth a `usePillInteraction` composable for two sites.
- **Overlay, not a sub-route, for operations** — keeps live-apply context, no
  route push, and preserves the editor's "BottomBar Home is the sole exit"
  contract.
- **Pencil affordance added** alongside double-tap for name editing — directly
  addresses the "keep names editable" requirement and makes it discoverable.

## Open questions

- Rail width on the target screen — needs a real measurement pass at 1024×600
  to confirm the two content columns stay ≥ ~360px each after the rail.
- Does the `DOSE + PROFILE` quadrant get too tall with the temperature
  `ValueInput` + profile row? May need the profile row to be a single compact
  line (name + Change inline).
- Power-user fields (`showBasketData` basket subsection, `showGrinderRpm` RPM)
  add height to the Coffee / Grinder quadrants when enabled — verify the
  no-scroll guarantee still holds with both toggles on.
