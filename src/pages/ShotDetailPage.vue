<script setup>
import { ref, computed, onMounted, watch, nextTick, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HistoryShotGraph from '../components/HistoryShotGraph.vue'
import RatingInput from '../components/RatingInput.vue'
import BottomBar from '../components/BottomBar.vue'
import SwipeableArea from '../components/SwipeableArea.vue'
import { getShot, getShotIds, updateShot, deleteShot, callPluginEndpoint } from '../api/rest.js'
import { useAIAnalysis } from '../composables/useAIAnalysis.js'

const route = useRoute()
const router = useRouter()

const shotId = computed(() => route.params.id)
const shot = ref(null)
const loading = ref(true)
const confirmingDelete = ref(false)
const rating = ref(0)

// Shot navigation support (swipe between shots)
const allShotIds = ref([])
const currentIndex = computed(() => {
  if (!allShotIds.value.length) return -1
  return allShotIds.value.indexOf(shotId.value)
})

const positionText = computed(() => {
  if (currentIndex.value < 0 || !allShotIds.value.length) return ''
  return `${currentIndex.value + 1} / ${allShotIds.value.length}`
})

async function loadShotIds() {
  try {
    const result = await getShotIds()
    allShotIds.value = Array.isArray(result) ? result : (result?.ids ?? [])
  } catch {
    allShotIds.value = []
  }
}

function navigateShot(delta) {
  if (!allShotIds.value.length || currentIndex.value < 0) return
  let next = currentIndex.value + delta
  // Wrap around
  if (next < 0) next = allShotIds.value.length - 1
  if (next >= allShotIds.value.length) next = 0
  const nextId = allShotIds.value[next]
  if (nextId) router.replace(`/shot/${encodeURIComponent(nextId)}`)
}

function onSwipeLeft() { navigateShot(1) }
function onSwipeRight() { navigateShot(-1) }

async function loadShot(id) {
  if (!id) return
  loading.value = true
  try {
    const result = await getShot(id)
    // Normalize nested API fields to flat access
    if (result) {
      const w = result.workflow ?? {}
      const dd = w.doseData ?? {}
      const meta = result.metadata ?? {}
      if (result.profileName == null) result.profileName = w.profile?.title ?? w.name ?? null
      if (result.dose == null && result.doseIn == null) result.doseIn = dd.doseIn ?? dd.dose ?? null
      if (result.output == null && result.doseOut == null) result.doseOut = dd.doseOut ?? dd.targetWeight ?? null
      if (result.notes == null && result.shotNotes != null) result.notes = result.shotNotes
      if (!result.profile && w.profile) result.profile = w.profile
      if (result.duration == null && result.measurements?.length >= 2) {
        const first = result.measurements[0]
        const last = result.measurements[result.measurements.length - 1]
        const getTs = (m) => {
          if (m.elapsed != null) return m.elapsed
          const ts = m.machine?.timestamp ?? m.timestamp
          return ts ? new Date(ts).getTime() / 1000 : 0
        }
        const d = getTs(last) - getTs(first)
        if (d > 0) result.duration = d
      }
    }
    shot.value = result
    rating.value = result?.metadata?.rating ?? result?.enjoyment ?? result?.rating ?? 0
  } catch {
    shot.value = null
  }
  loading.value = false
}

onMounted(() => {
  loadShot(shotId.value)
  loadShotIds()
})
watch(shotId, (id) => loadShot(id))

// Metrics
const duration = computed(() => {
  const d = shot.value?.duration
  if (!d || d <= 0) return '--'
  const mins = Math.floor(d / 60)
  const secs = Math.floor(d % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
})

const dose = computed(() => {
  const v = shot.value?.dose ?? shot.value?.doseIn
  return v != null ? Number(v).toFixed(1) + 'g' : '--'
})

const output = computed(() => {
  const v = shot.value?.output ?? shot.value?.doseOut ?? shot.value?.yield
  return v != null ? Number(v).toFixed(1) + 'g' : '--'
})

const ratio = computed(() => {
  const d = shot.value?.dose ?? shot.value?.doseIn
  const o = shot.value?.output ?? shot.value?.doseOut ?? shot.value?.yield
  if (d && o && d > 0) return `1:${(o / d).toFixed(1)}`
  return '--'
})

const profileName = computed(() =>
  shot.value?.profileName ?? shot.value?.profile?.title ?? 'Unknown Profile'
)

const shotDate = computed(() => {
  const ts = shot.value?.timestamp ?? shot.value?.date
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString()
})

const notes = computed(() => shot.value?.notes ?? '')

// Rating updates
async function onRatingChange(val) {
  rating.value = val
  if (shotId.value) {
    try {
      await updateShot(shotId.value, { metadata: { rating: val } })
    } catch {
      // ignore
    }
  }
}

async function onDelete() {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  try {
    await deleteShot(shotId.value)
    router.push('/history')
  } catch {
    // ignore
  }
  confirmingDelete.value = false
}

function cancelDelete() {
  confirmingDelete.value = false
}

// ---- Visualizer Upload ----
const uploading = ref(false)
const toast = inject('toast', null)

async function uploadToVisualizer() {
  if (!shotId.value || uploading.value) return
  uploading.value = true
  try {
    const res = await callPluginEndpoint('visualizer.reaplugin', 'upload', 'POST', {
      shotId: shotId.value,
    })
    if (res?.visualizer_id) {
      if (toast) toast(`Uploaded to Visualizer (${res.visualizer_id})`)
    } else {
      if (toast) toast('Upload completed')
    }
  } catch (e) {
    if (toast) toast(e.message || 'Upload failed')
  }
  uploading.value = false
}

// ---- AI Analysis ----
const ai = useAIAnalysis()
const showAIModal = ref(false)
const followUpText = ref('')
const messagesContainer = ref(null)

// Computed: displayable messages (exclude system prompt)
const displayMessages = computed(() =>
  ai.messages.value.filter(m => m.role !== 'system')
)

async function openAIAnalysis() {
  showAIModal.value = true
  if (!ai.messages.value.length && shot.value) {
    await ai.analyze(shot.value)
    await nextTick()
    scrollToBottom()
  }
}

function closeAIModal() {
  showAIModal.value = false
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
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

function onNewAnalysis() {
  ai.clearConversation()
  if (shot.value) {
    ai.analyze(shot.value)
  }
}
</script>

<template>
  <div class="shot-detail">
    <div v-if="loading" class="shot-detail__loading">Loading shot...</div>

    <template v-else-if="shot">
      <!-- Graph with swipe navigation -->
      <SwipeableArea
        class="shot-detail__graph"
        @swipe-left="onSwipeLeft"
        @swipe-right="onSwipeRight"
      >
        <HistoryShotGraph :shot="shot" />
      </SwipeableArea>
      <div v-if="positionText" class="shot-detail__position">
        {{ positionText }}
      </div>

      <!-- Metrics row -->
      <div class="shot-detail__metrics">
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value">{{ duration }}</span>
          <span class="shot-detail__metric-label">Duration</span>
        </div>
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value" style="color: var(--color-dye-dose)">{{ dose }}</span>
          <span class="shot-detail__metric-label">Dose</span>
        </div>
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value" style="color: var(--color-dye-output)">{{ output }}</span>
          <span class="shot-detail__metric-label">Output</span>
        </div>
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value">{{ ratio }}</span>
          <span class="shot-detail__metric-label">Ratio</span>
        </div>
        <div class="shot-detail__metric">
          <span class="shot-detail__metric-value" style="color: var(--color-warning)">
            {{ rating > 0 ? rating + '%' : '--' }}
          </span>
          <span class="shot-detail__metric-label">Rating</span>
        </div>
      </div>

      <!-- Info cards -->
      <div class="shot-detail__info">
        <div class="shot-detail__card">
          <span class="shot-detail__card-label">Profile</span>
          <span class="shot-detail__card-value">{{ profileName }}</span>
        </div>
        <div class="shot-detail__card">
          <span class="shot-detail__card-label">Date</span>
          <span class="shot-detail__card-value">{{ shotDate }}</span>
        </div>

        <div v-if="shot.beanBrand || shot.beanType" class="shot-detail__card">
          <span class="shot-detail__card-label">Bean</span>
          <span class="shot-detail__card-value">
            {{ [shot.beanBrand, shot.beanType].filter(Boolean).join(' ') }}
          </span>
        </div>

        <div v-if="shot.grinderModel || shot.grinder" class="shot-detail__card">
          <span class="shot-detail__card-label">Grinder</span>
          <span class="shot-detail__card-value">
            {{ shot.grinderModel || shot.grinder }}
            <template v-if="shot.grinderSetting"> @ {{ shot.grinderSetting }}</template>
          </span>
        </div>

        <div v-if="notes" class="shot-detail__card shot-detail__card--full">
          <span class="shot-detail__card-label">Notes</span>
          <span class="shot-detail__card-value">{{ notes }}</span>
        </div>

        <!-- Rating -->
        <div class="shot-detail__card shot-detail__card--full">
          <span class="shot-detail__card-label">Rating</span>
          <RatingInput
            :model-value="rating"
            @update:model-value="onRatingChange"
          />
        </div>
      </div>

      <!-- Action buttons -->
      <div class="shot-detail__actions">
        <button
          class="shot-detail__ai-btn"
          @click="openAIAnalysis"
        >
          AI Analysis
        </button>

        <button
          class="shot-detail__upload-btn"
          :disabled="uploading"
          @click="uploadToVisualizer"
        >
          {{ uploading ? 'Uploading...' : 'Upload to Visualizer' }}
        </button>

        <button
          class="shot-detail__edit-btn"
          @click="router.push(`/shot-review/${encodeURIComponent(shotId)}`)"
        >
          Edit Metadata
        </button>

        <button
          v-if="!confirmingDelete"
          class="shot-detail__delete-btn"
          @click="onDelete"
        >
          Delete Shot
        </button>
        <template v-else>
          <span class="shot-detail__confirm-text">Delete this shot? This cannot be undone.</span>
          <div class="shot-detail__confirm-btns">
            <button class="shot-detail__cancel-btn" @click="cancelDelete">Cancel</button>
            <button class="shot-detail__confirm-delete-btn" @click="onDelete">Delete</button>
          </div>
        </template>
      </div>
    </template>

    <div v-else class="shot-detail__empty">Shot not found.</div>

    <BottomBar title="Shot Detail" />

    <!-- AI Analysis Modal -->
    <Teleport to="body">
      <div v-if="showAIModal" class="ai-modal" @click.self="closeAIModal">
        <div class="ai-modal__panel">
          <!-- Header -->
          <div class="ai-modal__header">
            <h3 class="ai-modal__title">AI Shot Analysis</h3>
            <div class="ai-modal__header-actions">
              <button
                class="ai-modal__retry-btn"
                @click="onNewAnalysis"
                :disabled="ai.loading.value"
                title="Re-analyze"
              >
                Retry
              </button>
              <button class="ai-modal__close-btn" @click="closeAIModal" aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Messages -->
          <div class="ai-modal__messages" ref="messagesContainer">
            <!-- Loading state (no messages yet) -->
            <div v-if="ai.loading.value && !displayMessages.length" class="ai-modal__loading">
              <div class="ai-modal__spinner"></div>
              <span>Analyzing your shot...</span>
              <span class="ai-modal__loading-hint">This may take a few seconds</span>
            </div>

            <!-- Error state (no messages) -->
            <div v-else-if="ai.error.value && !displayMessages.length" class="ai-modal__error">
              <div class="ai-modal__error-icon">!</div>
              <span class="ai-modal__error-title">Analysis Failed</span>
              <span class="ai-modal__error-text">{{ ai.error.value }}</span>
              <button class="ai-modal__error-btn" @click="onNewAnalysis">Try Again</button>
            </div>

            <!-- Conversation messages -->
            <template v-else>
              <div
                v-for="(msg, idx) in displayMessages"
                :key="idx"
                class="ai-modal__message"
                :class="{
                  'ai-modal__message--user': msg.role === 'user',
                  'ai-modal__message--assistant': msg.role === 'assistant',
                }"
              >
                <div class="ai-modal__message-role">
                  {{ msg.role === 'user' ? 'You' : 'AI' }}
                </div>
                <div class="ai-modal__message-content">{{ msg.content }}</div>
              </div>

              <!-- Inline loading for follow-ups -->
              <div v-if="ai.loading.value" class="ai-modal__message ai-modal__message--assistant">
                <div class="ai-modal__message-role">AI</div>
                <div class="ai-modal__message-content ai-modal__message-content--loading">
                  <div class="ai-modal__spinner ai-modal__spinner--small"></div>
                  Thinking...
                </div>
              </div>

              <!-- Inline error for follow-ups -->
              <div v-if="ai.error.value && displayMessages.length" class="ai-modal__inline-error">
                {{ ai.error.value }}
              </div>
            </template>
          </div>

          <!-- Follow-up input -->
          <div v-if="displayMessages.length" class="ai-modal__input-row">
            <input
              type="text"
              class="ai-modal__input"
              v-model="followUpText"
              placeholder="Ask a follow-up question..."
              :disabled="ai.loading.value"
              @keydown="onFollowUpKeydown"
            />
            <button
              class="ai-modal__send-btn"
              :disabled="!followUpText.trim() || ai.loading.value"
              @click="onSendFollowUp"
            >
              {{ ai.loading.value ? '...' : 'Ask' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.shot-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.shot-detail__loading,
.shot-detail__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.shot-detail__graph {
  height: 250px;
  flex-shrink: 0;
  padding: 8px 16px;
}

.shot-detail__position {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  padding-bottom: 4px;
}

.shot-detail__metrics {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  flex-shrink: 0;
}

.shot-detail__metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: var(--color-surface);
  border-radius: 10px;
  border: 1px solid var(--color-border);
}

.shot-detail__metric-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.shot-detail__metric-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.shot-detail__info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 8px 16px;
}

.shot-detail__card {
  padding: 12px;
  background: var(--color-surface);
  border-radius: 10px;
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shot-detail__card--full {
  grid-column: 1 / -1;
}

.shot-detail__card-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.shot-detail__card-value {
  font-size: 15px;
  color: var(--color-text);
  word-break: break-word;
}

.shot-detail__actions {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.shot-detail__ai-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.shot-detail__ai-btn:active {
  opacity: 0.7;
}

.shot-detail__upload-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-success);
  background: transparent;
  color: var(--color-success);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.shot-detail__upload-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.shot-detail__upload-btn:active {
  opacity: 0.7;
}

.shot-detail__edit-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.shot-detail__edit-btn:active {
  opacity: 0.7;
}

.shot-detail__delete-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-error);
  background: transparent;
  color: var(--color-error);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.shot-detail__delete-btn:active {
  opacity: 0.7;
}

.shot-detail__confirm-text {
  font-size: 14px;
  color: var(--color-error);
  text-align: center;
}

.shot-detail__confirm-btns {
  display: flex;
  gap: 12px;
}

.shot-detail__cancel-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
}

.shot-detail__confirm-delete-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-error);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

/* ---- AI Analysis Modal ---- */

.ai-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ai-modal__panel {
  background: var(--color-background);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  width: 100%;
  max-width: 540px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.ai-modal__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.ai-modal__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-modal__retry-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ai-modal__retry-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ai-modal__close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ai-modal__messages {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-modal__loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-secondary);
  font-size: 14px;
  padding: 40px 0;
}

.ai-modal__loading-hint {
  font-size: 12px;
  opacity: 0.7;
}

.ai-modal__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: ai-spin 0.8s linear infinite;
}

.ai-modal__spinner--small {
  width: 16px;
  height: 16px;
  border-width: 2px;
  display: inline-block;
  vertical-align: middle;
}

@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

.ai-modal__error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  text-align: center;
}

.ai-modal__error-icon {
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

.ai-modal__error-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.ai-modal__error-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.ai-modal__error-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
}

.ai-modal__message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-modal__message--user {
  align-items: flex-end;
}

.ai-modal__message-role {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ai-modal__message-content {
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 100%;
}

.ai-modal__message--user .ai-modal__message-content {
  background: var(--color-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
  max-width: 85%;
}

.ai-modal__message--assistant .ai-modal__message-content {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-bottom-left-radius: 4px;
}

.ai-modal__message-content--loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
}

.ai-modal__inline-error {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(var(--color-error-rgb, 220, 53, 69), 0.1);
  color: var(--color-error);
  font-size: 13px;
  text-align: center;
}

.ai-modal__input-row {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.ai-modal__input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
}

.ai-modal__input::placeholder {
  color: var(--color-text-secondary);
  opacity: 0.6;
}

.ai-modal__send-btn {
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

.ai-modal__send-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
