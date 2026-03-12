# Workflow Combos Design

## Problem

Profile selection, bean presets, and operation settings (steam/flush/hot water) are siloed. Switching between workflows requires touching multiple pages. There's no way to say "Morning Latte" and have everything configured at once.

## Solution

**Workflow Combos** — named presets that bundle profile + beans + dose + grinder, with optional steam/flush/hot water settings.

## Data Shape

```js
{
  id: crypto.randomUUID(),
  name: 'Morning Latte',
  emoji: '☕',
  // Profile (reference)
  profileId: 'abc123',
  profileTitle: 'Blooming Espresso',
  // Beans
  roaster: 'Square Mile',
  beanBrand: 'Red Brick',
  beanType: 'Blend',
  roastDate: '2026-02-20',
  roastLevel: 'Medium',
  // Dose
  doseIn: 18.0,
  doseOut: 36.0,
  // Grinder
  grinder: 'Niche Zero',
  grinderSetting: '15',
  // Optional operation settings (null = not included)
  steamSettings: { duration: 25, flow: 150, temperature: 160 },
  flushSettings: null,
  hotWaterSettings: null,
}
```

All fields are optional. A combo can be profile-only, beans-only, or the full package.

## Settings Storage

Replace existing preset keys with:

| Key | Type | Default |
|-----|------|---------|
| `workflowCombos` | Array | `[]` |
| `selectedWorkflowCombo` | Number | `-1` |

Remove: `favoriteProfiles`, `selectedFavoriteProfile`, `beanPresets`, `selectedBeanPreset`.

Per-operation settings (`steamDuration`, `steamFlow`, etc.) and per-operation presets (`steamPitcherPresets`, etc.) remain unchanged — they're independent.

## Home Screen Interaction

### Pill Row

The current espresso preset pill row becomes workflow combo pills.

- **Single tap**: Loads the combo into the workflow. Non-null fields are pushed via `updateWorkflow()` (profile, coffeeData, doseData, grinderData). Optional steam/flush/water settings overwrite local settings values.
- **Long-press (500ms)**: Opens quick edit popup (name, emoji, delete).
- **Action buttons** (Espresso, Steam, Flush, Hot Water) start operations as before — now pre-configured by the active combo.
- **Shot plan zone** updates to reflect what the combo loaded.

### Empty State

No combos → pill row shows a single "+ New Combo" pill that navigates to the Workflow Editor.

## Loading Behavior

- Only non-null fields are pushed. A profile-only combo doesn't touch beans/dose/grinder.
- Profile loaded via `updateWorkflow({ profile })`.
- Beans/dose/grinder via `updateWorkflow({ coffeeData, doseData, grinderData })`.
- Steam/flush/hot water settings written to local settings (those pages read from settings, not workflow API).
- No "dirty" tracking — combos are fire-and-forget. Manual changes after loading don't update the combo.

## Workflow Editor (evolved BeanInfoPage)

BeanInfoPage becomes the Workflow Editor at the same `/bean-info` route.

### Layout

```
┌─────────────────────────────────────┐
│ [Combo pills]  [+ New]              │
├─────────────────────────────────────┤
│ Profile                             │
│ ┌─────────────────────────────────┐ │
│ │ Blooming Espresso    [Change]   │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Bean          │ Grinder  │ Dose     │
│ Roaster ___   │ Model ___ │ In  18g │
│ Brand   ___   │ Set   ___ │ Out 36g │
│ Type    ___   │           │ 1:2.0   │
│ Date    ___   │           │         │
│ Level   [v]   │           │         │
├─────────────────────────────────────┤
│ > Steam Settings (optional)        │
│ > Flush Settings (optional)        │
│ > Hot Water Settings (optional)    │
├─────────────────────────────────────┤
│ [Save]  [Save as New]              │
└─────────────────────────────────────┘
```

### Sections

1. **Profile**: Current profile name + "Change" button (navigates to ProfileSelectorPage, which applies on click and returns).
2. **Bean/Grinder/Dose**: Same grid as current BeanInfoPage.
3. **Collapsible operation sections**: Each has a toggle to include/exclude from the combo. When expanded, shows ValueInput controls matching the operation pages.
4. **Bottom bar**: "Save" updates selected combo. "Save as New" creates a new combo. "Save to Workflow" pushes to API without saving a combo.

### Editing via Long-Press Popup

Long-press on a combo pill opens PresetEditPopup for quick name/emoji edit and delete. For full editing, select the combo and use the Workflow Editor.

## Operation Pages

Steam, Flush, and Hot Water pages are unchanged. They keep their own per-operation preset pills for in-session tweaks. When a combo with steam settings is loaded, it overwrites the settings values that SteamPage reads — no special wiring needed.

## Files to Modify

- `src/composables/useSettings.js` — new keys, remove old keys
- `src/pages/IdlePage.vue` — combo pills replace espresso presets, loading logic
- `src/pages/BeanInfoPage.vue` — evolve into Workflow Editor
- `src/components/LayoutZone.vue` — update preset pill zone for combos
- `src/components/PresetPillRow.vue` — no changes needed (generic)
- `src/api/rest.js` — no changes (uses existing workflow + store APIs)
