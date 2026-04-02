<script setup>
import { ref, inject, computed } from 'vue'

const theme = inject('theme', null)
const settings = inject('settings', null)

const presetNames = computed(() => theme?.getPresetNames?.() ?? [])

const selectedColorToken = ref('')

// Color categories for the left panel
const COLOR_CATEGORIES = [
  {
    title: 'Core UI',
    tokens: [
      { key: 'background', label: 'Background' },
      { key: 'surface', label: 'Surface' },
      { key: 'primary', label: 'Primary' },
      { key: 'accent', label: 'Accent' },
      { key: 'text', label: 'Text' },
      { key: 'textSecondary', label: 'Text Secondary' },
      { key: 'border', label: 'Border' },
    ],
  },
  {
    title: 'Status',
    tokens: [
      { key: 'success', label: 'Success' },
      { key: 'warning', label: 'Warning' },
      { key: 'error', label: 'Error' },
    ],
  },
]

const currentColors = computed(() => theme?.colors?.value ?? {})

const selectedColor = computed(() => {
  if (!selectedColorToken.value) return ''
  return currentColors.value[selectedColorToken.value] || ''
})

const hexInput = ref('')

function selectColor(token) {
  selectedColorToken.value = token
  hexInput.value = currentColors.value[token] || ''
}

function onHexChange(e) {
  const val = e.target.value.trim()
  hexInput.value = val
  if (/^#[0-9a-fA-F]{6}$/.test(val) && theme) {
    theme.setColor(selectedColorToken.value, val)
  }
}

function onColorPickerChange(e) {
  const val = e.target.value
  hexInput.value = val
  if (theme) {
    theme.setColor(selectedColorToken.value, val)
  }
}

function applyPreset(name) {
  if (theme) {
    theme.setPreset(name)
    // If a token is selected, update hex input to new color
    if (selectedColorToken.value) {
      hexInput.value = theme.colors.value[selectedColorToken.value] || ''
    }
  }
}

function randomize() {
  if (theme) {
    theme.generateRandomPalette()
    if (selectedColorToken.value) {
      hexInput.value = theme.colors.value[selectedColorToken.value] || ''
    }
  }
}

function resetTheme() {
  if (theme) {
    theme.resetToDefault()
    if (selectedColorToken.value) {
      hexInput.value = theme.colors.value[selectedColorToken.value] || ''
    }
  }
}
</script>

<template>
  <div class="themes-tab" v-if="theme">
    <!-- Preset row -->
    <div class="themes-tab__presets">
      <button
        v-for="name in presetNames"
        :key="name"
        class="themes-tab__preset-btn"
        :class="{ 'themes-tab__preset-btn--active': settings?.settings?.activeThemeName === name }"
        :style="{ background: name === 'default' ? '#4e85f4' : undefined }"
        @click="applyPreset(name)"
      >
        {{ name }}
      </button>
      <button class="themes-tab__random-btn" @click="randomize">
        Random
      </button>
      <button class="themes-tab__reset-btn" @click="resetTheme">
        Reset
      </button>
    </div>

    <div class="themes-tab__main">
      <!-- Left: color swatch list -->
      <div class="themes-tab__color-list">
        <div
          v-for="category in COLOR_CATEGORIES"
          :key="category.title"
          class="themes-tab__category"
        >
          <span class="themes-tab__category-title">{{ category.title }}</span>
          <button
            v-for="token in category.tokens"
            :key="token.key"
            class="themes-tab__swatch-row"
            :class="{ 'themes-tab__swatch-row--selected': selectedColorToken === token.key }"
            @click="selectColor(token.key)"
          >
            <span
              class="themes-tab__swatch"
              :style="{ background: currentColors[token.key] || '#000' }"
            />
            <span class="themes-tab__swatch-label">{{ token.label }}</span>
          </button>
        </div>
      </div>

      <!-- Right: color editor -->
      <div class="themes-tab__editor" v-if="selectedColorToken">
        <h4 class="themes-tab__editor-title">
          {{ COLOR_CATEGORIES.flatMap(c => c.tokens).find(t => t.key === selectedColorToken)?.label }}
        </h4>

        <div class="themes-tab__editor-preview">
          <span
            class="themes-tab__preview-swatch"
            :style="{ background: selectedColor }"
          />
        </div>

        <div class="themes-tab__editor-hex">
          <label class="themes-tab__hex-label">Hex</label>
          <input
            class="themes-tab__hex-input"
            type="text"
            :value="hexInput"
            maxlength="7"
            placeholder="#RRGGBB"
            @change="onHexChange"
          />
        </div>

        <input
          type="color"
          class="themes-tab__color-picker"
          :value="selectedColor"
          @input="onColorPickerChange"
        />
      </div>

      <div v-else class="themes-tab__editor-placeholder">
        Select a color to edit
      </div>
    </div>
  </div>
  <div v-else class="themes-tab__empty">Theme not available.</div>
</template>

<style scoped>
.themes-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.themes-tab__presets {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.themes-tab__preset-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  text-transform: capitalize;
  -webkit-tap-highlight-color: transparent;
}

.themes-tab__preset-btn:active {
  transform: scale(0.96);
}

.themes-tab__preset-btn--active {
  border-color: var(--color-text);
}

.themes-tab__random-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #f44336, #ff9800, #ffeb3b, #4caf50, #2196f3, #9c27b0);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.themes-tab__reset-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-error);
  background: transparent;
  color: var(--color-error);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.themes-tab__main {
  display: flex;
  gap: 24px;
  min-height: 300px;
}

.themes-tab__color-list {
  flex: 0 0 40%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.themes-tab__category {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.themes-tab__category-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 0;
}

.themes-tab__swatch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  font-size: var(--font-md);
  -webkit-tap-highlight-color: transparent;
}

.themes-tab__swatch-row:hover {
  background: var(--color-surface);
}

.themes-tab__swatch-row--selected {
  background: var(--color-surface);
  border-color: var(--color-primary);
}

.themes-tab__swatch {
  display: inline-block;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}

.themes-tab__swatch-label {
  white-space: nowrap;
}

.themes-tab__editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.themes-tab__editor-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
}

.themes-tab__editor-preview {
  display: flex;
  align-items: center;
  gap: 12px;
}

.themes-tab__preview-swatch {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.themes-tab__editor-hex {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.themes-tab__hex-label {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.themes-tab__hex-input {
  width: 120px;
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-family: monospace;
  font-size: var(--font-body);
}

.themes-tab__color-picker {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  background: transparent;
}

.themes-tab__editor-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.themes-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
}
</style>
