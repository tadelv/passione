/**
 * Pure functions for simple profile editing (settings_2a pressure / settings_2b flow).
 * Extracts params from profile JSON, generates frames, and builds API payloads.
 */

export const SIMPLE_PRESSURE_DEFAULTS = {
  espresso_temperature: 93.0,
  preinfusion_time: 20,
  preinfusion_flow_rate: 8.0,
  preinfusion_stop_pressure: 4.0,
  espresso_hold_time: 10,
  espresso_pressure: 8.4,
  maximum_flow: 3.5,
  maximum_flow_range_advanced: 0.6,
  espresso_decline_time: 30,
  pressure_end: 6.0,
  target_weight: 36,
  recommended_dose: 18,
  temperature_presets: [93, 93, 93, 93],
  temp_steps_enabled: false,
}

export const SIMPLE_FLOW_DEFAULTS = {
  espresso_temperature: 92.0,
  preinfusion_time: 10,
  preinfusion_flow_rate: 2.5,
  preinfusion_stop_pressure: 4.0,
  flow_profile_hold: 2.2,
  flow_profile_hold_time: 10,
  maximum_pressure: 0,
  maximum_pressure_range_advanced: 0.6,
  flow_profile_decline: 1.0,
  flow_profile_decline_time: 30,
  target_weight: 36,
  recommended_dose: 18,
  temperature_presets: [92, 92, 92, 92],
  temp_steps_enabled: false,
}

function pick(obj, keys) {
  const result = {}
  for (const k of keys) {
    if (obj != null && k in obj) result[k] = obj[k]
  }
  return result
}

export function isSimpleProfile(profile) {
  const t = profile?.legacy_profile_type || profile?.profile_type || ''
  return t === 'settings_2a' || t === 'settings_2b'
}

export function isSimpleFlow(profile) {
  const t = profile?.legacy_profile_type || profile?.profile_type || ''
  return t === 'settings_2b'
}

/**
 * Extract editor params from a raw profile JSON.
 */
export function extractSimpleParams(profile, isFlow) {
  const defaults = isFlow ? SIMPLE_FLOW_DEFAULTS : SIMPLE_PRESSURE_DEFAULTS
  const extracted = pick(profile, Object.keys(defaults))
  // Ensure temperature_presets is always an array of 4
  if (!Array.isArray(extracted.temperature_presets) || extracted.temperature_presets.length < 4) {
    const t = extracted.espresso_temperature ?? defaults.espresso_temperature
    extracted.temperature_presets = [t, t, t, t]
  }
  return { ...defaults, ...extracted }
}

function makeFrame({ pump, value, temperature, seconds, transition = 'fast', sensor = 'coffee', volume = 0, exit, limiter }) {
  const frame = {
    pump,
    temperature,
    seconds,
    transition,
    sensor,
    volume,
  }
  if (pump === 'pressure') {
    frame.pressure = value
    frame.flow = 8.0
  } else {
    frame.flow = value
    frame.pressure = 1.0
  }
  if (exit) frame.exit = exit
  if (limiter) frame.limiter = limiter
  return frame
}

/**
 * Generate profile frames from simple params.
 */
export function generateSimpleFrames(params, isFlow) {
  const temps = params.temp_steps_enabled ? params.temperature_presets : null
  const globalTemp = params.espresso_temperature

  const frames = []

  // Frame 0: Preinfusion
  if (params.preinfusion_time > 0) {
    frames.push(makeFrame({
      pump: 'flow',
      value: isFlow ? params.preinfusion_flow_rate : params.preinfusion_flow_rate,
      temperature: temps?.[1] ?? globalTemp,
      seconds: params.preinfusion_time,
      transition: 'fast',
      volume: 100,
      exit: {
        type: 'pressure',
        condition: 'over',
        value: params.preinfusion_stop_pressure,
      },
      limiter: { value: 0, range: 0.6 },
    }))
  }

  // Frame 1: Hold (pressure) or Hold (flow)
  const holdTime = isFlow ? params.flow_profile_hold_time : params.espresso_hold_time
  if (holdTime > 0) {
    if (isFlow) {
      frames.push(makeFrame({
        pump: 'flow',
        value: params.flow_profile_hold,
        temperature: temps?.[2] ?? globalTemp,
        seconds: holdTime,
        transition: 'fast',
        limiter: params.maximum_pressure > 0
          ? { value: params.maximum_pressure, range: params.maximum_pressure_range_advanced }
          : undefined,
      }))
    } else {
      frames.push(makeFrame({
        pump: 'pressure',
        value: params.espresso_pressure,
        temperature: temps?.[2] ?? globalTemp,
        seconds: holdTime,
        transition: 'fast',
        limiter: params.maximum_flow > 0
          ? { value: params.maximum_flow, range: params.maximum_flow_range_advanced }
          : undefined,
      }))
    }
  }

  // Frame 2: Decline
  const declineTime = isFlow ? params.flow_profile_decline_time : params.espresso_decline_time
  if (declineTime > 0) {
    if (isFlow) {
      frames.push(makeFrame({
        pump: 'flow',
        value: params.flow_profile_decline,
        temperature: temps?.[3] ?? globalTemp,
        seconds: declineTime,
        transition: 'smooth',
        limiter: params.maximum_pressure > 0
          ? { value: params.maximum_pressure, range: params.maximum_pressure_range_advanced }
          : undefined,
      }))
    } else {
      frames.push(makeFrame({
        pump: 'pressure',
        value: params.pressure_end,
        temperature: temps?.[3] ?? globalTemp,
        seconds: declineTime,
        transition: 'smooth',
        limiter: params.maximum_flow > 0
          ? { value: params.maximum_flow, range: params.maximum_flow_range_advanced }
          : undefined,
      }))
    }
  }

  return frames
}

/**
 * Build a complete profile payload for the API.
 */
export function buildProfileFromParams(params, isFlow, meta = {}) {
  const steps = generateSimpleFrames(params, isFlow)
  return {
    title: meta.title || 'Untitled',
    author: meta.author || '',
    notes: meta.notes || '',
    beverage_type: 'espresso',
    legacy_profile_type: isFlow ? 'settings_2b' : 'settings_2a',
    version: '2',
    mode: 'frame_based',
    target_weight: params.target_weight,
    target_volume: 0,
    number_of_preinfuse_frames: params.preinfusion_time > 0 ? 1 : 0,
    ...params,
    steps,
  }
}
