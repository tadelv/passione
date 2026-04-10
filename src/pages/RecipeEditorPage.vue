<script setup>
import { ref, computed, watch, inject, onMounted } from 'vue'
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
// Phase definitions
// ---------------------------------------------------------------------------

/**
 * Each recipe phase maps to 1-2 profile frames.
 * The phase key is the canonical identifier; the label is for display.
 */
const PHASE_DEFS = [
  { key: 'fill',    label: 'Fill',    description: 'Initial water fill at low pressure to saturate the puck' },
  { key: 'bloom',   label: 'Bloom',   description: 'Pause/soak allowing CO2 to escape from fresh grounds' },
  { key: 'infuse',  label: 'Infuse',  description: 'Low-pressure soak before main extraction' },
  { key: 'ramp',    label: 'Ramp',    description: 'Gradual transition to extraction pressure or flow' },
  { key: 'pour',    label: 'Pour',    description: 'Main extraction phase at target pressure or flow' },
  { key: 'decline', label: 'Decline', description: 'Decreasing pressure/flow at end of shot' },
]

// ---------------------------------------------------------------------------
// Recipe presets
// ---------------------------------------------------------------------------

function makePhase(overrides) {
  return {
    enabled: true,
    pump: 'pressure',
    target: 9.0,
    temperature: 93.0,
    seconds: 30,
    transition: 'fast',
    exitEnabled: false,
    exitType: 'pressure_over',
    exitValue: 0,
    limiterValue: 0,
    limiterRange: 0.6,
    ...overrides,
  }
}

const RECIPE_PRESETS = {
  classic: {
    name: 'Classic Espresso',
    description: '9 bar flat pressure, short preinfusion',
    temperature: 93.0,
    targetWeight: 36,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 4.0, seconds: 8, exitEnabled: true, exitType: 'pressure_over', exitValue: 4.0, limiterValue: 0 }),
      bloom:   makePhase({ enabled: false, pump: 'flow', target: 0, seconds: 0 }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ enabled: false, pump: 'pressure', target: 9.0, seconds: 0 }),
      pour:    makePhase({ pump: 'pressure', target: 9.0, seconds: 30, temperature: 93.0, limiterValue: 4.5 }),
      decline: makePhase({ enabled: false, pump: 'pressure', target: 6.0, seconds: 0 }),
    },
  },
  turbo: {
    name: 'Turbo Shot',
    description: 'High-flow, fast extraction',
    temperature: 90.0,
    targetWeight: 45,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 8.0, seconds: 5, exitEnabled: true, exitType: 'pressure_over', exitValue: 2.0, limiterValue: 4.0 }),
      bloom:   makePhase({ enabled: false, pump: 'flow', target: 0, seconds: 0 }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ enabled: false, pump: 'pressure', target: 6.0, seconds: 0 }),
      pour:    makePhase({ pump: 'flow', target: 4.5, seconds: 25, temperature: 90.0, limiterValue: 6.0 }),
      decline: makePhase({ enabled: false, pump: 'flow', target: 2.0, seconds: 0 }),
    },
  },
  blooming: {
    name: 'Blooming Espresso',
    description: 'Long preinfusion with bloom pause for light roasts',
    temperature: 95.0,
    targetWeight: 60,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 4.0, seconds: 5, exitEnabled: true, exitType: 'pressure_over', exitValue: 3.5 }),
      bloom:   makePhase({ pump: 'flow', target: 0, seconds: 30, temperature: 90.0, transition: 'fast' }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ pump: 'flow', target: 2.2, seconds: 5, temperature: 92.0, transition: 'smooth' }),
      pour:    makePhase({ pump: 'flow', target: 2.2, seconds: 20, temperature: 92.0, limiterValue: 8.6, limiterRange: 0.6 }),
      decline: makePhase({ enabled: false, pump: 'flow', target: 1.0, seconds: 0 }),
    },
  },
  allonge: {
    name: 'Allonge',
    description: 'Long blooming shot with high flow, 5:1 ratio',
    temperature: 95.0,
    targetWeight: 135,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 4.5, seconds: 5, exitEnabled: true, exitType: 'pressure_over', exitValue: 3.5 }),
      bloom:   makePhase({ pump: 'flow', target: 0, seconds: 30, temperature: 93.0 }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ pump: 'flow', target: 3.5, seconds: 7, temperature: 92.5, transition: 'smooth' }),
      pour:    makePhase({ pump: 'flow', target: 3.5, seconds: 60, temperature: 91.0, limiterValue: 8.6, limiterRange: 0.6 }),
      decline: makePhase({ enabled: false, pump: 'flow', target: 2.0, seconds: 0 }),
    },
  },
  lever: {
    name: 'Lever Style',
    description: 'Pressure ramp up then decline, mimicking spring lever machines',
    temperature: 93.0,
    targetWeight: 36,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 4.0, seconds: 8, exitEnabled: true, exitType: 'pressure_over', exitValue: 3.0 }),
      bloom:   makePhase({ enabled: false, pump: 'flow', target: 0, seconds: 0 }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ pump: 'pressure', target: 9.0, seconds: 5, transition: 'smooth' }),
      pour:    makePhase({ pump: 'pressure', target: 9.0, seconds: 10 }),
      decline: makePhase({ pump: 'pressure', target: 4.0, seconds: 20, transition: 'smooth' }),
    },
  },
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const loading = ref(false)
const saving = ref(false)

/** Recipe name */
const recipeName = ref('New Recipe')
const recipeAuthor = ref('')
const recipeNotes = ref('')

/** Temperature applied to all enabled phases by default */
const globalTemperature = ref(93.0)

/** Stop target weight */
const targetWeight = ref(36)

/** Stop-at type */
const stopAtType = ref('weight')

/** Target volume (when stopAtType is volume) */
const targetVolume = ref(0)

/** Phase data keyed by phase key */
const phases = ref({})

/** Which phase card is expanded */
const expandedPhase = ref('pour')

/** Snapshot of original state for dirty detection */
let originalSnapshot = ''

/** The record from the API (if loaded from existing profile) */
const record = ref(null)

/** Selected preset key (for UI display) */
const selectedPreset = ref('')

// ---------------------------------------------------------------------------
// Initialize default phases
// ---------------------------------------------------------------------------

function initPhases() {
  const p = {}
  for (const def of PHASE_DEFS) {
    p[def.key] = makePhase({
      enabled: def.key === 'fill' || def.key === 'pour',
      pump: def.key === 'fill' ? 'flow' : 'pressure',
      target: def.key === 'fill' ? 4.0 : 9.0,
      seconds: def.key === 'fill' ? 8 : 30,
      temperature: globalTemperature.value,
    })
  }
  return p
}

// ---------------------------------------------------------------------------
// Computed helpers
// ---------------------------------------------------------------------------

const isDirty = computed(() => {
  return JSON.stringify(buildRecipeState()) !== originalSnapshot
})

const enabledPhaseCount = computed(() => {
  return Object.values(phases.value).filter(p => p.enabled).length
})

const totalDuration = computed(() => {
  let t = 0
  for (const def of PHASE_DEFS) {
    const p = phases.value[def.key]
    if (p && p.enabled) t += p.seconds || 0
  }
  return t
})

/**
 * Convert current recipe phases to profile frames for ProfileGraph preview.
 */
const previewProfile = computed(() => {
  const frames = phasesToFrames()
  return {
    title: recipeName.value || 'Recipe Preview',
    frames,
    target_weight: targetWeight.value,
    target_volume: targetVolume.value,
    stop_at_type: stopAtType.value,
  }
})

// ---------------------------------------------------------------------------
// Phase-to-frame conversion
// ---------------------------------------------------------------------------

/**
 * Convert enabled recipe phases to profile frames.
 * Each phase generates 1 frame (or 2 for Fill which adds a start + hold).
 */
function phasesToFrames() {
  const frames = []

  for (const def of PHASE_DEFS) {
    const p = phases.value[def.key]
    if (!p || !p.enabled) continue

    const frame = {
      name: def.label,
      temperature: p.temperature,
      sensor: 'coffee',
      pump: p.pump,
      transition: p.transition || 'fast',
      pressure: p.pump === 'pressure' ? p.target : 0,
      flow: p.pump === 'flow' ? p.target : 0,
      seconds: p.seconds,
      volume: 0,
      exit_if: p.exitEnabled || false,
      exit_type: p.exitType || 'pressure_over',
      exit_pressure_over: 0,
      exit_pressure_under: 0,
      exit_flow_over: 6,
      exit_flow_under: 0,
      exit_weight: 0,
      max_flow_or_pressure: p.limiterValue || 0,
      max_flow_or_pressure_range: p.limiterRange || 0.6,
    }

    // Set the specific exit value
    if (p.exitEnabled) {
      switch (p.exitType) {
        case 'pressure_over': frame.exit_pressure_over = p.exitValue; break
        case 'pressure_under': frame.exit_pressure_under = p.exitValue; break
        case 'flow_over': frame.exit_flow_over = p.exitValue; break
        case 'flow_under': frame.exit_flow_under = p.exitValue; break
        case 'weight': frame.exit_weight = p.exitValue; break
      }
    }

    frames.push(frame)
  }

  return frames
}

/**
 * Build the complete profile object from the recipe state.
 */
function buildProfile() {
  const frames = phasesToFrames()

  // Build recipe metadata for round-trip
  const recipeMeta = {}
  for (const def of PHASE_DEFS) {
    const p = phases.value[def.key]
    if (p) {
      recipeMeta[def.key] = { ...p }
    }
  }

  return {
    title: recipeName.value || 'Untitled Recipe',
    author: recipeAuthor.value || '',
    notes: recipeNotes.value || '',
    beverage_type: 'espresso',
    target_weight: stopAtType.value !== 'volume' ? targetWeight.value : 0,
    target_volume: stopAtType.value === 'volume' ? targetVolume.value : 0,
    stop_at_type: stopAtType.value,
    mode: 'frame_based',
    profile_type: 'settings_2c',
    is_recipe_mode: true,
    recipe: recipeMeta,
    frames,
  }
}

function buildRecipeState() {
  return {
    name: recipeName.value,
    author: recipeAuthor.value,
    notes: recipeNotes.value,
    temperature: globalTemperature.value,
    targetWeight: targetWeight.value,
    targetVolume: targetVolume.value,
    stopAtType: stopAtType.value,
    phases: JSON.parse(JSON.stringify(phases.value)),
  }
}

// ---------------------------------------------------------------------------
// Frame-to-phase mapping (loading from existing profile)
// ---------------------------------------------------------------------------

/**
 * Attempt to map raw profile frames back into named recipe phases.
 * Uses heuristics: frame name matching, pressure/flow ranges, position.
 */
function framesToPhases(profile) {
  const steps = profile.frames || profile.steps || []
  if (!steps.length) return null

  // If the profile already has recipe metadata, use it directly
  if (profile.recipe && typeof profile.recipe === 'object') {
    return mapRecipeMetaToPhases(profile.recipe)
  }

  // Heuristic mapping by frame name and characteristics
  const mapped = {}
  for (const def of PHASE_DEFS) {
    mapped[def.key] = makePhase({ enabled: false, temperature: globalTemperature.value })
  }

  for (const frame of steps) {
    const name = (frame.name || '').toLowerCase()
    const pump = frame.pump || 'pressure'
    const pressure = frame.pressure || 0
    const flow = frame.flow || 0
    const target = pump === 'flow' ? flow : pressure
    const seconds = frame.seconds || 0

    let phaseKey = null

    // Match by name
    if (name.includes('fill') || name.includes('preinfusion') || name.includes('pre-infusion') || name.includes('pre start')) {
      phaseKey = 'fill'
    } else if (name.includes('bloom') || name.includes('pause') || name.includes('soak')) {
      phaseKey = 'bloom'
    } else if (name.includes('infus')) {
      phaseKey = 'infuse'
    } else if (name.includes('ramp')) {
      phaseKey = 'ramp'
    } else if (name.includes('decline') || name.includes('decrease') || name.includes('taper')) {
      phaseKey = 'decline'
    } else if (name.includes('pour') || name.includes('extraction') || name.includes('flat') || name.includes('hold') || name.includes('turbo')) {
      phaseKey = 'pour'
    }

    // Fallback: heuristic by position and characteristics
    if (!phaseKey) {
      if (pump === 'flow' && flow === 0 && seconds > 5) {
        phaseKey = 'bloom'
      } else if (pump === 'flow' && flow > 3 && seconds <= 10) {
        // High flow, short duration — likely fill
        if (!mapped.fill.enabled) phaseKey = 'fill'
      } else if (frame.transition === 'smooth' && seconds > 0 && seconds <= 10) {
        phaseKey = 'ramp'
      }
    }

    // Last resort: if nothing matched, treat as pour
    if (!phaseKey) {
      phaseKey = mapped.pour.enabled ? 'decline' : 'pour'
    }

    // Skip if this phase is already filled (take first match)
    if (mapped[phaseKey].enabled) continue

    mapped[phaseKey] = makePhase({
      enabled: true,
      pump,
      target,
      temperature: frame.temperature || 93,
      seconds,
      transition: frame.transition || 'fast',
      exitEnabled: !!frame.exit_if,
      exitType: frame.exit_type || 'pressure_over',
      exitValue: getExitValueFromFrame(frame),
      limiterValue: frame.max_flow_or_pressure || 0,
      limiterRange: frame.max_flow_or_pressure_range || 0.6,
    })
  }

  return mapped
}

function getExitValueFromFrame(frame) {
  switch (frame.exit_type) {
    case 'pressure_over': return frame.exit_pressure_over || 0
    case 'pressure_under': return frame.exit_pressure_under || 0
    case 'flow_over': return frame.exit_flow_over || 0
    case 'flow_under': return frame.exit_flow_under || 0
    case 'weight': return frame.exit_weight || 0
    default: return frame.exit_pressure_over || 0
  }
}

/**
 * Map stored recipe metadata object back to phases.
 */
function mapRecipeMetaToPhases(recipe) {
  const mapped = {}
  for (const def of PHASE_DEFS) {
    if (recipe[def.key] && typeof recipe[def.key] === 'object') {
      mapped[def.key] = makePhase(recipe[def.key])
    } else {
      mapped[def.key] = makePhase({ enabled: false, temperature: globalTemperature.value })
    }
  }
  return mapped
}

// ---------------------------------------------------------------------------
// Load profile
// ---------------------------------------------------------------------------

async function loadProfile() {
  const id = route.params.id
  if (!id) {
    // New recipe — use defaults
    phases.value = initPhases()
    originalSnapshot = JSON.stringify(buildRecipeState())
    return
  }

  loading.value = true
  try {
    const data = await getProfile(id)
    record.value = data
    const profile = data.profile || data

    recipeName.value = profile.title || 'Untitled'
    recipeAuthor.value = profile.author || ''
    recipeNotes.value = profile.notes || profile.profile_notes || ''
    targetWeight.value = profile.target_weight || 36
    targetVolume.value = profile.target_volume || 0
    stopAtType.value = profile.stop_at_type || (profile.target_weight > 0 ? 'weight' : 'volume')

    // Try to derive temperature from frames
    const steps = profile.frames || profile.steps || []
    if (steps.length > 0) {
      globalTemperature.value = steps[0].temperature || 93
    }

    // Attempt to map frames to recipe phases
    const mapped = framesToPhases(profile)
    if (mapped) {
      phases.value = mapped
    } else {
      phases.value = initPhases()
    }

    // Expand the first enabled phase
    const firstEnabled = PHASE_DEFS.find(d => phases.value[d.key]?.enabled)
    if (firstEnabled) expandedPhase.value = firstEnabled.key

    originalSnapshot = JSON.stringify(buildRecipeState())
  } catch (e) {
    console.warn('[RecipeEditorPage] Failed to load profile:', e.message)
    if (toast) toast.error('Failed to load profile')
    phases.value = initPhases()
    originalSnapshot = JSON.stringify(buildRecipeState())
  } finally {
    loading.value = false
  }
}

// ---------------------------------------------------------------------------
// Preset application
// ---------------------------------------------------------------------------

function applyPreset(key) {
  const preset = RECIPE_PRESETS[key]
  if (!preset) return

  selectedPreset.value = key
  recipeName.value = preset.name
  globalTemperature.value = preset.temperature
  targetWeight.value = preset.targetWeight

  // Deep clone the preset phases
  const newPhases = {}
  for (const def of PHASE_DEFS) {
    if (preset.phases[def.key]) {
      newPhases[def.key] = { ...preset.phases[def.key] }
    } else {
      newPhases[def.key] = makePhase({ enabled: false, temperature: preset.temperature })
    }
  }
  phases.value = newPhases

  // Expand first enabled phase
  const firstEnabled = PHASE_DEFS.find(d => newPhases[d.key]?.enabled)
  if (firstEnabled) expandedPhase.value = firstEnabled.key
}

// ---------------------------------------------------------------------------
// Phase manipulation
// ---------------------------------------------------------------------------

function togglePhase(key) {
  const p = phases.value[key]
  if (!p) return
  p.enabled = !p.enabled
  triggerUpdate()
}

function updatePhaseField(key, field, value) {
  const p = phases.value[key]
  if (!p) return
  p[field] = value
  triggerUpdate()
}

function setPhaseExpanded(key) {
  expandedPhase.value = expandedPhase.value === key ? '' : key
}

/**
 * Force Vue reactivity to pick up deep changes inside phases.
 */
function triggerUpdate() {
  phases.value = { ...phases.value }
}

function updateGlobalTemp(newTemp) {
  globalTemperature.value = newTemp
  // Apply to all phases
  for (const key of Object.keys(phases.value)) {
    phases.value[key].temperature = newTemp
  }
  triggerUpdate()
}

// ---------------------------------------------------------------------------
// Save / upload
// ---------------------------------------------------------------------------

async function saveProfile() {
  if (enabledPhaseCount.value === 0) {
    if (toast) toast.warning('Enable at least one phase before saving')
    return
  }

  saving.value = true
  try {
    const profile = buildProfile()
    const existingId = record.value?.id || profile?.id
    const result = existingId
      ? await updateProfile(existingId, profile)
      : await createProfile(profile)
    if (result?.id) {
      record.value = result
    }
    originalSnapshot = JSON.stringify(buildRecipeState())
    if (toast) toast.success('Recipe saved')
  } catch (e) {
    console.warn('[RecipeEditorPage] Save failed:', e.message)
    if (toast) toast.error('Failed to save recipe: ' + e.message)
  } finally {
    saving.value = false
  }
}

async function uploadToMachine() {
  if (enabledPhaseCount.value === 0) {
    if (toast) toast.warning('Enable at least one phase before uploading')
    return
  }

  saving.value = true
  try {
    const profile = buildProfile()
    await uploadProfileToMachine(profile)
    if (toast) toast.success('Recipe uploaded to machine')
  } catch (e) {
    console.warn('[RecipeEditorPage] Upload failed:', e.message)
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

function switchToAdvanced() {
  // Save current recipe as a profile, then open in ProfileEditorPage
  const profile = buildProfile()
  // Store in sessionStorage temporarily for handoff
  try {
    sessionStorage.setItem('recipe-handoff', JSON.stringify(profile))
  } catch { /* ignore */ }

  if (record.value?.id) {
    router.push({ name: 'profile-editor', params: { id: record.value.id } })
  } else {
    router.push({ name: 'profile-editor' })
  }
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

function exitMax(exitType) {
  switch (exitType) {
    case 'flow_over':
    case 'flow_under': return 8
    case 'weight': return 100
    default: return 12
  }
}

function exitStep(exitType) {
  return exitType === 'weight' ? 0.5 : 0.1
}

function exitSuffix(exitType) {
  switch (exitType) {
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
  <div class="recipe-editor">
    <!-- Loading state -->
    <div v-if="loading" class="recipe-editor__loading">
      Loading recipe...
    </div>

    <template v-else>
      <div class="recipe-editor__content">
        <!-- Top bar: name, presets, settings -->
        <div class="recipe-editor__top">
          <!-- Recipe name -->
          <div class="recipe-editor__name-row">
            <input
              class="recipe-editor__name-input"
              type="text"
              :value="recipeName"
              @change="recipeName = $event.target.value"
              placeholder="Recipe name"
              aria-label="Recipe name"
            />
          </div>

          <!-- Preset selector -->
          <div class="recipe-editor__preset-row">
            <span class="recipe-editor__preset-label">Preset</span>
            <div class="recipe-editor__preset-pills">
              <button
                v-for="(preset, key) in RECIPE_PRESETS"
                :key="key"
                class="recipe-editor__preset-pill"
                :class="{ 'recipe-editor__preset-pill--active': selectedPreset === key }"
                @click="applyPreset(key)"
              >{{ preset.name }}</button>
            </div>
          </div>

          <!-- Global settings row -->
          <div class="recipe-editor__globals">
            <div class="recipe-editor__global-field">
              <span class="recipe-editor__field-label">Temperature</span>
              <ValueInput
                :model-value="globalTemperature"
                @update:model-value="updateGlobalTemp"
                :min="70"
                :max="100"
                :step="0.5"
                :decimals="1"
                suffix=" &deg;C"
                aria-label="Global temperature"
              />
            </div>
            <div class="recipe-editor__global-field">
              <span class="recipe-editor__field-label">{{ stopAtType === 'volume' ? 'Volume' : 'Weight' }}</span>
              <ValueInput
                :model-value="stopAtType === 'volume' ? targetVolume : targetWeight"
                @update:model-value="v => { if (stopAtType === 'volume') { targetVolume = v } else { targetWeight = v } }"
                :min="0"
                :max="500"
                :step="1"
                :decimals="0"
                :suffix="stopAtType === 'volume' ? ' mL' : ' g'"
                aria-label="Stop-at value"
              />
            </div>
            <div class="recipe-editor__global-field recipe-editor__global-field--toggle">
              <button
                class="recipe-editor__stop-toggle"
                @click="stopAtType = stopAtType === 'volume' ? 'weight' : 'volume'"
              >
                {{ stopAtType === 'volume' ? 'Vol' : 'Wt' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Main layout: phases (left) + graph preview (right) -->
        <div class="recipe-editor__main">
          <!-- LEFT: Phase cards -->
          <div class="recipe-editor__phases">
            <div
              v-for="def in PHASE_DEFS"
              :key="def.key"
              class="recipe-editor__phase"
              :class="{
                'recipe-editor__phase--disabled': !phases[def.key]?.enabled,
                'recipe-editor__phase--expanded': expandedPhase === def.key && phases[def.key]?.enabled,
              }"
            >
              <!-- Phase header (always visible) -->
              <div class="recipe-editor__phase-header" @click="setPhaseExpanded(def.key)">
                <label
                  class="recipe-editor__phase-toggle"
                  @click.stop
                >
                  <input
                    type="checkbox"
                    :checked="phases[def.key]?.enabled"
                    @change="togglePhase(def.key)"
                  />
                </label>
                <span class="recipe-editor__phase-label">{{ def.label }}</span>
                <template v-if="phases[def.key]?.enabled">
                  <span class="recipe-editor__phase-summary">
                    <span
                      class="recipe-editor__phase-pump-badge"
                      :class="phases[def.key]?.pump === 'flow' ? 'recipe-editor__phase-pump-badge--flow' : 'recipe-editor__phase-pump-badge--pressure'"
                    >{{ phases[def.key]?.pump === 'flow' ? 'F' : 'P' }}</span>
                    {{ (phases[def.key]?.target || 0).toFixed(1) }}{{ phases[def.key]?.pump === 'flow' ? ' mL/s' : ' bar' }}
                    <span class="recipe-editor__phase-duration">{{ (phases[def.key]?.seconds || 0) }}s</span>
                  </span>
                </template>
                <span class="recipe-editor__phase-chevron">
                  {{ expandedPhase === def.key && phases[def.key]?.enabled ? '\u25B2' : '\u25BC' }}
                </span>
              </div>

              <!-- Phase body (expanded) -->
              <div
                v-if="expandedPhase === def.key && phases[def.key]?.enabled"
                class="recipe-editor__phase-body"
              >
                <!-- Description -->
                <p class="recipe-editor__phase-desc">{{ def.description }}</p>

                <!-- Pump mode -->
                <div class="recipe-editor__field-group">
                  <span class="recipe-editor__field-label">Pump Mode</span>
                  <div class="recipe-editor__radio-row">
                    <label class="recipe-editor__radio" :class="{ 'recipe-editor__radio--active': phases[def.key]?.pump === 'pressure' }">
                      <input type="radio" :checked="phases[def.key]?.pump === 'pressure'" @change="updatePhaseField(def.key, 'pump', 'pressure')" />
                      Pressure
                    </label>
                    <label class="recipe-editor__radio" :class="{ 'recipe-editor__radio--active': phases[def.key]?.pump === 'flow' }">
                      <input type="radio" :checked="phases[def.key]?.pump === 'flow'" @change="updatePhaseField(def.key, 'pump', 'flow')" />
                      Flow
                    </label>
                  </div>
                </div>

                <!-- Target setpoint -->
                <div class="recipe-editor__field-row">
                  <span class="recipe-editor__field-label">{{ phases[def.key]?.pump === 'flow' ? 'Flow' : 'Pressure' }}</span>
                  <ValueInput
                    :model-value="phases[def.key]?.target || 0"
                    @update:model-value="v => updatePhaseField(def.key, 'target', v)"
                    :min="0"
                    :max="phases[def.key]?.pump === 'flow' ? 8 : 12"
                    :step="0.1"
                    :decimals="1"
                    :suffix="phases[def.key]?.pump === 'flow' ? ' mL/s' : ' bar'"
                    :aria-label="def.label + ' target'"
                  />
                </div>

                <!-- Duration -->
                <div class="recipe-editor__field-row">
                  <span class="recipe-editor__field-label">Duration</span>
                  <ValueInput
                    :model-value="phases[def.key]?.seconds || 0"
                    @update:model-value="v => updatePhaseField(def.key, 'seconds', v)"
                    :min="0"
                    :max="120"
                    :step="1"
                    :decimals="0"
                    suffix="s"
                    :aria-label="def.label + ' duration'"
                  />
                </div>

                <!-- Temperature (per-phase override) -->
                <div class="recipe-editor__field-row">
                  <span class="recipe-editor__field-label">Temp</span>
                  <ValueInput
                    :model-value="phases[def.key]?.temperature || 93"
                    @update:model-value="v => updatePhaseField(def.key, 'temperature', v)"
                    :min="70"
                    :max="100"
                    :step="0.5"
                    :decimals="1"
                    suffix="&deg;C"
                    :aria-label="def.label + ' temperature'"
                  />
                </div>

                <!-- Transition -->
                <div class="recipe-editor__field-group">
                  <span class="recipe-editor__field-label">Transition</span>
                  <div class="recipe-editor__radio-row">
                    <label class="recipe-editor__radio" :class="{ 'recipe-editor__radio--active': phases[def.key]?.transition === 'fast' }">
                      <input type="radio" :checked="phases[def.key]?.transition === 'fast'" @change="updatePhaseField(def.key, 'transition', 'fast')" />
                      Fast
                    </label>
                    <label class="recipe-editor__radio" :class="{ 'recipe-editor__radio--active': phases[def.key]?.transition === 'smooth' }">
                      <input type="radio" :checked="phases[def.key]?.transition === 'smooth'" @change="updatePhaseField(def.key, 'transition', 'smooth')" />
                      Smooth
                    </label>
                  </div>
                </div>

                <!-- Exit condition -->
                <div class="recipe-editor__field-group recipe-editor__section">
                  <span class="recipe-editor__field-label">Exit Condition</span>
                  <label class="recipe-editor__checkbox">
                    <input
                      type="checkbox"
                      :checked="phases[def.key]?.exitEnabled"
                      @change="updatePhaseField(def.key, 'exitEnabled', $event.target.checked)"
                    />
                    Enable early exit
                  </label>

                  <template v-if="phases[def.key]?.exitEnabled">
                    <select
                      class="recipe-editor__select"
                      :value="phases[def.key]?.exitType || 'pressure_over'"
                      @change="updatePhaseField(def.key, 'exitType', $event.target.value)"
                    >
                      <option v-for="et in EXIT_TYPES" :key="et.value" :value="et.value">{{ et.label }}</option>
                    </select>

                    <ValueInput
                      :model-value="phases[def.key]?.exitValue || 0"
                      @update:model-value="v => updatePhaseField(def.key, 'exitValue', v)"
                      :min="0"
                      :max="exitMax(phases[def.key]?.exitType)"
                      :step="exitStep(phases[def.key]?.exitType)"
                      :decimals="1"
                      :suffix="exitSuffix(phases[def.key]?.exitType)"
                      :aria-label="def.label + ' exit value'"
                    />
                  </template>
                </div>

                <!-- Limiter -->
                <div class="recipe-editor__field-group recipe-editor__section">
                  <span class="recipe-editor__field-label">
                    {{ phases[def.key]?.pump === 'flow' ? 'Pressure Limit' : 'Flow Limit' }}
                  </span>
                  <div class="recipe-editor__field-row">
                    <span class="recipe-editor__field-label recipe-editor__field-label--small">Limit</span>
                    <ValueInput
                      :model-value="phases[def.key]?.limiterValue || 0"
                      @update:model-value="v => updatePhaseField(def.key, 'limiterValue', v)"
                      :min="0"
                      :max="phases[def.key]?.pump === 'flow' ? 12 : 8"
                      :step="0.1"
                      :decimals="1"
                      :suffix="phases[def.key]?.pump === 'flow' ? ' bar' : ' mL/s'"
                      :aria-label="def.label + ' limiter'"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT: Preview graph -->
          <div class="recipe-editor__preview">
            <div class="recipe-editor__preview-header">
              <span class="recipe-editor__preview-title">Preview</span>
              <span class="recipe-editor__preview-info">
                {{ enabledPhaseCount }} phase{{ enabledPhaseCount !== 1 ? 's' : '' }}
                &middot;
                {{ totalDuration }}s
              </span>
            </div>
            <div class="recipe-editor__preview-graph">
              <ProfileGraph
                :profile="previewProfile"
              />
            </div>

            <!-- Metadata fields -->
            <div class="recipe-editor__meta">
              <div class="recipe-editor__meta-field">
                <label class="recipe-editor__field-label">Author</label>
                <input
                  class="recipe-editor__text-input"
                  type="text"
                  :value="recipeAuthor"
                  @change="recipeAuthor = $event.target.value"
                  placeholder="Author"
                />
              </div>
              <div class="recipe-editor__meta-field">
                <label class="recipe-editor__field-label">Notes</label>
                <textarea
                  class="recipe-editor__textarea"
                  :value="recipeNotes"
                  @change="recipeNotes = $event.target.value"
                  placeholder="Recipe notes"
                  rows="2"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Bottom bar -->
    <BottomBar title="Recipe Editor" @back="goBack">
      <template v-if="!loading">
        <span v-if="isDirty" class="recipe-editor__dirty-badge">Modified</span>
        <span style="opacity: 0.3">|</span>
        <span>{{ enabledPhaseCount }} phases</span>
        <span style="opacity: 0.3">|</span>
        <span :style="{ color: stopAtType === 'volume' ? 'var(--color-flow-goal)' : 'var(--color-weight)' }">
          {{ stopAtType === 'volume' ? targetVolume + 'mL' : targetWeight + 'g' }}
        </span>
        <span style="opacity: 0.3">|</span>
        <span>{{ totalDuration }}s</span>
        <span class="recipe-editor__bar-spacer"></span>
        <button
          class="recipe-editor__bar-btn"
          @click="switchToAdvanced"
        >Advanced</button>
        <button
          class="recipe-editor__bar-btn"
          @click="uploadToMachine"
          :disabled="saving || enabledPhaseCount === 0"
        >Upload</button>
        <button
          class="recipe-editor__bar-btn recipe-editor__bar-btn--save"
          @click="saveProfile"
          :disabled="saving || enabledPhaseCount === 0"
        >Save</button>
      </template>
    </BottomBar>
  </div>
</template>

<style scoped>
/* ======================================================================
   Layout
   ====================================================================== */

.recipe-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.recipe-editor__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: var(--margin-standard, 12px);
  gap: 8px;
}

.recipe-editor__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-secondary);
}

/* ======================================================================
   Top section: name + presets + globals
   ====================================================================== */

.recipe-editor__top {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recipe-editor__name-row {
  display: flex;
}

.recipe-editor__name-input {
  flex: 1;
  padding: 10px 14px;
  border-radius: var(--radius-card, 8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: var(--color-surface, #252538);
  color: var(--color-text, #fff);
  font-size: var(--font-title, 16px);
  font-weight: 600;
  font-family: inherit;
}

.recipe-editor__name-input:focus {
  outline: none;
  border-color: var(--color-primary, #4e85f4);
}

.recipe-editor__preset-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.recipe-editor__preset-label {
  font-size: var(--font-caption, 11px);
  color: var(--color-text-secondary, #a0a8b8);
  text-transform: uppercase;
  font-weight: 600;
  flex-shrink: 0;
}

.recipe-editor__preset-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.recipe-editor__preset-pill {
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
  background: transparent;
  color: var(--color-text, #fff);
  font-size: var(--font-caption, 11px);
  cursor: pointer;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}

.recipe-editor__preset-pill:active {
  filter: brightness(0.8);
}

.recipe-editor__preset-pill--active {
  background: var(--color-primary, #4e85f4);
  border-color: var(--color-primary, #4e85f4);
  color: var(--color-text);
}

.recipe-editor__globals {
  display: flex;
  align-items: center;
  gap: 12px;
}

.recipe-editor__global-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.recipe-editor__global-field--toggle {
  flex: 0 0 auto;
}

.recipe-editor__stop-toggle {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text, #fff);
  font-size: var(--font-caption, 11px);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.recipe-editor__stop-toggle:active {
  filter: brightness(0.8);
}

/* ======================================================================
   Main two-column layout
   ====================================================================== */

.recipe-editor__main {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

/* ======================================================================
   Phase cards (left column)
   ====================================================================== */

.recipe-editor__phases {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  min-height: 0;
}

.recipe-editor__phase {
  background: var(--color-surface, #252538);
  border-radius: var(--radius-card, 8px);
  overflow: hidden;
  flex-shrink: 0;
}

.recipe-editor__phase--disabled {
  color: var(--button-disabled-text);
  pointer-events: none;
}

.recipe-editor__phase-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.recipe-editor__phase-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.recipe-editor__phase-toggle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
}

.recipe-editor__phase-toggle input[type="checkbox"] {
  accent-color: var(--color-primary, #4e85f4);
  width: 16px;
  height: 16px;
}

.recipe-editor__phase-label {
  font-size: var(--font-body, 14px);
  font-weight: 600;
  color: var(--color-text, #fff);
  min-width: 60px;
}

.recipe-editor__phase-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-caption, 11px);
  color: var(--color-text-secondary, #a0a8b8);
  flex: 1;
  min-width: 0;
}

.recipe-editor__phase-pump-badge {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: var(--font-xs);
  font-weight: bold;
  color: var(--color-text);
  flex-shrink: 0;
}

.recipe-editor__phase-pump-badge--pressure {
  background: var(--color-pressure);
}

.recipe-editor__phase-pump-badge--flow {
  background: var(--color-flow);
}

.recipe-editor__phase-duration {
  color: var(--color-text-secondary, #a0a8b8);
}

.recipe-editor__phase-chevron {
  font-size: var(--font-xs);
  color: var(--color-text-secondary, #a0a8b8);
  flex-shrink: 0;
}

.recipe-editor__phase-body {
  padding: 0 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.recipe-editor__phase-desc {
  margin: 10px 0 0;
  font-size: var(--font-caption, 11px);
  color: var(--color-text-secondary, #a0a8b8);
  line-height: 1.4;
}

/* ======================================================================
   Field layout (shared with phase body)
   ====================================================================== */

.recipe-editor__field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.recipe-editor__field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.recipe-editor__field-row > .recipe-editor__field-label {
  width: 72px;
  flex-shrink: 0;
}

.recipe-editor__field-row > .value-input {
  flex: 1;
}

.recipe-editor__field-label {
  font-size: var(--font-caption, 11px);
  color: var(--color-text-secondary, #a0a8b8);
  text-transform: uppercase;
  font-weight: 600;
}

.recipe-editor__field-label--small {
  font-size: var(--font-xs);
  width: 48px;
  flex-shrink: 0;
}

.recipe-editor__section {
  padding: 10px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
}

/* Radio buttons */
.recipe-editor__radio-row {
  display: flex;
  gap: 16px;
}

.recipe-editor__radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-body, 14px);
  color: var(--color-text, #fff);
  cursor: pointer;
}

.recipe-editor__radio--active {
  color: var(--color-primary, #4e85f4);
}

.recipe-editor__radio input[type="radio"] {
  accent-color: var(--color-primary, #4e85f4);
}

/* Checkbox */
.recipe-editor__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-body, 14px);
  color: var(--color-text, #fff);
  cursor: pointer;
}

.recipe-editor__checkbox input[type="checkbox"] {
  accent-color: var(--color-primary, #4e85f4);
}

/* Select */
.recipe-editor__select {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: var(--color-background, #1a1a2e);
  color: var(--color-text, #fff);
  font-size: var(--font-body, 14px);
  font-family: inherit;
  cursor: pointer;
  appearance: auto;
}

.recipe-editor__select:focus {
  outline: none;
  border-color: var(--color-primary, #4e85f4);
}

.recipe-editor__select option {
  background: var(--color-surface, #252538);
  color: var(--color-text, #fff);
}

/* ======================================================================
   Preview (right column)
   ====================================================================== */

.recipe-editor__preview {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #252538);
  border-radius: var(--radius-card, 8px);
  min-height: 0;
  overflow: hidden;
}

.recipe-editor__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.recipe-editor__preview-title {
  font-size: var(--font-body, 14px);
  font-weight: 600;
  color: var(--color-text, #fff);
}

.recipe-editor__preview-info {
  font-size: var(--font-caption, 11px);
  color: var(--color-text-secondary, #a0a8b8);
}

.recipe-editor__preview-graph {
  flex: 1;
  min-height: 140px;
}

.recipe-editor__meta {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.recipe-editor__meta-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Text inputs */
.recipe-editor__text-input,
.recipe-editor__textarea {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: var(--color-background, #1a1a2e);
  color: var(--color-text, #fff);
  font-size: var(--font-body, 14px);
  font-family: inherit;
}

.recipe-editor__text-input:focus,
.recipe-editor__textarea:focus {
  outline: none;
  border-color: var(--color-primary, #4e85f4);
}

.recipe-editor__textarea {
  resize: vertical;
  min-height: 40px;
}

/* ======================================================================
   Bottom bar additions
   ====================================================================== */

.recipe-editor__dirty-badge {
  color: #ffcc00;
  font-weight: 600;
}

.recipe-editor__bar-spacer {
  flex: 1;
}

.recipe-editor__bar-btn {
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

.recipe-editor__bar-btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  border-color: transparent;
  cursor: default;
}

.recipe-editor__bar-btn:active:not(:disabled) {
  filter: brightness(0.8);
}

.recipe-editor__bar-btn--save {
  background: #fff;
  color: var(--color-primary, #4e85f4);
  border-color: var(--color-text);
}

/* ======================================================================
   Responsive: on narrow screens stack vertically
   ====================================================================== */

@media (max-width: 720px) {
  .recipe-editor__main {
    flex-direction: column;
  }

  .recipe-editor__preview {
    width: 100%;
    max-height: 280px;
  }

  .recipe-editor__preview-graph {
    min-height: 120px;
  }

  .recipe-editor__globals {
    flex-wrap: wrap;
  }
}
</style>
