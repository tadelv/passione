<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  /** Array of preset objects: [{ name, emoji, ... }] */
  presets: { type: Array, default: () => [] },
  /** Index of the currently selected preset (-1 = none) */
  selectedIndex: { type: Number, default: -1 },
  /** Enable double-tap interaction (opens edit popup) */
  longPressEnabled: { type: Boolean, default: false },
  /** P6-4: Accessible label for the preset list */
  ariaLabel: { type: String, default: 'Presets' },
})

const emit = defineEmits([
  'select',
  'activate',
  'long-press',
])

// Track which index we last emitted 'select' for, to handle
// the Vue re-render race (props.selectedIndex may not have updated yet)
let lastEmittedSelectIndex = -1

const pillRefs = ref([])

const displayPresets = computed(() =>
  props.presets.map((p, i) => ({
    ...p,
    index: i,
    display: (p.emoji ? p.emoji + ' ' : '') + (p.name || `Preset ${i + 1}`),
  }))
)

function onClick(index, event) {
  // Double-tap → edit (event.detail is the native click count)
  if (event.detail >= 2 && props.longPressEnabled) {
    emit('long-press', index)
    return
  }

  // Check if this preset is already selected (either via props or our local tracking)
  const isSelected = index === props.selectedIndex || index === lastEmittedSelectIndex

  if (isSelected) {
    // Tap on selected preset → activate (start operation)
    lastEmittedSelectIndex = -1
    emit('activate', index)
    return
  }

  // First tap → select this preset
  lastEmittedSelectIndex = index
  emit('select', index)
}
</script>

<template>
  <div class="preset-pill-row" v-if="displayPresets.length > 0" :aria-label="ariaLabel">
    <div class="preset-pill-row__pills" role="listbox" :aria-label="ariaLabel">
      <button
        v-for="preset in displayPresets"
        :key="preset.index"
        :ref="el => { if (el) pillRefs[preset.index] = el }"
        class="preset-pill-row__pill"
        :class="{ 'preset-pill-row__pill--selected': preset.index === selectedIndex }"
        role="option"
        :aria-selected="preset.index === selectedIndex"
        @click="onClick(preset.index, $event)"
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
  font-size: var(--font-body);
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
  color: var(--color-text);
}
</style>
