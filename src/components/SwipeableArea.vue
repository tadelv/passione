<script setup>
/**
 * SwipeableArea — detects horizontal swipe gestures with velocity threshold.
 * Emits 'swipe-left' and 'swipe-right' events.
 */
const emit = defineEmits(['swipe-left', 'swipe-right'])

const MIN_DISTANCE = 50  // px
const MAX_TIME = 500     // ms
const MIN_VELOCITY = 0.3 // px/ms

let startX = 0
let startY = 0
let startTime = 0

function onTouchStart(e) {
  const touch = e.touches[0]
  startX = touch.clientX
  startY = touch.clientY
  startTime = Date.now()
}

function onTouchEnd(e) {
  const touch = e.changedTouches[0]
  const dx = touch.clientX - startX
  const dy = touch.clientY - startY
  const dt = Date.now() - startTime

  // Ignore vertical swipes
  if (Math.abs(dy) > Math.abs(dx)) return
  // Check minimum distance and max time
  if (Math.abs(dx) < MIN_DISTANCE || dt > MAX_TIME) return
  // Check velocity
  const velocity = Math.abs(dx) / dt
  if (velocity < MIN_VELOCITY) return

  if (dx < 0) {
    emit('swipe-left')
  } else {
    emit('swipe-right')
  }
}
</script>

<template>
  <div
    class="swipeable-area"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <slot />
  </div>
</template>

<style scoped>
.swipeable-area {
  touch-action: pan-y;
}
</style>
