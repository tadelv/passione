<script setup>
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  reason: { type: String, default: '' },
})

const emit = defineEmits(['dismiss'])

const showing = ref(false)
const animating = ref(false)
const fading = ref(false)
let dismissTimer = null
let fadeTimer = null

watch(() => props.visible, (val) => {
  if (val && props.reason) {
    showing.value = true
    fading.value = false
    // Trigger punch-in animation
    animating.value = false
    requestAnimationFrame(() => { animating.value = true })
    clearTimeout(dismissTimer)
    clearTimeout(fadeTimer)
    // Start fade after 1s, dismiss at 3s
    fadeTimer = setTimeout(() => {
      fading.value = true
    }, 1000)
    dismissTimer = setTimeout(() => {
      showing.value = false
      fading.value = false
      animating.value = false
      emit('dismiss')
    }, 3000)
  } else {
    clearTimeout(dismissTimer)
    clearTimeout(fadeTimer)
    showing.value = false
    fading.value = false
    animating.value = false
  }
})

onUnmounted(() => {
  clearTimeout(dismissTimer)
  clearTimeout(fadeTimer)
})
</script>

<template>
  <div
    v-if="showing"
    class="stop-reason"
    :class="{
      'stop-reason--animate': animating,
      'stop-reason--fading': fading,
    }"
  >
    {{ reason }}
  </div>
</template>

<style scoped>
.stop-reason {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%) scale(0.8);
  z-index: var(--z-modal);
  background: var(--color-warning);
  color: var(--color-text);
  padding: 10px 28px;
  border-radius: 24px;
  font-size: var(--font-body);
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 2s ease;
}

.stop-reason--animate {
  animation: punch-in 0.3s ease forwards;
  opacity: 1;
}

.stop-reason--fading {
  opacity: 0;
}

@keyframes punch-in {
  0% {
    transform: translateX(-50%) scale(0.8);
  }
  60% {
    transform: translateX(-50%) scale(1.1);
  }
  100% {
    transform: translateX(-50%) scale(1);
  }
}
</style>
