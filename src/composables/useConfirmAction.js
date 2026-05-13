import { ref, onUnmounted } from 'vue'

/**
 * Two-tap confirm for destructive actions in-place. First call to `arm(id)`
 * marks the action as armed and starts a timeout that auto-resets. A second
 * call with the same id within the window fires `onConfirm` and resets.
 *
 * Lets settings tabs replace `window.confirm()` (which breaks dark-mode
 * immersion and triggers the WebView reload bug on Android via
 * `flutter_inappwebview`) with an inline pattern. Callers render their own
 * confirm UI from the `armedId` ref — typically a button label/style swap.
 *
 * Default timeout is 4 seconds, matching the PreferencesTab schedule-delete
 * confirm pattern.
 */
export function useConfirmAction({ timeoutMs = 4000 } = {}) {
  const armedId = ref(null)
  let timer = null

  function reset() {
    armedId.value = null
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function isArmed(id) {
    return armedId.value === id
  }

  function attempt(id, onConfirm) {
    if (armedId.value === id) {
      reset()
      onConfirm()
      return
    }
    armedId.value = id
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (armedId.value === id) armedId.value = null
      timer = null
    }, timeoutMs)
  }

  onUnmounted(reset)

  return { armedId, isArmed, attempt, reset }
}
