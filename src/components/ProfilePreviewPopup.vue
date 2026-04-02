<script setup>
import { computed } from 'vue'
import ProfileGraph from './ProfileGraph.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Profile object with title and frames */
  profile: { type: Object, default: null },
})

const emit = defineEmits(['close', 'more-info'])

const profileTitle = computed(() => props.profile?.title || props.profile?.name || 'Profile')
</script>

<template>
  <Transition name="popup-fade">
    <div v-if="visible && profile" class="profile-preview" @click.self="emit('close')">
      <div class="profile-preview__card">
        <!-- Header -->
        <div class="profile-preview__header">
          <span class="profile-preview__title">{{ profileTitle }}</span>
          <div class="profile-preview__header-actions">
            <button class="profile-preview__info-btn" @click="emit('more-info', profile)">
              More Info
            </button>
            <button class="profile-preview__close-btn" @click="emit('close')" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Graph body -->
        <div class="profile-preview__body">
          <ProfileGraph
            :profile="profile"
            :selected-frame="-1"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.profile-preview {
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

.profile-preview__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  width: 90%;
  height: 50%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.profile-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
}

.profile-preview__title {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}

.profile-preview__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.profile-preview__info-btn {
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-label);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.profile-preview__info-btn:active {
  background: var(--color-surface-active);
}

.profile-preview__close-btn {
  width: 36px;
  height: 36px;
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

.profile-preview__close-btn:active {
  background: var(--color-surface-pressed);
}

.profile-preview__body {
  flex: 1;
  min-height: 0;
  padding: 8px;
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
