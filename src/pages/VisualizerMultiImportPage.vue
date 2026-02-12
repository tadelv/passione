<script setup>
import { ref, computed, inject } from 'vue'
import BottomBar from '../components/BottomBar.vue'
import ProfileGraph from '../components/ProfileGraph.vue'
import { createProfile, getProfiles } from '../api/rest.js'

const toast = inject('toast')

// --- State ---
const shareCode = ref('')
const loading = ref(false)
const error = ref('')
const profiles = ref([])           // Array of { profile, title, author, status }
const selectedIndex = ref(-1)
const importingAll = ref(false)
const existingProfileIds = ref(new Set())

const codeValid = computed(() => shareCode.value.trim().length >= 2)

function onCodeInput(e) {
  shareCode.value = e.target.value.toUpperCase().slice(0, 8)
}

function onKeyDown(e) {
  if (e.key === 'Enter' && codeValid.value) {
    loadProfiles()
  }
}

const selectedProfile = computed(() => {
  if (selectedIndex.value >= 0 && selectedIndex.value < profiles.value.length) {
    return profiles.value[selectedIndex.value]
  }
  return null
})

const importableCount = computed(() =>
  profiles.value.filter(p => p.status === 'ready' || p.status === 'error').length
)

const allImported = computed(() =>
  profiles.value.length > 0 && profiles.value.every(p => p.status === 'imported' || p.status === 'exists')
)

/**
 * Fetch existing profiles from the gateway to detect duplicates.
 */
async function loadExistingProfiles() {
  try {
    const data = await getProfiles()
    const arr = Array.isArray(data) ? data : []
    existingProfileIds.value = new Set(arr.map(r => r.id))
  } catch {
    existingProfileIds.value = new Set()
  }
}

/**
 * Fetch the profile list from a visualizer.coffee share code.
 * The share code links to a shared shot, which contains a profile.
 * We attempt to fetch and parse the profile data.
 */
async function loadProfiles() {
  if (!codeValid.value || loading.value) return
  const code = shareCode.value.trim()
  loading.value = true
  error.value = ''
  profiles.value = []
  selectedIndex.value = -1

  // First, load existing profiles for duplicate detection
  await loadExistingProfiles()

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

    // The API may return a single shot or an array
    const shots = Array.isArray(data) ? data : [data]
    const parsed = []

    for (const shot of shots) {
      const profileJson = shot.profile_json
        ? (typeof shot.profile_json === 'string' ? JSON.parse(shot.profile_json) : shot.profile_json)
        : null

      if (!profileJson) {
        parsed.push({
          profile: null,
          title: shot.profile_title || 'Unknown',
          author: shot.user_name || '',
          status: 'invalid',
          error: 'No profile data in this shot',
        })
        continue
      }

      // Ensure metadata
      if (!profileJson.metadata) profileJson.metadata = {}
      profileJson.metadata.source = 'visualizer'
      if (shot.profile_title && !profileJson.title) {
        profileJson.title = shot.profile_title
      }

      // Check if profile already exists
      const title = profileJson.title || shot.profile_title || 'Untitled'
      const author = profileJson.author || profileJson.metadata?.author || shot.user_name || ''

      parsed.push({
        profile: profileJson,
        title,
        author,
        status: 'ready',
        error: '',
      })
    }

    profiles.value = parsed

    if (parsed.length > 0) {
      selectedIndex.value = 0
    }

    if (parsed.length === 0) {
      error.value = 'No profiles found for this share code.'
    }
  } catch (e) {
    // CORS or network failure
    const isCors = e instanceof TypeError && (
      e.message.includes('Failed to fetch') ||
      e.message.includes('NetworkError') ||
      e.message.includes('Load failed')
    )
    if (isCors) {
      error.value = 'Cannot reach visualizer.coffee directly (CORS restriction). Direct import from the browser is blocked by security policy. You can download profiles from visualizer.coffee and import them via the Profiles page instead.'
      if (toast) {
        toast.warning(
          'Direct Visualizer import requires a CORS proxy or the ReaPrime API proxy endpoint.'
        )
      }
    } else {
      error.value = 'Network error. Check your connection and try again.'
    }
  }
  loading.value = false
}

/**
 * Import a single profile by index.
 */
async function importSingle(index) {
  const item = profiles.value[index]
  if (!item || !item.profile || item.status === 'imported' || item.status === 'invalid') return

  item.status = 'importing'
  item.error = ''
  try {
    await createProfile(item.profile)
    item.status = 'imported'
    if (toast) toast.success(`Imported "${item.title}"`)
  } catch (e) {
    const msg = e.message || ''
    if (msg.toLowerCase().includes('exist') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('conflict')) {
      item.status = 'exists'
      item.error = 'Already exists'
      if (toast) toast.info(`"${item.title}" already exists`)
    } else {
      item.status = 'error'
      item.error = msg
      if (toast) toast.error(`Failed to import "${item.title}": ${msg}`)
    }
  }
}

/**
 * Import all importable profiles.
 */
async function importAll() {
  if (importingAll.value) return
  importingAll.value = true

  let successCount = 0
  let errorCount = 0
  let existsCount = 0

  for (let i = 0; i < profiles.value.length; i++) {
    const item = profiles.value[i]
    if (item.status !== 'ready' && item.status !== 'error') continue

    item.status = 'importing'
    item.error = ''
    try {
      await createProfile(item.profile)
      item.status = 'imported'
      successCount++
    } catch (e) {
      const msg = e.message || ''
      if (msg.toLowerCase().includes('exist') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('conflict')) {
        item.status = 'exists'
        item.error = 'Already exists'
        existsCount++
      } else {
        item.status = 'error'
        item.error = msg
        errorCount++
      }
    }
  }

  importingAll.value = false

  // Summary toast
  const parts = []
  if (successCount > 0) parts.push(`${successCount} imported`)
  if (existsCount > 0) parts.push(`${existsCount} already exist`)
  if (errorCount > 0) parts.push(`${errorCount} failed`)
  if (toast && parts.length > 0) {
    const level = errorCount > 0 ? 'warning' : 'success'
    toast[level](`Batch import: ${parts.join(', ')}`)
  }
}

function selectProfile(index) {
  selectedIndex.value = index
}

function statusIcon(status) {
  switch (status) {
    case 'ready': return '[ ]'
    case 'importing': return '...'
    case 'imported': return '[OK]'
    case 'exists': return '[=]'
    case 'error': return '[!]'
    case 'invalid': return '[x]'
    default: return ''
  }
}

function statusClass(status) {
  switch (status) {
    case 'imported': return 'viz-multi__status--success'
    case 'exists': return 'viz-multi__status--info'
    case 'error': return 'viz-multi__status--error'
    case 'invalid': return 'viz-multi__status--disabled'
    case 'importing': return 'viz-multi__status--loading'
    default: return ''
  }
}

function reset() {
  profiles.value = []
  selectedIndex.value = -1
  error.value = ''
  shareCode.value = ''
}
</script>

<template>
  <div class="viz-multi">
    <div class="viz-multi__content">
      <!-- Top bar: share code input + load button -->
      <div class="viz-multi__input-bar">
        <input
          type="text"
          class="viz-multi__code-input"
          :value="shareCode"
          maxlength="8"
          placeholder="Share code"
          autocomplete="off"
          @input="onCodeInput"
          @keydown="onKeyDown"
        />
        <button
          class="viz-multi__btn viz-multi__btn--primary"
          :disabled="!codeValid || loading"
          @click="loadProfiles"
        >
          {{ loading ? 'Loading...' : 'Load' }}
        </button>
        <button
          v-if="profiles.length > 0"
          class="viz-multi__btn viz-multi__btn--secondary"
          @click="reset"
        >
          Clear
        </button>
      </div>

      <!-- Error banner -->
      <div v-if="error" class="viz-multi__banner viz-multi__banner--error">
        {{ error }}
      </div>

      <!-- Instructions (shown when no profiles loaded) -->
      <div v-if="profiles.length === 0 && !loading && !error" class="viz-multi__instructions">
        <h2 class="viz-multi__heading">Batch Import from Visualizer</h2>
        <p class="viz-multi__subtext">
          Enter a visualizer.coffee share code to load and import profiles.
        </p>
        <div class="viz-multi__help">
          <h4 class="viz-multi__help-title">How it works:</h4>
          <ol class="viz-multi__steps">
            <li>Get a share code from <strong>visualizer.coffee</strong></li>
            <li>Enter the code above and tap Load</li>
            <li>Review the profiles in the list</li>
            <li>Import individually or use "Import All"</li>
          </ol>
        </div>
        <div class="viz-multi__help viz-multi__help--note">
          <h4 class="viz-multi__help-title">Note: CORS limitations</h4>
          <p class="viz-multi__note-text">
            Direct import from visualizer.coffee may be blocked by browser security (CORS).
            If loading fails, download profiles from visualizer.coffee manually and use the
            Profiles page to import them.
          </p>
        </div>
      </div>

      <!-- Split layout: profile list + detail -->
      <div v-if="profiles.length > 0" class="viz-multi__split">
        <!-- Left: Profile list -->
        <div class="viz-multi__list-pane">
          <div class="viz-multi__list-header">
            <span class="viz-multi__list-count">
              {{ profiles.length }} profile{{ profiles.length !== 1 ? 's' : '' }}
            </span>
            <button
              v-if="importableCount > 0 && !allImported"
              class="viz-multi__btn viz-multi__btn--primary viz-multi__btn--small"
              :disabled="importingAll"
              @click="importAll"
            >
              {{ importingAll ? 'Importing...' : 'Import All' }}
            </button>
            <span v-if="allImported" class="viz-multi__all-done">All imported</span>
          </div>

          <div class="viz-multi__list">
            <div
              v-for="(item, index) in profiles"
              :key="index"
              class="viz-multi__list-item"
              :class="{
                'viz-multi__list-item--selected': index === selectedIndex,
                'viz-multi__list-item--disabled': item.status === 'invalid',
              }"
              @click="selectProfile(index)"
            >
              <div class="viz-multi__list-item-info">
                <span class="viz-multi__list-item-title">{{ item.title }}</span>
                <span v-if="item.author" class="viz-multi__list-item-author">{{ item.author }}</span>
                <span v-if="item.error" class="viz-multi__list-item-error">{{ item.error }}</span>
              </div>
              <div class="viz-multi__list-item-actions">
                <span
                  class="viz-multi__list-item-status"
                  :class="statusClass(item.status)"
                >
                  {{ statusIcon(item.status) }}
                </span>
                <button
                  v-if="item.status === 'ready' || item.status === 'error'"
                  class="viz-multi__btn viz-multi__btn--primary viz-multi__btn--tiny"
                  :disabled="item.status === 'importing'"
                  @click.stop="importSingle(index)"
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Profile detail -->
        <div class="viz-multi__detail-pane">
          <template v-if="selectedProfile">
            <div class="viz-multi__detail-header">
              <h3 class="viz-multi__detail-title">{{ selectedProfile.title }}</h3>
              <p v-if="selectedProfile.author" class="viz-multi__detail-author">
                by {{ selectedProfile.author }}
              </p>
            </div>

            <div v-if="selectedProfile.profile" class="viz-multi__graph-container">
              <ProfileGraph :profile="selectedProfile.profile" />
            </div>

            <div v-if="selectedProfile.profile" class="viz-multi__detail-info">
              <div class="viz-multi__detail-row">
                <span class="viz-multi__detail-label">Frames</span>
                <span class="viz-multi__detail-value">
                  {{ selectedProfile.profile.frames?.length ?? 0 }}
                </span>
              </div>
              <div v-if="selectedProfile.profile.notes" class="viz-multi__detail-row viz-multi__detail-row--notes">
                <span class="viz-multi__detail-label">Notes</span>
                <span class="viz-multi__detail-value">{{ selectedProfile.profile.notes }}</span>
              </div>
            </div>

            <div v-if="selectedProfile.status === 'invalid'" class="viz-multi__banner viz-multi__banner--warning">
              This entry does not contain a valid profile.
            </div>

            <div v-if="selectedProfile.status === 'imported'" class="viz-multi__banner viz-multi__banner--success">
              Successfully imported.
            </div>

            <div v-if="selectedProfile.status === 'exists'" class="viz-multi__banner viz-multi__banner--info">
              This profile already exists on the gateway.
            </div>

            <button
              v-if="selectedProfile.status === 'ready' || selectedProfile.status === 'error'"
              class="viz-multi__btn viz-multi__btn--primary viz-multi__btn--large viz-multi__detail-import-btn"
              :disabled="selectedProfile.status === 'importing'"
              @click="importSingle(selectedIndex)"
            >
              {{ selectedProfile.status === 'importing' ? 'Importing...' : 'Import This Profile' }}
            </button>
          </template>

          <div v-else class="viz-multi__detail-empty">
            Select a profile from the list to preview
          </div>
        </div>
      </div>
    </div>

    <BottomBar title="Batch Import" />
  </div>
</template>

<style scoped>
.viz-multi {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.viz-multi__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  -webkit-overflow-scrolling: touch;
}

/* Input bar */
.viz-multi__input-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.viz-multi__code-input {
  flex: 1;
  max-width: 200px;
  height: 48px;
  padding: 0 14px;
  border-radius: 8px;
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 18px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 4px;
  text-transform: uppercase;
}

.viz-multi__code-input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.viz-multi__code-input::placeholder {
  color: var(--color-text-secondary);
  opacity: 0.4;
  letter-spacing: 2px;
}

/* Buttons */
.viz-multi__btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.viz-multi__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.viz-multi__btn:active:not(:disabled) {
  filter: brightness(0.85);
}

.viz-multi__btn--primary {
  background: var(--color-primary);
  color: #fff;
}

.viz-multi__btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.viz-multi__btn--small {
  padding: 6px 14px;
  font-size: 13px;
}

.viz-multi__btn--tiny {
  padding: 4px 10px;
  font-size: 12px;
}

.viz-multi__btn--large {
  padding: 14px 28px;
  font-size: 16px;
}

/* Banners */
.viz-multi__banner {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.viz-multi__banner--error {
  background: rgba(233, 69, 96, 0.15);
  color: var(--color-error);
}

.viz-multi__banner--success {
  background: rgba(38, 166, 91, 0.15);
  color: var(--color-success);
}

.viz-multi__banner--warning {
  background: rgba(233, 162, 58, 0.15);
  color: var(--color-warning, #e9a23a);
}

.viz-multi__banner--info {
  background: rgba(66, 153, 225, 0.15);
  color: var(--color-info, #4299e1);
}

/* Instructions */
.viz-multi__instructions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 500px;
  width: 100%;
  margin: 0 auto;
  padding-top: 16px;
}

.viz-multi__heading {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
}

.viz-multi__subtext {
  font-size: 14px;
  color: var(--color-text-secondary);
  text-align: center;
  line-height: 1.5;
}

.viz-multi__help {
  width: 100%;
  padding: 16px;
  background: var(--color-surface);
  border-radius: 8px;
}

.viz-multi__help-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 8px;
}

.viz-multi__steps {
  list-style: decimal;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.viz-multi__steps li {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.viz-multi__help--note {
  border: 1px solid var(--color-border);
}

.viz-multi__note-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 8px;
}

/* Split layout */
.viz-multi__split {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

/* Left pane: profile list */
.viz-multi__list-pane {
  flex: 0 0 45%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.viz-multi__list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
}

.viz-multi__list-count {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.viz-multi__all-done {
  font-size: 13px;
  color: var(--color-success);
  font-weight: 600;
}

.viz-multi__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  -webkit-overflow-scrolling: touch;
}

.viz-multi__list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-surface);
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.viz-multi__list-item:active {
  filter: brightness(0.9);
}

.viz-multi__list-item--selected {
  border-color: var(--color-primary);
}

.viz-multi__list-item--disabled {
  opacity: 0.5;
}

.viz-multi__list-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.viz-multi__list-item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viz-multi__list-item-author {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viz-multi__list-item-error {
  font-size: 11px;
  color: var(--color-error);
}

.viz-multi__list-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.viz-multi__list-item-status {
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  color: var(--color-text-secondary);
}

.viz-multi__status--success {
  color: var(--color-success);
}

.viz-multi__status--info {
  color: var(--color-info, #4299e1);
}

.viz-multi__status--error {
  color: var(--color-error);
}

.viz-multi__status--disabled {
  color: var(--color-text-secondary);
  opacity: 0.5;
}

.viz-multi__status--loading {
  color: var(--color-primary);
}

/* Right pane: detail */
.viz-multi__detail-pane {
  flex: 0 0 55%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.viz-multi__detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.viz-multi__detail-header {
  text-align: center;
}

.viz-multi__detail-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.viz-multi__detail-author {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.viz-multi__graph-container {
  width: 100%;
  height: 200px;
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  padding: 8px;
  flex-shrink: 0;
}

.viz-multi__detail-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.viz-multi__detail-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--color-surface);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.viz-multi__detail-row--notes {
  flex-direction: column;
  gap: 4px;
}

.viz-multi__detail-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.viz-multi__detail-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.viz-multi__detail-import-btn {
  align-self: center;
  margin-top: 4px;
}

/* Responsive: stack on narrow screens */
@media (max-width: 600px) {
  .viz-multi__split {
    flex-direction: column;
  }

  .viz-multi__list-pane {
    flex: none;
    max-height: 250px;
  }

  .viz-multi__detail-pane {
    flex: 1;
  }
}
</style>
