/**
 * Composable for managing grinder entities via the REST API.
 *
 * Provides a reactive grinder list with CRUD operations and a
 * Map-based entity cache for single-grinder lookups.
 */

import { ref, onMounted } from 'vue'
import {
  getGrinders as fetchGrinders,
  getGrinder as fetchGrinder,
  createGrinder as postGrinder,
  updateGrinder as putGrinder,
  deleteGrinder as removeGrinder,
} from '../api/rest'

const entityCache = new Map()

let _instance = null

export function useGrinders() {
  if (_instance) return _instance

  const grinders = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function refresh(params = {}) {
    loading.value = true
    error.value = null
    try {
      const data = await fetchGrinders(params)
      grinders.value = Array.isArray(data) ? data : (data?.grinders ?? [])
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  async function getById(id) {
    if (entityCache.has(id)) return entityCache.get(id)
    const data = await fetchGrinder(id)
    if (data) entityCache.set(id, data)
    return data
  }

  async function create(data) {
    const created = await postGrinder(data)
    if (created) {
      grinders.value.push(created)
      entityCache.set(created.id, created)
    }
    return created
  }

  async function update(id, data) {
    const updated = await putGrinder(id, data)
    if (updated) {
      const idx = grinders.value.findIndex(g => g.id === id)
      if (idx !== -1) grinders.value[idx] = updated
      entityCache.set(id, updated)
    }
    return updated
  }

  async function remove(id) {
    await removeGrinder(id)
    grinders.value = grinders.value.filter(g => g.id !== id)
    entityCache.delete(id)
  }

  onMounted(() => refresh())

  _instance = {
    /** Reactive list of all grinders. */
    grinders,
    /** Whether a fetch is in progress. */
    loading,
    /** Last error from an API call, or null. */
    error,
    /** Reload the grinder list from the API. */
    refresh,
    /** Fetch a single grinder by ID (cached). */
    getById,
    /** Create a new grinder. */
    create,
    /** Update an existing grinder. */
    update,
    /** Delete a grinder. */
    remove,
  }
  return _instance
}
