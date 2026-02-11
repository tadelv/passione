<script setup>
import { ref, watch, provide, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import StatusBar from './components/StatusBar.vue'
import CompletionOverlay from './components/CompletionOverlay.vue'
import StopReasonOverlay from './components/StopReasonOverlay.vue'
import { useMachine } from './composables/useMachine.js'
import { useScale } from './composables/useScale.js'
import { useWaterLevels } from './composables/useWaterLevels.js'
import { useShotSettings } from './composables/useShotSettings.js'
import { useWorkflow } from './composables/useWorkflow.js'
import { useShotData } from './composables/useShotData.js'
import { useSettings } from './composables/useSettings.js'
import { useTheme } from './composables/useTheme.js'
import { useAutoSleep } from './composables/useAutoSleep.js'
import { useVolumeMode } from './composables/useVolumeMode.js'
import { useOperationSettings } from './composables/useOperationSettings.js'
import { setMachineState } from './api/rest.js'

const router = useRouter()
const route = useRoute()

// Connect to all WebSocket streams
const machine = useMachine()
const scale = useScale()
const waterLevels = useWaterLevels()
const shotSettings = useShotSettings()
const { workflow } = useWorkflow()
const shotData = useShotData()

// Settings, theme, and cross-cutting composables
const settings = useSettings()
const theme = useTheme()
const volumeMode = useVolumeMode(machine, scale, workflow)
const operationSettings = useOperationSettings(settings, workflow)
const autoSleep = useAutoSleep(machine, settings)

// Provide reactive data for child components that use inject
provide('machineState', machine.state)
provide('machineConnected', machine.isConnected)
provide('scaleConnected', scale.isConnected)
provide('temperature', machine.mixTemperature)
provide('targetTemperature', machine.targetMixTemperature)
provide('pressure', machine.pressure)
provide('flow', machine.flow)
provide('weight', scale.weight)
provide('targetWeight', computed(() => workflow.doseData?.doseOut ?? 36))
provide('shotTime', machine.shotTime)
provide('substate', machine.substate)
provide('waterLevel', waterLevels.currentLevel)
provide('profileName', computed(() => workflow.profile?.title ?? ''))
provide('steamTemperature', machine.steamTemperature)
provide('targetSteamTemp', computed(() => shotSettings.targetSteamTemp.value ?? 160))
provide('profileFrame', machine.profileFrame)
provide('workflow', workflow)

// Provide composable instances for pages that need direct access
provide('machine', machine)
provide('scale', scale)
provide('shotData', shotData)
provide('settings', settings)
provide('theme', theme)
provide('volumeMode', volumeMode)
provide('autoSleep', autoSleep)

// Feed machine + scale snapshots into shot data buffer during espresso
watch(machine.snapshot, (snap) => {
  if (!snap) return
  if (machine.state.value === 'espresso' && shotData.isRecording.value) {
    shotData.addPoint(snap, { weight: scale.weight.value })
  }
})

// ---- P0-5: Completion Overlay ----
const completionVisible = ref(false)
const completionMessage = ref('')
const completionValue = ref('')

// ---- P0-6: Stop Reason Overlay (Espresso) ----
const stopReasonVisible = ref(false)
const stopReasonText = ref('')
let userRequestedStop = false
let lastTargetWeight = 0

// Track whether user explicitly stopped the shot
function markUserStop() {
  userRequestedStop = true
}

// Auto-navigation based on machine state transitions
const STATE_ROUTES = {
  espresso: '/espresso',
  steam: '/steam',
  hotWater: '/hotwater',
  flush: '/flush',
}

const OPERATION_STATES = new Set(['espresso', 'steam', 'hotWater', 'flush'])

watch(machine.state, (newState, oldState) => {
  if (newState === oldState) return

  const targetRoute = STATE_ROUTES[newState]

  if (targetRoute && route.path !== targetRoute) {
    // Starting an operation -- navigate to its page
    if (newState === 'espresso') {
      shotData.start()
      userRequestedStop = false
      lastTargetWeight = workflow.doseData?.doseOut ?? 36
    }
    router.replace(targetRoute)
  } else if (!targetRoute && oldState && OPERATION_STATES.has(oldState)) {
    // Operation ended -- determine overlay/reason
    if (oldState === 'espresso') {
      shotData.stop()
      // P0-6: Determine stop reason
      const currentWeight = scale.weight.value ?? 0
      if (userRequestedStop) {
        stopReasonText.value = 'Stopped manually'
      } else if (lastTargetWeight > 0 && currentWeight >= lastTargetWeight * 0.95) {
        stopReasonText.value = 'Target weight reached'
      } else {
        stopReasonText.value = 'Profile complete'
      }
      stopReasonVisible.value = true
      userRequestedStop = false
      // Navigate to idle after a moment
      if (route.path !== '/') router.push('/')
    } else {
      // P0-5: Show completion overlay for steam/hotwater/flush
      const messages = {
        steam: 'Steam Complete',
        hotWater: 'Hot Water Complete',
        flush: 'Flush Complete',
      }
      completionMessage.value = messages[oldState] || 'Complete'

      if (oldState === 'hotWater') {
        completionValue.value = (scale.weight.value ?? 0).toFixed(0) + 'g'
      } else {
        const elapsed = shotData.elapsed()
        completionValue.value = elapsed > 0 ? elapsed.toFixed(1) + 's' : ''
      }
      completionVisible.value = true
      // Navigation happens on dismiss (after 3s)
    }
  }
})

function onCompletionDismiss() {
  completionVisible.value = false
  if (route.path !== '/') router.push('/')
}

function onStopReasonDismiss() {
  stopReasonVisible.value = false
}

// ---- P0-7: Keyboard Shortcuts ----
const isReady = computed(() => {
  const s = machine.state.value
  return s === 'idle' || s === 'ready'
})

const isOperating = computed(() =>
  OPERATION_STATES.has(machine.state.value)
)

function onKeyDown(e) {
  // Ignore when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
    return
  }

  const key = e.key.toLowerCase()

  if (isReady.value) {
    switch (key) {
      case 'e':
        e.preventDefault()
        setMachineState('espresso').catch(() => {})
        return
      case 's':
        e.preventDefault()
        setMachineState('steam').catch(() => {})
        return
      case 'w':
        e.preventDefault()
        setMachineState('hotWater').catch(() => {})
        return
      case 'f':
        e.preventDefault()
        setMachineState('flush').catch(() => {})
        return
    }
  }

  if (isOperating.value) {
    if (key === ' ' || key === 'escape') {
      e.preventDefault()
      markUserStop()
      setMachineState('idle').catch(() => {})
    }
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeyDown)

  // Load persisted settings, then sync operation defaults from workflow
  await settings.load()
  operationSettings.syncFromWorkflow()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <StatusBar
    :machine-state="machine.state.value"
    :machine-connected="machine.isConnected.value"
    :scale-connected="scale.isConnected.value"
    :temperature="machine.mixTemperature.value"
    :target-temperature="machine.targetMixTemperature.value"
    :water-level="waterLevels.currentLevel.value"
    :profile-name="workflow.profile?.title ?? ''"
  />
  <main class="app-main">
    <router-view />
  </main>

  <!-- P0-5: Completion overlay (steam/hotwater/flush) -->
  <CompletionOverlay
    :visible="completionVisible"
    :message="completionMessage"
    :display-value="completionValue"
    @dismiss="onCompletionDismiss"
  />

  <!-- P0-6: Stop reason overlay (espresso) -->
  <StopReasonOverlay
    :visible="stopReasonVisible"
    :reason="stopReasonText"
    @dismiss="onStopReasonDismiss"
  />
</template>

<style scoped>
.app-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
