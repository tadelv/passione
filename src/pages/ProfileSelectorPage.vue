<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import ProfileGraph from '../components/ProfileGraph.vue'
import { getProfiles } from '../api/rest.js'

const router = useRouter()
const route = useRoute()

const settings = inject('settings')
const workflow = inject('workflow')
const updateWorkflow = inject('updateWorkflow')
const toast = inject('toast', null)

// When navigated from workflow editor, use select-only mode
const selectOnly = computed(() => route.query.from === 'workflow')

// All profiles from the server
const allProfiles = ref([])
const loading = ref(false)
const searchQuery = ref('')
const sourceFilter = ref('all')

let searchTimer = null

// Source filter options
const SOURCE_FILTERS = [
  { value: 'all', label: 'All Profiles' },
  { value: 'builtin', label: 'Built-in' },
  { value: 'downloaded', label: 'Downloaded' },
  { value: 'user', label: 'User Created' },
]

// Debounced search
function onSearchInput(e) {
  const val = e.target.value
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchQuery.value = val
  }, 300)
}

// Determine source badge for a profile record
function getSourceBadge(record) {
  if (record.isDefault) return 'D'
  const src = record.metadata?.source
  if (src === 'visualizer') return 'V'
  if (src === 'downloaded') return 'V'
  return 'U'
}

// Filter profiles by source
function matchesSource(record) {
  if (sourceFilter.value === 'all') return true
  if (sourceFilter.value === 'builtin') return record.isDefault === true
  if (sourceFilter.value === 'downloaded') {
    const src = record.metadata?.source
    return src === 'visualizer' || src === 'downloaded'
  }
  if (sourceFilter.value === 'user') return !record.isDefault && !record.metadata?.source
  return true
}

// Filter profiles by search query
function matchesSearch(record) {
  if (!searchQuery.value) return true
  const q = searchQuery.value.toLowerCase()
  const title = (record.profile?.title || '').toLowerCase()
  const author = (record.profile?.author || '').toLowerCase()
  return title.includes(q) || author.includes(q)
}

const filteredProfiles = computed(() =>
  allProfiles.value.filter(r => matchesSource(r) && matchesSearch(r))
)

// Currently active profile id
const activeProfileId = computed(() => {
  // The workflow profile may have an id or we compare titles
  const wp = workflow?.profile
  if (!wp) return null
  // Find matching profile record by title (content-hash IDs may differ)
  const match = allProfiles.value.find(
    r => r.profile?.title === wp.title && r.profile?.author === wp.author
  )
  return match?.id ?? null
})

// Selected profile for preview (right panel / detail)
const selectedRecord = ref(null)

// Single click: always select for preview. Apply requires explicit button.
function onProfileClick(record) {
  selectedRecord.value = record
}

// Apply profile to workflow
async function applyProfile(record) {
  try {
    await updateWorkflow({ profile: record.profile })
    toast?.success(`Profile "${record.profile?.title}" loaded`)
  } catch (e) {
    toast?.error('Failed to apply profile')
  }
}

// "Use Profile" button — apply and navigate back
async function useSelectedProfile() {
  if (!selectedRecord.value) return
  await applyProfile(selectedRecord.value)
  if (selectOnly.value) {
    router.push('/workflow/edit')
  }
}

function showNotImplemented(feature) {
  if (toast) toast.info(`${feature} is not yet available`)
}

function viewProfileInfo(record) {
  router.push(`/profile-info/${encodeURIComponent(record.id)}`)
}

async function fetchProfiles() {
  loading.value = true
  try {
    const data = await getProfiles()
    allProfiles.value = Array.isArray(data) ? data : []
  } catch (e) {
    console.warn('[ProfileSelectorPage] Failed to load profiles:', e.message)
    allProfiles.value = []
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push(selectOnly.value ? '/workflow/edit' : '/')
}

onMounted(fetchProfiles)
</script>

<template>
  <div class="profile-selector">
    <div class="profile-selector__panels">
      <!-- LEFT: All profiles -->
      <div class="profile-selector__left">
        <div class="profile-selector__toolbar">
          <select
            class="profile-selector__filter"
            :value="sourceFilter"
            @change="sourceFilter = $event.target.value"
          >
            <option v-for="f in SOURCE_FILTERS" :key="f.value" :value="f.value">
              {{ f.label }}
            </option>
          </select>
          <input
            class="profile-selector__search"
            type="text"
            placeholder="Search profiles..."
            :value="searchQuery"
            @input="onSearchInput"
          />
        </div>

        <div v-if="loading" class="profile-selector__loading">Loading profiles...</div>

        <div v-else class="profile-selector__list">
          <div
            v-for="record in filteredProfiles"
            :key="record.id"
            class="profile-selector__item"
            :class="{
              'profile-selector__item--active': record.id === activeProfileId,
              'profile-selector__item--selected': record.id === selectedRecord?.id,
            }"
            @click="onProfileClick(record)"
          >
            <span class="profile-selector__badge" :class="'profile-selector__badge--' + getSourceBadge(record).toLowerCase()">
              {{ getSourceBadge(record) }}
            </span>
            <div class="profile-selector__item-info">
              <span class="profile-selector__item-title">{{ record.profile?.title || 'Untitled' }}</span>
              <span class="profile-selector__item-author">{{ record.profile?.author || '' }}</span>
            </div>
          </div>

          <div v-if="!filteredProfiles.length && !loading" class="profile-selector__empty">
            No profiles found
          </div>
        </div>
      </div>

      <!-- RIGHT: Preview -->
      <div class="profile-selector__right">
        <!-- Preview -->
        <div v-if="selectedRecord" class="profile-selector__preview">
          <div class="profile-selector__section-title">{{ selectedRecord.profile?.title || 'Untitled' }}</div>
          <div class="profile-selector__preview-graph">
            <ProfileGraph :profile="selectedRecord.profile" />
          </div>
          <div class="profile-selector__preview-meta">
            <span v-if="selectedRecord.profile?.author">By {{ selectedRecord.profile.author }}</span>
            <span v-if="selectedRecord.profile?.beverage_type">{{ selectedRecord.profile.beverage_type }}</span>
          </div>
          <div class="profile-selector__preview-actions">
            <button class="profile-selector__btn profile-selector__btn--primary" @click="useSelectedProfile">
              Use Profile
            </button>
            <button class="profile-selector__btn" @click="viewProfileInfo(selectedRecord)">
              Details
            </button>
          </div>
        </div>

        <div v-else class="profile-selector__placeholder">
          Select a profile to preview
        </div>
      </div>
    </div>

    <BottomBar title="Profiles" @back="goBack">
      <span>{{ allProfiles.length }} profiles</span>
      <span style="opacity: 0.3">|</span>
      <button class="profile-selector__import-btn" @click="router.push('/visualizer-import')">
        Import
      </button>
    </BottomBar>
  </div>
</template>

<style scoped>
.profile-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.profile-selector__panels {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: var(--margin-standard);
  min-height: 0;
}

.profile-selector__left {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
  min-height: 0;
}

.profile-selector__right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.profile-selector__toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.profile-selector__filter {
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: var(--font-body);
  min-width: 140px;
}

.profile-selector__search {
  flex: 1;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: var(--font-body);
}

.profile-selector__search::placeholder {
  color: var(--color-text-secondary);
}

.profile-selector__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-secondary);
}

.profile-selector__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profile-selector__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.profile-selector__item:hover {
  background: var(--color-surface-hover);
}

.profile-selector__item--selected {
  background: var(--color-surface-active);
}

.profile-selector__item--active {
  border-left: 3px solid var(--color-primary);
}

.profile-selector__badge {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-sm);
  font-weight: bold;
  flex-shrink: 0;
}

.profile-selector__badge--d {
  background: var(--color-primary);
  color: var(--color-text);
}

.profile-selector__badge--v {
  background: var(--color-success);
  color: var(--color-text);
}

.profile-selector__badge--u {
  background: var(--color-accent);
  color: var(--color-text);
}

.profile-selector__item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.profile-selector__item-title {
  font-size: var(--font-body);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-selector__item-author {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

.profile-selector__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-secondary);
  font-size: var(--font-body);
}

.profile-selector__section-title {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  margin-bottom: 8px;
}

.profile-selector__preview {
  flex: 1;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.profile-selector__preview-graph {
  flex: 1;
  min-height: 100px;
}

.profile-selector__preview-meta {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  font-size: var(--font-label);
  color: var(--color-text-secondary);
}

.profile-selector__preview-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
}

.profile-selector__btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-body);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.profile-selector__btn:active {
  filter: brightness(0.85);
}

.profile-selector__btn--primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.profile-selector__import-btn {
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

.profile-selector__import-btn:active {
  opacity: 0.7;
}

.profile-selector__placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  color: var(--color-text-secondary);
  font-size: var(--font-body);
}
</style>
