<script setup>
import { ref, onMounted } from 'vue'
import { getBuildInfo } from '../../api/rest.js'

const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
const buildInfo = ref(null)

onMounted(async () => {
  try {
    buildInfo.value = await getBuildInfo()
  } catch {
    // Gateway may not support /info yet
  }
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
</style>
