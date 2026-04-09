<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  measurements: { type: Array, default: () => [] },
  initialExpanded: { type: Boolean, default: false },
})

const expanded = ref(props.initialExpanded)

function getElapsed(m) {
  if (m.elapsed != null) return m.elapsed
  const ts = m.machine?.timestamp ?? m.timestamp ?? m.scale?.timestamp
  if (ts == null) return 0
  return typeof ts === 'number' && ts > 1e12 ? ts / 1000 : new Date(ts).getTime() / 1000
}

// Compute per-phase summaries from measurements array
const phases = computed(() => {
  const ms = props.measurements
  if (!ms || ms.length < 2) return []

  const result = []
  let currentPhase = null
  let phaseStart = 0
  let pressureSum = 0
  let flowSum = 0
  let count = 0
  let startWeight = 0
  let isFlowMode = false

  const baseTime = getElapsed(ms[0])

  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    const state = m.machine?.state?.state ?? m.state?.state ?? ''
    const substate = m.machine?.state?.substate ?? m.state?.substate ?? ''

    let phaseName = null
    if (state === 'espresso') {
      if (substate === 'preparingForShot' || substate === 'preheating') phaseName = 'Preheat'
      else if (substate === 'preinfusion') phaseName = 'Pre-infusion'
      else if (substate === 'pouring') phaseName = 'Pouring'
      else if (substate === 'pouringDone') phaseName = 'Ending'
      else phaseName = substate || 'Unknown'
    }

    if (!phaseName) continue

    const elapsed = getElapsed(m) - baseTime
    const pressure = m.machine?.pressure ?? m.pressure ?? 0
    const flow = m.machine?.flow ?? m.flow ?? 0
    const weight = m.scale?.weight ?? m.weight ?? 0
    const targetFlow = m.machine?.targetFlow ?? m.targetFlow ?? 0

    if (phaseName !== currentPhase) {
      // Flush previous phase
      if (currentPhase && count > 0) {
        result.push({
          name: currentPhase,
          duration: elapsed - phaseStart,
          avgPressure: pressureSum / count,
          avgFlow: flowSum / count,
          weightGained: weight - startWeight,
          isFlowMode,
        })
      }
      // Start new phase
      currentPhase = phaseName
      phaseStart = elapsed
      pressureSum = 0
      flowSum = 0
      count = 0
      startWeight = weight
      isFlowMode = targetFlow > 0
    }

    pressureSum += pressure
    flowSum += flow
    count++
  }

  // Flush last phase
  if (currentPhase && count > 0) {
    const lastM = ms[ms.length - 1]
    const lastElapsed = getElapsed(lastM) - baseTime
    const lastWeight = lastM.scale?.weight ?? lastM.weight ?? 0
    result.push({
      name: currentPhase,
      duration: lastElapsed - phaseStart,
      avgPressure: pressureSum / count,
      avgFlow: flowSum / count,
      weightGained: lastWeight - startWeight,
      isFlowMode,
    })
  }

  return result
})

const hasData = computed(() => phases.value.length > 0)
</script>

<template>
  <div v-if="hasData" class="phase-summary">
    <button
      class="phase-summary__header"
      :aria-expanded="expanded"
      aria-controls="phase-summary-table"
      @click="expanded = !expanded"
    >
      <span class="phase-summary__title">Phase Summary</span>
      <svg
        class="phase-summary__chevron"
        :class="{ 'phase-summary__chevron--expanded': expanded }"
        width="12" height="12" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div v-if="expanded" id="phase-summary-table" class="phase-summary__table">
      <!-- Header row -->
      <div class="phase-summary__row phase-summary__row--header">
        <span class="phase-summary__cell phase-summary__cell--name">Phase</span>
        <span class="phase-summary__cell">Duration</span>
        <span class="phase-summary__cell">Avg Press</span>
        <span class="phase-summary__cell">Avg Flow</span>
        <span class="phase-summary__cell">Weight</span>
      </div>

      <!-- Data rows -->
      <div
        v-for="(p, i) in phases"
        :key="i"
        class="phase-summary__row"
        :aria-label="`${p.name}: ${p.duration.toFixed(1)} seconds, ${p.avgPressure.toFixed(1)} bar, ${p.avgFlow.toFixed(1)} mL/s, ${p.weightGained.toFixed(1)} grams`"
      >
        <span class="phase-summary__cell phase-summary__cell--name">
          <span
            class="phase-summary__dot"
            :style="{ background: p.isFlowMode ? 'var(--color-flow)' : 'var(--color-pressure)' }"
          />
          {{ p.name }}
        </span>
        <span class="phase-summary__cell">{{ p.duration.toFixed(1) }}s</span>
        <span class="phase-summary__cell">{{ p.avgPressure.toFixed(1) }}</span>
        <span class="phase-summary__cell">{{ p.avgFlow.toFixed(1) }}</span>
        <span class="phase-summary__cell">{{ p.weightGained.toFixed(1) }}g</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.phase-summary {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.phase-summary__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.phase-summary__title {
  font-size: var(--font-md);
  font-weight: 600;
}

.phase-summary__chevron {
  transition: transform 0.2s ease;
  color: var(--color-text-secondary);
}

.phase-summary__chevron--expanded {
  transform: rotate(180deg);
}

.phase-summary__table {
  padding: 0 12px 10px;
}

.phase-summary__row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
  gap: 4px;
  padding: 4px 0;
  border-bottom: 1px solid var(--color-border);
}

.phase-summary__row:last-child {
  border-bottom: none;
}

.phase-summary__row--header {
  border-bottom: 1px solid var(--color-text-secondary);
}

.phase-summary__row--header .phase-summary__cell {
  font-weight: 700;
  color: var(--color-text-secondary);
}

.phase-summary__cell {
  font-size: var(--font-caption);
  color: var(--color-text);
  text-align: right;
  white-space: nowrap;
}

.phase-summary__cell--name {
  text-align: left;
  display: flex;
  align-items: center;
  gap: 4px;
}

.phase-summary__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
