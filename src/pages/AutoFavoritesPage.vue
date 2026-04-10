<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import { getShotsPaginated } from '../api/rest.js'
import { normalizeShot } from '../composables/useShotNormalize'

const router = useRouter()
const toast = inject('toast', null)
const updateWorkflow = inject('updateWorkflow')

const loading = ref(true)
const groups = ref([])
const allShotsCache = ref([])
const groupBy = ref('bean+profile') // 'bean', 'profile', 'bean+profile', 'bean+profile+grinder'

const GROUP_OPTIONS = [
  { value: 'bean', label: 'Bean' },
  { value: 'profile', label: 'Profile' },
  { value: 'bean+profile', label: 'Bean + Profile' },
  { value: 'bean+profile+grinder', label: 'All' },
]

function groupKey(shot, mode) {
  const bean = [shot.coffeeRoaster, shot.coffeeName].filter(Boolean).join(' — ') || 'Unknown bean'
  const profile = shot.profileName || 'Unknown profile'
  const grinder = shot.grinderModel || 'Unknown grinder'
  if (mode === 'bean') return bean
  if (mode === 'profile') return profile
  if (mode === 'bean+profile') return `${bean} | ${profile}`
  return `${bean} | ${profile} | ${grinder}`
}

function groupLabel(key) {
  return key
}

async function loadAllShots() {
  loading.value = true
  const allShots = []
  let offset = 0
  const limit = 200

  try {
    while (true) {
      const result = await getShotsPaginated(limit, offset)
      const shots = result.items.map(normalizeShot)
      allShots.push(...shots)
      offset += shots.length
      if (offset >= result.total || shots.length === 0) break
    }
  } catch {
    toast?.error('Failed to load shots')
  }

  allShotsCache.value = allShots
  computeGroups(allShots)
  loading.value = false
}

function computeGroups(shots) {
  const map = new Map()

  for (const shot of shots) {
    const key = groupKey(shot, groupBy.value)
    if (!map.has(key)) {
      map.set(key, {
        key,
        shots: [],
        totalRating: 0,
        ratedCount: 0,
        totalDose: 0,
        totalYield: 0,
        totalDuration: 0,
        doseCount: 0,
        lastProfile: shot.profile,
        lastProfileName: shot.profileName,
      })
    }
    const g = map.get(key)
    g.shots.push(shot)
    if (shot.rating > 0) {
      g.totalRating += shot.rating
      g.ratedCount++
    }
    if (shot.doseIn > 0) { g.totalDose += shot.doseIn; g.doseCount++ }
    if (shot.doseOut > 0) g.totalYield += shot.doseOut
    if (shot.duration > 0) g.totalDuration += shot.duration
  }

  // Convert to array with computed averages, sort by avg rating desc then count desc
  const result = []
  for (const g of map.values()) {
    const count = g.shots.length
    result.push({
      key: g.key,
      count,
      avgRating: g.ratedCount > 0 ? g.totalRating / g.ratedCount : 0,
      avgDose: g.doseCount > 0 ? g.totalDose / g.doseCount : 0,
      avgYield: g.doseCount > 0 ? g.totalYield / g.doseCount : 0,
      avgDuration: count > 0 ? g.totalDuration / count : 0,
      lastProfile: g.lastProfile,
      lastProfileName: g.lastProfileName,
      lastShot: g.shots[0], // most recent (shots come desc by timestamp)
    })
  }

  result.sort((a, b) => {
    if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating
    return b.count - a.count
  })

  groups.value = result
}

function changeGroupBy(mode) {
  groupBy.value = mode
  if (allShotsCache.value.length > 0) {
    computeGroups(allShotsCache.value)
  } else {
    loadAllShots()
  }
}

async function loadProfile(group) {
  if (!group.lastProfile) {
    toast?.warning('No profile data available')
    return
  }
  try {
    await updateWorkflow({ profile: group.lastProfile })
    toast?.success('Profile loaded')
    router.push('/')
  } catch {
    toast?.error('Failed to load profile')
  }
}

function showShots(group) {
  // Navigate to shot history — the server search will find matching shots
  const searchTerm = group.key.split(' | ')[0] // use first part (bean name) as search
  router.push(`/history?search=${encodeURIComponent(searchTerm)}`)
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '--'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

onMounted(loadAllShots)
</script>

<template>
  <div class="auto-fav">
    <!-- Group by selector -->
    <div class="auto-fav__filter">
      <button
        v-for="opt in GROUP_OPTIONS"
        :key="opt.value"
        class="auto-fav__group-btn"
        :class="{ 'auto-fav__group-btn--active': groupBy === opt.value }"
        @click="changeGroupBy(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>

    <div class="auto-fav__list">
      <div v-if="loading" class="auto-fav__loading">Analyzing shots...</div>

      <div v-else-if="groups.length === 0" class="auto-fav__empty">
        No shots recorded yet.
      </div>

      <div
        v-for="group in groups"
        :key="group.key"
        class="auto-fav__card"
      >
        <div class="auto-fav__card-header">
          <span class="auto-fav__card-title">{{ group.key }}</span>
          <span class="auto-fav__card-count">{{ group.count }} shot{{ group.count !== 1 ? 's' : '' }}</span>
        </div>

        <div class="auto-fav__card-metrics">
          <div v-if="group.avgRating > 0" class="auto-fav__metric">
            <span class="auto-fav__metric-value" style="color: var(--color-warning)">{{ group.avgRating.toFixed(0) }}%</span>
            <span class="auto-fav__metric-label">Rating</span>
          </div>
          <div v-if="group.avgDose > 0" class="auto-fav__metric">
            <span class="auto-fav__metric-value">{{ group.avgDose.toFixed(1) }}g</span>
            <span class="auto-fav__metric-label">Dose</span>
          </div>
          <div v-if="group.avgYield > 0" class="auto-fav__metric">
            <span class="auto-fav__metric-value">{{ group.avgYield.toFixed(1) }}g</span>
            <span class="auto-fav__metric-label">Yield</span>
          </div>
          <div v-if="group.avgDuration > 0" class="auto-fav__metric">
            <span class="auto-fav__metric-value">{{ formatDuration(group.avgDuration) }}</span>
            <span class="auto-fav__metric-label">Duration</span>
          </div>
        </div>

        <div class="auto-fav__card-actions">
          <button class="auto-fav__action-btn" @click="loadProfile(group)">
            Load
          </button>
          <button class="auto-fav__action-btn auto-fav__action-btn--secondary" @click="showShots(group)">
            Show Shots
          </button>
        </div>
      </div>
    </div>

    <BottomBar title="Auto-Favorites" @back="router.back()" />
  </div>
</template>

<style scoped>
.auto-fav {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.auto-fav__filter {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  flex-shrink: 0;
  overflow-x: auto;
}

.auto-fav__group-btn {
  padding: 10px 14px;
  min-height: var(--touch-target-min);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-caption);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.auto-fav__group-btn--active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
}

.auto-fav__list {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 8px;
  -webkit-overflow-scrolling: touch;
}

.auto-fav__loading,
.auto-fav__empty {
  padding: 40px;
  text-align: center;
  color: var(--color-text-secondary);
}

.auto-fav__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  border: 1px solid var(--color-border);
  padding: 12px;
  margin-bottom: 8px;
}

.auto-fav__card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.auto-fav__card-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  word-break: break-word;
}

.auto-fav__card-count {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.auto-fav__card-metrics {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}

.auto-fav__metric {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.auto-fav__metric-value {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text);
}

.auto-fav__metric-label {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.auto-fav__card-actions {
  display: flex;
  gap: 8px;
}

.auto-fav__action-btn {
  padding: 10px 16px;
  min-height: var(--touch-target-min);
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-caption);
  font-weight: 600;
  cursor: pointer;
}

.auto-fav__action-btn--secondary {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}
</style>
