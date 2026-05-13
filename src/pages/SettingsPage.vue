<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'

const route = useRoute()
const router = useRouter()

const TABS = [
  { id: 'brewing', label: 'Brewing' },
  { id: 'power', label: 'Power' },
  { id: 'water', label: 'Water' },
  { id: 'display', label: 'Display' },
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'gateway', label: 'Bridge' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'about', label: 'About' },
]

const currentTab = ref(0)

// Deep-link support: sync tab from route param
// Redirects for tabs that have been folded into other tabs. Keeps old
// deep-links (e.g. /settings/device → Bridge) working after the
// reorganization.
const TAB_REDIRECTS = {
  device: 'gateway',
  history: 'about',
  layout: 'display',
  screensaver: 'display',
  themes: 'display',
  preferences: 'brewing',
}

function syncTabFromRoute() {
  const tabParam = route.params.tab
  if (!tabParam) return
  const redirected = TAB_REDIRECTS[tabParam]
  if (redirected) {
    router.replace({ params: { tab: redirected } })
    return
  }
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
const overflowStart = ref(false)
const overflowEnd = ref(false)

function updateOverflow() {
  const bar = tabBarRef.value
  if (!bar) return
  overflowStart.value = bar.scrollLeft > 1
  overflowEnd.value = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 1
}

// Scroll the active tab into view
watch(currentTab, () => {
  const bar = tabBarRef.value
  if (!bar) return
  const btn = bar.children[currentTab.value]
  if (btn) {
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
  // scrollIntoView is async — recompute on next frame
  requestAnimationFrame(updateOverflow)
})

onMounted(() => {
  updateOverflow()
})

// Arrow-key navigation per WAI-ARIA tablist pattern. Wraps at ends.
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

// Lazy-load tab components
import { defineAsyncComponent } from 'vue'

const BrewingTab = defineAsyncComponent(() => import('../components/settings/BrewingTab.vue'))
const PowerTab = defineAsyncComponent(() => import('../components/settings/PowerTab.vue'))
const WaterTab = defineAsyncComponent(() => import('../components/settings/WaterTab.vue'))
const DisplayTab = defineAsyncComponent(() => import('../components/settings/DisplayTab.vue'))
const VisualizerTab = defineAsyncComponent(() => import('../components/settings/VisualizerTab.vue'))
const BridgeTab = defineAsyncComponent(() => import('../components/settings/BridgeTab.vue'))
const AccessibilityTab = defineAsyncComponent(() => import('../components/settings/AccessibilityTab.vue'))
const AboutTab = defineAsyncComponent(() => import('../components/settings/AboutTab.vue'))

const tabComponents = [
  BrewingTab, PowerTab, WaterTab,
  DisplayTab, VisualizerTab, BridgeTab,
  AccessibilityTab, AboutTab,
]
</script>

<template>
  <div class="settings-page">
    <!-- Tab bar -->
    <div
      class="settings-page__tab-bar-wrap"
      :class="{
        'settings-page__tab-bar-wrap--overflow-start': overflowStart,
        'settings-page__tab-bar-wrap--overflow-end': overflowEnd,
      }"
    >
      <div
        class="settings-page__tab-bar"
        ref="tabBarRef"
        role="tablist"
        aria-label="Settings tabs"
        @keydown="onTabKeydown"
        @scroll.passive="updateOverflow"
      >
        <button
          v-for="(tab, i) in TABS"
          :key="tab.id"
          class="settings-page__tab"
          :class="{ 'settings-page__tab--active': currentTab === i }"
          role="tab"
          :id="`settings-tab-${tab.id}`"
          :aria-selected="currentTab === i"
          :aria-controls="`settings-panel-${tab.id}`"
          :tabindex="currentTab === i ? 0 : -1"
          @click="selectTab(i)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Tab content -->
    <div
      class="settings-page__content"
      role="tabpanel"
      :id="`settings-panel-${TABS[currentTab].id}`"
      :aria-labelledby="`settings-tab-${TABS[currentTab].id}`"
    >
      <KeepAlive>
        <component :is="tabComponents[currentTab]" :key="TABS[currentTab].id" />
      </KeepAlive>
    </div>

    <BottomBar title="Settings" @back="router.push('/')" />
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.settings-page__tab-bar-wrap {
  position: relative;
  flex-shrink: 0;
}

.settings-page__tab-bar-wrap::before,
.settings-page__tab-bar-wrap::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 32px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 1;
}

.settings-page__tab-bar-wrap::before {
  left: 0;
  background: linear-gradient(to right, var(--color-background), transparent);
}

.settings-page__tab-bar-wrap::after {
  right: 0;
  background: linear-gradient(to left, var(--color-background), transparent);
}

.settings-page__tab-bar-wrap--overflow-start::before {
  opacity: 1;
}

.settings-page__tab-bar-wrap--overflow-end::after {
  opacity: 1;
}

.settings-page__tab-bar {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.settings-page__tab-bar::-webkit-scrollbar {
  display: none;
}

.settings-page__tab {
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

.settings-page__tab:active {
  transform: scale(0.96);
}

.settings-page__tab--active {
  background: var(--color-primary);
  color: var(--color-text);
}

.settings-page__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  -webkit-overflow-scrolling: touch;
}
</style>
