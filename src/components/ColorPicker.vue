<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  modelValue: { type: String, default: '#000000' },
  title: { type: String, default: 'Colour' },
})

const emit = defineEmits(['update:modelValue', 'close'])

const h = ref(0)
const s = ref(0)
const v = ref(0)
const dragging = ref(null) // 'pad' | 'hue' | null
const padEl = ref(null)
const hueEl = ref(null)

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

function hsvToRgb(hh, ss, vv) {
  const i = Math.floor(hh / 60)
  const f = hh / 60 - i
  const p = vv * (1 - ss)
  const q = vv * (1 - ss * f)
  const t = vv * (1 - ss * (1 - f))
  const rgb =
    i % 6 === 0 ? [vv, t, p] :
    i % 6 === 1 ? [q, vv, p] :
    i % 6 === 2 ? [p, vv, t] :
    i % 6 === 3 ? [p, q, vv] :
    i % 6 === 4 ? [t, p, vv] :
                  [vv, p, q]
  return rgb.map((x) => Math.round(x * 255))
}

function rgbToHex(r, g, b) {
  const to = (n) => n.toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function hexToHsv(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  const rgb = m ? m.slice(1).map((x) => parseInt(x, 16) / 255) : [0, 0, 0]
  const max = Math.max(...rgb)
  const min = Math.min(...rgb)
  const d = max - min
  let hh = 0
  if (d) {
    if (max === rgb[0]) hh = ((rgb[1] - rgb[2]) / d) % 6
    else if (max === rgb[1]) hh = (rgb[2] - rgb[0]) / d + 2
    else hh = (rgb[0] - rgb[1]) / d + 4
    hh = (hh * 60 + 360) % 360
  }
  return { h: hh, s: max === 0 ? 0 : d / max, v: max }
}

function syncFromModel() {
  const { h: hh, s: ss, v: vv } = hexToHsv(props.modelValue)
  h.value = hh
  s.value = ss
  v.value = vv
}

watch(() => props.visible, (vis) => {
  if (vis) {
    dragging.value = null
    syncFromModel()
  }
})

watch(() => props.modelValue, () => {
  if (!dragging.value) syncFromModel()
})

const currentHex = computed(() => rgbToHex(...hsvToRgb(h.value, s.value, v.value)))
const padBg = computed(() => `hsl(${h.value}, 100%, 50%)`)
const padLeft = computed(() => `${s.value * 100}%`)
const padTop = computed(() => `${(1 - v.value) * 100}%`)
const hueLeft = computed(() => `${(h.value / 360) * 100}%`)

function emitColor() {
  emit('update:modelValue', currentHex.value)
}

function onPadDown(e) {
  dragging.value = 'pad'
  e.currentTarget.setPointerCapture?.(e.pointerId)
  updatePad(e)
}

function onPadMove(e) {
  if (dragging.value === 'pad') updatePad(e)
}

function updatePad(e) {
  const rect = padEl.value.getBoundingClientRect()
  s.value = clamp((e.clientX - rect.left) / rect.width, 0, 1)
  v.value = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1)
  emitColor()
}

function onHueDown(e) {
  dragging.value = 'hue'
  e.currentTarget.setPointerCapture?.(e.pointerId)
  updateHue(e)
}

function onHueMove(e) {
  if (dragging.value === 'hue') updateHue(e)
}

function updateHue(e) {
  const rect = hueEl.value.getBoundingClientRect()
  h.value = clamp(((e.clientX - rect.left) / rect.width) * 360, 0, 360)
  emitColor()
}

function endDrag() {
  dragging.value = null
}
</script>

<template>
  <Transition name="popup-fade">
    <div v-if="visible" class="color-picker" @click.self="emit('close')">
      <div class="color-picker__card">
        <div class="color-picker__header">
          <span class="color-picker__title">{{ title }}</span>
          <button class="color-picker__close" @click="emit('close')" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="color-picker__body">
          <div
            ref="padEl"
            class="color-picker__pad"
            :style="{ backgroundColor: padBg }"
            @pointerdown="onPadDown"
            @pointermove="onPadMove"
            @pointerup="endDrag"
            @pointercancel="endDrag"
          >
            <div class="color-picker__pad-white" />
            <div class="color-picker__pad-black" />
            <div class="color-picker__thumb" :style="{ left: padLeft, top: padTop, backgroundColor: currentHex }" />
          </div>

          <div
            ref="hueEl"
            class="color-picker__hue"
            @pointerdown="onHueDown"
            @pointermove="onHueMove"
            @pointerup="endDrag"
            @pointercancel="endDrag"
          >
            <div class="color-picker__thumb" :style="{ left: hueLeft, backgroundColor: `hsl(${h}, 100%, 50%)` }" />
          </div>

          <div class="color-picker__preview">
            <span class="color-picker__preview-swatch" :style="{ backgroundColor: currentHex }" />
            <span class="color-picker__preview-hex">{{ currentHex }}</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.color-picker {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-modal);
  background: var(--color-overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-picker__card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  width: 90%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.color-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
}

.color-picker__title {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
  text-transform: capitalize;
}

.color-picker__close {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  -webkit-tap-highlight-color: transparent;
}

.color-picker__close:active {
  background: var(--color-surface-pressed);
}

.color-picker__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.color-picker__pad {
  position: relative;
  height: 200px;
  border-radius: 8px;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
}

.color-picker__pad-white {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, #fff, rgba(255, 255, 255, 0));
}

.color-picker__pad-black {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, #000, rgba(0, 0, 0, 0));
}

.color-picker__hue {
  position: relative;
  height: 24px;
  border-radius: 12px;
  margin-top: 16px;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
  cursor: pointer;
  touch-action: none;
}

.color-picker__thumb {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.color-picker__preview {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.color-picker__preview-swatch {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.color-picker__preview-hex {
  font-size: var(--font-md);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--color-text);
  text-transform: uppercase;
}

.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: opacity 0.15s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
}
</style>
