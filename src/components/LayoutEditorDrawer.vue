<script setup>
import { ref, computed } from 'vue'
import { useLayout } from '../composables/useLayout.js'

const props = defineProps({
  zone: { type: String, required: true },
})

const emit = defineEmits(['close'])

const {
  layout,
  setZoneWidgets,
  WIDGET_TYPES,
  WIDGET_LABELS,
  WIDGET_ZONE_RULES,
  STACK_ZONES,
  ZONE_LABELS,
} = useLayout()

const isStack = computed(() => STACK_ZONES.has(props.zone))

const widgets = computed(() => layout.value.zones[props.zone]?.widgets ?? [])

const availableWidgets = computed(() => {
  const isCenter = STACK_ZONES.has(props.zone)
  return WIDGET_TYPES.filter(wt => {
    const rule = WIDGET_ZONE_RULES[wt]
    return rule === 'any' || (rule === 'center' && isCenter) || (rule === 'edge' && !isCenter)
  })
})

const unusedWidgets = computed(() => {
  const current = new Set(widgets.value)
  return availableWidgets.value.filter(wt => !current.has(wt))
})

const addWidgetType = ref('')

function moveWidget(index, direction) {
  const arr = [...widgets.value]
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= arr.length) return
  ;[arr[index], arr[newIndex]] = [arr[newIndex], arr[index]]
  setZoneWidgets(props.zone, arr)
}

function removeWidget(index) {
  const arr = [...widgets.value]
  arr.splice(index, 1)
  setZoneWidgets(props.zone, arr)
}

function addWidget() {
  if (!addWidgetType.value) return
  setZoneWidgets(props.zone, [...widgets.value, addWidgetType.value])
  addWidgetType.value = ''
}
</script>

<template>
  <div class="drawer-backdrop" @click.self="emit('close')" @keydown.escape="emit('close')">
    <div class="drawer" role="dialog" aria-label="Layout editor">
      <div class="drawer__handle" />

      <h3 class="drawer__title">
        {{ ZONE_LABELS[zone] }}
        <span class="drawer__hint">{{ isStack ? '(vertical stack)' : '(horizontal row)' }}</span>
      </h3>

      <div v-if="widgets.length" class="drawer__list">
        <div v-for="(wt, idx) in widgets" :key="idx" class="drawer__row">
          <span class="drawer__widget-name">{{ WIDGET_LABELS[wt] || wt }}</span>
          <div class="drawer__row-actions">
            <button
              class="drawer__btn"
              :disabled="idx === 0"
              @click="moveWidget(idx, -1)"
              :aria-label="isStack ? 'Move up' : 'Move left'"
            >{{ isStack ? '\u2191' : '\u2190' }}</button>
            <button
              class="drawer__btn"
              :disabled="idx === widgets.length - 1"
              @click="moveWidget(idx, 1)"
              :aria-label="isStack ? 'Move down' : 'Move right'"
            >{{ isStack ? '\u2193' : '\u2192' }}</button>
            <button
              class="drawer__btn drawer__btn--remove"
              @click="removeWidget(idx)"
              aria-label="Remove widget"
            >&times;</button>
          </div>
        </div>
      </div>
      <p v-else class="drawer__empty">No widgets in this zone.</p>

      <div v-if="unusedWidgets.length" class="drawer__add-row">
        <select class="drawer__select" v-model="addWidgetType">
          <option value="" disabled>Add widget...</option>
          <option v-for="wt in unusedWidgets" :key="wt" :value="wt">
            {{ WIDGET_LABELS[wt] || wt }}
          </option>
        </select>
        <button class="drawer__add-btn" :disabled="!addWidgetType" @click="addWidget">Add</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  pointer-events: auto;
}

.drawer {
  width: 100%;
  max-width: 600px;
  max-height: 50vh;
  overflow-y: auto;
  background: var(--color-surface);
  border-radius: 16px 16px 0 0;
  padding: 12px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: slide-up 0.2s ease-out;
}

@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.drawer__handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-text-secondary);
  opacity: 0.4;
  align-self: center;
  margin-bottom: 4px;
}

.drawer__title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.drawer__hint {
  font-size: var(--font-sm);
  font-weight: 400;
  color: var(--color-text-secondary);
  margin-left: 8px;
}

.drawer__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drawer__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
}

.drawer__widget-name {
  font-size: var(--font-md);
  color: var(--color-text);
  font-weight: 500;
}

.drawer__row-actions {
  display: flex;
  gap: 4px;
}

.drawer__btn {
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-body);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}

.drawer__btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  cursor: default;
}

.drawer__btn:not(:disabled):active {
  opacity: 0.7;
}

.drawer__btn--remove {
  color: var(--color-error);
  border-color: var(--color-error);
}

.drawer__empty {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  font-style: italic;
  margin: 0;
}

.drawer__add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.drawer__select {
  flex: 1;
  min-width: 140px;
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-md);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.drawer__add-btn {
  padding: 8px 20px;
  height: 44px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
}

.drawer__add-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  cursor: default;
}
</style>
