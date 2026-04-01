<script setup>
import { ref, computed, inject, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import ShotGraph from '../components/ShotGraph.vue'
import BrewDialog from '../components/BrewDialog.vue'
import { setMachineState, tareScale, getLatestShot } from '../api/rest.js'

const router = useRouter()

// Injected from App.vue (populated by real composables)
const pressure = inject('pressure', ref(0))
const flow = inject('flow', ref(0))
const temperature = inject('temperature', ref(0))
const weight = inject('weight', ref(0))
const targetWeight = inject('targetWeight', ref(36))
const shotTime = inject('shotTime', ref(0))
const machineState = inject('machineState', ref('idle'))
const substate = inject('substate', ref(''))
const profileFrame = inject('profileFrame', ref(0))
const machine = inject('machine', null)
const workflow = inject('workflow', null)
const updateWorkflow = inject('updateWorkflow')
const settings = inject('settings', null)
const toast = inject('toast', null)
const scale = inject('scale', null)

// Shot data for the chart (provided by App.vue from useShotData)
const shotData = inject('shotData', null)

// Volume mode composable (provided by App.vue)
const volumeMode = inject('volumeMode', null)

// P1-6: Brew Dialog integration
const showBrewDialog = ref(settings?.settings?.showBrewDialog ?? false)
const brewDialogVisible = ref(false)

// Show brew dialog when navigated to espresso page if enabled and not already in espresso
onMounted(() => {
  if (showBrewDialog.value && machineState.value !== 'espresso') {
    brewDialogVisible.value = true
  }
})

// Brew dialog props derived from workflow
const brewProfileName = computed(() => workflow?.profile?.title ?? '')
const brewTemperature = computed(() => {
  // Get target temperature from profile or shot settings
  const targetTemp = machine?.targetMixTemperature?.value ?? machine?.targetGroupTemperature?.value ?? 93
  return targetTemp
})
const brewDoseIn = computed(() => workflow?.context?.targetDoseWeight ?? 18)
const brewDoseOut = computed(() => workflow?.context?.targetYield ?? 36)
const brewGrinderName = computed(() => workflow?.context?.grinderModel ?? '')
const brewGrindSetting = computed(() => {
  const s = workflow?.context?.grinderSetting
  return s != null ? Number(s) || 0 : 0
})
const scaleWeight = computed(() => scale?.weight?.value ?? weight.value ?? 0)

async function onBrewDialogStart(params) {
  brewDialogVisible.value = false
  try {
    // Apply settings to workflow before starting
    const workflowUpdate = {
      context: {
        ...workflow?.context,
        targetDoseWeight: params.doseIn,
        targetYield: params.doseOut,
      },
    }
    await updateWorkflow(workflowUpdate)
    await setMachineState('espresso')
  } catch (e) {
    if (toast) toast.error('Failed to start espresso: ' + (e.message || 'Unknown error'))
  }
}

async function onBrewDialogUpdateTemperature(temp) {
  try {
    // Update the profile temperature via workflow
    if (workflow?.profile) {
      const profile = { ...workflow.profile }
      // Update the target temperature in profile frames
      const frameKey = profile.frames ? 'frames' : profile.steps ? 'steps' : null
      if (frameKey && profile[frameKey].length > 0) {
        profile[frameKey] = profile[frameKey].map(f => ({
          ...f,
          temperature: temp,
        }))
      }
      await updateWorkflow({ profile })
      if (toast) toast.success('Profile temperature updated')
    }
  } catch (e) {
    if (toast) toast.error('Failed to update temperature: ' + (e.message || 'Unknown error'))
  }
}

async function onBrewDialogUpdateYield(yieldVal) {
  try {
    await updateWorkflow({
      context: {
        ...workflow?.context,
        targetYield: yieldVal,
      },
    })
    if (toast) toast.success('Yield updated')
  } catch (e) {
    if (toast) toast.error('Failed to update yield: ' + (e.message || 'Unknown error'))
  }
}

async function onBrewDialogTareScale() {
  try {
    await tareScale()
  } catch (e) {
    if (toast) toast.error('Failed to tare scale: ' + (e.message || 'Unknown error'))
  }
}

function onBrewDialogCancel() {
  brewDialogVisible.value = false
  router.push('/')
}

async function onBrewDialogUseLastShot() {
  try {
    const lastShot = await getLatestShot()
    if (lastShot) {
      // Extract relevant parameters from last shot and populate workflow context
      const contextUpdate = {}
      if (lastShot.doseIn != null || lastShot.dose != null) {
        contextUpdate.targetDoseWeight = lastShot.doseIn ?? lastShot.dose
      }
      if (lastShot.doseOut != null || lastShot.targetWeight != null) {
        contextUpdate.targetYield = lastShot.doseOut ?? lastShot.targetWeight
      }
      if (Object.keys(contextUpdate).length > 0) {
        await updateWorkflow({
          context: { ...workflow?.context, ...contextUpdate },
        })
      }
      if (toast) toast.info('Loaded settings from last shot')
    } else {
      if (toast) toast.warning('No previous shot found')
    }
  } catch (e) {
    if (toast) toast.error('Failed to load last shot: ' + (e.message || 'Unknown error'))
  }
}

function onBrewDialogUpdateGrinder(grinder) {
  try {
    updateWorkflow({
      context: {
        ...workflow?.context,
        grinderModel: grinder.name,
        grinderSetting: String(grinder.setting),
      },
    })
  } catch (e) {
    if (toast) toast.error('Failed to update grinder: ' + (e.message || 'Unknown error'))
  }
}

// P1-7: Track frame transitions for phase markers on the chart
const frameMarkers = ref([])
let lastFrame = -1

watch(profileFrame, (newFrame) => {
  if (newFrame !== lastFrame && shotData?.isRecording?.value) {
    const elapsed = shotData.elapsed()
    if (elapsed > 0 && newFrame >= 0) {
      // Determine pump mode from which target value is non-zero
      // targetFlow > 0 means flow mode, otherwise pressure mode
      const targetF = machine?.targetFlow?.value ?? 0
      const pump = targetF > 0 ? 'flow' : 'pressure'
      // Label shows transition reason: [T]=time default
      // (the exact exit reason is not available in the snapshot)
      const label = newFrame > 0 ? '[T]' : ''
      frameMarkers.value = [
        ...frameMarkers.value,
        { time: elapsed, label, pump }
      ]
    }
    lastFrame = newFrame
  }
})

// Reset markers when recording starts
watch(() => shotData?.isRecording?.value, (recording) => {
  if (recording) {
    frameMarkers.value = []
    lastFrame = -1
  }
})

const isPreheating = computed(() =>
  substate.value === 'preparingForShot' || substate.value === 'preheating'
)

const weightProgress = computed(() => {
  if (volumeMode) return volumeMode.progress.value
  const tw = typeof targetWeight.value === 'number' ? targetWeight.value : targetWeight.value?.value ?? 36
  return tw > 0 ? Math.min(1, (weight.value ?? 0) / tw) : 0
})

const displayTargetWeight = computed(() => {
  if (volumeMode) return volumeMode.displayTarget.value
  const tw = targetWeight.value
  return typeof tw === 'number' ? tw : tw?.value ?? 36
})

const displayOutputValue = computed(() => {
  if (volumeMode) return volumeMode.displayValue.value
  return weight.value ?? 0
})

const displayOutputSuffix = computed(() => {
  if (volumeMode) return volumeMode.displaySuffix.value
  return 'g'
})

const brewRatioText = computed(() => {
  if (!volumeMode) return ''
  const ratio = volumeMode.brewByRatio.value
  return ratio > 0 ? `1:${ratio.toFixed(1)}` : ''
})

const displayShotTime = computed(() => {
  const t = shotTime.value ?? 0
  const mins = Math.floor(t / 60)
  const secs = t % 60
  return mins > 0
    ? `${mins}:${secs.toFixed(1).padStart(4, '0')}`
    : `${secs.toFixed(1)}s`
})

async function skipStep() {
  try {
    await machine?.skipStep()
  } catch {
    toast?.error('Failed to skip step')
  }
}

async function stopAndGoBack() {
  try {
    await setMachineState('idle')
  } catch {
    // Navigation will happen via auto-nav watcher in App.vue
  }
  router.push('/')
}
</script>

<template>
  <div class="espresso-page">
    <!-- P1-6: Brew Dialog -->
    <BrewDialog
      :visible="brewDialogVisible"
      :profile-name="brewProfileName"
      :temperature="brewTemperature"
      :dose-in="brewDoseIn"
      :dose-out="brewDoseOut"
      :scale-weight="scaleWeight"
      :grinder-name="brewGrinderName"
      :grind-setting="brewGrindSetting"
      :show-extended-fields="!!workflow?.context?.grinderModel"
      @start="onBrewDialogStart"
      @cancel="onBrewDialogCancel"
      @update-temperature="onBrewDialogUpdateTemperature"
      @update-yield="onBrewDialogUpdateYield"
      @tare-scale="onBrewDialogTareScale"
      @update-grinder="onBrewDialogUpdateGrinder"
      @use-last-shot="onBrewDialogUseLastShot"
    />

    <!-- Preheating banner -->
    <div v-if="isPreheating" class="espresso-page__preheat">
      PREHEATING...
    </div>

    <!-- Shot graph -->
    <div class="espresso-page__chart">
      <ShotGraph
        v-if="shotData"
        :data="shotData.data.value"
        :frame-markers="frameMarkers"
        :show-legend="true"
      />
      <div v-else class="espresso-page__chart-placeholder">
        <span>Shot Graph</span>
      </div>
    </div>

    <!-- Bottom info bar -->
    <div class="espresso-page__info-bar">
      <!-- Back / Stop button -->
      <button class="espresso-page__back" @click="stopAndGoBack" aria-label="Stop and go back">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <!-- Skip step button -->
      <button class="espresso-page__skip" @click="skipStep" aria-label="Skip to next step">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,4 15,12 5,20" />
          <rect x="16" y="4" width="3" height="16" />
        </svg>
      </button>

      <!-- Timer -->
      <div class="espresso-page__metric" aria-live="polite" aria-atomic="true">
        <span class="espresso-page__metric-value espresso-page__metric-value--timer">
          {{ displayShotTime }}
        </span>
        <span class="espresso-page__metric-label">Time</span>
      </div>

      <div class="espresso-page__divider" />

      <!-- Pressure -->
      <div class="espresso-page__metric">
        <span class="espresso-page__metric-value" style="color: var(--color-pressure)">
          {{ pressure.toFixed(1) }}
        </span>
        <span class="espresso-page__metric-label">bar</span>
      </div>

      <!-- Flow -->
      <div class="espresso-page__metric">
        <span class="espresso-page__metric-value" style="color: var(--color-flow)">
          {{ flow.toFixed(1) }}
        </span>
        <span class="espresso-page__metric-label">mL/s</span>
      </div>

      <!-- Temperature -->
      <div class="espresso-page__metric">
        <span class="espresso-page__metric-value" style="color: var(--color-temperature)">
          {{ temperature.toFixed(1) }}
        </span>
        <span class="espresso-page__metric-label">&deg;C</span>
      </div>

      <div class="espresso-page__divider" />

      <!-- Weight / Volume with progress -->
      <div class="espresso-page__weight">
        <div class="espresso-page__weight-row">
          <span class="espresso-page__metric-value" style="color: var(--color-weight)">
            {{ displayOutputValue.toFixed(1) }}
          </span>
          <span class="espresso-page__weight-target">
            / {{ displayTargetWeight.toFixed(0) }} {{ displayOutputSuffix }}
          </span>
        </div>
        <div v-if="brewRatioText" class="espresso-page__brew-ratio">
          {{ brewRatioText }}
        </div>
        <div class="espresso-page__progress">
          <div
            class="espresso-page__progress-fill"
            :style="{ transform: 'scaleX(' + weightProgress + ')' }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.espresso-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.espresso-page__preheat {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 8px 32px;
  font-size: var(--font-title);
  color: var(--color-text-secondary);
  z-index: 5;
}

.espresso-page__chart {
  flex: 1;
  padding: 44px 0 0 0;
  min-height: 0;
}

.espresso-page__chart-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: var(--font-title);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-card);
  margin: var(--spacing-medium);
}

.espresso-page__info-bar {
  display: flex;
  align-items: center;
  height: 72px;
  padding: 0 var(--spacing-medium);
  gap: var(--spacing-medium);
  background: color-mix(in srgb, var(--color-surface), black 20%);
  flex-shrink: 0;
}

.espresso-page__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 100%;
  border: none;
  background: transparent;
  color: white;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.espresso-page__back:active {
  opacity: 0.7;
}

.espresso-page__skip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.espresso-page__skip:active {
  opacity: 0.7;
  background: var(--color-surface);
}

.espresso-page__metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 60px;
}

.espresso-page__metric-value {
  font-size: 24px;
  font-weight: 500;
  color: var(--color-text);
}

.espresso-page__metric-value--timer {
  font-size: 30px;
  font-weight: bold;
}

.espresso-page__metric-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

.espresso-page__divider {
  width: 1px;
  align-self: stretch;
  margin: 10px 0;
  background: var(--color-text-secondary);
  opacity: 0.3;
}

.espresso-page__weight {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.espresso-page__weight-row {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-small);
}

.espresso-page__weight-target {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
}

.espresso-page__brew-ratio {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
}

.espresso-page__progress {
  height: 4px;
  background: var(--color-surface);
  border-radius: 2px;
  overflow: hidden;
  max-width: 120px;
}

.espresso-page__progress-fill {
  height: 100%;
  background: var(--color-weight);
  border-radius: 4px;
  width: 100%;
  transform-origin: left;
  transition: transform 0.1s linear;
}
</style>
