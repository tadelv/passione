<script setup>
import { computed, inject } from 'vue'

const warningState = inject('waterWarningState', null)

const visible = computed(() => {
  const s = warningState?.value
  return s === 'low' || s === 'warning' || s === 'critical'
})

const label = computed(() => {
  switch (warningState?.value) {
    case 'low': return 'LOW'
    case 'warning': return 'REFILL SOON'
    case 'critical': return 'REFILL NOW'
    default: return ''
  }
})

const stateClass = computed(() => {
  const s = warningState?.value
  if (s === 'low') return 'ssww--low'
  if (s === 'warning') return 'ssww--warning'
  if (s === 'critical') return 'ssww--critical'
  return ''
})
</script>

<template>
  <div
    v-if="visible"
    class="ssww"
    :class="stateClass"
    role="status"
    aria-live="polite"
    data-testid="screensaver-water-warning"
  >
    <svg class="ssww__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 C 8 10, 5 14, 5 17 A 7 7 0 0 0 19 17 C 19 14, 16 10, 12 3 Z" fill="currentColor" />
    </svg>
    <span class="ssww__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.ssww {
  position: absolute;
  top: 16px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  font-size: var(--font-md);
  font-weight: 700;
  letter-spacing: 0.08em;
  z-index: calc(var(--z-overlay, 100) + 1);
  pointer-events: none;
  animation: ssww-blink var(--ssww-interval, 2000ms) ease-in-out infinite;
}

.ssww__icon {
  width: 16px;
  height: 16px;
}

.ssww--low {
  color: var(--color-water-low);
  --ssww-interval: 2000ms;
}

.ssww--warning {
  color: var(--color-warning);
  --ssww-interval: 1000ms;
}

.ssww--critical {
  color: var(--color-error);
  --ssww-interval: 500ms;
}

@keyframes ssww-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
</style>
