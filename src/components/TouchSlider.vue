<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  color: { type: String, default: 'var(--color-primary)' },
  showButtons: { type: Boolean, default: true },
  suffix: { type: String, default: '' },
  decimals: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue'])

const internalValue = ref(props.modelValue)

watch(() => props.modelValue, (v) => { internalValue.value = v })

const progress = computed(() =>
  ((internalValue.value - props.min) / (props.max - props.min)) * 100
)

function clamp(val) {
  const stepped = Math.round(val / props.step) * props.step
  return Math.max(props.min, Math.min(props.max, stepped))
}

function increment() {
  const v = clamp(internalValue.value + props.step)
  internalValue.value = v
  emit('update:modelValue', v)
}

function decrement() {
  const v = clamp(internalValue.value - props.step)
  internalValue.value = v
  emit('update:modelValue', v)
}

function onInput(e) {
  const v = clamp(parseFloat(e.target.value))
  internalValue.value = v
  emit('update:modelValue', v)
}
</script>

<template>
  <div class="touch-slider">
    <button
      v-if="showButtons"
      class="touch-slider__btn"
      :disabled="internalValue <= min"
      @click="decrement"
    >
      &minus;
    </button>

    <div class="touch-slider__track-wrap">
      <input
        type="range"
        class="touch-slider__input"
        :min="min"
        :max="max"
        :step="step"
        :value="internalValue"
        :style="{ '--progress': progress + '%', '--slider-color': color }"
        @input="onInput"
      />
    </div>

    <button
      v-if="showButtons"
      class="touch-slider__btn"
      :disabled="internalValue >= max"
      @click="increment"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.touch-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 60px;
}

.touch-slider__btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.touch-slider__btn:disabled {
  color: var(--color-text-secondary);
  cursor: default;
}

.touch-slider__btn:active:not(:disabled) {
  background: var(--color-background);
}

.touch-slider__track-wrap {
  flex: 1;
  height: 60px;
  display: flex;
  align-items: center;
}

.touch-slider__input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(
    to right,
    var(--slider-color) 0%,
    var(--slider-color) var(--progress),
    var(--color-surface) var(--progress),
    var(--color-surface) 100%
  );
  outline: none;
  cursor: pointer;
}

.touch-slider__input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--slider-color);
  cursor: pointer;
}
</style>
