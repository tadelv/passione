<script setup>
import { ref, computed, inject } from 'vue'
import ValueInput from '../ValueInput.vue'

const settingsInstance = inject('settings', null)
const settings = settingsInstance?.settings
const toast = inject('toast', null)

const speechSupported = ref(typeof window !== 'undefined' && 'speechSynthesis' in window)

const isDisabled = computed(() => !settings?.accessibilityEnabled)

function testSpeech() {
  if (!speechSupported.value) {
    if (toast) toast.warning('Speech synthesis is not supported in this browser')
    return
  }
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(
      'Espresso extraction complete. 36 grams in 28 seconds. Pressure 9 bar, flow 2.1 milliliters per second.'
    )
    utterance.rate = 1.0
    utterance.pitch = 1.0
    window.speechSynthesis.speak(utterance)
    if (toast) toast.success('Speech test played')
  } catch (e) {
    if (toast) toast.error(`Speech failed: ${e.message}`)
  }
}

function testTickSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.value = 0.3
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.08)
    if (toast) toast.success('Tick sound played')
  } catch (e) {
    if (toast) toast.error(`Audio failed: ${e.message}`)
  }
}
</script>

<template>
  <div class="a11y-tab" v-if="settings">
    <div class="a11y-tab__grid">
      <!-- Column 1: General -->
      <div class="a11y-tab__column">
        <h4 class="a11y-tab__section-title">Accessibility</h4>

        <p class="a11y-tab__desc">
          Screen reader support and audio feedback for blind and visually impaired users.
        </p>

        <div class="a11y-tab__field">
          <label class="a11y-tab__label">Enable accessibility</label>
          <button
            class="a11y-tab__toggle"
            :class="{ 'a11y-tab__toggle--on': settings.accessibilityEnabled }"
            role="switch"
            :aria-checked="settings.accessibilityEnabled"
            @click="settings.accessibilityEnabled = !settings.accessibilityEnabled"
          >
            {{ settings.accessibilityEnabled ? 'ON' : 'OFF' }}
          </button>
        </div>

        <div class="a11y-tab__field" :class="{ 'a11y-tab__field--disabled': isDisabled }">
          <label class="a11y-tab__label">Voice announcements</label>
          <button
            class="a11y-tab__toggle"
            :class="{ 'a11y-tab__toggle--on': settings.voiceAnnouncements }"
            role="switch"
            :aria-checked="settings.voiceAnnouncements"
            :disabled="isDisabled"
            @click="settings.voiceAnnouncements = !settings.voiceAnnouncements"
          >
            {{ settings.voiceAnnouncements ? 'ON' : 'OFF' }}
          </button>
          <span class="a11y-tab__hint">Spoken updates using Web Speech API</span>
          <span class="a11y-tab__hint a11y-tab__hint--warn" v-if="!speechSupported">
            Speech synthesis not available in this browser
          </span>
        </div>

        <div class="a11y-tab__field" :class="{ 'a11y-tab__field--disabled': isDisabled }">
          <label class="a11y-tab__label">Frame tick sounds</label>
          <button
            class="a11y-tab__toggle"
            :class="{ 'a11y-tab__toggle--on': settings.frameTickSounds }"
            role="switch"
            :aria-checked="settings.frameTickSounds"
            :disabled="isDisabled"
            @click="settings.frameTickSounds = !settings.frameTickSounds"
          >
            {{ settings.frameTickSounds ? 'ON' : 'OFF' }}
          </button>
          <span class="a11y-tab__hint">Play a tick when extraction frames change</span>
        </div>
      </div>

      <!-- Column 2: Announcement Settings -->
      <div class="a11y-tab__column">
        <h4 class="a11y-tab__section-title">Extraction Announcements</h4>

        <div class="a11y-tab__field" :class="{ 'a11y-tab__field--disabled': isDisabled }">
          <label class="a11y-tab__label">Announcement mode</label>
          <div class="a11y-tab__toggle-group">
            <button
              class="a11y-tab__seg"
              :class="{ 'a11y-tab__seg--active': settings.announcementMode === 'timed' }"
              :disabled="isDisabled"
              @click="settings.announcementMode = 'timed'"
            >
              Timed
            </button>
            <button
              class="a11y-tab__seg"
              :class="{ 'a11y-tab__seg--active': settings.announcementMode === 'milestones' }"
              :disabled="isDisabled"
              @click="settings.announcementMode = 'milestones'"
            >
              Milestones
            </button>
          </div>
          <span class="a11y-tab__hint" v-if="settings.announcementMode === 'timed'">
            Announce at regular intervals during extraction
          </span>
          <span class="a11y-tab__hint" v-else>
            Announce on phase changes and weight milestones
          </span>
        </div>

        <div
          class="a11y-tab__field"
          v-if="settings.announcementMode === 'timed'"
          :class="{ 'a11y-tab__field--disabled': isDisabled }"
        >
          <label class="a11y-tab__label">Update interval</label>
          <ValueInput
            :model-value="settings.announcementInterval"
            @update:model-value="v => settings.announcementInterval = v"
            :min="5"
            :max="60"
            :step="5"
            suffix="s"
          />
          <span class="a11y-tab__hint">Seconds between timed announcements (5-60)</span>
        </div>
      </div>

      <!-- Column 3: Test -->
      <div class="a11y-tab__column">
        <h4 class="a11y-tab__section-title">Test</h4>

        <div class="a11y-tab__field">
          <button
            class="a11y-tab__test-btn"
            @click="testSpeech"
          >
            Test Speech
          </button>
          <span class="a11y-tab__hint">Plays a sample extraction announcement</span>
        </div>

        <div class="a11y-tab__field">
          <button
            class="a11y-tab__test-btn a11y-tab__test-btn--secondary"
            @click="testTickSound"
          >
            Test Tick Sound
          </button>
          <span class="a11y-tab__hint">Plays a sample frame tick</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="a11y-tab__empty">Settings not available.</div>
</template>

<style scoped>
.a11y-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.a11y-tab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.a11y-tab__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.a11y-tab__section-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.a11y-tab__desc {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}

.a11y-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: opacity 0.15s ease;
}

.a11y-tab__field--disabled {
  color: var(--button-disabled-text);
  pointer-events: none;
}

.a11y-tab__label {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

.a11y-tab__hint {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.a11y-tab__hint--warn {
  color: var(--color-warning, #e6a700);
  opacity: 1;
}

.a11y-tab__toggle {
  width: 80px;
  height: 40px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.a11y-tab__toggle--on {
  background: var(--color-success);
  color: var(--color-text);
  border-color: var(--color-success);
}

.a11y-tab__toggle:disabled {
  cursor: default;
}

.a11y-tab__toggle-group {
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  width: fit-content;
}

.a11y-tab__seg {
  padding: 8px 20px;
  border: none;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.a11y-tab__seg--active {
  background: var(--color-primary);
  color: var(--color-text);
}

.a11y-tab__seg:disabled {
  cursor: default;
}

.a11y-tab__test-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  width: fit-content;
}

.a11y-tab__test-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.a11y-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
