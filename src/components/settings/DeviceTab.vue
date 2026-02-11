<script setup>
import { ref, onMounted } from 'vue'
import ConnectionIndicator from '../ConnectionIndicator.vue'
import { getDevices, scanDevices, tareScale } from '../../api/rest.js'

const devices = ref([])
const scanning = ref(false)
const loading = ref(true)

async function loadDevices() {
  loading.value = true
  try {
    const result = await getDevices()
    devices.value = Array.isArray(result) ? result : (result?.devices ?? [])
  } catch {
    devices.value = []
  }
  loading.value = false
}

async function startScan() {
  scanning.value = true
  try {
    await scanDevices()
    // Refresh device list after scan
    await loadDevices()
  } catch {
    // ignore
  }
  scanning.value = false
}

async function onTare() {
  try {
    await tareScale()
  } catch {
    // ignore
  }
}

onMounted(loadDevices)

function deviceStatus(device) {
  if (device.connected) return 'Connected'
  if (device.available) return 'Available'
  return 'Disconnected'
}

function deviceStatusColor(device) {
  if (device.connected) return 'var(--color-success)'
  if (device.available) return 'var(--color-warning)'
  return 'var(--color-error)'
}
</script>

<template>
  <div class="device-tab">
    <div class="device-tab__header">
      <h3 class="device-tab__title">Connected Devices</h3>
      <button
        class="device-tab__scan-btn"
        :disabled="scanning"
        @click="startScan"
      >
        {{ scanning ? 'Scanning...' : 'Scan' }}
      </button>
    </div>

    <div v-if="loading" class="device-tab__loading">Loading devices...</div>

    <div v-else-if="devices.length === 0" class="device-tab__empty">
      No devices found. Tap Scan to search.
    </div>

    <div v-else class="device-tab__list">
      <div
        v-for="device in devices"
        :key="device.id || device.address || device.name"
        class="device-tab__device"
      >
        <div class="device-tab__device-info">
          <ConnectionIndicator :connected="!!device.connected" :size="10" />
          <div class="device-tab__device-details">
            <span class="device-tab__device-name">{{ device.name || 'Unknown Device' }}</span>
            <span class="device-tab__device-type">{{ device.type || device.deviceType || '' }}</span>
          </div>
        </div>
        <span
          class="device-tab__device-status"
          :style="{ color: deviceStatusColor(device) }"
        >
          {{ deviceStatus(device) }}
        </span>
      </div>
    </div>

    <!-- Scale controls -->
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

.device-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.device-tab__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.device-tab__scan-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.device-tab__scan-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.device-tab__loading,
.device-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.device-tab__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-tab__device {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.device-tab__device-type {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.device-tab__device-status {
  font-size: 14px;
  font-weight: 600;
}

.device-tab__section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.device-tab__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 12px;
}

.device-tab__tare-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.device-tab__tare-btn:active {
  opacity: 0.7;
}
</style>
