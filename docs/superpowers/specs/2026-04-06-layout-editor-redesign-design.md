# Layout Editor Redesign: Direct Manipulation on IdlePage

## Problem

The current layout editor lives inside Settings > Layout as a miniature grid of text labels. Users must navigate to settings, make a change, navigate back to IdlePage to see the result, then repeat. This loop is slow and disorienting because the abstract labels don't convey what the widgets actually look like.

## Solution

Replace the settings-based editor with a WYSIWYG overlay on IdlePage itself. Users edit the layout directly on the page they're configuring, seeing real widgets update in real time.

## Entry Point

Settings > Layout tab becomes a launcher:
- Brief description of the layout system
- "Edit Layout" button navigates to `/#/?editLayout=true`
- "Reset to Default" button remains

No other way to enter edit mode. IdlePage stays clean during normal use.

## Edit Mode Overlay

When IdlePage detects `editLayout=true` query param:

### Visual Treatment
- Each zone gets a **dashed border** to show its boundaries
- All widgets render but are **dimmed/desaturated** (CSS `opacity: 0.5` + `filter: saturate(0.3)`)
- Widgets have `pointer-events: none` to prevent accidental interaction (no starting espresso while editing)
- Each zone shows a **floating label** with its name (e.g., "Center Left", "Top Right")

### Zone Selection
- Tapping a zone **selects** it: solid highlight border using `--color-primary`
- The selected zone opens the **bottom drawer** with its widget controls
- Tapping a different zone switches the drawer to that zone

### Exit
- A floating **"Done" pill** at top-center of the screen
- Tapping "Done" removes the `editLayout` query param, returning to normal IdlePage
- Browser back also exits edit mode (since it's a query param change)

## Bottom Drawer (LayoutEditorDrawer)

Appears when a zone is tapped. Slides up from the bottom of the screen.

### Layout
- **Drag handle** bar at the top (visual affordance, no drag-to-resize needed)
- **Zone name** as section header (e.g., "Center Left (vertical stack)")
- **Widget list**: current widgets in the zone, each row has:
  - Widget label (e.g., "Temperature Gauge")
  - Up/down reorder arrows
  - Remove (x) button
- **Add widget row**: dropdown of unused widgets + "Add" button (same as current LayoutTab)
- Max height: 50vh. Scrollable if content overflows.

### Behavior
- Changes auto-save via existing `useLayout` with 500ms debounce
- Tapping outside the drawer (on a zone) selects that zone and updates drawer contents
- Swiping down or tapping the "Done" pill closes the drawer and exits edit mode

## Components

### New Components
- **`LayoutEditOverlay.vue`** — Rendered inside IdlePage when in edit mode. Handles:
  - Zone dashed borders, labels, dimming
  - Zone tap → selection state
  - "Done" pill button
  - Renders `LayoutEditorDrawer` when a zone is selected
- **`LayoutEditorDrawer.vue`** — Bottom sheet with widget list controls. Receives selected zone name as prop. Handles:
  - Widget list display (reorder, remove)
  - Add widget dropdown
  - Auto-save on changes

### Modified Components
- **`LayoutTab.vue`** — Stripped to: description text, "Edit Layout" button, "Reset to Default" button. All editor UI removed.
- **`IdlePage.vue`** — Reads `editLayout` route query param. When true, renders `LayoutEditOverlay` and applies dimming class to widget container.

### Unchanged
- **`useLayout.js`** — Existing composable API (`layout`, `setLayout`, `resetLayout`, `WIDGET_TYPES`, `WIDGET_LABELS`, etc.) is sufficient. No changes needed.
- **`LayoutWidget.vue`** — Renders normally; dimming is applied by the overlay via CSS on the parent.

## Data Flow

```
LayoutTab "Edit Layout" click
  → router.push({ query: { editLayout: 'true' } })
  → IdlePage reads query, renders LayoutEditOverlay
  → User taps zone → LayoutEditOverlay sets selectedZone
  → LayoutEditorDrawer shows widgets for selectedZone
  → User adds/removes/reorders → calls useLayout.setLayout()
  → layout ref updates → IdlePage re-renders widgets (visible through dimmed overlay)
  → Auto-save persists to ReaPrime store (existing debounce)
  → User taps "Done" → router.replace({ query: {} })
  → LayoutEditOverlay unmounts, normal IdlePage resumes
```

## Edge Cases

- **Empty zones**: Show dashed border with "Empty" label. Tapping opens drawer with just the "Add widget" controls.
- **All widgets used**: "Add widget" dropdown hidden when no unused widgets remain for that zone type.
- **Machine state changes during edit**: Widgets are dimmed and inert, so state transitions (e.g., machine goes to sleep) should not trigger navigation while in edit mode. IdlePage should suppress machine-state navigation when `editLayout` is active.
- **Small screens**: Bottom drawer maxes at 50vh. Widget list scrolls internally. Zone labels use small font to avoid overflow.
- **Saved layout already exists**: Edit mode loads the current saved layout, not the default. Works the same as current LayoutTab behavior.

## Accessibility

- "Done" pill and all drawer controls meet 44px minimum touch target
- Zone selection and drawer controls are keyboard-navigable (tab order, Enter to select)
- ARIA: zones have `role="button"` and `aria-label` with zone name. Drawer has `role="dialog"` with `aria-label="Layout editor"`.
- Focus trapped inside drawer when open (standard bottom-sheet pattern)
