<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  decimals: { type: Number, default: 0 },
  suffix: { type: String, default: '' },
  valueColor: { type: String, default: 'var(--color-text)' },
  /** Override default display text (e.g. for custom formatting) */
  displayText: { type: String, default: null },
  /** P6-4: Accessible label for screen readers */
  ariaLabel: { type: String, default: 'Value' },
})

const emit = defineEmits(['update:modelValue'])

const internalValue = ref(props.modelValue)

watch(() => props.modelValue, (v) => { internalValue.value = v })

const formattedText = computed(() =>
  props.displayText != null
    ? props.displayText
    : internalValue.value.toFixed(props.decimals) + props.suffix
)

const isOutOfRange = computed(() =>
  internalValue.value < props.min || internalValue.value > props.max
)

/**
 * One-sided clamp: allows out-of-range values to move toward the valid
 * range without snapping. When decreasing, only floor at min (don't
 * ceiling at max). When increasing, only ceiling at max (don't floor at
 * min). This preserves authored profile values that exceed editor limits
 * (e.g. baseline_hc.json has flow=12) — the user can decrement naturally
 * until the value enters range, instead of jumping to max on first touch.
 */
function clampOneSided(val, direction) {
  const stepped = Math.round(val / props.step) * props.step
  if (direction < 0) return Math.max(props.min, stepped)
  return Math.min(props.max, stepped)
}

function adjust(steps) {
  const v = clampOneSided(internalValue.value + steps * props.step, steps)
  if (v !== internalValue.value) {
    internalValue.value = v
    emit('update:modelValue', v)
  }
}

// Press-and-hold repeat (matches QML 80ms interval)
let holdTimer = null
let holdDelay = null

function startHold(direction) {
  holdDelay = setTimeout(() => {
    holdTimer = setInterval(() => adjust(direction), 80)
  }, 300)
}

function stopHold() {
  clearTimeout(holdDelay)
  clearInterval(holdTimer)
  holdDelay = null
  holdTimer = null
}

// Drag-to-adjust: horizontal pointer movement changes value (20px = 1 step)
const isDragging = ref(false)
let dragStartX = 0
let dragStartValue = 0
const DRAG_PX_PER_STEP = 20

function onDisplayPointerDown(e) {
  isDragging.value = true
  dragStartX = e.clientX
  dragStartValue = internalValue.value
  e.target.setPointerCapture(e.pointerId)
}

function onDisplayPointerMove(e) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStartX
  const stepsDelta = Math.round(dx / DRAG_PX_PER_STEP)
  const target = dragStartValue + stepsDelta * props.step
  // Direction relative to drag start — one-sided clamp lets out-of-range
  // values drag toward range without snapping.
  const dir = target < dragStartValue ? -1 : 1
  const v = clampOneSided(target, dir)
  if (v !== internalValue.value) {
    internalValue.value = v
    emit('update:modelValue', v)
  }
}

function onDisplayPointerUp() {
  isDragging.value = false
}

// Keyboard support
function onKeyDown(e) {
  switch (e.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      e.preventDefault()
      adjust(1)
      return
    case 'ArrowDown':
    case 'ArrowLeft':
      e.preventDefault()
      adjust(-1)
      return
    case 'PageUp':
      e.preventDefault()
      adjust(10)
      return
    case 'PageDown':
      e.preventDefault()
      adjust(-10)
      return
    case 'Home':
      e.preventDefault()
      if (internalValue.value !== props.min) {
        internalValue.value = props.min
        emit('update:modelValue', props.min)
      }
      return
    case 'End':
      e.preventDefault()
      if (internalValue.value !== props.max) {
        internalValue.value = props.max
        emit('update:modelValue', props.max)
      }
      return
  }
}

onUnmounted(stopHold)
</script>

<template>
  <div
    class="value-input"
    :class="{ 'value-input--out-of-range': isOutOfRange }"
    tabindex="0"
    role="spinbutton"
    :aria-valuenow="internalValue"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-label="ariaLabel"
    :aria-valuetext="formattedText"
    @keydown="onKeyDown"
  >
    <button
      class="value-input__btn"
      tabindex="-1"
      :disabled="internalValue <= min"
      aria-label="Decrease value"
      @click="adjust(-1)"
      @pointerdown.prevent="startHold(-1)"
      @pointerup="stopHold"
      @pointerleave="stopHold"
      @pointercancel="stopHold"
    >
      &minus;
    </button>

    <div
      class="value-input__display"
      :class="{ 'value-input__display--dragging': isDragging }"
      :style="{ color: isOutOfRange ? 'var(--color-accent, #e94560)' : valueColor }"
      @pointerdown.prevent="onDisplayPointerDown"
      @pointermove="onDisplayPointerMove"
      @pointerup="onDisplayPointerUp"
      @pointercancel="onDisplayPointerUp"
    >
      {{ formattedText }}
    </div>

    <button
      class="value-input__btn"
      tabindex="-1"
      :disabled="internalValue >= max"
      aria-label="Increase value"
      @click="adjust(1)"
      @pointerdown.prevent="startHold(1)"
      @pointerup="stopHold"
      @pointerleave="stopHold"
      @pointercancel="stopHold"
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

.value-input--out-of-range {
  border-color: var(--color-accent, #e94560);
}

.value-input__btn {
  width: 40px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-title);
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
  background: var(--color-surface-hover);
}

.value-input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.value-input__display {
  flex: 1;
  text-align: center;
  font-size: var(--font-title);
  font-weight: bold;
  white-space: nowrap;
  min-width: 0;
  padding: 0 4px;
  cursor: ew-resize;
  user-select: none;
  touch-action: none;
}

.value-input__display--dragging {
  opacity: 0.7;
}
</style>
