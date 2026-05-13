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
    //
    // Threshold is intentionally loose (>= 5) because the driller's
    // mood-driven AI is non-deterministic across runs. After Phase 2
    // G (TILE_ROCK + TILE_STONE unification), stones became drillable
    // and driller paths can now go straight down through what used
    // to be impassable rock walls — resulting in fewer overhangs and
    // fewer sag events on some seeds. The codex assertion below
    // (honestShakes == totalCells) holds regardless of activity
    // volume; the threshold here only guards against "AI never moved
    // and we'd be silently passing on zero observations".
    expect(
      data.totalCells,
      `Probe observed only ${data.totalCells} cells flipping FLAG_SHAKING in 90s — too few to assert the contract. Is the AI driller making progress?`,
    ).toBeGreaterThanOrEqual(5)

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
