<script setup>
import { ref, inject, onMounted, watch } from 'vue'
import ValueInput from '../ValueInput.vue'
import {
  callPluginEndpoint,
  getPluginSettings,
  updatePluginSettings,
} from '../../api/rest.js'

const PLUGIN_ID = 'visualizer.reaplugin'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
const toast = inject('toast', null)

const testing = ref(false)
const testResult = ref('')
const pluginOnline = ref(null) // null = unknown, true = online, false = offline
const syncing = ref(false)
const lastUpload = ref(null) // { reaId, visId }

// Check if the visualizer plugin is running
async function checkPluginStatus() {
  try {
    const res = await callPluginEndpoint(PLUGIN_ID, 'status')
    pluginOnline.value = res?.status === 'online'
  } catch {
    pluginOnline.value = false
  }
}

// Load last upload info from plugin
async function loadLastUpload() {
  try {
    const res = await callPluginEndpoint(PLUGIN_ID, 'lastUpload')
    if (res?.reaId || res?.visId) {
      lastUpload.value = res
    }
  } catch {
    // ignore
  }
}

// Sync credentials and settings from skin settings to the plugin
async function syncToPlugin() {
  if (!settings) return
  syncing.value = true
  try {
    await updatePluginSettings(PLUGIN_ID, {
      Username: settings.visualizerUsername || '',
      Password: settings.visualizerPassword || '',
      AutoUpload: settings.visualizerAutoUpload,
      LengthThreshold: settings.visualizerMinDuration,
    })
  } catch {
    // Plugin may not be installed
  }
  syncing.value = false
}

// Test connection via plugin's verifyCredentials endpoint (no CORS issues)
async function testConnection() {
  if (!settings) return
  testing.value = true
  testResult.value = ''
  try {
    const res = await callPluginEndpoint(PLUGIN_ID, 'verifyCredentials', 'POST', {
      username: settings.visualizerUsername,
      password: settings.visualizerPassword,
    })
    if (res?.valid) {
      testResult.value = 'success'
    } else {
      testResult.value = 'fail'
    }
  } catch {
    testResult.value = 'error'
  }
  testing.value = false
}

// Save & sync: push skin settings to the plugin whenever credentials change
async function onSaveCredentials() {
  await syncToPlugin()
  if (toast) toast('Settings synced to Visualizer plugin')
}

onMounted(() => {
  checkPluginStatus()
  loadLastUpload()
})

// Auto-sync auto-upload and min-duration changes to the plugin (debounced)
let syncTimer = null
watch(
  () => settings && [settings.visualizerAutoUpload, settings.visualizerMinDuration],
  () => {
    if (!settings) return
    clearTimeout(syncTimer)
    syncTimer = setTimeout(syncToPlugin, 1000)
  }
)
</script>

<template>
  <div class="vis-tab" v-if="settings">
    <div class="vis-tab__grid">
      <!-- Column 1: Credentials -->
      <div class="vis-tab__column">
        <h4 class="vis-tab__section-title">Visualizer.coffee</h4>

        <!-- Plugin status indicator -->
        <div class="vis-tab__field">
          <div class="vis-tab__status">
            <span
              class="vis-tab__status-dot"
              :class="{
                'vis-tab__status-dot--online': pluginOnline === true,
                'vis-tab__status-dot--offline': pluginOnline === false,
              }"
            ></span>
            <span class="vis-tab__status-text">
              {{ pluginOnline === null ? 'Checking plugin...' : pluginOnline ? 'Plugin active' : 'Plugin not available' }}
            </span>
          </div>
        </div>

        <div class="vis-tab__field">
          <label class="vis-tab__label">Username</label>
          <input
            type="text"
            class="vis-tab__input"
            :value="settings.visualizerUsername"
            placeholder="email@example.com"
            autocomplete="username"
            @change="e => settings.visualizerUsername = e.target.value"
          />
        </div>

        <div class="vis-tab__field">
          <label class="vis-tab__label">Password</label>
          <input
            type="password"
            class="vis-tab__input"
            :value="settings.visualizerPassword"
            placeholder="password"
            autocomplete="current-password"
            @change="e => settings.visualizerPassword = e.target.value"
          />
        </div>

        <div class="vis-tab__field vis-tab__field--row">
          <button
            class="vis-tab__test-btn"
            :disabled="testing || !settings.visualizerUsername || !settings.visualizerPassword || !pluginOnline"
            @click="testConnection"
          >
            {{ testing ? 'Testing...' : 'Test Connection' }}
          </button>
          <button
            class="vis-tab__sync-btn"
            :disabled="syncing || !settings.visualizerUsername || !pluginOnline"
            @click="onSaveCredentials"
          >
            {{ syncing ? 'Syncing...' : 'Save to Plugin' }}
          </button>
        </div>

        <div class="vis-tab__field">
          <span
            v-if="testResult === 'success'"
            class="vis-tab__result vis-tab__result--ok"
          >Connected successfully</span>
          <span
            v-else-if="testResult === 'fail'"
            class="vis-tab__result vis-tab__result--fail"
          >Invalid credentials</span>
          <span
            v-else-if="testResult === 'error'"
            class="vis-tab__result vis-tab__result--fail"
          >Connection failed (is the plugin running?)</span>
        </div>

        <div v-if="lastUpload?.visId" class="vis-tab__field">
          <span class="vis-tab__hint">
            Last upload: shot {{ lastUpload.visId }}
          </span>
        </div>
      </div>

      <!-- Column 2: Upload Settings -->
      <div class="vis-tab__column">
        <h4 class="vis-tab__section-title">Upload</h4>

        <div class="vis-tab__field">
          <label class="vis-tab__label">Auto-upload shots</label>
          <button
            class="vis-tab__toggle"
            :class="{ 'vis-tab__toggle--on': settings.visualizerAutoUpload }"
            @click="settings.visualizerAutoUpload = !settings.visualizerAutoUpload"
          >
            {{ settings.visualizerAutoUpload ? 'ON' : 'OFF' }}
          </button>
          <span class="vis-tab__hint">Plugin uploads shots automatically when enabled</span>
        </div>

        <div class="vis-tab__field">
          <label class="vis-tab__label">Min shot duration</label>
          <ValueInput
            :model-value="settings.visualizerMinDuration"
            @update:model-value="v => settings.visualizerMinDuration = v"
            :min="0"
            :max="60"
            :step="1"
            suffix="s"
          />
          <span class="vis-tab__hint">Skip shots shorter than this</span>
        </div>

        <div class="vis-tab__field">
          <label class="vis-tab__label">Extended metadata</label>
          <button
            class="vis-tab__toggle"
            :class="{ 'vis-tab__toggle--on': settings.visualizerExtendedMetadata }"
            @click="settings.visualizerExtendedMetadata = !settings.visualizerExtendedMetadata"
          >
            {{ settings.visualizerExtendedMetadata ? 'ON' : 'OFF' }}
          </button>
          <span class="vis-tab__hint">Include bean info, grinder, etc.</span>
        </div>
      </div>

      <!-- Column 3: After Shot -->
      <div class="vis-tab__column">
        <h4 class="vis-tab__section-title">After Shot</h4>

        <div class="vis-tab__field">
          <label class="vis-tab__label">Show edit dialog</label>
          <button
            class="vis-tab__toggle"
            :class="{ 'vis-tab__toggle--on': settings.visualizerShowAfterShot }"
            @click="settings.visualizerShowAfterShot = !settings.visualizerShowAfterShot"
          >
            {{ settings.visualizerShowAfterShot ? 'ON' : 'OFF' }}
          </button>
          <span class="vis-tab__hint">Prompt to add notes after each shot</span>
        </div>

        <div class="vis-tab__field">
          <label class="vis-tab__label">Default rating</label>
          <ValueInput
            :model-value="settings.defaultShotRating"
            @update:model-value="v => settings.defaultShotRating = v"
            :min="0"
            :max="100"
            :step="5"
            suffix="%"
          />
        </div>
      </div>
    </div>
  </div>
  <div v-else class="vis-tab__empty">Settings not available.</div>
</template>

<style scoped>
.vis-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.vis-tab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.vis-tab__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.vis-tab__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.vis-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vis-tab__field--row {
  flex-direction: row;
  gap: 8px;
  flex-wrap: wrap;
}

.vis-tab__label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.vis-tab__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.vis-tab__input {
  height: 44px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
}

.vis-tab__input::placeholder {
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.vis-tab__toggle {
  width: 80px;
  height: 40px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.vis-tab__toggle--on {
  background: var(--color-success);
  color: var(--color-text);
  border-color: var(--color-success);
}

.vis-tab__test-btn,
.vis-tab__sync-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
}

.vis-tab__sync-btn {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.vis-tab__test-btn:disabled,
.vis-tab__sync-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.vis-tab__result {
  font-size: 13px;
  font-weight: 600;
}

.vis-tab__result--ok {
  color: var(--color-success);
}

.vis-tab__result--fail {
  color: var(--color-error);
}

.vis-tab__status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vis-tab__status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-text-secondary);
  opacity: 0.4;
}

.vis-tab__status-dot--online {
  background: var(--color-success);
  opacity: 1;
}

.vis-tab__status-dot--offline {
  background: var(--color-error);
  opacity: 1;
}

.vis-tab__status-text {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.vis-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
