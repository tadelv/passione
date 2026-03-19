<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  /** 'machinePicker' or 'scalePicker' */
  ambiguityType: { type: String, default: null },
  /** Array of DeviceInfo objects to choose from */
  devices: { type: Array, default: () => [] },
})

const emit = defineEmits(['select', 'cancel'])

function label(type) {
  return type === 'machinePicker' ? 'machine' : 'scale'
}
</script>

<template>
  <div v-if="visible" class="device-picker" @click.self="emit('cancel')">
    <div class="device-picker__card">
      <div class="device-picker__header">
        <span class="device-picker__title">Select {{ label(ambiguityType) }}</span>
      </div>
      <p class="device-picker__desc">
        Multiple {{ label(ambiguityType) }}s found. Choose which one to connect:
      </p>
      <div class="device-picker__list">
        <button
          v-for="device in devices"
          :key="device.id"
          class="device-picker__device"
          @click="emit('select', device.id)"
        >
          <span class="device-picker__name">{{ device.name }}</span>
          <span class="device-picker__id">{{ device.id }}</span>
        </button>
      </div>
      <div class="device-picker__actions">
        <button class="device-picker__btn" @click="emit('cancel')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-picker {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.device-picker__card {
  width: 90%;
  max-width: 400px;
  border-radius: 12px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.device-picker__header {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

.device-picker__title {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}

.device-picker__desc {
  padding: 12px 16px 4px;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
}

.device-picker__list {
  padding: 8px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.device-picker__device {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.device-picker__device:active {
  opacity: 0.7;
}

.device-picker__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.device-picker__id {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-family: monospace;
}

.device-picker__actions {
  padding: 0 16px 16px;
  display: flex;
  justify-content: flex-end;
}

.device-picker__btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.device-picker__btn:active {
  opacity: 0.7;
}
</style>
