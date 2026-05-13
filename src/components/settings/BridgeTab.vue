<script setup>
import DeviceTab from './DeviceTab.vue'
import GatewayTab from './GatewayTab.vue'
</script>

<template>
  <div class="bridge-tab">
    <section class="bridge-tab__section">
      <DeviceTab />
    </section>

    <section class="bridge-tab__section">
      <h3 class="bridge-tab__section-title">Bridge Settings</h3>
      <GatewayTab />
    </section>
  </div>
</template>

<style scoped>
.bridge-tab {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.bridge-tab__section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bridge-tab__section-title {
  margin: 0;
  font-size: var(--font-body);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding-bottom: 4px;
  opacity: 0.7;
}
</style>
