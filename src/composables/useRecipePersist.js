/**
 * Owns recipe-editor persistence: saveToSelectedCombo (overwrites the
 * selected combo with current form state) and saveAsNew (creates a new
 * combo, selects it, fires a toast, returns the new index for the caller
 * to open the rename popup).
 *
 * @param {object} form    The useRecipeForm return object
 * @param {object} ctx     Injected context: { settings, toast, t, comboValues,
 *                         linkedBean, selectedIndex, workflowCombos }
 */
export function useRecipePersist(form, ctx) {
  const {
    settings, toast, t,
    comboValues, linkedBean,
    selectedIndex, workflowCombos,
  } = ctx

  // ---- Persist current form state to the selected combo ----
  // Toast is fired by the caller so it can include the recipe name in the
  // user-visible message without this function re-reading the combo list.
  function saveToSelectedCombo() {
    if (!settings || selectedIndex.value < 0) return
    const combos = [...workflowCombos.value]
    const existing = combos[selectedIndex.value]
    combos[selectedIndex.value] = { ...existing, ...comboValues() }
    settings.settings.workflowCombos = combos
  }

  // ---- Save as new recipe ----
  // Creates a combo from the current form state, selects it, and returns
  // the new index so the caller can open the rename popup on it. Fires a
  // "Created …" toast with the auto-generated name. Returns -1 on failure.
  function saveAsNew() {
    if (!settings) return -1
    // Prefer the linked bean's name (coffeeName is blank while linked) so a
    // recipe created from a bean record still gets a meaningful default name.
    const autoName = linkedBean.value?.name
      || form.coffeeName.value
      || form.profileTitle.value
      || t('recipe.newRecipeName')
    const vals = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: autoName,
      emoji: '',
      ...comboValues(),
    }
    const combos = [...workflowCombos.value, vals]
    settings.settings.workflowCombos = combos
    const newIndex = combos.length - 1
    settings.settings.selectedWorkflowCombo = newIndex
    toast?.success(t('recipe.toastCreated', { name: autoName }))
    return newIndex
  }

  return {
    saveToSelectedCombo,
    saveAsNew,
  }
}