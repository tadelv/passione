<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLayout } from '../../composables/useLayout.js'

const router = useRouter()
const { loaded, load, resetLayout } = useLayout()

const saving = ref(false)
const saveMessage = ref('')
let saveMessageTimer = null

onMounted(async () => {
  if (!loaded.value) await load()
})

function openEditor() {
  router.push({ path: '/', query: { editLayout: 'true' } })
}

onUnmounted(() => {
  clearTimeout(saveMessageTimer)
})

async function onReset() {
  saving.value = true
  await resetLayout()
  saving.value = false
  saveMessage.value = 'Reset to default'
  saveMessageTimer = setTimeout(() => { saveMessage.value = '' }, 2000)
}
</script>

<template>
  <div class="layout-tab" v-if="loaded">
    <p class="layout-tab__description">
      Customize which widgets appear in each zone of the home screen.
    </p>

    <div class="layout-tab__actions">
      <button class="layout-tab__edit-btn" @click="openEditor">
        Edit Layout
      </button>
      <button
        class="layout-tab__reset-btn"
        :disabled="saving"
        @click="onReset"
      >Reset to Default</button>
      <span v-if="saveMessage" class="layout-tab__save-message">{{ saveMessage }}</span>
      <span v-if="saving" class="layout-tab__save-message">Saving...</span>
    </div>
  </div>
  <div v-else class="layout-tab__loading">Loading layout...</div>
</template>

<style scoped>
.layout-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.layout-tab__description {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}

.layout-tab__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.layout-tab__edit-btn {
  padding: 12px 32px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-tab__edit-btn:active {
  filter: brightness(0.85);
}

.layout-tab__reset-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid var(--color-error);
  background: transparent;
  color: var(--color-error);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.layout-tab__reset-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
}

.layout-tab__reset-btn:not(:disabled):active {
  transform: scale(0.96);
}

.layout-tab__save-message {
  font-size: var(--font-md);
  color: var(--color-success);
  font-weight: 500;
}

.layout-tab__loading {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
