<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import ValueInput from './ValueInput.vue'

const { t } = useI18n()

const props = defineProps({
  visible: { type: Boolean, default: false },
  profileName: { type: String, default: '' },
  temperature: { type: Number, default: 93 },
  doseIn: { type: Number, default: 18 },
  doseOut: { type: Number, default: 36 },
  scaleWeight: { type: Number, default: 0 },
  grinderName: { type: String, default: '' },
  grindSetting: { type: Number, default: 0 },
  showExtendedFields: { type: Boolean, default: false },
})

const emit = defineEmits([
  'start',
  'cancel',
  'update-temperature',
  'update-yield',
  'tare-scale',
  'update-grinder',
  'use-last-shot',
])

const localTemp = ref(props.temperature)
const localDoseIn = ref(props.doseIn)
const localDoseOut = ref(props.doseOut)
const localGrinderName = ref(props.grinderName)
const localGrindSetting = ref(props.grindSetting)

// P6-4: Ref for the dialog card (focus trap container)
const cardRef = ref(null)

watch(() => props.visible, (val) => {
  if (val) {
    localTemp.value = props.temperature
    localDoseIn.value = props.doseIn
    localDoseOut.value = props.doseOut
    localGrinderName.value = props.grinderName
    localGrindSetting.value = props.grindSetting
    // P6-4: Auto-focus first focusable element when dialog opens
    nextTick(() => {
      if (cardRef.value) {
        const focusable = cardRef.value.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable) focusable.focus()
      }
    })
  }
})

const ratio = computed(() => {
  if (localDoseIn.value > 0 && localDoseOut.value > 0) {
    return (localDoseOut.value / localDoseIn.value).toFixed(1)
  }
  return '0.0'
})

const ratioDescription = computed(() => {
  const r = parseFloat(ratio.value)
  if (r <= 0) return ''
  if (r < 1.5) return t('brew.ristretto')
  if (r <= 2.5) return t('brew.normale')
  if (r <= 3.5) return t('brew.lungo')
  return t('brew.extraLungo')
})

function readScale() {
  localDoseIn.value = Math.round(props.scaleWeight * 10) / 10
  emit('tare-scale')
}

function onStart() {
  emit('start', {
    temperature: localTemp.value,
    doseIn: localDoseIn.value,
    doseOut: localDoseOut.value,
  })
}

function onCancel() {
  emit('cancel')
}

function onUpdateTemperature() {
  emit('update-temperature', localTemp.value)
}

function onUpdateYield() {
  emit('update-yield', localDoseOut.value)
}

function onGrinderNameInput(e) {
  localGrinderName.value = e.target.value
  emitGrinderUpdate()
}

function onGrindSettingChange(val) {
  localGrindSetting.value = val
  emitGrinderUpdate()
}

function emitGrinderUpdate() {
  emit('update-grinder', {
    name: localGrinderName.value,
    setting: localGrindSetting.value,
  })
}

function onUseLastShot() {
  emit('use-last-shot')
}

// P6-4: Focus trap — wrap Tab between first and last focusable elements
function onDialogKeydown(e) {
  if (e.key === 'Escape') {
    onCancel()
    return
  }
  if (e.key !== 'Tab') return
  if (!cardRef.value) return

  const focusables = cardRef.value.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  if (focusables.length === 0) return

  const first = focusables[0]
  const last = focusables[focusables.length - 1]

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault()
      last.focus()
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}
</script>

<template>
  <Transition name="brew-dialog-fade">
    <div v-if="visible" class="brew-dialog" @click.self="onCancel" @keydown="onDialogKeydown">
      <div
        class="brew-dialog__card"
        ref="cardRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brew-dialog-title"
      >
        <div class="brew-dialog__header">
          <span class="brew-dialog__title" id="brew-dialog-title">{{ t('brew.title') }}</span>
          <span v-if="profileName" class="brew-dialog__profile">{{ profileName }}</span>
        </div>

        <div class="brew-dialog__body">
          <!-- Temperature -->
          <div class="brew-dialog__row">
            <div class="brew-dialog__row-label">
              <span class="brew-dialog__label">{{ t('brew.temperature') }}</span>
              <button class="brew-dialog__link" @click="onUpdateTemperature">
                {{ t('brew.updateProfile') }}
              </button>
            </div>
            <ValueInput
              :model-value="localTemp"
              :min="70"
              :max="100"
              :step="0.5"
              :decimals="1"
              suffix="&deg;C"
              value-color="var(--color-temperature)"
              aria-label="Temperature"
              @update:model-value="localTemp = $event"
            />
          </div>

          <!-- Dose In -->
          <div class="brew-dialog__row">
            <div class="brew-dialog__row-label">
              <span class="brew-dialog__label">{{ t('brew.doseIn') }}</span>
              <button class="brew-dialog__link" @click="readScale">
                {{ t('brew.readScale') }}
              </button>
            </div>
            <ValueInput
              :model-value="localDoseIn"
              :min="5"
              :max="50"
              :step="0.1"
              :decimals="1"
              suffix=" g"
              value-color="var(--color-text)"
              aria-label="Dose in"
              @update:model-value="localDoseIn = $event"
            />
          </div>

          <!-- Dose Out / Yield -->
          <div class="brew-dialog__row">
            <div class="brew-dialog__row-label">
              <span class="brew-dialog__label">{{ t('brew.yield') }}</span>
              <button class="brew-dialog__link" @click="onUpdateYield">
                {{ t('brew.updateProfile') }}
              </button>
            </div>
            <ValueInput
              :model-value="localDoseOut"
              :min="10"
              :max="150"
              :step="0.5"
              :decimals="1"
              suffix=" g"
              value-color="var(--color-text)"
              aria-label="Yield"
              @update:model-value="localDoseOut = $event"
            />
          </div>

          <!-- Prominent ratio display -->
          <div class="brew-dialog__ratio-box">
            <span class="brew-dialog__ratio-value">1:{{ ratio }}</span>
            <span v-if="ratioDescription" class="brew-dialog__ratio-desc">{{ ratioDescription }}</span>
          </div>

          <!-- Extended fields: Grinder (conditional) -->
          <template v-if="showExtendedFields">
            <div class="brew-dialog__divider" />

            <!-- Grinder Name -->
            <div class="brew-dialog__row">
              <div class="brew-dialog__row-label">
                <span class="brew-dialog__label">{{ t('brew.grinder') }}</span>
              </div>
              <input
                type="text"
                class="brew-dialog__text-input"
                :value="localGrinderName"
                :placeholder="t('brew.grinderPlaceholder')"
                @input="onGrinderNameInput"
              />
            </div>

            <!-- Grind Setting -->
            <div class="brew-dialog__row">
              <div class="brew-dialog__row-label">
                <span class="brew-dialog__label">{{ t('brew.grindSetting') }}</span>
              </div>
              <ValueInput
                :model-value="localGrindSetting"
                :min="0"
                :max="100"
                :step="0.5"
                :decimals="1"
                suffix=""
                value-color="var(--color-text)"
                aria-label="Grind setting"
                @update:model-value="onGrindSettingChange"
              />
            </div>
          </template>
        </div>

        <div class="brew-dialog__actions">
          <button class="brew-dialog__btn brew-dialog__btn--cancel" @click="onCancel">
            {{ t('common.cancel') }}
          </button>
          <button class="brew-dialog__btn brew-dialog__btn--last-shot" @click="onUseLastShot">
            {{ t('brew.useLastShot') }}
          </button>
          <button class="brew-dialog__btn brew-dialog__btn--start" @click="onStart">
            {{ t('brew.startBrewing') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.brew-dialog {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-modal);
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.brew-dialog__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  width: 90%;
  max-width: 420px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.brew-dialog__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 16px 8px;
}

.brew-dialog__title {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
}

.brew-dialog__profile {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brew-dialog__body {
  padding: 8px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.brew-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brew-dialog__row-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.brew-dialog__label {
  font-size: var(--font-body);
  color: var(--color-text);
}

.brew-dialog__link {
  font-size: var(--font-caption);
  color: var(--color-primary);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.brew-dialog__link:active {
  opacity: 0.7;
}

.brew-dialog__ratio-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 0;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.brew-dialog__ratio-value {
  font-size: var(--font-heading);
  font-weight: bold;
  color: var(--color-primary);
}

.brew-dialog__ratio-desc {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.brew-dialog__divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

.brew-dialog__text-input {
  width: 160px;
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-text-secondary);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-body);
}

.brew-dialog__text-input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.brew-dialog__text-input::placeholder {
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.brew-dialog__actions {
  display: flex;
  gap: 8px;
  padding: 8px 16px 16px;
}

.brew-dialog__btn {
  flex: 1;
  height: 48px;
  border-radius: 12px;
  border: none;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.brew-dialog__btn:active {
  filter: brightness(0.85);
}

.brew-dialog__btn--cancel {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  flex: 0.7;
}

.brew-dialog__btn--last-shot {
  background: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  flex: 0.8;
}

.brew-dialog__btn--start {
  background: var(--color-primary);
  color: var(--color-text);
  flex: 1;
}

.brew-dialog-fade-enter-active,
.brew-dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}

.brew-dialog-fade-enter-from,
.brew-dialog-fade-leave-to {
  opacity: 0;
}
</style>
