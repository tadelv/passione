# Layout System Rethink — Design

## Problem

The current layout system has a preview that doesn't match reality. The LayoutTab shows a 5-row CSS grid; IdlePage renders a vertical flex stack with hardcoded sections mixed in. Users can't tell what they're configuring. Extra zones render in wrong positions. Features like last shot and presets are invisible to the layout system.

## Solution

Replace the 8-zone single-widget layout with a 6-zone slot-based layout where the two center zones hold ordered widget stacks. The preview matches the actual page structure. All visible features become widgets.

## Zone Structure

```
┌──────────────────┬───────────────────┐
│ topLeft           │ topRight          │
├──────────────────┼───────────────────┤
│                  │                   │
│ centerLeft       │ centerRight       │
│ (widget stack)   │ (widget stack)    │
│                  │                   │
├──────────────────┼───────────────────┤
│ bottomLeft       │ bottomRight       │
└──────────────────┴───────────────────┘
```

- **Top/bottom zones**: Single widget each. Compact height.
- **Center zones**: Ordered list of widgets, stacked vertically. Takes remaining vertical space.
- If one center column is empty, the other expands to full width.
- Top/bottom rows collapse if both sides are empty.

## Widget Types

| Widget | Description | Allowed in |
|--------|-------------|------------|
| `gauge` | Temperature gauge circle | center |
| `actionButtons` | Espresso/Steam/Water/Flush buttons | center |
| `shotPlan` | Profile + beans + dose + grinder info | center |
| `lastShot` | Last shot graph + metadata card | center |
| `workflowPresets` | Workflow combo pill row | center |
| `steamPresets` | Steam preset pill row | center |
| `hotWaterPresets` | Hot water preset pill row | center |
| `flushPresets` | Flush preset pill row | center |
| `clock` | Current time | any |
| `waterLevel` | Water level bar | any |
| `statusInfo` | Connection + scale + water + fullscreen | top, bottom |
| `navButtons` | Beans/History/Settings/Sleep | top, bottom |
| `connectionStatus` | Machine/scale online indicator | top, bottom |
| `scaleInfo` | Scale weight/battery | top, bottom |
| `fullscreen` | Fullscreen toggle button | top, bottom |

**Removed**: `profileName` (redundant), `statusBar` (redundant), `bottomBar` (wrapper), `presetPills` (split into individual types), `empty` (just don't add widget).

**Added**: `lastShot`, `workflowPresets`, `steamPresets`, `hotWaterPresets`, `flushPresets`.

## Data Shape

```js
{
  version: 2,
  zones: {
    topLeft:     { widgets: ['statusInfo'] },
    topRight:    { widgets: [] },
    centerLeft:  { widgets: ['gauge'] },
    centerRight: { widgets: ['actionButtons', 'shotPlan', 'workflowPresets'] },
    bottomLeft:  { widgets: ['navButtons'] },
    bottomRight: { widgets: [] },
  }
}
```

Top/bottom zones limited to 1 widget. Center zones accept many. Version 1 layouts replaced with default v2 (no migration, single user).

## Settings UI (LayoutTab)

**Live preview** at top — miniature 2-column layout showing widget labels in real positions. This IS the structure, not a separate visualization.

**Editing**: Tap a zone in the preview to select it. Below the preview:
- **Top/bottom zones**: Dropdown to pick one widget (or empty).
- **Center zones**: Ordered widget list with up/down buttons to reorder, X to remove, "Add widget" button with dropdown of available types.

**Reset to default** button at bottom. Changes apply immediately (debounced save).

## IdlePage Rendering

IdlePage becomes a simple renderer of the layout config. Three rows (top, center, bottom), each with two columns. Center columns render their widget lists in order using a `LayoutWidget` component (renamed from `LayoutZone` to avoid confusion).

All hardcoded sections removed from IdlePage: preset rows, last shot graph, etc. They only exist as widgets.

## Removals

- `extraTop`, `extraBottom`, `extraOverlay` zones
- `showLastShotOnIdle` setting (replaced by `lastShot` widget in layout)
- `presetPills`, `profileName`, `statusBar`, `bottomBar`, `empty` widget types
- Hardcoded preset and last shot sections in IdlePage

## Files to Modify

- `src/composables/useLayout.js` — new zone/widget definitions, v2 data shape, migration
- `src/components/LayoutZone.vue` — rename to `LayoutWidget.vue`, add new widget types (`lastShot`, individual presets), remove old types
- `src/pages/IdlePage.vue` — rewrite to render layout config, remove all hardcoded sections
- `src/components/settings/LayoutTab.vue` — new preview + zone editor UI
- `src/composables/useSettings.js` — remove `showLastShotOnIdle` from settings
- `src/components/settings/ShotHistoryTab.vue` — remove `showLastShotOnIdle` toggle
