// Heap measurement harness. One scenario per process — avoids cumulative bias.
//
// Usage:
//   node --expose-gc scratch/heap-measure.mjs <scenario> [N]
//   scenarios: raw | refFull | shallowSlim | shallowFull

import { ref, shallowRef, markRaw } from 'vue'
import { normalizeShot } from '../src/composables/useShotNormalize.js'

const scenario = process.argv[2] || 'raw'
const N = Number(process.argv[3] || 5000)

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
        title: `Profile ${id % 50}`, id: `profile-${id % 50}`, author: 'Test',
        reference_file: 'test.tcl', target_weight: 36, target_volume: 0,
        target_volume_count_start: 0, tank_temperature: 0, hidden: false,
        type: 'advanced', beverage_type: 'espresso',
        legacy_profile_type: 'settings_2c', frames,
        final_desired_shot_weight: 36, final_desired_shot_volume: 0,
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

const SUMMARY_KEYS = [
  'id', 'shotId', 'timestamp', 'duration',
  'doseIn', 'doseOut', 'finalWeight', 'targetYield',
  'coffeeName', 'coffeeRoaster', 'grinderModel', 'grinderSetting',
  'grinderId', 'beanBatchId', 'profileName',
  'rating', 'notes', 'tds', 'ey', 'barista',
]
function slim(shot) {
  const full = normalizeShot(shot)
  const out = {}
  for (const k of SUMMARY_KEYS) out[k] = full[k] ?? null
  if (full.profile) out.profile = markRaw(full.profile)
  return out
}

// No-profile variant: drops the profile object entirely. Caller must refetch
// the profile on Load — tradeoff is one extra GET on action, big memory save.
function slimNoProfile(shot) {
  const full = normalizeShot(shot)
  const out = {}
  for (const k of SUMMARY_KEYS) out[k] = full[k] ?? null
  return out
}

function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1) }

// Build records. Captured in a function so `raw` can be fully released
// once the scenario has produced its retained object (mirrors real flow —
// the API response is not held alongside the cache).
function build() {
  return Array.from({ length: N }, (_, i) => makeShot(i))
}

// Wrap each scenario so `raw` & intermediates escape scope before we measure.
function runScenario(name) {
  if (name === 'raw') {
    const raw = build()
    return raw.map(normalizeShot)
  }
  if (name === 'refFull') {
    const raw = build()
    const cache = ref(null)
    cache.value = raw.map(normalizeShot)
    let s = 0
    for (const shot of cache.value) {
      s += shot.rating ?? 0
      if (shot.profile?.frames) for (const f of shot.profile.frames) s += f.seconds
    }
    return { cache, s }
  }
  if (name === 'shallowSlim') {
    const raw = build()
    const cache = shallowRef(null)
    cache.value = raw.map(slim).map(markRaw)
    let s = 0
    for (const shot of cache.value) {
      s += shot.rating ?? 0
      if (shot.profile?.frames) for (const f of shot.profile.frames) s += f.seconds
    }
    return { cache, s }
  }
  if (name === 'shallowFull') {
    const raw = build()
    const cache = shallowRef(null)
    cache.value = raw.map(normalizeShot).map(markRaw)
    let s = 0
    for (const shot of cache.value) {
      s += shot.rating ?? 0
      if (shot.profile?.frames) for (const f of shot.profile.frames) s += f.seconds
    }
    return { cache, s }
  }
  if (name === 'shallowSlimNoProfile') {
    const raw = build()
    const cache = shallowRef(null)
    cache.value = raw.map(slimNoProfile).map(markRaw)
    let s = 0
    for (const shot of cache.value) s += shot.rating ?? 0
    return { cache, s }
  }
  return null
}

let retained
if (scenario === 'slimOnly') {
  // Isolation check: build slim objects directly, no raw array, no normalizeShot.
  // If this is dramatically smaller than shallowSlimNoProfile, something is
  // still retaining the raw/normalized intermediates.
  const cache = shallowRef(null)
  cache.value = Array.from({ length: N }, (_, id) => markRaw({
    id: `shot-${id}`,
    shotId: `shot-${id}`,
    timestamp: new Date(Date.now() - id * 60_000).toISOString(),
    duration: 28 + (id % 10),
    doseIn: 18, doseOut: 36, finalWeight: 35.8, targetYield: 36,
    coffeeName: 'Ethiopia Yirgacheffe', coffeeRoaster: 'Some Roaster',
    grinderModel: 'Niche Zero', grinderSetting: '25',
    grinderId: `grinder-${id % 3}`, beanBatchId: `batch-${id % 20}`,
    profileName: `Profile ${id % 50}`,
    rating: 85, notes: 'Bright citrus, clean finish',
    tds: 9.2, ey: 20.1, barista: 'vid',
  }))
  let s = 0
  for (const shot of cache.value) s += shot.rating ?? 0
  retained = { cache, s }
} else {
  retained = runScenario(scenario)
  if (!retained) {
    console.error(`Unknown scenario: ${scenario}`)
    process.exit(1)
  }
}

globalThis.__retained = retained

global.gc(); global.gc(); global.gc()
await new Promise(r => setTimeout(r, 50))
global.gc(); global.gc()

const m = process.memoryUsage()
console.log(`${scenario.padEnd(14)} N=${N}  heapUsed=${mb(m.heapUsed).padStart(7)} MB  rss=${mb(m.rss).padStart(7)} MB  external=${mb(m.external).padStart(5)} MB`)
