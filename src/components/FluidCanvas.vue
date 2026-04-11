<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const canvasEl = ref(null)
let animFrameId = null

// Simulation grid size (coarse for performance)
const N = 128
const M = 64
const SIZE = (N + 2) * (M + 2)

function IX(x, y) { return x + (N + 2) * y }

// Fluid state
let u = new Float32Array(SIZE)      // velocity x
let v = new Float32Array(SIZE)      // velocity y
let u0 = new Float32Array(SIZE)
let v0 = new Float32Array(SIZE)
let dens = []  // one density array per color channel
let dens0 = []

const NUM_COLORS = 4
// Brand palette colors
const PALETTE = [
  [24 / 255, 195 / 255, 126 / 255],   // green
  [78 / 255, 133 / 255, 244 / 255],    // blue
  [162 / 255, 105 / 255, 61 / 255],    // brown
  [233 / 255, 69 / 255, 96 / 255],     // red
]

// Autonomous sources that drift slowly
const sources = PALETTE.map((color, i) => ({
  x: 0.2 + i * 0.2,
  y: 0.3 + (i % 2) * 0.4,
  vx: (Math.random() - 0.5) * 0.001,
  vy: (Math.random() - 0.5) * 0.001,
  color: i,
  angle: Math.random() * Math.PI * 2,
  angleSpeed: 0.002 + Math.random() * 0.003,
}))

function init() {
  u = new Float32Array(SIZE)
  v = new Float32Array(SIZE)
  u0 = new Float32Array(SIZE)
  v0 = new Float32Array(SIZE)
  dens = []
  dens0 = []
  for (let c = 0; c < NUM_COLORS; c++) {
    dens.push(new Float32Array(SIZE))
    dens0.push(new Float32Array(SIZE))
  }
}

// --- Fluid solver (Jos Stam "Stable Fluids" simplified) ---

function addSource(x, s, dt) {
  for (let i = 0; i < SIZE; i++) x[i] += dt * s[i]
}

function setBoundary(b, x) {
  for (let j = 1; j <= M; j++) {
    x[IX(0, j)]     = b === 1 ? -x[IX(1, j)] : x[IX(1, j)]
    x[IX(N + 1, j)] = b === 1 ? -x[IX(N, j)] : x[IX(N, j)]
  }
  for (let i = 1; i <= N; i++) {
    x[IX(i, 0)]     = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)]
    x[IX(i, M + 1)] = b === 2 ? -x[IX(i, M)] : x[IX(i, M)]
  }
  x[IX(0, 0)]         = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)])
  x[IX(0, M + 1)]     = 0.5 * (x[IX(1, M + 1)] + x[IX(0, M)])
  x[IX(N + 1, 0)]     = 0.5 * (x[IX(N, 0)] + x[IX(N + 1, 1)])
  x[IX(N + 1, M + 1)] = 0.5 * (x[IX(N, M + 1)] + x[IX(N + 1, M)])
}

function diffuse(b, x, x0, diff, dt) {
  const a = dt * diff * N * M
  for (let k = 0; k < 4; k++) { // Gauss-Seidel iterations
    for (let j = 1; j <= M; j++) {
      for (let i = 1; i <= N; i++) {
        x[IX(i, j)] = (x0[IX(i, j)] + a * (
          x[IX(i - 1, j)] + x[IX(i + 1, j)] +
          x[IX(i, j - 1)] + x[IX(i, j + 1)]
        )) / (1 + 4 * a)
      }
    }
    setBoundary(b, x)
  }
}

function advect(b, d, d0, uField, vField, dt) {
  const dt0x = dt * N
  const dt0y = dt * M
  for (let j = 1; j <= M; j++) {
    for (let i = 1; i <= N; i++) {
      let x = i - dt0x * uField[IX(i, j)]
      let y = j - dt0y * vField[IX(i, j)]
      if (x < 0.5) x = 0.5
      if (x > N + 0.5) x = N + 0.5
      if (y < 0.5) y = 0.5
      if (y > M + 0.5) y = M + 0.5
      const i0 = Math.floor(x), i1 = i0 + 1
      const j0 = Math.floor(y), j1 = j0 + 1
      const s1 = x - i0, s0 = 1 - s1
      const t1 = y - j0, t0 = 1 - t1
      d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
                     s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)])
    }
  }
  setBoundary(b, d)
}

function project(uField, vField, p, div) {
  const hx = 1.0 / N
  const hy = 1.0 / M
  for (let j = 1; j <= M; j++) {
    for (let i = 1; i <= N; i++) {
      div[IX(i, j)] = -0.5 * (
        hx * (uField[IX(i + 1, j)] - uField[IX(i - 1, j)]) +
        hy * (vField[IX(i, j + 1)] - vField[IX(i, j - 1)])
      )
      p[IX(i, j)] = 0
    }
  }
  setBoundary(0, div)
  setBoundary(0, p)
  for (let k = 0; k < 4; k++) {
    for (let j = 1; j <= M; j++) {
      for (let i = 1; i <= N; i++) {
        p[IX(i, j)] = (div[IX(i, j)] +
          p[IX(i - 1, j)] + p[IX(i + 1, j)] +
          p[IX(i, j - 1)] + p[IX(i, j + 1)]) / 4
      }
    }
    setBoundary(0, p)
  }
  for (let j = 1; j <= M; j++) {
    for (let i = 1; i <= N; i++) {
      uField[IX(i, j)] -= 0.5 * N * (p[IX(i + 1, j)] - p[IX(i - 1, j)])
      vField[IX(i, j)] -= 0.5 * M * (p[IX(i, j + 1)] - p[IX(i, j - 1)])
    }
  }
  setBoundary(1, uField)
  setBoundary(2, vField)
}

function velStep(dt) {
  addSource(u, u0, dt)
  addSource(v, v0, dt)
  ;[u0, u] = [u, u0]
  diffuse(1, u, u0, 0.0001, dt)
  ;[v0, v] = [v, v0]
  diffuse(2, v, v0, 0.0001, dt)
  project(u, v, u0, v0)
  ;[u0, u] = [u, u0]
  ;[v0, v] = [v, v0]
  advect(1, u, u0, u0, v0, dt)
  advect(2, v, v0, u0, v0, dt)
  project(u, v, u0, v0)
}

// --- Rendering ---

let imageData = null
let ctx = null

function render() {
  if (!ctx || !canvasEl.value) return
  const canvas = canvasEl.value
  const cw = canvas.width
  const ch = canvas.height

  if (!imageData || imageData.width !== cw || imageData.height !== ch) {
    imageData = ctx.createImageData(cw, ch)
  }

  const pixels = imageData.data
  const scaleX = N / cw
  const scaleY = M / ch

  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {
      // Map pixel to grid coordinates (with bilinear interpolation)
      const gx = (px + 0.5) * scaleX + 0.5
      const gy = (py + 0.5) * scaleY + 0.5

      const i0 = Math.floor(gx), i1 = i0 + 1
      const j0 = Math.floor(gy), j1 = j0 + 1
      const sx = gx - i0, sy = gy - j0

      let r = 0, g = 0, b = 0
      for (let c = 0; c < NUM_COLORS; c++) {
        const d = (1 - sx) * ((1 - sy) * dens[c][IX(i0, j0)] + sy * dens[c][IX(i0, j1)]) +
                  sx * ((1 - sy) * dens[c][IX(i1, j0)] + sy * dens[c][IX(i1, j1)])
        r += d * PALETTE[c][0]
        g += d * PALETTE[c][1]
        b += d * PALETTE[c][2]
      }

      const idx = (py * cw + px) * 4
      pixels[idx] = Math.min(255, r * 255)
      pixels[idx + 1] = Math.min(255, g * 255)
      pixels[idx + 2] = Math.min(255, b * 255)
      pixels[idx + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

// --- Animation loop ---

const DT = 0.15
let lastTime = 0

function updateSources() {
  // Clear source arrays
  u0.fill(0)
  v0.fill(0)
  for (let c = 0; c < NUM_COLORS; c++) dens0[c].fill(0)

  for (const src of sources) {
    // Drift source position
    src.angle += src.angleSpeed
    src.x += Math.cos(src.angle) * 0.0003 + src.vx
    src.y += Math.sin(src.angle) * 0.0003 + src.vy

    // Bounce off walls
    if (src.x < 0.05 || src.x > 0.95) { src.vx *= -1; src.x = Math.max(0.05, Math.min(0.95, src.x)) }
    if (src.y < 0.05 || src.y > 0.95) { src.vy *= -1; src.y = Math.max(0.05, Math.min(0.95, src.y)) }

    const gi = Math.floor(src.x * N) + 1
    const gj = Math.floor(src.y * M) + 1
    const radius = 3

    for (let dj = -radius; dj <= radius; dj++) {
      for (let di = -radius; di <= radius; di++) {
        const ii = gi + di
        const jj = gj + dj
        if (ii < 1 || ii > N || jj < 1 || jj > M) continue
        const dist = Math.sqrt(di * di + dj * dj)
        if (dist > radius) continue
        const falloff = 1 - dist / radius

        const idx = IX(ii, jj)
        // Add circular velocity (creates swirling)
        u0[idx] += Math.cos(src.angle + Math.PI / 2) * 0.5 * falloff
        v0[idx] += Math.sin(src.angle + Math.PI / 2) * 0.5 * falloff
        // Add dye
        dens0[src.color][idx] += 8 * falloff
      }
    }
  }
}

function animate(time) {
  animFrameId = requestAnimationFrame(animate)

  // Cap at ~30fps
  if (time - lastTime < 33) return
  lastTime = time

  updateSources()
  velStep(DT)

  // Density step (per color channel): diffuse then advect
  for (let c = 0; c < NUM_COLORS; c++) {
    const tmp = dens0[c]
    dens0[c] = dens[c]
    dens[c] = tmp
    diffuse(0, dens[c], dens0[c], 0.001, DT)
    const tmp2 = dens0[c]
    dens0[c] = dens[c]
    dens[c] = tmp2
    advect(0, dens[c], dens0[c], u, v, DT)
  }

  // Fade density slowly (prevent saturation)
  for (let c = 0; c < NUM_COLORS; c++) {
    for (let i = 0; i < SIZE; i++) {
      dens[c][i] *= 0.995
    }
  }

  render()
}

function handleResize() {
  if (!canvasEl.value) return
  const canvas = canvasEl.value
  // Use a lower resolution for performance (half screen res)
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  const scale = 0.5  // Render at half resolution for performance
  canvas.width = Math.floor(canvas.clientWidth * dpr * scale)
  canvas.height = Math.floor(canvas.clientHeight * dpr * scale)
  imageData = null
}

onMounted(() => {
  if (!canvasEl.value) return
  ctx = canvasEl.value.getContext('2d', { alpha: false })
  init()
  handleResize()
  window.addEventListener('resize', handleResize)
  animFrameId = requestAnimationFrame(animate)
})

onUnmounted(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <canvas ref="canvasEl" class="fluid-canvas" />
</template>

<style scoped>
.fluid-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
