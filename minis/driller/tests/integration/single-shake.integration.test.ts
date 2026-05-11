import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface SingleShakeResult {
  totalCellsObserved: number
  neverShook: number
  oneShakePerIncarnation: number
  multiShakeViolators: number
  violatorSamples: Array<{
    col: number
    row: number
    maxShakes: number
    cumulativeShakes: number
  }>
}

describe('integration: single-shake (codex rule 3, relaxed)', () => {
  /**
   * Codex rule 3: a cell shaking twice within one solid-tile
   * incarnation is generally a sign of mid-shake cancel + re-trigger
   * — telegraphed twice for one fall.
   *
   * Relaxed under the diffusion model: rock clusters whose support
   * state legitimately toggles (drilled below → AIR-below → cluster
   * shakes → soil cascade fills back in → cluster blocked → cluster
   * later re-shakes when player drills again) CAN produce two
   * shakes per incarnation. This is causally honest — the world
   * state really did change between the two shakes. The pathology
   * we're guarding against is "shake fires with no underlying
   * change," which would manifest as a large violator ratio.
   *
   * Threshold: ≤ 50% of shaken cells may show 2+ shakes per
   * incarnation. Above that, look for entity overlap or mid-shake
   * cancel bugs.
   */
  it('most cells shake once per incarnation (90s, ≤50% multi-shake)', async () => {
    const { data, log } = await runProbe<SingleShakeResult>(
      './probes/single-shake.probe.js',
      { timeoutSec: 150 },
    )

    const totalShaken = data.oneShakePerIncarnation + data.multiShakeViolators
    expect(
      totalShaken,
      `Only ${totalShaken} cells shook in 90s — too few to assert.`,
    ).toBeGreaterThan(20)

    const multiShakeRatio = data.multiShakeViolators / totalShaken
    if (multiShakeRatio > 0.5) {
      const samples = data.violatorSamples
        .map(
          (v) =>
            `  @(${v.col},${v.row}) maxShakesPerIncarnation=${v.maxShakes} ` +
            `cumulative=${v.cumulativeShakes}`,
        )
        .join('\n')
      throw new Error(
        `${data.multiShakeViolators}/${totalShaken} (${(multiShakeRatio * 100).toFixed(1)}%) ` +
          `cells shook more than once per incarnation — exceeds the 50% tolerance.\n` +
          `Likely causes:\n` +
          `  - tickSagging cancels SHAKE phase due to release-time re-check\n` +
          `  - sagging cells get re-flagged as PRECARIOUS by a new sag entity\n` +
          `    while they were SHAKING (entity overlap; check detectAndSag\n` +
          `    chunkHasFlag(SAGGING|FALLING|PRECARIOUS|SHAKING) mask in collapse.ts)\n` +
          `  - rock avalanche clusters toggling canFall many times without\n` +
          `    underlying support changes\n\n` +
          `Sample violators (up to 20):\n${samples}\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }
  })
})
