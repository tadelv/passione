<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  /** Array of recipe objects: [{ name, emoji, ... }] */
  presets: { type: Array, default: () => [] },
  /** Index of the currently selected recipe (-1 = none) */
  selectedIndex: { type: Number, default: -1 },
  /**
   * When true AND a row is selected, the selected row is marked as
   * "modified" (visual amber dot). Caller computes this (see useComboDirty).
   */
  modified: { type: Boolean, default: false },
  /** Accessible label for the recipe list */
  ariaLabel: { type: String, default: 'Recipes' },
})

const emit = defineEmits(['select', 'edit', 'new'])

// Track last emitted select index to handle the Vue re-render race
// (props.selectedIndex may not have updated yet).
let lastEmittedSelectIndex = -1

const displayPresets = computed(() =>
  props.presets.map((p, i) => ({
    ...p,
    index: i,
    display: (p.emoji ? p.emoji + ' ' : '') + (p.name || `Recipe ${i + 1}`),
  }))
)

function onClick(index, event) {
  // Double-tap → edit (event.detail is the native click count)
  if (event.detail >= 2) {
    emit('edit', index)
    return
  }
  lastEmittedSelectIndex = index
  emit('select', index)
}

function onEditClick(index) {
  emit('edit', index)
}

function onNew() {
  emit('new')
}
</script>

<template>
  <div class="recipe-pill-rail" :aria-label="ariaLabel">
    <div class="recipe-pill-rail__list" role="listbox" :aria-label="ariaLabel">
      <div
        v-for="preset in displayPresets"
        :key="preset.index"
        class="recipe-pill-rail__row"
        :class="{
          'recipe-pill-rail__row--selected': preset.index === selectedIndex,
          'recipe-pill-rail__row--modified': modified && preset.index === selectedIndex,
        }"
      >
        <button
          class="recipe-pill-rail__pill"
          role="option"
          :aria-selected="preset.index === selectedIndex"
          :aria-label="modified && preset.index === selectedIndex
            ? `${preset.display}, ${t('recipe.unsavedChanges')}`
            : undefined"
          @click="onClick(preset.index, $event)"
        >
          {{ preset.display }}
        </button>
        <button
          v-if="preset.index === selectedIndex"
          class="recipe-pill-rail__edit"
          :aria-label="t('recipe.editRecipe')"
          @click="onEditClick(preset.index)"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>
    </div>

    <button class="recipe-pill-rail__new" @click="onNew">
      {{ t('recipe.newRecipe') }}
    </button>
  </div>
</template>

<style scoped>
.recipe-pill-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Fill the parent rail column (RecipeEditorPage sets the fixed width).
     min-height: 0 lets the recipe list own its own scroll so "+ New"
     stays pinned at the bottom. */
  width: 100%;
  min-height: 0;
}

.recipe-pill-rail__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recipe-pill-rail__new {
  flex-shrink: 0;
}

.recipe-pill-rail__row {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 6px;
  border-radius: 10px;
}

.recipe-pill-rail__pill {
  flex: 1;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-body);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 0.15s ease, transform 0.1s ease, border-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  touch-action: manipulation;
}

.recipe-pill-rail__pill:active {
  transform: scale(0.98);
}

.recipe-pill-rail__row--selected .recipe-pill-rail__pill {
  background: var(--color-primary);
  color: var(--color-text);
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);
}

/*
 * Modified indicator — small amber dot in the top-right of the selected
 * row when the caller's dirty state is true. Warm amber matches the
 * "unsaved" semantics used across the app (see PresetPillRow).
 */
.recipe-pill-rail__row--modified::after {
  content: "";
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c89b3c;
  box-shadow: 0 0 0 2px var(--color-primary);
  pointer-events: none;
  z-index: 1;
}

.recipe-pill-rail__edit {
  flex-shrink: 0;
  width: 44px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.1s ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.recipe-pill-rail__edit:active {
  transform: scale(0.96);
}

.recipe-pill-rail__new {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px dashed var(--color-border);
  background: transparent;
  color: var(--color-primary);
  font-family: var(--font-body);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.recipe-pill-rail__new:active {
  opacity: 0.7;
}
</style>
