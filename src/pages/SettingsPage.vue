<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'

const route = useRoute()
const router = useRouter()

const TABS = [
  { id: 'device', label: 'Device' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'options', label: 'Options' },
  { id: 'layout', label: 'Layout' },
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'history', label: 'History' },
  { id: 'gateway', label: 'Gateway' },
  { id: 'screensaver', label: 'Screensaver' },
  { id: 'themes', label: 'Themes' },
  { id: 'about', label: 'About' },
  { id: 'accessibility', label: 'Accessibility' },
]

const currentTab = ref(0)

// Deep-link support: sync tab from route param
function syncTabFromRoute() {
  const tabParam = route.params.tab
  if (tabParam) {
    const idx = TABS.findIndex(t => t.id === tabParam)
    if (idx >= 0) currentTab.value = idx
  }
}

onMounted(syncTabFromRoute)
watch(() => route.params.tab, syncTabFromRoute)

function selectTab(index) {
  currentTab.value = index
  router.replace({ params: { tab: TABS[index].id } })
}

const tabBarRef = ref(null)

// Scroll the active tab into view
watch(currentTab, () => {
  const bar = tabBarRef.value
  if (!bar) return
  const btn = bar.children[currentTab.value]
  if (btn) {
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
})

// Lazy-load tab components
import { defineAsyncComponent } from 'vue'

const DeviceTab = defineAsyncComponent(() => import('../components/settings/DeviceTab.vue'))
const PreferencesTab = defineAsyncComponent(() => import('../components/settings/PreferencesTab.vue'))
const OptionsTab = defineAsyncComponent(() => import('../components/settings/OptionsTab.vue'))
const LayoutTab = defineAsyncComponent(() => import('../components/settings/LayoutTab.vue'))
const VisualizerTab = defineAsyncComponent(() => import('../components/settings/VisualizerTab.vue'))
const ShotHistoryTab = defineAsyncComponent(() => import('../components/settings/ShotHistoryTab.vue'))
const GatewayTab = defineAsyncComponent(() => import('../components/settings/GatewayTab.vue'))
const ScreensaverTab = defineAsyncComponent(() => import('../components/settings/ScreensaverTab.vue'))
const ThemesTab = defineAsyncComponent(() => import('../components/settings/ThemesTab.vue'))
const AboutTab = defineAsyncComponent(() => import('../components/settings/AboutTab.vue'))
const AccessibilityTab = defineAsyncComponent(() => import('../components/settings/AccessibilityTab.vue'))

const tabComponents = [
  DeviceTab, PreferencesTab, OptionsTab, LayoutTab, VisualizerTab,
  ShotHistoryTab, GatewayTab, ScreensaverTab, ThemesTab, AboutTab, AccessibilityTab,
]
</script>

<template>
  <div class="settings-page">
    <!-- Tab bar -->
    <div class="settings-page__tab-bar" ref="tabBarRef" role="tablist" aria-label="Settings tabs">
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

.settings-page__tab-bar {
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  overflow-x: auto;
  flex-shrink: 0;
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
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.settings-page__tab:active {
  transform: scale(0.96);
}

.settings-page__tab--active {
  background: var(--color-primary);
  color: #fff;
}

.settings-page__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  -webkit-overflow-scrolling: touch;
}
</style>
