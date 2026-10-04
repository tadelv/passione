/**
 * Shot-history suggestion mining — pure helper (issue: autocomplete payload).
 *
 * Deliberately dependency-free apart from the pure `normalizeShot`, so it
 * unit-tests cleanly under `node --test` — the same pattern as scaleFrame.js
 * and weatherModel.js. The fetching/caching layer lives in
 * useShotHistorySuggestions.js (it needs the REST client, which is not
 * importable outside the browser).
 */

import { normalizeShot } from './useShotNormalize.js'

/**
 * Mine the seven autocomplete suggestion lists from a batch of shot records.
 *
 * Measurement-independent by contract: none of the seven returned lists reads
 * `measurements`. They are built from `annotations` (or legacy `metadata`),
 * `workflow.context`, and the normalized shot fields, so summary records from
 * the paginated endpoint produce exactly the same lists as full records. (The
 * underlying normalizeShot does consult `measurements` for `finalWeight` and
 * `duration`, but neither of those feeds a suggestion list.) That is what lets
 * the caller use the paginated endpoint instead of pulling the per-sample
 * telemetry array for 100 shots — measured at ~13 MB of JSON for 100 x 30 s
 * shots, discarded immediately afterwards.
 *
 * Returns null when there is nothing to mine.
 */
export function mineSuggestions(shots) {
  if (!Array.isArray(shots) || shots.length === 0) return null

  const sets = {
    roaster: new Set(),
    beanBrand: new Set(),
    beanType: new Set(),
    grinderModel: new Set(),
    grinderSetting: new Set(),
    barista: new Set(),
    basketType: new Set(),
  }

  for (const raw of shots) {
    if (!raw) continue
    const n = normalizeShot(raw)
    const extras = raw.annotations?.extras ?? {}
    const meta = raw.metadata ?? {}
    if (n.coffeeRoaster) sets.roaster.add(n.coffeeRoaster)
    const beanBrandVal = extras.beanBrand ?? meta.beanBrand
    if (beanBrandVal) sets.beanBrand.add(beanBrandVal)
    if (n.coffeeName) sets.beanType.add(n.coffeeName)
    if (n.grinderModel) sets.grinderModel.add(n.grinderModel)
    if (n.grinderSetting != null) sets.grinderSetting.add(String(n.grinderSetting))
    const baristaVal = extras.barista ?? meta.barista
    if (baristaVal) sets.barista.add(baristaVal)
    const basketTypeVal = raw.workflow?.context?.extras?.basketType
    if (basketTypeVal) sets.basketType.add(basketTypeVal)
  }

  return {
    roaster: [...sets.roaster].sort(),
    beanBrand: [...sets.beanBrand].sort(),
    beanType: [...sets.beanType].sort(),
    grinderModel: [...sets.grinderModel].sort(),
    grinderSetting: [...sets.grinderSetting].sort(),
    barista: [...sets.barista].sort(),
    basketType: [...sets.basketType].sort(),
  }
}
