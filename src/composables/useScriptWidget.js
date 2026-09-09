/**
 * Script Widget — pure helpers for the custom-JS home widget (issue #9).
 *
 * v1 model:
 *   - one global applied source (Settings → Display → Script Widget)
 *   - every home placement runs its own sandboxed iframe runtime
 *   - user scripts get a frozen `window.passione` snapshot, placement
 *     metadata, and `passione-state` events; no privileged APIs
 *
 * This module is deliberately DOM-free so it unit-tests cleanly under node.
 * The iframe lifecycle (create on mount/source change, destroy on unmount,
 * state bridge) lives in components/ScriptWidgetRuntime.vue.
 */

// Example source for "Reset example". Demonstrates the two supported inputs:
// initial `passione.state` and later `passione-state` events.
export const SCRIPT_WIDGET_EXAMPLE = `function render(state) {
  const weight = state.scale?.weight
  const machine = state.machine?.state ?? 'Unknown'
  const coffee = state.workflow?.coffeeName
  const dose = state.workflow?.dose
  const lines = [
    weight == null ? '—' : weight.toFixed(1) + ' g',
    machine,
    coffee || '',
    dose == null ? '' : dose + ' g',
  ].filter(Boolean)
  document.body.innerHTML = '<div style="font-size:32px;font-weight:600;line-height:1.3">' +
    lines.join('<br>') +
    '</div>'
}

render(passione.state)
window.addEventListener('passione-state', (event) => render(event.detail))
`

// Sandbox attribute for each placement runtime. `allow-scripts` only — never
// allow-same-origin, popups, or top-level navigation, so the child gets an
// opaque origin and cannot reach Passione's DOM/storage/globals.
export const SCRIPT_WIDGET_SANDBOX = 'allow-scripts'

// Fallback values when a live theme token cannot be read (always present in
// the real app; kept so the generated document is never malformed).
export const SCRIPT_WIDGET_THEME_DEFAULTS = {
  text: '#ffffff',
  'text-muted': '#b0b8c8',
  background: '#1a1a2e',
  surface: '#252538',
  primary: '#4e85f4',
  accent: '#e94560',
  success: '#00cc6d',
  warning: '#ffaa00',
  error: '#ff4444',
  border: '#3a3a4e',
}

// The Passione theme token backing each --passione-* variable.
export const SCRIPT_WIDGET_THEME_SOURCES = {
  text: '--color-text',
  'text-muted': '--color-text-secondary',
  background: '--color-background',
  surface: '--color-surface',
  primary: '--color-primary',
  accent: '--color-accent',
  success: '--color-success',
  warning: '--color-warning',
  error: '--color-error',
  border: '--color-border',
}

/**
 * Build the JSON-safe, read-only state snapshot exposed to user scripts.
 *
 * Takes already dereferenced values:
 *   machine: { connected, state, substate, temperature }
 *   scale:   { connected, weight, battery }
 *   workflow: the reactive workflow object (may be null/partial)
 *
 * Contract:
 *   - only values Passione already owns are exposed (no new network calls)
 *   - numeric/optional values preserve null semantics — a disconnected
 *     machine/scale reports null telemetry, never 0/'' coercion
 *   - ratio is derived from dose/yield and is null unless both are usable
 */
export function buildScriptWidgetState({ machine = {}, scale = {}, workflow = null } = {}) {
  const mConnected = Boolean(machine.connected)
  const sConnected = Boolean(scale.connected)
  const wf = workflow && typeof workflow === 'object' ? workflow : null
  const profile = wf?.profile ?? null
  const ctx = wf?.context ?? null

  const dose = ctx?.targetDoseWeight ?? null
  const yieldOut = ctx?.targetYield ?? null
  const ratio =
    typeof dose === 'number' && typeof yieldOut === 'number' && dose > 0
      ? yieldOut / dose
      : null

  return {
    machine: {
      connected: mConnected,
      state: machine.state ?? null,
      substate: machine.substate ?? null,
      temperature: mConnected ? machine.temperature ?? null : null,
    },
    scale: {
      connected: sConnected,
      weight: sConnected ? scale.weight ?? null : null,
      battery: sConnected ? scale.battery ?? null : null,
    },
    workflow: {
      profileId: profile?.id ?? null,
      profileTitle: profile?.title ?? null,
      coffeeName: ctx?.coffeeName ?? null,
      coffeeRoaster: ctx?.coffeeRoaster ?? null,
      beanBatchId: ctx?.beanBatchId ?? null,
      dose,
      yield: yieldOut,
      ratio,
      grinderId: ctx?.grinderId ?? null,
      grinderName: ctx?.grinderModel ?? null,
      grindSetting: ctx?.grinderSetting ?? null,
    },
  }
}

// Child-runtime bootstrap. It:
//   1. parses the (escaped) payload — initial state, placement metadata, source
//   2. freezes and exposes `window.passione` BEFORE the source runs
//   3. turns parent postMessage state updates into `passione-state` events
//      without ever re-running the source
//   4. reports contained errors back to the parent for the local fallback
const SCRIPT_WIDGET_BOOTSTRAP = `(function () {
  'use strict';
  var payload = /*__PAYLOAD__*/;
  var widget = payload.widget || {};
  var source = payload.source || '';

  function deepFreeze(o) {
    if (o && typeof o === 'object') {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }

  var __passioneWidget = deepFreeze({ zone: widget.zone || null, density: widget.density || null });
  // Non-configurable accessor: the bridge can swap its value on every state
  // update, but user scripts cannot redefine or reassign window.passione.
  var __passione = null;
  Object.defineProperty(window, 'passione', {
    get: function () { return __passione; },
    set: function () { /* read-only bridge for user scripts */ },
    configurable: false,
  });
  function setPassione(state) {
    __passione = Object.freeze({ state: deepFreeze(state), widget: __passioneWidget });
    return __passione;
  }
  setPassione(payload.state);

  function reportError(message, stack) {
    var msg = {
      type: 'passione-error',
      error: { message: String(message || 'Script error'), stack: String(stack || '') },
    };
    try { window.parent.postMessage(msg, '*'); } catch (e) { /* child gone */ }
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'passione-state' || !data.state) return;
    var value = setPassione(data.state);
    try {
      window.dispatchEvent(new CustomEvent('passione-state', { detail: value.state }));
    } catch (e) { /* reported by the window 'error' listener */ }
  });

  // Containment: any uncaught error or rejected promise inside the runtime is
  // reported to the parent, which swaps in the local "Script error" fallback.
  // Resource load failures (img/script src) fire on their element, not window.
  window.addEventListener('error', function (event) {
    if (event.target && event.target !== window) return;
    reportError(event.message, event.error && event.error.stack);
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    reportError(
      (reason && reason.message) || (reason && String(reason)) || 'Unhandled promise rejection',
      reason && reason.stack
    );
  });

  // Compile-check first so a syntax error is caught synchronously and never
  // half-runs; then execute as a real classic script in this document.
  function runSource(code) {
    if (typeof code !== 'string' || !code.trim()) return;
    /* eslint-disable no-new-func */
    new Function(code); // throws SyntaxError when the source does not parse
    /* eslint-enable no-new-func */
    var el = document.createElement('script');
    el.textContent = code;
    document.body.appendChild(el);
  }

  try {
    runSource(source);
  } catch (err) {
    reportError(err && err.message, err && err.stack);
  }
})();
`

// JSON.stringify does not escape '<', so a user source containing `</script>`
// would terminate the generated inline script. Escape '<' as \u003c, which is
// semantically identical JSON but cannot close the <script> element. The same
// applies to U+2028/U+2029 (legal in JSON strings, historically illegal in JS
// string literals). The escaped JSON text is a valid JS object literal, so it
// is embedded directly as `payload` without an extra JSON.parse wrapper.
function escapePayload(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Build the srcdoc HTML for one runtime. Pure string work — no DOM access.
 *
 * themeVars: { [passioneVar]: value } merged over SCRIPT_WIDGET_THEME_DEFAULTS.
 */
export function buildScriptWidgetDocument({ state, widget, source, themeVars = {} }) {
  const vars = { ...SCRIPT_WIDGET_THEME_DEFAULTS, ...themeVars }
  const themeCss = Object.entries(vars)
    .filter(([, value]) => typeof value === 'string' && value)
    .map(([name, value]) => `  --passione-${name}: ${value};`)
    .join('\n')

  const payloadJson = escapePayload({ state, widget, source })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
:root {
${themeCss}
  color-scheme: dark;
}
html, body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: var(--passione-text);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}
</style>
</head>
<body>
<script>
${SCRIPT_WIDGET_BOOTSTRAP.replace('/*__PAYLOAD__*/', payloadJson)}
</script>
</body>
</html>
`
}
