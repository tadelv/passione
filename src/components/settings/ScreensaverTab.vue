<script setup>
import { inject } from 'vue'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings

const TYPES = [
  { value: 'disabled', label: 'Disabled' },
  { value: 'flipClock', label: 'Flip Clock' },
]
</script>

<template>
  <div class="ss-tab" v-if="settings">
    <div class="ss-tab__grid">
      <!-- Column 1: Type -->
      <div class="ss-tab__column">
        <h4 class="ss-tab__section-title">Screensaver</h4>

        <div class="ss-tab__field">
          <label class="ss-tab__label">Type</label>
          <div class="ss-tab__seg-group">
            <button
              v-for="t in TYPES"
              :key="t.value"
              class="ss-tab__seg"
              :class="{ 'ss-tab__seg--active': settings.screensaverType === t.value }"
              @click="settings.screensaverType = t.value"
            >
              {{ t.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Column 2: Flip Clock Options -->
      <div class="ss-tab__column" v-if="settings.screensaverType === 'flipClock'">
        <h4 class="ss-tab__section-title">Flip Clock</h4>

        <div class="ss-tab__field">
          <label class="ss-tab__label">24-hour format</label>
          <button
            class="ss-tab__toggle"
            :class="{ 'ss-tab__toggle--on': settings.flipClock24h }"
            @click="settings.flipClock24h = !settings.flipClock24h"
          >
            {{ settings.flipClock24h ? '24H' : '12H' }}
          </button>
        </div>

        <div class="ss-tab__field">
          <label class="ss-tab__label">3D perspective</label>
          <button
            class="ss-tab__toggle"
            :class="{ 'ss-tab__toggle--on': settings.flipClock3d }"
            @click="settings.flipClock3d = !settings.flipClock3d"
          >
            {{ settings.flipClock3d ? 'ON' : 'OFF' }}
          </button>
          <span class="ss-tab__hint">Adds depth effect to flip animation</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="ss-tab__empty">Settings not available.</div>
</template>

<style scoped>
.ss-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ss-tab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.ss-tab__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ss-tab__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.ss-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ss-tab__label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.ss-tab__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.ss-tab__seg-group {
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  width: fit-content;
}

.ss-tab__seg {
  padding: 8px 20px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ss-tab__seg--active {
  background: var(--color-primary);
  color: #fff;
}

.ss-tab__toggle {
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

.ss-tab__toggle--on {
  background: var(--color-success);
  color: #fff;
  border-color: var(--color-success);
}

.ss-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
