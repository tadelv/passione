import { createRouter, createWebHashHistory } from 'vue-router'
import IdlePage from '../pages/IdlePage.vue'
import EspressoPage from '../pages/EspressoPage.vue'
import SteamPage from '../pages/SteamPage.vue'
import HotWaterPage from '../pages/HotWaterPage.vue'
import FlushPage from '../pages/FlushPage.vue'

const routes = [
  { path: '/', name: 'idle', component: IdlePage },
  { path: '/espresso', name: 'espresso', component: EspressoPage },
  { path: '/steam', name: 'steam', component: SteamPage },
  { path: '/hotwater', name: 'hotwater', component: HotWaterPage },
  { path: '/flush', name: 'flush', component: FlushPage },
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
