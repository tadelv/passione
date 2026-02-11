<script setup>
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import { setMachineState } from '../api/rest.js'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings

// Clock state
const hours = ref('00')
const minutes = ref('00')
const prevHours = ref('00')
const prevMinutes = ref('00')
const flipping = ref('')  // 'hours' | 'minutes' | ''
let clockTimer = null

const is24h = computed(() => settings?.flipClock24h ?? true)
const is3d = computed(() => settings?.flipClock3d ?? false)
const ssType = computed(() => settings?.screensaverType ?? 'flipClock')

function updateClock() {
  const now = new Date()
  let h = now.getHours()
  let m = now.getMinutes()

  if (!is24h.value) {
    h = h % 12 || 12
  }

  const newH = String(h).padStart(2, '0')
  const newM = String(m).padStart(2, '0')

  if (newM !== minutes.value) {
    prevMinutes.value = minutes.value
    minutes.value = newM
    flipping.value = 'minutes'
    setTimeout(() => {
      if (flipping.value === 'minutes') flipping.value = ''
    }, 600)
  }

  if (newH !== hours.value) {
    prevHours.value = hours.value
    hours.value = newH
    flipping.value = 'hours'
    setTimeout(() => {
      if (flipping.value === 'hours') flipping.value = ''
    }, 600)
  }
}

function wake() {
  setMachineState('idle').catch(() => {})
}

onMounted(() => {
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
})

onUnmounted(() => {
  clearInterval(clockTimer)
})
</script>

<template>
  <div class="screensaver" @click="wake" @touchstart.passive="wake">
    <!-- Flip Clock Mode -->
    <div v-if="ssType === 'flipClock'" class="screensaver__clock" :class="{ 'screensaver__clock--3d': is3d }">
      <div class="screensaver__flip-group">
        <div class="screensaver__flip-card" :class="{ 'screensaver__flip-card--flipping': flipping === 'hours' }">
          <div class="screensaver__card-face screensaver__card-face--front">
            <span class="screensaver__digit">{{ hours }}</span>
          </div>
          <div class="screensaver__card-face screensaver__card-face--back">
            <span class="screensaver__digit">{{ prevHours }}</span>
          </div>
        </div>
      </div>

      <span class="screensaver__colon">:</span>

      <div class="screensaver__flip-group">
        <div class="screensaver__flip-card" :class="{ 'screensaver__flip-card--flipping': flipping === 'minutes' }">
          <div class="screensaver__card-face screensaver__card-face--front">
            <span class="screensaver__digit">{{ minutes }}</span>
          </div>
          <div class="screensaver__card-face screensaver__card-face--back">
            <span class="screensaver__digit">{{ prevMinutes }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Black Screen Mode (disabled type or fallback) -->
    <div v-else class="screensaver__black" />

    <p class="screensaver__hint">Touch to wake</p>
  </div>
</template>

<style scoped>
.screensaver {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* Flip Clock */
.screensaver__clock {
  display: flex;
  align-items: center;
  gap: 16px;
}

.screensaver__clock--3d {
  perspective: 800px;
}

.screensaver__colon {
  font-size: 80px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1;
  padding-bottom: 8px;
}

.screensaver__flip-group {
  position: relative;
  width: 140px;
  height: 160px;
}

.screensaver__flip-card {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}

.screensaver__card-face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  border-radius: 12px;
  backface-visibility: hidden;
  overflow: hidden;
}

.screensaver__card-face::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: rgba(0, 0, 0, 0.4);
}

.screensaver__card-face--back {
  transform: rotateX(180deg);
}

.screensaver__digit {
  font-size: 96px;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
  letter-spacing: 4px;
}

/* Flip animation */
.screensaver__flip-card--flipping {
  animation: flipDown 0.6s ease-in-out;
}

@keyframes flipDown {
  0% {
    transform: rotateX(0);
  }
  50% {
    transform: rotateX(-90deg);
  }
  100% {
    transform: rotateX(0);
  }
}

/* Black screen mode */
.screensaver__black {
  flex: 1;
}

/* Hint */
.screensaver__hint {
  position: absolute;
  bottom: 40px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.15);
  letter-spacing: 1px;
}
</style>
