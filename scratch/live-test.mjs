// Live profile API round-trip against a real gateway.
// Imports the PURE serializer; replicates persistProfile's HTTP policy inline
// (rest.js uses relative fetch paths that don't resolve under Node).
// Usage: GATEWAY=http://m50mini.home:8080 node scratch/live-test.mjs
import { buildReaProfile, reaProfileToInternal } from '../src/composables/useProfileSerialize.js'

const G = process.env.GATEWAY || 'http://m50mini.home:8080'
const api = `${G}/api/v1`
const created = []
let fails = 0
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}: ${m}`); if (!c) fails++ }
const n = (v) => (typeof v === 'string' ? parseFloat(v) : v) || 0

async function jget(p) { const r = await fetch(`${api}${p}`); if (!r.ok) throw new Error(`GET ${p} ${r.status}`); return r.json() }
async function jsend(p, method, body) {
  const r = await fetch(`${api}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const text = await r.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status: r.status, data }
}

// persistProfile policy, inline
async function persist(reaProfile, record) {
  const isDefault = record?.isDefault === true
  const id = record?.id
  if (id && !isDefault) return jsend(`/profiles/${encodeURIComponent(id)}`, 'PUT', { profile: reaProfile })
  const body = { profile: reaProfile }
  if (isDefault && id) body.parentId = id
  return jsend('/profiles', 'POST', body)
}

const list = await jget('/profiles?visibility=visible')
const records = Array.isArray(list) ? list : (list.records || [])
const aDefault = records.find((r) => r.isDefault)

// --- Test 1: create from a default's internal->REA round-trip ---
console.log('\n[1] Create from default round-trip (buildReaProfile)')
{
  const internal = reaProfileToInternal(aDefault.profile)
  const payload = buildReaProfile({ ...internal, title: 'ZZ live-test create', target_volume_count_start: aDefault.profile.target_volume_count_start })
  const { status, data } = await jsend('/profiles', 'POST', { profile: payload })
  ok(status === 201 || status === 200, `POST status ${status}`)
  ok(data?.id?.startsWith('profile:'), `got id ${data?.id}`)
  ok(data?.profile?.steps?.length === aDefault.profile.steps.length, `step count ${data?.profile?.steps?.length} == ${aDefault.profile.steps.length}`)
  if (data?.id) created.push(data.id)
}

// --- Test 2: fork a default (parentId), execution unchanged-ish but title differs ---
console.log('\n[2] Fork a default (persist with isDefault record -> POST + parentId)')
{
  const internal = reaProfileToInternal(aDefault.profile)
  const payload = buildReaProfile({ ...internal, title: 'ZZ live-test fork', target_volume_count_start: aDefault.profile.target_volume_count_start })
  // mutate a step so the content hash differs from the default (else dedupe returns the default id)
  payload.steps[0].temperature = n(payload.steps[0].temperature) + 0.5
  const { status, data } = await persist(payload, aDefault)
  ok(status === 201 || status === 200, `POST status ${status}`)
  ok(data?.isDefault === false, `child isDefault=${data?.isDefault}`)
  ok(data?.parentId === aDefault.id, `parentId ${data?.parentId} == ${aDefault.id}`)
  if (data?.id) created.push(data.id)
}

// --- Test 3: flat editor frame (Advanced editor shape) -> create, verify nested exit/limiter ---
console.log('\n[3] Flat editor frame -> REA create (exit/limiter mapping)')
let flatId
{
  const flatProfile = {
    title: 'ZZ live-test flat', author: '', notes: '', beverage_type: 'espresso',
    target_weight: 36, target_volume: 0,
    frames: [
      { name: 'Preinfusion', temperature: 90, sensor: 'coffee', pump: 'flow', transition: 'fast',
        pressure: 1, flow: 4, seconds: 10, volume: 0,
        exit_if: true, exit_type: 'pressure_over', exit_pressure_over: 4, exit_weight: 0,
        max_flow_or_pressure: 0, max_flow_or_pressure_range: 0.6 },
      { name: 'Extraction', temperature: 92, sensor: 'coffee', pump: 'pressure', transition: 'smooth',
        pressure: 9, flow: 2, seconds: 25, volume: 0,
        exit_if: false, exit_type: 'pressure_over', exit_weight: 0,
        max_flow_or_pressure: 8, max_flow_or_pressure_range: 0.6 },
    ],
  }
  const payload = buildReaProfile(flatProfile)
  const { status, data } = await jsend('/profiles', 'POST', { profile: payload })
  ok(status === 201 || status === 200, `POST status ${status}`)
  const s0 = data?.profile?.steps?.[0]
  const s1 = data?.profile?.steps?.[1]
  ok(s0?.pump === 'flow' && n(s0?.flow) === 4, `step0 flow pump (${s0?.pump}, flow=${s0?.flow})`)
  ok(s0?.exit && s0.exit.type === 'pressure' && s0.exit.condition === 'over' && n(s0.exit.value) === 4, `step0 nested exit ${JSON.stringify(s0?.exit)}`)
  ok(s1?.pump === 'pressure' && !s1?.exit, `step1 pressure, no exit`)
  ok(s1?.limiter && n(s1.limiter.value) === 8, `step1 limiter ${JSON.stringify(s1?.limiter)}`)
  if (data?.id) { created.push(data.id); flatId = data.id }
}

// --- Test 4: update a user profile with execution change -> new content-hash id ---
console.log('\n[4] Update user profile, execution change -> new id')
if (flatId) {
  const rec = await jget(`/profiles/${encodeURIComponent(flatId)}`)
  const internal = reaProfileToInternal(rec.profile)
  internal.frames[1].pressure = 7.5 // execution change
  const payload = buildReaProfile(internal)
  const { status, data } = await persist(payload, rec)
  ok(status === 200 || status === 201, `PUT status ${status}`)
  ok(data?.id && data.id !== flatId, `id changed ${flatId} -> ${data?.id}`)
  ok(n(data?.profile?.steps?.[1]?.pressure) === 7.5, `pressure updated to ${data?.profile?.steps?.[1]?.pressure}`)
  if (data?.id && data.id !== flatId) created.push(data.id)
}

// --- Cleanup: purge everything we created ---
console.log('\n[cleanup] purging test profiles')
for (const id of created) {
  const r = await fetch(`${api}/profiles/${encodeURIComponent(id)}/purge`, { method: 'DELETE' })
  console.log(`  purge ${id}: ${r.status}`)
}

console.log(`\nFailures: ${fails}`)
process.exit(fails ? 1 : 0)
