<script setup>
import { ref, watch, provide, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import StatusBar from './components/StatusBar.vue'
import CompletionOverlay from './components/CompletionOverlay.vue'
import StopReasonOverlay from './components/StopReasonOverlay.vue'
import ToastNotification from './components/ToastNotification.vue'
import DevicePickerDialog from './components/DevicePickerDialog.vue'
import { useMachine } from './composables/useMachine.js'
import { useScale } from './composables/useScale.js'
import { useDevices } from './composables/useDevices.js'
import { useWaterLevels } from './composables/useWaterLevels.js'
import { useTimeToReady } from './composables/useTimeToReady.js'
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
const timeToReady = useTimeToReady()
const shotSettings = useShotSettings()
const { workflow, updateWorkflow, ready: workflowReady } = useWorkflow()
const shotData = useShotData()

const beansComposable = useBeans()
const grindersComposable = useGrinders()

// Settings, theme, and cross-cutting composables
const settings = useSettings()
const theme = useTheme()
const volumeMode = useVolumeMode(machine, scale, workflow)
const toast = useToast()
const operationSettings = useOperationSettings(settings, workflow, updateWorkflow, toast)
const display = useDisplay()
const autoSleep = useAutoSleep(machine, settings, display)

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
// Time-to-ready plugin — injected into StatusBar (and anywhere else that
// wants to know the DE1 warm-up estimate). See useTimeToReady.js for shape.
provide('timeToReadyStatus', timeToReady.status)
provide('timeToReadyFormatted', timeToReady.formattedTime)
provide('timeToReadyRemainingMs', timeToReady.remainingTimeMs)

// Water level display: mm → ml conversion using DE1 tank CAD-derived lookup table.
// The tank cross-section is non-uniform — a linear constant is inaccurate.
// Source: Decenza de1device.cpp parseWaterLevel()
const WATER_MM_TO_ML = [
  0, 16, 43, 70, 97, 124, 151, 179, 206, 233,         // 0-9mm
  261, 288, 316, 343, 371, 398, 426, 453, 481, 509,    // 10-19mm
  537, 564, 592, 620, 648, 676, 704, 732, 760, 788,    // 20-29mm
  816, 844, 872, 900, 929, 957, 985, 1013, 1042, 1070, // 30-39mm
  1104, 1138, 1172, 1207, 1242, 1277, 1312, 1347, 1382, 1417, // 40-49mm
  1453, 1488, 1523, 1559, 1594, 1630, 1665, 1701, 1736, 1772, // 50-59mm
  1808, 1843, 1879, 1915, 1951, 1986,                  // 60-65mm
]
const WATER_SENSOR_OFFSET_MM = 5 // sensor mounted 5mm above water intake
const WATER_FULL_ML = 1104 // tank capacity at "full" (40mm + offset)

function waterMmToMl(rawMm) {
  const mm = Math.max(0, rawMm + WATER_SENSOR_OFFSET_MM)
  const idx = Math.min(Math.floor(mm), WATER_MM_TO_ML.length - 1)
  return WATER_MM_TO_ML[idx]
}

const waterLevelDisplay = computed(() => {
  const mm = waterLevels.currentLevel.value
  if (settings.settings.waterLevelDisplayUnit === 'ml') {
    return waterMmToMl(mm) + ' ml'
  }
  return mm.toFixed(1) + ' mm'
})
const waterLevelPercent = computed(() => {
  const ml = waterMmToMl(waterLevels.currentLevel.value)
  return Math.min(100, Math.round((ml / WATER_FULL_ML) * 100))
})

// Water warning state — ported from Decenza's WaterLevelItem.qml (19-27).
//
// In Decenza the formula is `margin = waterLevelMm - sensorOffset - refillPoint`,
// where `waterLevelMm` already includes the 5 mm sensor offset and
// `refillPoint` is raw sensor mm — simplifying to `rawSensor - rawRefill`.
// Our `waterLevels.currentLevel` is the RAW sensor reading (see how
// `waterMmToMl()` above ADDS `WATER_SENSOR_OFFSET_MM` to it), and
// `waterLevels.refillLevel` is raw sensor mm from the same WS message —
// so the subtraction is direct.
//
// Implemented as a ref updated by a watch (rather than a computed) so a
// transient WS disconnect or a pre-data startup doesn't flicker the
// warning indicator to "ok" or "critical" — we hold the last known value
// until we see real, connected data.
const waterWarningState = ref('ok')

watch(
  [waterLevels.currentLevel, waterLevels.refillLevel, waterLevels.isConnected],
  () => {
    // Don't flip during transient disconnects or before the first WS
    // snapshot delivers real values — keep the last known state.
    if (!waterLevels.isConnected.value) return
    const current = waterLevels.currentLevel.value
    if (current <= 0) return
    const refill = waterLevels.refillLevel.value
    const margin = current - refill
    if (margin > 7) waterWarningState.value = 'ok'
    else if (margin > 5) waterWarningState.value = 'low'
    else if (margin > 3) waterWarningState.value = 'warning'
    else waterWarningState.value = 'critical'
  },
  { immediate: true }
)

provide('waterLevelDisplay', waterLevelDisplay)
provide('waterLevelPercent', waterLevelPercent)
provide('waterWarningState', waterWarningState)
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

const editingLayout = ref(false)
provide('editingLayout', editingLayout)
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
// Epoch-ms start time of the shot that just ended, captured BEFORE
// shotData.stop() clears it. Used to tell whether /shots/latest has
// already been updated with the current shot (freshness check).
let lastShotStartMs = 0

// Track whether user explicitly stopped the shot
function markUserStop() {
  userRequestedStop = true
}
provide('markUserStop', markUserStop)

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
  if (state === 'sleeping') {
    if (settings.settings.screensaverType !== 'disabled' && route.path !== '/screensaver') {
      router.replace('/screensaver')
    }
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

  // Suppress navigation during layout editing
  if (editingLayout.value && route.path === '/') return

  const targetRoute = STATE_ROUTES[newState]

  // Reset espresso tracking on any transition into espresso state
  if (newState === 'espresso' && oldState !== 'espresso') {
    userRequestedStop = false
    lastTargetWeight = workflow.context?.targetYield ?? 36
  }

  if (targetRoute && route.path !== targetRoute) {
    // Starting an operation -- navigate to its page
    // Note: shotData.start() is handled by the snapshot watcher (line 174+)
    // which correctly waits for RECORDING_SUBSTATES (past preheat).
    router.replace(targetRoute)
  } else if (!targetRoute && oldState && OPERATION_STATES.has(oldState)) {
    // Operation ended -- determine overlay/reason
    if (oldState === 'espresso') {
      lastShotStartMs = shotData.shotStartTime.value ?? 0
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
        const elapsed = machine.shotTime.value
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

// Clear overlays if the user manually navigates away (e.g. pressing ',' for settings)
// so the auto-dismiss timer doesn't teleport them back.
watch(() => route.path, () => {
  stopReasonVisible.value = false
  completionVisible.value = false
})

// How long we keep polling /shots/latest for a record that belongs to the
// current session before giving up and going home. The gateway persists
// shots asynchronously, so a naive single query right after pouringDone
// can return a stale record from a previous session — which would land
// the user on the wrong /shot-review page (and Back wouldn't save them,
// only Home would). Polling avoids that without abandoning the flow.
const LATEST_SHOT_POLL_INTERVAL_MS = 500
const LATEST_SHOT_POLL_TIMEOUT_MS = 4000

function onStopReasonDismiss() {
  if (!stopReasonVisible.value) return // already dismissed by route change
  stopReasonVisible.value = false
  const goHome = () => { if (route.path !== '/') router.push('/') }
  // Only the visualizer-enabled flow routes to the post-shot review page;
  // otherwise dismiss goes straight home.
  if (!settings.settings.visualizerUsername) {
    goHome()
    return
  }

  const sessionStart = lastShotStartMs
  const deadline = Date.now() + LATEST_SHOT_POLL_TIMEOUT_MS
  const isFreshShot = (shot) => {
    if (!shot?.id) return false
    const ts = shot.timestamp ?? shot.date
    const shotMs = ts ? Date.parse(ts) : NaN
    // 5s tolerance — gateway shot timestamps are recorded at shot start
    // and may drift slightly from this client's clock.
    return Number.isFinite(shotMs) && sessionStart > 0 && shotMs >= sessionStart - 5000
  }

  const poll = () => {
    // Bail if the user has navigated away (Home / Settings / etc.) — we
    // shouldn't hijack their navigation with a late review push.
    if (route.path !== '/espresso') return
    getLatestShot().then(shot => {
      if (isFreshShot(shot)) {
        router.push(`/shot-review/${encodeURIComponent(shot.id)}`)
        return
      }
      if (Date.now() >= deadline) {
        goHome()
        return
      }
      setTimeout(poll, LATEST_SHOT_POLL_INTERVAL_MS)
    }).catch(() => {
      if (Date.now() >= deadline) goHome()
      else setTimeout(poll, LATEST_SHOT_POLL_INTERVAL_MS)
    })
  }
  poll()
}

// ---- P0-7: Keyboard Shortcuts ----
const isReady = computed(() => {
  const s = machine.state.value
  return s === 'idle'
})

const isOperating = computed(() =>
  OPERATION_STATES.has(machine.state.value)
)

function onKeyDown(e) {
  // Ignore during layout editing
  if (editingLayout.value) return

  // Screensaver: any key wakes (like Decenza)
  if (machine.state.value === 'sleeping' && route.path === '/screensaver') {
    e.preventDefault()
    setMachineState('idle').catch(() => {})
    return
  }

  // Ignore when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) {
    return
  }

  const key = e.key.toLowerCase()

  // ---- Operation shortcuts (idle state) ----
  // Number keys match GHC (Group Head Controller) button positions from de1app:
  // 1=Flush, 2=Espresso, 3=Steam, 4=Hot Water, 0=Sleep
  if (isReady.value) {
    switch (key) {
      case 'e':
      case '2':
        e.preventDefault()
        setMachineState('espresso').catch(() => {})
        return
      case 's':
      case '3':
        e.preventDefault()
        setMachineState('steam').catch(() => {})
        return
      case 'w':
      case '4':
        e.preventDefault()
        setMachineState('hotWater').catch(() => {})
        return
      case 'f':
      case '1':
        e.preventDefault()
        setMachineState('flush').catch(() => {})
        return
      case 'p':
      case '0':
        e.preventDefault()
        setMachineState('sleeping').catch(() => {})
        return
    }
  }

  // ---- Stop shortcuts (during operation) ----
  if (isOperating.value) {
    if (key === ' ' || key === 'escape' || key === 'backspace' || key === 'i') {
      e.preventDefault()
      markUserStop()
      setMachineState('idle').catch(() => {})
      return
    }
  }

  // ---- Navigation shortcuts (global, non-operating) ----
  if (!isOperating.value) {
    switch (key) {
      case 'i':
        e.preventDefault()
        setMachineState('idle').catch(() => {})
        return
      case 'h':
        e.preventDefault()
        router.push('/')
        return
      case 'r':
        e.preventDefault()
        router.push('/recipe/edit')
        return
      case 't':
        e.preventDefault()
        router.push('/history')
        return
      case ',':
        e.preventDefault()
        router.push('/settings')
        return
    }
  }

  // Settings shortcut also available during operation
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

  // Load persisted settings, wait for workflow, then sync operation defaults
  await Promise.all([settings.load(), workflowReady])
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
  <a href="#main-content" class="skip-to-content">Skip to content</a>
  <StatusBar
    :machine-state="machine.state.value"
    :machine-substate="machine.substate.value"
    :machine-connected="machine.isConnected.value"
    :device-connected="devices.machineConnected.value"
    :scanning="devices.scanning.value"
    :mix-temperature="machine.mixTemperature.value"
    :group-temperature="machine.groupTemperature.value"
    :steam-temperature="machine.steamTemperature.value"
    :water-level-display="waterLevelDisplay"
    :time-to-ready-status="timeToReady.status.value"
    :time-to-ready-formatted="timeToReady.formattedTime.value"
    @scan="devices.scan({ connect: true })"
  />
  <main id="main-content" class="app-main">
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

</template>

<style scoped>
.skip-to-content {
  position: absolute;
  top: -100%;
  left: 16px;
  z-index: var(--z-debug);
  padding: 8px 16px;
  background: var(--color-primary);
  color: var(--color-text);
  border-radius: var(--radius-button);
  font-size: var(--font-body);
  text-decoration: none;
}

.skip-to-content:focus {
  top: 8px;
}

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
