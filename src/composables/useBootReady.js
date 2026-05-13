/**
 * Boot-quiet coordination — non-critical work waits for the machine WS to
 * deliver its first snapshot before firing.
 *
 * On the Teclast host, Wi-Fi and BLE share the same radio. The cold-start
 * burst of REST + WS handshakes from the app starves GATT timing and the
 * machine connection drops mid-pair. Gating opt-in work (last-shot card,
 * beans/grinders refresh, presence sync, update poll, etc.) behind the
 * first WS frame guarantees the BLE handshake has had its chance before
 * we add HTTP load.
 *
 * The first composable that calls `setBootReadyTrigger(promise)` installs
 * the resolution source — in practice that is `useMachine.firstFrame`.
 * Consumers `await bootReady()` to block until then. If nothing installs a
 * trigger (tests, headless builds), `bootReady()` resolves on the next
 * macrotask so consumers never deadlock.
 */

let _readyPromise = null
let _resolveFallback = null
let _fallbackTimer = null

function _ensure() {
  if (_readyPromise) return _readyPromise
  _readyPromise = new Promise((resolve) => {
    _resolveFallback = resolve
    // Last-ditch fallback so consumers don't hang forever if no trigger is
    // ever installed (e.g. SSR, unit tests, the gateway is unreachable).
    _fallbackTimer = setTimeout(() => {
      if (_resolveFallback) {
        _resolveFallback()
        _resolveFallback = null
      }
    }, 5000)
  })
  return _readyPromise
}

/**
 * Register the trigger that signals boot-ready. Resolves the bootReady
 * promise as soon as the trigger resolves. Idempotent — subsequent calls
 * are no-ops, so the first composable to register wins.
 */
export function setBootReadyTrigger(trigger) {
  _ensure()
  if (!_resolveFallback) return // already resolved
  Promise.resolve(trigger).then(() => {
    if (_resolveFallback) {
      clearTimeout(_fallbackTimer)
      _resolveFallback()
      _resolveFallback = null
    }
  })
}

/**
 * Await the boot-ready signal. Resolves once the machine WS has delivered
 * its first snapshot, or after a 5 s fallback if no trigger was installed.
 */
export function bootReady() {
  return _ensure()
}
