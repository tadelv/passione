# Workflow Combos Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace siloed profile/bean presets with unified "Workflow Combos" — named bundles of profile + beans + dose + grinder + optional steam/flush/hot water settings.

**Architecture:** New `workflowCombos` array in settings replaces `favoriteProfiles` and `beanPresets`. IdlePage pill row shows combos (single tap loads, action buttons start operations). BeanInfoPage evolves into a Workflow Editor with profile picker, collapsible operation sections, and save-to-combo.

**Tech Stack:** Vue 3 Composition API, existing settings persistence via KV store, existing workflow REST API.

---

### Task 1: Update useSettings.js — replace old preset keys with combo keys

**Files:**
- Modify: `src/composables/useSettings.js`

**Step 1: Replace defaults**

In `DEFAULT_SETTINGS`, replace:
```js
beanPresets: [],
selectedBeanPreset: -1,
favoriteProfiles: [],
selectedFavoriteProfile: -1,
```
with:
```js
workflowCombos: [],
selectedWorkflowCombo: -1,
```

**Step 2: Replace GROUPS entries**

Replace the `profiles` and `beans` groups:
```js
profiles: [
  'favoriteProfiles', 'selectedFavoriteProfile',
],
beans: [
  'beanPresets', 'selectedBeanPreset',
],
```
with a single group:
```js
combos: [
  'workflowCombos', 'selectedWorkflowCombo',
],
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. Some pages will have broken references (expected — fixed in later tasks).

**Step 4: Commit**

```
feat: replace bean/profile presets with workflowCombos in settings
```

---

### Task 2: Update IdlePage.vue — replace espresso presets with workflow combos

**Files:**
- Modify: `src/pages/IdlePage.vue`

**Step 1: Replace espresso preset logic with combo logic**

Remove lines 91-156 (everything from `// ---- Espresso favorite presets` through `onPreviewMoreInfo`). Also remove the `getProfiles` import from line 9, the `allProfiles` ref, `loadFavoriteProfiles`, `previewProfile`, `previewVisible`, and the `ProfilePreviewPopup` import (line 7).

Replace with:

```js
// ---- Workflow combos (single tap loads, action buttons start) ----
const workflowCombos = computed(() => settings?.settings?.workflowCombos ?? [])
const selectedWorkflowCombo = computed(() => settings?.settings?.selectedWorkflowCombo ?? -1)

// Long-press edit popup state
const editPopupVisible = ref(false)
const editPopupPreset = ref(null)
const editPopupIndex = ref(-1)

async function onComboSelect(index) {
  if (!settings) return
  settings.settings.selectedWorkflowCombo = index
  const combo = workflowCombos.value[index]
  if (!combo) return

  // Build workflow update from non-null combo fields
  const update = {}

  // Profile
  if (combo.profileId) {
    try {
      const records = await getProfiles()
      const record = (Array.isArray(records) ? records : []).find(r => r.id === combo.profileId)
      if (record?.profile) update.profile = record.profile
    } catch { /* profile not found, skip */ }
  }

  // Coffee data
  const coffeeName = [combo.beanBrand, combo.beanType].filter(Boolean).join(' ')
  if (coffeeName || combo.roaster) {
    update.coffeeData = {
      name: coffeeName || null,
      roaster: combo.roaster || null,
    }
  }

  // Dose data
  if (combo.doseIn != null || combo.doseOut != null) {
    update.doseData = {
      doseIn: combo.doseIn ?? undefined,
      doseOut: combo.doseOut ?? undefined,
    }
  }

  // Grinder data
  if (combo.grinder || combo.grinderSetting) {
    update.grinderData = {
      manufacturer: null,
      model: combo.grinder || null,
      setting: combo.grinderSetting ?? null,
    }
  }

  if (Object.keys(update).length > 0) {
    updateWorkflow(update).catch(() => {})
  }

  // Apply optional operation settings to local settings
  if (combo.steamSettings) {
    settings.settings.steamDuration = combo.steamSettings.duration ?? settings.settings.steamDuration
    settings.settings.steamFlow = combo.steamSettings.flow ?? settings.settings.steamFlow
    settings.settings.steamTemperature = combo.steamSettings.temperature ?? settings.settings.steamTemperature
  }
  if (combo.flushSettings) {
    settings.settings.flushDuration = combo.flushSettings.duration ?? settings.settings.flushDuration
    settings.settings.flushFlowRate = combo.flushSettings.flow ?? settings.settings.flushFlowRate
  }
  if (combo.hotWaterSettings) {
    settings.settings.hotWaterVolume = combo.hotWaterSettings.volume ?? settings.settings.hotWaterVolume
    settings.settings.hotWaterTemperature = combo.hotWaterSettings.temperature ?? settings.settings.hotWaterTemperature
  }

  toast?.success(`Loaded ${combo.name || 'combo'}`)
}

function onComboLongPress(index) {
  const combo = workflowCombos.value[index]
  if (!combo) return
  editPopupPreset.value = combo
  editPopupIndex.value = index
  editPopupVisible.value = true
}

function onComboEditSave(updated) {
  if (!settings || editPopupIndex.value < 0) return
  const combos = [...workflowCombos.value]
  combos[editPopupIndex.value] = { ...combos[editPopupIndex.value], name: updated.name, emoji: updated.emoji }
  settings.settings.workflowCombos = combos
  editPopupVisible.value = false
}

function onComboEditDelete() {
  if (!settings || editPopupIndex.value < 0) return
  const combos = [...workflowCombos.value]
  combos.splice(editPopupIndex.value, 1)
  settings.settings.workflowCombos = combos
  // Adjust selected index
  if (selectedWorkflowCombo.value >= combos.length) {
    settings.settings.selectedWorkflowCombo = combos.length - 1
  }
  editPopupVisible.value = false
}

function onComboEditCancel() {
  editPopupVisible.value = false
}
```

Keep `getProfiles` import (still needed for combo profile loading). Remove `ProfilePreviewPopup` import.

**Step 2: Update template — combo pill row**

Replace the espresso preset section (lines 326-337) with:
```vue
<!-- Workflow combo presets -->
<div v-if="workflowCombos.length" class="idle-page__preset-section">
  <span class="idle-page__preset-label">Workflows</span>
  <PresetPillRow
    :presets="workflowCombos"
    :selected-index="selectedWorkflowCombo"
    :long-press-enabled="true"
    @select="onComboSelect"
    @long-press="onComboLongPress"
  />
</div>
```

Note: no `@activate` — single tap loads, user uses action buttons to start.

**Step 3: Update template — replace ProfilePreviewPopup with PresetEditPopup**

Remove the `ProfilePreviewPopup` at the bottom of the template (lines 449-455).

Add PresetEditPopup import (it's already used elsewhere in the app):
```js
import PresetEditPopup from '../components/PresetEditPopup.vue'
```

Add at end of template (before closing `</div>`):
```vue
<!-- Combo quick edit popup (on long-press) -->
<PresetEditPopup
  :visible="editPopupVisible"
  :preset="editPopupPreset"
  operation-type="combo"
  :is-existing="true"
  @save="onComboEditSave"
  @delete="onComboEditDelete"
  @cancel="onComboEditCancel"
/>
```

**Step 4: Update all LayoutZone instances — replace espresso props with combo props**

For every `<LayoutZone>` in the template, replace:
```
:espresso-presets="espressoPresets"
:selected-espresso-preset="selectedEspressoPreset"
```
with:
```
:workflow-combos="workflowCombos"
:selected-workflow-combo="selectedWorkflowCombo"
```

And replace event handlers:
```
@espresso-preset-select="onEspressoPresetSelect"
@espresso-preset-activate="onEspressoPresetActivate"
@espresso-preset-long-press="onEspressoPresetLongPress"
```
with:
```
@workflow-combo-select="onComboSelect"
@workflow-combo-long-press="onComboLongPress"
```

There are 6 LayoutZone instances — update all of them. Also inject `toast`:
```js
const toast = inject('toast', null)
```

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```
feat: replace espresso presets with workflow combos on home screen
```

---

### Task 3: Update LayoutZone.vue — replace espresso preset props with combo props

**Files:**
- Modify: `src/components/LayoutZone.vue`

**Step 1: Update props**

Replace espresso preset props (lines 23-26):
```js
espressoPresets: { type: Array, default: () => [] },
selectedEspressoPreset: { type: Number, default: -1 },
```
with:
```js
workflowCombos: { type: Array, default: () => [] },
selectedWorkflowCombo: { type: Number, default: -1 },
```

**Step 2: Update emits**

Replace espresso emits in `defineEmits` (lines 52-54):
```js
'espresso-preset-select',
'espresso-preset-activate',
'espresso-preset-long-press',
```
with:
```js
'workflow-combo-select',
'workflow-combo-long-press',
```

**Step 3: Update presetPills zone template**

Replace the espresso section (lines 186-196) with:
```vue
<div v-if="workflowCombos.length" class="layout-zone__preset-section">
  <span class="layout-zone__preset-label">Workflows</span>
  <PresetPillRow
    :presets="workflowCombos"
    :selected-index="selectedWorkflowCombo"
    :long-press-enabled="true"
    @select="idx => emit('workflow-combo-select', idx)"
    @long-press="idx => emit('workflow-combo-long-press', idx)"
  />
</div>
```

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```
feat: update LayoutZone to use workflow combos instead of espresso presets
```

---

### Task 4: Add "combo" operation type to PresetEditPopup.vue

**Files:**
- Modify: `src/components/PresetEditPopup.vue`

**Step 1: Add combo handling**

The popup already supports `operationType` switching. For combos, we only need name + emoji editing (the full editor is BeanInfoPage). No additional fields needed — the existing name/emoji fields cover it.

Add to the `operationType` prop JSDoc comment: `'steam' | 'hotwater' | 'flush' | 'bean' | 'combo'`

The `buildResult()` function already returns `{ name, emoji }` as the base — when `operationType === 'combo'`, no extra fields are added, which is correct.

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```
feat: support combo operation type in PresetEditPopup
```

---

### Task 5: Evolve BeanInfoPage.vue into Workflow Editor — profile section

**Files:**
- Modify: `src/pages/BeanInfoPage.vue`

**Step 1: Add profile section**

Add imports and state:
```js
import { useRouter } from 'vue-router'
const router = useRouter()
```

Add profile state (populated from workflow or selected combo):
```js
const profileTitle = ref('')
const profileId = ref(null)
```

Add to `loadFromPreset` (now loading from combo):
```js
profileId.value = preset.profileId ?? null
profileTitle.value = preset.profileTitle ?? ''
```

Add to the initial workflow load block:
```js
if (workflow?.profile) {
  profileTitle.value = workflow.profile.title ?? ''
  profileId.value = null // No ID available from workflow directly
}
```

**Step 2: Add profile section to template**

Insert before the `bean-info__grid` div:
```vue
<!-- Profile section -->
<div class="bean-info__profile-section">
  <h4 class="bean-info__section-title">Profile</h4>
  <div class="bean-info__profile-row">
    <span class="bean-info__profile-name">{{ profileTitle || 'No profile selected' }}</span>
    <button class="bean-info__change-btn" @click="router.push('/profiles')">Change</button>
  </div>
</div>
```

**Step 3: Add CSS for profile section**

```css
.bean-info__profile-section {
  padding: 0 16px;
  flex-shrink: 0;
}

.bean-info__profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin-top: 8px;
  border-radius: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.bean-info__profile-name {
  font-size: 15px;
  color: var(--color-text);
}

.bean-info__change-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__change-btn:active {
  opacity: 0.7;
}
```

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```
feat: add profile section to workflow editor
```

---

### Task 6: Evolve BeanInfoPage.vue — collapsible operation sections

**Files:**
- Modify: `src/pages/BeanInfoPage.vue`

**Step 1: Add operation settings state**

```js
// Optional operation settings (for combo)
const includeSteam = ref(false)
const steamDuration = ref(30)
const steamFlow = ref(150)
const steamTemperature = ref(160)

const includeFlush = ref(false)
const flushDuration = ref(5)
const flushFlowRate = ref(6.0)

const includeHotWater = ref(false)
const hotWaterVolume = ref(200)
const hotWaterTemperature = ref(80)
```

Load from combo in `loadFromPreset`:
```js
// Operation settings
if (preset.steamSettings) {
  includeSteam.value = true
  steamDuration.value = preset.steamSettings.duration ?? 30
  steamFlow.value = preset.steamSettings.flow ?? 150
  steamTemperature.value = preset.steamSettings.temperature ?? 160
} else {
  includeSteam.value = false
}
if (preset.flushSettings) {
  includeFlush.value = true
  flushDuration.value = preset.flushSettings.duration ?? 5
  flushFlowRate.value = preset.flushSettings.flow ?? 6.0
} else {
  includeFlush.value = false
}
if (preset.hotWaterSettings) {
  includeHotWater.value = true
  hotWaterVolume.value = preset.hotWaterSettings.volume ?? 200
  hotWaterTemperature.value = preset.hotWaterSettings.temperature ?? 80
} else {
  includeHotWater.value = false
}
```

**Step 2: Add collapsible sections to template**

Insert after the `bean-info__grid` closing div, before BottomBar:
```vue
<!-- Optional operation settings -->
<div class="bean-info__operations">
  <!-- Steam -->
  <div class="bean-info__op-section">
    <button class="bean-info__op-toggle" @click="includeSteam = !includeSteam">
      <span>{{ includeSteam ? '▾' : '▸' }} Steam Settings</span>
      <span class="bean-info__op-badge" v-if="includeSteam">included</span>
    </button>
    <div v-if="includeSteam" class="bean-info__op-fields">
      <div class="bean-info__field">
        <label class="bean-info__label">Duration</label>
        <ValueInput v-model="steamDuration" :min="1" :max="120" :step="1" :decimals="0" suffix=" s" />
      </div>
      <div class="bean-info__field">
        <label class="bean-info__label">Flow</label>
        <ValueInput v-model="steamFlow" :min="40" :max="250" :step="5" :decimals="0" />
      </div>
      <div class="bean-info__field">
        <label class="bean-info__label">Temperature</label>
        <ValueInput v-model="steamTemperature" :min="100" :max="170" :step="1" :decimals="0" suffix="&deg;C" />
      </div>
    </div>
  </div>

  <!-- Flush -->
  <div class="bean-info__op-section">
    <button class="bean-info__op-toggle" @click="includeFlush = !includeFlush">
      <span>{{ includeFlush ? '▾' : '▸' }} Flush Settings</span>
      <span class="bean-info__op-badge" v-if="includeFlush">included</span>
    </button>
    <div v-if="includeFlush" class="bean-info__op-fields">
      <div class="bean-info__field">
        <label class="bean-info__label">Duration</label>
        <ValueInput v-model="flushDuration" :min="1" :max="30" :step="0.5" :decimals="1" suffix=" s" />
      </div>
      <div class="bean-info__field">
        <label class="bean-info__label">Flow Rate</label>
        <ValueInput v-model="flushFlowRate" :min="2" :max="10" :step="0.5" :decimals="1" suffix=" mL/s" />
      </div>
    </div>
  </div>

  <!-- Hot Water -->
  <div class="bean-info__op-section">
    <button class="bean-info__op-toggle" @click="includeHotWater = !includeHotWater">
      <span>{{ includeHotWater ? '▾' : '▸' }} Hot Water Settings</span>
      <span class="bean-info__op-badge" v-if="includeHotWater">included</span>
    </button>
    <div v-if="includeHotWater" class="bean-info__op-fields">
      <div class="bean-info__field">
        <label class="bean-info__label">Volume</label>
        <ValueInput v-model="hotWaterVolume" :min="50" :max="500" :step="10" :decimals="0" suffix=" g" />
      </div>
      <div class="bean-info__field">
        <label class="bean-info__label">Temperature</label>
        <ValueInput v-model="hotWaterTemperature" :min="40" :max="100" :step="1" :decimals="0" suffix="&deg;C" />
      </div>
    </div>
  </div>
</div>
```

**Step 3: Add CSS for operation sections**

```css
.bean-info__operations {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.bean-info__op-section {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.bean-info__op-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__op-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-success);
  text-transform: uppercase;
}

.bean-info__op-fields {
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--color-border);
}
```

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```
feat: add collapsible steam/flush/hot water sections to workflow editor
```

---

### Task 7: Evolve BeanInfoPage.vue — save as combo logic

**Files:**
- Modify: `src/pages/BeanInfoPage.vue`

**Step 1: Replace beanPresets with workflowCombos**

Update the preset references:
```js
const beanPresets = computed(() => settings?.settings?.beanPresets ?? [])
const selectedIndex = computed(() => settings?.settings?.selectedBeanPreset ?? -1)
```
becomes:
```js
const workflowCombos = computed(() => settings?.settings?.workflowCombos ?? [])
const selectedIndex = computed(() => settings?.settings?.selectedWorkflowCombo ?? -1)
```

Update `onPresetSelect`:
```js
function onPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedWorkflowCombo = index
  loadFromPreset(index)
}
```

**Step 2: Replace currentValues with comboValues**

Replace `currentValues()` to build a full combo object:
```js
function comboValues() {
  return {
    id: crypto.randomUUID(),
    name: [beanBrand.value, beanType.value].filter(Boolean).join(' ') || profileTitle.value || 'Unnamed',
    emoji: '',
    // Profile
    profileId: profileId.value,
    profileTitle: profileTitle.value,
    // Beans
    roaster: roaster.value,
    beanBrand: beanBrand.value,
    beanType: beanType.value,
    roastDate: roastDate.value,
    roastLevel: roastLevel.value,
    // Dose
    doseIn: doseIn.value,
    doseOut: doseOut.value,
    // Grinder
    grinder: grinder.value,
    grinderSetting: grinderSetting.value,
    // Optional operation settings
    steamSettings: includeSteam.value ? { duration: steamDuration.value, flow: steamFlow.value, temperature: steamTemperature.value } : null,
    flushSettings: includeFlush.value ? { duration: flushDuration.value, flow: flushFlowRate.value } : null,
    hotWaterSettings: includeHotWater.value ? { volume: hotWaterVolume.value, temperature: hotWaterTemperature.value } : null,
  }
}
```

**Step 3: Update auto-save to save to combo**

Update `debouncedSaveToPreset`:
```js
function debouncedSaveToCombo() {
  if (!settings || selectedIndex.value < 0) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const combos = [...workflowCombos.value]
    const existing = combos[selectedIndex.value]
    combos[selectedIndex.value] = { ...comboValues(), id: existing?.id ?? crypto.randomUUID() }
    settings.settings.workflowCombos = combos
  }, 500)
}
```

Update the watch to call `debouncedSaveToCombo` and include the new fields:
```js
watch([roaster, beanBrand, beanType, roastDate, roastLevel, grinder, grinderSetting, beverageType, doseIn, doseOut,
       includeSteam, steamDuration, steamFlow, steamTemperature,
       includeFlush, flushDuration, flushFlowRate,
       includeHotWater, hotWaterVolume, hotWaterTemperature], debouncedSaveToCombo)
```

**Step 4: Replace addPreset with saveAsNew**

```js
function saveAsNew() {
  if (!settings) return
  const vals = comboValues()
  const combos = [...workflowCombos.value, vals]
  settings.settings.workflowCombos = combos
  settings.settings.selectedWorkflowCombo = combos.length - 1
  toast?.success('Combo saved')
}
```

**Step 5: Update bottom bar buttons**

Replace:
```vue
<BottomBar title="Bean Info">
  <button class="bean-info__save-btn" @click="saveToWorkflow">
    Save to Workflow
  </button>
</BottomBar>
```
with:
```vue
<BottomBar title="Workflow Editor">
  <button class="bean-info__save-btn bean-info__save-btn--secondary" @click="saveToWorkflow">
    Apply
  </button>
  <button class="bean-info__save-btn" @click="saveAsNew">
    Save as New
  </button>
</BottomBar>
```

Add CSS:
```css
.bean-info__save-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
```

**Step 6: Update PresetPillRow — replace beanPresets with workflowCombos**

In the template, update the PresetPillRow:
```vue
<PresetPillRow
  :presets="workflowCombos"
  :selected-index="selectedIndex"
  @select="onPresetSelect"
/>
```

Replace the add button text:
```vue
<button class="bean-info__add-btn" @click="saveAsNew">
  + New Combo
</button>
```

**Step 7: Remove beverageType field and suggestions (no longer needed for combos)**

Remove `beverageType` ref, `BEVERAGE_TYPES`, and the Beverage field from the template (the grinder column). Keep the grinder/setting fields.

**Step 8: Verify build**

Run: `npm run build`

**Step 9: Commit**

```
feat: evolve BeanInfoPage into Workflow Editor with combo save
```

---

### Task 8: Wire up profile return from ProfileSelectorPage

**Files:**
- Modify: `src/pages/BeanInfoPage.vue`

**Step 1: Watch workflow profile changes**

When the user navigates to `/profiles`, selects a profile (which calls `updateWorkflow({ profile })`), and returns to `/bean-info`, the workflow will have the new profile. Add a watcher:

```js
watch(() => workflow?.profile, (newProfile) => {
  if (newProfile && !_updating) {
    profileTitle.value = newProfile.title ?? ''
    // Try to extract profile ID if available
    // The workflow doesn't directly expose profileId, but we can store it
  }
}, { deep: true })
```

This ensures the profile section updates when returning from ProfileSelectorPage.

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```
feat: sync profile title from workflow in workflow editor
```

---

### Task 9: Final cleanup and build verification

**Files:**
- Modify: `src/pages/IdlePage.vue` — remove any remaining unused imports
- Modify: `src/pages/BeanInfoPage.vue` — remove unused `beverageType` from `saveToWorkflow`

**Step 1: Remove unused imports and refs**

In IdlePage: remove `ProfilePreviewPopup` import if still present, remove `getProfiles` import if no longer used (check — it's still needed for combo loading).

In BeanInfoPage: clean up any references to `beanPresets`, `selectedBeanPreset`, `beverageType`, `BEVERAGE_TYPES`.

**Step 2: Full build verification**

Run: `npm run build`
Expected: Clean build, no warnings about unused imports.

**Step 3: Manual test checklist**

- Home screen shows combo pills (empty state: no pills shown)
- Tapping a combo loads profile + beans + dose + grinder + optional settings
- Long-press opens name/emoji editor
- Action buttons (Espresso, Steam, etc.) work as before
- Workflow Editor (`/bean-info`) shows profile section, beans, grinder, dose, collapsible operation sections
- "Save as New" creates a new combo visible on home screen
- "Apply" pushes to workflow API without saving a combo
- Shot plan zone shows loaded data

**Step 4: Commit**

```
chore: clean up unused imports after workflow combos refactor
```
