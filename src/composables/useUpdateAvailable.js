/**
 * Passive update-available detector.
 *
 * Streamline-Bridge auto-updates skin files in the background (the About-tab
 * button just forces an immediate check). The running webview, however, holds
 * the OLD bundle in memory — a page reload is needed to pick up new JS/CSS.
 *
 * This composable polls `GET /skins/passione` every 12h and compares the
 * bridge-reported `version` against the baked-in `__APP_VERSION__`. A
 * mismatch means the files on disk are newer than what's running — surface a
 * reload prompt to the user.
 *
 * Singleton — the check runs app-wide for the app's lifetime; consumers just
 * read `updateAvailable` and call `reload()` / `dismiss()`.
 */
import { ref, computed } from 'vue'
import { getSkin } from '../api/rest.js'
import { useSettings } from './useSettings.js'

const SKIN_ID = 'passione'
const POLL_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12h
const FIRST_CHECK_DELAY_MS = 30 * 1000 // 30s after app start — let boot traffic settle

let _instance = null

export function useUpdateAvailable() {
  if (_instance) return _instance

  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
  const availableVersion = ref(null)
  const settingsInstance = useSettings()

  if (settingsInstance?.settings && settingsInstance.settings.dismissedUpdateVersion == null) {
    settingsInstance.settings.dismissedUpdateVersion = ''
  }

  const dismissedVersion = computed(() =>
    settingsInstance?.settings?.dismissedUpdateVersion ?? '',
  )

  const updateAvailable = computed(() => {
    const v = availableVersion.value
    if (!v) return false
    if (v === appVersion) return false
    if (v === dismissedVersion.value) return false
    return true
  })

  async function runCheck() {
    try {
      const skin = await getSkin(SKIN_ID)
      const v = skin?.version
      if (typeof v === 'string' && v.length > 0) {
        availableVersion.value = v
      }
    } catch {
      // Gateway unreachable / skin not registered yet — retry next tick.
    }
  }

  function dismiss() {
    if (!settingsInstance?.settings) return
    if (availableVersion.value) {
      settingsInstance.settings.dismissedUpdateVersion = availableVersion.value
    }
  }

  function reload() {
    const url = window.location.pathname + '?v=' + Date.now() + window.location.hash
    window.location.href = url
  }

  // Lifetime matches the app. No teardown — interval lives as long as the tab.
  setTimeout(() => {
    runCheck()
    setInterval(runCheck, POLL_INTERVAL_MS)
  }, FIRST_CHECK_DELAY_MS)

  _instance = {
    appVersion,
    availableVersion,
    updateAvailable,
    dismiss,
    reload,
    /** Test hook — run a check immediately. */
    _checkNow: runCheck,
  }
  return _instance
}
