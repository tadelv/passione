/**
 * Pure merge of a gateway workflow response into the reactive workflow state.
 *
 * Kept dependency-free so it can be unit-tested directly under node (useWorkflow
 * itself imports the extensionless REST api that node's resolver can't follow).
 *
 * Context semantics are tri-state: a response that carries an own key — even
 * null — is applied (an explicit null is an intentional clear), while an
 * omitted key keeps the current value (partial patches). Legacy top-level
 * fields (doseData / grinderData / coffeeData) backfill ONLY keys the response
 * context did not explicitly carry, so a field the user explicitly cleared is
 * never resurrected by a legacy sibling.
 */

/** Apply a single context field: own-key presence wins (value may be null). */
function applyCtxField(ctx, key, inCtx, target) {
  if (inCtx.has(key)) target[key] = ctx[key] ?? null
}

export function applyWorkflowData(wf, data) {
  if (!data || !wf) return
  wf.id = data.id ?? wf.id
  wf.name = data.name ?? wf.name
  wf.description = data.description ?? wf.description
  wf.profile = data.profile ?? wf.profile
  wf.steamSettings = data.steamSettings ?? wf.steamSettings
  wf.hotWaterData = data.hotWaterData ?? wf.hotWaterData
  wf.rinseData = data.rinseData ?? wf.rinseData

  const ctx = data.context
  const inCtx = ctx && typeof ctx === 'object' ? new Set(Object.keys(ctx)) : new Set()
  const c = wf.context

  // Context fields from the server response — see module doc for tri-state.
  if (ctx) {
    applyCtxField(ctx, 'targetDoseWeight', inCtx, c)
    applyCtxField(ctx, 'targetYield', inCtx, c)
    applyCtxField(ctx, 'grinderId', inCtx, c)
    applyCtxField(ctx, 'grinderModel', inCtx, c)
    applyCtxField(ctx, 'grinderSetting', inCtx, c)
    applyCtxField(ctx, 'beanBatchId', inCtx, c)
    applyCtxField(ctx, 'coffeeName', inCtx, c)
    applyCtxField(ctx, 'coffeeRoaster', inCtx, c)
    applyCtxField(ctx, 'finalBeverageType', inCtx, c)
    if (ctx.extras && typeof ctx.extras === 'object') {
      // Merge extras: unknown keys in the current state survive; keys the
      // response carries (including null clears) are applied.
      c.extras = { ...(c.extras ?? {}), ...ctx.extras }
    }
  }

  // Legacy backfill ONLY for keys the context response did not explicitly carry.
  const dose = data.doseData
  if (dose && !inCtx.has('targetDoseWeight') && c.targetDoseWeight == null) {
    c.targetDoseWeight = dose.doseIn ?? dose.dose ?? null
  }
  if (dose && !inCtx.has('targetYield') && c.targetYield == null) {
    c.targetYield = dose.doseOut ?? dose.targetWeight ?? null
  }

  const grinder = data.grinderData
  if (grinder && !inCtx.has('grinderModel') && c.grinderModel == null) {
    c.grinderModel = grinder.model ?? grinder.grinder ?? grinder.name ?? null
  }
  if (grinder && !inCtx.has('grinderSetting') && c.grinderSetting == null) {
    c.grinderSetting = grinder.setting ?? grinder.grindSetting ?? null
  }

  const coffee = data.coffeeData
  if (coffee && !inCtx.has('coffeeName') && c.coffeeName == null) {
    c.coffeeName = coffee.name ?? null
  }
  if (coffee && !inCtx.has('coffeeRoaster') && c.coffeeRoaster == null) {
    c.coffeeRoaster = coffee.roaster ?? null
  }
}
