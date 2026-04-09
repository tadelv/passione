<script setup>
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import { setMachineState, getLatestShot, getShot } from '../api/rest.js'
import ShotSilhouette from '../components/ShotSilhouette.vue'
import { normalizeShot } from '../composables/useShotNormalize'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
const display = inject('display', null)

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

// Last Shot data
const lastShotData = ref(null)
const lastShotInfo = computed(() => {
  const raw = lastShotData.value
  if (!raw) return null
  const s = normalizeShot(raw)

  const profile = s.profileName
  const coffee = [s.coffeeRoaster, s.coffeeName].filter(Boolean).join(' — ') || null
  const doseIn = s.doseIn ? Number(s.doseIn).toFixed(1) : null
  const doseOut = s.doseOut ? Number(s.doseOut).toFixed(1) : null
  const ratio = (s.doseIn && s.doseOut) ? (s.doseOut / s.doseIn).toFixed(1) : null
  const duration = s.duration ? Number(s.duration).toFixed(1) : null

  return { profile, coffee, doseIn, doseOut, ratio, duration }
})

async function fetchLastShot() {
  try {
    const summary = await getLatestShot()
    if (summary?.id) {
      lastShotData.value = await getShot(summary.id)
    }
  } catch {
    lastShotData.value = null
  }
}

onMounted(() => {
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
  display?.dim()
  if (ssType.value === 'lastShot') {
    fetchLastShot()
  }
})

onUnmounted(() => {
  clearInterval(clockTimer)
  display?.restore()
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

    <!-- Last Shot Recap Mode -->
    <div v-else-if="ssType === 'lastShot'" class="screensaver__last-shot">
      <template v-if="lastShotInfo">
        <div class="screensaver__shot-graph">
          <ShotSilhouette :shot="lastShotData" />
        </div>
        <div class="screensaver__shot-stats">
          <span v-if="lastShotInfo.duration" class="screensaver__shot-time">{{ lastShotInfo.duration }}s</span>
          <span v-if="lastShotInfo.doseIn && lastShotInfo.doseOut" class="screensaver__shot-dose">
            {{ lastShotInfo.doseIn }}g &rarr; {{ lastShotInfo.doseOut }}g
          </span>
          <span v-if="lastShotInfo.ratio" class="screensaver__shot-ratio">1:{{ lastShotInfo.ratio }}</span>
        </div>
        <div v-if="lastShotInfo.profile" class="screensaver__shot-profile">{{ lastShotInfo.profile }}</div>
        <div v-if="lastShotInfo.coffee" class="screensaver__shot-coffee">{{ lastShotInfo.coffee }}</div>
      </template>
      <div v-else class="screensaver__shot-empty">No shots yet</div>
      <span class="screensaver__shot-clock">{{ hours }}:{{ minutes }}</span>
    </div>

    <!-- Ambient Glow Mode -->
    <div v-else-if="ssType === 'ambientGlow'" class="screensaver__glow">
      <div class="screensaver__blob screensaver__blob--green" />
      <div class="screensaver__blob screensaver__blob--blue" />
      <div class="screensaver__blob screensaver__blob--red" />
      <div class="screensaver__blob screensaver__blob--brown" />
      <div class="screensaver__blob screensaver__blob--green2" />
      <div class="screensaver__particle screensaver__particle--1" />
      <div class="screensaver__particle screensaver__particle--2" />
      <div class="screensaver__particle screensaver__particle--3" />
      <div class="screensaver__particle screensaver__particle--4" />
      <div class="screensaver__particle screensaver__particle--5" />
      <div class="screensaver__particle screensaver__particle--6" />
      <span class="screensaver__glow-clock">{{ hours }}:{{ minutes }}</span>
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
  z-index: var(--z-overlay);
  background: var(--color-screensaver-bg);
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
  font-size: var(--font-timer);
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
  background: var(--color-screensaver-card);
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
  font-size: var(--font-timer);
  font-weight: 700;
  color: var(--color-text);
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

/* Last Shot Recap */
.screensaver__last-shot {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 0 24px 60px;
  opacity: 0;
  animation: fadeIn 2s ease forwards;
}

@keyframes fadeIn {
  to { opacity: 1; }
}

.screensaver__shot-graph {
  position: absolute;
  inset: 0;
  opacity: 0.4;
  z-index: var(--z-base);
  pointer-events: none;
}

.screensaver__shot-stats {
  display: flex;
  align-items: baseline;
  gap: 24px;
  z-index: var(--z-base);
}

.screensaver__shot-time {
  font-size: var(--font-value);
  font-weight: 300;
  color: rgba(255, 255, 255, 0.9);
}

.screensaver__shot-dose {
  font-size: var(--font-title);
  color: #a2693d;
  opacity: 0.8;
}

.screensaver__shot-ratio {
  font-size: var(--font-title);
  color: rgba(255, 255, 255, 0.3);
}

.screensaver__shot-profile {
  font-size: var(--font-body);
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 1px;
  z-index: var(--z-base);
}

.screensaver__shot-coffee {
  font-size: var(--font-md);
  color: rgba(255, 255, 255, 0.2);
  letter-spacing: 0.5px;
  z-index: var(--z-base);
}

.screensaver__shot-empty {
  font-size: var(--font-body);
  color: rgba(255, 255, 255, 0.2);
  z-index: var(--z-base);
}

.screensaver__shot-clock {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--font-timer);
  font-weight: 200;
  color: rgba(255, 255, 255, 0.15);
  font-variant-numeric: tabular-nums;
  letter-spacing: 4px;
  z-index: var(--z-chart);
}

/* Ambient Glow */
.screensaver__glow {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.screensaver__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  will-change: transform;
}

.screensaver__blob--green {
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(24, 195, 126, 0.45), transparent 70%);
  top: 15%;
  left: 10%;
  animation: drift1 45s ease-in-out infinite;
}

.screensaver__blob--blue {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(78, 133, 244, 0.35), transparent 70%);
  top: 40%;
  left: 55%;
  animation: drift2 55s ease-in-out infinite;
}

.screensaver__blob--red {
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(233, 69, 96, 0.4), transparent 70%);
  top: 60%;
  left: 25%;
  animation: drift3 50s ease-in-out infinite;
}

.screensaver__blob--brown {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(162, 105, 61, 0.4), transparent 70%);
  top: 20%;
  left: 65%;
  animation: drift4 40s ease-in-out infinite;
}

.screensaver__blob--green2 {
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(24, 195, 126, 0.3), transparent 70%);
  top: 70%;
  left: 70%;
  animation: drift1 60s ease-in-out infinite reverse;
}

@keyframes drift1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(60px, -40px) scale(1.1); }
  50% { transform: translate(-30px, 50px) scale(0.95); }
  75% { transform: translate(40px, 20px) scale(1.05); }
}

@keyframes drift2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(-50px, 30px) scale(1.08); }
  50% { transform: translate(40px, -60px) scale(0.92); }
  75% { transform: translate(-20px, -30px) scale(1.04); }
}

@keyframes drift3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(70px, -20px) scale(1.12); }
  66% { transform: translate(-40px, 40px) scale(0.9); }
}

@keyframes drift4 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(-60px, 50px) scale(1.06); }
  66% { transform: translate(30px, -40px) scale(0.96); }
}

/* Particles */
.screensaver__particle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  will-change: transform;
}

.screensaver__particle--1 {
  width: 3px; height: 3px; top: 25%; left: 35%;
  animation: float1 30s linear infinite;
}
.screensaver__particle--2 {
  width: 2px; height: 2px; top: 55%; left: 70%;
  opacity: 0.3;
  animation: float2 25s linear infinite;
}
.screensaver__particle--3 {
  width: 4px; height: 4px; top: 40%; left: 15%;
  opacity: 0.15;
  animation: float1 35s linear infinite reverse;
}
.screensaver__particle--4 {
  width: 2px; height: 2px; top: 70%; left: 50%;
  opacity: 0.25;
  animation: float2 28s linear infinite reverse;
}
.screensaver__particle--5 {
  width: 3px; height: 3px; top: 15%; left: 80%;
  opacity: 0.2;
  animation: float1 32s linear infinite;
}
.screensaver__particle--6 {
  width: 2px; height: 2px; top: 80%; left: 30%;
  opacity: 0.18;
  animation: float2 22s linear infinite;
}

@keyframes float1 {
  0% { transform: translate(0, 0); }
  25% { transform: translate(40px, -60px); }
  50% { transform: translate(-20px, -30px); }
  75% { transform: translate(30px, 40px); }
  100% { transform: translate(0, 0); }
}

@keyframes float2 {
  0% { transform: translate(0, 0); }
  25% { transform: translate(-30px, 50px); }
  50% { transform: translate(50px, 20px); }
  75% { transform: translate(-40px, -30px); }
  100% { transform: translate(0, 0); }
}

.screensaver__glow-clock {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: var(--font-md);
  color: rgba(255, 255, 255, 0.1);
  font-variant-numeric: tabular-nums;
}

/* Black screen mode */
.screensaver__black {
  flex: 1;
}

/* Hint */
.screensaver__hint {
  position: absolute;
  bottom: 40px;
  font-size: var(--font-md);
  color: rgba(255, 255, 255, 0.15);
  letter-spacing: 1px;
}
</style>
