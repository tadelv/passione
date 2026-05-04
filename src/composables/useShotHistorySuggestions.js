/**
 * Singleton cache of autocomplete suggestion lists derived from the last 100
 * shots. Shared across pages so we only pay the API cost once per session.
 *
 * Sourced fields: roaster, beanBrand, beanType, grinderModel, grinderSetting,
 * barista, basketType. Pulled from a mix of normalized fields, annotations
 * extras, legacy metadata, and `workflow.context.extras` (basketType).
 *
 * Call invalidate() after a shot's annotations/context mutate so the next
 * caller remines fresh data.
 */

import { ref } from 'vue'
import { getShotIds, getShots } from '../api/rest.js'
import { normalizeShot } from './useShotNormalize'

const EMPTY = {
  roaster: [],
  beanBrand: [],
  beanType: [],
  grinderModel: [],
  grinderSetting: [],
  barista: [],
  basketType: [],
}

const suggestions = ref({ ...EMPTY })
let cache = null
let inflight = null
let generation = 0

async function load() {
  if (cache) {
    suggestions.value = cache
    return
  }
  if (inflight) {
    const myGen = generation
    const result = await inflight
    if (result && myGen === generation) suggestions.value = result
    return
  }
  const myGen = generation
  inflight = (async () => {
    try {
      const ids = await getShotIds()
      const idList = Array.isArray(ids) ? ids : (ids?.ids ?? [])
      const recentIds = idList.slice(0, 100)
      if (recentIds.length === 0) return null
      const result = await getShots(recentIds)
      const shots = Array.isArray(result) ? result : (result?.shots ?? [])

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

      const next = {
        roaster: [...sets.roaster].sort(),
        beanBrand: [...sets.beanBrand].sort(),
        beanType: [...sets.beanType].sort(),
        grinderModel: [...sets.grinderModel].sort(),
        grinderSetting: [...sets.grinderSetting].sort(),
        barista: [...sets.barista].sort(),
        basketType: [...sets.basketType].sort(),
      }
      if (myGen === generation) cache = next
      return next
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()
  const next = await inflight
  if (next) suggestions.value = next
}

function invalidate() {
  cache = null
  generation++
}

export function useShotHistorySuggestions() {
  return { suggestions, load, invalidate }
}
