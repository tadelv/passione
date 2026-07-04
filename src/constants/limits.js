/**
 * Physical and practical limits for DE1 + Bengle espresso machines.
 *
 * Sources:
 * - DE1 hardware: pump max ~8 mL/s, pressure ceiling ~10.5 bar
 * - Bengle (upcoming): higher flow capability — flow values allow up to 25 mL/s
 * - de1app QML editors (vendor/decenza): from/to ranges in ValueInput.qml
 * - Streamline-Bridge API: vendor/reaprime/assets/api/rest_v1.yml
 * - Bundled default profiles: vendor/reaprime/assets/defaultProfiles/
 *
 * ALL ValueInput :min and :max props should import from this file.
 * Never hardcode numeric limits in templates.
 */

export const LIMITS = {
  // Temperature (°C)
  temp: {
    brewMin: 0,          // open range — experimental cold profiles, declining temp steps
    brewMax: 100,        // boiling point ceiling; pour-over profiles use 100
    steamMin: 135,       // useful steam starts above boiling
    steamMax: 170,
    hotWaterMin: 40,
    hotWaterMax: 100,
  },

  // Pressure (bar)
  pressure: {
    min: 0,
    max: 12,             // DE1 physical max ~10.5; 12 allows headroom
    limiterMin: 0,       // pressure limiter on flow-pump steps
    limiterMax: 12,
    exitMin: 0,
    exitMax: 12,
    preinfusionExitMin: 0.5,
    preinfusionExitMax: 8,
  },

  // Flow (mL/s)
  flow: {
    min: 0,
    max: 25,             // Bengle future-proofing (DE1 pump max ~8)
    limiterMin: 0,       // flow limiter on pressure-pump steps
    limiterMax: 25,
    exitMin: 0,
    exitMax: 25,
    preinfusionMin: 1,
    preinfusionMax: 25,
    steamMin: 0.4,
    steamMax: 2.5,
    flushMin: 2,
    flushMax: 10,        // flush is cleaning, not extraction — practical cap
  },

  // Weight (g)
  weight: {
    doseMin: 0,
    doseMax: 100,        // batch brews can use 50+ g
    yieldMin: 0,
    yieldMax: 500,
    targetMin: 0,
    targetMax: 500,
    exitMin: 0,
    exitMax: 500,        // pour-over targets can exceed 100
    recommendedDoseMin: 0,
    recommendedDoseMax: 100,
    hotWaterMin: 20,
    hotWaterMax: 500,
    basketMin: 7,
    basketMax: 22,
  },

  // Volume (mL)
  volume: {
    min: 0,
    max: 500,
  },

  // Duration (s)
  duration: {
    stepMin: 0,
    stepMax: 120,
    steamMin: 1,
    steamMax: 120,
    flushMin: 1,
    flushMax: 30,
  },

  // Ratio
  ratio: {
    min: 0.5,
    max: 10,
  },

  // Limiter range (bar or mL/s — depends on pump mode)
  limiterRange: {
    min: 0.1,
    max: 2.0,
  },

  // Grinder RPM
  rpm: {
    min: 50,
    max: 3000,
  },
}