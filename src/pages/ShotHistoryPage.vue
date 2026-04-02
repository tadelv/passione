<script setup>
import { ref, computed, inject, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import { getShotIds, getShots } from '../api/rest.js'
import { normalizeShot as normalizeShotShared } from '../composables/useShotNormalize'

const router = useRouter()
const toast = inject('toast', null)
const updateWorkflow = inject('updateWorkflow')

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

const allShotIds = ref([])
const loadedShots = ref([])
const loadedCount = ref(0)
const loading = ref(false)
const initialLoading = ref(true)
const searchQuery = ref('')
const compareMode = ref(false)
const selectedIds = ref(new Set())

let searchTimer = null

function toggleCompareMode() {
  compareMode.value = !compareMode.value
  if (!compareMode.value) selectedIds.value = new Set()
}

function toggleSelect(shot) {
  const id = shot.id || shot.shotId
  if (!id) return
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else if (next.size < 3) {
    next.add(id)
  }
  selectedIds.value = next
}

function openComparison() {
  const ids = [...selectedIds.value]
  if (ids.length >= 2) {
    router.push({ path: '/shot-comparison', query: { ids: ids.map(encodeURIComponent).join(',') } })
  }
}

/**
 * Normalize a shot record from API format to flat fields for display.
 * Delegates core flattening to the shared normalizeShot helper, then
 * applies page-specific fields (profileName, notes, barista, duration).
 */
function normalizeShot(shot) {
  if (!shot) return shot
  const result = normalizeShotShared(shot)
  const w = shot.workflow ?? {}
  const meta = shot.metadata ?? {}

  // Flatten profile name
  if (!result.profileName) {
    result.profileName = w.profile?.title ?? w.name ?? null
  }
  // Flatten notes
  if (result.notes == null && shot.shotNotes != null) {
    result.notes = shot.shotNotes
  }
  // Flatten barista from metadata
  if (result.barista == null && meta.barista != null) {
    result.barista = meta.barista
  }
  // Flatten profile object for Load button
  if (!result.profile && w.profile) {
    result.profile = w.profile
  }
  // Calculate duration from measurements if missing
  if (result.duration == null && shot.measurements?.length >= 2) {
    const first = shot.measurements[0]
    const last = shot.measurements[shot.measurements.length - 1]
    const getTs = (m) => {
      if (m.elapsed != null) return m.elapsed
      const ts = m.machine?.timestamp ?? m.timestamp
      return ts ? new Date(ts).getTime() / 1000 : 0
    }
    const d = getTs(last) - getTs(first)
    if (d > 0) result.duration = d
  }
  return result
}

// Load all shot IDs first, then load pages
async function loadShotIds() {
  initialLoading.value = true
  try {
    const result = await getShotIds()
    allShotIds.value = Array.isArray(result) ? result : (result?.ids ?? [])
  } catch {
    allShotIds.value = []
  }
  // Load first page
  loadedShots.value = []
  loadedCount.value = 0
  await loadMore()
  initialLoading.value = false
}

async function loadMore() {
  if (loading.value) return
  const ids = filteredIds.value
  if (loadedCount.value >= ids.length) return

  loading.value = true
  const pageIds = ids.slice(loadedCount.value, loadedCount.value + PAGE_SIZE)
  try {
    const result = await getShots(pageIds)
    const shots = Array.isArray(result) ? result : (result?.shots ?? [])
    loadedShots.value = [...loadedShots.value, ...shots.map(normalizeShot)]
    loadedCount.value += pageIds.length
  } catch {
    // ignore
  }
  loading.value = false
}

const hasMore = computed(() => loadedCount.value < filteredIds.value.length)

const filteredIds = computed(() => {
  // Client-side search is applied after loading (basic filtering by ID)
  // Since we only have IDs at this point, full search happens on loaded shots
  return allShotIds.value
})

const displayedShots = computed(() => {
  if (!searchQuery.value.trim()) return loadedShots.value
  const q = searchQuery.value.toLowerCase()
  return loadedShots.value.filter(shot => {
    const fields = [
      shot.profileName, shot.coffeeName, shot.coffeeRoaster,
      shot.grinderModel, shot.grinderSetting, shot.barista,
      shot.notes,
    ]
    return fields.some(f => f && String(f).toLowerCase().includes(q))
  })
})

function onSearchInput(e) {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchQuery.value = e.target.value
  }, SEARCH_DEBOUNCE_MS)
}

function onScroll(e) {
  const el = e.target
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  if (nearBottom && hasMore.value && !loading.value) {
    loadMore()
  }
}

function openShot(shot) {
  const id = shot.id || shot.shotId
  if (id) {
    router.push(`/shot/${encodeURIComponent(id)}`)
  }
}

function editShot(shot) {
  const id = shot.id || shot.shotId
  if (id) {
    router.push(`/shot-review/${encodeURIComponent(id)}`)
  }
}

async function loadShotProfile(shot) {
  const profile = shot.profile || shot.workflow?.profile
  if (!profile) {
    if (toast) toast.warning('No profile data available for this shot')
    return
  }
  try {
    await updateWorkflow({ profile })
    if (toast) toast.success('Profile loaded')
    router.push('/')
  } catch {
    if (toast) toast.error('Failed to load profile')
  }
}

function onRowClick(shot, event) {
  if (event.detail >= 2) {
    openShot(shot)
    return
  }
  if (compareMode.value) {
    toggleSelect(shot)
  } else {
    openShot(shot)
  }
}

function formatDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '--'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function formatDoseYield(shot) {
  const dose = shot.doseIn
  const output = shot.doseOut
  if (dose && output) return `${Number(dose).toFixed(1)}g → ${Number(output).toFixed(1)}g`
  if (dose) return `${Number(dose).toFixed(1)}g in`
  if (output) return `${Number(output).toFixed(1)}g out`
  return ''
}

onMounted(loadShotIds)
</script>

<template>
  <div class="shot-history">
    <!-- Search bar + compare -->
    <div class="shot-history__filter">
      <input
        class="shot-history__search"
        type="text"
        placeholder="Search shots..."
        @input="onSearchInput"
      />
      <span class="shot-history__count">
        {{ displayedShots.length }} shot{{ displayedShots.length !== 1 ? 's' : '' }}
      </span>
      <button
        class="shot-history__compare-toggle"
        :class="{ active: compareMode }"
        @click="toggleCompareMode"
      >
        {{ compareMode ? 'Cancel' : 'Compare' }}
      </button>
    </div>

    <!-- Compare action bar -->
    <div v-if="compareMode && selectedIds.size >= 2" class="shot-history__compare-bar">
      <span>{{ selectedIds.size }} selected</span>
      <button class="shot-history__compare-btn" @click="openComparison">
        Compare Shots
      </button>
    </div>

    <!-- Shot list -->
    <div
      class="shot-history__list"
      @scroll="onScroll"
    >
      <div v-if="initialLoading" class="shot-history__loading">
        Loading shots...
      </div>

      <div
        v-else-if="displayedShots.length === 0"
        class="shot-history__empty"
      >
        {{ searchQuery ? 'No matching shots found.' : 'No shots recorded yet.' }}
      </div>

      <div
        v-for="shot in displayedShots"
        :key="shot.id || shot.shotId"
        class="shot-history__row"
        :class="{ 'shot-history__row--selected': compareMode && selectedIds.has(shot.id || shot.shotId) }"
        @click="onRowClick(shot, $event)"
      >
        <div v-if="compareMode" class="shot-history__checkbox" :class="{ checked: selectedIds.has(shot.id || shot.shotId) }">
          <svg v-if="selectedIds.has(shot.id || shot.shotId)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div class="shot-history__row-left">
          <span class="shot-history__date">
            {{ formatDate(shot.timestamp || shot.date) }}
          </span>
          <span class="shot-history__profile">
            {{ shot.profileName || shot.profile?.title || 'Unknown Profile' }}
          </span>
          <span class="shot-history__meta">
            {{ formatDoseYield(shot) }}
          </span>
        </div>

        <div class="shot-history__row-right">
          <span class="shot-history__duration">
            {{ formatDuration(shot.duration) }}
          </span>
          <span
            v-if="shot.enjoyment > 0 || shot.rating > 0"
            class="shot-history__rating"
          >
            {{ (shot.enjoyment || shot.rating) }}%
          </span>

          <!-- Per-row action buttons (matching QML: Load, Edit, Detail) -->
          <button
            v-if="!compareMode"
            class="shot-history__action-btn shot-history__action-btn--load"
            @click.stop="loadShotProfile(shot)"
            title="Load profile"
          >
            L
          </button>
          <button
            v-if="!compareMode"
            class="shot-history__action-btn shot-history__action-btn--edit"
            @click.stop="editShot(shot)"
            title="Edit metadata"
          >
            E
          </button>
          <svg class="shot-history__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>

      <!-- Loading indicator -->
      <div v-if="loading && !initialLoading" class="shot-history__loading-more">
        Loading more...
      </div>
    </div>

    <BottomBar title="Shot History" @back="router.back()" />
  </div>
</template>

<style scoped>
.shot-history {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.shot-history__filter {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  flex-shrink: 0;
}

.shot-history__search {
  flex: 1;
  height: 40px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  outline: none;
}

.shot-history__search::placeholder {
  color: var(--color-text-secondary);
}

.shot-history__search:focus {
  border-color: var(--color-primary);
}

.shot-history__count {
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.shot-history__list {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 8px;
  -webkit-overflow-scrolling: touch;
}

.shot-history__loading,
.shot-history__empty {
  padding: 40px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.shot-history__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 16px;
  margin-bottom: 6px;
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  cursor: pointer;
  text-align: left;
  color: var(--color-text);
  -webkit-tap-highlight-color: transparent;
}

.shot-history__row:active {
  opacity: 0.8;
}

.shot-history__row-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.shot-history__date {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.shot-history__profile {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shot-history__meta {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.shot-history__row-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.shot-history__duration {
  font-size: 16px;
  color: var(--color-text-secondary);
}

.shot-history__rating {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-warning);
}

.shot-history__action-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.shot-history__action-btn:active {
  filter: brightness(0.8);
}

.shot-history__action-btn--load {
  background: var(--color-primary);
  color: var(--color-text);
}

.shot-history__action-btn--edit {
  background: var(--color-success);
  color: var(--color-text);
}

.shot-history__chevron {
  color: var(--color-primary);
  flex-shrink: 0;
}

.shot-history__loading-more {
  padding: 16px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.shot-history__compare-toggle {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.shot-history__compare-toggle.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.shot-history__compare-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  font-size: 14px;
  color: var(--color-text);
}

.shot-history__compare-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.shot-history__compare-btn:active {
  filter: brightness(0.85);
}

.shot-history__checkbox {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 2px solid var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.shot-history__checkbox.checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text);
}

.shot-history__row--selected {
  border-color: var(--color-primary);
}
</style>
