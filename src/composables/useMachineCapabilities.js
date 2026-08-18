/**
 * Singleton composable for the connected machine's capability surface.
 *
 * Decaid exposes optional machine features via GET /api/v1/machine/capabilities.
 * A compatible Bengle returns the full capability set; a plain DE1 or an
 * outdated Bengle returns an empty list. Capabilities — not the model name —
 * are the contract for gating Bengle UI.
 *
 * First fetch is gated behind bootReady(); App.vue refreshes on machine
 * connect and resets on disconnect. A generation counter drops stale
 * in-flight responses so a reconnect can't be overwritten by an older reply.
 */

import { ref, readonly } from 'vue'
import { getMachineCapabilities } from '../api/rest'
import { bootReady } from './useBootReady'

let _instance = null
let _generation = 0

export function useMachineCapabilities() {
  if (_instance) return _instance

  const capabilities = ref([])
  const loaded = ref(false)

  async function refresh() {
    const gen = ++_generation
    try {
      const data = await getMachineCapabilities()
      if (gen !== _generation) return
      capabilities.value = Array.isArray(data?.capabilities) ? data.capabilities : []
    } catch {
      if (gen !== _generation) return
      capabilities.value = []
    } finally {
      if (gen === _generation) loaded.value = true
    }
  }

  function reset() {
    _generation++
    capabilities.value = []
    loaded.value = false
  }

  bootReady().then(refresh)

  _instance = {
    capabilities: readonly(capabilities),
    loaded: readonly(loaded),
    refresh,
    reset,
  }

  return _instance
}
