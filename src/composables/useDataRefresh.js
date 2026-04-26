// src/composables/useDataRefresh.js
/**
 * Singleton composable that drives client-side data freshness on tab resume.
 *
 * Listens for `visibilitychange` (tab/page becomes visible) and `focus` events,
 * and increments a shared `refreshTick` ref no more than once every 30 s.
 * Consumers (useBeans, useGrinders) watch the tick and refetch silently.
 */
import { ref, readonly } from 'vue'

const THROTTLE_MS = 30_000

const refreshTick = ref(0)
let lastFiredAt = 0
let bound = false

function maybeFire() {
  if (typeof document === 'undefined') return
  if (document.visibilityState !== 'visible') return
  const now = Date.now()
  if (now - lastFiredAt < THROTTLE_MS) return
  lastFiredAt = now
  refreshTick.value++
}

function bind() {
  if (bound) return
  bound = true
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', maybeFire)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', maybeFire)
  }
}

export function useDataRefresh() {
  bind()
  return { refreshTick: readonly(refreshTick) }
}
