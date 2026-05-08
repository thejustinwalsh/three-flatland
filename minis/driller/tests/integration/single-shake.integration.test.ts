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

describe('integration: single-shake (codex rule 3)', () => {
  /**
   * Codex rule 3: a cell may enter PRECARIOUS / SAGGING multiple
   * times (re-evaluation as nearby tiles change), but should only
   * SHAKE ONCE per incarnation. A cell that shakes twice without
   * going AIR in between has been telegraphed twice for one fall —
   * that's the bug.
   *
   * "Incarnation" = continuous solid stretch. A cell that goes AIR
   * (because a chunk fell out of it) and later becomes SOIL again
   * (a different chunk landed on it) starts a new incarnation;
   * shakes counted independently.
   */
  it('cells shake at most once per incarnation (90s)', async () => {
    const { data, log } = await runProbe<SingleShakeResult>(
      './probes/single-shake.probe.js',
      { timeoutSec: 150 },
    )

    const totalShaken = data.oneShakePerIncarnation + data.multiShakeViolators
    expect(
      totalShaken,
      `Only ${totalShaken} cells shook in 90s — too few to assert.`,
    ).toBeGreaterThan(20)

    if (data.multiShakeViolators > 0) {
      const samples = data.violatorSamples
        .map(
          (v) =>
            `  @(${v.col},${v.row}) maxShakesPerIncarnation=${v.maxShakes} ` +
            `cumulative=${v.cumulativeShakes}`,
        )
        .join('\n')
      throw new Error(
        `Codex rule 3 violated: ${data.multiShakeViolators} cells shook MORE than once ` +
          `within a single solid-tile incarnation.\n` +
          `Once a cell SHAKES, the fall must be committed — no mid-shake cancel.\n\n` +
          `Likely causes:\n` +
          `  - tickSagging cancels SHAKE phase due to release-time re-check\n` +
          `    (src/systems/collapse.ts — release-tick sagAllBottomEdgesAir guard\n` +
          `     should be REMOVED; the SHAKE-entry check is the commit point)\n` +
          `  - sagging cells get re-flagged as PRECARIOUS by a new sag entity\n` +
          `    while they were SHAKING (entity overlap; check detectAndSag\n` +
          `    chunkHasFlag(SAGGING|FALLING) gate)\n\n` +
          `Sample violators (up to 20):\n${samples}\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }
    expect(data.multiShakeViolators).toBe(0)
  })
})
