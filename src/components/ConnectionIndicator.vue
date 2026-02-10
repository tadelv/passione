<script setup>
defineProps({
  connected: { type: Boolean, default: false },
  size: { type: Number, default: 10 },
})
</script>

<template>
  <span
    class="connection-indicator"
    :class="{ connected }"
    :style="{ width: size + 'px', height: size + 'px' }"
    :title="connected ? 'Connected' : 'Disconnected'"
  />
</template>

<style scoped>
.connection-indicator {
  display: inline-block;
  border-radius: 50%;
  background-color: var(--color-error);
  flex-shrink: 0;
  transition: background-color 0.3s ease;
}

.connection-indicator.connected {
  background-color: var(--color-success);
}
</style>
