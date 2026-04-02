<script setup>
import ValueInput from './ValueInput.vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  grinder: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue'])

function onInput(e) {
  emit('update:modelValue', e.target.value)
}

function onSelect(e) {
  emit('update:modelValue', e.target.value)
}

function onNumeric(v) {
  emit('update:modelValue', String(v))
}
</script>

<template>
  <select
    v-if="grinder?.settingType === 'preset'"
    class="grinder-setting__select"
    aria-label="Grinder setting"
    :value="modelValue"
    @change="onSelect"
  >
    <option value="">Select...</option>
    <option
      v-for="val in grinder.settingValues"
      :key="val"
      :value="val"
    >
      {{ val }}
    </option>
  </select>

  <ValueInput
    v-else-if="grinder?.settingType === 'numeric'"
    :modelValue="Number(modelValue) || 0"
    :step="grinder.settingSmallStep || 0.5"
    :min="0"
    :max="100"
    @update:modelValue="onNumeric"
  />

  <input
    v-else
    class="grinder-setting__text"
    type="text"
    aria-label="Grind setting"
    :value="modelValue"
    @input="onInput"
    placeholder="Grind setting"
  />
</template>

<style scoped>
.grinder-setting__select,
.grinder-setting__text {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
  outline: none;
}

.grinder-setting__select:focus,
.grinder-setting__text:focus {
  border-color: var(--color-primary);
}

.grinder-setting__text::placeholder {
  color: var(--color-text-secondary);
}
</style>
