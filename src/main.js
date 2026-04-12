import { createApp } from 'vue'
import './assets/theme.css'
import './assets/responsive.css'
import App from './App.vue'
import router from './router'
import i18n from './i18n'

const app = createApp(App)
app.use(router)
app.use(i18n)
app.mount('#app')

// Expose router and build-time version for E2E test navigation
if (typeof window !== 'undefined') {
  window.__vueRouter = router
  if (typeof __APP_VERSION__ !== 'undefined') {
    window.__APP_VERSION__ = __APP_VERSION__
  }
}
