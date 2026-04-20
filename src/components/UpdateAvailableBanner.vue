<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  version: { type: String, default: '' },
})
const emit = defineEmits(['reload', 'dismiss'])

const { t } = useI18n()
</script>

<template>
  <Transition name="update-banner">
    <div class="update-banner" role="status" aria-live="polite" @click.stop>
      <span class="update-banner__title">{{ t('update.available.title') }}</span>
      <span v-if="version" class="update-banner__version">v{{ version }}</span>
      <button
        type="button"
        class="update-banner__btn update-banner__btn--primary"
        @click.stop="emit('reload')"
      >
        {{ t('update.available.reload') }}
      </button>
      <button
        type="button"
        class="update-banner__btn update-banner__btn--ghost"
        :aria-label="t('update.available.dismiss')"
        @click.stop="emit('dismiss')"
      >&#x2715;</button>
    </div>
  </Transition>
</template>

<style scoped>
.update-banner {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: var(--z-toast);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 16px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.55);
  color: var(--color-text);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  font-size: var(--font-md);
  max-width: calc(100vw - 32px);
}

.update-banner__title {
  font-weight: 600;
  line-height: 1.2;
}

.update-banner__version {
  font-family: monospace;
  opacity: 0.8;
}

.update-banner__btn {
  padding: 6px 14px;
  min-height: 36px;
  border-radius: 6px;
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.update-banner__btn--primary {
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
}

.update-banner__btn--primary:active {
  opacity: 0.7;
}

.update-banner__btn--ghost {
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  min-width: 36px;
  padding: 6px 10px;
}

.update-banner__btn--ghost:active {
  opacity: 0.4;
}

.update-banner-enter-active,
.update-banner-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.update-banner-enter-from,
.update-banner-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
