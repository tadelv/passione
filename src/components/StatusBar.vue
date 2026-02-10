<script setup>
import ConnectionIndicator from './ConnectionIndicator.vue'

defineProps({
  machineState: { type: String, default: 'disconnected' },
  machineConnected: { type: Boolean, default: false },
  scaleConnected: { type: Boolean, default: false },
  temperature: { type: Number, default: 0 },
  targetTemperature: { type: Number, default: 0 },
  waterLevel: { type: Number, default: 0 },
  profileName: { type: String, default: '' },
})
</script>

<template>
  <header class="status-bar">
    <div class="status-bar__left">
      <ConnectionIndicator :connected="machineConnected" />
      <span class="status-bar__state">{{ machineState }}</span>
    </div>

    <div class="status-bar__center">
      <span v-if="profileName" class="status-bar__profile">{{ profileName }}</span>
    </div>

    <div class="status-bar__right">
      <span class="status-bar__temp">
        {{ temperature.toFixed(1) }}
        <span class="status-bar__temp-target">/ {{ targetTemperature.toFixed(0) }} &deg;C</span>
      </span>
      <span class="status-bar__water" :title="`Water level: ${waterLevel}%`">
        {{ waterLevel }}%
      </span>
    </div>
  </header>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--status-bar-height);
  padding: 0 var(--spacing-large) 0 var(--chart-margin-small);
  background: var(--color-surface);
  flex-shrink: 0;
  z-index: 10;
}

.status-bar__left {
  display: flex;
  align-items: center;
  gap: var(--spacing-small);
}

.status-bar__state {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  text-transform: capitalize;
}

.status-bar__center {
  display: flex;
  align-items: center;
}

.status-bar__profile {
  font-size: var(--font-label);
  color: var(--color-text);
  font-weight: 600;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-bar__right {
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

.status-bar__temp {
  font-size: var(--font-label);
  color: var(--color-temperature);
  font-weight: 600;
}

.status-bar__temp-target {
  color: var(--color-text-secondary);
  font-weight: 400;
}

.status-bar__water {
  font-size: var(--font-label);
  color: var(--color-flow);
  font-weight: 600;
}
</style>
