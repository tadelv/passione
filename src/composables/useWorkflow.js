/**
 * Composable for workflow (brewing recipe) management via REST.
 *
 * Fetches the current workflow on mount and exposes reactive state for all
 * workflow sections. The context object holds all WorkflowContext fields
 * (targetDoseWeight, targetYield, grinderModel, grinderSetting, coffeeName,
 * coffeeRoaster, beanBatchId, finalBeverageType, etc.).
 *
 * Backward-compatible accessors for doseData, grinderData, and coffeeData
 * are provided via Object.defineProperty so existing consumers continue to work.
 */

import { ref, reactive, onMounted } from 'vue'
import { getWorkflow as fetchWorkflow, updateWorkflow as putWorkflow } from '../api/rest'
import { applyWorkflowData } from './useWorkflowMerge.js'

/** Build a legacy doseData view backed by context fields. */
function makeDoseAccessor(ctx) {
  return {
    get doseIn() { return ctx.targetDoseWeight },
    set doseIn(v) { ctx.targetDoseWeight = v },
    get dose() { return ctx.targetDoseWeight },
    set dose(v) { ctx.targetDoseWeight = v },
    get doseOut() { return ctx.targetYield },
    set doseOut(v) { ctx.targetYield = v },
    get targetWeight() { return ctx.targetYield },
    set targetWeight(v) { ctx.targetYield = v },
  }
}

/** Build a legacy grinderData view backed by context fields. */
function makeGrinderAccessor(ctx) {
  return {
    get model() { return ctx.grinderModel },
    set model(v) { ctx.grinderModel = v },
    get grinder() { return ctx.grinderModel },
    set grinder(v) { ctx.grinderModel = v },
    get name() { return ctx.grinderModel },
    set name(v) { ctx.grinderModel = v },
    get setting() { return ctx.grinderSetting },
    set setting(v) { ctx.grinderSetting = v },
    get grindSetting() { return ctx.grinderSetting },
    set grindSetting(v) { ctx.grinderSetting = v },
    get manufacturer() { return null },
    set manufacturer(_v) { /* no-op, not mapped */ },
  }
}

/** Build a legacy coffeeData view backed by context fields. */
function makeCoffeeAccessor(ctx) {
  return {
    get name() { return ctx.coffeeName },
    set name(v) { ctx.coffeeName = v },
    get roaster() { return ctx.coffeeRoaster },
    set roaster(v) { ctx.coffeeRoaster = v },
  }
}

/**
 * Merge a gateway workflow response into the reactive workflow state.
 *
 * Context semantics are tri-state: a response that carries an own key — even
 * null — is applied (an explicit null is an intentional clear), while an
 * omitted key keeps the current value (partial patches). Legacy top-level
 * fields backfill ONLY keys the response context did not explicitly carry, so
 * a field the user explicitly cleared is never resurrected by a legacy sibling.
 * Logic lives in useWorkflowMerge.js so it is unit-testable under node.
 */

export function useWorkflow() {
  const loading = ref(false)
  const error = ref(null)

  const workflow = reactive({
    id: null,
    name: null,
    description: null,
    profile: null,
    context: {
      targetDoseWeight: null,
      targetYield: null,
      grinderId: null,
      grinderModel: null,
      grinderSetting: null,
      beanBatchId: null,
      coffeeName: null,
      coffeeRoaster: null,
      finalBeverageType: null,
      extras: {},
    },
    steamSettings: null,
    hotWaterData: null,
    rinseData: null,
  })

  // Backward-compatible accessors — read/write through context
  Object.defineProperty(workflow, 'doseData', {
    get() { return makeDoseAccessor(workflow.context) },
    enumerable: true,
    configurable: false,
  })
  Object.defineProperty(workflow, 'grinderData', {
    get() { return makeGrinderAccessor(workflow.context) },
    enumerable: true,
    configurable: false,
  })
  Object.defineProperty(workflow, 'coffeeData', {
    get() { return makeCoffeeAccessor(workflow.context) },
    enumerable: true,
    configurable: false,
  })

  function applyData(data) {
    applyWorkflowData(workflow, data)
  }

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

  let _readyResolve
  const ready = new Promise(resolve => { _readyResolve = resolve })

  onMounted(async () => {
    await refresh()
    _readyResolve()
  })

  return {
    workflow,
    loading,
    error,
    ready,
    refresh,
    updateWorkflow,
  }
}
