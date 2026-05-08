import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface ShakeContractResult {
  totalCells: number
  honestShakes: number
  violators: number
  violatorSamples: Array<{
    row: number
    col: number
    finalTile: number
    peakShakeMs: number
  }>
}

describe('integration: shake contract', () => {
  /**
   * Contract: every cell that ever turns ON FLAG_SHAKING must
   * eventually become AIR (the chunk actually fell). A cell that
   * shook AND remained SOIL/STONE at the end of observation is a
   * violation — the renderer drew a tell that didn't pay off.
   *
   * If this fails, look for codepaths that set FLAG_SHAKING without
   * a guaranteed fall. The likely suspects are
   * `tickSagging` (collapse.ts) and `rockAvalancheSystem` (hazard.ts).
   * Both should re-check `sagBottomEdgeStillClear` / `canFall`
   * before setting SHAKING and at the release tick.
   */
  it('every shaking cell falls to AIR (90s observation)', async () => {
    const { data, log } = await runProbe<ShakeContractResult>(
      './probes/shake-contract.probe.js',
      { timeoutSec: 150 },
    )

    // Sanity: we need a meaningful sample to validate the contract.
    // If this fails, the world isn't producing collapses — check
    // that GameState.runState is 'playing' and that the AI driller
    // is drilling. Probe sets runState=playing on bootstrap.
    expect(
      data.totalCells,
      `Probe observed only ${data.totalCells} cells flipping FLAG_SHAKING in 90s — too few to assert the contract. Is the AI driller making progress?`,
    ).toBeGreaterThan(20)

    if (data.violators > 0) {
      const samples = data.violatorSamples
        .map(
          (v) =>
            `  @(${v.col},${v.row}) finalTile=${v.finalTile} peakShakeMs=${v.peakShakeMs}`,
        )
        .join('\n')
      throw new Error(
        `Shake contract violated: ${data.violators} of ${data.totalCells} cells shook but never fell.\n` +
          `A shaking block MUST fall — that's the player's promise. Look for:\n` +
          `  - sag entities that release into a sealed floor (sagBottomEdgeStillClear)\n` +
          `  - avalanche clusters that shake without canFall\n` +
          `  - chunk entities orphaned by death/unload (clearAllChunkEntities, clearChunkEntitiesInRowRange)\n\n` +
          `Sample violators (up to 20):\n${samples}\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }

    expect(data.honestShakes).toBe(data.totalCells)
  })
})
