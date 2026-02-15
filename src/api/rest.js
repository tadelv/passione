/**
 * REST API client for Streamline-Bridge.
 *
 * All functions return parsed JSON (or null for 204 responses).
 * Errors are thrown as Error objects with the server message when available.
 */

import { GATEWAY_URL } from './gateway'

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

export async function sendCommand(endpoint, method = 'GET', body = null) {
  const options = { method }

  if (body != null) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${GATEWAY_URL}${endpoint}`, options)

  if (!response.ok) {
    let errorMsg
    try {
      const err = await response.json()
      errorMsg = err.message || err.e || `HTTP ${response.status}`
    } catch {
      errorMsg = `HTTP ${response.status}`
    }
    throw new Error(errorMsg)
  }

  if (response.status === 204) return null
  return response.json()
}

// ---------------------------------------------------------------------------
// Machine state
// ---------------------------------------------------------------------------

export function getMachineState() {
  return sendCommand('/api/v1/machine/state')
}

export function setMachineState(state) {
  return sendCommand(`/api/v1/machine/state/${state}`, 'PUT')
}

// ---------------------------------------------------------------------------
// Machine info
// ---------------------------------------------------------------------------

export function getMachineInfo() {
  return sendCommand('/api/v1/machine/info')
}

// ---------------------------------------------------------------------------
// Workflow (recommended unified API)
// ---------------------------------------------------------------------------

export function getWorkflow() {
  return sendCommand('/api/v1/workflow')
}

export function updateWorkflow(data) {
  return sendCommand('/api/v1/workflow', 'PUT', data)
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export function getProfiles(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return sendCommand(`/api/v1/profiles${qs ? '?' + qs : ''}`)
}

export function getProfile(id) {
  return sendCommand(`/api/v1/profiles/${encodeURIComponent(id)}`)
}

export function createProfile(data) {
  return sendCommand('/api/v1/profiles', 'POST', data)
}

export function updateProfile(id, data) {
  return sendCommand(`/api/v1/profiles/${encodeURIComponent(id)}`, 'PUT', data)
}

export function deleteProfile(id) {
  return sendCommand(`/api/v1/profiles/${encodeURIComponent(id)}`, 'DELETE')
}

export function setProfileVisibility(id, visibility) {
  return sendCommand(
    `/api/v1/profiles/${encodeURIComponent(id)}/visibility`,
    'PUT',
    { visibility }
  )
}

export function getProfileLineage(id) {
  return sendCommand(`/api/v1/profiles/${encodeURIComponent(id)}/lineage`)
}

export function exportProfiles(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return sendCommand(`/api/v1/profiles/export${qs ? '?' + qs : ''}`)
}

export function importProfiles(profiles) {
  return sendCommand('/api/v1/profiles/import', 'POST', profiles)
}

export function uploadProfileToMachine(profile) {
  return sendCommand('/api/v1/machine/profile', 'POST', profile)
}

// ---------------------------------------------------------------------------
// Shot settings
// ---------------------------------------------------------------------------

export function getShotSettings() {
  return sendCommand('/api/v1/machine/shotSettings')
}

export function updateShotSettings(data) {
  return sendCommand('/api/v1/machine/shotSettings', 'POST', data)
}

// ---------------------------------------------------------------------------
// Machine settings
// ---------------------------------------------------------------------------

export function getMachineSettings() {
  return sendCommand('/api/v1/machine/settings')
}

export function updateMachineSettings(data) {
  return sendCommand('/api/v1/machine/settings', 'POST', data)
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

export function tareScale() {
  return sendCommand('/api/v1/scale/tare', 'PUT')
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export function getDevices() {
  return sendCommand('/api/v1/devices')
}

export function scanDevices(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return sendCommand(`/api/v1/devices/scan${qs ? '?' + qs : ''}`)
}

export function connectDevice(deviceId) {
  return sendCommand(`/api/v1/devices/connect?deviceId=${encodeURIComponent(deviceId)}`, 'PUT')
}

// ---------------------------------------------------------------------------
// Shots (history)
// ---------------------------------------------------------------------------

export function getShotIds() {
  return sendCommand('/api/v1/shots/ids')
}

export async function getShots(ids) {
  if (ids && ids.length) {
    // Try batch endpoint first, fall back to individual fetches
    try {
      const result = await sendCommand(`/api/v1/shots?ids=${ids.map(encodeURIComponent).join(',')}`)
      if (Array.isArray(result) && result.length > 0) return result
    } catch { /* batch endpoint may not be available */ }

    // Fallback: fetch individually
    const results = await Promise.allSettled(ids.map(id => getShot(id)))
    return results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
  }
  return sendCommand('/api/v1/shots')
}

export function getShot(id) {
  return sendCommand(`/api/v1/shots/${encodeURIComponent(id)}`)
}

export function getLatestShot() {
  return sendCommand('/api/v1/shots/latest')
}

export function updateShot(id, data) {
  return sendCommand(`/api/v1/shots/${encodeURIComponent(id)}`, 'PUT', data)
}

export function deleteShot(id) {
  return sendCommand(`/api/v1/shots/${encodeURIComponent(id)}`, 'DELETE')
}

// ---------------------------------------------------------------------------
// Key-value store
// ---------------------------------------------------------------------------

export function getStoreKeys(namespace) {
  return sendCommand(`/api/v1/store/${encodeURIComponent(namespace)}`)
}

export function getStoreValue(namespace, key) {
  return sendCommand(
    `/api/v1/store/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`
  )
}

export function setStoreValue(namespace, key, data) {
  return sendCommand(
    `/api/v1/store/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`,
    'POST',
    data
  )
}

export function deleteStoreValue(namespace, key) {
  return sendCommand(
    `/api/v1/store/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`,
    'DELETE'
  )
}

// ---------------------------------------------------------------------------
// Water levels
// ---------------------------------------------------------------------------

export function updateWaterLevelThreshold(warningThresholdPercentage) {
  return sendCommand('/api/v1/machine/waterLevels', 'POST', {
    warningThresholdPercentage
  })
}

// ---------------------------------------------------------------------------
// USB charger
// ---------------------------------------------------------------------------

export function enableUsb() {
  return sendCommand('/api/v1/machine/usb/enable', 'PUT')
}

export function disableUsb() {
  return sendCommand('/api/v1/machine/usb/disable', 'PUT')
}

// ---------------------------------------------------------------------------
// REA settings (gateway-level)
// ---------------------------------------------------------------------------

export function getReaSettings() {
  return sendCommand('/api/v1/settings')
}

export function updateReaSettings(data) {
  return sendCommand('/api/v1/settings', 'POST', data)
}

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

export function getSensors() {
  return sendCommand('/api/v1/sensors')
}

export function getSensor(id) {
  return sendCommand(`/api/v1/sensors/${encodeURIComponent(id)}`)
}

export function executeSensorCommand(id, commandId, params = {}) {
  return sendCommand(
    `/api/v1/sensors/${encodeURIComponent(id)}/execute`,
    'POST',
    { commandId, params }
  )
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

export function getPlugins() {
  return sendCommand('/api/v1/plugins')
}

export function getPluginSettings(pluginId) {
  return sendCommand(`/api/v1/plugins/${encodeURIComponent(pluginId)}/settings`)
}

export function updatePluginSettings(pluginId, settings) {
  return sendCommand(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/settings`,
    'POST',
    settings
  )
}

export function callPluginEndpoint(pluginId, endpoint, method = 'GET', body = null) {
  return sendCommand(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(endpoint)}`,
    method,
    body
  )
}
