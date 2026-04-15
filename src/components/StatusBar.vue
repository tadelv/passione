<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ConnectionIndicator from './ConnectionIndicator.vue'

const props = defineProps({
  machineState: { type: String, default: 'disconnected' },
  machineSubstate: { type: String, default: '' },
  machineConnected: { type: Boolean, default: false },
  mixTemperature: { type: Number, default: 0 },
  groupTemperature: { type: Number, default: 0 },
  steamTemperature: { type: Number, default: 0 },
  waterLevelDisplay: { type: String, default: '' },
  /**
   * Time-to-ready plugin stream — see useTimeToReady.js. Together these
   * two drive a small "ready in mm:ss" chip next to the machine state,
   * shown only while the plugin reports the boiler is actively heating.
   */
  timeToReadyStatus: { type: String, default: null },   // 'heating' | 'reached' | …
  timeToReadyFormatted: { type: String, default: null }, // "01:30" etc.
})

// Clock
const clockTime = ref('')
let clockInterval = null

function updateClock() {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  clockTime.value = `${h}:${m}`
}

onMounted(() => {
  updateClock()
  clockInterval = setInterval(updateClock, 10000)
})

onUnmounted(() => {
  if (clockInterval) clearInterval(clockInterval)
})

// Show substate only when not idle/ready and substate is meaningful
const showSubstate = computed(() => {
  if (!props.machineSubstate) return false
  if (props.machineState === 'idle' || props.machineState === 'sleeping') return false
  if (props.machineSubstate === 'ready' || props.machineSubstate === 'unknown') return false
  return true
})

// "Ready in mm:ss" chip — only when the plugin reports active heating
// AND the machine is in the espresso:preparingForShot window (user just
// pressed espresso and the group head is catching up before the pour).
// Outside of that window the chip is noise — no surfacing during sleep
// wake, steam, or ambient idle. Reached / insufficient_data /
// not_heating / null all hide the chip so the status bar stays quiet
// in the normal "ready to brew" case.
const showTimeToReady = computed(() => {
  return props.timeToReadyStatus === 'heating'
    && props.machineState === 'espresso'
    && props.machineSubstate === 'preparingForShot'
})
const timeToReadyLabel = computed(() => {
  if (!showTimeToReady.value) return ''
  return props.timeToReadyFormatted
    ? `ready in ${props.timeToReadyFormatted}`
    : 'warming up'
})
</script>

<template>
  <header class="status-bar">
    <!-- Left: connection + state -->
    <div class="status-bar__left">
      <ConnectionIndicator :connected="machineConnected" :size="10" />
      <span class="status-bar__state">{{ machineState }}</span>
      <span v-if="showSubstate" class="status-bar__substate">{{ machineSubstate }}</span>
      <span
        v-if="showTimeToReady"
        class="status-bar__ttr"
        :aria-label="`Machine ${timeToReadyLabel}`"
      >{{ timeToReadyLabel }}</span>
    </div>

    <!-- Center: clock -->
    <div class="status-bar__center">
      <span class="status-bar__clock">{{ clockTime }}</span>
    </div>

    <!-- Right: temperatures + water level -->
    <div class="status-bar__right">
      <div class="status-bar__temp-group">
        <span class="status-bar__temp" style="color: var(--color-temperature)">
          {{ mixTemperature.toFixed(1) }}
        </span>
        <span class="status-bar__temp-sep">/</span>
        <span class="status-bar__temp" style="color: var(--color-temperature-goal)">
          {{ groupTemperature.toFixed(1) }}
        </span>
        <span class="status-bar__temp-unit">&deg;C</span>
      </div>
      <span class="status-bar__steam-temp">
        {{ steamTemperature.toFixed(0) }}&deg;
      </span>
      <span class="status-bar__water">
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
  padding: 0 var(--spacing-large) 0 var(--spacing-large);
  background: var(--color-surface);
  flex-shrink: 0;
  z-index: var(--z-sticky);
}

.status-bar__left {
  display: flex;
  align-items: center;
  gap: var(--spacing-small);
  min-width: 0;
  flex: 1;
}

.status-bar__state {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  text-transform: capitalize;
  font-weight: 600;
}

.status-bar__substate {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

/*
 * "Ready in mm:ss" chip — shown next to the machine state text while
 * the time-to-ready plugin reports active heating. Amber so it's
 * visible at a glance from 2 m away, but subtle enough not to shout
 * on cold mornings. Hidden whenever the stream is not in 'heating'.
 */
.status-bar__ttr {
  font-size: var(--font-caption);
  font-weight: 600;
  color: #c89b3c;
  padding: 2px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, #c89b3c 14%, transparent);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.status-bar__center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-bar__clock {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.status-bar__right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-medium);
  flex: 1;
}

.status-bar__temp-group {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.status-bar__temp {
  font-size: var(--font-label);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.status-bar__temp-sep {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

.status-bar__temp-unit {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  margin-left: 1px;
}

.status-bar__steam-temp {
  font-size: var(--font-label);
  color: var(--color-accent);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.status-bar__water {
  font-size: var(--font-label);
  color: var(--color-flow);
  font-weight: 600;
}
</style>
