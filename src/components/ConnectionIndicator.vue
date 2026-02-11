<script setup>
defineProps({
  connected: { type: Boolean, default: false },
  size: { type: Number, default: 10 },
  /** Optional detail text shown next to the dot */
  detail: { type: String, default: '' },
})
</script>

<template>
  <span class="connection-indicator">
    <span
      class="connection-indicator__dot"
      :class="{ 'connection-indicator__dot--connected': connected }"
      :style="{ width: size + 'px', height: size + 'px' }"
      :title="connected ? 'Connected' : 'Disconnected'"
    />
    <span v-if="detail" class="connection-indicator__detail">{{ detail }}</span>
  </span>
</template>

<style scoped>
.connection-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.connection-indicator__dot {
  display: inline-block;
  border-radius: 50%;
  background-color: var(--color-error);
  flex-shrink: 0;
  transition: background-color 0.3s ease;
}

.connection-indicator__dot--connected {
  background-color: var(--color-success);
}

.connection-indicator__detail {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
  white-space: nowrap;
}
</style>
