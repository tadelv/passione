// src/composables/useBeanLink.js
/**
 * Bean-batch link helper used by RecipeEditor and PostShotReview.
 *
 * `selectedBeanId` and `selectedBatchId` are the canonical source of truth
 * for the link. While both are set and resolve to live bean+batch records,
 * `isLinked` is true — the consumer should render the linked bean/batch
 * records directly (read `linkedBean.name` / `linkedBean.roaster`) and
 * persist only the batchId. When unlinked, the consumer renders free-edit
 * inputs bound to the `coffeeName` / `roaster` refs.
 *
 * On `enterLinked`, the bound `coffeeName` / `roaster` refs are blanked —
 * the linked bean record is the source of truth, so keeping a redundant
 * string copy invites drift (typed text getting out of sync with the bean
 * record). Consumers read from `linkedBean` while linked.
 *
 * `linkedBean` is stored as an explicit ref (not a `beans.value.find`
 * computed) so hydration works correctly during initial app load when
 * `beans.value` may not yet be populated. The composable falls through to
 * `beansApi.getById` when the bean isn't in the local list.
 *
 * @param {object} opts
 * @param {Ref<Array>} opts.beans       Reactive bean list (from inject('beans')).
 * @param {object}     opts.beansApi    useBeans() API (from inject('beansApi')).
 * @param {Ref<string>} opts.coffeeName Bound name ref. Blanked on enterLinked.
 * @param {Ref<string>} opts.roaster    Bound roaster ref. Blanked on enterLinked.
 */
import { ref, computed } from 'vue'

export function useBeanLink({ beans, beansApi, coffeeName, roaster }) {
  const selectedBeanId = ref(null)
  const selectedBatchId = ref(null)
  const linkedBatch = ref(null)
  const linkedBeanRef = ref(null)

  // Prefer the local list (so updates from CRUD elsewhere reflect here),
  // fall back to the explicitly-fetched record when the local list hasn't
  // populated yet.
  const linkedBean = computed(() => {
    if (!selectedBeanId.value) return null
    return beans.value.find(b => b.id === selectedBeanId.value) ?? linkedBeanRef.value
  })

  const isLinked = computed(() =>
    !!selectedBeanId.value && !!selectedBatchId.value && !!linkedBean.value
  )

  /**
   * Set the link to a specific bean (and optionally a specific batch). When
   * `batchId` is omitted, the bean's active batch is auto-selected.
   *
   * Blanks the bound coffeeName/roaster refs — once linked, the bean record
   * is the source of truth and the redundant text copy must not be persisted.
   */
  async function enterLinked(beanId, batchId = null) {
    selectedBeanId.value = beanId
    coffeeName.value = ''
    roaster.value = ''
    // Resolve the bean record. Prefer the local list; fall back to API.
    const localBean = beans.value.find(b => b.id === beanId)
    if (localBean) {
      linkedBeanRef.value = localBean
    } else if (beansApi?.getById) {
      try {
        linkedBeanRef.value = await beansApi.getById(beanId)
      } catch {
        linkedBeanRef.value = null
      }
    }
    if (batchId) {
      selectedBatchId.value = batchId
      try {
        linkedBatch.value = await beansApi.getBatch(batchId)
      } catch {
        linkedBatch.value = null
      }
    } else {
      try {
        const batch = await beansApi.activeBatchForBean(beanId)
        selectedBatchId.value = batch?.id ?? null
        linkedBatch.value = batch ?? null
      } catch {
        selectedBatchId.value = null
        linkedBatch.value = null
      }
    }
  }

  function clearLink() {
    selectedBeanId.value = null
    selectedBatchId.value = null
    linkedBatch.value = null
    linkedBeanRef.value = null
    // coffeeName/roaster keep their last value — user is now free-editing.
  }

  /**
   * Hydrate the link from a workflow context (or shot record). Uses
   * `ctx.beanBatchId` as the authoritative source — text-match was the
   * source of historical drift and is intentionally not used here.
   *
   * Trusts the API: if the batch resolves and references a beanId, the
   * link is valid (even if `beans.value` hasn't loaded yet — the
   * `enterLinked` path will fetch the bean record on demand). Only an
   * actual API failure or a batch with no `beanId` clears the link.
   */
  async function hydrateFromContext(ctx) {
    if (!ctx?.beanBatchId || !beansApi) return
    try {
      const batch = await beansApi.getBatch(ctx.beanBatchId)
      if (batch?.beanId) {
        await enterLinked(batch.beanId, batch.id)
      } else {
        clearLink()
      }
    } catch {
      clearLink()
    }
  }

  return {
    selectedBeanId,
    selectedBatchId,
    linkedBean,
    linkedBatch,
    isLinked,
    enterLinked,
    clearLink,
    hydrateFromContext,
  }
}
