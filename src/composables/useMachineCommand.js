/**
 * Shared user-command layer for machine state changes (start espresso/steam/
 * hot-water/flush, stop, sleep, wake).
 *
 * - One attempt per target state: while an attempt is in flight, further
 *   calls for that state return the same result instead of stacking duplicate
 *   PUTs and duplicate error toasts. Keyed by target state, so an emergency
 *   Stop (`idle`) is never blocked by a pending Start (`espresso`).
 * - Failure feedback is neutral — it never claims the machine failed to
 *   respond when the gateway actually rejected the write — and appends real
 *   server detail when useful.
 * - Never navigates. Callers stay put and retry from the control they
 *   pressed; navigation follows the observed (WS-reported) machine state so a
 *   delayed response can't override where the user already is.
 */

import { setMachineState } from '../api/rest'

const FAIL_PREFIX = {
  espresso: 'Could not start espresso — try again',
  steam: 'Could not start steam — try again',
  hotWater: 'Could not start hot water — try again',
  flush: 'Could not start flush — try again',
  idle: 'Could not stop the operation — try again',
  sleeping: 'Could not put the machine to sleep — try again',
  descaling: 'Could not start descaling — try again',
}

// Boring rejection text from the transport adds no signal; real server
// messages (e.g. "Machine write queue is full") are worth surfacing.
function detail(err) {
  const msg = err?.message
  if (!msg) return ''
  if (/HTTP \d{3}|Failed to fetch|NetworkError|load failed/i.test(msg)) return ''
  return ` — ${msg}`
}

const attempts = new Map()

/**
 * Send a user machine-state command. Resolves true when the gateway accepted
 * the write, false on failure (one error toast). Repeated taps while one
 * attempt is pending share the in-flight promise, so they neither duplicate
 * the PUT nor repeat the toast.
 */
export function userMachineCommand(state, toast) {
  const running = attempts.get(state)
  if (running) return running

  let attempt
  attempt = setMachineState(state)
    .then(() => true)
    .catch((err) => {
      toast?.error?.((FAIL_PREFIX[state] || `Command "${state}" failed`) + detail(err))
      return false
    })
    .finally(() => {
      if (attempts.get(state) === attempt) attempts.delete(state)
    })
  attempts.set(state, attempt)
  return attempt
}
