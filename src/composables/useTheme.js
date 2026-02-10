import { computed } from 'vue'

const theme = {
  colors: {
    background: '#1a1a2e',
    surface: '#252538',
    primary: '#4e85f4',
    secondary: '#c0c5e3',
    text: '#ffffff',
    textSecondary: '#a0a8b8',
    accent: '#e94560',
    success: '#00cc6d',
    warning: '#ffaa00',
    highlight: '#ffaa00',
    error: '#ff4444',
    border: '#3a3a4e',
  },
  chart: {
    pressure: '#18c37e',
    pressureGoal: '#69fdb3',
    flow: '#4e85f4',
    flowGoal: '#7aaaff',
    temperature: '#e73249',
    temperatureGoal: '#ffa5a6',
    weight: '#a2693d',
  },
}

export function useTheme() {
  const colors = computed(() => theme.colors)
  const chartColors = computed(() => theme.chart)
  return { colors, chartColors }
}
