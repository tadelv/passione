<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ConnectionIndicator from '../ConnectionIndicator.vue'
import { getReaSettings, tareScale, updateReaSettings } from '../../api/rest.js'
import { describeError } from '../../composables/useConnectionError.js'

const devices = inject('devices')
const grinders = inject('grinders', ref([]))
const grindersApi = inject('grindersApi', null)
const connectedGrinder = inject('connectedGrinder', null)
const toast = inject('toast', null)
const { t } = useI18n()

const preferredGrinderDeviceId = ref(null)
let preferenceGeneration = 0
const busyDeviceId = ref(null)
const linkingDeviceId = ref(null)

const errorInfo = computed(() => {
  const err = devices.connectionError.value
  if (!err) return null
  const { title, detail } = describeError(err, t)
  return { ...err, title, detail }
})

function deviceStatus(device) {
  switch (device.state) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting...'
    case 'disconnecting': return 'Disconnecting...'
    default: return 'Disconnected'
  }
}

function deviceStatusColor(device) {
  switch (device.state) {
    case 'connected': return 'var(--color-success)'
    case 'connecting':
    case 'disconnecting': return 'var(--color-warning)'
    default: return 'var(--color-error)'
  }
}

function linkedGrinderId(deviceId) {
  return grinders.value.find(g => String(g.extras?.runtimeDeviceId ?? '') === String(deviceId))?.id ?? ''
}

async function linkGrinder(deviceId, grinderId) {
  if (!grindersApi || linkingDeviceId.value) return
  linkingDeviceId.value = deviceId
  const previous = grinders.value.find(g => String(g.extras?.runtimeDeviceId ?? '') === String(deviceId))
  const next = grinders.value.find(g => String(g.id) === String(grinderId))
  try {
    if (next && next.id !== previous?.id) {
      await grindersApi.update(next.id, {
        ...next,
        extras: { ...(next.extras ?? {}), runtimeDeviceId: deviceId },
      })
    }
    if (previous && previous.id !== next?.id) {
      const extras = { ...(previous.extras ?? {}) }
      delete extras.runtimeDeviceId
      await grindersApi.update(previous.id, { ...previous, extras })
    }
    toast?.success(next ? 'Grinder linked' : 'Grinder link removed')
  } catch {
    toast?.error('Failed to link grinder')
  } finally {
    linkingDeviceId.value = null
  }
}

async function connectGrinder(device) {
  if (busyDeviceId.value) return
  busyDeviceId.value = device.id
  const generation = ++preferenceGeneration
  try {
    await updateReaSettings({ preferredGrinderDeviceId: device.id })
    if (generation === preferenceGeneration) preferredGrinderDeviceId.value = device.id
    devices.connectDevice(device.id)
  } catch {
    toast?.error('Failed to connect grinder')
  } finally {
    busyDeviceId.value = null
  }
}

async function disconnectGrinder(device) {
  if (busyDeviceId.value) return
  busyDeviceId.value = device.id
  const generation = ++preferenceGeneration
  try {
    await updateReaSettings({ preferredGrinderDeviceId: null })
    if (generation === preferenceGeneration) preferredGrinderDeviceId.value = null
    devices.disconnectDevice(device.id)
  } catch {
    toast?.error('Failed to disconnect grinder')
  } finally {
    busyDeviceId.value = null
  }
}

function grinderCapabilities(device) {
  if (device.id !== connectedGrinder?.deviceId?.value) return ''
  const labels = {
    startStop: 'start/stop',
    grindSetting: 'grind setting',
    rpmControl: 'RPM',
  }
  return connectedGrinder.capabilities.value.map(value => labels[value] ?? value).join(', ')
}

function onScan() {
  devices.scan({ connect: true })
}

async function onTare() {
  try {
    await tareScale()
  } catch {
    // ignore
  }
}

onMounted(async () => {
  const generation = preferenceGeneration
  try {
    const preferred = (await getReaSettings())?.preferredGrinderDeviceId ?? null
    if (generation === preferenceGeneration) preferredGrinderDeviceId.value = preferred
  } catch {
    // The device inventory remains usable when gateway settings are unavailable.
  }
})
</script>

<template>
  <div class="device-tab">
    <div class="device-tab__header">
      <h3 class="device-tab__title">Connected Devices</h3>
      <button
        class="device-tab__scan-btn"
        :disabled="devices.scanning.value"
        @click="onScan"
      >
        {{ devices.scanning.value ? 'Scanning...' : 'Scan' }}
      </button>
    </div>

    <div
      v-if="errorInfo"
      class="device-tab__error"
      :class="{ 'device-tab__error--warning': errorInfo.severity === 'warning' }"
      role="alert"
    >
      <span class="device-tab__error-title">{{ errorInfo.title }}</span>
      <span v-if="errorInfo.detail" class="device-tab__error-detail">{{ errorInfo.detail }}</span>
    </div>

    <div v-if="devices.devices.value.length === 0" class="device-tab__empty">
      No devices found. Tap Scan to search.
    </div>

    <div v-else class="device-tab__list">
      <div
        v-for="device in devices.devices.value"
        :key="device.id"
        class="device-tab__device"
      >
        <div class="device-tab__device-main">
          <div class="device-tab__device-info">
            <ConnectionIndicator :connected="device.state === 'connected'" :size="10" />
            <div class="device-tab__device-details">
              <span class="device-tab__device-name">{{ device.name || 'Unknown Device' }}</span>
              <span class="device-tab__device-type">
                {{ device.type }}
                <template v-if="device.id === preferredGrinderDeviceId"> · preferred</template>
              </span>
            </div>
          </div>
          <div class="device-tab__device-actions">
            <span
              class="device-tab__device-status"
              :style="{ color: deviceStatusColor(device) }"
            >
              {{ deviceStatus(device) }}
            </span>
            <button
              v-if="device.type === 'grinder' && device.state === 'connected'"
              type="button"
              class="device-tab__device-btn"
              :disabled="busyDeviceId === device.id"
              @click="disconnectGrinder(device)"
            >
              Disconnect
            </button>
            <button
              v-else-if="device.type === 'grinder' && !['connecting', 'disconnecting'].includes(device.state)"
              type="button"
              class="device-tab__device-btn"
              :disabled="busyDeviceId === device.id || device.available === false"
              @click="connectGrinder(device)"
            >
              Connect
            </button>
          </div>
        </div>

        <div v-if="device.type === 'grinder'" class="device-tab__grinder-controls">
          <label class="device-tab__grinder-label" :for="`grinder-link-${device.id}`">Catalog grinder</label>
          <select
            :id="`grinder-link-${device.id}`"
            class="device-tab__grinder-select"
            :value="linkedGrinderId(device.id)"
            :disabled="linkingDeviceId === device.id"
            @change="linkGrinder(device.id, $event.target.value)"
          >
            <option value="">Not linked</option>
            <option v-for="grinder in grinders" :key="grinder.id" :value="grinder.id">
              {{ grinder.model }}
            </option>
          </select>
          <span v-if="grinderCapabilities(device)" class="device-tab__capabilities">
            Controls: {{ grinderCapabilities(device) }}
          </span>
        </div>
      </div>
    </div>

    <div class="device-tab__section">
      <h4 class="device-tab__section-title">Scale</h4>
      <button class="device-tab__tare-btn" @click="onTare">
        Tare Scale
      </button>
    </div>
  </div>
</template>

<style scoped>
.device-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.device-tab__header,
.device-tab__device-main,
.device-tab__device-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.device-tab__title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
}

.device-tab__scan-btn,
.device-tab__device-btn {
  min-height: 44px;
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.device-tab__scan-btn:disabled,
.device-tab__device-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  cursor: default;
}

.device-tab__device-btn {
  border: 1px solid var(--color-border);
  background: var(--color-surface-hover);
}

.device-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.device-tab__error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--color-toast-error, #c53030);
  color: var(--color-text);
}

.device-tab__error--warning {
  background: var(--color-toast-warning, #d97706);
  color: var(--color-background);
}

.device-tab__error-title {
  font-size: var(--font-md);
  font-weight: 600;
  line-height: 1.3;
}

.device-tab__error-detail {
  font-size: var(--font-sm);
  line-height: 1.3;
  opacity: 0.9;
}

.device-tab__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-tab__device {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.device-tab__device-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.device-tab__device-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.device-tab__device-name {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
}

.device-tab__device-type,
.device-tab__capabilities {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.device-tab__device-status {
  font-size: var(--font-md);
  font-weight: 600;
}

.device-tab__grinder-controls {
  display: grid;
  grid-template-columns: auto minmax(160px, 1fr);
  align-items: center;
  gap: 8px 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.device-tab__grinder-label {
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.device-tab__grinder-select {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-md);
}

.device-tab__capabilities {
  grid-column: 2;
}

.device-tab__section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.device-tab__section-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 12px;
}

.device-tab__tare-btn {
  min-height: 44px;
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.device-tab__tare-btn:active {
  opacity: 0.7;
}
</style>
