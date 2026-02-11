<script setup>
</script>

<template>
  <div class="about-tab">
    <div class="about-tab__card">
      <h1 class="about-tab__title">Decenza</h1>
      <p class="about-tab__version">Version 0.1.0</p>

      <div class="about-tab__divider" />

      <p class="about-tab__text">
        Built by Michael Holm (Kulitorum) during Christmas 2025.
        A modern web interface for the DE1 espresso machine via Streamline-Bridge.
      </p>

      <div class="about-tab__divider" />

      <div class="about-tab__section">
        <p class="about-tab__text">
          If you find this app useful, donations are welcome but never expected.
        </p>
        <p class="about-tab__text about-tab__text--small">
          paypal@kulitorum.com
        </p>
      </div>

      <div class="about-tab__divider" />

      <p class="about-tab__credits">
        Thanks to the Decent community and the de1app developers for inspiration.
      </p>
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
  font-size: 32px;
  font-weight: bold;
  color: var(--color-primary);
}

.about-tab__version {
  font-size: 18px;
  color: var(--color-text);
}

.about-tab__divider {
  width: 60%;
  height: 1px;
  background: var(--color-border);
}

.about-tab__text {
  font-size: 16px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  max-width: 400px;
}

.about-tab__text--small {
  font-size: 14px;
  font-family: monospace;
}

.about-tab__section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.about-tab__credits {
  font-size: 14px;
  color: var(--color-text-secondary);
  font-style: italic;
  line-height: 1.5;
  max-width: 400px;
}
</style>
