/**
 * Composable for workflow (brewing recipe) management via REST.
 *
 * Fetches the current workflow on mount and exposes reactive state for all
 * workflow sections. Provides updateWorkflow() for partial or full updates.
 */

import { ref, reactive, onMounted } from 'vue'
import { getWorkflow as fetchWorkflow, updateWorkflow as putWorkflow } from '../api/rest'

export function useWorkflow() {
  const loading = ref(false)
  const error = ref(null)

  const workflow = reactive({
    id: null,
    name: null,
    description: null,
    profile: null,
    doseData: null,
    grinderData: null,
    coffeeData: null,
    steamSettings: null,
    hotWaterData: null,
    rinseData: null,
  })

  function applyData(data) {
    if (!data) return
    workflow.id = data.id ?? workflow.id
    workflow.name = data.name ?? workflow.name
    workflow.description = data.description ?? workflow.description
    workflow.profile = data.profile ?? workflow.profile
    workflow.doseData = data.doseData ?? workflow.doseData
    workflow.grinderData = data.grinderData ?? workflow.grinderData
    workflow.coffeeData = data.coffeeData ?? workflow.coffeeData
    workflow.steamSettings = data.steamSettings ?? workflow.steamSettings
    workflow.hotWaterData = data.hotWaterData ?? workflow.hotWaterData
    workflow.rinseData = data.rinseData ?? workflow.rinseData
  }

  /** Fetch the current workflow from the gateway. */
  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const data = await fetchWorkflow()
      applyData(data)
    } catch (e) {
      error.value = e.message || String(e)
    } finally {
      loading.value = false
    }
  }

  /**
   * Send a partial or full workflow update.
   * Returns the complete updated workflow from the server.
   */
  async function updateWorkflow(partial) {
    loading.value = true
    error.value = null
    try {
      const data = await putWorkflow(partial)
      applyData(data)
      return data
    } catch (e) {
      error.value = e.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  onMounted(refresh)

  return {
    workflow,
    loading,
    error,
    refresh,
    updateWorkflow,
  }
}
