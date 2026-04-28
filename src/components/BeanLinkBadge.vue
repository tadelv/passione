<script setup>
defineProps({
  linked: { type: Boolean, default: false },
  beanName: { type: String, default: '' },
  batchLabel: { type: String, default: '' },
})
defineEmits(['clear'])
</script>

<template>
  <div v-if="linked" class="bean-link-badge">
    <span class="bean-link-badge__label">Linked:</span>
    <span class="bean-link-badge__name">{{ beanName }}</span>
    <span v-if="batchLabel" class="bean-link-badge__batch"> — {{ batchLabel }}</span>
    <button type="button" class="bean-link-badge__clear" @click="$emit('clear')">
      Clear link
    </button>
  </div>
</template>

<style scoped>
.bean-link-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: var(--color-surface-2, rgba(255,255,255,0.04));
  border-radius: 6px;
  font-size: var(--font-small, 0.875rem);
}
.bean-link-badge__label { opacity: 0.7; }
.bean-link-badge__name { font-weight: 600; }
.bean-link-badge__batch { opacity: 0.85; }
.bean-link-badge__clear {
  background: none;
  border: 0;
  color: var(--color-link, #6aa9ff);
  cursor: pointer;
  padding: 0 0.25rem;
}
</style>
