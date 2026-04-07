<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  label: { type: String, default: '' },
  icon: { type: String, default: '' },
  color: { type: String, default: 'var(--color-primary)' },
  disabled: { type: Boolean, default: false },
  /** P6-4: Override accessible label (defaults to label prop) */
  ariaLabel: { type: String, default: null },
  /** Require double-tap to activate (first tap = confirm state) */
  confirmTap: { type: Boolean, default: true },
})

const emit = defineEmits(['click'])

// Two-step tap: first tap shows "confirm" state, second tap activates
const confirmed = ref(false)
let confirmTimer = null

function clearConfirmTimer() {
  if (confirmTimer) {
    clearTimeout(confirmTimer)
    confirmTimer = null
  }
}

function onClick() {
  if (props.disabled) return

  if (!props.confirmTap) {
    emit('click')
    return
  }

  if (confirmed.value) {
    // Second tap — activate
    confirmed.value = false
    clearConfirmTimer()
    emit('click')
  } else {
    // First tap — enter confirm state
    confirmed.value = true
    clearConfirmTimer()
    // Reset confirm state after 2 seconds
    confirmTimer = setTimeout(() => {
      confirmed.value = false
    }, 2000)
  }
}

onUnmounted(() => {
  clearConfirmTimer()
})
</script>

<template>
  <button
    class="action-button"
    :class="{ disabled, 'action-button--confirmed': confirmed }"
    :style="{ '--btn-color': color }"
    :disabled="disabled"
    :aria-label="ariaLabel || label"
    @click="onClick"
  >
    <span v-if="icon" class="action-button__icon" v-html="icon"></span>
    <span class="action-button__label">{{ confirmed ? 'Tap to start' : label }}</span>
  </button>
</template>

<style scoped>
.action-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 150px;
  height: 120px;
  border: none;
  border-radius: var(--radius-button);
  background-color: var(--btn-color);
  color: var(--color-text);
  cursor: pointer;
  transition: filter 0.1s ease, box-shadow 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.action-button:hover:not(.disabled) {
  filter: brightness(1.1);
}

.action-button:active:not(.disabled) {
  filter: brightness(0.85);
}

.action-button--confirmed {
  box-shadow: 0 0 0 3px white, 0 0 12px rgba(255, 255, 255, 0.5);
  filter: brightness(1.15);
}

.action-button.disabled {
  background-color: var(--button-disabled);
  cursor: default;
}

.action-button.disabled .action-button__icon {
  color: var(--button-disabled-text);
}

.action-button.disabled .action-button__label {
  color: var(--color-text-secondary);
}

.action-button__icon {
  width: 36px;
  height: 36px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-button__icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.action-button__label {
  font-size: var(--font-body);
}
</style>
