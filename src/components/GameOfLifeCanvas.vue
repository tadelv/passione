<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  hours: { type: String, default: '00' },
  minutes: { type: String, default: '00' },
})

const canvasEl = ref(null)
let animFrameId = null
let ctx = null

// Simulation grid — coarse for organic look
const CELL_PX = 12
let cols = 0
let rows = 0
let grid = null
let prevGrid = null
let next = null

// Brand palette
const CELL_COLORS = [
  [24, 195, 126],
  [78, 133, 244],
  [162, 105, 61],
  [233, 69, 96],
]

let colorGrid = null
let cellAlpha = null

// Offscreen canvas for low-res rendering (scaled up = natural blur)
let offscreen = null
let offCtx = null

function initGrid() {
  const size = cols * rows
  grid = new Uint8Array(size)
  prevGrid = new Uint8Array(size)
  next = new Uint8Array(size)
  colorGrid = new Uint8Array(size)
  cellAlpha = new Float32Array(size)

  for (let i = 0; i < size; i++) {
    if (Math.random() < 0.12) {
      grid[i] = 1
      cellAlpha[i] = 1
      colorGrid[i] = Math.floor(Math.random() * CELL_COLORS.length)
    }
  }
  prevGrid.set(grid)

  // Offscreen canvas at 1px per cell — bilinear upscaling creates soft look
  offscreen = new OffscreenCanvas(cols, rows)
  offCtx = offscreen.getContext('2d', { alpha: false })
}

function countNeighbors(x, y) {
  let count = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = (x + dx + cols) % cols
      const ny = (y + dy + rows) % rows
      count += grid[ny * cols + nx]
    }
  }
  return count
}

function dominantNeighborColor(x, y) {
  const counts = new Uint8Array(CELL_COLORS.length)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = (x + dx + cols) % cols
      const ny = (y + dy + rows) % rows
      const idx = ny * cols + nx
      if (grid[idx]) counts[colorGrid[idx]]++
    }
  }
  let best = 0
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[best]) best = i
  }
  return best
}

function step() {
  prevGrid.set(grid)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x
      const n = countNeighbors(x, y)
      const alive = grid[idx]
      if (alive) {
        next[idx] = (n === 2 || n === 3) ? 1 : 0
      } else {
        next[idx] = (n === 3) ? 1 : 0
        if (next[idx]) colorGrid[idx] = dominantNeighborColor(x, y)
      }
    }
  }
  const tmp = grid
  grid = next
  next = tmp
}

let stepCount = 0
function injectLife() {
  const cx = Math.floor(cols * (0.2 + Math.random() * 0.6))
  const cy = Math.floor(rows * (0.2 + Math.random() * 0.6))
  const color = Math.floor(Math.random() * CELL_COLORS.length)
  const patterns = [
    [[0,-1],[1,-1],[-1,0],[0,0],[0,1]],
    [[0,-1],[1,0],[-1,1],[0,1],[1,1]],
    [[0,0],[1,0],[2,0],[3,0],[0,-1],[3,-1],[3,-2],[0,-3],[2,-3]],
    [[-3,0],[-2,0],[-2,-2],[0,-1],[1,0],[2,0],[3,0]],
  ]
  const p = patterns[Math.floor(Math.random() * patterns.length)]
  for (const [dx, dy] of p) {
    const x = (cx + dx + cols) % cols
    const y = (cy + dy + rows) % rows
    const idx = y * cols + x
    grid[idx] = 1
    prevGrid[idx] = 1
    cellAlpha[idx] = 1
    colorGrid[idx] = color
  }
}

function render() {
  if (!ctx || !offCtx || !canvasEl.value) return
  const canvas = canvasEl.value
  const cw = canvas.width
  const ch = canvas.height

  // 1) Render cells at 1px each into the tiny offscreen canvas
  const imgData = offCtx.createImageData(cols, rows)
  const px = imgData.data
  for (let i = 0; i < cols * rows; i++) {
    const a = cellAlpha[i]
    if (a < 0.01) continue
    const c = CELL_COLORS[colorGrid[i]]
    const o = i * 4
    px[o]     = c[0] * a
    px[o + 1] = c[1] * a
    px[o + 2] = c[2] * a
    px[o + 3] = 255
  }
  offCtx.putImageData(imgData, 0, 0)

  // 2) Clear to black
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)

  // 3) Draw cells scaled up with blur for soft blobby look
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.filter = 'blur(2px)'
  ctx.drawImage(offscreen, 0, 0, cw, ch)
  ctx.restore()

  // 4) Clock on top
  const clockText = `${props.hours}:${props.minutes}`
  const fontSize = Math.floor(ch / 6)
  ctx.font = `200 ${fontSize}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.fillText(clockText, cw / 2, ch / 2)
}

let lastStepTime = 0
const STEP_INTERVAL = 500

function animate(time) {
  animFrameId = requestAnimationFrame(animate)

  const elapsed = time - lastStepTime
  const t = Math.min(1, elapsed / STEP_INTERVAL)

  // Smooth eased interpolation (ease-in-out)
  const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2

  const size = cols * rows
  for (let i = 0; i < size; i++) {
    const alive = grid[i]
    const wasAlive = prevGrid[i]
    if (alive && wasAlive) {
      cellAlpha[i] = 1
    } else if (alive && !wasAlive) {
      cellAlpha[i] = ease
    } else if (!alive && wasAlive) {
      cellAlpha[i] = 1 - ease
    }
    // dead cells: alpha stays at whatever the trail leaves
  }

  render()

  if (elapsed >= STEP_INTERVAL) {
    lastStepTime = time
    step()
    stepCount++
    if (stepCount % 200 === 0) injectLife()
  }
}

function handleResize() {
  if (!canvasEl.value) return
  const canvas = canvasEl.value
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(canvas.clientWidth * dpr)
  canvas.height = Math.floor(canvas.clientHeight * dpr)
  cols = Math.floor(canvas.width / CELL_PX)
  rows = Math.floor(canvas.height / CELL_PX)
  initGrid()
}

onMounted(() => {
  if (!canvasEl.value) return
  ctx = canvasEl.value.getContext('2d', { alpha: false })
  handleResize()
  window.addEventListener('resize', handleResize)
  lastStepTime = performance.now()
  animFrameId = requestAnimationFrame(animate)
})

onUnmounted(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <canvas ref="canvasEl" class="gol-canvas" />
</template>

<style scoped>
.gol-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
