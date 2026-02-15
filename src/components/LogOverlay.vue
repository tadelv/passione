<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'

const MAX_MESSAGES = 200

const isOpen = ref(false)
const messages = ref([])
const errorCount = ref(0)
const logBody = ref(null)

let msgId = 0
let origLog = null
let origWarn = null
let origError = null

function addMessage(level, args) {
  const text = args
    .map((a) => {
      if (a === null) return 'null'
      if (a === undefined) return 'undefined'
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 2) } catch { return String(a) }
      }
      return String(a)
    })
    .join(' ')

  const entry = {
    id: ++msgId,
    level,
    text,
    time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
  }

  messages.value.push(entry)
  if (messages.value.length > MAX_MESSAGES) {
    // Recalculate error count when evicting
    const removed = messages.value.shift()
    if (removed.level === 'error') {
      errorCount.value = Math.max(0, errorCount.value - 1)
    }
  }

  if (level === 'error') {
    errorCount.value++
  }
}

function installInterceptors() {
  origLog = console.log
  origWarn = console.warn
  origError = console.error

  console.log = (...args) => {
    addMessage('log', args)
    origLog.apply(console, args)
  }
  console.warn = (...args) => {
    addMessage('warn', args)
    origWarn.apply(console, args)
  }
  console.error = (...args) => {
    addMessage('error', args)
    origError.apply(console, args)
  }
}

function restoreInterceptors() {
  if (origLog) console.log = origLog
  if (origWarn) console.warn = origWarn
  if (origError) console.error = origError
}

function toggleOverlay() {
  isOpen.value = !isOpen.value
}

function clearMessages() {
  messages.value = []
  errorCount.value = 0
}

function scrollToBottom() {
  if (logBody.value) {
    logBody.value.scrollTop = logBody.value.scrollHeight
  }
}

// Auto-scroll when new messages arrive while overlay is open
watch(
  () => messages.value.length,
  () => {
    if (isOpen.value) {
      nextTick(scrollToBottom)
    }
  }
)

// Scroll to bottom when overlay opens
watch(isOpen, (open) => {
  if (open) {
    nextTick(scrollToBottom)
  }
})

onMounted(() => {
  installInterceptors()
})

onUnmounted(() => {
  restoreInterceptors()
})
</script>

<template>
  <!-- Floating toggle button -->
  <button
    class="log-overlay__toggle"
    @click="toggleOverlay"
    aria-label="Toggle log overlay"
  >
    <svg class="log-overlay__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
    <span
      v-if="errorCount > 0"
      class="log-overlay__badge"
    >{{ errorCount > 99 ? '99+' : errorCount }}</span>
  </button>

  <!-- Full-screen overlay -->
  <Transition name="log-overlay-fade">
    <div v-if="isOpen" class="log-overlay">
      <div class="log-overlay__header">
        <span class="log-overlay__title">Console Log</span>
        <div class="log-overlay__actions">
          <button class="log-overlay__btn" @click="clearMessages">Clear</button>
          <button class="log-overlay__btn log-overlay__btn--close" @click="isOpen = false">Close</button>
        </div>
      </div>
      <div ref="logBody" class="log-overlay__body">
        <div v-if="messages.length === 0" class="log-overlay__empty">
          No log messages yet.
        </div>
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="log-overlay__entry"
          :class="`log-overlay__entry--${msg.level}`"
        >
          <span class="log-overlay__time">{{ msg.time }}</span>
          <span class="log-overlay__level">{{ msg.level.toUpperCase() }}</span>
          <span class="log-overlay__text">{{ msg.text }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.log-overlay__toggle {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 9999;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: var(--color-surface, #252538);
  color: var(--color-text-secondary, #a0a8b8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: background 0.2s ease;
}

.log-overlay__toggle:hover {
  background: var(--color-primary, #4e85f4);
  color: #fff;
}

.log-overlay__icon {
  width: 20px;
  height: 20px;
}

.log-overlay__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-error, #ff4444);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  pointer-events: none;
}

.log-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: var(--color-background, #1a1a2e);
}

.log-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-surface, #252538);
  border-bottom: 1px solid var(--color-border, #3a3a4e);
  flex-shrink: 0;
}

.log-overlay__title {
  font-size: var(--font-subtitle, 18px);
  font-weight: 600;
  color: var(--color-text, #fff);
}

.log-overlay__actions {
  display: flex;
  gap: 8px;
}

.log-overlay__btn {
  padding: 6px 14px;
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: var(--radius-button, 12px);
  background: transparent;
  color: var(--color-text-secondary, #a0a8b8);
  font-size: var(--font-label, 14px);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.log-overlay__btn:hover {
  background: var(--color-surface, #252538);
  color: var(--color-text, #fff);
}

.log-overlay__btn--close {
  background: var(--color-primary, #4e85f4);
  border-color: var(--color-primary, #4e85f4);
  color: #fff;
}

.log-overlay__btn--close:hover {
  opacity: 0.85;
}

.log-overlay__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.log-overlay__empty {
  color: var(--color-text-secondary, #a0a8b8);
  text-align: center;
  padding: 40px 16px;
  font-size: var(--font-label, 14px);
}

.log-overlay__entry {
  display: flex;
  gap: 8px;
  padding: 3px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  word-break: break-all;
}

.log-overlay__entry--log {
  color: var(--color-text-secondary, #a0a8b8);
}

.log-overlay__entry--warn {
  color: var(--color-warning, #ffaa00);
  background: rgba(255, 170, 0, 0.06);
}

.log-overlay__entry--error {
  color: var(--color-error, #ff4444);
  background: rgba(255, 68, 68, 0.08);
}

.log-overlay__time {
  flex-shrink: 0;
  color: var(--color-text-secondary, #a0a8b8);
  opacity: 0.7;
  min-width: 85px;
}

.log-overlay__level {
  flex-shrink: 0;
  font-weight: 700;
  min-width: 46px;
  text-align: center;
}

.log-overlay__entry--log .log-overlay__level {
  color: var(--color-text-secondary, #a0a8b8);
}

.log-overlay__entry--warn .log-overlay__level {
  color: var(--color-warning, #ffaa00);
}

.log-overlay__entry--error .log-overlay__level {
  color: var(--color-error, #ff4444);
}

.log-overlay__text {
  flex: 1;
  white-space: pre-wrap;
}

/* Transition */
.log-overlay-fade-enter-active,
.log-overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}

.log-overlay-fade-enter-from,
.log-overlay-fade-leave-to {
  opacity: 0;
}
</style>
