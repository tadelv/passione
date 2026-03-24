<script setup>
defineProps({
  toasts: { type: Array, default: () => [] },
})

defineEmits(['dismiss'])

const TYPE_ICONS = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
}
</script>

<template>
  <div class="toast-container" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="[`toast--${toast.type}`, { 'toast--fading': !toast.visible }]"
        @click="$emit('dismiss', toast.id)"
      >
        <span class="toast__icon">{{ TYPE_ICONS[toast.type] || '' }}</span>
        <span class="toast__message">{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: 360px;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  pointer-events: auto;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.toast--fading {
  opacity: 0;
}

.toast--success {
  background: rgba(76, 175, 80, 0.9);
}

.toast--error {
  background: rgba(244, 67, 54, 0.9);
}

.toast--warning {
  background: rgba(255, 193, 7, 0.9);
  color: #000;
}

.toast--info {
  background: rgba(78, 133, 244, 0.9);
}

.toast__icon {
  font-size: 16px;
  flex-shrink: 0;
}

.toast__message {
  flex: 1;
  line-height: 1.3;
}

/* TransitionGroup animations */
.toast-enter-active {
  transition: all 0.3s ease;
}

.toast-leave-active {
  transition: all 0.3s ease;
  position: absolute;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
