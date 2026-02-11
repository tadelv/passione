<script setup>
import { ref, inject } from 'vue'
import ValueInput from '../ValueInput.vue'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings

const testing = ref(false)
const testResult = ref('')

async function testConnection() {
  if (!settings) return
  testing.value = true
  testResult.value = ''
  try {
    const resp = await fetch('https://visualizer.coffee/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: settings.visualizerUsername,
        password: settings.visualizerPassword,
      }),
    })
    if (resp.ok) {
      testResult.value = 'success'
    } else {
      testResult.value = 'fail'
    }
  } catch {
    testResult.value = 'error'
  }
  testing.value = false
}
</script>

<template>
  <div class="vis-tab" v-if="settings">
    <div class="vis-tab__grid">
      <!-- Column 1: Credentials -->
      <div class="vis-tab__column">
        <h4 class="vis-tab__section-title">Visualizer.coffee</h4>

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

        <div class="vis-tab__field">
          <button
            class="vis-tab__test-btn"
            :disabled="testing || !settings.visualizerUsername || !settings.visualizerPassword"
            @click="testConnection"
          >
            {{ testing ? 'Testing...' : 'Test Connection' }}
          </button>
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
          >Connection failed</span>
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
  color: #fff;
  border-color: var(--color-success);
}

.vis-tab__test-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  width: fit-content;
}

.vis-tab__test-btn:disabled {
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

.vis-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
