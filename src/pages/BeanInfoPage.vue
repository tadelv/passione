<script setup>
import { ref, computed, inject, watch } from 'vue'
import PresetPillRow from '../components/PresetPillRow.vue'
import SuggestionField from '../components/SuggestionField.vue'
import ValueInput from '../components/ValueInput.vue'
import BottomBar from '../components/BottomBar.vue'

const settings = inject('settings', null)
const workflow = inject('workflow', null)
const updateWorkflow = inject('updateWorkflow')
const toast = inject('toast', null)

// ---- Bean presets ----
const beanPresets = computed(() => settings?.settings?.beanPresets ?? [])
const selectedIndex = computed(() => settings?.settings?.selectedBeanPreset ?? -1)

// ---- Editable fields ----
const roaster = ref('')
const beanBrand = ref('')
const beanType = ref('')
const roastDate = ref('')
const roastLevel = ref('')
const grinder = ref('')
const grinderSetting = ref('')
const beverageType = ref('espresso')
const doseIn = ref(18.0)
const doseOut = ref(36.0)
const ratioValue = ref(2.0)
let _updating = false

const ROAST_LEVELS = ['Light', 'Medium-Light', 'Medium', 'Medium-Dark', 'Dark']
const BEVERAGE_TYPES = ['espresso', 'filter', 'pourover', 'tea', 'manual']

// ---- Populate from selected preset ----
function loadFromPreset(index) {
  const preset = beanPresets.value[index]
  if (!preset) return
  _updating = true
  roaster.value = preset.roaster ?? ''
  beanBrand.value = preset.beanBrand ?? preset.brand ?? ''
  beanType.value = preset.beanType ?? preset.type ?? ''
  roastDate.value = preset.roastDate ?? ''
  roastLevel.value = preset.roastLevel ?? ''
  grinder.value = preset.grinder ?? ''
  grinderSetting.value = preset.grinderSetting ?? ''
  beverageType.value = preset.beverageType ?? 'espresso'
  doseIn.value = preset.doseIn ?? 18.0
  doseOut.value = preset.doseOut ?? 36.0
  ratioValue.value = doseIn.value > 0 ? +(doseOut.value / doseIn.value).toFixed(1) : 2.0
  _updating = false
}

// Load on mount if a preset is selected
if (selectedIndex.value >= 0) {
  loadFromPreset(selectedIndex.value)
} else {
  // Populate from workflow if available
  const wd = workflow?.doseData
  const wg = workflow?.grinderData
  const wc = workflow?.coffeeData
  if (wd) {
    doseIn.value = wd.doseIn ?? wd.dose ?? 18.0
    doseOut.value = wd.doseOut ?? wd.targetWeight ?? 36.0
    if (doseIn.value > 0) ratioValue.value = +(doseOut.value / doseIn.value).toFixed(1)
  }
  if (wg) {
    grinder.value = wg.grinder ?? wg.name ?? ''
    grinderSetting.value = wg.setting ?? wg.grindSetting ?? ''
  }
  if (wc) {
    roaster.value = wc.roaster ?? ''
    beanBrand.value = wc.beanBrand ?? wc.brand ?? ''
    beanType.value = wc.beanType ?? wc.type ?? ''
    roastDate.value = wc.roastDate ?? ''
    roastLevel.value = wc.roastLevel ?? ''
  }
}

function onPresetSelect(index) {
  if (!settings) return
  settings.settings.selectedBeanPreset = index
  loadFromPreset(index)
}

// ---- Auto-save to selected preset ----
function currentValues() {
  return {
    roaster: roaster.value,
    beanBrand: beanBrand.value,
    beanType: beanType.value,
    roastDate: roastDate.value,
    roastLevel: roastLevel.value,
    grinder: grinder.value,
    grinderSetting: grinderSetting.value,
    beverageType: beverageType.value,
    doseIn: doseIn.value,
    doseOut: doseOut.value,
    name: [beanBrand.value, beanType.value].filter(Boolean).join(' ') || 'Unnamed',
  }
}

let saveTimer = null
function debouncedSaveToPreset() {
  if (!settings || selectedIndex.value < 0) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const presets = [...beanPresets.value]
    presets[selectedIndex.value] = currentValues()
    settings.settings.beanPresets = presets
  }, 500)
}

// Watch all fields for auto-save
watch([roaster, beanBrand, beanType, roastDate, roastLevel, grinder, grinderSetting, beverageType, doseIn, doseOut], debouncedSaveToPreset)

// ---- Add new preset ----
function addPreset() {
  if (!settings) return
  const vals = currentValues()
  const presets = [...beanPresets.value, vals]
  settings.settings.beanPresets = presets
  settings.settings.selectedBeanPreset = presets.length - 1
  toast?.success('Bean preset added')
}

// ---- Save to workflow ----
async function saveToWorkflow() {
  try {
    await updateWorkflow({
      coffeeData: {
        name: [beanBrand.value, beanType.value].filter(Boolean).join(' ') || 'Unnamed',
        roaster: roaster.value || null,
      },
      grinderData: {
        setting: grinderSetting.value,
        manufacturer: null,
        model: grinder.value || null,
      },
      doseData: {
        doseIn: doseIn.value,
        doseOut: doseOut.value,
      },
    })
    toast?.success('Saved to workflow')
  } catch {
    toast?.error('Failed to save to workflow')
  }
}

// ---- Suggestion lists from existing presets ----
const roasterSuggestions = computed(() =>
  [...new Set(beanPresets.value.map(p => p.roaster).filter(Boolean))]
)
const grinderSuggestions = computed(() =>
  [...new Set(beanPresets.value.map(p => p.grinder).filter(Boolean))]
)

// ---- Linked ratio: changing any of doseIn/doseOut/ratio updates the others ----
watch(doseIn, (val) => {
  if (_updating) return
  _updating = true
  if (val > 0 && ratioValue.value > 0) {
    doseOut.value = +(val * ratioValue.value).toFixed(1)
  }
  _updating = false
})

watch(doseOut, (val) => {
  if (_updating) return
  _updating = true
  if (doseIn.value > 0 && val > 0) {
    ratioValue.value = +(val / doseIn.value).toFixed(1)
  }
  _updating = false
})

watch(ratioValue, (val) => {
  if (_updating) return
  _updating = true
  if (doseIn.value > 0 && val > 0) {
    doseOut.value = +(doseIn.value * val).toFixed(1)
  }
  _updating = false
})
</script>

<template>
  <div class="bean-info">
    <!-- Bean presets -->
    <div class="bean-info__presets">
      <PresetPillRow
        :presets="beanPresets"
        :selected-index="selectedIndex"
        @select="onPresetSelect"
      />
      <button class="bean-info__add-btn" @click="addPreset">
        + Add Preset
      </button>
    </div>

    <!-- Field grid -->
    <div class="bean-info__grid">
      <!-- Column 1: Bean info -->
      <div class="bean-info__column">
        <h4 class="bean-info__section-title">Bean</h4>

        <div class="bean-info__field">
          <label class="bean-info__label">Roaster</label>
          <SuggestionField
            v-model="roaster"
            placeholder="Roaster name"
            :suggestions="roasterSuggestions"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Brand</label>
          <input
            class="bean-info__input"
            type="text"
            v-model="beanBrand"
            placeholder="Bean brand"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Type</label>
          <input
            class="bean-info__input"
            type="text"
            v-model="beanType"
            placeholder="Bean type"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Roast Date</label>
          <input
            class="bean-info__input"
            type="text"
            v-model="roastDate"
            placeholder="yyyy-mm-dd"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Roast Level</label>
          <select class="bean-info__select" v-model="roastLevel">
            <option value="">--</option>
            <option v-for="level in ROAST_LEVELS" :key="level" :value="level">
              {{ level }}
            </option>
          </select>
        </div>
      </div>

      <!-- Column 2: Grinder + Beverage -->
      <div class="bean-info__column">
        <h4 class="bean-info__section-title">Grinder</h4>

        <div class="bean-info__field">
          <label class="bean-info__label">Grinder</label>
          <SuggestionField
            v-model="grinder"
            placeholder="Grinder model"
            :suggestions="grinderSuggestions"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Setting</label>
          <input
            class="bean-info__input"
            type="text"
            v-model="grinderSetting"
            placeholder="Grind setting"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Beverage</label>
          <select class="bean-info__select" v-model="beverageType">
            <option v-for="t in BEVERAGE_TYPES" :key="t" :value="t">
              {{ t }}
            </option>
          </select>
        </div>
      </div>

      <!-- Column 3: Dose -->
      <div class="bean-info__column">
        <h4 class="bean-info__section-title">Dose</h4>

        <div class="bean-info__field">
          <label class="bean-info__label">Dose In</label>
          <ValueInput
            v-model="doseIn"
            :min="0"
            :max="40"
            :step="0.1"
            :decimals="1"
            suffix="g"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Dose Out</label>
          <ValueInput
            v-model="doseOut"
            :min="0"
            :max="500"
            :step="0.1"
            :decimals="1"
            suffix="g"
          />
        </div>

        <div class="bean-info__field">
          <label class="bean-info__label">Ratio (1:X)</label>
          <ValueInput
            v-model="ratioValue"
            :min="0.5"
            :max="10"
            :step="0.1"
            :decimals="1"
          />
        </div>
      </div>
    </div>

    <BottomBar title="Bean Info">
      <button class="bean-info__save-btn" @click="saveToWorkflow">
        Save to Workflow
      </button>
    </BottomBar>
  </div>
</template>

<style scoped>
.bean-info {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.bean-info__presets {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  flex-shrink: 0;
}

.bean-info__add-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__add-btn:active {
  opacity: 0.7;
}

.bean-info__grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
  padding: 16px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  align-content: start;
}

.bean-info__column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bean-info__section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border);
}

.bean-info__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bean-info__label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.bean-info__input {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 15px;
  outline: none;
}

.bean-info__input::placeholder {
  color: var(--color-text-secondary);
}

.bean-info__input:focus {
  border-color: var(--color-primary);
}

.bean-info__select {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 15px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.bean-info__save-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-success);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bean-info__save-btn:active {
  opacity: 0.8;
}

@media (max-width: 600px) {
  .bean-info__grid {
    grid-template-columns: 1fr;
  }
}
</style>
