/**
 * Connection error surfacing — consumes the structured
 * `connectionStatus.error` payload from `ws/v1/devices` (useDevices) and
 * drives toasts + a persistent banner for sticky error kinds.
 *
 * See `vendor/reaprime/doc/Skins.md` §10 for the full taxonomy.
 *
 * Usage (in App.vue):
 *   const connErr = useConnectionError({
 *     connectionError: devices.connectionError,
 *     toast,
 *     t,
 *     onRetryScan: () => devices.scan({ connect: true }),
 *   })
 *   // connErr.bannerError → reactive error object to render (or null)
 *   // connErr.dismiss()   → user-dismiss of the current banner
 */
import { ref, computed, watch } from 'vue'

export const STICKY_KINDS = new Set([
  'adapterOff',
  'bluetoothPermissionDenied',
  'scanFailed',
])

export const TRANSIENT_KINDS = new Set([
  'scaleConnectFailed',
  'machineConnectFailed',
  'scaleDisconnected',
  'machineDisconnected',
])

const I18N_BASE = 'connErr'

function i18nOrFallback(t, key, fallback) {
  const resolved = t(key)
  return resolved === key ? fallback : resolved
}

/** Localized message for a ConnectionError, with gateway fallback. */
export function describeError(err, t) {
  if (!err) return { title: '', detail: '' }
  const title = i18nOrFallback(
    t,
    `${I18N_BASE}.${err.kind}.title`,
    err.message ?? err.kind,
  )
  const suggestion = i18nOrFallback(
    t,
    `${I18N_BASE}.${err.kind}.suggestion`,
    err.suggestion ?? '',
  )
  return { title, detail: suggestion }
}

export function useConnectionError({ connectionError, toast, t, onRetryScan }) {
  // User-dismissed banner timestamps — one error "identity" at a time.
  const dismissedTimestamp = ref(null)
  // Last toast we emitted, so we don't double-fire on re-render or identical
  // repeats. Identity is the `timestamp` field from the gateway.
  let lastToastedTimestamp = null

  watch(
    connectionError,
    (err) => {
      if (!err) return
      if (err.timestamp === lastToastedTimestamp) return
      lastToastedTimestamp = err.timestamp

      // New error identity → user should see it again even if previously dismissed.
      dismissedTimestamp.value = null

      const { title, detail } = describeError(err, t)
      const message = detail ? `${title} — ${detail}` : title
      const type = err.severity === 'warning' ? 'warning' : 'error'
      toast.show(message, type)
    },
    { immediate: true },
  )

  const bannerError = computed(() => {
    const err = connectionError.value
    if (!err) return null
    if (!STICKY_KINDS.has(err.kind)) return null
    if (dismissedTimestamp.value === err.timestamp) return null
    return err
  })

  const bannerAction = computed(() => {
    const err = bannerError.value
    if (!err) return null
    // `scanFailed` is the only sticky kind we can auto-resolve from the skin.
    // `adapterOff` and `bluetoothPermissionDenied` need user action in OS.
    if (err.kind === 'scanFailed') {
      return {
        labelKey: `${I18N_BASE}.scanFailed.action`,
        run: () => onRetryScan?.(),
      }
    }
    return null
  })

  function dismiss() {
    const err = connectionError.value
    if (err) dismissedTimestamp.value = err.timestamp
  }

  return { bannerError, bannerAction, dismiss }
}
