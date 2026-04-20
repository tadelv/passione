<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  error: { type: Object, default: null },
  action: { type: Object, default: null },
})
const emit = defineEmits(['dismiss', 'action'])

const { t } = useI18n()

const title = computed(() => {
  const err = props.error
  if (!err) return ''
  const key = `connErr.${err.kind}.title`
  const v = t(key)
  return v === key ? (err.message ?? err.kind) : v
})

const detail = computed(() => {
  const err = props.error
  if (!err) return ''
  const key = `connErr.${err.kind}.suggestion`
  const v = t(key)
  if (v !== key) return v
  return err.suggestion ?? ''
})

const actionLabel = computed(() => {
  if (!props.action) return ''
  return t(props.action.labelKey)
})
</script>

<template>
  <Transition name="banner-slide">
    <div
      v-if="error"
      class="conn-err-banner"
      :class="{ 'conn-err-banner--warning': error.severity === 'warning' }"
      role="alert"
      aria-live="assertive"
    >
      <span class="conn-err-banner__icon" aria-hidden="true">&#x26A0;</span>
      <div class="conn-err-banner__body">
        <span class="conn-err-banner__title">{{ title }}</span>
        <span v-if="detail" class="conn-err-banner__detail">{{ detail }}</span>
      </div>
      <button
        v-if="action"
        type="button"
        class="conn-err-banner__action"
        @click="emit('action')"
      >
        {{ actionLabel }}
      </button>
      <button
        type="button"
        class="conn-err-banner__dismiss"
        :aria-label="t('connErr.dismiss')"
        @click="emit('dismiss')"
      >&#x2715;</button>
    </div>
  </Transition>
</template>

<style scoped>
.conn-err-banner {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: var(--z-toast);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--color-toast-error, #c53030);
  color: var(--color-text);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}

.conn-err-banner--warning {
  background: var(--color-toast-warning, #d97706);
  color: var(--color-background);
}

.conn-err-banner__icon {
  font-size: var(--font-lg, 20px);
  flex-shrink: 0;
}

.conn-err-banner__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.conn-err-banner__title {
  font-size: var(--font-body);
  font-weight: 600;
  line-height: 1.3;
}

.conn-err-banner__detail {
  font-size: var(--font-md);
  opacity: 0.9;
  line-height: 1.3;
}

.conn-err-banner__action {
  flex-shrink: 0;
  padding: 8px 16px;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.conn-err-banner__action:active {
  opacity: 0.7;
}

.conn-err-banner__dismiss {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: var(--font-body);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.conn-err-banner__dismiss:active {
  opacity: 0.6;
}

.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.banner-slide-enter-from,
.banner-slide-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
