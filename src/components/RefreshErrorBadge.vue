<script setup>
defineProps({
  failed: { type: Boolean, default: false },
})
</script>

<template>
  <span
    v-if="failed"
    class="refresh-error-badge"
    role="status"
    aria-label="Couldn't refresh — showing last known data"
    :title="'Couldn\'t refresh — showing last known data'"
  >
    <!-- inline SVG: cloud-off icon, sized to header line height -->
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.1 3.51 3.51 2.1l18.39 18.39-1.41 1.41-2.55-2.55Q17.32 20 16 20H6q-2.485 0-4.243-1.757Q0 16.485 0 14q0-2.225 1.412-3.85.964-1.108 2.378-1.6L2.1 3.51Zm6.34 4.51L21.6 21.18Q22.97 19.97 23.5 18.13 24 16.36 24 14.5q0-2.485-1.757-4.243Q20.485 8.5 18 8.5q-.36 0-.7.04Q16.5 5.5 13.85 4.115 11.2 2.73 8.5 3.06l-.06 4.96Z"
      />
    </svg>
  </span>
</template>

<style scoped>
.refresh-error-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 0.5rem;
  color: var(--color-warning, #d97706);
  cursor: help;
  vertical-align: middle;
}
</style>
