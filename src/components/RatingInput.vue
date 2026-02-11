<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  /** Show preset buttons below the slider */
  showPresets: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue'])

const internalValue = ref(props.modelValue)
watch(() => props.modelValue, (v) => { internalValue.value = v })

const progress = computed(() => internalValue.value)

const gradientStyle = computed(() => ({
  '--progress': progress.value + '%',
}))

function clamp(val) {
  return Math.max(0, Math.min(100, Math.round(val)))
}

function onInput(e) {
  const v = clamp(parseFloat(e.target.value))
  internalValue.value = v
  emit('update:modelValue', v)
}

function setPreset(val) {
  internalValue.value = val
  emit('update:modelValue', val)
}

function onKeydown(e) {
  let v = internalValue.value
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      e.preventDefault()
      v = clamp(v + 1)
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      e.preventDefault()
      v = clamp(v - 1)
      break
    case 'PageUp':
      e.preventDefault()
      v = clamp(v + 25)
      break
    case 'PageDown':
      e.preventDefault()
      v = clamp(v - 25)
      break
    default:
      return
  }
  internalValue.value = v
  emit('update:modelValue', v)
}

const displayText = computed(() =>
  internalValue.value > 0 ? internalValue.value + '%' : 'Unrated'
)
</script>

<template>
  <div class="rating-input" @keydown="onKeydown">
    <div class="rating-input__row">
      <span class="rating-input__label">{{ displayText }}</span>
      <div class="rating-input__track-wrap" :style="gradientStyle">
        <input
          type="range"
          class="rating-input__slider"
          :min="0"
          :max="100"
          :step="1"
          :value="internalValue"
          @input="onInput"
        />
      </div>
    </div>
    <div v-if="showPresets" class="rating-input__presets">
      <button
        v-for="val in [25, 50, 75, 100]"
        :key="val"
        class="rating-input__preset"
        :class="{ 'rating-input__preset--active': internalValue === val }"
        @click="setPreset(val)"
      >
        {{ val }}%
      </button>
    </div>
  </div>
</template>

<style scoped>
.rating-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rating-input__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rating-input__label {
  min-width: 64px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-warning);
  white-space: nowrap;
}

.rating-input__track-wrap {
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
}

.rating-input__slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(
    to right,
    #f44336 0%,
    #FFC107 50%,
    #4caf50 100%
  );
  outline: none;
  cursor: pointer;
  position: relative;
}

.rating-input__slider::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 4px;
  background: linear-gradient(
    to right,
    transparent 0%,
    transparent var(--progress),
    var(--color-surface) var(--progress),
    var(--color-surface) 100%
  );
  pointer-events: none;
}

.rating-input__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: white;
  border: 2px solid var(--color-border);
  cursor: pointer;
  position: relative;
  z-index: 1;
}

.rating-input__presets {
  display: flex;
  gap: 8px;
}

.rating-input__preset {
  flex: 1;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.rating-input__preset:active {
  transform: scale(0.96);
}

.rating-input__preset--active {
  background: var(--color-warning);
  color: #000;
  border-color: var(--color-warning);
}
</style>
