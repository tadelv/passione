<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import ProfileGraph from '../components/ProfileGraph.vue'
import { getProfile, getProfiles } from '../api/rest.js'

const router = useRouter()
const route = useRoute()

const record = ref(null)
const loading = ref(false)

const profile = computed(() => record.value?.profile ?? null)

const stopAtSummary = computed(() => {
  if (!profile.value) return ''
  const p = profile.value
  if (p.target_weight > 0) return `Stop at ${p.target_weight}g (weight)`
  if (p.target_volume > 0) return `Stop at ${p.target_volume}mL (volume)`
  return 'No stop target'
})

const frameCount = computed(() =>
  profile.value?.steps?.length ?? profile.value?.frames?.length ?? 0
)

const totalDuration = computed(() => {
  const frames = profile.value?.steps ?? profile.value?.frames ?? []
  let total = 0
  for (const f of frames) total += f.seconds || 0
  return total
})

const temperatureSummary = computed(() => {
  const frames = profile.value?.steps ?? profile.value?.frames ?? []
  if (!frames.length) return ''
  const temps = frames.map(f => f.temperature).filter(t => t > 0)
  if (!temps.length) return ''
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  return min === max ? `${min.toFixed(1)}\u00B0C` : `${min.toFixed(1)}\u2013${max.toFixed(1)}\u00B0C`
})

async function fetchProfile() {
  const id = route.params.id
  if (!id) return
  loading.value = true
  try {
    const data = await getProfile(id)
    // API may return a record {id, profile} or the profile directly
    record.value = data?.profile ? data : { id, profile: data }
  } catch {
    // Fallback: fetch all profiles and find by ID
    try {
      const all = await getProfiles()
      const list = Array.isArray(all) ? all : []
      const match = list.find(r => r.id === id)
      if (match) {
        record.value = match
      }
    } catch {
      // both methods failed
    }
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.back()
}

onMounted(fetchProfile)
</script>

<template>
  <div class="profile-info">
    <div class="profile-info__content">
      <div v-if="loading" class="profile-info__loading">
        Loading profile...
      </div>

      <template v-else-if="profile">
        <!-- Profile graph -->
        <div class="profile-info__graph">
          <ProfileGraph :profile="profile" />
        </div>

        <!-- Title & author -->
        <div class="profile-info__header">
          <h2 class="profile-info__title">{{ profile.title || 'Untitled' }}</h2>
          <span v-if="profile.author" class="profile-info__author">By {{ profile.author }}</span>
        </div>

        <!-- Summary cards -->
        <div class="profile-info__cards">
          <div class="profile-info__card">
            <span class="profile-info__card-label">Stop At</span>
            <span class="profile-info__card-value">{{ stopAtSummary }}</span>
          </div>
          <div class="profile-info__card">
            <span class="profile-info__card-label">Temperature</span>
            <span class="profile-info__card-value">{{ temperatureSummary || 'N/A' }}</span>
          </div>
          <div class="profile-info__card">
            <span class="profile-info__card-label">Frames</span>
            <span class="profile-info__card-value">{{ frameCount }}</span>
          </div>
          <div class="profile-info__card">
            <span class="profile-info__card-label">Duration</span>
            <span class="profile-info__card-value">{{ totalDuration.toFixed(0) }}s</span>
          </div>
        </div>

        <!-- Beverage type -->
        <div v-if="profile.beverage_type" class="profile-info__meta-row">
          <span class="profile-info__meta-label">Type</span>
          <span class="profile-info__meta-value">{{ profile.beverage_type }}</span>
        </div>

        <!-- Notes -->
        <div v-if="profile.notes" class="profile-info__notes">
          <span class="profile-info__meta-label">Notes</span>
          <p class="profile-info__notes-text">{{ profile.notes }}</p>
        </div>

        <!-- Frame list -->
        <div v-if="frameCount > 0" class="profile-info__frames">
          <span class="profile-info__meta-label">Steps</span>
          <div class="profile-info__frame-list">
            <div
              v-for="(frame, i) in (profile.steps ?? profile.frames ?? [])"
              :key="i"
              class="profile-info__frame-item"
            >
              <span class="profile-info__frame-index">{{ i + 1 }}</span>
              <div class="profile-info__frame-info">
                <span class="profile-info__frame-name">{{ frame.name || `Step ${i + 1}` }}</span>
                <span class="profile-info__frame-detail">
                  {{ frame.pump === 'flow' ? 'Flow' : 'Pressure' }}
                  {{ (frame.pump === 'flow' ? frame.flow : frame.pressure)?.toFixed(1) }}
                  {{ frame.pump === 'flow' ? 'mL/s' : 'bar' }}
                  &middot; {{ frame.seconds?.toFixed(1) }}s
                  &middot; {{ frame.temperature?.toFixed(1) }}&deg;C
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="profile-info__loading">
        Profile not found
      </div>
    </div>

    <BottomBar title="Profile Info" @back="goBack" />
  </div>
</template>

<style scoped>
.profile-info {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.profile-info__content {
  flex: 1;
  padding: var(--margin-standard);
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-info__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-secondary);
}

.profile-info__graph {
  height: 200px;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.profile-info__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-info__title {
  font-size: var(--font-heading);
  font-weight: bold;
  color: var(--color-text);
  margin: 0;
}

.profile-info__author {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
}

.profile-info__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.profile-info__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-info__card-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  text-transform: uppercase;
}

.profile-info__card-value {
  font-size: var(--font-body);
  color: var(--color-text);
  font-weight: 600;
}

.profile-info__meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-surface);
  border-radius: var(--radius-card);
}

.profile-info__meta-label {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  font-weight: 600;
}

.profile-info__meta-value {
  font-size: var(--font-body);
  color: var(--color-text);
}

.profile-info__notes {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
}

.profile-info__notes-text {
  margin: 8px 0 0 0;
  font-size: var(--font-body);
  color: var(--color-text);
  line-height: 1.5;
  white-space: pre-wrap;
}

.profile-info__frames {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
}

.profile-info__frame-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.profile-info__frame-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 6px;
  background: var(--color-background);
}

.profile-info__frame-index {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  font-size: 12px;
  font-weight: bold;
  flex-shrink: 0;
}

.profile-info__frame-info {
  display: flex;
  flex-direction: column;
}

.profile-info__frame-name {
  font-size: var(--font-body);
  color: var(--color-text);
}

.profile-info__frame-detail {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}
</style>
