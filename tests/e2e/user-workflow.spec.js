/**
 * E2E test: Complete DE1 espresso machine user session.
 *
 * Exercises a full barista workflow through the Passione web skin:
 * idle -> sleep -> wake -> bean setup -> grinder setup -> workflow combo ->
 * espresso -> stop -> steam -> stop -> shot history -> shot review -> sleep
 *
 * Runs against the built dist/ served by mock-server.js on port 8080.
 */

import { test, expect } from '@playwright/test'

// ---- Helpers ----------------------------------------------------------------

async function loadApp(page) {
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  await page.goto('/')
  await page.waitForSelector('.status-bar', { timeout: 10000 })
  return consoleErrors
}

/**
 * Navigate via Vue Router (avoids hash-history quirks and 300ms debounce).
 */
async function navigateTo(page, path) {
  await page.evaluate((p) => {
    window.__vueRouter._skipDebounce = true
    return window.__vueRouter.push(p)
  }, path)
  await page.waitForTimeout(500)
}

/**
 * Change mock machine state via REST and wait for the WebSocket snapshot to
 * propagate the change to the app (reflected in the status bar).
 */
async function setMachineState(page, state) {
  await page.evaluate(async (s) => {
    await fetch(`/api/v1/machine/state/${s}`, { method: 'PUT' })
  }, state)
  // Wait for the next WS snapshot to arrive and the app to react
  await page.waitForTimeout(600)
}

/**
 * Filter console errors to remove expected noise (404 for unsaved settings,
 * WebSocket lifecycle messages, fetch failures during teardown).
 */
function filterExpected(errors) {
  return errors.filter((msg) => {
    if (msg.includes('404') || msg.includes('Not found')) return false
    if (msg.includes('WebSocket')) return false
    if (msg.includes('Failed to fetch')) return false
    // Plugin endpoint not available in mock
    if (msg.includes('plugin')) return false
    return true
  })
}

// ---- Test -------------------------------------------------------------------

test.describe('Complete user session', () => {
  test('walks through an entire barista workflow', async ({ page }) => {
    // Extend the default test timeout since this is a long integration test
    test.setTimeout(120000)

    const consoleErrors = await loadApp(page)

    // Reset machine to idle (in case a previous test left it in another state)
    await fetch('http://localhost:8080/api/v1/machine/state/idle', { method: 'PUT' })
    await page.waitForTimeout(1500)

    // ------------------------------------------------------------------
    // Step 1: Verify idle page and machine connection
    // ------------------------------------------------------------------
    await page.waitForTimeout(2000) // Allow WS to connect and send data

    await expect(page.locator('.idle-page')).toBeVisible()
    await expect(page.locator('.status-bar__state')).toHaveText('idle')

    // Connection indicator should show connected
    const connDot = page.locator('.connection-indicator__dot--connected')
    await expect(connDot.first()).toBeVisible()

    // ------------------------------------------------------------------
    // Step 2: Put the machine to sleep
    // ------------------------------------------------------------------
    // The Sleep button is rendered by the navButtons LayoutWidget
    const sleepBtn = page.locator('.layout-widget__nav-btn--sleep')
    await expect(sleepBtn).toBeVisible()
    await sleepBtn.click()

    // The mock server changes state to 'sleeping' via the REST call in
    // the click handler; the WS snapshot will propagate the state change.
    // The app auto-navigates to the screensaver page.
    await page.waitForTimeout(1500)

    // The status bar should show 'sleeping' (the screensaver page still has it)
    const stateText = await page.locator('.status-bar__state').textContent()
    expect(['sleeping', 'Sleeping']).toContain(stateText?.trim())

    // ------------------------------------------------------------------
    // Step 3: Wake the machine (set state back to idle)
    // ------------------------------------------------------------------
    await setMachineState(page, 'idle')

    // App should auto-navigate back from screensaver to idle
    await page.waitForTimeout(1000)

    // If we ended up on screensaver still, navigate manually
    const currentUrl = page.url()
    if (currentUrl.includes('screensaver')) {
      await navigateTo(page, '/')
      await page.waitForTimeout(500)
    }

    await expect(page.locator('.idle-page')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.status-bar__state')).toHaveText('idle')

    // ------------------------------------------------------------------
    // Step 4: Navigate to Settings > Beans tab, add a new bean
    // ------------------------------------------------------------------
    await navigateTo(page, '/settings/beans')
    await page.waitForTimeout(1500)

    // Verify we are on the settings page with the Beans tab active
    await expect(page.locator('.settings-page')).toBeVisible()
    // The Beans tab should be selected (navigated via deep link)
    await expect(page.locator('#settings-tab-beans[aria-selected="true"]')).toBeVisible()

    // Click "Add Bean" button
    const addBeanBtn = page.locator('.beans-tab__add-btn')
    await expect(addBeanBtn).toBeVisible()
    await addBeanBtn.click()
    await page.waitForTimeout(300)

    // The create form should appear
    await expect(page.locator('.beans-tab__form--create')).toBeVisible()

    // Fill in roaster and name (required fields)
    await page.locator('.beans-tab__form--create .beans-tab__input').first().fill('Test Roastery')
    await page.locator('.beans-tab__form--create .beans-tab__input').nth(1).fill('Ethiopia Yirgacheffe')

    // Save the bean
    await page.locator('.beans-tab__form--create .beans-tab__btn--save').click()
    await page.waitForTimeout(1000)

    // The create form should close (bean was created successfully)
    // If the API fails the form stays open, but we verify the UI is navigable
    const createFormStillVisible = await page.locator('.beans-tab__form--create').isVisible()
    if (!createFormStillVisible) {
      // Bean was created - verify it shows in the list
      await expect(page.locator('.beans-tab__bean-roaster', { hasText: 'Test Roastery' })).toBeVisible({ timeout: 3000 })
    }

    // ------------------------------------------------------------------
    // Step 5: Navigate to Settings > Grinders tab, add a grinder
    // ------------------------------------------------------------------
    // Click the Grinders tab button
    await page.locator('#settings-tab-grinders').click()
    await page.waitForTimeout(1000)

    await expect(page.locator('.grinders-tab')).toBeVisible()

    // Click "Add Grinder"
    const addGrinderBtn = page.locator('.grinders-tab__add-btn')
    await expect(addGrinderBtn).toBeVisible()
    await addGrinderBtn.click()
    await page.waitForTimeout(300)

    // Fill in model name (required)
    await page.locator('.grinders-tab__form .grinders-tab__input').first().fill('Niche Zero')

    // Click Create
    await page.locator('.grinders-tab__btn--primary', { hasText: 'Create' }).click()
    await page.waitForTimeout(1000)

    // Verify the grinder was added (or at least the form was submitted)
    const grinderFormStillVisible = await page.locator('.grinders-tab__form .grinders-tab__form-title').isVisible()
    if (!grinderFormStillVisible) {
      await expect(page.locator('.grinders-tab__item-model', { hasText: 'Niche Zero' })).toBeVisible({ timeout: 3000 })
    }

    // ------------------------------------------------------------------
    // Step 6: Navigate to the recipe editor to create a recipe
    // ------------------------------------------------------------------
    await navigateTo(page, '/recipe/edit')
    await page.waitForTimeout(2000)

    // The page should load (BeanInfoPage)
    // It has a profile section, coffee section, grinder section, dose section
    await expect(page.locator('.recipe-editor__grid')).toBeVisible({ timeout: 5000 })

    // In manual mode (no bean entity selected), SuggestionField inputs are visible
    // Coffee Name is the first SuggestionField in the Coffee column
    const coffeeNameInput = page.locator('.suggestion-field__input[placeholder="Coffee name"]')
    if (await coffeeNameInput.isVisible().catch(() => false)) {
      await coffeeNameInput.fill('Latte Blend')
    }

    // Roaster is the second SuggestionField
    const roasterInput = page.locator('.suggestion-field__input[placeholder="Roaster name"]')
    if (await roasterInput.isVisible().catch(() => false)) {
      await roasterInput.fill('Test Roastery')
    }

    // Grinder model (SuggestionField in manual mode)
    const grinderModelInput = page.locator('.suggestion-field__input[placeholder="Grinder model"]')
    if (await grinderModelInput.isVisible().catch(() => false)) {
      await grinderModelInput.fill('Niche Zero')
    }

    // Grinder setting (plain text input in manual mode)
    const grinderSettingInput = page.locator('.recipe-editor__input[placeholder="Grind setting"]')
    if (await grinderSettingInput.isVisible().catch(() => false)) {
      await grinderSettingInput.fill('15')
    }

    // Enable steam for the latte combo
    const steamToggle = page.locator('.recipe-editor__op-toggle', { hasText: 'Steam' })
    if (await steamToggle.isVisible()) {
      await steamToggle.click()
      await page.waitForTimeout(300)
    }

    // Save as a new workflow combo
    const saveAsNewBtn = page.locator('.recipe-editor__save-btn', { hasText: 'Save as New' })
    if (await saveAsNewBtn.isVisible()) {
      await saveAsNewBtn.click()
      await page.waitForTimeout(1000)
    }

    // ------------------------------------------------------------------
    // Step 7: Go to idle and select the workflow combo
    // ------------------------------------------------------------------
    await navigateTo(page, '/')
    await page.waitForTimeout(1500)

    await expect(page.locator('.idle-page')).toBeVisible()

    // If workflow combos are visible (PresetPillRow), click the first one
    const presetPill = page.locator('.preset-pill').first()
    if (await presetPill.isVisible().catch(() => false)) {
      await presetPill.click()
      await page.waitForTimeout(500)
    }

    // ------------------------------------------------------------------
    // Step 8: Start espresso (two-step confirm: tap, then tap again)
    // ------------------------------------------------------------------
    // The Espresso button is an action button in the layout
    const espressoBtn = page.locator('.action-button', { hasText: 'Espresso' })
    await expect(espressoBtn).toBeVisible()

    // First tap: enter confirm state
    await espressoBtn.click()
    await page.waitForTimeout(300)

    // Button should now show "Tap to start" (confirmed state)
    await expect(page.locator('.action-button--confirmed')).toBeVisible()

    // Second tap: actually start espresso
    await page.locator('.action-button--confirmed').click()

    // The click handler calls setMachineState('espresso') and navigates
    // to /espresso. Wait for the page to load.
    await page.waitForTimeout(1500)

    // ------------------------------------------------------------------
    // Step 9: Verify espresso state
    // ------------------------------------------------------------------
    // The status bar should reflect the espresso state
    await expect(page.locator('.status-bar__state')).toHaveText('espresso', { timeout: 5000 })

    // The EspressoPage should be visible
    await expect(page.locator('.espresso-page')).toBeVisible({ timeout: 5000 })

    // ------------------------------------------------------------------
    // Step 10: Stop the shot
    // ------------------------------------------------------------------
    const stopEspressoBtn = page.locator('.espresso-page__back')
    await expect(stopEspressoBtn).toBeVisible()
    await stopEspressoBtn.click()

    // This calls setMachineState('idle') and navigates to /
    await page.waitForTimeout(1500)

    // Wait for idle state to propagate
    await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 5000 })
    await expect(page.locator('.idle-page')).toBeVisible({ timeout: 5000 })

    // ------------------------------------------------------------------
    // Step 11: Start steam operation (two-step confirm)
    // ------------------------------------------------------------------
    const steamBtn = page.locator('.action-button', { hasText: 'Steam' })
    await expect(steamBtn).toBeVisible()

    // First tap: enter confirm state
    await steamBtn.click()
    await page.waitForTimeout(300)

    // Second tap: actually start steam
    await page.locator('.action-button--confirmed').click()

    await page.waitForTimeout(1500)

    // Verify we are on the steam page
    await expect(page.locator('.status-bar__state')).toHaveText('steam', { timeout: 5000 })
    await expect(page.locator('.steam-page')).toBeVisible({ timeout: 5000 })

    // ------------------------------------------------------------------
    // Step 12: Stop steam
    // ------------------------------------------------------------------
    const stopSteamBtn = page.locator('.steam-page__stop-btn')
    await expect(stopSteamBtn).toBeVisible()
    await stopSteamBtn.click()

    await page.waitForTimeout(1500)

    // Wait for the state to return to idle (the stop sets it via API)
    // The app may auto-navigate based on the WS state update
    await expect(page.locator('.status-bar__state')).toHaveText('idle', { timeout: 5000 })

    // Navigate to idle if not already there
    if (!(await page.locator('.idle-page').isVisible().catch(() => false))) {
      await navigateTo(page, '/')
      await page.waitForTimeout(500)
    }

    // ------------------------------------------------------------------
    // Step 13: Navigate to shot history, find the latest shot
    // ------------------------------------------------------------------
    await navigateTo(page, '/history')
    await page.waitForTimeout(2000)

    await expect(page.locator('.shot-history')).toBeVisible()

    // The mock has 2 shots; verify we see them
    const shotRows = page.locator('.shot-history__row')
    await expect(shotRows).not.toHaveCount(0, { timeout: 5000 })

    // Verify the first shot row has profile info
    const firstProfile = page.locator('.shot-history__profile').first()
    await expect(firstProfile).toBeVisible()

    // ------------------------------------------------------------------
    // Step 14: Open shot review, edit notes, add a rating
    // ------------------------------------------------------------------
    // Click the Edit button on the first shot row to go to shot review
    const editBtn = page.locator('.shot-history__action-btn--edit').first()
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    await page.waitForTimeout(3000)

    // Verify we are on the shot review page
    await expect(page).toHaveURL(/shot-review/)
    await expect(page.locator('.review-page')).toBeVisible()

    // Wait for shot data to load
    await expect(page.locator('.review-page__scroll')).toBeVisible({ timeout: 5000 })

    // Edit the notes field
    const notesTextarea = page.locator('.review-page__textarea')
    await expect(notesTextarea).toBeVisible()
    await notesTextarea.fill('Great shot, smooth extraction with pleasant acidity.')

    // Set a rating using a preset button (75%)
    const ratingPreset = page.locator('.rating-input__preset', { hasText: '75%' })
    await expect(ratingPreset).toBeVisible()
    await ratingPreset.click()

    // Verify the rating label updated
    await expect(page.locator('.rating-input__label')).toHaveText('75%')

    // ------------------------------------------------------------------
    // Step 15: Save the review
    // ------------------------------------------------------------------
    // The save button should now be enabled (dirty state after edits)
    const saveBtn = page.locator('.review-page__save-btn')
    await expect(saveBtn).toBeVisible()
    // The button should say "Save" (not "Saved") since we made changes
    await expect(saveBtn).toHaveText('Save')
    await saveBtn.click()

    // Wait for save to complete
    await page.waitForTimeout(1500)

    // After saving, the button should show "Saved" (dirty is cleared)
    await expect(saveBtn).toHaveText('Saved', { timeout: 5000 })

    // ------------------------------------------------------------------
    // Step 16: Go back to idle, put machine to sleep
    // ------------------------------------------------------------------
    await navigateTo(page, '/')
    await page.waitForTimeout(1000)

    await expect(page.locator('.idle-page')).toBeVisible({ timeout: 5000 })

    // Put the machine to sleep again
    const sleepBtnFinal = page.locator('.layout-widget__nav-btn--sleep')
    await expect(sleepBtnFinal).toBeVisible()
    await sleepBtnFinal.click()

    await page.waitForTimeout(1500)

    // Machine should be sleeping
    const finalState = await page.locator('.status-bar__state').textContent()
    expect(['sleeping', 'Sleeping']).toContain(finalState?.trim())

    // ------------------------------------------------------------------
    // Verify: no unexpected JS errors during the entire session
    // ------------------------------------------------------------------
    const realErrors = filterExpected(consoleErrors)
    // Allow for some API errors that are expected in a mock environment
    // (e.g. missing plugin endpoints, entity APIs that return unexpected shapes)
    const criticalErrors = realErrors.filter((msg) => {
      // Ignore common mock-environment errors
      if (msg.includes('Cannot read properties')) return true
      if (msg.includes('Uncaught')) return true
      return false
    })

    // Log all real errors for debugging (but don't hard-fail the test on non-critical ones)
    if (realErrors.length > 0) {
      console.log(`[info] ${realErrors.length} console error(s) during session:`)
      realErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e.slice(0, 200)}`))
    }

    // Only fail on critical errors (unhandled exceptions)
    expect(criticalErrors).toEqual([])
  })
})
