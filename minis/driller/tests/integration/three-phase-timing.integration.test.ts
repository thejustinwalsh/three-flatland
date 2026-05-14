import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface PhaseQuantiles {
  n: number
  p50: number
  p95: number
  min: number
  max: number
  avg: number
}

interface ThreePhaseResult {
  totalCellsObserved: number
  precariousToSagging: PhaseQuantiles
  saggingToShaking: PhaseQuantiles
  shakingToRelease: PhaseQuantiles
}

/** Symmetric allowed deviation per phase (ms). Use only for phases
 * with no deferral mechanism. PRECARIOUS / SHAKING boundaries are
 * tight; SAGGING→SHAKING has a legitimate one-sided extension when
 * the commit gate defers (see assertPhaseUpperBound). */
const TIMING_TOLERANCE_MS = 60
// Diffusion-model sag timing (see src/constants.ts):
//   PRECARIOUS = 12t = 200ms (invisible commit beat — gradient leads)
//   SAGGING    = 30t = 500ms (heavy darken)
//   SHAKING    = 30t = 500ms (jitter + narrow-escape window)
const TARGET_PRECARIOUS_MS = 200
const TARGET_SAGGING_MS = 500
const TARGET_SHAKING_MS = 500
/**
 * Upper bound for SAGGING→SHAKING. The SHAKE-entry commit gate in
 * `tickSagging` defers by 6 ticks (~100ms) when the release area has
 * an in-flight conflict — and deferrals can stack across cascades.
 * Wider one-sided tolerance accounts for this without softening the
 * p50 floor.
 */
const SAGGING_UPPER_BOUND_MS = TARGET_SAGGING_MS + 200

function assertPhaseP50(label: string, p50: number, target: number, log: string): void {
  const lo = target - TIMING_TOLERANCE_MS
  const hi = target + TIMING_TOLERANCE_MS
  if (p50 < lo || p50 > hi) {
    throw new Error(
      `Phase "${label}" p50 = ${p50}ms, expected ${target}ms ±${TIMING_TOLERANCE_MS}ms ([${lo}, ${hi}]).\n` +
        `Likely causes:\n` +
        `  - simulation tick rate drift (see Scene.tsx fixed-timestep accumulator;\n` +
        `    TICK_HZ should be 60, MAX_STEPS_PER_FRAME=8)\n` +
        `  - SAG_PRECARIOUS_TICKS / SAG_SAGGING_TICKS / SAG_SHAKING_TICKS in\n` +
        `    src/constants.ts changed without updating this test's targets\n` +
        `  - tickSagging phase boundaries in src/systems/collapse.ts no longer\n` +
        `    align with the constants\n\n` +
        `--- vitexec tail ---\n${log}`,
    )
  }
}

function assertPhaseBand(
  label: string,
  p50: number,
  targetLo: number,
  targetHi: number,
  log: string,
): void {
  if (p50 < targetLo || p50 > targetHi) {
    throw new Error(
      `Phase "${label}" p50 = ${p50}ms, expected within [${targetLo}, ${targetHi}].\n` +
        `One-sided tolerance: the SHAKE-entry commit gate in tickSagging defers\n` +
        `by 6 ticks (~100ms) when an in-flight conflict converges into the release\n` +
        `area, and deferrals can stack. The upper bound covers stacked deferrals;\n` +
        `the lower bound is the design floor (sub-floor = ticks running too fast).\n\n` +
        `--- vitexec tail ---\n${log}`,
    )
  }
}

describe('integration: 3-phase sag state machine timing', () => {
  /**
   * Contract: PRECARIOUS / SAGGING / SHAKING phases produce
   * predictable wall-clock durations (60Hz fixed-step simulation).
   * If these drift, the player's perception of three distinct beats
   * collapses back into one blur — the bug we just fixed.
   */
  it('phase durations match design (within ±60ms p50)', async () => {
    const { data, log } = await runProbe<ThreePhaseResult>(
      './probes/three-phase-timing.probe.js',
      { timeoutSec: 150 },
    )

    expect(
      data.totalCellsObserved,
      `Only ${data.totalCellsObserved} cells observed — need >20 to get reliable quantiles.`,
    ).toBeGreaterThan(20)

    expect(
      data.precariousToSagging.n,
      'No PRECARIOUS→SAGGING transitions observed. Either the lifecycle is broken or the probe missed every transition.',
    ).toBeGreaterThan(10)
    expect(
      data.saggingToShaking.n,
      'No SAGGING→SHAKING transitions observed.',
    ).toBeGreaterThan(10)
    expect(
      data.shakingToRelease.n,
      'No SHAKING→release transitions observed.',
    ).toBeGreaterThan(5)

    assertPhaseP50(
      'PRECARIOUS → SAGGING',
      data.precariousToSagging.p50,
      TARGET_PRECARIOUS_MS,
      log,
    )
    assertPhaseBand(
      'SAGGING → SHAKING',
      data.saggingToShaking.p50,
      TARGET_SAGGING_MS - TIMING_TOLERANCE_MS,
      SAGGING_UPPER_BOUND_MS,
      log,
    )
    assertPhaseP50(
      'SHAKING → release',
      data.shakingToRelease.p50,
      TARGET_SHAKING_MS,
      log,
    )
  })
})
