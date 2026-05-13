<script setup>
import { inject } from 'vue'
import ValueInput from '../ValueInput.vue'
import SettingsToggle from './SettingsToggle.vue'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
</script>

<template>
  <div class="brewing-tab" v-if="settings">
    <div class="brewing-tab__row">
      <div>
        <div class="brewing-tab__label">Linger on shot graph</div>
        <div class="brewing-tab__hint">Stay on espresso page after shot ends</div>
      </div>
      <SettingsToggle
        v-model="settings.lingerOnEspressoPage"
        :aria-label="settings.lingerOnEspressoPage ? 'Disable linger' : 'Enable linger'"
      />
    </div>

    <div class="brewing-tab__row">
      <div>
        <div class="brewing-tab__label">Open shot review after each shot</div>
        <div class="brewing-tab__hint">
          Jump to the post-shot review page when a shot ends. Requires a
          Visualizer username — otherwise the app returns home.
        </div>
      </div>
      <SettingsToggle
        v-model="settings.visualizerShowAfterShot"
        :disabled="!settings.visualizerUsername"
        aria-label="Open shot review after each shot"
      />
    </div>

    <div class="brewing-tab__row">
      <div>
        <div class="brewing-tab__label">Default shot rating</div>
        <div class="brewing-tab__hint">Pre-fills the rating slider on the post-shot review page</div>
      </div>
      <ValueInput
        :model-value="settings.defaultShotRating"
        @update:model-value="v => settings.defaultShotRating = v"
        :min="0"
        :max="100"
        :step="5"
        suffix="%"
      />
    </div>

    <div class="brewing-tab__row">
      <div>
        <div class="brewing-tab__label">Show grinder RPM</div>
        <div class="brewing-tab__hint">Track grinder RPM on each recipe and shot</div>
      </div>
      <SettingsToggle
        v-model="settings.showGrinderRpm"
        :aria-label="settings.showGrinderRpm ? 'Hide grinder RPM' : 'Show grinder RPM'"
        data-testid="toggle-show-grinder-rpm"
      />
    </div>

    <div class="brewing-tab__row">
      <div>
        <div class="brewing-tab__label">Show basket data</div>
        <div class="brewing-tab__hint">Track basket size and type on each recipe and shot</div>
      </div>
      <SettingsToggle
        v-model="settings.showBasketData"
        :aria-label="settings.showBasketData ? 'Hide basket data' : 'Show basket data'"
        data-testid="toggle-show-basket-data"
      />
    </div>
  </div>
  <div v-else class="brewing-tab__empty">Settings not available.</div>
</template>

<style scoped>
.brewing-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 640px;
}

.brewing-tab__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background: var(--color-surface);
  border-radius: 10px;
}

.brewing-tab__row > div:first-child {
  flex: 1;
  min-width: 0;
}

.brewing-tab__label {
  font-size: var(--font-md);
  color: var(--color-text);
  font-weight: 600;
}

.brewing-tab__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
  margin-top: 2px;
  line-height: 1.4;
}

.brewing-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
