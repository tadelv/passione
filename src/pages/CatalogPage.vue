<script setup>
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'

const route = useRoute()
const router = useRouter()

const TABS = [
  { id: 'beans', label: 'Beans' },
  { id: 'grinders', label: 'Grinders' },
]

const BeansTab = defineAsyncComponent(() => import('../components/settings/BeansTab.vue'))
const GrindersTab = defineAsyncComponent(() => import('../components/settings/GrindersTab.vue'))

const tabComponents = [BeansTab, GrindersTab]

const currentTab = ref(0)

function syncTabFromRoute() {
  const tabParam = route.params.tab
  if (!tabParam) return
  const idx = TABS.findIndex(t => t.id === tabParam)
  if (idx >= 0) currentTab.value = idx
}

onMounted(syncTabFromRoute)
watch(() => route.params.tab, syncTabFromRoute)

function selectTab(index, opts = {}) {
  currentTab.value = index
  router.replace({ params: { tab: TABS[index].id } })
  if (opts.focus) {
    const bar = tabBarRef.value
    const btn = bar?.children?.[index]
    btn?.focus?.()
  }
}

const tabBarRef = ref(null)

function onTabKeydown(e) {
  const last = TABS.length - 1
  let next = currentTab.value
  switch (e.key) {
    case 'ArrowRight':
      next = currentTab.value >= last ? 0 : currentTab.value + 1
      break
    case 'ArrowLeft':
      next = currentTab.value <= 0 ? last : currentTab.value - 1
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = last
      break
    default:
      return
  }
  e.preventDefault()
  selectTab(next, { focus: true })
}
</script>

<template>
  <div class="catalog-page">
    <div class="catalog-page__tab-bar-wrap">
      <div
        class="catalog-page__tab-bar"
        ref="tabBarRef"
        role="tablist"
        aria-label="Catalog sections"
        @keydown="onTabKeydown"
      >
        <button
          v-for="(tab, i) in TABS"
          :key="tab.id"
          class="catalog-page__tab"
          :class="{ 'catalog-page__tab--active': currentTab === i }"
          role="tab"
          :id="`catalog-tab-${tab.id}`"
          :aria-selected="currentTab === i"
          :aria-controls="`catalog-panel-${tab.id}`"
          :tabindex="currentTab === i ? 0 : -1"
          @click="selectTab(i)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div
      class="catalog-page__content"
      role="tabpanel"
      :id="`catalog-panel-${TABS[currentTab].id}`"
      :aria-labelledby="`catalog-tab-${TABS[currentTab].id}`"
    >
      <KeepAlive>
        <component :is="tabComponents[currentTab]" :key="TABS[currentTab].id" />
      </KeepAlive>
    </div>

    <BottomBar title="Catalog" @back="router.push('/')" />
  </div>
</template>

<style scoped>
.catalog-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.catalog-page__tab-bar-wrap {
  flex-shrink: 0;
}

.catalog-page__tab-bar {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.catalog-page__tab-bar::-webkit-scrollbar {
  display: none;
}

.catalog-page__tab {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.catalog-page__tab:active {
  transform: scale(0.96);
}

.catalog-page__tab--active {
  background: var(--color-primary);
  color: var(--color-text);
}

.catalog-page__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  -webkit-overflow-scrolling: touch;
}
</style>
