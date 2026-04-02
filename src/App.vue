<script setup>
import { ref, watch, provide, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import StatusBar from './components/StatusBar.vue'
import CompletionOverlay from './components/CompletionOverlay.vue'
import StopReasonOverlay from './components/StopReasonOverlay.vue'
import ToastNotification from './components/ToastNotification.vue'
import LogOverlay from './components/LogOverlay.vue'
import DevicePickerDialog from './components/DevicePickerDialog.vue'
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
import { useBeans } from './composables/useBeans'
import { useGrinders } from './composables/useGrinders'
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

const beansComposable = useBeans()
const grindersComposable = useGrinders()

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
provide('targetWeight', computed(() => workflow.context?.targetYield ?? 36))
provide('shotTime', machine.shotTime)
provide('substate', machine.substate)
provide('waterLevel', waterLevels.currentLevel)

// Water level display: mm → ml conversion using DE1 tank cross-section (~150mm × 83mm)
const WATER_ML_PER_MM = 12.45
const WATER_TANK_MAX_MM = 120
const waterLevelDisplay = computed(() => {
  const mm = waterLevels.currentLevel.value
  if (settings.settings.waterLevelDisplayUnit === 'ml') {
    return (mm * WATER_ML_PER_MM).toFixed(1) + ' ml'
  }
  return mm.toFixed(1) + ' mm'
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
provide('beans', beansComposable.beans)
provide('beansApi', beansComposable)
provide('grinders', grindersComposable.grinders)
provide('grindersApi', grindersComposable)

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
provide('operationSettings', operationSettings)

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

// ---- Device picker dialog (scan ambiguity resolution) ----
const pickerDevices = computed(() => {
  if (devices.pendingAmbiguity.value === 'machinePicker') return devices.foundMachines.value
  if (devices.pendingAmbiguity.value === 'scalePicker') return devices.foundScales.value
  return []
})

function onDevicePicked(deviceId) {
  devices.connectDevice(deviceId)
}

function onDevicePickerCancel() {
  // No-op: ambiguity clears when the server moves on or user triggers a new scan
}

// ---- Page transition control ----
// Auto-navigation (machine state changes) uses no transition.
// User-initiated navigation uses a subtle fade.
const transitionName = ref('')
let autoNavActive = false

// Mark auto-navigation before router.replace — also bypass the 300ms debounce
// guard so machine-state-driven navigation is never silently swallowed.
const origReplace = router.replace.bind(router)
router.replace = function (...args) {
  autoNavActive = true
  router._skipDebounce = true
  return origReplace(...args)
}

router.beforeEach(() => {
  transitionName.value = autoNavActive ? '' : 'page-fade'
  autoNavActive = false
})

// Feed machine + scale snapshots into shot data buffer during espresso.
// Check state from the snapshot itself (not machine.state ref) to avoid
// race with the state watcher — both refs are set in the same onMessage call,
// but this watcher may fire before shotData.start() runs in the state watcher.
// Only start recording once past preheat (preinfusion/pouring) so the chart
// doesn't show data while the PREHEATING banner is visible.
const RECORDING_SUBSTATES = new Set(['preinfusion', 'pouring', 'pouringDone'])

watch(machine.snapshot, (snap) => {
  if (!snap) return
  const snapState = snap.state?.state
  const snapSubstate = snap.state?.substate
  if (snapState === 'espresso') {
    if (!shotData.isRecording.value) {
      // Don't start recording during preheat — wait for actual brewing
      if (!RECORDING_SUBSTATES.has(snapSubstate)) return
      shotData.start()
    }
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

// One-shot: navigate to the correct page based on the machine's state at load
// time. Waits for the state to arrive (not 'unknown') AND for the router to
// finish its initial navigation, since router.replace is silently dropped
// before router.isReady() resolves.
const stopInitialNav = watch(machine.state, async (state) => {
  if (state === 'unknown') return
  stopInitialNav()
  await router.isReady()
  if (state === 'sleeping' && settings.settings.screensaverType !== 'disabled') {
    if (route.path !== '/screensaver') router.replace('/screensaver')
  } else {
    const target = STATE_ROUTES[state]
    if (target && route.path !== target) router.replace(target)
  }
})

watch(machine.state, (newState, oldState) => {
  if (newState === oldState) return

  // Display control: dim on sleep, restore on wake
  // Scale: disconnect during sleep to avoid unnecessary traffic
  if (newState === 'sleeping') {
    display.dim()
    scale.disconnect()
  } else if (oldState === 'sleeping') {
    display.restore()
    scale.connect()
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
    const wakeTarget = STATE_ROUTES[newState] || '/'
    router.replace(wakeTarget)
    // If waking into idle, skip remaining logic (no operation to set up)
    if (wakeTarget === '/') return
  }

  const targetRoute = STATE_ROUTES[newState]

  // Reset espresso tracking on any transition into espresso state
  if (newState === 'espresso' && oldState !== 'espresso') {
    userRequestedStop = false
    lastTargetWeight = workflow.context?.targetYield ?? 36
  }

  if (targetRoute && route.path !== targetRoute) {
    // Starting an operation -- navigate to its page
    if (newState === 'espresso' && !shotData.isRecording.value) {
      shotData.start()
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
      // Linger on espresso page (user can see final shot graph), or go home
      if (!settings.settings.lingerOnEspressoPage) {
        if (route.path !== '/') router.push('/')
      }
      // When lingering, navigation happens on StopReasonOverlay dismiss
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
  // If visualizer credentials are configured, navigate to shot review; otherwise go home
  if (settings.settings.visualizerUsername) {
    getLatestShot().then(shot => {
      if (shot?.id) router.push(`/shot-review/${encodeURIComponent(shot.id)}`)
      else if (route.path !== '/') router.push('/')
    }).catch(() => {
      if (route.path !== '/') router.push('/')
    })
  } else {
    if (route.path !== '/') router.push('/')
  }
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
  // Suppress native context menu globally — this is a dedicated appliance UI,
  // and the native menu interrupts long-press interactions (especially on macOS
  // WKWebView where holding the mouse/trackpad triggers contextmenu + pointercancel).
  document.addEventListener('contextmenu', onContextMenu)

  // Load persisted settings, then sync operation defaults from workflow
  await settings.load()
  operationSettings.syncFromWorkflow()
})

function onContextMenu(e) {
  e.preventDefault()
}

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('contextmenu', onContextMenu)
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

  <!-- Device picker dialog (scan ambiguity) -->
  <DevicePickerDialog
    :visible="!!devices.pendingAmbiguity.value"
    :ambiguity-type="devices.pendingAmbiguity.value"
    :devices="pickerDevices"
    @select="onDevicePicked"
    @cancel="onDevicePickerCancel"
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
