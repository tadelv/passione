import { createRouter, createWebHashHistory } from 'vue-router'
import IdlePage from '../pages/IdlePage.vue'

// P6-5: Lazy-load all pages except IdlePage (landing page) for code-splitting
const EspressoPage = () => import('../pages/EspressoPage.vue')
const SteamPage = () => import('../pages/SteamPage.vue')
const HotWaterPage = () => import('../pages/HotWaterPage.vue')
const FlushPage = () => import('../pages/FlushPage.vue')
const ProfileSelectorPage = () => import('../pages/ProfileSelectorPage.vue')
const ProfileInfoPage = () => import('../pages/ProfileInfoPage.vue')
const SettingsPage = () => import('../pages/SettingsPage.vue')
const ShotHistoryPage = () => import('../pages/ShotHistoryPage.vue')
const ShotDetailPage = () => import('../pages/ShotDetailPage.vue')
const PostShotReviewPage = () => import('../pages/PostShotReviewPage.vue')
const ShotComparisonPage = () => import('../pages/ShotComparisonPage.vue')
const ScreensaverPage = () => import('../pages/ScreensaverPage.vue')
const DescalingPage = () => import('../pages/DescalingPage.vue')
const VisualizerBrowserPage = () => import('../pages/VisualizerBrowserPage.vue')
const VisualizerMultiImportPage = () => import('../pages/VisualizerMultiImportPage.vue')
const BeanInfoPage = () => import('../pages/BeanInfoPage.vue')
const ProfileEditorPage = () => import('../pages/ProfileEditorPage.vue')
const AdvancedProfileEditorPage = () => import('../pages/AdvancedProfileEditorPage.vue')
const SimpleProfileEditorPage = () => import('../pages/SimpleProfileEditorPage.vue')
const AutoFavoritesPage = () => import('../pages/AutoFavoritesPage.vue')

const routes = [
  { path: '/', name: 'idle', component: IdlePage },
  { path: '/espresso', name: 'espresso', component: EspressoPage },
  { path: '/steam', name: 'steam', component: SteamPage },
  { path: '/hotwater', name: 'hotwater', component: HotWaterPage },
  { path: '/flush', name: 'flush', component: FlushPage },
  { path: '/profiles', name: 'profiles', component: ProfileSelectorPage },
  { path: '/profile-info/:id', name: 'profile-info', component: ProfileInfoPage },
  { path: '/profile-editor/:id?', name: 'profile-editor', component: ProfileEditorPage },
  { path: '/advanced-editor/:id?', name: 'advanced-editor', component: AdvancedProfileEditorPage },
  { path: '/settings/:tab?', name: 'settings', component: SettingsPage },
  { path: '/history', name: 'history', component: ShotHistoryPage },
  { path: '/shot/:id', name: 'shot-detail', component: ShotDetailPage },
  { path: '/shot-review/:id?', name: 'shot-review', component: PostShotReviewPage },
  { path: '/shot-comparison', name: 'shot-comparison', component: ShotComparisonPage },
  { path: '/screensaver', name: 'screensaver', component: ScreensaverPage },
  { path: '/descaling', name: 'descaling', component: DescalingPage },
  { path: '/visualizer-import', name: 'visualizer-import', component: VisualizerBrowserPage },
  { path: '/visualizer-multi-import', name: 'visualizer-multi-import', component: VisualizerMultiImportPage },
  { path: '/bean-info', name: 'bean-info', component: BeanInfoPage },
  { path: '/simple-editor/:id?', name: 'simple-editor', component: SimpleProfileEditorPage },
  { path: '/auto-favorites', name: 'auto-favorites', component: AutoFavoritesPage },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// P0-9: Navigation guard — 300ms debounce to prevent double-tap
// Machine-state-driven navigation (router.replace from App.vue watcher) bypasses
// the debounce via router._skipDebounce so state transitions are never swallowed.
let lastNavTime = 0
const NAV_DEBOUNCE_MS = 300

router.beforeEach((to, from, next) => {
  const now = Date.now()
  // Allow the initial navigation (START_LOCATION has no matched routes)
  if (to.path === from.path && to.fullPath === from.fullPath && from.matched.length > 0) {
    next(false)
    return
  }
  if (router._skipDebounce) {
    router._skipDebounce = false
    lastNavTime = now
    next()
    return
  }
  if (now - lastNavTime < NAV_DEBOUNCE_MS) {
    next(false)
    return
  }
  lastNavTime = now
  next()
})

export default router
