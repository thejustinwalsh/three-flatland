import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface ShakeOrStayResult {
  observationMs: number
  properLandings: number
  zeroDisplacementRestores: number
}

describe('integration: shake-or-stay (codex rule 1)', () => {
  /**
   * Codex rule 1: a chunk that shakes MUST fall by ≥1 cell.
   *
   * The game increments `window.__drillerStats.zeroDisplacementRestores`
   * every time `landAndReattach` fires its belt-and-suspenders
   * restore branch (landing row == release row). In healthy play
   * that branch should never fire — the SHAKE-entry guards
   * (`sagAllBottomEdgesAir` + `inFlightConflictAbove`) prevent any
   * sag from committing to a release that won't displace by ≥1.
   *
   * A nonzero count means the guards have a hole.
   */
  it('zero 0-displacement landings over 90s of play', async () => {
    const { data, log } = await runProbe<ShakeOrStayResult>('./probes/shake-or-stay.probe.js', {
      timeoutSec: 150,
    })

    // Sanity gate: we need at least SOME chunk landings to validate
    // the contract. A 90s observation in a fast AI run typically
    // produces 5–15 SOIL chunk falls (avalanche stones don't go
    // through FallingChunk so they don't count here). Threshold is
    // generous; if it ever fails, the AI is stuck or the simulation
    // isn't running.
    expect(
      data.properLandings,
      `Probe observed only ${data.properLandings} chunk landings in 90s — too ` +
        `few to validate the contract. Is the AI driller actually drilling?`
    ).toBeGreaterThan(2)

    if (data.zeroDisplacementRestores > 0) {
      throw new Error(
        `Codex rule 1 violated: ${data.zeroDisplacementRestores} chunk(s) landed ` +
          `at their own release row out of ${data.properLandings + data.zeroDisplacementRestores} ` +
          `total landings.\n` +
          `If a chunk shakes, it MUST move — that's the player's promise. The\n` +
          `belt-and-suspenders restore branch in landAndReattach (collapse.ts)\n` +
          `should never fire in healthy play; nonzero count means the SHAKE-entry\n` +
          `guards let through a sag whose path closed before the FallingChunk\n` +
          `could displace.\n\n` +
          `Likely causes:\n` +
          `  - sagAllBottomEdgesAir admitted a chunk where 1 of N bottom edges had\n` +
          `    non-AIR below (collapse.ts) — should be ALL bottom edges AIR\n` +
          `  - inFlightConflictAbove missed a sibling FallingChunk converging\n` +
          `    on our path (collapse.ts) — column-overlap math\n` +
          `  - mid-shake cancel (rule 3 path) somehow re-routed cells through\n` +
          `    a same-tick fall\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }
    expect(data.zeroDisplacementRestores).toBe(0)
  })
})
