<script setup>
import { ref, computed, inject, onMounted, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import HistoryShotGraph from '../components/HistoryShotGraph.vue'
import RatingInput from '../components/RatingInput.vue'
import ValueInput from '../components/ValueInput.vue'
import SuggestionField from '../components/SuggestionField.vue'
import BottomBar from '../components/BottomBar.vue'
import { getShot, updateShot, getShotIds, getShots, callPluginEndpoint } from '../api/rest.js'
import { normalizeShot } from '../composables/useShotNormalize'

const route = useRoute()
const router = useRouter()
const settings = inject('settings', null)
const beans = inject('beans', ref([]))
const beansApi = inject('beansApi', null)
const grinders = inject('grinders', ref([]))
const grindersApi = inject('grindersApi', null)

const shotId = computed(() => route.params.id)
const shot = ref(null)
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)
const confirmLeave = ref(false)
const uploading = ref(false)
const toast = inject('toast', null)
let pendingNavigation = null

// Entity enrichment
const enrichedBean = ref(null)
const enrichedGrinder = ref(null)

async function enrichShot(s) {
  enrichedBean.value = null
  enrichedGrinder.value = null
  if (s.beanBatchId && beansApi) {
    try {
      const batch = await beansApi.getBatch(s.beanBatchId)
      if (batch?.beanId) {
        const bean = await beansApi.getById(batch.beanId)
        if (bean) enrichedBean.value = { ...bean, batch }
      }
    } catch {}
  }
  if (s.grinderId && grindersApi) {
    try {
      const g = await grindersApi.getById(s.grinderId)
      if (g) enrichedGrinder.value = g
    } catch {}
  }
}

// Editable fields
const roaster = ref('')
const beanBrand = ref('')
const beanType = ref('')
const roastDate = ref('')
const roastLevel = ref('')
const grinderModel = ref('')
const grinderSetting = ref('')
const beverageType = ref('')
const barista = ref('')
const doseIn = ref(0)
const doseOut = ref(0)
const tds = ref(0)
const rating = ref(0)
const notes = ref('')

// Computed EY
const extractionYield = computed(() => {
  if (doseIn.value > 0 && tds.value > 0 && doseOut.value > 0) {
    return ((tds.value / 100) * doseOut.value / doseIn.value * 100).toFixed(1)
  }
  return '--'
})

// Suggestions from history
const historySuggestions = ref({
  roaster: [],
  beanBrand: [],
  beanType: [],
  grinderModel: [],
  grinderSetting: [],
  barista: [],
})

async function loadSuggestions() {
  try {
    const ids = await getShotIds()
    const idList = Array.isArray(ids) ? ids : (ids?.ids ?? [])
    // Load recent shots for suggestion mining (limit to 100)
    const recentIds = idList.slice(0, 100)
    if (recentIds.length === 0) return
    const result = await getShots(recentIds)
    const shots = Array.isArray(result) ? result : (result?.shots ?? [])

    const sets = {
      roaster: new Set(),
      beanBrand: new Set(),
      beanType: new Set(),
      grinderModel: new Set(),
      grinderSetting: new Set(),
      barista: new Set(),
    }

    for (const raw of shots) {
      const n = normalizeShot(raw)
      const meta = raw.metadata ?? {}

      if (n.coffeeRoaster) sets.roaster.add(n.coffeeRoaster)
      if (meta.beanBrand) sets.beanBrand.add(meta.beanBrand)
      if (n.coffeeName) sets.beanType.add(n.coffeeName)
      if (n.grinderModel) sets.grinderModel.add(n.grinderModel)
      if (n.grinderSetting != null) sets.grinderSetting.add(String(n.grinderSetting))
      if (meta.barista) sets.barista.add(meta.barista)
    }

    historySuggestions.value = {
      roaster: [...sets.roaster].sort(),
      beanBrand: [...sets.beanBrand].sort(),
      beanType: [...sets.beanType].sort(),
      grinderModel: [...sets.grinderModel].sort(),
      grinderSetting: [...sets.grinderSetting].sort(),
      barista: [...sets.barista].sort(),
    }
  } catch {
    // Suggestions are optional
  }
}

function populateFromShot(shot) {
  const s = normalizeShot(shot)
  const meta = shot.metadata ?? {}
  roaster.value = s.coffeeRoaster ?? ''
  beanBrand.value = meta.beanBrand ?? ''
  beanType.value = s.coffeeName ?? ''
  roastDate.value = meta.roastDate ?? ''
  roastLevel.value = meta.roastLevel ?? ''
  grinderModel.value = s.grinderModel ?? ''
  grinderSetting.value = s.grinderSetting != null ? String(s.grinderSetting) : ''
  beverageType.value = meta.beverageType ?? ''
  barista.value = meta.barista ?? ''
  doseIn.value = s.doseIn ?? 0
  doseOut.value = s.doseOut ?? 0
  tds.value = meta.tds ?? 0
  rating.value = s.rating ?? 0
  notes.value = shot.shotNotes ?? ''
}

function populateFromSticky() {
  if (!settings) return
  const s = settings.settings
  if (!roaster.value && s.dyeBeanBrand) beanBrand.value = s.dyeBeanBrand
  if (!beanType.value && s.dyeBeanType) beanType.value = s.dyeBeanType
  if (!roastDate.value && s.dyeRoastDate) roastDate.value = s.dyeRoastDate
  if (!roastLevel.value && s.dyeRoastLevel) roastLevel.value = s.dyeRoastLevel
  if (!grinderModel.value && s.dyeGrinderModel) grinderModel.value = s.dyeGrinderModel
  if (!grinderSetting.value && s.dyeGrinderSetting) grinderSetting.value = s.dyeGrinderSetting
}

function saveSticky() {
  if (!settings) return
  settings.settings.dyeBeanBrand = beanBrand.value
  settings.settings.dyeBeanType = beanType.value
  settings.settings.dyeRoastDate = roastDate.value
  settings.settings.dyeRoastLevel = roastLevel.value
  settings.settings.dyeGrinderModel = grinderModel.value
  settings.settings.dyeGrinderSetting = grinderSetting.value
}

async function loadShot(id) {
  if (!id) return
  loading.value = true
  try {
    const result = await getShot(id)
    shot.value = result
    populateFromShot(result)
    populateFromSticky()
    const normalized = normalizeShot(result)
    enrichShot(normalized)
  } catch {
    shot.value = null
  }
  loading.value = false
  dirty.value = false
}

// Track changes
function markDirty() {
  dirty.value = true
}

async function uploadToVisualizer() {
  if (!shotId.value || uploading.value) return
  uploading.value = true
  try {
    const res = await callPluginEndpoint('visualizer.reaplugin', 'upload', 'POST', {
      shotId: shotId.value,
    })
    if (res?.visualizer_id) {
      if (toast) toast(`Uploaded to Visualizer (${res.visualizer_id})`)
    } else {
      if (toast) toast('Upload completed')
    }
  } catch (e) {
    if (toast) toast(e.message || 'Upload failed')
  }
  uploading.value = false
}

async function save() {
  if (!shotId.value || saving.value) return
  saving.value = true
  try {
    await updateShot(shotId.value, {
      shotNotes: notes.value || undefined,
      metadata: {
        rating: rating.value,
        barista: barista.value || undefined,
        beanBrand: beanBrand.value || undefined,
        roastDate: roastDate.value || undefined,
        roastLevel: roastLevel.value || undefined,
        beverageType: beverageType.value || undefined,
        tds: tds.value || undefined,
      },
      workflow: {
        context: {
          targetDoseWeight: doseIn.value || undefined,
          targetYield: doseOut.value || undefined,
          coffeeName: beanType.value || undefined,
          coffeeRoaster: roaster.value || undefined,
          grinderModel: grinderModel.value || undefined,
          grinderSetting: grinderSetting.value || undefined,
        },
      },
    })
    saveSticky()
    dirty.value = false
  } catch (e) {
    if (toast) toast(e.message || 'Failed to save')
  }
  saving.value = false
}

// Navigation guard for unsaved changes
onBeforeRouteLeave((to, from, next) => {
  if (!dirty.value) {
    next()
    return
  }
  pendingNavigation = next
  confirmLeave.value = true
})

function discardAndLeave() {
  confirmLeave.value = false
  dirty.value = false
  if (pendingNavigation) {
    pendingNavigation()
    pendingNavigation = null
  }
}

function cancelLeave() {
  confirmLeave.value = false
  if (pendingNavigation) {
    pendingNavigation(false)
    pendingNavigation = null
  }
}

async function saveAndLeave() {
  await save()
  confirmLeave.value = false
  if (pendingNavigation) {
    pendingNavigation()
    pendingNavigation = null
  }
}

const profileName = computed(() =>
  shot.value?.workflow?.profile?.title ?? shot.value?.workflow?.name ?? 'Unknown Profile'
)

const ROAST_LEVELS = ['Light', 'Medium-Light', 'Medium', 'Medium-Dark', 'Dark']
const BEVERAGE_TYPES = ['Espresso', 'Lungo', 'Ristretto', 'Filter', 'Americano', 'Latte', 'Cappuccino', 'Other']

onMounted(() => {
  loadShot(shotId.value)
  loadSuggestions()
})

watch(shotId, (id) => loadShot(id))

function goBack() {
  if (shotId.value) {
    router.push(`/shot/${encodeURIComponent(shotId.value)}`)
  } else {
    router.push('/history')
  }
}
</script>

<template>
  <div class="review-page">
    <div v-if="loading" class="review-page__loading">Loading...</div>

    <template v-else-if="shot">
      <div class="review-page__scroll" @input="markDirty">
        <!-- Graph -->
        <div class="review-page__graph">
          <HistoryShotGraph :shot="shot" />
        </div>

        <div class="review-page__header">
          <span class="review-page__profile">{{ profileName }}</span>
        </div>

        <!-- Fields grid -->
        <div class="review-page__grid">
          <!-- Column 1: Bean Info -->
          <div class="review-page__section">
            <span class="review-page__section-title">Bean Info</span>

            <div class="review-page__field">
              <label class="review-page__label">Roaster</label>
              <SuggestionField
                v-model="roaster"
                placeholder="Roaster"
                :suggestions="historySuggestions.roaster"
              />
            </div>

            <div class="review-page__field">
              <label class="review-page__label">Bean Brand</label>
              <SuggestionField
                v-model="beanBrand"
                placeholder="Bean brand"
                :suggestions="historySuggestions.beanBrand"
              />
            </div>

            <div class="review-page__field">
              <label class="review-page__label">Bean Type</label>
              <SuggestionField
                v-model="beanType"
                placeholder="Bean type"
                :suggestions="historySuggestions.beanType"
              />
            </div>

            <div class="review-page__field">
              <label class="review-page__label">Roast Date</label>
              <input
                v-model="roastDate"
                type="date"
                class="review-page__input"
              />
            </div>

            <div class="review-page__field">
              <label class="review-page__label">Roast Level</label>
              <select v-model="roastLevel" class="review-page__select">
                <option value="">--</option>
                <option v-for="rl in ROAST_LEVELS" :key="rl" :value="rl">{{ rl }}</option>
              </select>
            </div>

            <div v-if="enrichedBean" class="review-page__enriched">
              <span class="review-page__enriched-label">Linked Bean:</span>
              <span class="review-page__enriched-value">{{ enrichedBean.name }}</span>
              <span v-if="enrichedBean.batch?.label" class="review-page__enriched-value"> — {{ enrichedBean.batch.label }}</span>
            </div>
          </div>

          <!-- Column 2: Grinder / Beverage -->
          <div class="review-page__section">
            <span class="review-page__section-title">Grinder / Beverage</span>

            <div class="review-page__field">
              <label class="review-page__label">Grinder</label>
              <SuggestionField
                v-model="grinderModel"
                placeholder="Grinder model"
                :suggestions="historySuggestions.grinderModel"
              />
            </div>

            <div class="review-page__field">
              <label class="review-page__label">Grind Setting</label>
              <SuggestionField
                v-model="grinderSetting"
                placeholder="Setting"
                :suggestions="historySuggestions.grinderSetting"
              />
            </div>

            <div class="review-page__field">
              <label class="review-page__label">Beverage Type</label>
              <select v-model="beverageType" class="review-page__select">
                <option value="">--</option>
                <option v-for="bt in BEVERAGE_TYPES" :key="bt" :value="bt">{{ bt }}</option>
              </select>
            </div>

            <div class="review-page__field">
              <label class="review-page__label">Barista</label>
              <SuggestionField
                v-model="barista"
                placeholder="Barista"
                :suggestions="historySuggestions.barista"
              />
            </div>

            <div v-if="enrichedGrinder" class="review-page__enriched">
              <span class="review-page__enriched-label">Linked Grinder:</span>
              <span class="review-page__enriched-value">{{ enrichedGrinder.manufacturer }} {{ enrichedGrinder.model }}</span>
            </div>
          </div>

          <!-- Column 3: Measurements -->
          <div class="review-page__section">
            <span class="review-page__section-title">Measurements</span>

            <div class="review-page__field">
              <label class="review-page__label">Dose In</label>
              <ValueInput
                :model-value="doseIn"
                :min="0" :max="50" :step="0.1" :decimals="1"
                suffix=" g"
                @update:model-value="doseIn = $event; markDirty()"
              />
            </div>

            <div class="review-page__field">
              <label class="review-page__label">Dose Out</label>
              <ValueInput
                :model-value="doseOut"
                :min="0" :max="150" :step="0.5" :decimals="1"
                suffix=" g"
                @update:model-value="doseOut = $event; markDirty()"
              />
            </div>

            <div class="review-page__field">
              <label class="review-page__label">TDS %</label>
              <ValueInput
                :model-value="tds"
                :min="0" :max="30" :step="0.1" :decimals="1"
                suffix="%"
                @update:model-value="tds = $event; markDirty()"
              />
            </div>

            <div class="review-page__field">
              <label class="review-page__label">EY %</label>
              <span class="review-page__ey">{{ extractionYield }}%</span>
            </div>
          </div>
        </div>

        <!-- Rating -->
        <div class="review-page__rating-section">
          <span class="review-page__section-title">Rating</span>
          <RatingInput
            :model-value="rating"
            @update:model-value="rating = $event; markDirty()"
          />
        </div>

        <!-- Notes -->
        <div class="review-page__notes-section">
          <span class="review-page__section-title">Notes</span>
          <textarea
            v-model="notes"
            class="review-page__textarea"
            placeholder="Tasting notes, observations..."
            rows="3"
          />
        </div>

        <!-- Save / Upload buttons -->
        <div class="review-page__save-row">
          <button
            class="review-page__save-btn"
            :disabled="saving || !dirty"
            @click="save"
          >
            {{ saving ? 'Saving...' : dirty ? 'Save' : 'Saved' }}
          </button>
          <button
            class="review-page__upload-btn"
            :disabled="uploading"
            @click="uploadToVisualizer"
          >
            {{ uploading ? 'Uploading...' : 'Upload to Visualizer' }}
          </button>
        </div>
      </div>
    </template>

    <div v-else class="review-page__loading">Shot not found.</div>

    <BottomBar title="Shot Review" @back="goBack" />

    <!-- Unsaved changes confirmation -->
    <Transition name="confirm-fade">
      <div v-if="confirmLeave" class="review-page__confirm" @click.self="cancelLeave">
        <div class="review-page__confirm-card">
          <span class="review-page__confirm-text">You have unsaved changes.</span>
          <div class="review-page__confirm-actions">
            <button class="review-page__confirm-btn review-page__confirm-btn--discard" @click="discardAndLeave">
              Discard
            </button>
            <button class="review-page__confirm-btn review-page__confirm-btn--cancel" @click="cancelLeave">
              Stay
            </button>
            <button class="review-page__confirm-btn review-page__confirm-btn--save" @click="saveAndLeave">
              Save & Leave
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.review-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.review-page__loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.review-page__scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 16px;
}

.review-page__graph {
  height: 200px;
  flex-shrink: 0;
  padding: 8px 16px;
}

.review-page__header {
  padding: 4px 16px 8px;
}

.review-page__profile {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
}

.review-page__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  padding: 0 16px;
}

@media (min-width: 768px) {
  .review-page__grid {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

.review-page__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
}

.review-page__section-title {
  font-size: var(--font-label);
  font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.review-page__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.review-page__label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

.review-page__input,
.review-page__select {
  height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-body);
  outline: none;
}

.review-page__input:focus,
.review-page__select:focus {
  border-color: var(--color-primary);
}

.review-page__enriched {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
}

.review-page__enriched-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.review-page__enriched-value {
  font-size: var(--font-caption);
  color: var(--color-text);
}

.review-page__ey {
  height: 44px;
  display: flex;
  align-items: center;
  font-size: 20px;
  font-weight: bold;
  color: var(--color-primary);
}

.review-page__rating-section {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-page__notes-section {
  padding: 0 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-page__textarea {
  width: 100%;
  min-height: 80px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
  font-family: inherit;
  resize: vertical;
  outline: none;
}

.review-page__textarea:focus {
  border-color: var(--color-primary);
}

.review-page__textarea::placeholder {
  color: var(--color-text-secondary);
}

.review-page__save-row {
  padding: 8px 16px;
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.review-page__save-btn {
  min-width: 160px;
  height: 48px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.review-page__save-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.review-page__save-btn:active:not(:disabled) {
  filter: brightness(0.85);
}

.review-page__upload-btn {
  min-width: 160px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--color-success);
  background: transparent;
  color: var(--color-success);
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.review-page__upload-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.review-page__upload-btn:active:not(:disabled) {
  filter: brightness(0.85);
}

/* Confirm dialog */
.review-page__confirm {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 700;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.review-page__confirm-card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 24px;
  width: 90%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.review-page__confirm-text {
  font-size: var(--font-body);
  color: var(--color-text);
  text-align: center;
}

.review-page__confirm-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}

.review-page__confirm-btn {
  flex: 1;
  height: 40px;
  border-radius: 10px;
  border: none;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.review-page__confirm-btn:active {
  filter: brightness(0.85);
}

.review-page__confirm-btn--discard {
  background: var(--color-error);
  color: #fff;
}

.review-page__confirm-btn--cancel {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.review-page__confirm-btn--save {
  background: var(--color-primary);
  color: #fff;
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.15s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
</style>
