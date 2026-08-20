<script setup>
import { ref, computed, inject, onActivated, onDeactivated, onUnmounted } from 'vue'
import ValueInput from '../ValueInput.vue'
import SettingsToggle from './SettingsToggle.vue'
import ColorPicker from '../ColorPicker.vue'
import {
  getCupWarmer, updateCupWarmer,
  getCupWarmerPreheat, updateCupWarmerPreheat,
  getLedStrip, updateLedStrip, resetLedStrip,
  getScaleCalibration, sendScaleCalibrationCommand,
} from '../../api/rest.js'

const machineCapabilities = inject('machineCapabilities', null)
const caps = computed(() => machineCapabilities?.capabilities?.value ?? [])
const has = (token) => caps.value.includes(token)

// ---- Cup warmer -------------------------------------------------------------

const cupWarmer = ref(null)
const cupWarmerBusy = ref(false)

// Cup-warmer heat levels plus an explicit off state. `0` is the API's "off"
// setpoint (surprising as a user-facing value), so model off as
// `enabled: false` and expose three sensible setpoints from 40 °C to 80 °C.
const CUP_WARMER_LEVELS = [
  { key: 'off', label: 'Off' },
  { key: 'low', label: 'Low', value: 40 },
  { key: 'mid', label: 'Mid', value: 60 },
  { key: 'high', label: 'High', value: 80 },
]

function isCupWarmerActive(level) {
  if (!cupWarmer.value) return false
  if (!level.value) return cupWarmer.value.enabled === false
  return cupWarmer.value.enabled === true && cupWarmer.value.temperature === level.value
}

function setCupWarmerLevel(level) {
  if (!level.value) {
    setCupWarmerEnabled(false)
    return
  }
  setCupWarmerTemperature(level.value)
}

async function loadCupWarmer() {
  try {
    cupWarmer.value = await getCupWarmer()
  } catch {
    cupWarmer.value = null
  }
}

async function setCupWarmerEnabled(v) {
  if (!cupWarmer.value) return
  cupWarmerBusy.value = true
  try {
    await updateCupWarmer({ enabled: v })
    await loadCupWarmer()
  } finally {
    cupWarmerBusy.value = false
  }
}

async function setCupWarmerTemperature(v) {
  if (!cupWarmer.value) return
  cupWarmerBusy.value = true
  try {
    // Selecting a heat level also turns manual heating on.
    await updateCupWarmer({ temperature: v, enabled: true })
    await loadCupWarmer()
  } finally {
    cupWarmerBusy.value = false
  }
}

// ---- Cup warmer preheat -----------------------------------------------------

const preheat = ref(null)
const preheatBusy = ref(false)

async function loadPreheat() {
  try {
    preheat.value = await getCupWarmerPreheat()
  } catch {
    preheat.value = null
  }
}

async function setPreheatEnabled(v) {
  if (!preheat.value) return
  preheatBusy.value = true
  try {
    await updateCupWarmerPreheat({ enabled: v })
    await loadPreheat()
  } finally {
    preheatBusy.value = false
  }
}

async function setPreheatLead(v) {
  if (!preheat.value) return
  preheatBusy.value = true
  try {
    await updateCupWarmerPreheat({ leadMinutes: v })
    await loadPreheat()
  } finally {
    preheatBusy.value = false
  }
}

// ---- LED strip --------------------------------------------------------------

const COLOR16 = /^[0-9A-Fa-f]{12}$/

function emptyZone() {
  return { sleeping: '000000000000', awake: '000000000000' }
}

const led = ref({ frontStrip: emptyZone(), backStrip: emptyZone(), frontSwitch: emptyZone() })
const ledError = ref(null)

const LED_EDIT_ZONES = [
  { key: 'frontStrip', label: 'Front strip' },
  { key: 'backStrip', label: 'Back strip' },
]

async function loadLed() {
  try {
    const data = await getLedStrip()
    led.value = {
      frontStrip: { ...emptyZone(), ...(data?.frontStrip ?? {}) },
      backStrip: { ...emptyZone(), ...(data?.backStrip ?? {}) },
      frontSwitch: { ...emptyZone(), ...(data?.frontSwitch ?? {}) },
    }
  } catch {
    ledError.value = 'LED state unavailable'
  }
}

function color16ToCss(hex) {
  if (!COLOR16.test(hex ?? '')) return '#000000'
  return `#${hex.slice(0, 2)}${hex.slice(4, 6)}${hex.slice(8, 10)}`
}

// Inverse of color16ToCss: an 8-bit channel X becomes a 16-bit XXXX
// (value * 257), so the round-trip preserves the high byte the display uses
// and reaches true 0xFFFF full brightness.
function cssToColor16(css) {
  const m = /^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(css ?? '')
  if (!m) return '000000000000'
  return `${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase()
}

async function saveLed() {
  ledError.value = null
  for (const zone of LED_EDIT_ZONES) {
    for (const mode of ['sleeping', 'awake']) {
      if (!COLOR16.test(led.value[zone.key][mode])) {
        ledError.value = `${zone.label} ${mode} is not a valid 12-digit hex colour`
        return
      }
    }
  }
  try {
    await updateLedStrip({
      frontStrip: led.value.frontStrip,
      backStrip: led.value.backStrip,
    })
    await loadLed()
  } catch (e) {
    ledError.value = e.message
  }
}

async function reloadLed() {
  ledError.value = null
  try {
    await resetLedStrip()
    await loadLed()
  } catch (e) {
    ledError.value = e.message
  }
}

const pickerTarget = ref(null) // { zone, mode } | null

const pickerColor = computed(() => {
  const t = pickerTarget.value
  if (!t) return '#000000'
  return color16ToCss(led.value[t.zone]?.[t.mode])
})

const pickerTitle = computed(() => {
  const t = pickerTarget.value
  if (!t) return 'Colour'
  const label = LED_EDIT_ZONES.find((z) => z.key === t.zone)?.label ?? t.zone
  return `${label} ${t.mode}`
})

function openPicker(zone, mode) {
  pickerTarget.value = { zone, mode }
}

function onPickerColor(css) {
  const t = pickerTarget.value
  if (t) led.value[t.zone][t.mode] = cssToColor16(css)
}

function closePicker() {
  pickerTarget.value = null
}

// ---- Integrated-scale calibration ------------------------------------------

const cal = ref(null)
const calError = ref(null)
const latchWeight = ref(100)
const CAL_ACTIVE = new Set(['zeroing', 'calLatch', 'taring'])
let calPollTimer = null

async function loadCal() {
  try {
    cal.value = await getScaleCalibration()
  } catch {
    cal.value = null
  }
}

function startCalPolling() {
  stopCalPolling()
  calPollTimer = setInterval(async () => {
    try {
      const data = await getScaleCalibration()
      cal.value = data
      if (!CAL_ACTIVE.has(data.step)) stopCalPolling()
    } catch {
      stopCalPolling()
    }
  }, 1000)
}

function stopCalPolling() {
  if (calPollTimer) {
    clearInterval(calPollTimer)
    calPollTimer = null
  }
}

async function runCalCommand(command, weightGrams) {
  calError.value = null
  try {
    const res = await sendScaleCalibrationCommand(command, weightGrams)
    cal.value = res.state ?? res
    if (CAL_ACTIVE.has(cal.value.step)) startCalPolling()
    else stopCalPolling()
  } catch (e) {
    if (e.status === 409 && e.body?.state) {
      cal.value = e.body.state
      calError.value = e.body.reason || e.message
    } else {
      calError.value = e.message
    }
    stopCalPolling()
  }
}

function latch() {
  const w = Number(latchWeight.value)
  if (!Number.isFinite(w) || w < 1 || w > 10000) {
    calError.value = 'Known mass must be between 1 and 10000 g'
    return
  }
  runCalCommand('latch', w)
}

const calIsActive = computed(() => CAL_ACTIVE.has(cal.value?.step))

// ---- Lifecycle --------------------------------------------------------------

async function load() {
  if (has('cupWarmer')) await loadCupWarmer()
  if (has('preheat')) await loadPreheat()
  if (has('ledStrip')) await loadLed()
  if (has('scaleCalibration')) await loadCal()
}

onActivated(load)
onDeactivated(stopCalPolling)
onUnmounted(stopCalPolling)
</script>

<template>
  <div class="bengle-tab">
    <!-- Cup warmer -->
    <section v-if="has('cupWarmer')" class="bengle-tab__section">
      <h4 class="bengle-tab__section-title">Cup warmer</h4>

      <div class="bengle-tab__field">
        <label class="bengle-tab__label">Heat level</label>
        <div class="bengle-tab__levels" role="radiogroup" aria-label="Cup warmer heat level">
          <button
            v-for="level in CUP_WARMER_LEVELS"
            :key="level.key"
            class="bengle-tab__level"
            :class="{ 'bengle-tab__level--active': isCupWarmerActive(level) }"
            role="radio"
            :aria-checked="isCupWarmerActive(level)"
            :disabled="!cupWarmer || cupWarmerBusy"
            @click="setCupWarmerLevel(level)"
          >
            {{ level.value != null ? `${level.label} · ${level.value}°` : level.label }}
          </button>
        </div>
      </div>

      <div class="bengle-tab__row">
        <label class="bengle-tab__label">Current mat temperature</label>
        <span class="bengle-tab__value">
          {{ cupWarmer?.currentTemperature != null ? `${cupWarmer.currentTemperature.toFixed(1)} °C` : '—' }}
        </span>
      </div>
    </section>

    <!-- Preheat -->
    <section v-if="has('preheat')" class="bengle-tab__section">
      <h4 class="bengle-tab__section-title">Cup warmer preheat</h4>

      <div class="bengle-tab__row">
        <label class="bengle-tab__label">Scheduled pre-warm</label>
        <SettingsToggle
          :model-value="!!preheat?.enabled"
          :disabled="!preheat || preheatBusy"
          aria-label="Scheduled cup warmer preheat"
          @update:model-value="setPreheatEnabled"
        />
      </div>

      <div class="bengle-tab__row">
        <label class="bengle-tab__label">Lead time</label>
        <ValueInput
          :model-value="preheat?.leadMinutes ?? 0"
          :min="0" :max="120" :step="1" :decimals="0"
          suffix=" min"
          aria-label="Preheat lead time"
          @update:model-value="setPreheatLead"
        />
      </div>

      <div class="bengle-tab__row">
        <label class="bengle-tab__label">Currently preheating</label>
        <span class="bengle-tab__value">{{ preheat?.active ? 'Yes' : 'No' }}</span>
      </div>
    </section>

    <!-- Lighting -->
    <section v-if="has('ledStrip')" class="bengle-tab__section">
      <h4 class="bengle-tab__section-title">Lighting</h4>

      <div v-for="zone in LED_EDIT_ZONES" :key="zone.key" class="bengle-tab__led-zone">
        <span class="bengle-tab__label bengle-tab__led-zone-title">{{ zone.label }}</span>

        <div v-for="mode in ['awake', 'sleeping']" :key="mode" class="bengle-tab__row">
          <label class="bengle-tab__label bengle-tab__label--mode">{{ mode }}</label>
          <input
            v-model="led[zone.key][mode]"
            class="bengle-tab__hex-input"
            inputmode="text"
            :pattern="'[0-9A-Fa-f]{12}'"
            spellcheck="false"
            :aria-label="`${zone.label} ${mode} colour`"
          />
          <button
            type="button"
            class="bengle-tab__swatch bengle-tab__swatch--button"
            :style="{ backgroundColor: color16ToCss(led[zone.key][mode]) }"
            :aria-label="`Pick ${zone.label} ${mode} colour`"
            @click="openPicker(zone.key, mode)"
          />
        </div>
      </div>

      <div class="bengle-tab__led-zone">
        <span class="bengle-tab__label bengle-tab__led-zone-title">Front switch (derived)</span>
        <div v-for="mode in ['awake', 'sleeping']" :key="mode" class="bengle-tab__row">
          <label class="bengle-tab__label bengle-tab__label--mode">{{ mode }}</label>
          <span class="bengle-tab__value">{{ led.frontSwitch[mode] }}</span>
          <span
            class="bengle-tab__swatch"
            :style="{ backgroundColor: color16ToCss(led.frontSwitch[mode]) }"
            aria-hidden="true"
          />
        </div>
      </div>

      <div class="bengle-tab__led-actions">
        <button class="bengle-tab__btn" @click="saveLed">Save</button>
        <button class="bengle-tab__btn bengle-tab__btn--secondary" @click="reloadLed">Reload from machine</button>
      </div>

      <span v-if="ledError" class="bengle-tab__error">{{ ledError }}</span>
    </section>

    <!-- Integrated-scale calibration -->
    <section v-if="has('scaleCalibration')" class="bengle-tab__section">
      <h4 class="bengle-tab__section-title">Integrated scale calibration</h4>

      <div class="bengle-tab__cal-grid">
        <div class="bengle-tab__row">
          <label class="bengle-tab__label">Step</label>
          <span class="bengle-tab__value">{{ cal?.step ?? '—' }}</span>
        </div>
        <div class="bengle-tab__row">
          <label class="bengle-tab__label">Detected cell</label>
          <span class="bengle-tab__value">{{ cal?.detectedCell ?? '—' }}</span>
        </div>
        <div class="bengle-tab__row">
          <label class="bengle-tab__label">Status</label>
          <span class="bengle-tab__value">{{ cal?.status ?? '—' }}</span>
        </div>
        <div v-if="calIsActive" class="bengle-tab__row">
          <label class="bengle-tab__label">Seconds remaining</label>
          <span class="bengle-tab__value">{{ cal?.secondsRemaining ?? 0 }}</span>
        </div>
      </div>

      <div class="bengle-tab__cal-actions">
        <button class="bengle-tab__btn" :disabled="calIsActive" @click="runCalCommand('zero')">Zero</button>
        <div class="bengle-tab__latch">
          <ValueInput
            v-model="latchWeight"
            :min="1" :max="10000" :step="0.1" :decimals="1"
            suffix=" g"
            aria-label="Known calibration mass"
          />
          <button class="bengle-tab__btn" :disabled="calIsActive" @click="latch">Latch</button>
        </div>
        <button class="bengle-tab__btn bengle-tab__btn--secondary" :disabled="!calIsActive" @click="runCalCommand('abort')">Abort</button>
      </div>

      <span v-if="calError" class="bengle-tab__error">{{ calError }}</span>
    </section>

    <ColorPicker
      :visible="!!pickerTarget"
      :model-value="pickerColor"
      :title="pickerTitle"
      @update:model-value="onPickerColor"
      @close="closePicker"
    />
  </div>
</template>

<style scoped>
.bengle-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.bengle-tab__section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bengle-tab__section-title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.bengle-tab__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
}

.bengle-tab__label {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
}

.bengle-tab__label--mode {
  text-transform: capitalize;
  flex-shrink: 0;
}

.bengle-tab__value {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
  text-transform: capitalize;
}

.bengle-tab__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bengle-tab__levels {
  display: flex;
  gap: 8px;
}

.bengle-tab__level {
  flex: 1;
  padding: 10px 8px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
}

.bengle-tab__level--active {
  background: var(--color-primary);
  color: var(--color-text);
  border-color: var(--color-primary);
}

.bengle-tab__level:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.bengle-tab__led-zone {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.bengle-tab__led-zone-title {
  font-weight: 600;
  color: var(--color-text);
}

.bengle-tab__hex-input {
  flex: 1;
  max-width: 180px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-md);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
}

.bengle-tab__swatch {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.bengle-tab__swatch--button {
  width: 44px;
  height: 44px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.bengle-tab__swatch--button:active {
  transform: scale(0.92);
}

.bengle-tab__led-actions,
.bengle-tab__cal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.bengle-tab__latch {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bengle-tab__btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: var(--font-md);
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
}

.bengle-tab__btn:disabled {
  background: var(--button-disabled);
  color: var(--button-disabled-text);
  cursor: not-allowed;
}

.bengle-tab__btn--secondary {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.bengle-tab__cal-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bengle-tab__error {
  font-size: var(--font-md);
  color: var(--color-error);
}
</style>
