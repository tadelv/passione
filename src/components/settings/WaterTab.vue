<script setup>
import { computed, inject, onUnmounted } from 'vue'
import ValueInput from '../ValueInput.vue'
import { updateWaterLevelThreshold } from '../../api/rest.js'

// DE1 tank CAD-derived lookup table (mirrors App.vue and the gateway).
const WATER_MM_TO_ML = [
  0, 16, 43, 70, 97, 124, 151, 179, 206, 233,
  261, 288, 316, 343, 371, 398, 426, 453, 481, 509,
  537, 564, 592, 620, 648, 676, 704, 732, 760, 788,
  816, 844, 872, 900, 929, 957, 985, 1013, 1042, 1070,
  1104, 1138, 1172, 1207, 1242, 1277, 1312, 1347, 1382, 1417,
  1453, 1488, 1523, 1559, 1594, 1630, 1665, 1701, 1736, 1772,
  1808, 1843, 1879, 1915, 1951, 1986,
]
const WATER_SENSOR_OFFSET_MM = 5

function waterMmToMl(rawMm) {
  const mm = Math.max(0, rawMm + WATER_SENSOR_OFFSET_MM)
  const idx = Math.min(Math.floor(mm), WATER_MM_TO_ML.length - 1)
  return WATER_MM_TO_ML[idx]
}

function waterMlToMm(ml) {
  for (let i = WATER_MM_TO_ML.length - 1; i >= 0; i--) {
    if (WATER_MM_TO_ML[i] <= ml) return Math.max(0, i - WATER_SENSOR_OFFSET_MM)
  }
  return 0
}

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
const toast = inject('toast', null)

const isML = computed(() => settings?.waterLevelDisplayUnit === 'ml')

let refillSendTimer = null
function scheduleRefillSend(mm) {
  if (refillSendTimer) clearTimeout(refillSendTimer)
  refillSendTimer = setTimeout(async () => {
    refillSendTimer = null
    try {
      await updateWaterLevelThreshold(mm)
    } catch (e) {
      toast?.error(`Failed to set refill level: ${e?.message || e}`)
    }
  }, 300)
}

const refillThresholdDisplay = computed({
  get: () => isML.value ? waterMmToMl(settings.waterRefillThreshold) : settings.waterRefillThreshold,
  set: (v) => {
    const mm = isML.value ? waterMlToMm(v) : v
    settings.waterRefillThreshold = mm
    scheduleRefillSend(mm)
  },
})

onUnmounted(() => {
  if (refillSendTimer) {
    // Flush any pending write before tearing down.
    clearTimeout(refillSendTimer)
    refillSendTimer = null
    updateWaterLevelThreshold(settings.waterRefillThreshold).catch((e) => {
      toast?.error(`Failed to set refill level: ${e?.message || e}`)
    })
  }
})
</script>

<template>
  <div class="water-tab" v-if="settings">
    <div class="water-tab__field">
      <label class="water-tab__label">Water level display</label>
      <div class="water-tab__seg-group">
        <button
          class="water-tab__seg"
          :class="{ 'water-tab__seg--active': settings.waterLevelDisplayUnit === 'mm' }"
          @click="settings.waterLevelDisplayUnit = 'mm'"
        >mm</button>
        <button
          class="water-tab__seg"
          :class="{ 'water-tab__seg--active': settings.waterLevelDisplayUnit === 'ml' }"
          @click="settings.waterLevelDisplayUnit = 'ml'"
        >mL</button>
      </div>
    </div>

    <div class="water-tab__field">
      <label class="water-tab__label">Refill threshold</label>
      <ValueInput
        :model-value="refillThresholdDisplay"
        @update:model-value="v => refillThresholdDisplay = v"
        :min="0"
        :max="isML ? 1500 : 120"
        :step="isML ? 50 : 5"
        :suffix="isML ? ' ml' : ' mm'"
      />
      <span class="water-tab__hint">Warn when water drops below this level</span>
    </div>
  </div>
  <div v-else class="water-tab__empty">Settings not available.</div>
</template>

<style scoped>
.water-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 480px;
}

.water-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.water-tab__label {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

.water-tab__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.water-tab__seg-group {
  display: flex;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  width: fit-content;
}

.water-tab__seg {
  min-height: 44px;
  padding: 8px 20px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.water-tab__seg--active {
  background: var(--color-primary);
  color: var(--color-text);
}

.water-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
