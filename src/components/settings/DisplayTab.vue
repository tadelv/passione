<script setup>
import LayoutTab from './LayoutTab.vue'
import ScreensaverTab from './ScreensaverTab.vue'
import ThemesTab from './ThemesTab.vue'
</script>

<template>
  <div class="display-tab">
    <section class="display-tab__section">
      <h3 class="display-tab__section-title">Home Layout</h3>
      <LayoutTab />
    </section>

    <section class="display-tab__section">
      <h3 class="display-tab__section-title">Screensaver</h3>
      <ScreensaverTab />
    </section>

    <section class="display-tab__section">
      <h3 class="display-tab__section-title">Theme</h3>
      <ThemesTab />
    </section>
  </div>
</template>

<style scoped>
.display-tab {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.display-tab__section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.display-tab__section-title {
  margin: 0;
  font-size: var(--font-body);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  opacity: 0.7;
}
</style>
