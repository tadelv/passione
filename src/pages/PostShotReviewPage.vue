<script setup>
import { ref, shallowRef, markRaw, computed, inject, onMounted, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import HistoryShotGraph from '../components/HistoryShotGraph.vue'
import RatingInput from '../components/RatingInput.vue'
import ValueInput from '../components/ValueInput.vue'
import SuggestionField from '../components/SuggestionField.vue'
import BottomBar from '../components/BottomBar.vue'
import PhaseSummaryPanel from '../components/PhaseSummaryPanel.vue'
import BeanLinkBadge from '../components/BeanLinkBadge.vue'
import { getShot, updateShot, callPluginEndpoint } from '../api/rest.js'
import { normalizeShot } from '../composables/useShotNormalize'
import { useBeanLink } from '../composables/useBeanLink'
import { useShotCache } from '../composables/useShotCache'
import { useShotHistorySuggestions } from '../composables/useShotHistorySuggestions'

const { suggestions: historySuggestions, load: loadSuggestions, invalidate: invalidateSuggestions } = useShotHistorySuggestions()
const shotCache = useShotCache()

const route = useRoute()
const router = useRouter()
const settings = inject('settings', null)
const beans = inject('beans', ref([]))
const beansApi = inject('beansApi', null)
const grinders = inject('grinders', ref([]))
const grindersApi = inject('grindersApi', null)

const shotId = computed(() => route.params.id)
// shallowRef + markRaw — full shot carries measurements[] and profile.frames;
// edits are tracked in separate local refs and committed via updateShot().
const shot = shallowRef(null)
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)
const confirmLeave = ref(false)
const uploading = ref(false)
const toast = inject('toast', null)
let pendingNavigation = null

// Entity enrichment
const enrichedGrinder = ref(null)

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
const grinderRpm = ref(1200)
const basketSize = ref(18)
const basketType = ref('')

// Bean-batch link state. The bean text fields (`beanBrand`, `roaster`)
// are pegged to the linked bean's record while linked, eliminating the
// drift class of bugs where typed text gets out of sync with the link.
const {
  selectedBeanId,
  selectedBatchId,
  linkedBean,
  linkedBatch,
  isLinked,
  enterLinked,
  clearLink,
  hydrateFromContext,
} = useBeanLink({ beans, beansApi, coffeeName: beanBrand, roaster })

const batchesForBean = ref([])

watch(selectedBeanId, async (id) => {
  if (!id || !beansApi) {
    batchesForBean.value = []
    return
  }
  batchesForBean.value = await beansApi.getBatches(id).catch(() => []) ?? []
})

async function enrichShot(s) {
  enrichedGrinder.value = null
  await hydrateFromContext({ beanBatchId: s.beanBatchId })
  // Successful link: drop the stored coffeeName copy too. On failure the
  // hydrate path leaves the link clear and the stored values remain as a
  // legacy fallback for display.
  if (isLinked.value) beanType.value = ''
  if (s.grinderId && grindersApi) {
    try {
      const g = await grindersApi.getById(s.grinderId)
      if (g) enrichedGrinder.value = g
    } catch {}
  }
}

async function onBeanSelect(beanId) {
  markDirty()
  if (!beanId) {
    clearLink()
    return
  }
  await enterLinked(beanId)
  // beanType holds coffeeName in this page; like roaster/beanBrand it is
  // redundant once the bean record is the source of truth.
  beanType.value = ''
}

function onBatchSelect(batchId) {
  if (!selectedBeanId.value) return
  markDirty()
  enterLinked(selectedBeanId.value, batchId)
}

// Computed EY
const extractionYield = computed(() => {
  if (doseIn.value > 0 && tds.value > 0 && doseOut.value > 0) {
    return ((tds.value / 100) * doseOut.value / doseIn.value * 100).toFixed(1)
  }
  return '--'
})

// Hints shown under the Dose Out field so the user can sanity-check the
// editable value against both the planned target and what the scale logged.
const targetYieldHint = computed(() => {
  const v = shot.value?.targetYield
  return v != null && v > 0 ? Number(v).toFixed(1) + ' g' : null
})
const scaleWeightHint = computed(() => {
  const v = shot.value?.finalWeight
  return v != null && v > 0 ? Number(v).toFixed(1) + ' g' : null
})


function populateFromShot(shot) {
  const s = normalizeShot(shot)
  const ann = shot.annotations ?? {}
  const extras = ann.extras ?? {}
  const meta = shot.metadata ?? {}
  roaster.value = s.coffeeRoaster ?? ''
  beanBrand.value = extras.beanBrand ?? meta.beanBrand ?? ''
  beanType.value = s.coffeeName ?? ''
  // Server may deliver a full ISO timestamp; the field wants a bare YYYY-MM-DD.
  roastDate.value = String(extras.roastDate ?? meta.roastDate ?? '').slice(0, 10)
  roastLevel.value = extras.roastLevel ?? meta.roastLevel ?? ''
  grinderModel.value = s.grinderModel ?? ''
  grinderSetting.value = s.grinderSetting != null ? String(s.grinderSetting) : ''
  beverageType.value = extras.beverageType ?? meta.beverageType ?? ''
  barista.value = extras.barista ?? meta.barista ?? ''
  doseIn.value = s.doseIn ?? 0
  // Prefer the actual final weight measured from the scale stream over the
  // dose-out fallback (which can be the planned target). The user can still
  // edit the value, but the default reflects what landed in the cup.
  doseOut.value = s.finalWeight ?? s.doseOut ?? 0
  tds.value = s.tds ?? meta.tds ?? 0
  rating.value = s.rating ?? settings?.settings?.defaultShotRating ?? 0
  notes.value = s.notes ?? ''
  const ctx = shot.workflow?.context ?? {}
  const ctxExtras = ctx.extras ?? {}
  grinderRpm.value = ctxExtras.grinderRpm ?? 1200
  basketSize.value = ctxExtras.basketSize ?? 18
  basketType.value = ctxExtras.basketType ?? ''
}

function populateFromSticky() {
  if (!settings) return
  const s = settings.settings
  if (!beanBrand.value && s.dyeBeanBrand) beanBrand.value = s.dyeBeanBrand
  if (!beanType.value && s.dyeBeanType) beanType.value = s.dyeBeanType
  if (!roastDate.value && s.dyeRoastDate) roastDate.value = s.dyeRoastDate
  if (!roastLevel.value && s.dyeRoastLevel) roastLevel.value = s.dyeRoastLevel
  if (!grinderModel.value && s.dyeGrinderModel) grinderModel.value = s.dyeGrinderModel
  if (!grinderSetting.value && s.dyeGrinderSetting) grinderSetting.value = s.dyeGrinderSetting
}

function saveSticky() {
  if (!settings) return
  // Bean fields are blank while linked (the bean record is the source of
  // truth) — skip those so we don't wipe sticky from a prior manual entry.
  if (!isLinked.value) {
    settings.settings.dyeBeanBrand = beanBrand.value
    settings.settings.dyeBeanType = beanType.value
    settings.settings.dyeRoastDate = roastDate.value
    settings.settings.dyeRoastLevel = roastLevel.value
  }
  settings.settings.dyeGrinderModel = grinderModel.value
  settings.settings.dyeGrinderSetting = grinderSetting.value
}

async function loadShot(id) {
  if (!id) return
  loading.value = true
  try {
    const result = await getShot(id)
    // Store the normalized shot so the template/computeds can read derived
    // fields (targetYield, finalWeight, etc.) — normalizeShot spreads the
    // raw record so workflow/measurements are still available.
    const normalized = markRaw(normalizeShot(result))
    shot.value = normalized
    populateFromShot(result)
    populateFromSticky()
    await enrichShot(normalized)
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
      if (toast) toast.success(`Uploaded to Visualizer (${res.visualizer_id})`)
    } else {
      if (toast) toast.success('Upload completed')
    }
  } catch (e) {
    if (toast) toast.error(e.message || 'Upload failed')
  }
  uploading.value = false
}

async function save() {
  if (!shotId.value || saving.value) return
  saving.value = true
  try {
    await updateShot(shotId.value, {
      annotations: {
        enjoyment: rating.value || undefined,
        espressoNotes: notes.value || undefined,
        actualDoseWeight: doseIn.value || undefined,
        actualYield: doseOut.value || undefined,
        drinkTds: tds.value || undefined,
        extras: {
          barista: barista.value || undefined,
          beanBrand: beanBrand.value || undefined,
          roastDate: roastDate.value || undefined,
          roastLevel: roastLevel.value || undefined,
          beverageType: beverageType.value || undefined,
        },
      },
      // Keep legacy fields for backward compatibility with older gateways
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
          // When a bean record is linked, the bean is the source of truth —
          // drop the redundant text copy. Explicit null clears any legacy
          // value the gateway may still hold on this shot.
          coffeeName: selectedBeanId.value ? null : (beanType.value || undefined),
          coffeeRoaster: selectedBeanId.value ? null : (roaster.value || undefined),
          grinderModel: grinderModel.value || undefined,
          grinderSetting: grinderSetting.value || undefined,
          beanBatchId: selectedBatchId.value || null,
          ...((settings?.settings?.showGrinderRpm || settings?.settings?.showBasketData)
            ? {
                extras: {
                  ...(shot.value?.workflow?.context?.extras ?? {}),
                  ...(settings?.settings?.showGrinderRpm
                    ? { grinderRpm: grinderRpm.value ?? null }
                    : {}),
                  ...(settings?.settings?.showBasketData
                    ? {
                        basketSize: basketSize.value ?? null,
                        basketType: basketType.value || null,
                      }
                    : {}),
                },
              }
            : {}),
        },
      },
    })
    saveSticky()
    // Annotations may have introduced new roaster/bean/grinder/barista names;
    // invalidate the suggestions cache so the next mount remines fresh data.
    invalidateSuggestions()
    await shotCache.patch(shotId.value)
    dirty.value = false
  } catch (e) {
    if (toast) toast.error(e.message || 'Failed to save')
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

function fmtDate(v) {
  return String(v ?? '').slice(0, 10)
}

onMounted(() => {
  loadShot(shotId.value)
  loadSuggestions()
})

watch(shotId, (id) => loadShot(id))

function goBack() {
  // Honest back: use SPA history when available, fall back to home on a
  // fresh load / direct URL (no predecessor). Previously this pushed to
  // /shot/:id, which combined with ShotDetailPage's "Edit Metadata" button
  // created a review ↔ detail loop with no exit but Home.
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push('/')
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
              <label class="review-page__label">Bean</label>
              <select class="review-page__select" :value="selectedBeanId" @change="onBeanSelect($event.target.value)">
                <option value="">Manual entry...</option>
                <option v-for="b in beans" :key="b.id" :value="b.id">{{ b.roaster }} — {{ b.name }}</option>
              </select>
            </div>

            <div v-if="isLinked && batchesForBean.length > 1" class="review-page__field">
              <label class="review-page__label">Batch</label>
              <select class="review-page__select" :value="selectedBatchId" @change="onBatchSelect($event.target.value)">
                <option v-for="b in batchesForBean" :key="b.id" :value="b.id">
                  {{ fmtDate(b.roastDate) || b.id }}{{ b.roastLevel ? ` — ${b.roastLevel}` : '' }}
                </option>
              </select>
            </div>

            <BeanLinkBadge
              :linked="isLinked"
              :bean-name="linkedBean?.name ?? ''"
              :batch-label="fmtDate(linkedBatch?.roastDate)"
              @clear="clearLink"
            />

            <!-- Manual mode: free-text fields -->
            <template v-if="!isLinked">
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
                <label class="review-page__label">Bean Type / Variety</label>
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
                  type="text"
                  inputmode="numeric"
                  pattern="\d{4}-\d{2}-\d{2}"
                  placeholder="YYYY-MM-DD"
                  maxlength="10"
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
            </template>

            <!-- Linked mode: read-only display sourced from the linked
                 records. Falls back to any legacy stored text (covers the
                 case where the upstream bean was deleted). -->
            <template v-else>
              <div class="review-page__field">
                <label class="review-page__label">Roaster</label>
                <span class="review-page__readonly">{{ linkedBean?.roaster || roaster }}</span>
              </div>

              <div class="review-page__field">
                <label class="review-page__label">Bean Brand</label>
                <span class="review-page__readonly">{{ linkedBean?.name || beanBrand }}</span>
              </div>

              <div v-if="linkedBatch?.roastDate" class="review-page__field">
                <label class="review-page__label">Roast Date</label>
                <span class="review-page__readonly">{{ fmtDate(linkedBatch.roastDate) }}</span>
              </div>

              <div v-if="linkedBatch?.roastLevel" class="review-page__field">
                <label class="review-page__label">Roast Level</label>
                <span class="review-page__readonly">{{ linkedBatch.roastLevel }}</span>
              </div>
            </template>
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

            <div v-if="settings?.settings?.showGrinderRpm" class="review-page__field" data-testid="review-grinderRpm-field">
              <label class="review-page__label">RPM</label>
              <ValueInput
                :model-value="grinderRpm"
                :min="enrichedGrinder?.extras?.rpmMin ?? 50"
                :max="enrichedGrinder?.extras?.rpmMax ?? 3000"
                :step="50" :decimals="0"
                @update:model-value="grinderRpm = $event; markDirty()"
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
              <div v-if="scaleWeightHint || targetYieldHint" class="review-page__hint">
                <span v-if="scaleWeightHint">scale: {{ scaleWeightHint }}</span>
                <span v-if="scaleWeightHint && targetYieldHint" class="review-page__hint-sep">·</span>
                <span v-if="targetYieldHint">target: {{ targetYieldHint }}</span>
              </div>
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

            <template v-if="settings?.settings?.showBasketData">
              <div class="review-page__field" data-testid="review-basketSize-field">
                <label class="review-page__label">Basket Size</label>
                <ValueInput
                  :model-value="basketSize"
                  :min="7" :max="22" :step="0.5" :decimals="1"
                  suffix=" g"
                  @update:model-value="basketSize = $event; markDirty()"
                />
              </div>

              <div class="review-page__field" data-testid="review-basketType-field">
                <label class="review-page__label">Basket Type</label>
                <SuggestionField
                  :model-value="basketType"
                  placeholder="e.g. IMS Competition"
                  :suggestions="historySuggestions.basketType"
                  @update:model-value="basketType = $event; markDirty()"
                />
              </div>
            </template>
          </div>
        </div>

        <!-- Phase summary -->
        <div class="review-page__phase-summary">
          <PhaseSummaryPanel :measurements="shot?.measurements ?? []" />
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
            class="review-page__action-btn review-page__save-btn"
            :disabled="saving || !dirty"
            @click="save"
          >
            {{ saving ? 'Saving...' : dirty ? 'Save' : 'Saved' }}
          </button>
          <button
            class="review-page__action-btn review-page__upload-btn"
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
  font-size: var(--font-md);
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

.review-page__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-top: 2px;
}

.review-page__hint-sep {
  opacity: 0.5;
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

.review-page__readonly {
  display: inline-block;
  padding: 0.5rem;
  color: var(--color-text-muted, rgba(255,255,255,0.6));
  font-style: italic;
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
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-primary);
}

.review-page__phase-summary {
  padding: 0 16px;
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
  padding: 12px 16px;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 8px;
}

.review-page__action-btn {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: transparent;
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.review-page__action-btn:active:not(:disabled) {
  opacity: 0.7;
}

.review-page__save-btn {
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
}

.review-page__save-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
}

.review-page__upload-btn {
  border: 1px solid var(--color-success);
  color: var(--color-success);
}

.review-page__upload-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
}

/* Confirm dialog */
.review-page__confirm {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-overlay);
  background: var(--color-overlay-backdrop);
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
  color: var(--color-text);
}

.review-page__confirm-btn--cancel {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.review-page__confirm-btn--save {
  background: var(--color-primary);
  color: var(--color-text);
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
