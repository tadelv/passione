<script setup>
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

defineProps({
  title: { type: String, default: '' },
  showBackButton: { type: Boolean, default: true },
  barColor: { type: String, default: 'var(--color-primary)' },
})

const emit = defineEmits(['back'])

function onBack() {
  emit('back')
  if (route.path !== '/') {
    router.push('/')
  }
}
</script>

<template>
  <nav class="bottom-bar" :style="{ backgroundColor: barColor }">
    <button
      v-if="showBackButton"
      class="bottom-bar__back"
      @click="onBack"
      aria-label="Back"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>

    <span v-if="title" class="bottom-bar__title">{{ title }}</span>

    <span class="bottom-bar__spacer" />

    <div class="bottom-bar__content">
      <slot />
    </div>
  </nav>
</template>

<style scoped>
.bottom-bar {
  display: flex;
  align-items: center;
  height: var(--bottom-bar-height);
  padding: 0 var(--spacing-large) 0 var(--chart-margin-small);
  flex-shrink: 0;
  gap: var(--spacing-medium);
  z-index: 10;
}

.bottom-bar__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--bottom-bar-height);
  height: var(--bottom-bar-height);
  border: none;
  background: transparent;
  color: white;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.bottom-bar__back:active {
  opacity: 0.7;
}

.bottom-bar__title {
  font-size: 20px;
  font-weight: bold;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bottom-bar__spacer {
  flex: 1;
}

.bottom-bar__content {
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
  color: white;
  font-size: var(--font-body);
}
</style>
