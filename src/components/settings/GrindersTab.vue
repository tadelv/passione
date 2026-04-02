<script setup>
import { ref, inject, computed } from 'vue'
import ValueInput from '../ValueInput.vue'

const grinders = inject('grinders', ref([]))
const grindersApi = inject('grindersApi', null)
const toast = inject('toast', null)

const showArchived = ref(false)
const expandedId = ref(null)
const creating = ref(false)

const BURR_TYPES = ['conical', 'flat', 'hybrid']
const SETTING_TYPES = ['numeric', 'preset']

function emptyGrinder() {
  return {
    model: '',
    burrs: '',
    burrSize: null,
    burrType: 'flat',
    settingType: 'numeric',
    settingSmallStep: 0.1,
    settingBigStep: 0.5,
    settingValues: [],
  }
}

const newGrinder = ref(emptyGrinder())
const newPresetValue = ref('')

const filteredGrinders = computed(() => {
  return grinders.value.filter(g => showArchived.value || !g.archived)
})

// Edit form works on a clone so unsaved changes don't bleed into the shared list
const editGrinder = ref(emptyGrinder())

function toggleExpand(id) {
  if (expandedId.value === id) {
    expandedId.value = null
  } else {
    expandedId.value = id
    const g = grinders.value.find(g => g.id === id)
    if (g) editGrinder.value = JSON.parse(JSON.stringify(g))
  }
}

// ---- Create ----

function openCreate() {
  creating.value = true
  newGrinder.value = emptyGrinder()
  newPresetValue.value = ''
}

function cancelCreate() {
  creating.value = false
}

function addNewPresetValue() {
  const v = newPresetValue.value.trim()
  if (!v) return
  if (!newGrinder.value.settingValues.includes(v)) {
    newGrinder.value.settingValues.push(v)
  }
  newPresetValue.value = ''
}

function removeNewPresetValue(index) {
  newGrinder.value.settingValues.splice(index, 1)
}

async function submitCreate() {
  if (!newGrinder.value.model.trim()) return
  try {
    await grindersApi?.create(newGrinder.value)
    creating.value = false
    toast?.success('Grinder created')
  } catch {
    toast?.error('Failed to create grinder')
  }
}

// ---- Edit ----

const editPresetValue = ref('')

function addEditPresetValue() {
  const v = editPresetValue.value.trim()
  if (!v) return
  if (!editGrinder.value.settingValues) editGrinder.value.settingValues = []
  if (!editGrinder.value.settingValues.includes(v)) {
    editGrinder.value.settingValues.push(v)
  }
  editPresetValue.value = ''
}

function removeEditPresetValue(index) {
  editGrinder.value.settingValues.splice(index, 1)
}

async function saveGrinder(grinder) {
  try {
    await grindersApi?.update(grinder.id, editGrinder.value)
    // Apply saved values back to the shared list
    Object.assign(grinder, editGrinder.value)
    toast?.success('Grinder saved')
  } catch {
    toast?.error('Failed to save grinder')
  }
}

// ---- Delete ----

async function deleteGrinder(grinder) {
  if (!window.confirm(`Delete "${grinder.model}"? This cannot be undone.`)) return
  try {
    await grindersApi?.remove(grinder.id)
    if (expandedId.value === grinder.id) expandedId.value = null
    toast?.success('Grinder deleted')
  } catch {
    toast?.error('Failed to delete grinder')
  }
}

// ---- Archive ----

async function toggleArchive(grinder) {
  try {
    await grindersApi?.update(grinder.id, { ...grinder, archived: !grinder.archived })
    toast?.success(grinder.archived ? 'Grinder unarchived' : 'Grinder archived')
  } catch {
    toast?.error('Failed to update grinder')
  }
}
</script>

<template>
  <div class="grinders-tab">
    <!-- Header -->
    <div class="grinders-tab__header">
      <h3 class="grinders-tab__title">Grinders</h3>
      <div class="grinders-tab__header-actions">
        <label class="grinders-tab__archive-toggle">
          <input
            type="checkbox"
            v-model="showArchived"
          />
          Show archived
        </label>
        <button class="grinders-tab__add-btn" @click="openCreate">
          Add Grinder
        </button>
      </div>
    </div>

    <!-- Create form -->
    <div v-if="creating" class="grinders-tab__form">
      <h4 class="grinders-tab__form-title">New Grinder</h4>

      <div class="grinders-tab__field">
        <label class="grinders-tab__label">Model *</label>
        <input
          v-model="newGrinder.model"
          class="grinders-tab__input"
          placeholder="e.g. Niche Zero"
        />
      </div>

      <div class="grinders-tab__field">
        <label class="grinders-tab__label">Burrs</label>
        <input
          v-model="newGrinder.burrs"
          class="grinders-tab__input"
          placeholder="e.g. 63mm Mazzer"
        />
      </div>

      <div class="grinders-tab__row">
        <div class="grinders-tab__field">
          <label class="grinders-tab__label">Burr size (mm)</label>
          <input
            v-model.number="newGrinder.burrSize"
            type="number"
            class="grinders-tab__input grinders-tab__input--short"
            placeholder="63"
          />
        </div>

        <div class="grinders-tab__field">
          <label class="grinders-tab__label">Burr type</label>
          <select v-model="newGrinder.burrType" class="grinders-tab__select">
            <option v-for="t in BURR_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
      </div>

      <div class="grinders-tab__field">
        <label class="grinders-tab__label">Setting type</label>
        <select v-model="newGrinder.settingType" class="grinders-tab__select">
          <option v-for="t in SETTING_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>

      <!-- Numeric step fields -->
      <div v-if="newGrinder.settingType === 'numeric'" class="grinders-tab__row">
        <div class="grinders-tab__field">
          <label class="grinders-tab__label">Small step</label>
          <ValueInput
            :model-value="newGrinder.settingSmallStep"
            @update:model-value="v => newGrinder.settingSmallStep = v"
            :min="0.01"
            :max="10"
            :step="0.1"
            :decimals="2"
            aria-label="Small step"
          />
        </div>
        <div class="grinders-tab__field">
          <label class="grinders-tab__label">Big step</label>
          <ValueInput
            :model-value="newGrinder.settingBigStep"
            @update:model-value="v => newGrinder.settingBigStep = v"
            :min="0.1"
            :max="50"
            :step="0.5"
            :decimals="1"
            aria-label="Big step"
          />
        </div>
      </div>

      <!-- Preset values -->
      <div v-if="newGrinder.settingType === 'preset'" class="grinders-tab__field">
        <label class="grinders-tab__label">Preset values</label>
        <div class="grinders-tab__preset-input">
          <input
            v-model="newPresetValue"
            class="grinders-tab__input"
            placeholder="Add a value..."
            @keydown.enter.prevent="addNewPresetValue"
          />
          <button class="grinders-tab__preset-add-btn" @click="addNewPresetValue">Add</button>
        </div>
        <div v-if="newGrinder.settingValues.length" class="grinders-tab__pills">
          <span
            v-for="(val, i) in newGrinder.settingValues"
            :key="i"
            class="grinders-tab__pill"
          >
            {{ val }}
            <button class="grinders-tab__pill-remove" @click="removeNewPresetValue(i)">&times;</button>
          </span>
        </div>
      </div>

      <div class="grinders-tab__form-actions">
        <button class="grinders-tab__btn grinders-tab__btn--secondary" @click="cancelCreate">Cancel</button>
        <button
          class="grinders-tab__btn grinders-tab__btn--primary"
          :disabled="!newGrinder.model.trim()"
          @click="submitCreate"
        >
          Create
        </button>
      </div>
    </div>

    <!-- Grinder list -->
    <div v-if="filteredGrinders.length === 0" class="grinders-tab__empty">
      {{ showArchived ? 'No archived grinders.' : 'No grinders yet. Add one to get started.' }}
    </div>

    <div v-else class="grinders-tab__list">
      <div
        v-for="grinder in filteredGrinders"
        :key="grinder.id"
        class="grinders-tab__item"
      >
        <!-- Row summary -->
        <div class="grinders-tab__item-row" @click="toggleExpand(grinder.id)">
          <div class="grinders-tab__item-info">
            <span class="grinders-tab__item-model">{{ grinder.model }}</span>
            <span v-if="grinder.burrs" class="grinders-tab__item-burrs">{{ grinder.burrs }}</span>
          </div>
          <span class="grinders-tab__item-chevron">{{ expandedId === grinder.id ? '\u25B2' : '\u25BC' }}</span>
        </div>

        <!-- Expanded edit form -->
        <div v-if="expandedId === grinder.id" class="grinders-tab__edit">
          <div class="grinders-tab__field">
            <label class="grinders-tab__label">Model *</label>
            <input v-model="editGrinder.model" class="grinders-tab__input" />
          </div>

          <div class="grinders-tab__field">
            <label class="grinders-tab__label">Burrs</label>
            <input v-model="editGrinder.burrs" class="grinders-tab__input" />
          </div>

          <div class="grinders-tab__row">
            <div class="grinders-tab__field">
              <label class="grinders-tab__label">Burr size (mm)</label>
              <input
                v-model.number="editGrinder.burrSize"
                type="number"
                class="grinders-tab__input grinders-tab__input--short"
              />
            </div>

            <div class="grinders-tab__field">
              <label class="grinders-tab__label">Burr type</label>
              <select v-model="editGrinder.burrType" class="grinders-tab__select">
                <option v-for="t in BURR_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>

          <div class="grinders-tab__field">
            <label class="grinders-tab__label">Setting type</label>
            <select v-model="editGrinder.settingType" class="grinders-tab__select">
              <option v-for="t in SETTING_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>

          <!-- Numeric step fields -->
          <div v-if="editGrinder.settingType === 'numeric'" class="grinders-tab__row">
            <div class="grinders-tab__field">
              <label class="grinders-tab__label">Small step</label>
              <ValueInput
                :model-value="editGrinder.settingSmallStep ?? 0.1"
                @update:model-value="v => editGrinder.settingSmallStep = v"
                :min="0.01"
                :max="10"
                :step="0.1"
                :decimals="2"
                aria-label="Small step"
              />
            </div>
            <div class="grinders-tab__field">
              <label class="grinders-tab__label">Big step</label>
              <ValueInput
                :model-value="editGrinder.settingBigStep ?? 0.5"
                @update:model-value="v => editGrinder.settingBigStep = v"
                :min="0.1"
                :max="50"
                :step="0.5"
                :decimals="1"
                aria-label="Big step"
              />
            </div>
          </div>

          <!-- Preset values -->
          <div v-if="editGrinder.settingType === 'preset'" class="grinders-tab__field">
            <label class="grinders-tab__label">Preset values</label>
            <div class="grinders-tab__preset-input">
              <input
                v-model="editPresetValue"
                class="grinders-tab__input"
                placeholder="Add a value..."
                @keydown.enter.prevent="addEditPresetValue()"
              />
              <button class="grinders-tab__preset-add-btn" @click="addEditPresetValue()">Add</button>
            </div>
            <div v-if="editGrinder.settingValues?.length" class="grinders-tab__pills">
              <span
                v-for="(val, i) in editGrinder.settingValues"
                :key="i"
                class="grinders-tab__pill"
              >
                {{ val }}
                <button class="grinders-tab__pill-remove" @click="removeEditPresetValue(i)">&times;</button>
              </span>
            </div>
          </div>

          <div class="grinders-tab__edit-actions">
            <button class="grinders-tab__btn grinders-tab__btn--danger" @click="deleteGrinder(grinder)">
              Delete
            </button>
            <button class="grinders-tab__btn grinders-tab__btn--secondary" @click="toggleArchive(grinder)">
              {{ grinder.archived ? 'Unarchive' : 'Archive' }}
            </button>
            <button
              class="grinders-tab__btn grinders-tab__btn--primary"
              :disabled="!grinder.model?.trim()"
              @click="saveGrinder(grinder)"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grinders-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.grinders-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.grinders-tab__title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
}

.grinders-tab__header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.grinders-tab__archive-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.grinders-tab__add-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.grinders-tab__add-btn:active {
  opacity: 0.8;
}

.grinders-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

/* List */

.grinders-tab__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grinders-tab__item {
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.grinders-tab__item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.grinders-tab__item-row:active {
  background: rgba(255, 255, 255, 0.03);
}

.grinders-tab__item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.grinders-tab__item-model {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
}

.grinders-tab__item-burrs {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.grinders-tab__item-chevron {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

/* Form (shared by create & edit) */

.grinders-tab__form,
.grinders-tab__edit {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
}

.grinders-tab__edit {
  border: none;
  border-top: 1px solid var(--color-border);
  border-radius: 0;
}

.grinders-tab__form-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
}

.grinders-tab__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.grinders-tab__label {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

.grinders-tab__input {
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-md);
}

.grinders-tab__input--short {
  max-width: 120px;
}

.grinders-tab__select {
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-md);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.grinders-tab__row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.grinders-tab__row > .grinders-tab__field {
  flex: 1;
  min-width: 120px;
}

/* Preset values */

.grinders-tab__preset-input {
  display: flex;
  gap: 8px;
}

.grinders-tab__preset-input .grinders-tab__input {
  flex: 1;
}

.grinders-tab__preset-add-btn {
  padding: 0 16px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.grinders-tab__preset-add-btn:active {
  opacity: 0.7;
}

.grinders-tab__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.grinders-tab__pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 16px;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 500;
}

.grinders-tab__pill-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: rgba(255, 255, 255, 0.25);
  color: var(--color-text);
  border-radius: 50%;
  font-size: var(--font-md);
  line-height: 1;
  cursor: pointer;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

.grinders-tab__pill-remove:active {
  background: rgba(255, 255, 255, 0.4);
}

/* Action buttons */

.grinders-tab__form-actions,
.grinders-tab__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}

.grinders-tab__btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.grinders-tab__btn:disabled {
  background-color: var(--button-disabled);
  color: var(--button-disabled-text);
  cursor: default;
}

.grinders-tab__btn--primary {
  background: var(--color-primary);
  color: var(--color-text);
}

.grinders-tab__btn--primary:active:not(:disabled) {
  opacity: 0.8;
}

.grinders-tab__btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.grinders-tab__btn--secondary:active {
  opacity: 0.7;
}

.grinders-tab__btn--danger {
  background: var(--color-error);
  color: var(--color-text);
}

.grinders-tab__btn--danger:active {
  opacity: 0.8;
}

.grinders-tab__edit-actions .grinders-tab__btn--danger {
  margin-right: auto;
}
</style>
