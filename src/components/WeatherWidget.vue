<script setup>
/**
 * WeatherWidget — passive home widget backed by the `weather.reaplugin`
 * websocket (see useWeather.js). Shows one condition icon + current temp,
 * today's high/low, and humidity. No heading, no location name, no detail
 * metrics in v1.
 *
 * Passione owns no weather configuration: location/refresh/units are
 * plugin-owned. When the plugin is missing or misconfigured the widget
 * stays visible with a quiet explanatory state.
 */
import { computed, onMounted } from 'vue'
import { useWeather } from '../composables/useWeather'
import {
  displayTemperature,
  displayHighLow,
  displayHumidity,
  weatherNotice,
} from '../composables/weatherModel'
import { weatherIcons } from '../assets/icons/weather'

const props = defineProps({
  /**
   * Layout density the containing zone affords: 'edge' (compact) or
   * 'center' (stack zone, slightly more spacious). Same information either
   * way — LayoutWidget derives this from the home zone.
   */
  density: { type: String, default: 'center', validator: (v) => ['center', 'edge'].includes(v) },
})

const weather = useWeather()

onMounted(() => {
  // Idempotent — only the first widget placement opens the shared socket.
  weather.ensure()
})

const status = computed(() => weather.status.value)
// Notice copy for explanatory states (config/unavailable/pluginMissing);
// null for loading/usable — comes from the pure weatherModel module so the
// widget has a single source of truth for its messages.
const notice = computed(() => weatherNotice(status.value))
const currentText = computed(() =>
  displayTemperature(weather.temperature.value, weather.units.value)
)
const highText = computed(() => displayHighLow(weather.high.value))
const lowText = computed(() => displayHighLow(weather.low.value))
const humidityText = computed(() => displayHumidity(weather.humidity.value))
const icon = computed(() => weatherIcons[weather.iconClass.value] ?? weatherIcons.cloudy)

// Accessible name for the decorative condition icon.
const CONDITION_ARIA = {
  clear: 'Clear sky',
  partlyCloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  rain: 'Rain',
  snow: 'Snow',
}
const iconAria = computed(() => CONDITION_ARIA[weather.iconClass.value] ?? 'Weather')
</script>

<template>
  <div class="weather-widget" :class="`weather-widget--${status}`">
    <div v-if="status === 'usable'" class="weather-widget__readout" :class="`weather-widget__readout--${density}`">
      <span class="weather-widget__icon" v-html="icon" role="img" :aria-label="iconAria" />
      <div class="weather-widget__values">
        <div class="weather-widget__current" data-testid="weather-current">{{ currentText }}</div>
        <div class="weather-widget__hl">
          H {{ highText }}&ensp;L {{ lowText }}
        </div>
        <div class="weather-widget__humidity">{{ humidityText }} humidity</div>
      </div>
    </div>

    <div v-if="notice" class="weather-widget__notice">
      <span class="weather-widget__notice-title">{{ notice.title }}</span>
      <span v-if="notice.detail" class="weather-widget__notice-detail">{{ notice.detail }}</span>
    </div>
  </div>
</template>

<style scoped>
.weather-widget {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: var(--spacing-small);
}

/* ---- Usable reading ---- */
.weather-widget__readout {
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

.weather-widget__icon {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--color-accent);
}

.weather-widget__readout--edge .weather-widget__icon {
  width: 30px;
  height: 30px;
}

.weather-widget__readout--center .weather-widget__icon {
  width: 44px;
  height: 44px;
}

.weather-widget__values {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.3;
}

.weather-widget__current {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
}

.weather-widget__readout--edge .weather-widget__current {
  font-size: var(--font-title);
}

.weather-widget__readout--center .weather-widget__current {
  font-size: calc(var(--font-title) * 1.3);
}

.weather-widget__hl,
.weather-widget__humidity {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* ---- Quiet explanatory states ---- */
.weather-widget__notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
  color: var(--color-text-secondary);
}

.weather-widget__notice-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text);
}

.weather-widget__notice-detail {
  font-size: var(--font-sm);
}
</style>
