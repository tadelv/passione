/**
 * Pure merge of a gateway workflow response into the reactive workflow state.
 *
 * Kept dependency-free so it can be unit-tested directly under node (useWorkflow
 * itself imports the extensionless REST api that node's resolver can't follow).
 *
 * RESPONSES ARE CANONICAL. Every input here is a full workflow snapshot (GET
 * refresh or PUT echo), never a partial patch (grep-confirmed). The gateway's
 * WorkflowContext.toJson omits null fields, so a tracked scalar context key the
 * response is ABSENT means the server value is null — absence is an
 * authoritative clear, indistinguishable from an explicit own-key null.
 * Therefore omission sets the local field to null (it does NOT keep the stale
 * local association, which previously made the bean picker / editor hydration
 * re-highlight an old batch/grinder the gateway had already cleared).
 *
 * Legacy top-level fields (doseData / grinderData / coffeeData) backfill ONLY
 * keys the response context did not explicitly carry, and only while that
 * field is null after the clear, so an explicitly-cleared field is never
 * resurrected by a legacy sibling.
 *
 * The extras map keeps plain merge semantics (unknown keys survive; a key the
 * response carries — including an explicit null clear — is applied). extras is
 * NOT canonical: its null values round-trip, so it is never cleared on omission.
 */

/** Apply one tracked scalar context field: own-key presence OR absence both
 *  resolve to the server value (absence means null on a canonical echo). */
function applyCtxField(ctx, key, target) {
  target[key] = ctx[key] ?? null
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

  // Context fields from the server response — see module doc. A canonical
  // response omits null keys, so an absent tracked key clears it locally.
  if (ctx) {
    applyCtxField(ctx, 'targetDoseWeight', c)
    applyCtxField(ctx, 'targetYield', c)
    applyCtxField(ctx, 'grinderId', c)
    applyCtxField(ctx, 'grinderModel', c)
    applyCtxField(ctx, 'grinderSetting', c)
    applyCtxField(ctx, 'beanBatchId', c)
    applyCtxField(ctx, 'coffeeName', c)
    applyCtxField(ctx, 'coffeeRoaster', c)
    applyCtxField(ctx, 'finalBeverageType', c)
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
