<script setup>
import { ref, watch, computed } from 'vue'
import ValueInput from './ValueInput.vue'

const props = defineProps({
  /** Whether the popup is visible */
  visible: { type: Boolean, default: false },
  /** The preset being edited (null = new preset) */
  preset: { type: Object, default: null },
  /**
   * Operation type determines which fields to show.
   * 'steam' | 'hotwater' | 'flush' | 'bean' | 'combo'
   */
  operationType: { type: String, default: 'steam' },
  /** Whether this is an existing preset (shows delete button) */
  isExisting: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'delete', 'cancel'])

const name = ref('')
const emoji = ref('')

// Steam fields
const steamDuration = ref(30)
const steamFlow = ref(1.5)

// Hot water fields
const hotWaterVolume = ref(200)
const hotWaterTemperature = ref(80)

// Flush fields
const flushDuration = ref(5)
const flushFlow = ref(6.0)

const showDeleteConfirm = ref(false)

const title = computed(() => {
  if (props.isExisting) return 'Edit Preset'
  return 'New Preset'
})

watch(() => props.visible, (val) => {
  if (val && props.preset) {
    name.value = props.preset.name || ''
    emoji.value = props.preset.emoji || ''
    // Load operation-specific fields
    if (props.operationType === 'steam') {
      steamDuration.value = props.preset.duration ?? 30
      steamFlow.value = props.preset.flow ?? 1.5
    } else if (props.operationType === 'hotwater') {
      hotWaterVolume.value = props.preset.volume ?? 200
      hotWaterTemperature.value = props.preset.temperature ?? 80
    } else if (props.operationType === 'flush') {
      flushDuration.value = props.preset.duration ?? 5
      flushFlow.value = props.preset.flow ?? 6.0
    }
  } else if (val) {
    // Defaults for new preset
    name.value = ''
    emoji.value = ''
    steamDuration.value = 30
    steamFlow.value = 1.5
    hotWaterVolume.value = 200
    hotWaterTemperature.value = 80
    flushDuration.value = 5
    flushFlow.value = 6.0
  }
  showDeleteConfirm.value = false
})

function buildResult() {
  const result = {
    name: name.value,
    emoji: emoji.value,
  }
  if (props.operationType === 'steam') {
    result.duration = steamDuration.value
    result.flow = steamFlow.value
  } else if (props.operationType === 'hotwater') {
    result.volume = hotWaterVolume.value
    result.temperature = hotWaterTemperature.value
  } else if (props.operationType === 'flush') {
    result.duration = flushDuration.value
    result.flow = flushFlow.value
  }
  return result
}

function onSave() {
  emit('save', buildResult())
}

function onDelete() {
  if (!showDeleteConfirm.value) {
    showDeleteConfirm.value = true
    return
  }
  emit('delete')
}

function onCancel() {
  emit('cancel')
}
</script>

<template>
  <Transition name="popup-fade">
    <div v-if="visible" class="preset-edit-popup" role="dialog" aria-modal="true" aria-label="Edit preset" @click.self="onCancel" @keydown.esc="onCancel">
      <div class="preset-edit-popup__card">
        <div class="preset-edit-popup__header">
          <span class="preset-edit-popup__title">{{ title }}</span>
          <button class="preset-edit-popup__close" @click="onCancel" aria-label="Close">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="preset-edit-popup__body">
          <!-- Name -->
          <div class="preset-edit-popup__field">
            <label class="preset-edit-popup__label">Name</label>
            <input
              v-model="name"
              class="preset-edit-popup__input"
              type="text"
              placeholder="Preset name"
              maxlength="40"
            />
          </div>

          <!-- Emoji -->
          <div class="preset-edit-popup__field">
            <label class="preset-edit-popup__label">Emoji</label>
            <input
              v-model="emoji"
              class="preset-edit-popup__input preset-edit-popup__input--emoji"
              type="text"
              placeholder="Pick an emoji"
              maxlength="4"
            />
          </div>

          <!-- Steam-specific fields -->
          <template v-if="operationType === 'steam'">
            <div class="preset-edit-popup__field">
              <label class="preset-edit-popup__label">Duration</label>
              <ValueInput
                :model-value="steamDuration"
                :min="1" :max="120" :step="1" :decimals="0"
                suffix=" s"
                value-color="var(--color-primary)"
                @update:model-value="steamDuration = $event"
              />
            </div>
            <div class="preset-edit-popup__field">
              <label class="preset-edit-popup__label">Steam Flow</label>
              <ValueInput
                :model-value="steamFlow"
                :min="0.4" :max="2.5" :step="0.05" :decimals="2"
                suffix=" mL/s"
                value-color="var(--color-primary)"
                @update:model-value="steamFlow = $event"
              />
            </div>
          </template>

          <!-- Hot water-specific fields -->
          <template v-if="operationType === 'hotwater'">
            <div class="preset-edit-popup__field">
              <label class="preset-edit-popup__label">Volume / Weight</label>
              <ValueInput
                :model-value="hotWaterVolume"
                :min="50" :max="500" :step="10" :decimals="0"
                suffix=" g"
                value-color="var(--color-primary)"
                @update:model-value="hotWaterVolume = $event"
              />
            </div>
            <div class="preset-edit-popup__field">
              <label class="preset-edit-popup__label">Temperature</label>
              <ValueInput
                :model-value="hotWaterTemperature"
                :min="40" :max="100" :step="1" :decimals="0"
                suffix="&deg;C"
                value-color="var(--color-temperature)"
                @update:model-value="hotWaterTemperature = $event"
              />
            </div>
          </template>

          <!-- Flush-specific fields -->
          <template v-if="operationType === 'flush'">
            <div class="preset-edit-popup__field">
              <label class="preset-edit-popup__label">Duration</label>
              <ValueInput
                :model-value="flushDuration"
                :min="1" :max="30" :step="0.5" :decimals="1"
                suffix=" s"
                value-color="var(--color-primary)"
                @update:model-value="flushDuration = $event"
              />
            </div>
            <div class="preset-edit-popup__field">
              <label class="preset-edit-popup__label">Flow Rate</label>
              <ValueInput
                :model-value="flushFlow"
                :min="2" :max="10" :step="0.5" :decimals="1"
                suffix=" mL/s"
                value-color="var(--color-flow)"
                @update:model-value="flushFlow = $event"
              />
            </div>
          </template>
        </div>

        <div class="preset-edit-popup__actions">
          <button
            v-if="isExisting"
            class="preset-edit-popup__btn preset-edit-popup__btn--delete"
            @click="onDelete"
          >
            {{ showDeleteConfirm ? 'Confirm Delete' : 'Delete' }}
          </button>
          <span class="preset-edit-popup__spacer" />
          <button class="preset-edit-popup__btn preset-edit-popup__btn--cancel" @click="onCancel">
            Cancel
          </button>
          <button class="preset-edit-popup__btn preset-edit-popup__btn--save" @click="onSave">
            Save
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.preset-edit-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 600;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.preset-edit-popup__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  width: 90%;
  max-width: 380px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preset-edit-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px;
}

.preset-edit-popup__title {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
}

.preset-edit-popup__close {
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

.preset-edit-popup__close:active {
  background: rgba(255, 255, 255, 0.1);
}

.preset-edit-popup__body {
  padding: 8px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.preset-edit-popup__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preset-edit-popup__label {
  font-size: var(--font-body);
  color: var(--color-text);
  white-space: nowrap;
}

.preset-edit-popup__input {
  flex: 1;
  max-width: 200px;
  height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-body);
  outline: none;
}

.preset-edit-popup__input:focus {
  border-color: var(--color-primary);
}

.preset-edit-popup__input--emoji {
  max-width: 80px;
  text-align: center;
  font-size: 24px;
}

.preset-edit-popup__actions {
  display: flex;
  align-items: center;
  padding: 8px 16px 16px;
  gap: 8px;
}

.preset-edit-popup__spacer {
  flex: 1;
}

.preset-edit-popup__btn {
  height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  border: none;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.preset-edit-popup__btn:active {
  filter: brightness(0.85);
}

.preset-edit-popup__btn--save {
  background: var(--color-primary);
  color: var(--color-text);
}

.preset-edit-popup__btn--cancel {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.preset-edit-popup__btn--delete {
  background: var(--color-error);
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
