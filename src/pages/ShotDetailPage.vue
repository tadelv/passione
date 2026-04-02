<script setup>
import { ref, computed, onMounted, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HistoryShotGraph from '../components/HistoryShotGraph.vue'
import RatingInput from '../components/RatingInput.vue'
import BottomBar from '../components/BottomBar.vue'
import SwipeableArea from '../components/SwipeableArea.vue'
import { getShot, getShotIds, updateShot, deleteShot, callPluginEndpoint } from '../api/rest.js'
import { normalizeShot } from '../composables/useShotNormalize'

const route = useRoute()
const router = useRouter()
const beansApi = inject('beansApi', null)
const grindersApi = inject('grindersApi', null)

const shotId = computed(() => route.params.id)
const shot = ref(null)
const loading = ref(true)
const confirmingDelete = ref(false)
const rating = ref(0)

// Shot navigation support (swipe between shots)
const allShotIds = ref([])
const currentIndex = computed(() => {
  if (!allShotIds.value.length) return -1
  return allShotIds.value.indexOf(shotId.value)
})

const positionText = computed(() => {
  if (currentIndex.value < 0 || !allShotIds.value.length) return ''
  return `${currentIndex.value + 1} / ${allShotIds.value.length}`
})

async function loadShotIds() {
  try {
    const result = await getShotIds()
    allShotIds.value = Array.isArray(result) ? result : (result?.ids ?? [])
  } catch {
    allShotIds.value = []
  }
}

function navigateShot(delta) {
  if (!allShotIds.value.length || currentIndex.value < 0) return
  let next = currentIndex.value + delta
  // Wrap around
  if (next < 0) next = allShotIds.value.length - 1
  if (next >= allShotIds.value.length) next = 0
  const nextId = allShotIds.value[next]
  if (nextId) router.replace(`/shot/${encodeURIComponent(nextId)}`)
}

function onSwipeLeft() { navigateShot(1) }
function onSwipeRight() { navigateShot(-1) }

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

async function loadShot(id) {
  if (!id) return
  loading.value = true
  try {
    const raw = await getShot(id)
    if (raw) {
      const result = normalizeShot(raw)
      const w = raw.workflow ?? {}
      const meta = raw.metadata ?? {}

      // Fields not covered by normalizeShot
      if (!result.profileName) result.profileName = w.profile?.title ?? w.name ?? null
      if (result.barista == null) result.barista = meta.barista ?? null
      if (result.notes == null && result.shotNotes != null) result.notes = result.shotNotes
      if (!result.profile && w.profile) result.profile = w.profile
      if (result.duration == null && result.measurements?.length >= 2) {
        const first = result.measurements[0]
        const last = result.measurements[result.measurements.length - 1]
        const getTs = (m) => {
          if (m.elapsed != null) return m.elapsed
          const ts = m.machine?.timestamp ?? m.timestamp
          return ts ? new Date(ts).getTime() / 1000 : 0
        }
        const d = getTs(last) - getTs(first)
        if (d > 0) result.duration = d
      }

      shot.value = result
      rating.value = result.rating ?? result.metadata?.rating ?? 0
      enrichShot(result)
    } else {
      shot.value = null
    }
  } catch {
    shot.value = null
  }
  loading.value = false
}

onMounted(() => {
  loadShot(shotId.value)
  loadShotIds()
})
watch(shotId, (id) => loadShot(id))

// Metrics
const duration = computed(() => {
  const d = shot.value?.duration
  if (!d || d <= 0) return '--'
  const mins = Math.floor(d / 60)
  const secs = Math.floor(d % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
})

const dose = computed(() => {
  const v = shot.value?.doseIn
  return v != null ? Number(v).toFixed(1) + 'g' : '--'
})

const output = computed(() => {
  const v = shot.value?.doseOut
  return v != null ? Number(v).toFixed(1) + 'g' : '--'
})

const ratio = computed(() => {
  const d = shot.value?.doseIn
  const o = shot.value?.doseOut
  if (d && o && d > 0) return `1:${(o / d).toFixed(1)}`
  return '--'
})

const profileName = computed(() =>
  shot.value?.profileName ?? shot.value?.profile?.title ?? 'Unknown Profile'
)

const shotDate = computed(() => {
  const ts = shot.value?.timestamp ?? shot.value?.date
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString()
})

const notes = computed(() => shot.value?.notes ?? '')

// Rating updates
async function onRatingChange(val) {
  rating.value = val
  if (shotId.value) {
    try {
      await updateShot(shotId.value, { metadata: { rating: val } })
    } catch {
      // ignore
    }
  }
}

async function onDelete() {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  try {
    await deleteShot(shotId.value)
    router.push('/history')
  } catch {
    // ignore
  }
  confirmingDelete.value = false
}

function cancelDelete() {
  confirmingDelete.value = false
}

// ---- Visualizer Upload ----
const uploading = ref(false)
const toast = inject('toast', null)

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

</script>

<template>
  <div class="shot-detail">
    <div class="shot-detail__scroll">
    <div v-if="loading" class="shot-detail__loading">Loading shot...</div>

    <template v-else-if="shot">
      <!-- Graph with swipe navigation -->
      <SwipeableArea
        class="shot-detail__graph"
        @swipe-left="onSwipeLeft"
        @swipe-right="onSwipeRight"
      >
        <HistoryShotGraph :shot="shot" />
      </SwipeableArea>
      <div v-if="positionText" class="shot-detail__position">
        {{ positionText }}
      </div>

      <!-- Metrics row -->
      <div class="shot-detail__metrics">
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value">{{ duration }}</span>
          <span class="shot-detail__metric-label">Duration</span>
        </div>
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value" style="color: var(--color-dye-dose)">{{ dose }}</span>
          <span class="shot-detail__metric-label">Dose</span>
        </div>
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value" style="color: var(--color-dye-output)">{{ output }}</span>
          <span class="shot-detail__metric-label">Output</span>
        </div>
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value">{{ ratio }}</span>
          <span class="shot-detail__metric-label">Ratio</span>
        </div>
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value" style="color: var(--color-warning)">
            {{ rating > 0 ? rating + '%' : '--' }}
          </span>
          <span class="shot-detail__metric-label">Rating</span>
        </div>
      </div>

      <!-- Info cards -->
      <div class="shot-detail__info">
        <div class="shot-detail__card">
          <span class="shot-detail__card-label">Profile</span>
          <span class="shot-detail__card-value">{{ profileName }}</span>
        </div>
        <div class="shot-detail__card">
          <span class="shot-detail__card-label">Date</span>
          <span class="shot-detail__card-value">{{ shotDate }}</span>
        </div>

        <div v-if="shot.coffeeName || shot.coffeeRoaster" class="shot-detail__card">
          <span class="shot-detail__card-label">Coffee</span>
          <span class="shot-detail__card-value">
            {{ [shot.coffeeRoaster, shot.coffeeName].filter(Boolean).join(' — ') }}
            <span v-if="enrichedBean?.country" class="shot-detail__card-detail"> &middot; {{ enrichedBean.country }}</span>
            <span v-if="enrichedBean?.processing" class="shot-detail__card-detail"> &middot; {{ enrichedBean.processing }}</span>
          </span>
        </div>

        <div v-if="shot.grinderModel" class="shot-detail__card">
          <span class="shot-detail__card-label">Grinder</span>
          <span class="shot-detail__card-value">
            {{ shot.grinderModel }}
            <template v-if="shot.grinderSetting"> @ {{ shot.grinderSetting }}</template>
            <span v-if="enrichedGrinder?.burrs" class="shot-detail__card-detail"> &middot; {{ enrichedGrinder.burrs }}</span>
          </span>
        </div>

        <div v-if="notes" class="shot-detail__card shot-detail__card--full">
          <span class="shot-detail__card-label">Notes</span>
          <span class="shot-detail__card-value">{{ notes }}</span>
        </div>

        <!-- Rating -->
        <div class="shot-detail__card shot-detail__card--full">
          <span class="shot-detail__card-label">Rating</span>
          <RatingInput
            :model-value="rating"
            @update:model-value="onRatingChange"
          />
        </div>
      </div>

      <!-- Action buttons -->
      <div class="shot-detail__actions">
        <button
          class="shot-detail__upload-btn"
          :disabled="uploading"
          @click="uploadToVisualizer"
        >
          {{ uploading ? 'Uploading...' : 'Upload to Visualizer' }}
        </button>

        <button
          class="shot-detail__edit-btn"
          @click="router.push(`/shot-review/${encodeURIComponent(shotId)}`)"
        >
          Edit Metadata
        </button>

        <button
          v-if="!confirmingDelete"
          class="shot-detail__delete-btn"
          @click="onDelete"
        >
          Delete Shot
        </button>
        <template v-else>
          <span class="shot-detail__confirm-text">Delete this shot? This cannot be undone.</span>
          <div class="shot-detail__confirm-btns">
            <button class="shot-detail__cancel-btn" @click="cancelDelete">Cancel</button>
            <button class="shot-detail__confirm-delete-btn" @click="onDelete">Delete</button>
          </div>
        </template>
      </div>
    </template>

    <div v-else class="shot-detail__empty">Shot not found.</div>
    </div>

    <BottomBar title="Shot Detail" @back="router.back()" />
  </div>
</template>

<style scoped>
.shot-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.shot-detail__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.shot-detail__loading,
.shot-detail__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.shot-detail__graph {
  height: 40vh;
  min-height: 250px;
  flex-shrink: 0;
  padding: 8px 16px;
}

.shot-detail__position {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  padding-bottom: 4px;
}

.shot-detail__metrics {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  flex-shrink: 0;
}

.shot-detail__metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: var(--color-surface);
  border-radius: 10px;
  border: 1px solid var(--color-border);
}

.shot-detail__metric-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.shot-detail__metric-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.shot-detail__info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 8px 16px;
}

.shot-detail__card {
  padding: 12px;
  background: var(--color-surface);
  border-radius: 10px;
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shot-detail__card--full {
  grid-column: 1 / -1;
}

.shot-detail__card-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.shot-detail__card-value {
  font-size: 15px;
  color: var(--color-text);
  word-break: break-word;
}

.shot-detail__card-detail {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.shot-detail__actions {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.shot-detail__upload-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-success);
  background: transparent;
  color: var(--color-success);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.shot-detail__upload-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.shot-detail__upload-btn:active {
  opacity: 0.7;
}

.shot-detail__edit-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.shot-detail__edit-btn:active {
  opacity: 0.7;
}

.shot-detail__delete-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-error);
  background: transparent;
  color: var(--color-error);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.shot-detail__delete-btn:active {
  opacity: 0.7;
}

.shot-detail__confirm-text {
  font-size: 14px;
  color: var(--color-error);
  text-align: center;
}

.shot-detail__confirm-btns {
  display: flex;
  gap: 12px;
}

.shot-detail__cancel-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
}

.shot-detail__confirm-delete-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-error);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
</style>
