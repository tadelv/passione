<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { getBuildInfo, checkForSkinUpdates, getSkin } from '../../api/rest.js'

const SKIN_ID = 'passione'
const { t } = useI18n()

const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
const buildInfo = ref(null)

// Update-check state machine: 'idle' | 'checking' | 'updated' | 'current' | 'error'
const updateState = ref('idle')
let resetTimer = null
let reloadTimer = null
let mounted = true

async function handleCheckForUpdates() {
  if (updateState.value === 'checking') return
  updateState.value = 'checking'
  clearTimeout(resetTimer)

  try {
    await checkForSkinUpdates()
    if (!mounted) return
    const skin = await getSkin(SKIN_ID)
    if (!mounted) return
    const newVersion = skin?.version
    if (newVersion && newVersion !== appVersion) {
      updateState.value = 'updated'
      // Brief pause so the user sees the message, then reload with cache-busting.
      // Track the timer so onBeforeUnmount can cancel it if the user navigates
      // away before the reload fires — otherwise the setTimeout would force a
      // full page reload out from under whatever route they moved to.
      reloadTimer = setTimeout(() => {
        const url = window.location.pathname + '?v=' + Date.now() + window.location.hash
        window.location.href = url
      }, 800)
    } else {
      updateState.value = 'current'
      resetTimer = setTimeout(() => {
        if (mounted) updateState.value = 'idle'
      }, 3000)
    }
  } catch (_err) {
    if (!mounted) return
    updateState.value = 'error'
    resetTimer = setTimeout(() => {
      if (mounted) updateState.value = 'idle'
    }, 5000)
  }
}

onMounted(async () => {
  try {
    buildInfo.value = await getBuildInfo()
  } catch {
    // Gateway may not support /info yet
  }
})

onBeforeUnmount(() => {
  mounted = false
  clearTimeout(resetTimer)
  clearTimeout(reloadTimer)
})
</script>

<template>
  <div class="about-tab">
    <div class="about-tab__card">
      <h1 class="about-tab__title">Passione</h1>
      <p class="about-tab__version">Version {{ appVersion }}</p>

      <div class="about-tab__divider" />

      <p class="about-tab__text">
        Passione, based on Decenza, a work of passion.
        A modern web interface for the DE1 espresso machine via Streamline-Bridge.
      </p>

      <div class="about-tab__divider" />

      <div class="about-tab__section">
        <p class="about-tab__text">
          If you find this app useful, donations are welcome but never expected.
          Donations go to Michael Holm (Kulitorum), the original author of Decenza.
        </p>
        <p class="about-tab__text about-tab__text--small">
          paypal@kulitorum.com
        </p>
      </div>

      <div class="about-tab__divider" />

      <p class="about-tab__credits">
        Thanks to Michael, the Decent community, and the de1app developers for inspiration.
      </p>

      <template v-if="buildInfo">
        <div class="about-tab__divider" />
        <div class="about-tab__section">
          <p class="about-tab__label">Streamline-Bridge</p>
          <p class="about-tab__text about-tab__text--small">
            {{ buildInfo.fullVersion ?? buildInfo.version ?? 'unknown' }}
            <span v-if="buildInfo.commitShort"> ({{ buildInfo.commitShort }})</span>
          </p>
        </div>
      </template>

      <div class="about-tab__divider" />

      <div class="about-tab__section">
        <button
          class="about-tab__update-btn"
          :disabled="updateState === 'checking'"
          :aria-busy="updateState === 'checking'"
          data-testid="check-for-updates"
          @click="handleCheckForUpdates"
        >
          <span v-if="updateState === 'idle'">{{ t('about.update.check') }}</span>
          <span v-else-if="updateState === 'checking'">{{ t('about.update.checking') }}</span>
          <span v-else-if="updateState === 'updated'">{{ t('about.update.updated') }}</span>
          <span v-else-if="updateState === 'current'">{{ t('about.update.current') }}</span>
          <span v-else>{{ t('about.update.error') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-tab {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.about-tab__card {
  max-width: 480px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.about-tab__title {
  font-size: var(--font-heading);
  font-weight: bold;
  color: var(--color-primary);
}

.about-tab__version {
  font-size: var(--font-body);
  color: var(--color-text);
}

.about-tab__divider {
  width: 60%;
  height: 1px;
  background: var(--color-border);
}

.about-tab__text {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
  line-height: 1.5;
  max-width: 400px;
}

.about-tab__text--small {
  font-size: var(--font-md);
  font-family: monospace;
}

.about-tab__section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.about-tab__label {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.about-tab__credits {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  font-style: italic;
  line-height: 1.5;
  max-width: 400px;
}

.about-tab__update-btn {
  min-width: 200px;
  padding: 12px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.about-tab__update-btn:hover:not(:disabled) {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.about-tab__update-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
