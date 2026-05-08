import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface ShakeOrStayResult {
  totalCells: number
  honestShakes: number
  pendingAtEnd: number
  zeroDisplacementViolators: number
  violatorSamples: Array<{ col: number; row: number; tileWhenShook: number }>
}

describe('integration: shake-or-stay (codex rule 1)', () => {
  /**
   * Codex rule 1: a cell that shakes MUST fall by ≥1 cell. A cell
   * that shook AND ended up back as solid AT THE SAME GRID
   * LOCATION is a violator (shake telegraphed a fall that didn't
   * displace). The pre-checks at SHAKE-entry (`sagAllBottomEdgesAir`,
   * `inFlightConflictAbove`) plus the landAndReattach restore
   * fallback should keep this at zero.
   */
  it('every shaking cell either falls or stays solid only if it never shook (90s)', async () => {
    const { data, log } = await runProbe<ShakeOrStayResult>(
      './probes/shake-or-stay.probe.js',
      { timeoutSec: 150 },
    )

    expect(
      data.totalCells,
      `Probe observed ${data.totalCells} shaking cells in 90s — too few to assert. Is the AI playing?`,
    ).toBeGreaterThan(20)

    if (data.zeroDisplacementViolators > 0) {
      const samples = data.violatorSamples
        .map((v) => `  @(${v.col},${v.row}) tileWhenShook=${v.tileWhenShook}`)
        .join('\n')
      throw new Error(
        `Codex rule 1 violated: ${data.zeroDisplacementViolators} of ${data.totalCells} ` +
          `cells shook AND ended up back as solid at the same grid location.\n` +
          `If a cell shakes, it MUST move — that's the player's promise.\n\n` +
          `Likely causes:\n` +
          `  - sagAllBottomEdgesAir admitted a chunk where 1 of N bottom edges had non-AIR below\n` +
          `    (src/systems/collapse.ts) — should be ALL bottom edges air, not "any"\n` +
          `  - inFlightConflictAbove missed a sibling FallingChunk converging on our path\n` +
          `    (src/systems/collapse.ts) — check the column-overlap math\n` +
          `  - landAndReattach 0-displacement restore fallback isn't firing\n` +
          `    (look for ${`baseCellRow === fall.releaseRow`} early-return)\n\n` +
          `Sample violators (up to 20):\n${samples}\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }
    expect(data.zeroDisplacementViolators).toBe(0)
  })
})
