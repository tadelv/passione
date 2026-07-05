// Final verification: measure heap using the actual patched code path.
// Imports normalizeShotSlim from src/, shallowRef + markRaw per useAllShotsCache.js.
//
// Usage:
//   node --expose-gc scratch/heap-measure-patched.mjs [N]

import { shallowRef, markRaw } from 'vue'
import { normalizeShotSlim } from '../src/composables/useShotNormalize.js'

const N = Number(process.argv[2] || 5000)

function makeFrame(i) {
  return {
    name: `frame${i}`, temperature: 93 + (i % 3) * 0.5, sensor: 'coffee',
    pump: i % 2 === 0 ? 'pressure' : 'flow', transition: 'smooth',
    pressure: 6 + (i % 4), flow: 2 + (i % 3) * 0.3, seconds: 5 + i, volume: 0,
    exit: { type: 'pressure_over', value: 9.0 },
    limiter: { value: 6, range: 0.6 }, index: i,
  }
}
function makeShot(id) {
  const frames = Array.from({ length: 30 }, (_, i) => makeFrame(i))
  return {
    id: `shot-${id}`, shotId: `shot-${id}`,
    timestamp: new Date(Date.now() - id * 60_000).toISOString(),
    duration: 28 + (id % 10),
    state: { state: 'espresso', substate: 'pouringDone' },
    workflow: {
      name: `Workflow ${id}`,
      profile: {
        title: `Profile ${id % 50}`, frames,
        legacy_profile_type: 'settings_2c',
      },
      context: {
        coffeeName: 'Ethiopia Yirgacheffe', coffeeRoaster: 'Some Roaster',
        grinderModel: 'Niche Zero', grinderId: `grinder-${id % 3}`,
        grinderSetting: '25', beanBatchId: `batch-${id % 20}`,
        targetDoseWeight: 18, targetYield: 36,
      },
      doseData: { doseIn: 18, doseOut: 36 },
      coffeeData: { name: 'Ethiopia Yirgacheffe', roaster: 'Some Roaster' },
      grinderData: { manufacturer: 'Niche', grinder: 'Zero', setting: '25' },
    },
    annotations: {
      enjoyment: 85, espressoNotes: 'Bright citrus, clean finish',
      actualDoseWeight: 18.1, actualYield: 35.8, drinkTds: 9.2, drinkEy: 20.1,
      extras: { barista: 'vid' },
    },
    metadata: { rating: 85, barista: 'vid' },
  }
}

function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1) }

function run() {
  const cache = shallowRef(null)
  const out = []
  // Mirror the patched useAllShotsCache flow: for each API item, slim + markRaw.
  for (let i = 0; i < N; i++) {
    out.push(markRaw(normalizeShotSlim(makeShot(i))))
  }
  cache.value = out
  // Simulate UI read of every row.
  let s = 0
  for (const shot of cache.value) s += shot.rating ?? 0
  return { cache, s }
}

const retained = run()
globalThis.__retained = retained

global.gc(); global.gc(); global.gc()
await new Promise(r => setTimeout(r, 50))
global.gc(); global.gc()

const m = process.memoryUsage()
console.log(`patched      N=${N}  heapUsed=${mb(m.heapUsed).padStart(7)} MB  rss=${mb(m.rss).padStart(7)} MB`)
