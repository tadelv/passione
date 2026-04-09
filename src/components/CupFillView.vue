<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentWeight: { type: Number, default: 0 },
  targetWeight: { type: Number, default: 36 },
  flow: { type: Number, default: 0 },
  isPouring: { type: Boolean, default: false },
})

const fillPercent = computed(() => {
  if (props.targetWeight <= 0) return 0
  return Math.min(100, (props.currentWeight / props.targetWeight) * 100)
})

const cremaHeight = computed(() => {
  // Crema grows during early pour, stabilizes after 60%
  if (fillPercent.value < 5) return 0
  return Math.min(12, fillPercent.value * 0.2)
})

const showStream = computed(() => props.isPouring && props.flow > 0.2)
</script>

<template>
  <div class="cup-fill" aria-hidden="true">
    <!-- Cup body -->
    <div class="cup-fill__cup">
      <!-- Coffee fill -->
      <div
        class="cup-fill__coffee"
        :style="{ height: fillPercent + '%' }"
      >
        <!-- Crema layer -->
        <div
          class="cup-fill__crema"
          :style="{ height: cremaHeight + 'px' }"
        />
        <!-- Wave animation -->
        <div v-if="isPouring" class="cup-fill__wave" />
      </div>

      <!-- Stream from portafilter -->
      <div v-if="showStream" class="cup-fill__stream" />
    </div>

    <!-- Handle -->
    <div class="cup-fill__handle" />

    <!-- Weight label -->
    <div class="cup-fill__weight">
      {{ currentWeight.toFixed(1) }}g
    </div>
  </div>
</template>

<style scoped>
.cup-fill {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 8px;
}

.cup-fill__cup {
  position: relative;
  width: 64px;
  height: 80px;
  border: 2.5px solid var(--color-text-secondary);
  border-top: none;
  border-radius: 0 0 12px 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
}

.cup-fill__coffee {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(
    to top,
    #3d1c02 0%,
    #5c2d0e 40%,
    #7a3d14 80%,
    #8b5a2b 100%
  );
  transition: height 0.15s linear;
  border-radius: 0 0 10px 10px;
}

.cup-fill__crema {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(
    to bottom,
    #c4915e,
    #a87040
  );
  border-radius: 2px 2px 0 0;
  transition: height 0.3s ease;
}

.cup-fill__wave {
  position: absolute;
  top: -2px;
  left: -10%;
  right: -10%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 50%;
  animation: cup-wave 1.5s ease-in-out infinite;
}

@keyframes cup-wave {
  0%, 100% { transform: translateX(-5%) scaleY(1); }
  50% { transform: translateX(5%) scaleY(1.5); }
}

.cup-fill__stream {
  position: absolute;
  top: -20px;
  left: 50%;
  width: 3px;
  height: 20px;
  background: linear-gradient(to bottom, rgba(90, 50, 10, 0.3), rgba(90, 50, 10, 0.8));
  transform: translateX(-50%);
  border-radius: 1px;
  animation: stream-drip 0.4s ease-in infinite;
}

@keyframes stream-drip {
  0% { opacity: 0.5; height: 16px; }
  50% { opacity: 1; height: 22px; }
  100% { opacity: 0.5; height: 16px; }
}

.cup-fill__handle {
  position: absolute;
  right: calc(50% - 52px);
  bottom: 24px;
  width: 14px;
  height: 28px;
  border: 2.5px solid var(--color-text-secondary);
  border-left: none;
  border-radius: 0 8px 8px 0;
}

.cup-fill__weight {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  font-size: var(--font-caption);
  font-weight: 700;
  color: var(--color-weight);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .cup-fill__wave,
  .cup-fill__stream {
    animation: none;
  }
}
</style>
