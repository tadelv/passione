<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import { getShotsPaginated } from '../api/rest.js'
import { normalizeShot } from '../composables/useShotNormalize'

const router = useRouter()
const toast = inject('toast', null)
const updateWorkflow = inject('updateWorkflow')

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

const loadedShots = ref([])
const totalShots = ref(0)
const loadedCount = ref(0)
const loading = ref(false)
const initialLoading = ref(true)
const searchQuery = ref('')
const compareMode = ref(false)
const selectedIds = ref(new Set())

let searchTimer = null
let loadGeneration = 0

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

async function loadInitial() {
  const gen = ++loadGeneration
  initialLoading.value = true
  loadedShots.value = []
  loadedCount.value = 0
  totalShots.value = 0
  loading.value = false
  await loadMore(gen)
  if (gen === loadGeneration) initialLoading.value = false
}

async function loadMore(gen = loadGeneration) {
  if (loading.value) return
  if (loadedCount.value > 0 && loadedCount.value >= totalShots.value) return

  loading.value = true
  let stale = false
  try {
    const opts = searchQuery.value.trim() ? { search: searchQuery.value.trim() } : {}
    const result = await getShotsPaginated(PAGE_SIZE, loadedCount.value, opts)
    if (gen !== loadGeneration) { stale = true; return }
    const shots = result.items.map(normalizeShot)
    loadedShots.value = [...loadedShots.value, ...shots]
    loadedCount.value += shots.length
    totalShots.value = result.total
  } catch {
    // ignore
  } finally {
    if (!stale) loading.value = false
  }
}

const hasMore = computed(() => loadedCount.value < totalShots.value)

const displayedShots = computed(() => loadedShots.value)

function onSearchInput(e) {
  const val = e.target.value
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchQuery.value = val
    loadInitial()
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

async function loadShotWorkflow(shot) {
  const profile = shot.profile || shot.workflow?.profile
  if (!profile) {
    if (toast) toast.warning('No profile data available for this shot')
    return
  }
  try {
    const update = { profile }

    // Restore full workflow context from the shot (coffee, grinder, dose)
    const context = {}
    if (shot.coffeeName) context.coffeeName = shot.coffeeName
    if (shot.coffeeRoaster) context.coffeeRoaster = shot.coffeeRoaster
    if (shot.grinderModel) context.grinderModel = shot.grinderModel
    if (shot.grinderSetting != null) context.grinderSetting = String(shot.grinderSetting)
    if (shot.doseIn) context.targetDoseWeight = shot.doseIn
    if (shot.doseOut) context.targetYield = shot.doseOut
    if (Object.keys(context).length > 0) update.context = context

    await updateWorkflow(update)
    if (toast) toast.success('Workflow loaded from shot')
    router.push('/')
  } catch {
    if (toast) toast.error('Failed to load workflow')
  }
}

function onRowClick(shot) {
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

onMounted(() => {
  loadInitial()
})
</script>

<template>
  <div class="shot-history">
    <!-- Search bar + compare -->
    <div class="shot-history__filter">
      <input
        class="shot-history__search"
        type="text"
        placeholder="Search shots..."
        aria-label="Search shots"
        :value="searchQuery"
        @input="onSearchInput"
      />
      <span class="shot-history__count">
        {{ totalShots }} shot{{ totalShots !== 1 ? 's' : '' }}
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
        :class="{
          'shot-history__row--selected': compareMode && selectedIds.has(shot.id || shot.shotId),
        }"
        @click="onRowClick(shot)"
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
          <span v-if="shot.coffeeName || shot.coffeeRoaster" class="shot-history__coffee">
            {{ [shot.coffeeRoaster, shot.coffeeName].filter(Boolean).join(' — ') }}
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
            v-if="shot.rating > 0"
            class="shot-history__rating"
          >
            {{ shot.rating }}%
          </span>

          <!-- Per-row action buttons -->
          <button
            v-if="!compareMode"
            class="shot-history__action-btn shot-history__action-btn--load"
            @click.stop="loadShotWorkflow(shot)"
            aria-label="Load profile"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Load
          </button>
          <button
            v-if="!compareMode"
            class="shot-history__action-btn shot-history__action-btn--edit"
            @click.stop="editShot(shot)"
            aria-label="Edit metadata"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
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

    <BottomBar title="Shot History" :show-back-button="false">
      <button class="shot-history__bottom-btn" @click="router.push('/auto-favorites')">
        Favorites
      </button>
    </BottomBar>
  </div>
</template>

<style scoped>
.shot-history {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
  min-height: 0;
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
  font-size: var(--font-md);
  outline: none;
}

.shot-history__search::placeholder {
  color: var(--color-text-secondary);
}

.shot-history__search:focus {
  border-color: var(--color-primary);
}

.shot-history__count {
  font-size: var(--font-md);
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
  font-size: var(--font-md);
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
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.shot-history__profile {
  font-size: var(--font-body);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shot-history__meta {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

.shot-history__row-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.shot-history__duration {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
}

.shot-history__rating {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-warning);
}

.shot-history__coffee {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shot-history__action-btn {
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 8px;
  border: none;
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
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
  font-size: var(--font-md);
}

.shot-history__compare-toggle {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
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
  font-size: var(--font-md);
  color: var(--color-text);
}

.shot-history__compare-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
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

.shot-history__bottom-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.shot-history__bottom-btn:active {
  opacity: 0.7;
}

</style>
