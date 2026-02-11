/**
 * Enhanced theme composable with dynamic CSS custom property injection
 * and theme preset support.
 *
 * Loads theme from settings, applies all color tokens as CSS custom
 * properties on :root. Supports named theme presets, custom color
 * overrides, and random palette generation.
 */

import { computed, watch } from 'vue'
import { useSettings } from './useSettings'

// ---- Default palette (from Theme.qml) ----------------------------------------

const DEFAULT_COLORS = {
  background: '#1a1a2e',
  surface: '#252538',
  primary: '#4e85f4',
  accent: '#e94560',
  text: '#e0e0e0',
  textSecondary: '#999999',
  border: '#3a3a55',
  success: '#4caf50',
  warning: '#FFC107',
  error: '#f44336',
  highlight: '#7B68EE',
}

const CHART_COLORS = {
  pressure: '#18c37e',
  pressureGoal: '#5fd9a8',
  flow: '#4e85f4',
  flowGoal: '#8fb3f5',
  temperature: '#e73249',
  temperatureGoal: '#f08090',
  weight: '#a2693d',
  weightGoal: '#c49a6c',
}

// ---- Theme presets -----------------------------------------------------------

const PRESETS = {
  default: { ...DEFAULT_COLORS },
  midnight: {
    background: '#0d1117',
    surface: '#161b22',
    primary: '#58a6ff',
    accent: '#f78166',
    text: '#c9d1d9',
    textSecondary: '#8b949e',
    border: '#30363d',
    success: '#3fb950',
    warning: '#d29922',
    error: '#f85149',
    highlight: '#bc8cff',
  },
  espresso: {
    background: '#1b1410',
    surface: '#2a211a',
    primary: '#c49a6c',
    accent: '#d4764e',
    text: '#e8ddd1',
    textSecondary: '#a09080',
    border: '#3d3228',
    success: '#6abf69',
    warning: '#e0a030',
    error: '#d45050',
    highlight: '#b88c5a',
  },
  nordic: {
    background: '#1e2430',
    surface: '#2b3442',
    primary: '#81a1c1',
    accent: '#bf616a',
    text: '#d8dee9',
    textSecondary: '#7b88a1',
    border: '#3b4252',
    success: '#a3be8c',
    warning: '#ebcb8b',
    error: '#bf616a',
    highlight: '#b48ead',
  },
  ocean: {
    background: '#0a192f',
    surface: '#112240',
    primary: '#64ffda',
    accent: '#f07178',
    text: '#ccd6f6',
    textSecondary: '#8892b0',
    border: '#233554',
    success: '#64ffda',
    warning: '#ffd866',
    error: '#f07178',
    highlight: '#c792ea',
  },
}

// ---- Composable -------------------------------------------------------------

export function useTheme() {
  const { settings } = useSettings()

  /** Resolved color values: defaults merged with custom overrides. */
  const colors = computed(() => {
    const base = PRESETS[settings.activeThemeName] || PRESETS.default
    const custom = settings.customThemeColors || {}
    return { ...base, ...custom }
  })

  const chartColors = computed(() => CHART_COLORS)

  /** Apply all color tokens to :root as CSS custom properties. */
  function applyToRoot() {
    const root = document.documentElement
    const c = colors.value
    for (const [key, value] of Object.entries(c)) {
      root.style.setProperty(`--color-${camelToKebab(key)}`, value)
    }
    // Chart colors
    for (const [key, value] of Object.entries(CHART_COLORS)) {
      root.style.setProperty(`--color-${camelToKebab(key)}`, value)
    }
  }

  /** Switch to a named theme preset (resets custom overrides). */
  function setPreset(name) {
    if (!PRESETS[name]) return
    settings.activeThemeName = name
    settings.customThemeColors = {}
  }

  /** Override a single color token. */
  function setColor(token, value) {
    settings.customThemeColors = {
      ...(settings.customThemeColors || {}),
      [token]: value,
    }
  }

  /** Reset to default theme. */
  function resetToDefault() {
    settings.activeThemeName = 'default'
    settings.customThemeColors = {}
  }

  /** Generate a random palette from HSL base values. */
  function generateRandomPalette() {
    const hue = Math.floor(Math.random() * 360)
    const sat = 40 + Math.floor(Math.random() * 30)
    const palette = {
      background: hsl(hue, sat - 15, 10),
      surface: hsl(hue, sat - 10, 15),
      primary: hsl(hue, sat + 20, 55),
      accent: hsl((hue + 150) % 360, sat + 10, 50),
      text: hsl(hue, 10, 90),
      textSecondary: hsl(hue, 8, 60),
      border: hsl(hue, sat - 10, 25),
      success: hsl(130, 50, 50),
      warning: hsl(40, 80, 55),
      error: hsl(0, 70, 55),
      highlight: hsl((hue + 90) % 360, sat, 60),
    }
    settings.customThemeColors = palette
    return palette
  }

  /** List available preset names. */
  function getPresetNames() {
    return Object.keys(PRESETS)
  }

  // Watch for changes and re-apply to :root
  watch(colors, applyToRoot, { immediate: true, deep: true })

  return {
    colors,
    chartColors,
    setPreset,
    setColor,
    resetToDefault,
    generateRandomPalette,
    getPresetNames,
    applyToRoot,
  }
}

// ---- Helpers ----------------------------------------------------------------

function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function hsl(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`
}
