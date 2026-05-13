<script setup>
defineProps({
  title: { type: String, default: '' },
})
</script>

<template>
  <section class="settings-section">
    <header v-if="title || $slots.title" class="settings-section__header">
      <h2 class="settings-section__title">
        <slot name="title">{{ title }}</slot>
      </h2>
      <div v-if="$slots.actions" class="settings-section__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="settings-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.settings-section__title {
  margin: 0;
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.2;
}

.settings-section__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-section__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
