<script setup>
import { ref, computed, inject, onActivated, onDeactivated, onUnmounted } from 'vue'
import ValueInput from '../ValueInput.vue'
import SettingsToggle from './SettingsToggle.vue'
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
    // Setting a temperature also enables manual heating (Decaid backwards
    // compatibility); re-read to reflect the authoritative state.
    await updateCupWarmer({ temperature: v })
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

      <div class="bengle-tab__row">
        <label class="bengle-tab__label">Manual heating</label>
        <SettingsToggle
          :model-value="!!cupWarmer?.enabled"
          :disabled="!cupWarmer || cupWarmerBusy"
          aria-label="Manual cup warmer heating"
          @update:model-value="setCupWarmerEnabled"
        />
      </div>

      <div class="bengle-tab__row">
        <label class="bengle-tab__label">Setpoint</label>
        <ValueInput
          :model-value="cupWarmer?.temperature ?? 0"
          :min="0" :max="80" :step="1" :decimals="0"
          suffix=" °C"
          aria-label="Cup warmer setpoint"
          @update:model-value="setCupWarmerTemperature"
        />
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
          <span
            class="bengle-tab__swatch"
            :style="{ backgroundColor: color16ToCss(led[zone.key][mode]) }"
            aria-hidden="true"
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
