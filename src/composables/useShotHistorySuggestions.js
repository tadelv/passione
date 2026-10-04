/**
 * Singleton cache of autocomplete suggestion lists derived from the last 100
 * shots. Shared across pages so we only pay the API cost once per session.
 *
 * Sourced fields: roaster, beanBrand, beanType, grinderModel, grinderSetting,
 * barista, basketType. Pulled from a mix of normalized fields, annotations
 * extras, legacy metadata, and `workflow.context.extras` (basketType).
 *
 * Fetched through the paginated endpoint, which the gateway serves without the
 * per-sample `measurements` array (`ShotRecord.toJsonWithoutMeasurements`).
 * Every field above lives in `workflow` / `annotations` / `metadata`, so the
 * mining is measurement-independent — see mineSuggestions(). Requesting the
 * same 100 shots by id instead pulls FULL records: measured at ~13 MB of JSON
 * and a +14 MB transient heap for 100 x 30 s shots, in order to produce seven
 * short string lists.
 *
 * Call invalidate() after a shot's annotations/context mutate so the next
 * caller remines fresh data.
 */

import { ref } from 'vue'
import { getShotsPaginated } from '../api/rest.js'
import { mineSuggestions } from './shotSuggestions.js'

/** How many recent shots to mine. */
const SUGGESTION_SAMPLE_SIZE = 100

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
      // Paginated summaries carry workflow + annotations + metadata but omit
      // the per-sample measurements array — which is all the mining needs.
      const result = await getShotsPaginated(SUGGESTION_SAMPLE_SIZE, 0)
      const next = mineSuggestions(result?.items)
      if (!next) return null
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
