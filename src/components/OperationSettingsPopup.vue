<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ValueInput from './ValueInput.vue'
import SettingsToggle from './settings/SettingsToggle.vue'
import { LIMITS } from '../constants/limits'

const props = defineProps({
  /** Whether the popup is visible */
  visible: { type: Boolean, default: false },
  /** Which operation this popup edits: 'steam' | 'flush' | 'hotwater' */
  operationType: { type: String, default: 'steam' },
})

const emit = defineEmits(['close'])

// Live-apply model bindings. The parent (RecipeEditorPage) owns these refs —
// they are already wired into the live-apply watcher, comboValues(), and
// buildWorkflowUpdate(). Editing here mutates the parent ref directly; the
// parent's existing watcher fires and pushes the change to the workflow.
// An instance only binds the models its operationType actually uses.
const include = defineModel('include', { type: Boolean, default: false })
const duration = defineModel('duration', { type: Number, default: 0 })
const flow = defineModel('flow', { type: Number, default: 0 })
const temperature = defineModel('temperature', { type: Number, default: 0 })
const volume = defineModel('volume', { type: Number, default: 0 })

const { t } = useI18n()

const title = computed(() => {
  switch (props.operationType) {
    case 'flush': return t('recipe.flushSettings')
    case 'hotwater': return t('recipe.hotWaterSettings')
    default: return t('recipe.steamSettings')
  }
})

function onClose() {
  emit('close')
}
</script>

<template>
  <Transition name="popup-fade">
    <div
      v-if="visible"
      class="op-settings-popup"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @click.self="onClose"
      @keydown.esc="onClose"
    >
      <div class="op-settings-popup__card">
        <div class="op-settings-popup__header">
          <span class="op-settings-popup__title">{{ title }}</span>
          <button class="op-settings-popup__close" @click="onClose" aria-label="Close">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="op-settings-popup__body">
          <!-- Include toggle -->
          <div class="op-settings-popup__field">
            <label class="op-settings-popup__label">{{ t('recipe.includeInRecipe') }}</label>
            <SettingsToggle v-model="include" :aria-label="t('recipe.includeInRecipe')" />
          </div>

          <!-- Steam fields -->
          <template v-if="operationType === 'steam'">
            <div class="op-settings-popup__field">
              <label class="op-settings-popup__label">{{ t('recipe.duration') }}</label>
              <ValueInput
                v-model="duration"
                :min="LIMITS.duration.steamMin" :max="LIMITS.duration.steamMax" :step="1" :decimals="0"
                suffix=" s"
                value-color="var(--color-primary)"
                :aria-label="t('recipe.duration')"
              />
            </div>
            <div class="op-settings-popup__field">
              <label class="op-settings-popup__label">{{ t('recipe.flow') }}</label>
              <ValueInput
                v-model="flow"
                :min="LIMITS.flow.steamMin" :max="LIMITS.flow.steamMax" :step="0.05" :decimals="2"
                suffix=" mL/s"
                value-color="var(--color-primary)"
                :aria-label="t('recipe.flow')"
              />
            </div>
            <div class="op-settings-popup__field">
              <label class="op-settings-popup__label">{{ t('recipe.temperature') }}</label>
              <ValueInput
                v-model="temperature"
                :min="LIMITS.temp.steamMin" :max="LIMITS.temp.steamMax" :step="1" :decimals="0"
                suffix=" &deg;C"
                value-color="var(--color-temperature)"
                :aria-label="t('recipe.temperature')"
              />
            </div>
          </template>

          <!-- Flush fields (no temperature) -->
          <template v-else-if="operationType === 'flush'">
            <div class="op-settings-popup__field">
              <label class="op-settings-popup__label">{{ t('recipe.duration') }}</label>
              <ValueInput
                v-model="duration"
                :min="LIMITS.duration.flushMin" :max="LIMITS.duration.flushMax" :step="0.5" :decimals="1"
                suffix=" s"
                value-color="var(--color-primary)"
                :aria-label="t('recipe.duration')"
              />
            </div>
            <div class="op-settings-popup__field">
              <label class="op-settings-popup__label">{{ t('recipe.flowRate') }}</label>
              <ValueInput
                v-model="flow"
                :min="LIMITS.flow.flushMin" :max="LIMITS.flow.flushMax" :step="0.5" :decimals="1"
                suffix=" mL/s"
                value-color="var(--color-flow)"
                :aria-label="t('recipe.flowRate')"
              />
            </div>
          </template>

          <!-- Hot Water fields -->
          <template v-else-if="operationType === 'hotwater'">
            <div class="op-settings-popup__field">
              <label class="op-settings-popup__label">{{ t('recipe.volume') }}</label>
              <ValueInput
                v-model="volume"
                :min="LIMITS.weight.hotWaterMin" :max="LIMITS.weight.hotWaterMax" :step="10" :decimals="0"
                suffix=" g"
                value-color="var(--color-primary)"
                :aria-label="t('recipe.volume')"
              />
            </div>
            <div class="op-settings-popup__field">
              <label class="op-settings-popup__label">{{ t('recipe.temperature') }}</label>
              <ValueInput
                v-model="temperature"
                :min="LIMITS.temp.hotWaterMin" :max="LIMITS.temp.hotWaterMax" :step="1" :decimals="0"
                suffix=" &deg;C"
                value-color="var(--color-temperature)"
                :aria-label="t('recipe.temperature')"
              />
            </div>
          </template>
        </div>

        <div class="op-settings-popup__actions">
          <button class="op-settings-popup__btn op-settings-popup__btn--done" @click="onClose">
            {{ t('recipe.done') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.op-settings-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-modal);
  background: var(--color-overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
}

.op-settings-popup__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  width: 90%;
  max-width: 380px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.op-settings-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px;
}

.op-settings-popup__title {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
}

.op-settings-popup__close {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  -webkit-tap-highlight-color: transparent;
}

.op-settings-popup__close:active {
  background: var(--color-surface-pressed);
}

.op-settings-popup__body {
  padding: 8px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.op-settings-popup__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
}

.op-settings-popup__label {
  font-size: var(--font-body);
  color: var(--color-text);
  white-space: nowrap;
}

.op-settings-popup__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 16px 16px;
  gap: 8px;
}

.op-settings-popup__btn {
  height: 44px;
  padding: 0 24px;
  border-radius: 10px;
  border: none;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.op-settings-popup__btn:active {
  filter: brightness(0.85);
}

.op-settings-popup__btn--done {
  background: var(--color-primary);
  color: var(--color-text);
}

.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: opacity 0.15s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
}
</style>
