<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  /** All suggestions to filter from */
  suggestions: { type: Array, default: () => [] },
  /** Max visible suggestions in dropdown */
  maxVisible: { type: Number, default: 6 },
})

const emit = defineEmits(['update:modelValue'])

const inputEl = ref(null)
const focused = ref(false)
const internalValue = ref(props.modelValue)

watch(() => props.modelValue, (v) => { internalValue.value = v })

const filteredSuggestions = computed(() => {
  const q = internalValue.value.toLowerCase().trim()
  if (!q) return props.suggestions.slice(0, props.maxVisible)
  return props.suggestions
    .filter(s => s.toLowerCase().includes(q) && s !== internalValue.value)
    .slice(0, props.maxVisible)
})

const showDropdown = computed(() =>
  focused.value && filteredSuggestions.value.length > 0
)

function onInput(e) {
  internalValue.value = e.target.value
  emit('update:modelValue', e.target.value)
}

function selectSuggestion(val) {
  internalValue.value = val
  emit('update:modelValue', val)
  focused.value = false
  inputEl.value?.blur()
}

function onFocus() {
  focused.value = true
}

function onBlur() {
  // Delay to allow click on suggestion to fire
  setTimeout(() => { focused.value = false }, 150)
}
</script>

<template>
  <div class="suggestion-field">
    <input
      ref="inputEl"
      class="suggestion-field__input"
      type="text"
      :value="internalValue"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
    <Transition name="dropdown-fade">
      <div v-if="showDropdown" class="suggestion-field__dropdown">
        <button
          v-for="suggestion in filteredSuggestions"
          :key="suggestion"
          class="suggestion-field__option"
          @pointerdown.prevent="selectSuggestion(suggestion)"
        >
          {{ suggestion }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.suggestion-field {
  position: relative;
  width: 100%;
}

.suggestion-field__input {
  width: 100%;
  height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
  outline: none;
}

.suggestion-field__input:focus {
  border-color: var(--color-primary);
}

.suggestion-field__input::placeholder {
  color: var(--color-text-secondary);
}

.suggestion-field__dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  margin-top: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  max-height: 240px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.suggestion-field__option {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-body);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.suggestion-field__option:active {
  background: rgba(255, 255, 255, 0.05);
}

.suggestion-field__option + .suggestion-field__option {
  border-top: 1px solid var(--color-border);
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.1s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
}
</style>
