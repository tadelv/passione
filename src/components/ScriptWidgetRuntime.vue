<script setup>
/**
 * ScriptWidgetRuntime — one sandboxed iframe runtime for a scriptWidget
 * placement (issue #9).
 *
 * Lifecycle contract:
 *   - create the runtime on mount / when `source` (or placement metadata)
 *     changes; a changed source produces a fresh document + fresh globals
 *   - ordinary Passione state changes never re-run initialization — they are
 *     pushed into the child over postMessage and surface to user code as
 *     `passione-state` events
 *   - unmount (navigation/layout change) destroys the runtime by removing the
 *     iframe, which tears down any timers/sockets the script started
 *   - errors inside the child are reported back here and contained locally
 *     ("Script error" on home, full details in the Settings Test preview)
 *
 * Used by LayoutWidget (home placements) and ScriptWidgetTab (Test preview)
 * so Test exercises the exact same isolation/runtime implementation.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import {
  buildScriptWidgetState,
  buildScriptWidgetDocument,
  SCRIPT_WIDGET_SANDBOX,
  SCRIPT_WIDGET_THEME_SOURCES,
} from '../composables/useScriptWidget.js'

const props = defineProps({
  /** Source to run. Changing it destroys and recreates the runtime. */
  source: { type: String, default: '' },
  /** Layout zone this placement lives in (see useLayout zone ids). */
  zone: { type: String, default: 'centerLeft' },
  /** Placement density: 'full' (center stack) or 'compact' (edge row). */
  density: { type: String, default: 'full' },
  /** Settings Test preview — show full error details instead of compact text. */
  preview: { type: Boolean, default: false },
  /** Shown when there is no source to run. */
  emptyText: { type: String, default: 'Script widget — set a source in Settings › Display' },
})

// Live Passione state (provided by App.vue for the whole app incl. Settings).
// `machineConnected` (devices.machineConnected) is Passione's notion of actual
// DE1 connectivity; telemetry/state values stay sourced from the useMachine
// snapshot refs, with temperature gated on the snapshot channel that carries
// the live reading (and drops stale values on channel loss).
const machineConnected = inject('machineConnected', ref(false))
const machine = inject('machine', null)
const scale = inject('scale', null)
const workflow = inject('workflow', null)

const sandboxAttr = SCRIPT_WIDGET_SANDBOX

const frameEl = ref(null)
const frameKey = ref(0)
const frameDoc = ref('')
const ready = ref(false)
const runtimeError = ref(null)
const lastSentJson = ref(null)

const hasSource = computed(() => (props.source || '').trim().length > 0)

function computeSnapshot() {
  return buildScriptWidgetState({
    machine: {
      connected: machineConnected?.value ?? false,
      state: machine?.state?.value ?? null,
      substate: machine?.substate?.value ?? null,
      temperature: machine?.isConnected?.value ? machine?.mixTemperature?.value ?? null : null,
    },
    scale: {
      connected: scale?.isConnected?.value ?? false,
      weight: scale?.weight?.value ?? null,
      battery: scale?.batteryLevel?.value ?? null,
    },
    workflow: workflow ?? null,
  })
}

function readThemeVars() {
  const styles = window.getComputedStyle(document.documentElement)
  const vars = {}
  for (const [name, token] of Object.entries(SCRIPT_WIDGET_THEME_SOURCES)) {
    const value = (styles.getPropertyValue(token) || '').trim()
    if (value) vars[name] = value
  }
  return vars
}

/** Create a fresh runtime from the current props + state. */
function rebuild() {
  runtimeError.value = null
  ready.value = false
  if (!hasSource.value) return
  const state = computeSnapshot()
  // The doc embeds this state as the initial window.passione payload, so it
  // is "sent" already — later pushes only carry actual changes.
  lastSentJson.value = JSON.stringify(state)
  frameDoc.value = buildScriptWidgetDocument({
    state,
    widget: { zone: props.zone, density: props.density },
    source: props.source,
    themeVars: readThemeVars(),
  })
  frameKey.value += 1
  ready.value = true
}

/** Push the latest snapshot into the child; skipped when nothing changed. */
function pushState() {
  const frame = frameEl.value
  if (!frame || !frame.contentWindow) return
  const state = computeSnapshot()
  const json = JSON.stringify(state)
  if (json === lastSentJson.value) return
  lastSentJson.value = json
  frame.contentWindow.postMessage({ type: 'passione-state', state }, '*')
}

// Live state stream: dispatch updates without touching the source/runtime.
const liveState = computed(computeSnapshot)
watch(liveState, () => pushState())

// The frame finished loading: the child's message listener is live, so send a
// push that reconciles any state that changed while the document was building.
function onFrameLoad() {
  pushState()
}

// Contained error reporting from this placement's child runtime.
function onMessage(event) {
  const frame = frameEl.value
  if (!frame || event.source !== frame.contentWindow) return
  const data = event.data
  if (!data || data.type !== 'passione-error') return
  if (runtimeError.value) return
  runtimeError.value = data.error || { message: 'Script error', stack: '' }
}

// New source / placement change → recreate the runtime. Ordinary state changes
// never land here (they go through the liveState watcher above).
watch(
  () => [props.source, props.zone, props.density],
  () => rebuild()
)

onMounted(() => {
  window.addEventListener('message', onMessage)
  rebuild()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
})
</script>

<template>
  <div
    class="script-widget"
    :class="[`script-widget--${density}`, { 'script-widget--preview': preview }]"
  >
    <!-- Settings Test preview: surface useful error details for debugging. -->
    <div
      v-if="runtimeError && preview"
      class="script-widget__test-error"
      data-testid="script-widget-test-error"
      role="alert"
    >
      <div class="script-widget__test-error-title">Script error</div>
      <div v-if="runtimeError.message" class="script-widget__test-error-message">{{ runtimeError.message }}</div>
      <pre v-if="runtimeError.stack" class="script-widget__test-error-stack">{{ runtimeError.stack }}</pre>
    </div>

    <!-- Home placement: compact contained fallback, no stack dump. -->
    <div
      v-else-if="runtimeError"
      class="script-widget__error"
      data-testid="script-widget-error"
      role="status"
    >Script error</div>

    <div v-else-if="!hasSource" class="script-widget__empty" data-testid="script-widget-empty">
      {{ emptyText }}
    </div>

    <iframe
      v-else-if="ready"
      :key="frameKey"
      ref="frameEl"
      class="script-widget__frame"
      :sandbox="sandboxAttr"
      :srcdoc="frameDoc"
      title="Script widget runtime"
      @load="onFrameLoad"
    />
  </div>
</template>

<style scoped>
.script-widget {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.script-widget__frame {
  display: block;
  border: 0;
  background: transparent;
}

/* Center (stack) zones get a large rectangle; edge rows a compact one. */
.script-widget--full .script-widget__frame {
  width: 100%;
  max-width: 720px;
  height: clamp(260px, 44vh, 520px);
}

.script-widget--compact .script-widget__frame {
  width: 100%;
  max-width: 340px;
  height: 170px;
}

/* Settings Test preview box. */
.script-widget--preview .script-widget__frame {
  width: 100%;
  max-width: 720px;
  height: clamp(280px, 40vh, 480px);
}

.script-widget__empty,
.script-widget__error {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  text-align: center;
  padding: 8px;
}

.script-widget__error {
  color: var(--color-text-secondary);
}

.script-widget__test-error {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--color-error);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  color: var(--color-text);
}

.script-widget__test-error-title {
  font-size: var(--font-md);
  font-weight: 700;
  color: var(--color-error);
}

.script-widget__test-error-message {
  font-size: var(--font-md);
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.script-widget__test-error-stack {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 160px;
  overflow-y: auto;
}
</style>
