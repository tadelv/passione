import { createRouter, createWebHashHistory } from 'vue-router'
import IdlePage from '../pages/IdlePage.vue'
import EspressoPage from '../pages/EspressoPage.vue'
import SteamPage from '../pages/SteamPage.vue'
import HotWaterPage from '../pages/HotWaterPage.vue'
import FlushPage from '../pages/FlushPage.vue'
import ProfileSelectorPage from '../pages/ProfileSelectorPage.vue'
import ProfileInfoPage from '../pages/ProfileInfoPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'
import ShotHistoryPage from '../pages/ShotHistoryPage.vue'
import ShotDetailPage from '../pages/ShotDetailPage.vue'
import PostShotReviewPage from '../pages/PostShotReviewPage.vue'
import ShotComparisonPage from '../pages/ShotComparisonPage.vue'
import ScreensaverPage from '../pages/ScreensaverPage.vue'

const routes = [
  { path: '/', name: 'idle', component: IdlePage },
  { path: '/espresso', name: 'espresso', component: EspressoPage },
  { path: '/steam', name: 'steam', component: SteamPage },
  { path: '/hotwater', name: 'hotwater', component: HotWaterPage },
  { path: '/flush', name: 'flush', component: FlushPage },
  { path: '/profiles', name: 'profiles', component: ProfileSelectorPage },
  { path: '/profile-info/:id', name: 'profile-info', component: ProfileInfoPage },
  { path: '/settings/:tab?', name: 'settings', component: SettingsPage },
  { path: '/history', name: 'history', component: ShotHistoryPage },
  { path: '/shot/:id', name: 'shot-detail', component: ShotDetailPage },
  { path: '/shot-review/:id?', name: 'shot-review', component: PostShotReviewPage },
  { path: '/shot-comparison', name: 'shot-comparison', component: ShotComparisonPage },
  { path: '/screensaver', name: 'screensaver', component: ScreensaverPage },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// P0-9: Navigation guard — 300ms debounce to prevent double-tap
let lastNavTime = 0
const NAV_DEBOUNCE_MS = 300

router.beforeEach((to, from, next) => {
  const now = Date.now()
  if (to.path === from.path) {
    next(false)
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
