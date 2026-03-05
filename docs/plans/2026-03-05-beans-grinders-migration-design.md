# Beans, Grinders & Workflow Context Migration

Date: 2026-03-05

## Goal

Migrate from legacy workflow fields (`doseData`, `grinderData`, `coffeeData`) to the new `context`-based workflow model. Add full support for managed bean and grinder entities with CRUD APIs, inline pickers in the workflow editor, and enriched shot history display.

## 1. API Layer

New REST functions in `src/api/rest.js`:

**Beans:**
- `getBeans(params)` — `GET /api/v1/beans?includeArchived=false`
- `getBean(id)` — `GET /api/v1/beans/{id}`
- `createBean(data)` — `POST /api/v1/beans` (roaster + name required)
- `updateBean(id, data)` — `PUT /api/v1/beans/{id}` (partial update)
- `deleteBean(id)` — `DELETE /api/v1/beans/{id}`

**Batches:**
- `getBeanBatches(beanId, params)` — `GET /api/v1/beans/{beanId}/batches`
- `createBeanBatch(beanId, data)` — `POST /api/v1/beans/{beanId}/batches`
- `getBeanBatch(id)` — `GET /api/v1/bean-batches/{id}`
- `updateBeanBatch(id, data)` — `PUT /api/v1/bean-batches/{id}`
- `deleteBeanBatch(id)` — `DELETE /api/v1/bean-batches/{id}`

**Grinders:**
- `getGrinders(params)` — `GET /api/v1/grinders?includeArchived=false`
- `getGrinder(id)` — `GET /api/v1/grinders/{id}`
- `createGrinder(data)` — `POST /api/v1/grinders` (model required)
- `updateGrinder(id, data)` — `PUT /api/v1/grinders/{id}`
- `deleteGrinder(id)` — `DELETE /api/v1/grinders/{id}`

## 2. Composables

### useWorkflow update

- Add `context` to the reactive workflow object
- `applyData()` reads `context` first, falls back to legacy fields
- All writes use `context` shape: `targetDoseWeight`, `targetYield`, `grinderId`, `grinderModel`, `grinderSetting`, `beanBatchId`, `coffeeName`, `coffeeRoaster`
- Remove `doseData`/`grinderData`/`coffeeData` from the reactive model, replace with computed accessors that read from `context` for incremental migration

### New useBeans composable

- Reactive list of beans, loading/error state
- `refresh()`, `create()`, `update()`, `remove()`
- `getBatches(beanId)`, `createBatch(beanId, data)`, `updateBatch(id, data)`, `removeBatch(id)`
- `activeBatchForBean(beanId)` — returns most recent non-frozen, non-archived batch
- Provided at app level in App.vue

### New useGrinders composable

- Reactive list of grinders, loading/error state
- `refresh()`, `create()`, `update()`, `remove()`
- Provided at app level in App.vue

## 3. Consumer Migration

Field mapping from legacy to context:

| Legacy | Context |
|--------|---------|
| `doseData.doseIn` / `doseData.dose` | `context.targetDoseWeight` |
| `doseData.doseOut` / `doseData.targetWeight` | `context.targetYield` |
| `coffeeData.name` | `context.coffeeName` |
| `coffeeData.roaster` | `context.coffeeRoaster` |
| `grinderData.model` / `grinderData.grinder` | `context.grinderModel` |
| `grinderData.setting` / `grinderData.grindSetting` | `context.grinderSetting` |

Files to update:
- `App.vue` — targetWeight computed
- `IdlePage.vue` — workflow summary display + combo apply
- `EspressoPage.vue` — dose/grinder display, brew dialog props, workflow writes
- `PostShotReviewPage.vue` — shot info display + save edits
- `ShotHistoryPage.vue` — flatten shot data for list
- `ShotDetailPage.vue` — shot detail display
- `LayoutWidget.vue` — widget data display
- `BeanInfoPage.vue` — full rewrite (see section 4)
- `useVolumeMode.js` — dose for volume calculations

For shot records: read `context` first, fall back to legacy fields. Both may be present.

## 4. BeanInfoPage Workflow Editor

### Coffee column — inline bean picker

- Dropdown listing beans from `useBeans` (shows "roaster — name")
- On select: auto-select latest active batch (non-frozen, non-archived)
- Batch info shown inline: roast date, days since roast, weight remaining
- "Switch batch" link if multiple batches exist — opens mini-list
- "+" button for quick inline creation (roaster + name)
- "Manage..." link to Settings > Beans tab
- Free-text fallback: clearing selector allows manual name/roaster entry

### Grinder column — inline grinder picker

- Dropdown listing grinders from `useGrinders` (shows model name)
- On select: populates `grinderId` and `grinderModel` in context
- Grinder setting input adapts to `settingType`:
  - **numeric**: ValueInput with `settingSmallStep`/`settingBigStep` from grinder entity
  - **preset**: dropdown/pill selector with `settingValues` array
- "+" button for quick inline creation (model name)
- "Manage..." link to Settings > Grinders tab
- Free-text fallback same as coffee

### Dose column

Unchanged UI (ValueInput for doseIn/doseOut/ratio), writes `targetDoseWeight`/`targetYield` to context.

### saveToWorkflow()

Writes `context` object with entity IDs when managed entities are selected. Display strings always included for self-contained shot records.

## 5. Shot Pages — Editing & Enrichment

### Editing (PostShotReviewPage + ShotDetailPage)

Both pages get the same entity pickers as BeanInfoPage:
- Bean picker with batch selection
- Grinder picker with setting type-aware input
- Save back via `updateShot()` writing to shot's context

### Enrichment (ShotHistoryPage + ShotDetailPage + PostShotReviewPage)

When shot records contain entity IDs (`grinderId`, `beanBatchId`):
- Fetch linked entities for extra details (country, processing, burrs, etc.)
- Cache fetched entities in composable (shared across shots with same entities)
- Render display strings immediately, swap in extra details when arrived (no spinners)
- Fallback: if fetch fails (entity deleted, network error), display `context` strings only

## 6. Settings Tabs

### BeansTab.vue

- List all beans (roaster + name) with archived toggle
- Expandable rows showing batches
- Create bean: roaster (required), name (required), country, processing, variety
- Edit bean inline
- Batch management per bean: create (roast date, weight, price, currency), edit, archive
- Batch rows show: roast date, days since roast, weight remaining, frozen badge
- Delete bean with confirmation (deletes all batches)

### GrindersTab.vue

- List all grinders with archived toggle
- Create grinder: model (required), burrs, burr size, burr type, setting type
- Numeric type: configure small step / big step
- Preset type: configure setting values list (add/remove/reorder)
- Edit, archive, delete grinder

Both tabs follow existing settings tab visual patterns.

## 7. Grinder Setting Type Awareness

Everywhere a grinder setting appears (BeanInfoPage, PostShotReviewPage, ShotDetailPage), the input respects the grinder entity's `settingType`:
- **numeric**: ValueInput with `settingSmallStep`/`settingBigStep` as step sizes
- **preset**: dropdown/pill selector with `settingValues` array
- **no managed grinder**: plain text input (free-text fallback)
