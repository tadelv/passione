<script setup>
import { ref, computed, inject, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import { setMachineState } from '../api/rest.js'

const router = useRouter()
const machineState = inject('machineState')

// Phases: 'preparation' | 'inProgress' | 'rinse'
const phase = ref('preparation')

// ---- Phase 1: Preparation ----
const PREP_STEPS = [
  'Remove portafilter and water tank',
  'Prepare descaling solution (1:10 ratio with water)',
  'Fill water tank with descaling solution',
  'Place a container under the group head',
  'Ensure machine is warmed up and idle',
]

const checkedSteps = ref(new Set())

const allChecked = computed(() => checkedSteps.value.size === PREP_STEPS.length)

function toggleStep(index) {
  const next = new Set(checkedSteps.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  checkedSteps.value = next
}

async function beginDescaling() {
  try {
    await setMachineState('descaling')
    phase.value = 'inProgress'
    startTimer()
  } catch {
    // Machine may not support descaling state -- still transition UI
    phase.value = 'inProgress'
    startTimer()
  }
}

// ---- Phase 2: In Progress ----
const elapsedSeconds = ref(0)
let timerInterval = null

function startTimer() {
  elapsedSeconds.value = 0
  timerInterval = setInterval(() => {
    elapsedSeconds.value++
  }, 1000)
}

function stopTimer() {
  clearInterval(timerInterval)
  timerInterval = null
}

const elapsedFormatted = computed(() => {
  const m = Math.floor(elapsedSeconds.value / 60)
  const s = elapsedSeconds.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

async function emergencyStop() {
  try {
    await setMachineState('idle')
  } catch {
    // ignore
  }
}

// Watch for machine returning to idle during descaling -> move to rinse
watch(machineState, (newState) => {
  if (phase.value === 'inProgress' && (newState === 'idle' || newState === 'ready')) {
    stopTimer()
    phase.value = 'rinse'
  }
})

// ---- Phase 3: Rinse ----
const RINSE_STEPS = [
  'Empty the water tank and rinse thoroughly',
  'Fill with fresh water and run a flush cycle',
  'Repeat flush 2-3 times until water runs clear',
]

const rinseChecked = ref(new Set())

function toggleRinse(index) {
  const next = new Set(rinseChecked.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  rinseChecked.value = next
}

function finishDescaling() {
  router.push('/')
}

function goBack() {
  if (phase.value === 'inProgress') return // Don't allow back during descaling
  router.push('/')
}

onUnmounted(stopTimer)
</script>

<template>
  <div class="descaling-page">
    <div class="descaling-page__content">
      <!-- PHASE 1: Preparation -->
      <div v-if="phase === 'preparation'" class="descaling-page__phase">
        <h2 class="descaling-page__heading">Prepare for Descaling</h2>
        <p class="descaling-page__subtext">
          Follow these steps before starting the descaling cycle.
        </p>

        <div class="descaling-page__checklist">
          <button
            v-for="(step, i) in PREP_STEPS"
            :key="i"
            class="descaling-page__check-item"
            @click="toggleStep(i)"
          >
            <span
              class="descaling-page__checkbox"
              :class="{ checked: checkedSteps.has(i) }"
            >
              <svg v-if="checkedSteps.has(i)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span
              class="descaling-page__check-text"
              :class="{ 'descaling-page__check-text--done': checkedSteps.has(i) }"
            >
              {{ step }}
            </span>
          </button>
        </div>

        <div class="descaling-page__recipe">
          <span class="descaling-page__recipe-title">Recommended Solution</span>
          <span class="descaling-page__recipe-text">
            Citric acid: 20g per 1L water, or use manufacturer's descaling solution.
            Total volume: fill tank to max line.
          </span>
        </div>

        <button
          class="descaling-page__begin-btn"
          :disabled="!allChecked"
          @click="beginDescaling"
        >
          Begin Descaling
        </button>
      </div>

      <!-- PHASE 2: In Progress -->
      <div v-else-if="phase === 'inProgress'" class="descaling-page__phase">
        <h2 class="descaling-page__heading">Descaling in Progress</h2>

        <div class="descaling-page__progress-section">
          <!-- Indeterminate progress bar -->
          <div class="descaling-page__progress-bar">
            <div class="descaling-page__progress-fill descaling-page__progress-fill--indeterminate" />
          </div>

          <span class="descaling-page__timer">{{ elapsedFormatted }}</span>
        </div>

        <div class="descaling-page__warning">
          <span class="descaling-page__warning-icon">&#9888;</span>
          <div class="descaling-page__warning-text">
            <strong>Do not interrupt the descaling process.</strong>
            <span>The machine is pumping descaling solution through the system. This may take several minutes.</span>
          </div>
        </div>

        <button
          class="descaling-page__stop-btn"
          @click="emergencyStop"
        >
          Emergency Stop
        </button>
      </div>

      <!-- PHASE 3: Rinse -->
      <div v-else-if="phase === 'rinse'" class="descaling-page__phase">
        <h2 class="descaling-page__heading">Rinse Cycle</h2>
        <p class="descaling-page__subtext">
          Descaling complete. Rinse the machine to remove residual solution.
        </p>

        <div class="descaling-page__elapsed-summary">
          Descaling took {{ elapsedFormatted }}
        </div>

        <div class="descaling-page__checklist">
          <button
            v-for="(step, i) in RINSE_STEPS"
            :key="i"
            class="descaling-page__check-item"
            @click="toggleRinse(i)"
          >
            <span
              class="descaling-page__checkbox"
              :class="{ checked: rinseChecked.has(i) }"
            >
              <svg v-if="rinseChecked.has(i)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span
              class="descaling-page__check-text"
              :class="{ 'descaling-page__check-text--done': rinseChecked.has(i) }"
            >
              {{ step }}
            </span>
          </button>
        </div>

        <button
          class="descaling-page__done-btn"
          @click="finishDescaling"
        >
          Done
        </button>
      </div>
    </div>

    <BottomBar
      title="Descaling"
      :show-back-button="phase !== 'inProgress'"
      @back="goBack"
    />
  </div>
</template>

<style scoped>
.descaling-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.descaling-page__content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: var(--margin-standard);
}

.descaling-page__phase {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.descaling-page__heading {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  margin: 0;
}

.descaling-page__subtext {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
  margin: 0;
}

/* Checklist */
.descaling-page__checklist {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.descaling-page__check-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-surface);
  border-radius: 10px;
  border: none;
  color: var(--color-text);
  font-size: var(--font-body);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.descaling-page__check-item:active {
  opacity: 0.8;
}

.descaling-page__checkbox {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 2px solid var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.descaling-page__checkbox.checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text);
}

.descaling-page__check-text {
  flex: 1;
}

.descaling-page__check-text--done {
  color: var(--color-text-secondary);
  text-decoration: line-through;
}

/* Recipe card */
.descaling-page__recipe {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.descaling-page__recipe-title {
  font-size: var(--font-label);
  font-weight: 700;
  color: var(--color-text);
}

.descaling-page__recipe-text {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

/* Begin button */
.descaling-page__begin-btn {
  align-self: center;
  min-width: 200px;
  height: 52px;
  border-radius: 12px;
  border: none;
  background: var(--color-warning);
  color: var(--color-text);
  font-size: var(--font-body);
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.descaling-page__begin-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.descaling-page__begin-btn:active:not(:disabled) {
  filter: brightness(0.85);
}

/* In-progress */
.descaling-page__progress-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 0;
}

.descaling-page__progress-bar {
  width: 100%;
  max-width: 400px;
  height: 8px;
  border-radius: 4px;
  background: var(--color-surface);
  overflow: hidden;
}

.descaling-page__progress-fill--indeterminate {
  width: 30%;
  height: 100%;
  border-radius: 4px;
  background: var(--color-warning);
  animation: indeterminate-slide 1.5s ease-in-out infinite;
}

@keyframes indeterminate-slide {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(233%); }
  100% { transform: translateX(-100%); }
}

.descaling-page__timer {
  font-size: var(--font-timer);
  font-weight: bold;
  color: var(--color-text);
}

/* Warning */
.descaling-page__warning {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-card);
}

.descaling-page__warning-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.descaling-page__warning-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-body);
  color: var(--color-text);
}

.descaling-page__warning-text span {
  color: var(--color-text-secondary);
}

/* Emergency stop */
.descaling-page__stop-btn {
  align-self: center;
  min-width: 200px;
  height: 52px;
  border-radius: 12px;
  border: 2px solid var(--color-error);
  background: transparent;
  color: var(--color-error);
  font-size: var(--font-body);
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.descaling-page__stop-btn:active {
  background: var(--color-error);
  color: var(--color-text);
}

/* Rinse phase */
.descaling-page__elapsed-summary {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
  text-align: center;
  padding: 8px 0;
}

.descaling-page__done-btn {
  align-self: center;
  min-width: 200px;
  height: 52px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-body);
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.descaling-page__done-btn:active {
  filter: brightness(0.85);
}
</style>
