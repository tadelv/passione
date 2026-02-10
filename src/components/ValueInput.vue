<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  decimals: { type: Number, default: 0 },
  suffix: { type: String, default: '' },
  valueColor: { type: String, default: 'var(--color-text)' },
})

const emit = defineEmits(['update:modelValue'])

const internalValue = ref(props.modelValue)

watch(() => props.modelValue, (v) => { internalValue.value = v })

const displayText = computed(() =>
  internalValue.value.toFixed(props.decimals) + props.suffix
)

function clamp(val) {
  const stepped = Math.round(val / props.step) * props.step
  return Math.max(props.min, Math.min(props.max, stepped))
}

function adjust(steps) {
  const v = clamp(internalValue.value + steps * props.step)
  if (v !== internalValue.value) {
    internalValue.value = v
    emit('update:modelValue', v)
  }
}
</script>

<template>
  <div class="value-input">
    <button
      class="value-input__btn"
      :disabled="internalValue <= min"
      @click="adjust(-1)"
    >
      &minus;
    </button>

    <div class="value-input__display" :style="{ color: valueColor }">
      {{ displayText }}
    </div>

    <button
      class="value-input__btn"
      :disabled="internalValue >= max"
      @click="adjust(1)"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.value-input {
  display: flex;
  align-items: center;
  background: var(--color-surface);
  border: 1px solid var(--color-text-secondary);
  border-radius: 12px;
  overflow: hidden;
  height: 56px;
}

.value-input__btn {
  width: 40px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 20px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.value-input__btn:disabled {
  color: var(--color-text-secondary);
  cursor: default;
}

.value-input__btn:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}

.value-input__display {
  flex: 1;
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  white-space: nowrap;
  min-width: 0;
  padding: 0 4px;
}
</style>
