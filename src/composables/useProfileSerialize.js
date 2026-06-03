/**
 * Profile serialization between the editors' internal "flat frame" format
 * (a de1app/TCL-derived shape) and the ReaPrime/REA v2 profile format.
 *
 * Why this exists: REA's `Profile.fromJson` (vendor/reaprime/.../profile.dart)
 * is strict —
 *   - top-level array key is `steps` (NOT `frames`); `(json['steps'] as List)`
 *     is a non-null cast, so a missing key 500s.
 *   - each step needs `pump` ('pressure'|'flow') as the discriminator, plus the
 *     matching `pressure`/`flow` target, `transition` ('fast'|'smooth'),
 *     `sensor` ('coffee'|'water'), and OPTIONAL nested `exit:{type,condition,value}`
 *     and `limiter:{value,range}`.
 * The Advanced and Recipe(phase) editors author a flat frame instead
 * (`exit_if`, `exit_type:'pressure_over'`, `exit_pressure_over`,
 * `max_flow_or_pressure`, …). These converters bridge the two so save/upload
 * produce valid REA profiles and load restores exit/limiter data the flat
 * getters would otherwise drop.
 *
 * The Simple editor (useSimpleProfile.js) already emits REA `steps` directly and
 * does not go through here.
 */

function num(v, fallback = 0) {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : fallback
}

function normTransition(t) {
  return t === 'smooth' ? 'smooth' : 'fast'
}

function normSensor(s) {
  return s === 'water' ? 'water' : 'coffee'
}

function normPump(p) {
  return p === 'flow' ? 'flow' : 'pressure'
}

/**
 * Flat editor frame -> REA step.
 *
 * Accepts both the editors' flat frame (has `exit_if`/`exit_type`/`exit_*`,
 * `max_flow_or_pressure`) and an already-REA step (nested `exit`/`limiter`),
 * so it is safe to run over a mixed/already-normalized array.
 */
export function frameToStep(f) {
  const step = {
    name: f.name || '',
    pump: normPump(f.pump),
    transition: normTransition(f.transition),
    sensor: normSensor(f.sensor),
    temperature: num(f.temperature, 93),
    seconds: num(f.seconds, 0),
    volume: num(f.volume, 0),
    pressure: num(f.pressure, 0),
    flow: num(f.flow, 0),
  }

  // Per-step stop weight is carried through independently of the exit selector
  // (the flat editor's single-select exit can't show a pressure exit AND a
  // weight at once, but REA allows both — so never drop it).
  let weight = num(f.weight, 0)

  // --- exit ---
  if ('exit_if' in f || 'exit_type' in f) {
    // flat editor format
    if (f.exit_if) {
      const et = f.exit_type || 'pressure_over'
      if (et === 'weight') {
        weight = num(f.exit_weight, weight)
      } else {
        const [type, condition] = et.split('_')
        step.exit = {
          type: type === 'flow' ? 'flow' : 'pressure',
          condition: condition === 'under' ? 'under' : 'over',
          value: num(f[`exit_${et}`], 0),
        }
      }
    }
  } else if (f.exit && typeof f.exit === 'object') {
    // already-REA nested exit
    step.exit = {
      type: f.exit.type === 'flow' ? 'flow' : 'pressure',
      condition: f.exit.condition === 'under' ? 'under' : 'over',
      value: num(f.exit.value, 0),
    }
  }

  if (weight > 0) step.weight = weight

  // --- limiter ---
  if ('max_flow_or_pressure' in f) {
    const lv = num(f.max_flow_or_pressure, 0)
    if (lv > 0) {
      step.limiter = { value: lv, range: num(f.max_flow_or_pressure_range, 0.6) }
    }
  } else if (f.limiter && typeof f.limiter === 'object') {
    step.limiter = {
      value: num(f.limiter.value, 0),
      range: num(f.limiter.range, 0.6),
    }
  }

  return step
}

/**
 * REA step -> flat editor frame (load path). Surfaces nested exit/limiter into
 * the flat fields the Advanced/Recipe editors bind to. Always carries `weight`
 * through so a later frameToStep can restore it.
 */
export function stepToFrame(s) {
  const frame = {
    name: s.name || '',
    temperature: num(s.temperature, 93),
    sensor: normSensor(s.sensor),
    pump: normPump(s.pump),
    transition: normTransition(s.transition),
    pressure: num(s.pressure, 0),
    flow: num(s.flow, 0),
    seconds: num(s.seconds, 0),
    volume: num(s.volume, 0),
    weight: num(s.weight, 0),
    exit_if: false,
    exit_type: 'pressure_over',
    exit_pressure_over: 0,
    exit_pressure_under: 0,
    exit_flow_over: 0,
    exit_flow_under: 0,
    exit_weight: 0,
    max_flow_or_pressure: 0,
    max_flow_or_pressure_range: 0.6,
  }

  if (s.exit && typeof s.exit === 'object' && s.exit.type && s.exit.condition) {
    const type = s.exit.type === 'flow' ? 'flow' : 'pressure'
    const condition = s.exit.condition === 'under' ? 'under' : 'over'
    const et = `${type}_${condition}`
    frame.exit_if = true
    frame.exit_type = et
    frame[`exit_${et}`] = num(s.exit.value, 0)
  } else if (num(s.weight, 0) > 0) {
    // No pressure/flow exit but a stop weight — show it as a weight exit.
    frame.exit_if = true
    frame.exit_type = 'weight'
    frame.exit_weight = num(s.weight, 0)
  }

  if (s.limiter && typeof s.limiter === 'object') {
    frame.max_flow_or_pressure = num(s.limiter.value, 0)
    frame.max_flow_or_pressure_range = num(s.limiter.range, 0.6)
  }

  return frame
}

/**
 * Assemble a complete REA v2 profile payload (with `steps`) from an editor's
 * internal profile object. `internal.frames` (flat) or `internal.steps` is
 * accepted; every entry is normalized through frameToStep.
 */
export function buildReaProfile(internal = {}) {
  const rawFrames = internal.frames || internal.steps || []
  return {
    version: internal.version || '2',
    title: internal.title || 'Untitled',
    author: internal.author || '',
    notes: internal.notes || '',
    beverage_type: internal.beverage_type || 'espresso',
    steps: rawFrames.map(frameToStep),
    target_weight: num(internal.target_weight, 0),
    target_volume: num(internal.target_volume, 0),
    target_volume_count_start: num(internal.target_volume_count_start, 0),
    tank_temperature: num(internal.tank_temperature, 0),
  }
}

/**
 * REA profile record's `.profile` -> editor-internal object with flat `frames`.
 * Top-level presentation/target fields pass through; `steps` become flat frames.
 */
export function reaProfileToInternal(profile = {}) {
  const steps = profile.steps || profile.frames || []
  return {
    ...profile,
    frames: steps.map(stepToFrame),
    steps: undefined,
  }
}
