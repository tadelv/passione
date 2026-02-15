<script setup>
import { ref, computed, inject } from 'vue'
import BottomBar from '../components/BottomBar.vue'
import ProfileGraph from '../components/ProfileGraph.vue'
import { createProfile } from '../api/rest.js'

const toast = inject('toast')

const shareCode = ref('')
const loading = ref(false)
const error = ref('')
const importedProfile = ref(null)
const importedShot = ref(null)
const saveStatus = ref('')  // '' | 'saving' | 'saved' | 'error'

// Duplicate dialog state
const duplicateVisible = ref(false)
const duplicateTitle = ref('')
const newName = ref('')
const showNameInput = ref(false)

const codeValid = computed(() => shareCode.value.trim().length === 4)

function onCodeInput(e) {
  shareCode.value = e.target.value.toUpperCase().slice(0, 4)
}

async function importProfile() {
  if (!codeValid.value || loading.value) return
  const code = shareCode.value.trim()
  loading.value = true
  error.value = ''
  importedProfile.value = null
  importedShot.value = null
  saveStatus.value = ''
  duplicateVisible.value = false

  try {
    const resp = await fetch(`https://visualizer.coffee/api/shots/shared?code=${encodeURIComponent(code)}`)
    if (!resp.ok) {
      if (resp.status === 404) {
        error.value = 'Share code not found. Check the code and try again.'
      } else {
        error.value = `Visualizer returned HTTP ${resp.status}`
      }
      loading.value = false
      return
    }
    const data = await resp.json()
    importedShot.value = data

    // Extract profile from the shot data
    const profile = data.profile_json
      ? (typeof data.profile_json === 'string' ? JSON.parse(data.profile_json) : data.profile_json)
      : null

    if (!profile) {
      error.value = 'This shot does not contain a profile.'
      loading.value = false
      return
    }

    // Ensure metadata
    if (!profile.metadata) profile.metadata = {}
    profile.metadata.source = 'visualizer'
    if (data.profile_title && !profile.title) {
      profile.title = data.profile_title
    }

    importedProfile.value = profile
  } catch (e) {
    // CORS or network failure — show a helpful toast and inline error
    const isCors = e instanceof TypeError && (
      e.message.includes('Failed to fetch') ||
      e.message.includes('NetworkError') ||
      e.message.includes('Load failed')
    )
    if (isCors) {
      error.value = 'Cannot reach visualizer.coffee directly (CORS restriction). See instructions below.'
      if (toast) {
        toast.warning(
          'Direct Visualizer import requires CORS proxy support. Use the share code on visualizer.coffee to download the profile JSON, then import via the Profiles page.'
        )
      }
    } else {
      error.value = 'Network error. Check your connection and try again.'
    }
  }
  loading.value = false
}

async function saveProfile(profile, overwrite = false) {
  saveStatus.value = 'saving'
  try {
    await createProfile(profile)
    saveStatus.value = 'saved'
    shareCode.value = ''
    if (toast) toast.success('Profile imported and saved successfully!')
  } catch (e) {
    const msg = e.message || ''
    // Check for duplicate / already exists
    if (msg.toLowerCase().includes('exist') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('conflict')) {
      duplicateTitle.value = profile.title || 'Untitled'
      duplicateVisible.value = true
      showNameInput.value = false
      saveStatus.value = ''
    } else {
      error.value = 'Failed to save profile: ' + msg
      saveStatus.value = 'error'
    }
  }
}

function onSaveProfile() {
  if (!importedProfile.value) return
  saveProfile(importedProfile.value)
}

function onOverwrite() {
  if (!importedProfile.value) return
  const profile = { ...importedProfile.value, overwrite: true }
  duplicateVisible.value = false
  saveProfile(profile, true)
}

function onSaveAsNew() {
  newName.value = (duplicateTitle.value || 'Untitled') + ' (copy)'
  showNameInput.value = true
}

function onSaveWithNewName() {
  if (!importedProfile.value || !newName.value.trim()) return
  const profile = { ...importedProfile.value, title: newName.value.trim() }
  if (profile.metadata) profile.metadata = { ...profile.metadata }
  duplicateVisible.value = false
  showNameInput.value = false
  saveProfile(profile)
}

function onCancelDuplicate() {
  duplicateVisible.value = false
  showNameInput.value = false
}

function onKeyDown(e) {
  if (e.key === 'Enter' && codeValid.value) {
    importProfile()
  }
}

// Profile summary helpers
const profileTitle = computed(() => {
  if (importedProfile.value?.title) return importedProfile.value.title
  if (importedShot.value?.profile_title) return importedShot.value.profile_title
  return 'Untitled Profile'
})

const profileAuthor = computed(() => {
  return importedProfile.value?.author
    || importedProfile.value?.metadata?.author
    || importedShot.value?.user_name
    || ''
})

const profileNotes = computed(() => {
  return importedProfile.value?.notes
    || importedProfile.value?.metadata?.notes
    || importedShot.value?.notes
    || ''
})

const frameCount = computed(() => {
  return importedProfile.value?.frames?.length ?? importedProfile.value?.steps?.length ?? 0
})
</script>

<template>
  <div class="viz-import">
    <!-- Duplicate Dialog Overlay -->
    <div v-if="duplicateVisible" class="viz-import__overlay">
      <div class="viz-import__dialog">
        <!-- Choose action -->
        <template v-if="!showNameInput">
          <h3 class="viz-import__dialog-title">Profile Already Exists</h3>
          <p class="viz-import__dialog-text">
            A profile named "{{ duplicateTitle }}" already exists.
            What would you like to do?
          </p>
          <div class="viz-import__dialog-actions">
            <button class="viz-import__btn viz-import__btn--danger" @click="onOverwrite">
              Overwrite
            </button>
            <button class="viz-import__btn viz-import__btn--primary" @click="onSaveAsNew">
              Save as New
            </button>
            <button class="viz-import__btn viz-import__btn--secondary" @click="onCancelDuplicate">
              Cancel
            </button>
          </div>
        </template>

        <!-- Name input -->
        <template v-else>
          <h3 class="viz-import__dialog-title">Enter New Name</h3>
          <input
            type="text"
            class="viz-import__name-input"
            v-model="newName"
            @keydown.enter="onSaveWithNewName"
          />
          <div class="viz-import__dialog-actions">
            <button
              class="viz-import__btn viz-import__btn--primary"
              :disabled="!newName.trim()"
              @click="onSaveWithNewName"
            >
              Save
            </button>
            <button class="viz-import__btn viz-import__btn--secondary" @click="showNameInput = false">
              Back
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Main content -->
    <div class="viz-import__content">
      <!-- Status banner -->
      <div v-if="error" class="viz-import__status viz-import__status--error">
        {{ error }}
      </div>
      <div v-if="saveStatus === 'saved'" class="viz-import__status viz-import__status--success">
        Profile imported successfully!
      </div>

      <!-- Import form (shown when no profile imported yet) -->
      <div v-if="!importedProfile" class="viz-import__form">
        <h2 class="viz-import__heading">Import Profile from Visualizer</h2>
        <p class="viz-import__subtext">
          Enter the 4-character share code from visualizer.coffee
        </p>

        <input
          type="text"
          class="viz-import__code-input"
          :value="shareCode"
          maxlength="4"
          placeholder="XXXX"
          autocomplete="off"
          @input="onCodeInput"
          @keydown="onKeyDown"
        />

        <button
          class="viz-import__btn viz-import__btn--primary viz-import__btn--large"
          :disabled="!codeValid || loading"
          @click="importProfile"
        >
          {{ loading ? 'Importing...' : 'Import Profile' }}
        </button>

        <!-- Instructions -->
        <div class="viz-import__instructions">
          <h4 class="viz-import__instructions-title">How to get a share code:</h4>
          <ol class="viz-import__steps">
            <li>Open <strong>visualizer.coffee</strong> on your phone or computer</li>
            <li>Find a shot with a profile you want</li>
            <li>Tap "Share" and copy the 4-character code</li>
            <li>Enter the code above and tap Import</li>
          </ol>
        </div>

        <div class="viz-import__instructions viz-import__instructions--note">
          <h4 class="viz-import__instructions-title">Note: CORS limitations</h4>
          <p class="viz-import__note-text">
            Direct import from visualizer.coffee may be blocked by browser security (CORS).
            If the import fails, you can manually download the profile:
          </p>
          <ol class="viz-import__steps">
            <li>Visit <strong>visualizer.coffee</strong> and open the shared shot</li>
            <li>Download the profile JSON from the shot page</li>
            <li>Go to the <strong>Profiles</strong> page in this app and use the import function</li>
          </ol>
        </div>
      </div>

      <!-- Profile preview (shown after successful import) -->
      <div v-else class="viz-import__preview">
        <div class="viz-import__preview-header">
          <h2 class="viz-import__preview-title">{{ profileTitle }}</h2>
          <p v-if="profileAuthor" class="viz-import__preview-author">by {{ profileAuthor }}</p>
        </div>

        <div class="viz-import__graph-container">
          <ProfileGraph :profile="importedProfile" />
        </div>

        <div class="viz-import__preview-details">
          <div class="viz-import__detail-row">
            <span class="viz-import__detail-label">Frames</span>
            <span class="viz-import__detail-value">{{ frameCount }}</span>
          </div>
          <div v-if="profileNotes" class="viz-import__detail-row viz-import__detail-row--notes">
            <span class="viz-import__detail-label">Notes</span>
            <span class="viz-import__detail-value">{{ profileNotes }}</span>
          </div>
        </div>

        <div class="viz-import__preview-actions">
          <button
            class="viz-import__btn viz-import__btn--primary viz-import__btn--large"
            :disabled="saveStatus === 'saving'"
            @click="onSaveProfile"
          >
            {{ saveStatus === 'saving' ? 'Saving...' : 'Save Profile' }}
          </button>
          <button
            class="viz-import__btn viz-import__btn--secondary"
            @click="importedProfile = null; importedShot = null; saveStatus = ''; error = ''"
          >
            Import Another
          </button>
        </div>
      </div>
    </div>

    <BottomBar title="Import from Visualizer" />
  </div>
</template>

<style scoped>
.viz-import {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.viz-import__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  -webkit-overflow-scrolling: touch;
}

/* Status banner */
.viz-import__status {
  width: 100%;
  max-width: 500px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 16px;
}

.viz-import__status--error {
  background: rgba(233, 69, 96, 0.15);
  color: var(--color-error);
}

.viz-import__status--success {
  background: rgba(38, 166, 91, 0.15);
  color: var(--color-success);
}

/* Import form */
.viz-import__form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 500px;
  width: 100%;
  padding-top: 24px;
}

.viz-import__heading {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
}

.viz-import__subtext {
  font-size: 14px;
  color: var(--color-text-secondary);
  text-align: center;
  line-height: 1.5;
}

.viz-import__code-input {
  width: 180px;
  height: 60px;
  padding: 0 16px;
  border-radius: 8px;
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 8px;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

.viz-import__code-input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.viz-import__code-input::placeholder {
  color: var(--color-text-secondary);
  opacity: 0.4;
  letter-spacing: 8px;
}

/* Buttons */
.viz-import__btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.viz-import__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.viz-import__btn--primary {
  background: var(--color-primary);
  color: #fff;
}

.viz-import__btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.viz-import__btn--danger {
  background: var(--color-error);
  color: #fff;
}

.viz-import__btn--large {
  padding: 14px 32px;
  font-size: 16px;
}

/* Instructions */
.viz-import__instructions {
  width: 100%;
  padding: 16px;
  background: var(--color-surface);
  border-radius: 8px;
}

.viz-import__instructions-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 8px;
}

.viz-import__steps {
  list-style: decimal;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.viz-import__steps li {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.viz-import__instructions--note {
  border: 1px solid var(--color-border);
  margin-top: -8px;
}

.viz-import__note-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 8px;
}

/* Profile preview */
.viz-import__preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 600px;
  width: 100%;
}

.viz-import__preview-header {
  text-align: center;
}

.viz-import__preview-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}

.viz-import__preview-author {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.viz-import__graph-container {
  width: 100%;
  height: 220px;
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  padding: 8px;
}

.viz-import__preview-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.viz-import__detail-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--color-surface);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.viz-import__detail-row--notes {
  flex-direction: column;
  gap: 4px;
}

.viz-import__detail-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.viz-import__detail-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.viz-import__preview-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-top: 8px;
}

/* Duplicate dialog overlay */
.viz-import__overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.viz-import__dialog {
  max-width: 400px;
  width: 100%;
  background: var(--color-background);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.viz-import__dialog-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
}

.viz-import__dialog-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  text-align: center;
  line-height: 1.5;
}

.viz-import__dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.viz-import__name-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border-radius: 8px;
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 16px;
}

.viz-import__name-input:focus {
  border-color: var(--color-primary);
  outline: none;
}
</style>
