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
    if (!data) return
    workflow.id = data.id ?? workflow.id
    workflow.name = data.name ?? workflow.name
    workflow.description = data.description ?? workflow.description
    workflow.profile = data.profile ?? workflow.profile
    workflow.steamSettings = data.steamSettings ?? workflow.steamSettings
    workflow.hotWaterData = data.hotWaterData ?? workflow.hotWaterData
    workflow.rinseData = data.rinseData ?? workflow.rinseData

    // Prefer context from server response; backfill from legacy fields if needed
    const ctx = data.context
    if (ctx) {
      workflow.context.targetDoseWeight = ctx.targetDoseWeight ?? workflow.context.targetDoseWeight
      workflow.context.targetYield = ctx.targetYield ?? workflow.context.targetYield
      workflow.context.grinderId = ctx.grinderId ?? workflow.context.grinderId
      workflow.context.grinderModel = ctx.grinderModel ?? workflow.context.grinderModel
      workflow.context.grinderSetting = ctx.grinderSetting ?? workflow.context.grinderSetting
      workflow.context.beanBatchId = ctx.beanBatchId ?? workflow.context.beanBatchId
      workflow.context.coffeeName = ctx.coffeeName ?? workflow.context.coffeeName
      workflow.context.coffeeRoaster = ctx.coffeeRoaster ?? workflow.context.coffeeRoaster
      workflow.context.finalBeverageType = ctx.finalBeverageType ?? workflow.context.finalBeverageType
    }

    // Backfill from legacy fields when context fields are still null
    const dose = data.doseData
    if (dose) {
      if (workflow.context.targetDoseWeight == null) {
        workflow.context.targetDoseWeight = dose.doseIn ?? dose.dose ?? null
      }
      if (workflow.context.targetYield == null) {
        workflow.context.targetYield = dose.doseOut ?? dose.targetWeight ?? null
      }
    }

    const grinder = data.grinderData
    if (grinder) {
      if (workflow.context.grinderModel == null) {
        workflow.context.grinderModel = grinder.model ?? grinder.grinder ?? grinder.name ?? null
      }
      if (workflow.context.grinderSetting == null) {
        workflow.context.grinderSetting = grinder.setting ?? grinder.grindSetting ?? null
      }
    }

    const coffee = data.coffeeData
    if (coffee) {
      if (workflow.context.coffeeName == null) {
        workflow.context.coffeeName = coffee.name ?? null
      }
      if (workflow.context.coffeeRoaster == null) {
        workflow.context.coffeeRoaster = coffee.roaster ?? null
      }
    }
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
