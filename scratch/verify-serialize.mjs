// Round-trip check: real REA default profile -> internal frames -> REA steps.
// Asserts execution-relevant fields survive. Run: node scratch/verify-serialize.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { stepToFrame, frameToStep, buildReaProfile, reaProfileToInternal } from '../src/composables/useProfileSerialize.js'

const dir = 'vendor/reaprime/assets/defaultProfiles'
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !/manifest/i.test(f))

const n = (v) => (typeof v === 'string' ? parseFloat(v) : v) || 0
let checked = 0, stepCount = 0, fails = 0
const fail = (msg) => { console.error('  FAIL:', msg); fails++ }

for (const file of files) {
  let profile
  try { profile = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) } catch { continue }
  if (!Array.isArray(profile.steps)) continue
  checked++

  const internal = reaProfileToInternal(profile)
  const rebuilt = buildReaProfile({ ...internal, target_volume_count_start: profile.target_volume_count_start })

  if (rebuilt.steps.length !== profile.steps.length)
    fail(`${file}: step count ${profile.steps.length} -> ${rebuilt.steps.length}`)

  profile.steps.forEach((orig, i) => {
    stepCount++
    const out = rebuilt.steps[i]
    if (!out) return fail(`${file}#${i}: missing rebuilt step`)
    const checkNum = (k) => {
      if (Math.abs(n(orig[k]) - n(out[k])) > 1e-6) fail(`${file}#${i}.${k}: ${orig[k]} -> ${out[k]}`)
    }
    if (normPump(orig.pump) !== out.pump) fail(`${file}#${i}.pump: ${orig.pump} -> ${out.pump}`)
    if ((orig.transition === 'smooth' ? 'smooth' : 'fast') !== out.transition) fail(`${file}#${i}.transition`)
    if ((orig.sensor === 'water' ? 'water' : 'coffee') !== out.sensor) fail(`${file}#${i}.sensor`)
    checkNum('temperature'); checkNum('seconds'); checkNum('volume')
    if (out.pump === 'pressure') checkNum('pressure'); else checkNum('flow')

    // exit
    if (orig.exit) {
      if (!out.exit) fail(`${file}#${i}: exit dropped`)
      else {
        if (orig.exit.type !== out.exit.type) fail(`${file}#${i}.exit.type`)
        if (orig.exit.condition !== out.exit.condition) fail(`${file}#${i}.exit.condition`)
        if (Math.abs(n(orig.exit.value) - n(out.exit.value)) > 1e-6) fail(`${file}#${i}.exit.value`)
      }
    } else if (out.exit) {
      // allowed only if orig carried a stop weight surfaced as a weight-exit
      if (!(n(orig.weight) > 0)) fail(`${file}#${i}: spurious exit ${JSON.stringify(out.exit)}`)
    }

    // limiter (value 0 == "no limit"; intentionally dropped to none)
    if (orig.limiter && n(orig.limiter.value) > 0) {
      if (!out.limiter) fail(`${file}#${i}: limiter dropped`)
      else {
        if (Math.abs(n(orig.limiter.value) - n(out.limiter.value)) > 1e-6) fail(`${file}#${i}.limiter.value`)
        if (Math.abs(n(orig.limiter.range) - n(out.limiter.range)) > 1e-6) fail(`${file}#${i}.limiter.range`)
      }
    } else if (out.limiter) fail(`${file}#${i}: spurious limiter`)
  })

  // top-level
  if (Math.abs(n(profile.tank_temperature) - n(rebuilt.tank_temperature)) > 1e-6) fail(`${file}: tank_temperature`)
  if (Math.abs(n(profile.target_weight) - n(rebuilt.target_weight)) > 1e-6) fail(`${file}: target_weight`)
}

function normPump(p) { return p === 'flow' ? 'flow' : 'pressure' }

// --- forward: flat editor frame (createDefaultFrame style) -> REA step ---
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`forward: ${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }
{
  const flat = {
    name: 'Infusion', temperature: 92, sensor: 'coffee', pump: 'pressure',
    transition: 'smooth', pressure: 9, flow: 2, seconds: 25, volume: 0,
    exit_if: true, exit_type: 'flow_under', exit_pressure_over: 0,
    exit_flow_under: 1.5, exit_weight: 0,
    max_flow_or_pressure: 8, max_flow_or_pressure_range: 0.6,
  }
  const s = frameToStep(flat)
  eq(s.pump, 'pressure', 'pump'); eq(s.transition, 'smooth', 'transition')
  eq(s.pressure, 9, 'pressure'); eq(s.exit, { type: 'flow', condition: 'under', value: 1.5 }, 'exit')
  eq(s.limiter, { value: 8, range: 0.6 }, 'limiter')
  if ('exit_if' in s || 'exit_type' in s) fail('forward: flat exit keys leaked into REA step')

  // weight exit -> step.weight, no exit
  const w = frameToStep({ ...flat, exit_type: 'weight', exit_weight: 21 })
  eq(w.weight, 21, 'weight'); if (w.exit) fail('forward: weight-exit must not produce exit')

  // disabled exit -> no exit
  const d = frameToStep({ ...flat, exit_if: false })
  if (d.exit) fail('forward: exit_if=false must drop exit')
}

console.log(`Checked ${checked} profiles, ${stepCount} steps. Failures: ${fails}`)
process.exit(fails ? 1 : 0)
