<script setup>
/**
 * BeanPickerPopup — Quick coffee swap for the IdlePage shot plan.
 *
 * Lists beans from useBeans() and, on select, updates the live workflow's
 * context: writes `beanBatchId` (pointing at the bean's active batch) plus
 * the denormalized `coffeeName` / `coffeeRoaster`. The denormalization
 * matches `RecipeEditorPage.buildWorkflowUpdate` — downstream views (shot
 * plan, screensaver, last-shot card) read the text directly without
 * resolving the batch id.
 *
 * Does NOT mutate the selected recipe. The "modified dot" on the recipe
 * pill will appear if the new coffee diverges from the saved recipe.
 */
import { ref, computed, inject, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Currently selected batch id in the workflow (for highlighting). */
  currentBatchId: { type: String, default: null },
})

const emit = defineEmits(['close'])

const { t } = useI18n()
const router = useRouter()

const beans = inject('beans', ref([]))
const beansApi = inject('beansApi', null)
const updateWorkflow = inject('updateWorkflow', null)
const toast = inject('toast', null)

const busyId = ref(null)

// Map of beanId -> active batch id, lazily filled as the popup opens. We
// resolve active batches up-front so the row can show "no batch" affordance
// and so highlighting against currentBatchId works.
const activeBatches = ref({})

async function ensureActiveBatches() {
  if (!beansApi) return
  const promises = beans.value.map(async (b) => {
    if (activeBatches.value[b.id] !== undefined) return
    try {
      const batch = await beansApi.activeBatchForBean(b.id)
      activeBatches.value[b.id] = batch?.id ?? null
    } catch {
      activeBatches.value[b.id] = null
    }
  })
  await Promise.all(promises)
}

// Trigger batch resolution whenever the popup becomes visible.
watch(() => props.visible, (v) => {
  if (v) ensureActiveBatches()
})

const sortedBeans = computed(() => {
  return [...beans.value].sort((a, b) => {
    const an = (a.name || '').toLowerCase()
    const bn = (b.name || '').toLowerCase()
    return an.localeCompare(bn)
  })
})

async function pick(bean) {
  if (!updateWorkflow) return
  busyId.value = bean.id
  try {
    const batchId = activeBatches.value[bean.id] ?? null
    const update = {
      context: {
        coffeeName: bean.name ?? null,
        coffeeRoaster: bean.roaster ?? null,
        beanBatchId: batchId ? String(batchId) : null,
      },
    }
    await updateWorkflow(update)
    toast?.success(bean.name ? `Coffee set to ${bean.name}` : 'Coffee updated')
    emit('close')
  } catch {
    toast?.error('Failed to set coffee')
  } finally {
    busyId.value = null
  }
}

async function clearCoffee() {
  if (!updateWorkflow) return
  busyId.value = '__clear__'
  try {
    await updateWorkflow({
      context: { coffeeName: null, coffeeRoaster: null, beanBatchId: null },
    })
    toast?.success('Coffee cleared')
    emit('close')
  } catch {
    toast?.error('Failed to clear coffee')
  } finally {
    busyId.value = null
  }
}

function goToCatalog() {
  emit('close')
  router.push('/catalog/beans')
}

function onClose() {
  emit('close')
}
</script>

<template>
  <Transition name="popup-fade">
    <div
      v-if="visible"
      class="bean-picker"
      role="dialog"
      aria-modal="true"
      :aria-label="t('idle.pickCoffee') || 'Pick coffee'"
      @click.self="onClose"
      @keydown.esc="onClose"
    >
      <div class="bean-picker__card">
        <div class="bean-picker__header">
          <span class="bean-picker__title">{{ t('idle.pickCoffee') || 'Pick coffee' }}</span>
          <button class="bean-picker__close" @click="onClose" aria-label="Close">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="bean-picker__body">
          <ul v-if="sortedBeans.length" class="bean-picker__list" role="listbox">
            <li
              v-for="bean in sortedBeans"
              :key="bean.id"
              :class="['bean-picker__row', { 'bean-picker__row--selected': activeBatches[bean.id] && currentBatchId === String(activeBatches[bean.id]) }]"
              role="option"
              :aria-selected="activeBatches[bean.id] && currentBatchId === String(activeBatches[bean.id])"
              @click="pick(bean)"
            >
              <div class="bean-picker__row-main">
                <span class="bean-picker__row-name">{{ bean.name || '(unnamed)' }}</span>
                <span v-if="bean.roaster" class="bean-picker__row-roaster">{{ bean.roaster }}</span>
              </div>
              <span v-if="activeBatches[bean.id] === null" class="bean-picker__row-warn">no active batch</span>
              <span v-if="busyId === bean.id" class="bean-picker__row-busy">…</span>
            </li>
          </ul>
          <div v-else class="bean-picker__empty">
            <span>{{ t('idle.noBeans') || 'No beans yet.' }}</span>
            <button class="bean-picker__link-btn" @click="goToCatalog">
              {{ t('idle.openCatalog') || 'Open catalog' }}
            </button>
          </div>
        </div>

        <div class="bean-picker__actions">
          <button class="bean-picker__btn bean-picker__btn--ghost" :disabled="busyId === '__clear__'" @click="clearCoffee">
            {{ t('idle.clearCoffee') || 'Clear' }}
          </button>
          <button class="bean-picker__btn bean-picker__btn--done" @click="onClose">
            {{ t('recipe.done') || 'Done' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bean-picker {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-modal);
  background: var(--color-overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
}

.bean-picker__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  width: 90%;
  max-width: 460px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bean-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px;
}

.bean-picker__title {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
}

.bean-picker__close {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  -webkit-tap-highlight-color: transparent;
}

.bean-picker__close:active {
  background: var(--color-surface-pressed);
}

.bean-picker__body {
  padding: 4px 8px 8px;
  overflow-y: auto;
}

.bean-picker__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bean-picker__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  min-height: 56px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--color-text);
  -webkit-tap-highlight-color: transparent;
}

.bean-picker__row:active {
  background: var(--color-surface-pressed);
}

.bean-picker__row--selected {
  background: var(--color-surface-pressed);
  outline: 1px solid var(--color-primary);
}

.bean-picker__row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.bean-picker__row-name {
  font-size: var(--font-body);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bean-picker__row-roaster {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bean-picker__row-warn {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

.bean-picker__row-busy {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
}

.bean-picker__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 16px;
  color: var(--color-text-secondary);
}

.bean-picker__link-btn {
  background: transparent;
  border: 1px solid var(--color-primary);
  color: var(--color-primary);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bean-picker__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 16px;
  gap: 8px;
}

.bean-picker__btn {
  height: 44px;
  padding: 0 24px;
  border-radius: 10px;
  border: none;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bean-picker__btn:active {
  filter: brightness(0.85);
}

.bean-picker__btn--done {
  background: var(--color-primary);
  color: var(--color-text);
}

.bean-picker__btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border, var(--color-text-secondary));
}

.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: opacity 0.15s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
}
</style>
