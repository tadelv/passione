<script setup>
import { inject } from 'vue'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings

const TYPES = [
  { value: 'disabled', label: 'Disabled', desc: 'Screen goes black' },
  { value: 'flipClock', label: 'Flip Clock', desc: 'Classic flip clock display' },
  { value: 'lastShot', label: 'Last Shot', desc: 'Your last dial-in at a glance' },
  { value: 'ambientGlow', label: 'Ambient Glow', desc: 'Slow-drifting colors' },
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
          <div class="ss-tab__type-list">
            <button
              v-for="t in TYPES"
              :key="t.value"
              class="ss-tab__type-option"
              :class="{ 'ss-tab__type-option--active': settings.screensaverType === t.value }"
              @click="settings.screensaverType = t.value"
            >
              <span class="ss-tab__type-name">{{ t.label }}</span>
              <span class="ss-tab__type-desc">{{ t.desc }}</span>
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
  font-size: var(--font-body);
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
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

.ss-tab__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.ss-tab__type-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ss-tab__type-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.ss-tab__type-option--active {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.ss-tab__type-name {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text);
}

.ss-tab__type-desc {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.ss-tab__type-option--active .ss-tab__type-desc {
  color: var(--color-text);
  opacity: 0.8;
}

.ss-tab__toggle {
  width: 80px;
  height: 40px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.ss-tab__toggle--on {
  background: var(--color-success);
  color: var(--color-text);
  border-color: var(--color-success);
}

.ss-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
