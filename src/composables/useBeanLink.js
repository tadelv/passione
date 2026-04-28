// src/composables/useBeanLink.js
/**
 * Bean-batch link helper used by RecipeEditor and PostShotReview.
 *
 * `selectedBeanId` and `selectedBatchId` are the canonical source of truth
 * for the link. While both are set and resolve to live bean+batch records,
 * `isLinked` is true — the consumer should render bound text refs
 * (`coffeeName`, `roaster`) read-only and trust the bean/batch records for
 * display. When unlinked, the consumer renders free-edit inputs.
 *
 * The watcher inside this composable keeps the bound `coffeeName` /
 * `roaster` refs pegged to the linked bean's values for as long as the
 * link is live, eliminating the drift class of bugs (typed text getting
 * out of sync with the linked bean record).
 *
 * @param {object} opts
 * @param {Ref<Array>} opts.beans       Reactive bean list (from inject('beans')).
 * @param {object}     opts.beansApi    useBeans() API (from inject('beansApi')).
 * @param {Ref<string>} opts.coffeeName Bound name ref. Updated when entering/exiting link.
 * @param {Ref<string>} opts.roaster    Bound roaster ref.
 */
import { ref, computed, watch } from 'vue'

export function useBeanLink({ beans, beansApi, coffeeName, roaster }) {
  const selectedBeanId = ref(null)
  const selectedBatchId = ref(null)
  const linkedBatch = ref(null)

  const linkedBean = computed(() =>
    selectedBeanId.value ? beans.value.find(b => b.id === selectedBeanId.value) : null
  )

  const isLinked = computed(() =>
    !!selectedBeanId.value && !!selectedBatchId.value && !!linkedBean.value
  )

  // While linked, force coffeeName/roaster to mirror the bean record.
  watch([linkedBean, isLinked], ([bean, linked]) => {
    if (linked && bean) {
      coffeeName.value = bean.name ?? ''
      roaster.value = bean.roaster ?? ''
    }
  }, { immediate: true })

  /**
   * Set the link to a specific bean (and optionally a specific batch). When
   * `batchId` is omitted, the bean's active batch is auto-selected.
   */
  async function enterLinked(beanId, batchId = null) {
    selectedBeanId.value = beanId
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
    // coffeeName/roaster keep their last value — user is now free-editing.
  }

  /**
   * Hydrate the link from a workflow context (or shot record). Uses
   * `ctx.beanBatchId` as the authoritative source — text-match was the
   * source of historical drift and is intentionally not used here.
   */
  async function hydrateFromContext(ctx) {
    if (!ctx?.beanBatchId || !beansApi) return
    try {
      const batch = await beansApi.getBatch(ctx.beanBatchId)
      if (batch?.beanId && beans.value.find(b => b.id === batch.beanId)) {
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
