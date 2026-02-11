<script setup>
defineProps({
  label: { type: String, default: '' },
  icon: { type: String, default: '' },
  color: { type: String, default: 'var(--color-primary)' },
  disabled: { type: Boolean, default: false },
})

defineEmits(['click'])
</script>

<template>
  <button
    class="action-button"
    :class="{ disabled }"
    :style="{ '--btn-color': color }"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <span v-if="icon" class="action-button__icon">{{ icon }}</span>
    <span class="action-button__label">{{ label }}</span>
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
  transition: filter 0.1s ease;
  -webkit-tap-highlight-color: transparent;
}

.action-button:hover:not(.disabled) {
  filter: brightness(1.1);
}

.action-button:active:not(.disabled) {
  filter: brightness(0.85);
}

.action-button.disabled {
  background-color: var(--button-disabled);
  cursor: default;
}

.action-button.disabled .action-button__icon {
  opacity: 0.5;
}

.action-button.disabled .action-button__label {
  color: var(--color-text-secondary);
}

.action-button__icon {
  font-size: 48px;
  line-height: 1;
}

.action-button__label {
  font-size: var(--font-body);
}
</style>
