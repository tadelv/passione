<script setup>
import { ref, computed, inject } from 'vue'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
const toast = inject('toast', null)

const testing = ref(false)
const showApiKey = ref(false)

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', desc: 'GPT-4o' },
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude' },
  { id: 'gemini', name: 'Gemini', desc: 'Flash' },
  { id: 'openrouter', name: 'OpenRouter', desc: 'Multi' },
  { id: 'ollama', name: 'Ollama', desc: 'Local' },
]

const COST_INFO = {
  openai: '~$0.01/shot',
  anthropic: '~$0.003/shot',
  gemini: '~$0.002/shot',
  openrouter: 'Varies by model',
  ollama: 'Free (local)',
}

const API_KEY_HINTS = {
  openai: 'Get key: platform.openai.com -> API Keys',
  anthropic: 'Get key: console.anthropic.com -> API Keys',
  gemini: 'Get key: aistudio.google.com -> Get API Key',
  openrouter: 'Get key: openrouter.ai -> Keys',
}

const needsApiKey = computed(() =>
  settings && settings.aiProvider !== 'ollama'
)

const needsModel = computed(() =>
  settings && (settings.aiProvider === 'openrouter' || settings.aiProvider === 'ollama')
)

const needsBaseUrl = computed(() =>
  settings && settings.aiProvider === 'ollama'
)

const canTest = computed(() => {
  if (!settings) return false
  const provider = settings.aiProvider
  if (provider === 'ollama') {
    return (settings.aiBaseUrl || '').length > 0
  }
  return (settings.aiApiKey || '').length > 0
})

function getDefaultBaseUrl() {
  return 'http://localhost:11434'
}

function getTestEndpoint() {
  if (!settings) return null
  const provider = settings.aiProvider
  const apiKey = settings.aiApiKey || ''
  const baseUrl = settings.aiBaseUrl || ''
  const model = settings.aiModel || ''

  switch (provider) {
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5,
        }),
      }
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        }),
      }
    case 'gemini':
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "ok"' }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      }
    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'anthropic/claude-sonnet-4',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5,
        }),
      }
    case 'ollama':
      return {
        url: `${baseUrl || getDefaultBaseUrl()}/api/generate`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3.2',
          prompt: 'Say "ok"',
          stream: false,
          options: { num_predict: 5 },
        }),
      }
    default:
      return null
  }
}

async function testConnection() {
  if (!settings) return
  const endpoint = getTestEndpoint()
  if (!endpoint) return

  testing.value = true
  try {
    const resp = await fetch(endpoint.url, {
      method: 'POST',
      headers: endpoint.headers,
      body: endpoint.body,
    })
    if (resp.ok) {
      if (toast) toast.success('Connection successful!')
    } else {
      const data = await resp.json().catch(() => null)
      const msg = data?.error?.message || data?.error || `HTTP ${resp.status}`
      if (toast) toast.error(`Connection failed: ${msg}`)
    }
  } catch (e) {
    if (toast) toast.error(`Connection error: ${e.message}`)
  }
  testing.value = false
}
</script>

<template>
  <div class="ai-tab" v-if="settings">
    <!-- Provider selection -->
    <div class="ai-tab__providers">
      <button
        v-for="p in PROVIDERS"
        :key="p.id"
        class="ai-tab__provider"
        :class="{
          'ai-tab__provider--active': settings.aiProvider === p.id,
        }"
        @click="settings.aiProvider = p.id"
      >
        <span class="ai-tab__provider-name">{{ p.name }}</span>
        <span class="ai-tab__provider-desc">{{ p.desc }}</span>
      </button>
    </div>

    <!-- Recommendation note -->
    <div class="ai-tab__note">
      For shot analysis, we recommend Claude (Anthropic). In our testing, Claude better
      understands espresso extraction dynamics and gives more accurate dial-in advice.
      Other providers work for translation and general tasks.
    </div>

    <div class="ai-tab__grid">
      <!-- Column 1: Credentials -->
      <div class="ai-tab__column">
        <h4 class="ai-tab__section-title">Configuration</h4>

        <!-- API Key (cloud providers) -->
        <div class="ai-tab__field" v-if="needsApiKey">
          <label class="ai-tab__label">API Key</label>
          <div class="ai-tab__key-row">
            <input
              :type="showApiKey ? 'text' : 'password'"
              class="ai-tab__input"
              :value="settings.aiApiKey"
              placeholder="sk-..."
              autocomplete="off"
              @change="e => settings.aiApiKey = e.target.value"
            />
            <button
              class="ai-tab__eye-btn"
              @click="showApiKey = !showApiKey"
            >
              {{ showApiKey ? 'Hide' : 'Show' }}
            </button>
          </div>
          <span class="ai-tab__hint">{{ API_KEY_HINTS[settings.aiProvider] || '' }}</span>
        </div>

        <!-- Model name -->
        <div class="ai-tab__field" v-if="needsModel">
          <label class="ai-tab__label">Model</label>
          <input
            type="text"
            class="ai-tab__input"
            :value="settings.aiModel"
            :placeholder="settings.aiProvider === 'ollama' ? 'llama3.2' : 'anthropic/claude-sonnet-4'"
            autocomplete="off"
            @change="e => settings.aiModel = e.target.value"
          />
          <span class="ai-tab__hint" v-if="settings.aiProvider === 'openrouter'">
            Enter model ID from openrouter.ai/models
          </span>
          <span class="ai-tab__hint" v-else-if="settings.aiProvider === 'ollama'">
            Install: ollama.ai, then run: ollama pull llama3.2
          </span>
        </div>

        <!-- Base URL (Ollama) -->
        <div class="ai-tab__field" v-if="needsBaseUrl">
          <label class="ai-tab__label">Base URL</label>
          <input
            type="text"
            class="ai-tab__input"
            :value="settings.aiBaseUrl"
            :placeholder="getDefaultBaseUrl()"
            autocomplete="off"
            @change="e => settings.aiBaseUrl = e.target.value"
          />
          <span class="ai-tab__hint">Ollama server endpoint</span>
        </div>
      </div>

      <!-- Column 2: Test & Cost -->
      <div class="ai-tab__column">
        <h4 class="ai-tab__section-title">Connection</h4>

        <div class="ai-tab__field">
          <button
            class="ai-tab__test-btn"
            :disabled="testing || !canTest"
            @click="testConnection"
          >
            {{ testing ? 'Testing...' : 'Test Connection' }}
          </button>
        </div>

        <div class="ai-tab__field">
          <label class="ai-tab__label">Estimated cost</label>
          <span class="ai-tab__cost">{{ COST_INFO[settings.aiProvider] || '' }}</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="ai-tab__empty">Settings not available.</div>
</template>

<style scoped>
.ai-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-tab__providers {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.ai-tab__provider {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 90px;
  height: 56px;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.ai-tab__provider--active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.ai-tab__provider-name {
  font-size: 13px;
  font-weight: 600;
}

.ai-tab__provider--active .ai-tab__provider-name {
  color: #fff;
}

.ai-tab__provider-desc {
  font-size: 11px;
  opacity: 0.7;
}

.ai-tab__provider--active .ai-tab__provider-desc {
  color: rgba(255, 255, 255, 0.8);
}

.ai-tab__note {
  padding: 12px;
  border-radius: 6px;
  background: rgba(var(--color-primary-rgb, 100, 140, 255), 0.12);
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.ai-tab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.ai-tab__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-tab__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.ai-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-tab__label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.ai-tab__hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.ai-tab__input {
  height: 44px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
}

.ai-tab__input::placeholder {
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.ai-tab__key-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ai-tab__key-row .ai-tab__input {
  flex: 1;
}

.ai-tab__eye-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  height: 44px;
  -webkit-tap-highlight-color: transparent;
}

.ai-tab__test-btn {
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

.ai-tab__test-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.ai-tab__cost {
  font-size: 14px;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.ai-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
