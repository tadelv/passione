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
  // API expects { profile: { ... } }, not flat profile data
  const body = data?.profile ? data : { profile: data }
  return sendCommand('/api/v1/profiles', 'POST', body)
}

export function updateProfile(id, data) {
  // API expects { profile: { ... } }, not flat profile data
  const body = data?.profile ? data : { profile: data }
  return sendCommand(`/api/v1/profiles/${encodeURIComponent(id)}`, 'PUT', body)
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
// Shots (history)
// ---------------------------------------------------------------------------

export function getShotIds(order = 'desc') {
  return sendCommand(`/api/v1/shots/ids?order=${order}`)
}

/**
 * Fetch a paginated list of shots (without measurements).
 * Uses the proper paginated endpoint: GET /api/v1/shots?limit=N&offset=M&order=desc
 * Returns { items, total, limit, offset }.
 */
export async function getShotsPaginated(limit = 50, offset = 0, { search } = {}) {
  const params = new URLSearchParams({ limit, offset, order: 'desc' })
  if (search) params.set('search', search)
  const result = await sendCommand(`/api/v1/shots?${params}`)
  // Normalize: the endpoint returns { items, total, limit, offset }
  if (result && typeof result === 'object' && Array.isArray(result.items)) {
    return result
  }
  // Fallback for older API versions that return a plain array
  const items = Array.isArray(result) ? result : []
  return { items, total: items.length, limit, offset }
}

export async function getShots(ids) {
  if (ids && ids.length) {
    // Try batch endpoint first, fall back to individual fetches
    try {
      const result = await sendCommand(`/api/v1/shots?ids=${ids.map(encodeURIComponent).join(',')}&order=desc`)
      // Handle both paginated response shape and plain array
      const items = Array.isArray(result) ? result : (result?.items ?? [])
      if (items.length > 0) return items
    } catch { /* batch endpoint may not be available */ }

    // Fallback: fetch individually
    const results = await Promise.allSettled(ids.map(id => getShot(id)))
    return results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
  }
  return sendCommand('/api/v1/shots')
}

export async function getShot(id) {
  // Use query-param endpoint — path-based /shots/{id} fails for timestamp IDs
  // that contain colons (e.g. "2025-09-08T10:35:22.155387")
  const result = await sendCommand(`/api/v1/shots?ids=${encodeURIComponent(id)}`)
  const shots = Array.isArray(result) ? result : (result?.items ?? result?.shots ?? [])
  return shots[0] ?? null
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

export function updateWaterLevelThreshold(refillLevel) {
  return sendCommand('/api/v1/machine/waterLevels', 'POST', {
    refillLevel
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
// Presence / heartbeat
// ---------------------------------------------------------------------------

export function sendHeartbeat() {
  return sendCommand('/api/v1/machine/heartbeat', 'POST')
}

export function getPresenceSettings() {
  return sendCommand('/api/v1/presence/settings')
}

export function updatePresenceSettings(data) {
  return sendCommand('/api/v1/presence/settings', 'POST', data)
}

// ---------------------------------------------------------------------------
// Wake schedules
// ---------------------------------------------------------------------------

export function getPresenceSchedules() {
  return sendCommand('/api/v1/presence/schedules')
}

export function createPresenceSchedule(data) {
  return sendCommand('/api/v1/presence/schedules', 'POST', data)
}

export function updatePresenceSchedule(id, data) {
  return sendCommand(`/api/v1/presence/schedules/${encodeURIComponent(id)}`, 'PUT', data)
}

export function deletePresenceSchedule(id) {
  return sendCommand(`/api/v1/presence/schedules/${encodeURIComponent(id)}`, 'DELETE')
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function getDisplayState() {
  return sendCommand('/api/v1/display')
}

export function setDisplayBrightness(brightness) {
  return sendCommand('/api/v1/display/brightness', 'PUT', { brightness })
}

export function requestWakeLock() {
  return sendCommand('/api/v1/display/wakelock', 'POST')
}

export function releaseWakeLock() {
  return sendCommand('/api/v1/display/wakelock', 'DELETE')
}

// ---------------------------------------------------------------------------
// Build info
// ---------------------------------------------------------------------------

export function getBuildInfo() {
  return sendCommand('/api/v1/info')
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

// ---------------------------------------------------------------------------
// Beans
// ---------------------------------------------------------------------------

export function getBeans(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return sendCommand(`/api/v1/beans${qs ? '?' + qs : ''}`)
}

export function getBean(id) {
  return sendCommand(`/api/v1/beans/${encodeURIComponent(id)}`)
}

export function createBean(data) {
  return sendCommand('/api/v1/beans', 'POST', data)
}

export function updateBean(id, data) {
  return sendCommand(`/api/v1/beans/${encodeURIComponent(id)}`, 'PUT', data)
}

export function deleteBean(id) {
  return sendCommand(`/api/v1/beans/${encodeURIComponent(id)}`, 'DELETE')
}

// ---------------------------------------------------------------------------
// Bean Batches
// ---------------------------------------------------------------------------

export function getBeanBatches(beanId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return sendCommand(`/api/v1/beans/${encodeURIComponent(beanId)}/batches${qs ? '?' + qs : ''}`)
}

export function createBeanBatch(beanId, data) {
  return sendCommand(`/api/v1/beans/${encodeURIComponent(beanId)}/batches`, 'POST', data)
}

export function getBeanBatch(id) {
  return sendCommand(`/api/v1/bean-batches/${encodeURIComponent(id)}`)
}

export function updateBeanBatch(id, data) {
  return sendCommand(`/api/v1/bean-batches/${encodeURIComponent(id)}`, 'PUT', data)
}

export function deleteBeanBatch(id) {
  return sendCommand(`/api/v1/bean-batches/${encodeURIComponent(id)}`, 'DELETE')
}

// ---------------------------------------------------------------------------
// Grinders
// ---------------------------------------------------------------------------

export function getGrinders(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return sendCommand(`/api/v1/grinders${qs ? '?' + qs : ''}`)
}

export function getGrinder(id) {
  return sendCommand(`/api/v1/grinders/${encodeURIComponent(id)}`)
}

export function createGrinder(data) {
  return sendCommand('/api/v1/grinders', 'POST', data)
}

export function updateGrinder(id, data) {
  return sendCommand(`/api/v1/grinders/${encodeURIComponent(id)}`, 'PUT', data)
}

export function deleteGrinder(id) {
  return sendCommand(`/api/v1/grinders/${encodeURIComponent(id)}`, 'DELETE')
}
