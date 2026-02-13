<script setup>
import { ref, computed, onMounted, inject, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import { getShotIds, getShots } from '../api/rest.js'
import { useAIAnalysis, DIALING_SYSTEM_PROMPT } from '../composables/useAIAnalysis.js'

const router = useRouter()
const toast = inject('toast', null)

const RECENT_SHOT_COUNT = 5

const ai = useAIAnalysis({ systemPrompt: DIALING_SYSTEM_PROMPT })
const followUpText = ref('')
const loadingShots = ref(true)
const shotsError = ref(null)
const contentContainer = ref(null)

// Computed: displayable messages (exclude system prompt)
const displayMessages = computed(() =>
  ai.messages.value.filter(m => m.role !== 'system')
)

// The main recommendation text (first assistant response)
const recommendation = computed(() => {
  const assistantMsg = ai.messages.value.find(m => m.role === 'assistant')
  return assistantMsg?.content ?? ''
})

// Whether we have any content to show
const hasContent = computed(() =>
  displayMessages.value.length > 0 || ai.loading.value || ai.error.value
)

async function loadAndAnalyze() {
  loadingShots.value = true
  shotsError.value = null

  try {
    // Fetch recent shot IDs
    const result = await getShotIds()
    const ids = Array.isArray(result) ? result : (result?.ids ?? [])

    if (!ids.length) {
      shotsError.value = 'No shots found. Brew some espresso first, then come back for dialing recommendations.'
      loadingShots.value = false
      return
    }

    // Take the most recent shots
    const recentIds = ids.slice(0, RECENT_SHOT_COUNT)
    const shotsResult = await getShots(recentIds)
    const shots = Array.isArray(shotsResult) ? shotsResult : (shotsResult?.shots ?? [])

    if (!shots.length) {
      shotsError.value = 'Could not load shot data. Please try again.'
      loadingShots.value = false
      return
    }

    loadingShots.value = false

    // Send to AI for analysis
    await ai.analyzeMultiple(shots)
    await nextTick()
    scrollToBottom()
  } catch (e) {
    shotsError.value = `Failed to load shots: ${e.message}`
    loadingShots.value = false
  }
}

async function retry() {
  ai.clearConversation()
  await loadAndAnalyze()
}

async function onSendFollowUp() {
  const text = followUpText.value.trim()
  if (!text) return
  followUpText.value = ''
  await ai.sendFollowUp(text)
  await nextTick()
  scrollToBottom()
}

function onFollowUpKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onSendFollowUp()
  }
}

function scrollToBottom() {
  if (contentContainer.value) {
    contentContainer.value.scrollTop = contentContainer.value.scrollHeight
  }
}

async function copyToClipboard() {
  if (!recommendation.value) return
  try {
    await navigator.clipboard.writeText(recommendation.value)
    if (toast) toast.success('Copied to clipboard')
  } catch {
    if (toast) toast.error('Failed to copy to clipboard')
  }
}

function goBack() {
  router.push('/')
}

onMounted(() => {
  loadAndAnalyze()
})
</script>

<template>
  <div class="dialing-page">
    <!-- Main content area -->
    <div class="dialing-page__content" ref="contentContainer">
      <!-- Loading shots -->
      <div v-if="loadingShots" class="dialing-page__center">
        <div class="dialing-page__spinner"></div>
        <span class="dialing-page__center-text">Loading recent shots...</span>
      </div>

      <!-- Shots load error -->
      <div v-else-if="shotsError" class="dialing-page__center">
        <div class="dialing-page__error-icon">!</div>
        <span class="dialing-page__error-title">Cannot Analyze</span>
        <span class="dialing-page__error-text">{{ shotsError }}</span>
        <button class="dialing-page__retry-btn" @click="retry">Try Again</button>
      </div>

      <!-- AI loading (shots loaded, waiting for AI) -->
      <div v-else-if="ai.loading.value && !displayMessages.length" class="dialing-page__center">
        <div class="dialing-page__spinner"></div>
        <span class="dialing-page__center-text">Analyzing your shots...</span>
        <span class="dialing-page__center-hint">This may take a few seconds</span>
      </div>

      <!-- AI error (no response yet) -->
      <div v-else-if="ai.error.value && !displayMessages.length" class="dialing-page__center">
        <div class="dialing-page__error-icon">!</div>
        <span class="dialing-page__error-title">Analysis Failed</span>
        <span class="dialing-page__error-text">{{ ai.error.value }}</span>
        <button class="dialing-page__retry-btn" @click="retry">Try Again</button>
      </div>

      <!-- Conversation content -->
      <template v-else-if="displayMessages.length">
        <div
          v-for="(msg, idx) in displayMessages"
          :key="idx"
          class="dialing-page__message"
          :class="{
            'dialing-page__message--user': msg.role === 'user',
            'dialing-page__message--assistant': msg.role === 'assistant',
          }"
        >
          <div v-if="msg.role === 'user' && idx > 0" class="dialing-page__message-role">You</div>
          <div
            v-if="msg.role === 'assistant' || idx > 0"
            class="dialing-page__message-content"
          >{{ msg.content }}</div>
        </div>

        <!-- Inline loading for follow-ups -->
        <div v-if="ai.loading.value" class="dialing-page__message dialing-page__message--assistant">
          <div class="dialing-page__message-content dialing-page__message-content--loading">
            <div class="dialing-page__spinner dialing-page__spinner--small"></div>
            Thinking...
          </div>
        </div>

        <!-- Inline error for follow-ups -->
        <div v-if="ai.error.value && displayMessages.length" class="dialing-page__inline-error">
          {{ ai.error.value }}
        </div>
      </template>
    </div>

    <!-- Follow-up input (visible when we have a recommendation) -->
    <div v-if="recommendation" class="dialing-page__footer">
      <div class="dialing-page__input-row">
        <input
          type="text"
          class="dialing-page__input"
          v-model="followUpText"
          placeholder="Ask a follow-up question..."
          :disabled="ai.loading.value"
          @keydown="onFollowUpKeydown"
        />
        <button
          class="dialing-page__send-btn"
          :disabled="!followUpText.trim() || ai.loading.value"
          @click="onSendFollowUp"
        >
          {{ ai.loading.value ? '...' : 'Ask' }}
        </button>
      </div>

      <!-- Action buttons -->
      <div class="dialing-page__actions">
        <button class="dialing-page__copy-btn" @click="copyToClipboard">
          Copy
        </button>
        <button class="dialing-page__done-btn" @click="goBack">
          Done
        </button>
      </div>
    </div>

    <BottomBar title="Dialing Assistant" />
  </div>
</template>

<style scoped>
.dialing-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.dialing-page__content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Centered states (loading, error) */
.dialing-page__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  text-align: center;
}

.dialing-page__center-text {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.dialing-page__center-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.dialing-page__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: dialing-spin 0.8s linear infinite;
}

.dialing-page__spinner--small {
  width: 16px;
  height: 16px;
  border-width: 2px;
  display: inline-block;
  vertical-align: middle;
}

@keyframes dialing-spin {
  to { transform: rotate(360deg); }
}

.dialing-page__error-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-error);
  opacity: 0.2;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-error);
}

.dialing-page__error-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.dialing-page__error-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  max-width: 320px;
}

.dialing-page__retry-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* Messages */
.dialing-page__message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dialing-page__message--user {
  align-items: flex-end;
}

.dialing-page__message-role {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dialing-page__message-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.dialing-page__message--user .dialing-page__message-content {
  padding: 10px 14px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 12px;
  border-bottom-right-radius: 4px;
  max-width: 85%;
}

.dialing-page__message-content--loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  padding: 10px 0;
}

.dialing-page__inline-error {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(var(--color-error-rgb, 220, 53, 69), 0.1);
  color: var(--color-error);
  font-size: 13px;
  text-align: center;
}

/* Footer with input and actions */
.dialing-page__footer {
  flex-shrink: 0;
  padding: 8px 16px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dialing-page__input-row {
  display: flex;
  gap: 8px;
}

.dialing-page__input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
}

.dialing-page__input::placeholder {
  color: var(--color-text-secondary);
  opacity: 0.6;
}

.dialing-page__send-btn {
  padding: 0 16px;
  height: 40px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.dialing-page__send-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.dialing-page__actions {
  display: flex;
  gap: 8px;
}

.dialing-page__copy-btn {
  flex: 1;
  padding: 10px 0;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.dialing-page__copy-btn:active {
  opacity: 0.7;
}

.dialing-page__done-btn {
  flex: 1;
  padding: 10px 0;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.dialing-page__done-btn:active {
  opacity: 0.7;
}
</style>
