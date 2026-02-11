<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  /** Array of preset objects: [{ name, emoji, ... }] */
  presets: { type: Array, default: () => [] },
  /** Index of the currently selected preset (-1 = none) */
  selectedIndex: { type: Number, default: -1 },
  /** Enable long-press interaction */
  longPressEnabled: { type: Boolean, default: false },
})

const emit = defineEmits([
  'select',
  'activate',
  'long-press',
])

let longPressTimer = null
let longPressTriggered = false
let lastClickTime = 0
let lastClickIndex = -1

const pillRefs = ref([])

const displayPresets = computed(() =>
  props.presets.map((p, i) => ({
    ...p,
    index: i,
    display: (p.emoji ? p.emoji + ' ' : '') + (p.name || `Preset ${i + 1}`),
  }))
)

function onPointerDown(index, e) {
  longPressTriggered = false
  if (props.longPressEnabled) {
    longPressTimer = setTimeout(() => {
      longPressTriggered = true
      emit('long-press', index)
    }, 500)
  }
}

function onPointerUp(index) {
  clearTimeout(longPressTimer)
  longPressTimer = null
}

function onPointerLeave() {
  clearTimeout(longPressTimer)
  longPressTimer = null
}

function onClick(index) {
  if (longPressTriggered) return

  const now = Date.now()
  // Double-click detection: same index, within 400ms
  if (index === lastClickIndex && now - lastClickTime < 400 && index === props.selectedIndex) {
    emit('activate', index)
    lastClickTime = 0
    lastClickIndex = -1
    return
  }

  lastClickTime = now
  lastClickIndex = index

  if (index === props.selectedIndex) {
    // Already selected - single click on selected does nothing special
    // (double-click will activate on next fast click)
    return
  }

  emit('select', index)
}
</script>

<template>
  <div class="preset-pill-row" v-if="displayPresets.length > 0">
    <div class="preset-pill-row__pills">
      <button
        v-for="preset in displayPresets"
        :key="preset.index"
        :ref="el => { if (el) pillRefs[preset.index] = el }"
        class="preset-pill-row__pill"
        :class="{ 'preset-pill-row__pill--selected': preset.index === selectedIndex }"
        @click="onClick(preset.index)"
        @pointerdown.prevent="onPointerDown(preset.index, $event)"
        @pointerup="onPointerUp(preset.index)"
        @pointerleave="onPointerLeave()"
      >
        {{ preset.display }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.preset-pill-row {
  width: 100%;
}

.preset-pill-row__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.preset-pill-row__pill {
  height: 50px;
  padding: 0 40px;
  border-radius: 10px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease, transform 0.1s ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  touch-action: manipulation;
}

.preset-pill-row__pill:active {
  transform: scale(0.96);
}

.preset-pill-row__pill--selected {
  background: var(--color-primary);
  color: #fff;
}
</style>
