<script setup>
import { computed, inject, ref } from 'vue'
import ConnectionIndicator from './ConnectionIndicator.vue'
import { useLayout } from '../composables/useLayout.js'

const waterLevelDisplay = inject('waterLevelDisplay', ref(''))

const props = defineProps({
  machineState: { type: String, default: 'disconnected' },
  machineConnected: { type: Boolean, default: false },
  scaleConnected: { type: Boolean, default: false },
  temperature: { type: Number, default: 0 },
  targetTemperature: { type: Number, default: 0 },
  profileName: { type: String, default: '' },
  /**
   * Optional layout override. When provided, controls which sections
   * of the status bar are visible. Accepts an object with boolean
   * fields: { showConnection, showState, showProfile, showTemperature, showWaterLevel }.
   * When omitted (or null), all sections are shown (default behaviour).
   */
  layoutOverride: { type: Object, default: null },
})

const { layout, loaded } = useLayout()

/**
 * Resolve effective display flags. Priority:
 *  1. Explicit layoutOverride prop (from parent)
 *  2. Layout config stored in KV store (statusBarConfig zone)
 *  3. All sections visible (default)
 */
const displayFlags = computed(() => {
  const defaults = {
    showConnection: true,
    showState: true,
    showProfile: true,
    showTemperature: true,
    showWaterLevel: true,
  }

  // 1. Explicit prop override
  if (props.layoutOverride) {
    return { ...defaults, ...props.layoutOverride }
  }

  // 2. Layout KV config — check for a statusBarConfig in the layout
  if (loaded.value && layout.value?.statusBarConfig) {
    return { ...defaults, ...layout.value.statusBarConfig }
  }

  // 3. Defaults
  return defaults
})
</script>

<template>
  <header class="status-bar">
    <div class="status-bar__left">
      <ConnectionIndicator v-if="displayFlags.showConnection" :connected="machineConnected" />
      <span v-if="displayFlags.showState" class="status-bar__state">{{ machineState }}</span>
    </div>

    <div class="status-bar__center">
      <span v-if="displayFlags.showProfile && profileName" class="status-bar__profile">{{ profileName }}</span>
    </div>

    <div class="status-bar__right">
      <span v-if="displayFlags.showTemperature" class="status-bar__temp">
        {{ temperature.toFixed(1) }}
        <span class="status-bar__temp-target">/ {{ targetTemperature.toFixed(0) }} &deg;C</span>
      </span>
      <span v-if="displayFlags.showWaterLevel" class="status-bar__water" :title="`Water level: ${waterLevelDisplay}`">
        {{ waterLevelDisplay }}
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
