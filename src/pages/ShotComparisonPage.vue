<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ComparisonGraph from '../components/ComparisonGraph.vue'
import BottomBar from '../components/BottomBar.vue'
import { getShot } from '../api/rest.js'

const route = useRoute()
const router = useRouter()

const shots = ref([])
const loading = ref(true)
const visibleCurves = reactive({
  pressure: true,
  flow: true,
  weight: true,
})

async function loadShots() {
  loading.value = true
  const idsParam = route.query.ids
  if (!idsParam) {
    loading.value = false
    return
  }
  const ids = idsParam.split(',').filter(Boolean).slice(0, 3)
  const results = await Promise.allSettled(ids.map(id => getShot(id)))
  shots.value = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)
  loading.value = false
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '--'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function formatDoseRatio(shot) {
  const d = shot.dose ?? shot.doseIn
  const o = shot.output ?? shot.doseOut ?? shot.yield
  if (d && o) return `${Number(d).toFixed(1)}g / ${Number(o).toFixed(1)}g (1:${(o / d).toFixed(1)})`
  if (d) return `${Number(d).toFixed(1)}g in`
  if (o) return `${Number(o).toFixed(1)}g out`
  return '--'
}

function removeShot(index) {
  shots.value = shots.value.filter((_, i) => i !== index)
}

function goBack() {
  router.push('/history')
}

onMounted(loadShots)
</script>

<template>
  <div class="comparison-page">
    <div v-if="loading" class="comparison-page__loading">Loading shots...</div>

    <template v-else-if="shots.length >= 2">
      <!-- Graph -->
      <div class="comparison-page__graph">
        <ComparisonGraph :shots="shots" :visible-curves="visibleCurves" />
      </div>

      <!-- Curve toggles -->
      <div class="comparison-page__toggles">
        <button
          class="comparison-page__toggle"
          :class="{ active: visibleCurves.pressure }"
          @click="visibleCurves.pressure = !visibleCurves.pressure"
        >
          Pressure
        </button>
        <button
          class="comparison-page__toggle"
          :class="{ active: visibleCurves.flow }"
          @click="visibleCurves.flow = !visibleCurves.flow"
        >
          Flow
        </button>
        <button
          class="comparison-page__toggle"
          :class="{ active: visibleCurves.weight }"
          @click="visibleCurves.weight = !visibleCurves.weight"
        >
          Weight
        </button>
      </div>

      <!-- Shot details columns -->
      <div class="comparison-page__details">
        <div
          v-for="(shot, i) in shots"
          :key="shot.id || i"
          class="comparison-page__shot-col"
        >
          <div class="comparison-page__shot-header">
            <span class="comparison-page__shot-title">
              {{ shot.profileName || shot.profile?.title || `Shot ${i + 1}` }}
            </span>
            <button
              v-if="shots.length > 2"
              class="comparison-page__remove-btn"
              @click="removeShot(i)"
              aria-label="Remove shot from comparison"
            >
              &times;
            </button>
          </div>
          <div class="comparison-page__shot-meta">
            <span>{{ formatDuration(shot.duration) }}</span>
            <span>{{ formatDoseRatio(shot) }}</span>
            <span v-if="shot.enjoyment > 0 || shot.rating > 0">
              Rating: {{ shot.enjoyment || shot.rating }}%
            </span>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="comparison-page__loading">
      Select at least 2 shots to compare.
    </div>

    <BottomBar title="Compare Shots" @back="goBack" />
  </div>
</template>

<style scoped>
.comparison-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.comparison-page__loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.comparison-page__graph {
  height: 300px;
  flex-shrink: 0;
  padding: 8px 16px;
}

.comparison-page__toggles {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  justify-content: center;
}

.comparison-page__toggle {
  padding: 6px 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.comparison-page__toggle.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.comparison-page__toggle:active {
  opacity: 0.8;
}

.comparison-page__details {
  flex: 1;
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.comparison-page__shot-col {
  flex: 1;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comparison-page__shot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.comparison-page__shot-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.comparison-page__remove-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--color-error);
  background: transparent;
  color: var(--color-error);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}

.comparison-page__remove-btn:active {
  background: var(--color-error);
  color: #fff;
}

.comparison-page__shot-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
