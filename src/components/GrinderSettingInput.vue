<script setup>
import { computed, watch } from 'vue'
import ValueInput from './ValueInput.vue'
import {
  grinderSettingStep,
  grinderSettingDecimals,
  roundGrinderSetting,
} from '../composables/useGrinderSetting.js'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  grinder: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue'])

const settingStep = computed(() => grinderSettingStep(props.grinder))
const settingDecimals = computed(() => grinderSettingDecimals(props.grinder))

function onInput(e) {
  emit('update:modelValue', e.target.value)
}

function onSelect(e) {
  emit('update:modelValue', e.target.value)
}

function onNumeric(v) {
  emit('update:modelValue', String(v))
}

// Normalize values that enter the form from anywhere — stepper float noise
// (0.1-step increments emit 12.300000000000001), combo loads, workflow
// overlays — by snapping to the grinder's step grid (max 2 decimals) and
// pushing the clean value back into the form ref, so the workflow PUT,
// recipe save, and dirty compare all see the normalized setting. Terminates:
// a clean value re-enters unchanged.
watch(() => props.modelValue, (v) => {
  const clean = roundGrinderSetting(v, props.grinder)
  if (clean !== v) emit('update:modelValue', clean)
})
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
    :step="settingStep"
    :min="0"
    :max="grinder.settingMax || 1000"
    :decimals="settingDecimals"
    aria-label="Grind setting"
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
