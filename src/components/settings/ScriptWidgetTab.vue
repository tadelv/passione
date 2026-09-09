<script setup>
/**
 * ScriptWidgetTab — Settings → Display → Script Widget.
 *
 * Draft vs applied contract (issue #9):
 *   - typing edits the draft, which autosaves through useSettings but never
 *     affects Home
 *   - Apply copies the draft onto the applied source Home runs (and recreates
 *     any live runtimes on next render)
 *   - Test runs the current draft through the same sandboxed runtime used on
 *     Home (ScriptWidgetRuntime) in a disposable preview — Test never touches
 *     the applied source
 *   - Reset example restores the example into the editor without applying it
 */
import { ref, inject, onUnmounted } from 'vue'
import ScriptWidgetRuntime from '../ScriptWidgetRuntime.vue'
import { SCRIPT_WIDGET_EXAMPLE } from '../../composables/useScriptWidget.js'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings ?? null
const toast = inject('toast', null)

// Source captured when Test is pressed — editing further never re-runs the
// preview until Test is pressed again.
const testSource = ref(null)
const applyFlash = ref(false)
const applying = ref(false)
let flashTimer = null

onUnmounted(() => {
  clearTimeout(flashTimer)
})

function onTest() {
  testSource.value = settings?.scriptWidgetDraft ?? ''
}

// Apply is explicit and durable: the applied source only changes on Home
// after its settings group has actually been persisted (saveImmediate), so
// an offline gateway cannot produce a fake "applied" state. The local value
// is rolled back when persistence fails to keep reactive and stored state in
// sync, and the button is locked while the save is in flight.
async function onApply() {
  if (!settingsInstance || applying.value) return
  const previous = settings.scriptWidgetApplied
  settings.scriptWidgetApplied = settings.scriptWidgetDraft
  applying.value = true
  try {
    const persisted = await settingsInstance.saveImmediate('scriptWidgetApplied')
    if (!persisted) {
      settings.scriptWidgetApplied = previous
      toast?.error('Could not apply script — check the connection and retry')
      return
    }
    applyFlash.value = true
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { applyFlash.value = false }, 2500)
    toast?.success('Script applied to Home')
  } finally {
    applying.value = false
  }
}

function onResetExample() {
  if (!settings) return
  settings.scriptWidgetDraft = SCRIPT_WIDGET_EXAMPLE
  testSource.value = null
}
</script>

<template>
  <div class="sw-tab" v-if="settings">
    <p class="sw-tab__description">
      Runs your own JavaScript inside an isolated sandbox on the Home screen.
      The script gets a read-only <code>window.passione</code> state snapshot plus
      <code>passione-state</code> update events — it never reaches into Passione itself.
    </p>

    <label class="sw-tab__label" for="script-widget-source">JavaScript source</label>
    <textarea
      id="script-widget-source"
      v-model="settings.scriptWidgetDraft"
      class="sw-tab__editor"
      spellcheck="false"
      aria-describedby="script-widget-editor-hint"
      data-testid="script-widget-source"
    ></textarea>
    <p id="script-widget-editor-hint" class="sw-tab__hint">
      Draft edits autosave but only reach Home when you press Apply.
    </p>

    <div class="sw-tab__actions">
      <button type="button" class="sw-tab__btn sw-tab__btn--primary" data-testid="script-widget-apply" :disabled="applying" @click="onApply">{{ applying ? 'Applying…' : 'Apply' }}</button>
      <button type="button" class="sw-tab__btn" data-testid="script-widget-test" @click="onTest">Test</button>
      <button type="button" class="sw-tab__btn" data-testid="script-widget-reset" @click="onResetExample">Reset example</button>
      <span v-if="applyFlash" class="sw-tab__flash" data-testid="script-widget-applied-flash">Applied — Home uses this source now.</span>
    </div>

    <p class="sw-tab__trust-note">
      Only paste scripts you trust: the sandbox allows arbitrary networking
      within normal browser rules and is intentionally not granted any
      Passione/Decaid privileges.
    </p>

    <div v-if="testSource !== null" class="sw-tab__preview" data-testid="script-widget-preview">
      <div class="sw-tab__preview-title">Preview (representative state)</div>
      <div class="sw-tab__preview-body">
        <ScriptWidgetRuntime
          :source="testSource"
          zone="centerLeft"
          density="full"
          preview
          empty-text="Draft source is empty — nothing to test yet."
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sw-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sw-tab__description {
  margin: 0;
  font-size: var(--font-md);
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.sw-tab__description code,
.sw-tab__hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  color: var(--color-text);
}

.sw-tab__label {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text);
}

.sw-tab__editor {
  width: 100%;
  min-height: 240px;
  box-sizing: border-box;
  resize: vertical;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--font-sm);
  line-height: 1.5;
  tab-size: 2;
  -webkit-tap-highlight-color: transparent;
}

.sw-tab__editor:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.sw-tab__hint {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.sw-tab__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.sw-tab__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--touch-target-min);
  min-width: var(--touch-target-min);
  padding: 0 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.sw-tab__btn:active {
  opacity: 0.7;
}

.sw-tab__btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
  opacity: 1;
}

.sw-tab__btn--primary {
  border: none;
  background: var(--color-primary);
}

.sw-tab__flash {
  font-size: var(--font-md);
  color: var(--color-success);
  font-weight: 500;
}

.sw-tab__trust-note {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.sw-tab__preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sw-tab__preview-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.sw-tab__preview-body {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  background: var(--color-background);
}
</style>
