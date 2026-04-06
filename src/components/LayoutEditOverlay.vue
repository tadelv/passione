<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLayout } from '../composables/useLayout.js'
import LayoutEditorDrawer from './LayoutEditorDrawer.vue'

const router = useRouter()
const { ZONE_NAMES, ZONE_LABELS } = useLayout()

const selectedZone = ref(null)

function selectZone(zoneName) {
  selectedZone.value = zoneName
}

function closeDrawer() {
  selectedZone.value = null
}

function done() {
  selectedZone.value = null
  router.replace({ path: '/', query: {} })
}
</script>

<template>
  <div class="edit-overlay">
    <!-- Zone tap targets -->
    <div
      v-for="zoneName in ZONE_NAMES"
      :key="zoneName"
      class="edit-overlay__zone"
      :class="[
        `edit-overlay__zone--${zoneName}`,
        { 'edit-overlay__zone--selected': selectedZone === zoneName },
      ]"
      role="button"
      :aria-label="`Edit ${ZONE_LABELS[zoneName]} zone`"
      tabindex="0"
      @click="selectZone(zoneName)"
      @keydown.enter="selectZone(zoneName)"
      @keydown.space.prevent="selectZone(zoneName)"
    >
      <span class="edit-overlay__zone-label">{{ ZONE_LABELS[zoneName] }}</span>
    </div>

    <!-- Done pill -->
    <button class="edit-overlay__done" @click="done" aria-label="Exit layout editor">
      Done
    </button>

    <!-- Bottom drawer -->
    <LayoutEditorDrawer
      v-if="selectedZone"
      :zone="selectedZone"
      @close="closeDrawer"
    />
  </div>
</template>

<style scoped>
.edit-overlay {
  position: absolute;
  inset: 0;
  z-index: var(--z-popover);
  pointer-events: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "topLeft     topRight"
    "centerLeft  centerRight"
    "bottomLeft  bottomRight";
  padding: var(--margin-standard);
  gap: var(--spacing-large);
}

.edit-overlay__zone {
  pointer-events: auto;
  border: 2px dashed var(--color-text-secondary);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
  position: relative;
  min-height: 44px;
}

.edit-overlay__zone:hover {
  border-color: var(--color-text);
  background: rgba(255, 255, 255, 0.03);
}

.edit-overlay__zone--selected {
  border-color: var(--color-primary);
  border-style: solid;
  background: rgba(255, 255, 255, 0.05);
}

.edit-overlay__zone--topLeft       { grid-area: topLeft; }
.edit-overlay__zone--topRight      { grid-area: topRight; }
.edit-overlay__zone--centerLeft    { grid-area: centerLeft; }
.edit-overlay__zone--centerRight   { grid-area: centerRight; }
.edit-overlay__zone--bottomLeft    { grid-area: bottomLeft; }
.edit-overlay__zone--bottomRight   { grid-area: bottomRight; }

.edit-overlay__zone-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--color-surface);
  padding: 2px 8px;
  border-radius: 4px;
  pointer-events: none;
}

.edit-overlay__zone--selected .edit-overlay__zone-label {
  color: var(--color-primary);
}

.edit-overlay__done {
  pointer-events: auto;
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: calc(var(--z-popover) + 1);
  padding: 10px 32px;
  border-radius: 24px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  -webkit-tap-highlight-color: transparent;
  min-height: var(--touch-target-min);
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-overlay__done:active {
  filter: brightness(0.85);
}
</style>
