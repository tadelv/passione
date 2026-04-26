/**
 * Composable for coffee bean and batch management via REST.
 *
 * Singleton — same instance returned on every call. Fetches the bean list on
 * first mount and exposes reactive state plus CRUD helpers, with Map-based
 * caching for individual beans and batch queries. Subscribes to useDataRefresh;
 * silently refreshes the bean list and invalidates the batch cache when the
 * user returns focus to the app.
 */

import { ref, onMounted, watch } from 'vue'
import {
  getBeans as fetchBeans,
  getBean as fetchBean,
  createBean as postBean,
  updateBean as putBean,
  deleteBean as destroyBean,
  getBeanBatches as fetchBeanBatches,
  getBeanBatch as fetchBeanBatch,
  createBeanBatch as postBeanBatch,
  updateBeanBatch as putBeanBatch,
  deleteBeanBatch as destroyBeanBatch,
} from '../api/rest'
import { useDataRefresh } from './useDataRefresh'

let _instance = null

export function useBeans() {
  if (_instance) return _instance

  const beans = ref([])
  const loading = ref(false)
  const error = ref(null)
  const lastRefreshFailed = ref(false)

  /** Cache for individual bean entities (keyed by id). */
  const entityCache = new Map()

  /** Cache for batch list queries (keyed by `${beanId}:${JSON.stringify(params)}`). */
  const batchCache = new Map()

  // ---------------------------------------------------------------------------
  // Beans CRUD
  // ---------------------------------------------------------------------------

  /**
   * Fetch all beans, optionally with query params.
   * @param {object} [params]
   * @param {object} [opts]
   * @param {boolean} [opts.silent=false] - If true, do not flip `loading`,
   *   do not touch `error`, and preserve `beans.value` on failure
   *   (sets `lastRefreshFailed`).
   */
  async function refresh(params, opts = {}) {
    const silent = opts.silent === true
    if (!silent) {
      loading.value = true
      error.value = null
    }
    try {
      const data = await fetchBeans(params)
      beans.value = Array.isArray(data) ? data : (data?.beans ?? [])
      lastRefreshFailed.value = false
    } catch (e) {
      if (silent) {
        lastRefreshFailed.value = true
      } else {
        error.value = e.message || String(e)
        lastRefreshFailed.value = true
      }
    } finally {
      if (!silent) loading.value = false
    }
  }

  /** Fetch a single bean by id. Uses cache when available. */
  async function getById(id) {
    if (entityCache.has(id)) return entityCache.get(id)
    loading.value = true
    error.value = null
    try {
      const data = await fetchBean(id)
      entityCache.set(id, data)
      return data
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Create a new bean. Appends to the reactive list. */
  async function create(data) {
    loading.value = true
    error.value = null
    try {
      const created = await postBean(data)
      beans.value.push(created)
      entityCache.set(created.id, created)
      return created
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Update an existing bean. Syncs list and cache. */
  async function update(id, data) {
    loading.value = true
    error.value = null
    try {
      const updated = await putBean(id, data)
      const idx = beans.value.findIndex((b) => b.id === id)
      if (idx !== -1) beans.value[idx] = updated
      entityCache.set(id, updated)
      return updated
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Delete a bean. Removes from list and cache. */
  async function remove(id) {
    loading.value = true
    error.value = null
    try {
      await destroyBean(id)
      beans.value = beans.value.filter((b) => b.id !== id)
      entityCache.delete(id)
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // ---------------------------------------------------------------------------
  // Batches
  // ---------------------------------------------------------------------------

  /** Fetch batches for a bean. Results are cached by beanId + params. */
  async function getBatches(beanId, params) {
    const cacheKey = `${beanId}:${JSON.stringify(params)}`
    if (batchCache.has(cacheKey)) return batchCache.get(cacheKey)
    loading.value = true
    error.value = null
    try {
      const data = await fetchBeanBatches(beanId, params)
      const batches = Array.isArray(data) ? data : (data?.batches ?? [])
      batchCache.set(cacheKey, batches)
      return batches
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Fetch a single batch by id. */
  async function getBatch(id) {
    loading.value = true
    error.value = null
    try {
      return await fetchBeanBatch(id)
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Create a batch for a bean. Invalidates batch cache for that bean. */
  async function createBatch(beanId, data) {
    loading.value = true
    error.value = null
    try {
      const created = await postBeanBatch(beanId, data)
      // Invalidate all cached batch queries for this bean
      for (const key of batchCache.keys()) {
        if (key.startsWith(`${beanId}:`)) batchCache.delete(key)
      }
      return created
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Update a batch. */
  async function updateBatch(id, data) {
    loading.value = true
    error.value = null
    try {
      return await putBeanBatch(id, data)
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Delete a batch. */
  async function removeBatch(id) {
    loading.value = true
    error.value = null
    try {
      await destroyBeanBatch(id)
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Return the most recent active batch for a bean — i.e. non-frozen,
   * non-archived, sorted by roastDate (or createdAt) descending.
   */
  async function activeBatchForBean(beanId) {
    const batches = await getBatches(beanId)
    const active = batches.filter(
      (b) => !b.frozen && !b.archived
    )
    active.sort((a, b) => {
      const dateA = a.roastDate || a.createdAt || ''
      const dateB = b.roastDate || b.createdAt || ''
      return dateB.localeCompare(dateA)
    })
    return active[0] ?? null
  }

  onMounted(refresh)

  // Subscribe to global resume tick: silent refresh + invalidate batch cache.
  const { refreshTick } = useDataRefresh()
  watch(refreshTick, async () => {
    if (refreshTick.value === 0) return
    await refresh(undefined, { silent: true })
    batchCache.clear()
  })

  _instance = {
    beans,
    loading,
    error,
    lastRefreshFailed,
    refresh,
    getById,
    create,
    update,
    remove,
    getBatches,
    getBatch,
    createBatch,
    updateBatch,
    removeBatch,
    activeBatchForBean,
    refreshTick,
  }
  return _instance
}
