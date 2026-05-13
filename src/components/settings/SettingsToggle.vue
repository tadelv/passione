<script setup>
defineProps({
  modelValue: { type: Boolean, required: true },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <button
    type="button"
    class="settings-toggle"
    :class="{ 'settings-toggle--on': modelValue, 'settings-toggle--disabled': disabled }"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="ariaLabel || undefined"
    :disabled="disabled"
    :data-on="modelValue ? '1' : ''"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="settings-toggle__track">
      <span class="settings-toggle__knob" />
    </span>
  </button>
</template>

<style scoped>
.settings-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  min-height: 44px;
  padding: 7px 2px;
  background: transparent;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
}

.settings-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 22px;
}

.settings-toggle__track {
  width: 52px;
  height: 30px;
  border-radius: 15px;
  background: var(--color-border);
  position: relative;
  transition: background-color 0.2s ease;
}

.settings-toggle--on .settings-toggle__track {
  background: var(--color-success);
}

.settings-toggle__knob {
  position: absolute;
  top: 50%;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  transform: translateY(-50%);
  transition: left 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.settings-toggle--on .settings-toggle__knob {
  left: 25px;
}

.settings-toggle--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
