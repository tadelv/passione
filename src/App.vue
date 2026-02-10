<script setup>
import { watch, provide, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import StatusBar from './components/StatusBar.vue'
import { useMachine } from './composables/useMachine.js'
import { useScale } from './composables/useScale.js'
import { useWaterLevels } from './composables/useWaterLevels.js'
import { useShotSettings } from './composables/useShotSettings.js'
import { useWorkflow } from './composables/useWorkflow.js'
import { useShotData } from './composables/useShotData.js'

const router = useRouter()
const route = useRoute()

// Connect to all WebSocket streams
const machine = useMachine()
const scale = useScale()
const waterLevels = useWaterLevels()
const shotSettings = useShotSettings()
const { workflow } = useWorkflow()
const shotData = useShotData()

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
provide('shotTime', computed(() => shotData.elapsed()))
provide('substate', machine.substate)
provide('waterLevel', waterLevels.currentLevel)
provide('profileName', computed(() => workflow.profile?.title ?? ''))
provide('steamTemperature', machine.steamTemperature)
provide('targetSteamTemp', computed(() => shotSettings.targetSteamTemp.value ?? 160))

// Provide composable instances for pages that need direct access
provide('machine', machine)
provide('scale', scale)
provide('shotData', shotData)

// Feed machine + scale snapshots into shot data buffer during espresso
watch(machine.snapshot, (snap) => {
  if (!snap) return
  if (machine.state.value === 'espresso' && shotData.isRecording.value) {
    shotData.addPoint(snap, { weight: scale.weight.value })
  }
})

// Auto-navigation based on machine state transitions
const STATE_ROUTES = {
  espresso: '/espresso',
  steam: '/steam',
  hotWater: '/hotwater',
  flush: '/flush',
}

watch(machine.state, (newState, oldState) => {
  if (newState === oldState) return

  const targetRoute = STATE_ROUTES[newState]

  if (targetRoute && route.path !== targetRoute) {
    // Starting an operation — navigate to its page
    if (newState === 'espresso') {
      shotData.start()
    }
    router.push(targetRoute)
  } else if (!targetRoute && oldState && STATE_ROUTES[oldState] && route.path !== '/') {
    // Operation ended — go back to idle
    if (oldState === 'espresso') {
      shotData.stop()
    }
    router.push('/')
  }
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
