<script setup>
import { ref, inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getShotIds } from '../../api/rest.js'

const router = useRouter()
const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings

const totalShots = ref(null)
const loading = ref(true)

async function loadShotCount() {
  loading.value = true
  try {
    const ids = await getShotIds()
    totalShots.value = Array.isArray(ids) ? ids.length : (ids?.ids?.length ?? 0)
  } catch {
    totalShots.value = null
  }
  loading.value = false
}

onMounted(loadShotCount)

function goToHistory() {
  router.push('/history')
}
</script>

<template>
  <div class="history-tab" v-if="settings">
    <div class="history-tab__grid">
      <!-- Column 1: History -->
      <div class="history-tab__column">
        <h4 class="history-tab__section-title">Shot History</h4>

        <div class="history-tab__stat">
          <span class="history-tab__stat-label">Total shots</span>
          <span class="history-tab__stat-value">
            <template v-if="loading">...</template>
            <template v-else-if="totalShots !== null">{{ totalShots }}</template>
            <template v-else>N/A</template>
          </span>
        </div>

        <button class="history-tab__nav-btn" @click="goToHistory">
          Browse Shot History
        </button>
      </div>

      <!-- Column 2: Preferences -->
      <div class="history-tab__column">
        <h4 class="history-tab__section-title">Preferences</h4>

        <div class="history-tab__field">
          <label class="history-tab__label">Auto-favorite shots</label>
          <button
            class="history-tab__toggle"
            :class="{ 'history-tab__toggle--on': settings.autoFavorites }"
            @click="settings.autoFavorites = !settings.autoFavorites"
          >
            {{ settings.autoFavorites ? 'ON' : 'OFF' }}
          </button>
          <span class="history-tab__hint">Automatically mark new shots as favorites</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="history-tab__empty">Settings not available.</div>
</template>

<style scoped>
.history-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-tab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.history-tab__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-tab__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.history-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-tab__label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.history-tab__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.history-tab__stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.history-tab__stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.history-tab__stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.history-tab__nav-btn {
  padding: 12px 24px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  width: fit-content;
}

.history-tab__nav-btn:active {
  opacity: 0.8;
}

.history-tab__toggle {
  width: 80px;
  height: 40px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.history-tab__toggle--on {
  background: var(--color-success);
  color: #fff;
  border-color: var(--color-success);
}

.history-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
