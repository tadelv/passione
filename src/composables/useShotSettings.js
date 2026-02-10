/**
 * Composable for real-time shot settings updates.
 *
 * Connects to ws/v1/machine/shotSettings (push on change) and exposes
 * reactive refs for steam, hot water, and shot volume settings.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'

export function useShotSettings() {
  const isConnected = ref(false)

  const steamSetting = ref(0)
  const targetSteamTemp = ref(0)
  const targetSteamDuration = ref(0)
  const targetHotWaterTemp = ref(0)
  const targetHotWaterVolume = ref(0)
  const targetHotWaterDuration = ref(0)
  const targetShotVolume = ref(0)
  const groupTemp = ref(0)

  let ws = null

  function onMessage(data) {
    steamSetting.value = data.steamSetting ?? steamSetting.value
    targetSteamTemp.value = data.targetSteamTemp ?? targetSteamTemp.value
    targetSteamDuration.value = data.targetSteamDuration ?? targetSteamDuration.value
    targetHotWaterTemp.value = data.targetHotWaterTemp ?? targetHotWaterTemp.value
    targetHotWaterVolume.value = data.targetHotWaterVolume ?? targetHotWaterVolume.value
    targetHotWaterDuration.value = data.targetHotWaterDuration ?? targetHotWaterDuration.value
    targetShotVolume.value = data.targetShotVolume ?? targetShotVolume.value
    groupTemp.value = data.groupTemp ?? groupTemp.value
  }

  function connect() {
    ws = new ReconnectingWebSocket(
      `${WS_URL}/ws/v1/machine/shotSettings`,
      onMessage
    )
    ws.onConnectionChange = (connected) => {
      isConnected.value = connected
    }
    ws.connect()
  }

  function disconnect() {
    ws?.close()
    ws = null
    isConnected.value = false
  }

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    isConnected,
    steamSetting,
    targetSteamTemp,
    targetSteamDuration,
    targetHotWaterTemp,
    targetHotWaterVolume,
    targetHotWaterDuration,
    targetShotVolume,
    groupTemp,
    connect,
    disconnect,
  }
}
