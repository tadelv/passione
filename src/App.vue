<script setup>
import { ref, watch, provide, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import StatusBar from './components/StatusBar.vue'
import CompletionOverlay from './components/CompletionOverlay.vue'
import StopReasonOverlay from './components/StopReasonOverlay.vue'
import ToastNotification from './components/ToastNotification.vue'
import LogOverlay from './components/LogOverlay.vue'
import { useMachine } from './composables/useMachine.js'
import { useScale } from './composables/useScale.js'
import { useDevices } from './composables/useDevices.js'
import { useWaterLevels } from './composables/useWaterLevels.js'
import { useShotSettings } from './composables/useShotSettings.js'
import { useWorkflow } from './composables/useWorkflow.js'
import { useShotData } from './composables/useShotData.js'
import { useSettings } from './composables/useSettings.js'
import { useTheme } from './composables/useTheme.js'
import { useAutoSleep } from './composables/useAutoSleep.js'
import { useDisplay } from './composables/useDisplay.js'
import { useVolumeMode } from './composables/useVolumeMode.js'
import { useOperationSettings } from './composables/useOperationSettings.js'
import { useToast } from './composables/useToast.js'
import { setMachineState, getLatestShot } from './api/rest.js'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

// Connect to all WebSocket streams
const machine = useMachine()
const scale = useScale()
const devices = useDevices()
const waterLevels = useWaterLevels()
const shotSettings = useShotSettings()
const { workflow, updateWorkflow } = useWorkflow()
const shotData = useShotData()

// Settings, theme, and cross-cutting composables
const settings = useSettings()
const theme = useTheme()
const volumeMode = useVolumeMode(machine, scale, workflow)
const operationSettings = useOperationSettings(settings, workflow)
const display = useDisplay()
const autoSleep = useAutoSleep(machine, settings, display)
const toast = useToast()

// Provide reactive data for child components that use inject
provide('machineState', machine.state)
provide('machineConnected', devices.machineConnected)
provide('scaleConnected', devices.scaleConnected)
provide('temperature', machine.mixTemperature)
provide('targetTemperature', machine.targetMixTemperature)
provide('pressure', machine.pressure)
provide('flow', machine.flow)
provide('weight', scale.weight)
provide('targetWeight', computed(() => workflow.doseData?.doseOut ?? 36))
provide('shotTime', machine.shotTime)
provide('substate', machine.substate)
provide('waterLevel', waterLevels.currentLevel)

// Water level display: mm → ml conversion using DE1 tank cross-section (~150mm × 83mm)
const WATER_ML_PER_MM = 12.45
const WATER_TANK_MAX_MM = 120
const waterLevelDisplay = computed(() => {
  const mm = waterLevels.currentLevel.value
  if (settings.settings.waterLevelDisplayUnit === 'ml') {
    return Math.round(mm * WATER_ML_PER_MM) + ' ml'
  }
  return mm + ' mm'
})
const waterLevelPercent = computed(() => {
  return Math.min(100, Math.round((waterLevels.currentLevel.value / WATER_TANK_MAX_MM) * 100))
})
provide('waterLevelDisplay', waterLevelDisplay)
provide('waterLevelPercent', waterLevelPercent)
provide('profileName', computed(() => workflow.profile?.title ?? ''))
provide('steamTemperature', machine.steamTemperature)
provide('targetSteamTemp', computed(() => shotSettings.targetSteamTemp.value ?? 160))
provide('profileFrame', machine.profileFrame)
provide('workflow', workflow)
provide('updateWorkflow', updateWorkflow)

// Provide derived machine state flags
provide('isReady', machine.isReady)
provide('isHeating', machine.isHeating)
provide('isFlowing', machine.isFlowing)
provide('previousState', machine.previousState)

// Provide composable instances for pages that need direct access
provide('machine', machine)
provide('scale', scale)
provide('devices', devices)
provide('shotData', shotData)
provide('settings', settings)
provide('theme', theme)
provide('volumeMode', volumeMode)
provide('autoSleep', autoSleep)
provide('display', display)
provide('toast', toast)

// ---- Connection state toasts (driven by devices WebSocket API) ----

watch(devices.machineConnected, (connected, wasConnected) => {
  if (connected && !wasConnected) {
    toast.success(t('toast.machineConnected'))
  } else if (!connected && wasConnected) {
    toast.warning(t('toast.machineDisconnected'))
  }
})

watch(devices.scaleConnected, (connected, wasConnected) => {
  if (connected && !wasConnected) {
    toast.info(t('toast.scaleConnected'))
  } else if (!connected && wasConnected) {
    toast.warning(t('toast.scaleDisconnected'))
  }
})

// ---- Page transition control ----
// Auto-navigation (machine state changes) uses no transition.
// User-initiated navigation uses a subtle fade.
const transitionName = ref('')
let autoNavActive = false

// Mark auto-navigation before router.replace
const origReplace = router.replace.bind(router)
router.replace = function (...args) {
  autoNavActive = true
  return origReplace(...args)
}

router.beforeEach(() => {
  transitionName.value = autoNavActive ? '' : 'page-fade'
  autoNavActive = false
})

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
  sleeping: '/screensaver',
}

const OPERATION_STATES = new Set(['espresso', 'steam', 'hotWater', 'flush'])

watch(machine.state, (newState, oldState) => {
  if (newState === oldState) return

  // Display control: dim on sleep, restore on wake
  if (newState === 'sleeping') {
    display.dim()
  } else if (oldState === 'sleeping') {
    display.restore()
  }

  // Wake-lock: hold during active operations
  if (OPERATION_STATES.has(newState)) {
    display.requestWakeLock()
  } else if (oldState && OPERATION_STATES.has(oldState)) {
    display.releaseWakeLock()
  }

  // Screensaver: navigate when sleeping, navigate away when waking
  if (newState === 'sleeping' && settings.settings.screensaverType !== 'disabled') {
    router.replace('/screensaver')
    return
  }
  if (oldState === 'sleeping' && route.path === '/screensaver') {
    router.replace('/')
    return
  }

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
        stopReasonText.value = t('operations.stoppedManually')
      } else if (lastTargetWeight > 0 && currentWeight >= lastTargetWeight * 0.95) {
        stopReasonText.value = t('operations.targetWeightReached')
      } else {
        stopReasonText.value = t('operations.profileComplete')
      }
      stopReasonVisible.value = true
      userRequestedStop = false
      // Navigate to shot review if enabled, otherwise to idle
      if (settings.settings.visualizerShowAfterShot) {
        getLatestShot().then(shot => {
          if (shot?.id) router.push(`/shot-review/${encodeURIComponent(shot.id)}`)
          else if (route.path !== '/') router.push('/')
        }).catch(() => {
          if (route.path !== '/') router.push('/')
        })
      } else {
        if (route.path !== '/') router.push('/')
      }
    } else {
      // P0-5: Show completion overlay for steam/hotwater/flush
      const messages = {
        steam: t('operations.steamComplete'),
        hotWater: t('operations.hotWaterComplete'),
        flush: t('operations.flushComplete'),
      }
      completionMessage.value = messages[oldState] || t('operations.complete')

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

  // Settings shortcut (comma key, like Cmd+, in most apps)
  if (key === ',') {
    e.preventDefault()
    router.push('/settings')
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
    :profile-name="workflow.profile?.title ?? ''"
  />
  <main class="app-main">
    <router-view v-slot="{ Component }">
      <Transition :name="transitionName" mode="out-in">
        <component :is="Component" />
      </Transition>
    </router-view>
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

  <!-- Toast notifications -->
  <ToastNotification
    :toasts="toast.toasts.value"
    @dismiss="toast.dismiss"
  />

  <!-- Floating log overlay (all pages) -->
  <LogOverlay />
</template>

<style scoped>
.app-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

/* Page fade transition for user-initiated navigation */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
</style>
