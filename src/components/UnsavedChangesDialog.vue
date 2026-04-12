<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  visible: { type: Boolean, default: false },
  comboSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'save-as-new', 'discard', 'keep-changes', 'close'])
const { t } = useI18n()
</script>

<template>
  <transition name="ucd-fade">
    <div
      v-if="visible"
      class="ucd"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ucd-title"
      @click.self="emit('close')"
    >
      <div class="ucd__panel">
        <h2 id="ucd-title" class="ucd__title">{{ t('workflowEditor.unsavedTitle') }}</h2>
        <p class="ucd__body">{{ t('workflowEditor.unsavedBody') }}</p>
        <div class="ucd__actions">
          <button
            v-if="comboSelected"
            class="ucd__btn ucd__btn--primary"
            data-testid="ucd-save"
            @click="emit('save')"
          >
            {{ t('workflowEditor.unsavedSave') }}
          </button>
          <button
            class="ucd__btn"
            data-testid="ucd-save-as-new"
            @click="emit('save-as-new')"
          >
            {{ t('workflowEditor.unsavedSaveAsNew') }}
          </button>
          <button
            class="ucd__btn ucd__btn--subtle"
            data-testid="ucd-keep-changes"
            @click="emit('keep-changes')"
          >
            <span class="ucd__btn-label">{{ t('workflowEditor.unsavedKeepChanges') }}</span>
            <span class="ucd__btn-hint">{{ t('workflowEditor.unsavedKeepChangesHint') }}</span>
          </button>
          <button
            class="ucd__btn ucd__btn--subtle"
            data-testid="ucd-discard"
            @click="emit('discard')"
          >
            <span class="ucd__btn-label">{{ t('workflowEditor.unsavedDiscard') }}</span>
            <span class="ucd__btn-hint">{{ t('workflowEditor.unsavedDiscardHint') }}</span>
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.ucd {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: var(--z-dialog, 1000);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.ucd__panel {
  max-width: 440px;
  width: 100%;
  background: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ucd__title {
  font-size: var(--font-title);
  color: var(--color-text);
  margin: 0;
}

.ucd__body {
  font-size: var(--font-body);
  color: var(--color-text-secondary);
  margin: 0;
}

.ucd__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ucd__btn {
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  -webkit-tap-highlight-color: transparent;
}

.ucd__btn--primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.ucd__btn--subtle {
  background: transparent;
}

.ucd__btn-label {
  font-size: var(--font-body);
  font-weight: 600;
}

.ucd__btn-hint {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  font-weight: 400;
}

.ucd-fade-enter-active,
.ucd-fade-leave-active {
  transition: opacity 0.15s ease;
}

.ucd-fade-enter-from,
.ucd-fade-leave-to {
  opacity: 0;
}
</style>
