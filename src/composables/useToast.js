/**
 * Toast notification composable — singleton, provide/inject pattern.
 *
 * Usage in App.vue:
 *   const toast = useToast()
 *   provide('toast', toast)
 *
 * Usage in child components:
 *   const toast = inject('toast')
 *   toast.show('Profile saved', 'success')
 */

import { ref } from 'vue'

let _instance = null
let _nextId = 0

const AUTO_DISMISS_MS = 4000

export function useToast() {
  if (_instance) return _instance

  const toasts = ref([])

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   */
  function show(message, type = 'info') {
    const id = ++_nextId
    toasts.value.push({ id, message, type, visible: true })

    setTimeout(() => {
      dismiss(id)
    }, AUTO_DISMISS_MS)
  }

  function dismiss(id) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx >= 0) {
      toasts.value[idx].visible = false
      // Remove from DOM after fade-out animation
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id)
      }, 300)
    }
  }

  function success(message) { show(message, 'success') }
  function error(message) { show(message, 'error') }
  function warning(message) { show(message, 'warning') }
  function info(message) { show(message, 'info') }

  _instance = { toasts, show, dismiss, success, error, warning, info }
  return _instance
}
