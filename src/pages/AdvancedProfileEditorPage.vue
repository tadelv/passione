<script setup>
import { ref, computed, watch, inject, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import BottomBar from '../components/BottomBar.vue'
import ProfileGraph from '../components/ProfileGraph.vue'
import ValueInput from '../components/ValueInput.vue'
import {
  getProfile,
  createProfile,
  updateProfile,
  uploadProfileToMachine,
} from '../api/rest.js'

const router = useRouter()
const route = useRoute()
const toast = inject('toast', null)

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const loading = ref(false)
const saving = ref(false)

/** The profile record loaded from API (contains {id, profile, ...}) */
const record = ref(null)

/** Working copy of the profile object — mutated in-place by the editor */
const profile = ref(null)

/** Snapshot of the original profile JSON for dirty detection */
let originalSnapshot = ''

const selectedFrame = ref(-1)
const showSettings = ref(false)

// ---------------------------------------------------------------------------
// Computed helpers
// ---------------------------------------------------------------------------

const frames = computed(() => profile.value?.frames ?? profile.value?.steps ?? [])

const isDirty = computed(() => {
  if (!profile.value) return false
  return JSON.stringify(profile.value) !== originalSnapshot
})

const frameCount = computed(() => frames.value.length)

const totalDuration = computed(() => {
  let t = 0
  for (const f of frames.value) t += f.seconds || 0
  return t
})

const currentFrame = computed(() => {
  if (selectedFrame.value < 0 || selectedFrame.value >= frames.value.length) return null
  return frames.value[selectedFrame.value]
})

const stopAtLabel = computed(() => {
  if (!profile.value) return ''
  if (profile.value.stop_at_type === 'volume') {
    return `${(profile.value.target_volume || 36).toFixed(0)}mL`
  }
  return `${(profile.value.target_weight || 36).toFixed(0)}g`
})

// The profile object passed to ProfileGraph needs `frames` key
const graphProfile = computed(() => {
  if (!profile.value) return null
  const p = profile.value
  // Ensure the profile has `frames` (ProfileGraph expects that key)
  if (!p.frames && p.steps) {
    return { ...p, frames: p.steps }
  }
  return p
})

// ---------------------------------------------------------------------------
// Load profile
// ---------------------------------------------------------------------------

async function loadProfile() {
  const id = route.params.id
  if (!id) {
    // New profile — create a default
    profile.value = createDefaultProfile()
    originalSnapshot = JSON.stringify(profile.value)
    selectedFrame.value = 0
    return
  }

  loading.value = true
  try {
    const data = await getProfile(id)
    record.value = data
    // Deep clone so we work on a mutable copy
    const p = JSON.parse(JSON.stringify(data.profile || data))
    // Normalise: some profiles use `steps`, some use `frames`
    if (p.steps && !p.frames) {
      p.frames = p.steps
      delete p.steps
    }
    profile.value = p
    originalSnapshot = JSON.stringify(p)
    if (p.frames && p.frames.length > 0) {
      selectedFrame.value = 0
    }
  } catch (e) {
    console.warn('[ProfileEditorPage] Failed to load profile:', e.message)
    if (toast) toast.error('Failed to load profile')
  } finally {
    loading.value = false
  }
}

function createDefaultProfile() {
  return {
    title: 'New Profile',
    author: '',
    notes: '',
    beverage_type: 'espresso',
    target_weight: 36,
    target_volume: 0,
    stop_at_type: 'weight',
    frames: [
      createDefaultFrame(1, 'Preinfusion', 'pressure', 4.0, 2.0),
      createDefaultFrame(2, 'Infusion', 'pressure', 9.0, 2.0),
    ],
  }
}

function createDefaultFrame(index, name, pump, pressure, flow) {
  return {
    name: name || `Frame ${index}`,
    temperature: 93.0,
    sensor: 'coffee',
    pump: pump || 'pressure',
    transition: 'fast',
    pressure: pressure ?? 9.0,
    flow: flow ?? 2.0,
    seconds: 30,
    volume: 0,
    exit_if: false,
    exit_type: 'pressure_over',
    exit_pressure_over: 0,
    exit_pressure_under: 0,
    exit_flow_over: 0,
    exit_flow_under: 0,
    exit_weight: 0,
    max_flow_or_pressure: 0,
    max_flow_or_pressure_range: 0.6,
    popup: '',
  }
}

// ---------------------------------------------------------------------------
// Frame manipulation
// ---------------------------------------------------------------------------

function addFrame() {
  if (!profile.value) return
  const f = frames.value
  if (f.length >= 20) {
    if (toast) toast.warning('Maximum 20 frames per profile')
    return
  }
  const newFrame = createDefaultFrame(f.length + 1)
  f.push(newFrame)
  triggerUpdate()
  selectedFrame.value = f.length - 1
}

function duplicateFrame(index) {
  if (!profile.value || index < 0 || index >= frames.value.length) return
  if (frames.value.length >= 20) {
    if (toast) toast.warning('Maximum 20 frames per profile')
    return
  }
  const copy = JSON.parse(JSON.stringify(frames.value[index]))
  copy.name = (copy.name || 'Frame') + ' (copy)'
  frames.value.splice(index + 1, 0, copy)
  triggerUpdate()
  selectedFrame.value = index + 1
}

function deleteFrame(index) {
  if (!profile.value || index < 0 || index >= frames.value.length) return
  if (frames.value.length <= 1) {
    if (toast) toast.warning('Profile must have at least one frame')
    return
  }
  frames.value.splice(index, 1)
  if (selectedFrame.value >= frames.value.length) {
    selectedFrame.value = frames.value.length - 1
  }
  triggerUpdate()
}

function moveFrame(fromIndex, direction) {
  const toIndex = fromIndex + direction
  if (!profile.value || toIndex < 0 || toIndex >= frames.value.length) return
  const f = frames.value
  const item = f.splice(fromIndex, 1)[0]
  f.splice(toIndex, 0, item)
  selectedFrame.value = toIndex
  triggerUpdate()
}

// ---------------------------------------------------------------------------
// Frame field updates
// ---------------------------------------------------------------------------

/**
 * Force Vue reactivity to pick up deep changes inside frames.
 * We do this by reassigning the profile ref to a shallow copy.
 */
function triggerUpdate() {
  profile.value = { ...profile.value }
}

function updateFrameField(field, value) {
  if (!currentFrame.value) return
  currentFrame.value[field] = value
  triggerUpdate()
}

function setPumpMode(mode) {
  if (!currentFrame.value) return
  currentFrame.value.pump = mode
  triggerUpdate()
}

function setTransition(transition) {
  if (!currentFrame.value) return
  currentFrame.value.transition = transition
  triggerUpdate()
}

function setSensor(sensor) {
  if (!currentFrame.value) return
  currentFrame.value.sensor = sensor
  triggerUpdate()
}

function setExitEnabled(enabled) {
  if (!currentFrame.value) return
  currentFrame.value.exit_if = enabled
  triggerUpdate()
}

function setExitType(type) {
  if (!currentFrame.value) return
  currentFrame.value.exit_type = type
  triggerUpdate()
}

function updateExitValue(value) {
  if (!currentFrame.value) return
  const f = currentFrame.value
  switch (f.exit_type) {
    case 'pressure_over': f.exit_pressure_over = value; break
    case 'pressure_under': f.exit_pressure_under = value; break
    case 'flow_over': f.exit_flow_over = value; break
    case 'flow_under': f.exit_flow_under = value; break
    case 'weight': f.exit_weight = value; break
  }
  triggerUpdate()
}

function currentExitValue() {
  const f = currentFrame.value
  if (!f) return 0
  switch (f.exit_type) {
    case 'pressure_over': return f.exit_pressure_over || 0
    case 'pressure_under': return f.exit_pressure_under || 0
    case 'flow_over': return f.exit_flow_over || 0
    case 'flow_under': return f.exit_flow_under || 0
    case 'weight': return f.exit_weight || 0
    default: return 0
  }
}

// Profile-level settings
function setStopAtType(type) {
  if (!profile.value) return
  profile.value.stop_at_type = type
  triggerUpdate()
}

function updateGlobalTemp(newTemp) {
  if (!profile.value || !frames.value.length) return
  const delta = newTemp - (frames.value[0].temperature || 93)
  for (const f of frames.value) {
    f.temperature = (f.temperature || 93) + delta
  }
  triggerUpdate()
}

// ---------------------------------------------------------------------------
// Save / upload
// ---------------------------------------------------------------------------

async function saveProfile() {
  if (!profile.value) return
  saving.value = true
  try {
    // Normalise: ensure frames key
    const payload = { ...profile.value }
    if (payload.steps && !payload.frames) {
      payload.frames = payload.steps
      delete payload.steps
    }
    const existingId = record.value?.id || profile.value?.id
    const result = existingId
      ? await updateProfile(existingId, payload)
      : await createProfile(payload)
    if (result?.id) {
      record.value = result
    }
    originalSnapshot = JSON.stringify(result || profile.value)
    if (toast) toast.success('Profile saved')
  } catch (e) {
    console.warn('[ProfileEditorPage] Save failed:', e.message)
    if (toast) toast.error('Failed to save profile: ' + e.message)
  } finally {
    saving.value = false
  }
}

async function uploadToMachine() {
  if (!profile.value) return
  saving.value = true
  try {
    const payload = { ...profile.value }
    if (payload.steps && !payload.frames) {
      payload.frames = payload.steps
      delete payload.steps
    }
    await uploadProfileToMachine(payload)
    if (toast) toast.success('Profile uploaded to machine')
  } catch (e) {
    console.warn('[ProfileEditorPage] Upload failed:', e.message)
    if (toast) toast.error('Failed to upload: ' + e.message)
  } finally {
    saving.value = false
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function goBack() {
  if (isDirty.value) {
    if (!confirm('You have unsaved changes. Discard them?')) return
  }
  router.back()
}

function onFrameSelected(index) {
  selectedFrame.value = index
}

// ---------------------------------------------------------------------------
// Exit type helpers
// ---------------------------------------------------------------------------

const EXIT_TYPES = [
  { value: 'pressure_over', label: 'Pressure Over' },
  { value: 'pressure_under', label: 'Pressure Under' },
  { value: 'flow_over', label: 'Flow Over' },
  { value: 'flow_under', label: 'Flow Under' },
  { value: 'weight', label: 'Weight Over' },
]

function exitValueMax() {
  const f = currentFrame.value
  if (!f) return 12
  switch (f.exit_type) {
    case 'flow_over':
    case 'flow_under': return 8
    case 'weight': return 100
    default: return 12
  }
}

function exitValueStep() {
  const f = currentFrame.value
  return f?.exit_type === 'weight' ? 0.5 : 0.1
}

function exitValueSuffix() {
  const f = currentFrame.value
  if (!f) return ' bar'
  switch (f.exit_type) {
    case 'flow_over':
    case 'flow_under': return ' mL/s'
    case 'weight': return ' g'
    default: return ' bar'
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(loadProfile)
</script>

<template>
  <div class="profile-editor">
    <!-- Loading state -->
    <div v-if="loading" class="profile-editor__loading">
      Loading profile...
    </div>

    <template v-else-if="profile">
      <div class="profile-editor__content">
        <!-- Top: Mode banner -->
        <div class="profile-editor__banner">
          <span class="profile-editor__banner-title">Advanced Editor</span>
          <span class="profile-editor__banner-hint">Full frame-by-frame control. Click frames to edit.</span>
        </div>

        <!-- Main layout: graph + toolbar (left) / editor (right) -->
        <div class="profile-editor__main">
          <!-- LEFT: Graph + frame list -->
          <div class="profile-editor__left">
            <!-- Frame toolbar -->
            <div class="profile-editor__toolbar">
              <span class="profile-editor__toolbar-label">Frames</span>
              <span class="profile-editor__toolbar-spacer"></span>
              <button
                class="profile-editor__tool-btn profile-editor__tool-btn--primary"
                @click="addFrame"
                :disabled="frameCount >= 20"
              >+ Add</button>
              <button
                class="profile-editor__tool-btn profile-editor__tool-btn--danger"
                @click="deleteFrame(selectedFrame)"
                :disabled="selectedFrame < 0 || frameCount <= 1"
              >Delete</button>
              <button
                class="profile-editor__tool-btn profile-editor__tool-btn--primary"
                @click="duplicateFrame(selectedFrame)"
                :disabled="selectedFrame < 0 || frameCount >= 20"
              >Copy</button>
              <button
                class="profile-editor__tool-btn"
                @click="moveFrame(selectedFrame, -1)"
                :disabled="selectedFrame <= 0"
                aria-label="Move frame left"
              >&#8592;</button>
              <button
                class="profile-editor__tool-btn"
                @click="moveFrame(selectedFrame, 1)"
                :disabled="selectedFrame < 0 || selectedFrame >= frameCount - 1"
                aria-label="Move frame right"
              >&#8594;</button>
            </div>

            <!-- Profile graph -->
            <div class="profile-editor__graph">
              <ProfileGraph
                :profile="graphProfile"
                :selected-frame="selectedFrame"
                @frame-selected="onFrameSelected"
              />
            </div>

            <!-- Frame list (compact row for each frame) -->
            <div class="profile-editor__frame-list">
              <div
                v-for="(frame, i) in frames"
                :key="i"
                class="profile-editor__frame-row"
                :class="{
                  'profile-editor__frame-row--selected': i === selectedFrame,
                }"
                @click="selectedFrame = i"
              >
                <span class="profile-editor__frame-index">{{ i + 1 }}</span>
                <span
                  class="profile-editor__frame-pump"
                  :class="frame.pump === 'flow' ? 'profile-editor__frame-pump--flow' : 'profile-editor__frame-pump--pressure'"
                >{{ frame.pump === 'flow' ? 'F' : 'P' }}</span>
                <span class="profile-editor__frame-name">{{ frame.name || `Frame ${i + 1}` }}</span>
                <span class="profile-editor__frame-detail">
                  {{ frame.pump === 'flow' ? (frame.flow ?? 0).toFixed(1) + ' mL/s' : (frame.pressure ?? 0).toFixed(1) + ' bar' }}
                </span>
                <span class="profile-editor__frame-detail">{{ (frame.seconds || 0).toFixed(0) }}s</span>
                <span class="profile-editor__frame-detail profile-editor__frame-detail--temp">{{ (frame.temperature || 93).toFixed(0) }}&deg;</span>
              </div>
            </div>
          </div>

          <!-- RIGHT: Frame editor panel -->
          <div class="profile-editor__right">
            <!-- Profile settings toggle -->
            <button
              class="profile-editor__settings-btn"
              @click="showSettings = !showSettings"
            >
              {{ showSettings ? 'Frame Editor' : 'Profile Settings' }}
              <span v-if="!showSettings" class="profile-editor__settings-hint">
                ({{ stopAtLabel }}, {{ (frames[0]?.temperature || 93).toFixed(0) }}&deg;C)
              </span>
            </button>

            <!-- Profile settings panel -->
            <div v-if="showSettings" class="profile-editor__settings-panel">
              <!-- Title -->
              <div class="profile-editor__field-group">
                <label class="profile-editor__label">Name</label>
                <input
                  class="profile-editor__text-input"
                  type="text"
                  :value="profile.title || ''"
                  @change="profile.title = $event.target.value; triggerUpdate()"
                  placeholder="Profile name"
                />
              </div>

              <!-- Author -->
              <div class="profile-editor__field-group">
                <label class="profile-editor__label">Author</label>
                <input
                  class="profile-editor__text-input"
                  type="text"
                  :value="profile.author || ''"
                  @change="profile.author = $event.target.value; triggerUpdate()"
                  placeholder="Author"
                />
              </div>

              <!-- Notes -->
              <div class="profile-editor__field-group">
                <label class="profile-editor__label">Notes</label>
                <textarea
                  class="profile-editor__textarea"
                  :value="profile.notes || profile.profile_notes || ''"
                  @change="profile.notes = $event.target.value; triggerUpdate()"
                  placeholder="Profile description"
                  rows="2"
                ></textarea>
              </div>

              <!-- Stop at type -->
              <div class="profile-editor__field-group">
                <label class="profile-editor__label">Stop At</label>
                <div class="profile-editor__radio-row">
                  <label class="profile-editor__radio" :class="{ 'profile-editor__radio--active': profile.stop_at_type !== 'volume' }">
                    <input type="radio" :checked="profile.stop_at_type !== 'volume'" @change="setStopAtType('weight')" />
                    Weight
                  </label>
                  <label class="profile-editor__radio" :class="{ 'profile-editor__radio--active': profile.stop_at_type === 'volume' }">
                    <input type="radio" :checked="profile.stop_at_type === 'volume'" @change="setStopAtType('volume')" />
                    Volume
                  </label>
                </div>
              </div>

              <!-- Stop value -->
              <div class="profile-editor__field-row">
                <span class="profile-editor__label">{{ profile.stop_at_type === 'volume' ? 'Volume' : 'Weight' }}</span>
                <ValueInput
                  :model-value="profile.stop_at_type === 'volume' ? (profile.target_volume || 36) : (profile.target_weight || 36)"
                  @update:model-value="v => { if (profile.stop_at_type === 'volume') { profile.target_volume = v } else { profile.target_weight = v }; triggerUpdate() }"
                  :min="0"
                  :max="500"
                  :step="1"
                  :decimals="0"
                  :suffix="profile.stop_at_type === 'volume' ? ' mL' : ' g'"
                  aria-label="Stop-at value"
                />
              </div>

              <!-- Global temperature -->
              <div class="profile-editor__field-row">
                <span class="profile-editor__label">All temps</span>
                <ValueInput
                  :model-value="frames[0]?.temperature || 93"
                  @update:model-value="updateGlobalTemp"
                  :min="70"
                  :max="100"
                  :step="0.5"
                  :decimals="1"
                  suffix=" &deg;C"
                  aria-label="Global temperature"
                />
              </div>
            </div>

            <!-- Frame editor (when frame selected and not in settings) -->
            <div v-else-if="currentFrame" class="profile-editor__frame-editor">
              <!-- Frame name -->
              <div class="profile-editor__field-group">
                <label class="profile-editor__label">Frame Name</label>
                <input
                  class="profile-editor__text-input"
                  type="text"
                  :value="currentFrame.name || ''"
                  @change="updateFrameField('name', $event.target.value)"
                  placeholder="Frame name"
                />
              </div>

              <!-- Pump mode -->
              <div class="profile-editor__field-group">
                <label class="profile-editor__label">Pump Mode</label>
                <div class="profile-editor__radio-row">
                  <label class="profile-editor__radio" :class="{ 'profile-editor__radio--active': currentFrame.pump === 'pressure' }">
                    <input type="radio" :checked="currentFrame.pump === 'pressure'" @change="setPumpMode('pressure')" />
                    Pressure
                  </label>
                  <label class="profile-editor__radio" :class="{ 'profile-editor__radio--active': currentFrame.pump === 'flow' }">
                    <input type="radio" :checked="currentFrame.pump === 'flow'" @change="setPumpMode('flow')" />
                    Flow
                  </label>
                </div>
              </div>

              <!-- Setpoint (pressure or flow depending on pump mode) -->
              <div class="profile-editor__field-row">
                <span class="profile-editor__label">{{ currentFrame.pump === 'flow' ? 'Flow' : 'Pressure' }}</span>
                <ValueInput
                  :model-value="currentFrame.pump === 'flow' ? (currentFrame.flow ?? 0) : (currentFrame.pressure ?? 0)"
                  @update:model-value="v => updateFrameField(currentFrame.pump === 'flow' ? 'flow' : 'pressure', v)"
                  :min="0"
                  :max="currentFrame.pump === 'flow' ? 8 : 12"
                  :step="0.1"
                  :decimals="1"
                  :suffix="currentFrame.pump === 'flow' ? ' mL/s' : ' bar'"
                  :aria-label="currentFrame.pump === 'flow' ? 'Flow setpoint' : 'Pressure setpoint'"
                />
              </div>

              <!-- Temperature -->
              <div class="profile-editor__field-row">
                <span class="profile-editor__label">Temp</span>
                <ValueInput
                  :model-value="currentFrame.temperature ?? 93"
                  @update:model-value="v => updateFrameField('temperature', v)"
                  :min="70"
                  :max="100"
                  :step="0.5"
                  :decimals="1"
                  suffix="&deg;C"
                  aria-label="Frame temperature"
                />
              </div>

              <!-- Duration -->
              <div class="profile-editor__field-row">
                <span class="profile-editor__label">Duration</span>
                <ValueInput
                  :model-value="currentFrame.seconds ?? 30"
                  @update:model-value="v => updateFrameField('seconds', v)"
                  :min="0"
                  :max="120"
                  :step="1"
                  :decimals="0"
                  suffix="s"
                  aria-label="Frame duration"
                />
              </div>

              <!-- Transition -->
              <div class="profile-editor__field-group">
                <label class="profile-editor__label">Transition</label>
                <div class="profile-editor__radio-row">
                  <label class="profile-editor__radio" :class="{ 'profile-editor__radio--active': currentFrame.transition === 'fast' }">
                    <input type="radio" :checked="currentFrame.transition === 'fast'" @change="setTransition('fast')" />
                    Fast
                  </label>
                  <label class="profile-editor__radio" :class="{ 'profile-editor__radio--active': currentFrame.transition === 'smooth' }">
                    <input type="radio" :checked="currentFrame.transition === 'smooth'" @change="setTransition('smooth')" />
                    Smooth
                  </label>
                </div>
              </div>

              <!-- Exit condition -->
              <div class="profile-editor__field-group profile-editor__section">
                <label class="profile-editor__label">Exit Condition</label>
                <label class="profile-editor__checkbox">
                  <input
                    type="checkbox"
                    :checked="currentFrame.exit_if"
                    @change="setExitEnabled($event.target.checked)"
                  />
                  Enable early exit
                </label>

                <template v-if="currentFrame.exit_if">
                  <select
                    class="profile-editor__select"
                    :value="currentFrame.exit_type || 'pressure_over'"
                    @change="setExitType($event.target.value)"
                  >
                    <option v-for="et in EXIT_TYPES" :key="et.value" :value="et.value">{{ et.label }}</option>
                  </select>

                  <ValueInput
                    :model-value="currentExitValue()"
                    @update:model-value="updateExitValue"
                    :min="0"
                    :max="exitValueMax()"
                    :step="exitValueStep()"
                    :decimals="1"
                    :suffix="exitValueSuffix()"
                    aria-label="Exit condition value"
                  />
                </template>
              </div>

              <!-- Sensor -->
              <div class="profile-editor__field-group">
                <label class="profile-editor__label">Sensor</label>
                <div class="profile-editor__radio-row">
                  <label class="profile-editor__radio" :class="{ 'profile-editor__radio--active': currentFrame.sensor === 'coffee' }">
                    <input type="radio" :checked="currentFrame.sensor === 'coffee'" @change="setSensor('coffee')" />
                    Coffee
                  </label>
                  <label class="profile-editor__radio" :class="{ 'profile-editor__radio--active': currentFrame.sensor === 'water' }">
                    <input type="radio" :checked="currentFrame.sensor === 'water'" @change="setSensor('water')" />
                    Water
                  </label>
                </div>
              </div>

              <!-- Limiter -->
              <div class="profile-editor__field-group profile-editor__section">
                <label class="profile-editor__label">
                  {{ currentFrame.pump === 'flow' ? 'Pressure Limit' : 'Flow Limit' }}
                </label>
                <div class="profile-editor__field-row">
                  <span class="profile-editor__label profile-editor__label--small">Limit</span>
                  <ValueInput
                    :model-value="currentFrame.max_flow_or_pressure ?? 0"
                    @update:model-value="v => updateFrameField('max_flow_or_pressure', v)"
                    :min="0"
                    :max="currentFrame.pump === 'flow' ? 12 : 8"
                    :step="0.1"
                    :decimals="1"
                    :suffix="currentFrame.pump === 'flow' ? ' bar' : ' mL/s'"
                    aria-label="Limiter value"
                  />
                </div>
                <div class="profile-editor__field-row">
                  <span class="profile-editor__label profile-editor__label--small">Range</span>
                  <ValueInput
                    :model-value="currentFrame.max_flow_or_pressure_range ?? 0.6"
                    @update:model-value="v => updateFrameField('max_flow_or_pressure_range', v)"
                    :min="0.1"
                    :max="2.0"
                    :step="0.1"
                    :decimals="1"
                    :suffix="currentFrame.pump === 'flow' ? ' bar' : ' mL/s'"
                    aria-label="Limiter range"
                  />
                </div>
              </div>

              <!-- Volume limit -->
              <div class="profile-editor__field-row">
                <span class="profile-editor__label">Vol. limit</span>
                <ValueInput
                  :model-value="currentFrame.volume ?? 0"
                  @update:model-value="v => updateFrameField('volume', v)"
                  :min="0"
                  :max="500"
                  :step="1"
                  :decimals="0"
                  suffix=" mL"
                  aria-label="Frame volume limit"
                />
              </div>

              <!-- Weight exit (independent of exit_if) -->
              <div class="profile-editor__field-row">
                <span class="profile-editor__label">Wt. exit</span>
                <ValueInput
                  :model-value="currentFrame.exit_weight ?? 0"
                  @update:model-value="v => { updateFrameField('exit_weight', v); currentFrame.weight = v }"
                  :min="0"
                  :max="100"
                  :step="0.5"
                  :decimals="1"
                  suffix=" g"
                  aria-label="Weight exit"
                />
              </div>

              <!-- Popup message -->
              <div class="profile-editor__field-group">
                <label class="profile-editor__label">Popup</label>
                <input
                  class="profile-editor__text-input"
                  type="text"
                  :value="currentFrame.popup || ''"
                  @change="updateFrameField('popup', $event.target.value)"
                  placeholder="e.g., Swirl now, $weight"
                />
              </div>
            </div>

            <!-- No frame selected -->
            <div v-else class="profile-editor__no-selection">
              <div class="profile-editor__no-selection-title">Select a frame</div>
              <div class="profile-editor__no-selection-hint">
                Click on the graph or frame list<br/>to select a frame for editing
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="profile-editor__loading">Profile not found</div>

    <!-- Bottom bar -->
    <BottomBar title="Profile Editor" @back="goBack">
      <template v-if="profile">
        <span v-if="isDirty" class="profile-editor__dirty-badge">Modified</span>
        <span style="opacity: 0.3">|</span>
        <span>{{ frameCount }} frames</span>
        <span style="opacity: 0.3">|</span>
        <span :style="{ color: profile.stop_at_type === 'volume' ? 'var(--color-flow-goal)' : 'var(--color-weight)' }">
          {{ stopAtLabel }}
        </span>
        <span style="opacity: 0.3">|</span>
        <span>{{ totalDuration.toFixed(0) }}s</span>
        <span class="profile-editor__bar-spacer"></span>
        <button
          class="profile-editor__bar-btn"
          @click="uploadToMachine"
          :disabled="saving"
        >Upload</button>
        <button
          class="profile-editor__bar-btn profile-editor__bar-btn--save"
          @click="saveProfile"
          :disabled="saving"
        >Save</button>
      </template>
    </BottomBar>
  </div>
</template>

<style scoped>
/* ======================================================================
   Layout
   ====================================================================== */

.profile-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.profile-editor__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: var(--margin-standard, 12px);
  gap: 8px;
}

.profile-editor__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-secondary);
}

/* Banner */
.profile-editor__banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--color-warning, #ffcc00);
  border-radius: var(--radius-card, 8px);
  flex-shrink: 0;
}

.profile-editor__banner-title {
  font-size: var(--font-title, 16px);
  font-weight: bold;
  color: var(--color-background);
}

.profile-editor__banner-hint {
  font-size: var(--font-caption, 11px);
  color: rgba(26, 26, 46, 0.75);
}

/* Main two-column layout */
.profile-editor__main {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

.profile-editor__left {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #252538);
  border-radius: var(--radius-card, 8px);
  min-height: 0;
  overflow: hidden;
}

.profile-editor__right {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #252538);
  border-radius: var(--radius-card, 8px);
  padding: 12px;
  min-height: 0;
  overflow-y: auto;
}

/* ======================================================================
   Toolbar
   ====================================================================== */

.profile-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.profile-editor__toolbar-label {
  font-size: var(--font-caption, 11px);
  color: var(--color-text, #fff);
  font-weight: 600;
  text-transform: uppercase;
}

.profile-editor__toolbar-spacer {
  flex: 1;
}

.profile-editor__tool-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
  background: transparent;
  color: var(--color-text, #fff);
  font-size: var(--font-sm);
  cursor: pointer;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.profile-editor__tool-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
}

.profile-editor__tool-btn:active:not(:disabled) {
  filter: brightness(0.8);
}

.profile-editor__tool-btn--primary {
  background: var(--color-primary, #4e85f4);
  border-color: var(--color-primary, #4e85f4);
  color: var(--color-text);
}

.profile-editor__tool-btn--danger {
  background: var(--color-accent, #e94560);
  border-color: var(--color-accent, #e94560);
  color: var(--color-text);
}

/* ======================================================================
   Graph
   ====================================================================== */

.profile-editor__graph {
  flex: 1;
  min-height: 120px;
}

/* ======================================================================
   Frame list
   ====================================================================== */

.profile-editor__frame-list {
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.profile-editor__frame-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.profile-editor__frame-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.profile-editor__frame-row--selected {
  background: rgba(233, 69, 96, 0.18);
}

.profile-editor__frame-index {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-primary, #4e85f4);
  color: var(--color-text);
  font-size: var(--font-sm);
  font-weight: bold;
  flex-shrink: 0;
}

.profile-editor__frame-pump {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: var(--font-sm);
  font-weight: bold;
  flex-shrink: 0;
  color: var(--color-text);
}

.profile-editor__frame-pump--pressure {
  background: var(--color-pressure);
}

.profile-editor__frame-pump--flow {
  background: var(--color-flow);
}

.profile-editor__frame-name {
  flex: 1;
  font-size: var(--font-body, 14px);
  color: var(--color-text, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.profile-editor__frame-detail {
  font-size: var(--font-caption, 11px);
  color: var(--color-text-secondary, #a0a8b8);
  white-space: nowrap;
  flex-shrink: 0;
}

.profile-editor__frame-detail--temp {
  color: #ffa5a6;
}

/* ======================================================================
   Right panel — editor fields
   ====================================================================== */

.profile-editor__settings-btn {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-text-secondary, #a0a8b8);
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text, #fff);
  font-size: var(--font-caption, 11px);
  cursor: pointer;
  text-align: center;
  flex-shrink: 0;
  margin-bottom: 10px;
  -webkit-tap-highlight-color: transparent;
}

.profile-editor__settings-btn:active {
  filter: brightness(0.85);
}

.profile-editor__settings-hint {
  color: var(--color-text-secondary, #a0a8b8);
  margin-left: 4px;
}

.profile-editor__settings-panel,
.profile-editor__frame-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

/* Field groups */
.profile-editor__field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-editor__field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.profile-editor__field-row > .profile-editor__label {
  width: 72px;
  flex-shrink: 0;
}

.profile-editor__field-row > .value-input {
  flex: 1;
}

.profile-editor__label {
  font-size: var(--font-caption, 11px);
  color: var(--color-text-secondary, #a0a8b8);
  text-transform: uppercase;
  font-weight: 600;
}

.profile-editor__label--small {
  font-size: var(--font-xs);
  width: 48px;
  flex-shrink: 0;
}

.profile-editor__section {
  padding: 10px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
}

/* Text inputs */
.profile-editor__text-input,
.profile-editor__textarea,
.profile-editor__select {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: var(--color-background, #1a1a2e);
  color: var(--color-text, #fff);
  font-size: var(--font-body, 14px);
  font-family: inherit;
}

.profile-editor__text-input:focus,
.profile-editor__textarea:focus,
.profile-editor__select:focus {
  outline: none;
  border-color: var(--color-primary, #4e85f4);
}

.profile-editor__textarea {
  resize: vertical;
  min-height: 40px;
}

.profile-editor__select {
  cursor: pointer;
  appearance: auto;
}

.profile-editor__select option {
  background: var(--color-surface, #252538);
  color: var(--color-text, #fff);
}

/* Radio buttons */
.profile-editor__radio-row {
  display: flex;
  gap: 16px;
}

.profile-editor__radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-body, 14px);
  color: var(--color-text, #fff);
  cursor: pointer;
}

.profile-editor__radio--active {
  color: var(--color-primary, #4e85f4);
}

.profile-editor__radio input[type="radio"] {
  accent-color: var(--color-primary, #4e85f4);
}

/* Checkbox */
.profile-editor__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-body, 14px);
  color: var(--color-text, #fff);
  cursor: pointer;
}

.profile-editor__checkbox input[type="checkbox"] {
  accent-color: var(--color-primary, #4e85f4);
}

/* No selection */
.profile-editor__no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 10px;
  text-align: center;
}

.profile-editor__no-selection-title {
  font-size: var(--font-title, 16px);
  color: var(--color-text-secondary, #a0a8b8);
}

.profile-editor__no-selection-hint {
  font-size: var(--font-body, 14px);
  color: var(--color-text-secondary, #a0a8b8);
  line-height: 1.5;
}

/* ======================================================================
   Bottom bar additions
   ====================================================================== */

.profile-editor__dirty-badge {
  color: #ffcc00;
  font-weight: 600;
}

.profile-editor__bar-spacer {
  flex: 1;
}

.profile-editor__bar-btn {
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.profile-editor__bar-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
}

.profile-editor__bar-btn:active:not(:disabled) {
  filter: brightness(0.8);
}

.profile-editor__bar-btn--save {
  background: #fff;
  color: var(--color-primary, #4e85f4);
  border-color: var(--color-text);
}

/* ======================================================================
   Responsive: on narrow screens stack vertically
   ====================================================================== */

@media (max-width: 720px) {
  .profile-editor__main {
    flex-direction: column;
  }

  .profile-editor__right {
    width: 100%;
    max-height: 50vh;
  }

  .profile-editor__graph {
    min-height: 160px;
  }
}
</style>
