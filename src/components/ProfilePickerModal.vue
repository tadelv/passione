<script setup>
import { ref, computed, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProfilesCache } from '../composables/useProfilesCache'
import ProfileGraph from './ProfileGraph.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'close'])

const { t } = useI18n()
const profilesCache = useProfilesCache()
const updateWorkflow = inject('updateWorkflow')
const toast = inject('toast', null)

const searchQuery = ref('')
const selectedId = ref(null)
const loading = ref(false)

const profiles = computed(() => profilesCache.records.value ?? [])

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return profiles.value
  return profiles.value.filter(r => {
    const title = (r.profile?.title || '').toLowerCase()
    const author = (r.profile?.author || '').toLowerCase()
    return title.includes(q) || author.includes(q)
  })
})

const selectedRecord = computed(() =>
  profiles.value.find(r => r.id === selectedId.value) ?? null
)

const selectedProfile = computed(() => selectedRecord.value?.profile ?? null)

// Fetch profiles on first open
watch(() => props.visible, async (v) => {
  if (v && profiles.value.length === 0 && !loading.value) {
    loading.value = true
    try {
      await profilesCache.refresh()
    } catch { /* toast-spam guard */ }
    loading.value = false
  }
  if (!v) {
    searchQuery.value = ''
    selectedId.value = null
  }
})

function onProfileClick(record) {
  selectedId.value = record.id
}

async function onUseProfile() {
  if (!selectedRecord.value) return
  try {
    await updateWorkflow({ profile: selectedRecord.value.profile })
    emit('select', selectedRecord.value)
  } catch {
    toast?.error('Failed to apply profile')
  }
}

function onClose() {
  emit('close')
}
</script>

<template>
  <Transition name="popup-fade">
    <div
      v-if="visible"
      class="profile-picker"
      role="dialog"
      aria-modal="true"
      :aria-label="t('recipe.change')"
      @click.self="onClose"
      @keydown.esc="onClose"
    >
      <div class="profile-picker__card">
        <div class="profile-picker__header">
          <span class="profile-picker__title">{{ t('recipe.change') }}</span>
          <button class="profile-picker__close" @click="onClose" aria-label="Close">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="profile-picker__body">
          <!-- Search -->
          <input
            v-model="searchQuery"
            class="profile-picker__search"
            type="text"
            placeholder="Search profiles..."
            aria-label="Search profiles"
          />

          <!-- Profile list + preview -->
          <div class="profile-picker__content">
            <div class="profile-picker__list">
              <div v-if="loading" class="profile-picker__empty">Loading...</div>
              <div v-else-if="filtered.length === 0" class="profile-picker__empty">No profiles found</div>
              <button
                v-for="r in filtered"
                :key="r.id"
                class="profile-picker__item"
                :class="{ 'profile-picker__item--active': r.id === selectedId }"
                @click="onProfileClick(r)"
              >
                <span class="profile-picker__item-title">{{ r.profile?.title || 'Untitled' }}</span>
                <span v-if="r.profile?.author" class="profile-picker__item-author">{{ r.profile.author }}</span>
              </button>
            </div>

            <!-- Mini graph preview -->
            <div v-if="selectedProfile" class="profile-picker__preview">
              <ProfileGraph :profile="selectedProfile" :compact="true" />
            </div>
          </div>
        </div>

        <div class="profile-picker__actions">
          <button
            class="profile-picker__btn profile-picker__btn--done"
            :disabled="!selectedRecord"
            @click="onUseProfile"
          >
            {{ t('recipe.save') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.profile-picker {
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

.profile-picker__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  width: 90%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.profile-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px;
}

.profile-picker__title {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
}

.profile-picker__close {
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

.profile-picker__close:active {
  background: var(--color-surface-pressed);
}

.profile-picker__body {
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  flex: 1;
}

.profile-picker__search {
  height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-body);
  outline: none;
}

.profile-picker__search:focus {
  border-color: var(--color-primary);
}

.profile-picker__content {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  overflow: hidden;
}

.profile-picker__list {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-picker__empty {
  padding: 16px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-body);
}

.profile-picker__item {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.profile-picker__item--active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
}

.profile-picker__item:active {
  opacity: 0.7;
}

.profile-picker__item-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text);
}

.profile-picker__item-author {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.profile-picker__preview {
  flex: 0 0 240px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  overflow: hidden;
}

.profile-picker__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 16px 16px;
}

.profile-picker__btn {
  height: 44px;
  padding: 0 24px;
  border-radius: 10px;
  border: none;
  font-size: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.profile-picker__btn:active {
  filter: brightness(0.85);
}

.profile-picker__btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.profile-picker__btn--done {
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

@media (max-width: 700px) {
  .profile-picker__content {
    flex-direction: column;
  }

  .profile-picker__preview {
    flex: 0 0 120px;
  }
}
</style>