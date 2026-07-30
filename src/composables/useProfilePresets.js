/**
 * Quick-start frame presets for the (Advanced) profile editor.
 * Ported from the former phase-based Recipe editor: each preset is
 * authored as named phases (fill/bloom/infuse/ramp/pour/decline) for
 * readability, then flattened to raw frames at module load.
 */

const PHASE_ORDER = ['fill', 'bloom', 'infuse', 'ramp', 'pour', 'decline']
const PHASE_LABELS = {
  fill: 'Fill',
  bloom: 'Bloom',
  infuse: 'Infuse',
  ramp: 'Ramp',
  pour: 'Pour',
  decline: 'Decline',
}

function makePhase(overrides) {
  return {
    enabled: true,
    pump: 'pressure',
    target: 9.0,
    temperature: 93.0,
    seconds: 30,
    transition: 'fast',
    exitEnabled: false,
    exitType: 'pressure_over',
    exitValue: 0,
    limiterValue: 0,
    limiterRange: 0.6,
    ...overrides,
  }
}

const PRESET_DEFS = {
  classic: {
    name: 'Classic Espresso',
    description: '9 bar flat pressure, short preinfusion',
    temperature: 93.0,
    targetWeight: 36,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 4.0, seconds: 8, exitEnabled: true, exitType: 'pressure_over', exitValue: 4.0, limiterValue: 0 }),
      bloom:   makePhase({ enabled: false, pump: 'flow', target: 0, seconds: 0 }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ enabled: false, pump: 'pressure', target: 9.0, seconds: 0 }),
      pour:    makePhase({ pump: 'pressure', target: 9.0, seconds: 30, temperature: 93.0, limiterValue: 4.5 }),
      decline: makePhase({ enabled: false, pump: 'pressure', target: 6.0, seconds: 0 }),
    },
  },
  turbo: {
    name: 'Turbo Shot',
    description: 'High-flow, fast extraction',
    temperature: 90.0,
    targetWeight: 45,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 8.0, seconds: 5, exitEnabled: true, exitType: 'pressure_over', exitValue: 2.0, limiterValue: 4.0 }),
      bloom:   makePhase({ enabled: false, pump: 'flow', target: 0, seconds: 0 }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ enabled: false, pump: 'pressure', target: 6.0, seconds: 0 }),
      pour:    makePhase({ pump: 'flow', target: 4.5, seconds: 25, temperature: 90.0, limiterValue: 6.0 }),
      decline: makePhase({ enabled: false, pump: 'flow', target: 2.0, seconds: 0 }),
    },
  },
  blooming: {
    name: 'Blooming Espresso',
    description: 'Long preinfusion with bloom pause for light roasts',
    temperature: 95.0,
    targetWeight: 60,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 4.0, seconds: 5, exitEnabled: true, exitType: 'pressure_over', exitValue: 3.5 }),
      bloom:   makePhase({ pump: 'flow', target: 0, seconds: 30, temperature: 90.0, transition: 'fast' }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ pump: 'flow', target: 2.2, seconds: 5, temperature: 92.0, transition: 'smooth' }),
      pour:    makePhase({ pump: 'flow', target: 2.2, seconds: 20, temperature: 92.0, limiterValue: 8.6, limiterRange: 0.6 }),
      decline: makePhase({ enabled: false, pump: 'flow', target: 1.0, seconds: 0 }),
    },
  },
  allonge: {
    name: 'Allonge',
    description: 'Long blooming shot with high flow, 5:1 ratio',
    temperature: 95.0,
    targetWeight: 135,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 4.5, seconds: 5, exitEnabled: true, exitType: 'pressure_over', exitValue: 3.5 }),
      bloom:   makePhase({ pump: 'flow', target: 0, seconds: 30, temperature: 93.0 }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ pump: 'flow', target: 3.5, seconds: 7, temperature: 92.5, transition: 'smooth' }),
      pour:    makePhase({ pump: 'flow', target: 3.5, seconds: 60, temperature: 91.0, limiterValue: 8.6, limiterRange: 0.6 }),
      decline: makePhase({ enabled: false, pump: 'flow', target: 2.0, seconds: 0 }),
    },
  },
  lever: {
    name: 'Lever Style',
    description: 'Pressure ramp up then decline, mimicking spring lever machines',
    temperature: 93.0,
    targetWeight: 36,
    phases: {
      fill:    makePhase({ pump: 'flow', target: 4.0, seconds: 8, exitEnabled: true, exitType: 'pressure_over', exitValue: 3.0 }),
      bloom:   makePhase({ enabled: false, pump: 'flow', target: 0, seconds: 0 }),
      infuse:  makePhase({ enabled: false, pump: 'pressure', target: 3.0, seconds: 0 }),
      ramp:    makePhase({ pump: 'pressure', target: 9.0, seconds: 5, transition: 'smooth' }),
      pour:    makePhase({ pump: 'pressure', target: 9.0, seconds: 10 }),
      decline: makePhase({ pump: 'pressure', target: 4.0, seconds: 20, transition: 'smooth' }),
    },
  },
}

/**
 * Flatten a preset's named phases to raw frames, in fixed phase order,
 * skipping disabled phases. Each phase produces exactly one frame.
 */
function phasesToFrames(phases) {
  const frames = []

  for (const key of PHASE_ORDER) {
    const p = phases[key]
    if (!p || !p.enabled) continue

    const frame = {
      name: PHASE_LABELS[key],
      temperature: p.temperature,
      sensor: 'coffee',
      pump: p.pump,
      transition: p.transition || 'fast',
      pressure: p.pump === 'pressure' ? p.target : 0,
      flow: p.pump === 'flow' ? p.target : 0,
      seconds: p.seconds,
      volume: 0,
      exit_if: p.exitEnabled || false,
      exit_type: p.exitType || 'pressure_over',
      exit_pressure_over: 0,
      exit_pressure_under: 0,
      exit_flow_over: 6,
      exit_flow_under: 0,
      exit_weight: 0,
      max_flow_or_pressure: p.limiterValue || 0,
      max_flow_or_pressure_range: p.limiterRange || 0.6,
    }

    if (p.exitEnabled) {
      switch (p.exitType) {
        case 'pressure_over': frame.exit_pressure_over = p.exitValue; break
        case 'pressure_under': frame.exit_pressure_under = p.exitValue; break
        case 'flow_over': frame.exit_flow_over = p.exitValue; break
        case 'flow_under': frame.exit_flow_under = p.exitValue; break
        case 'weight': frame.exit_weight = p.exitValue; break
      }
    }

    frames.push(frame)
  }

  return frames
}

export const PROFILE_PRESETS = Object.entries(PRESET_DEFS).map(([key, preset]) => ({
  key,
  name: preset.name,
  description: preset.description,
  temperature: preset.temperature,
  targetWeight: preset.targetWeight,
  frames: phasesToFrames(preset.phases),
}))
