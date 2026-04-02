<script setup>
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  message: { type: String, default: '' },
  displayValue: { type: String, default: '' },
})

const emit = defineEmits(['dismiss'])

const showing = ref(false)
const fading = ref(false)
let dismissTimer = null
let fadeTimer = null

watch(() => props.visible, (val) => {
  if (val) {
    showing.value = true
    fading.value = false
    clearTimeout(dismissTimer)
    clearTimeout(fadeTimer)
    // Start fade-out after 2.8s, dismiss at 3s
    fadeTimer = setTimeout(() => {
      fading.value = true
    }, 2800)
    dismissTimer = setTimeout(() => {
      showing.value = false
      fading.value = false
      emit('dismiss')
    }, 3000)
  } else {
    clearTimeout(dismissTimer)
    clearTimeout(fadeTimer)
    showing.value = false
    fading.value = false
  }
})

onUnmounted(() => {
  clearTimeout(dismissTimer)
  clearTimeout(fadeTimer)
})
</script>

<template>
  <Transition name="completion">
    <div
      v-if="showing"
      class="completion-overlay"
      :class="{ 'completion-overlay--fading': fading }"
      @click="emit('dismiss')"
    >
      <div class="completion-overlay__content">
        <!-- Checkmark circle -->
        <div class="completion-overlay__check">
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="28" stroke="var(--color-primary)" stroke-width="4" />
            <polyline
              points="18,32 26,40 42,22"
              stroke="var(--color-primary)"
              stroke-width="4"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <div class="completion-overlay__message">{{ message }}</div>
        <div v-if="displayValue" class="completion-overlay__value">{{ displayValue }}</div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.completion-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-modal);
  background: var(--color-overlay-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s ease;
}

.completion-overlay--fading {
  opacity: 0;
}

.completion-overlay__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.completion-overlay__check {
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.completion-overlay__check svg {
  width: 100%;
  height: 100%;
}

.completion-overlay__message {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
}

.completion-overlay__value {
  font-size: var(--font-timer);
  font-weight: bold;
  color: var(--color-primary);
}

.completion-enter-active {
  transition: opacity 0.1s ease;
}

.completion-leave-active {
  transition: opacity 0.2s ease;
}

.completion-enter-from,
.completion-leave-to {
  opacity: 0;
}
</style>
