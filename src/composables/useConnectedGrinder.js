import { ref, computed, watch, onUnmounted } from 'vue'
import { WS_URL } from '../api/gateway'
import { ReconnectingWebSocket } from '../api/websocket'
import {
  getConnectedGrinderInfo,
  setConnectedGrinderSetting,
  setConnectedGrinderRpm,
} from '../api/rest'
import { bootReady } from './useBootReady'

export function useConnectedGrinder(devices) {
  const info = ref(null)
  const state = ref('unknown')
  const setting = ref(null)
  const rpm = ref(null)

  const device = computed(() => devices?.grinderDevice?.value ?? null)
  const deviceId = computed(() => device.value?.id ?? null)
  const isConnected = computed(() => device.value != null)
  const capabilities = computed(() => info.value?.capabilities ?? [])
  const supportsGrindSetting = computed(() => capabilities.value.includes('grindSetting'))
  const supportsRpm = computed(() => capabilities.value.includes('rpmControl'))

  let ws = null
  let disposed = false
  let infoGeneration = 0
  let refreshingForId = null

  function resetSnapshot() {
    state.value = 'unknown'
    setting.value = null
    rpm.value = null
  }

  async function refreshInfo() {
    const id = deviceId.value
    if (!id) {
      infoGeneration++
      info.value = null
      resetSnapshot()
      return
    }
    if (refreshingForId === id) return
    const generation = ++infoGeneration
    refreshingForId = id
    await bootReady()
    try {
      if (disposed || generation !== infoGeneration || deviceId.value !== id) return
      const next = await getConnectedGrinderInfo()
      if (!disposed && generation === infoGeneration && deviceId.value === id) {
        info.value = next?.deviceId === id ? next : null
      }
    } catch {
      if (!disposed && generation === infoGeneration && deviceId.value === id) {
        info.value = null
      }
    } finally {
      if (refreshingForId === id) refreshingForId = null
    }
  }

  function onMessage(data) {
    if (!data || typeof data !== 'object') return
    if (typeof data.state === 'string') state.value = data.state
    setting.value = 'setting' in data ? data.setting : null
    rpm.value = 'rpm' in data ? data.rpm : null
    if (!info.value && deviceId.value) refreshInfo()
  }

  function open() {
    if (ws || disposed) return
    ws = new ReconnectingWebSocket(`${WS_URL}/ws/v1/grinder/snapshot`, onMessage)
    ws.connect()
  }

  function close() {
    ws?.close()
    ws = null
  }

  async function setSetting(value) {
    const next = String(value)
    await setConnectedGrinderSetting(next)
    setting.value = next
  }

  async function setRpm(value) {
    const next = Number(value)
    if (!Number.isInteger(next) || next < 0) throw new Error('RPM must be a non-negative integer')
    await setConnectedGrinderRpm(next)
    rpm.value = next
  }

  watch(deviceId, (id, previousId) => {
    if (id !== previousId) {
      info.value = null
      if (!id || previousId) resetSnapshot()
    }
    refreshInfo()
  }, { immediate: true })
  bootReady().then(open)

  onUnmounted(() => {
    disposed = true
    infoGeneration++
    close()
  })

  return {
    device,
    deviceId,
    isConnected,
    capabilities,
    supportsGrindSetting,
    supportsRpm,
    state,
    setting,
    rpm,
    refreshInfo,
    setSetting,
    setRpm,
  }
}
