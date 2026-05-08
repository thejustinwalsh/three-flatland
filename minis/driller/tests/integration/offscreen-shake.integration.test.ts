import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface OffscreenShakeResult {
  runMs: number
  threshold: number
  violationCount: number
  violationSamples: Array<{
    tMs: number
    row: number
    col: number
    drillerRow: number
    distAbove: number
    tile: number
  }>
}

describe('integration: offscreen shakes', () => {
  /**
   * Contract: blocks more than ~16 rows above the driller (the
   * SCAN_WINDOW_ROWS_ABOVE limit) MUST NEVER shake. Out-of-play
   * history is anchored — drilling well below should not cause
   * sag re-evaluation up there.
   *
   * If this fails, look for:
   *   - SCAN_WINDOW_ROWS_ABOVE in src/systems/collapse.ts widening
   *     beyond the playfield top
   *   - chunk entities orphaned by unloadChunk (entity references
   *     stale rows; clearChunkEntitiesInRowRange must run first)
   *   - markCellAndNeighborsDirty being called from a system that
   *     SHOULD use markAutotileDirty (no SAG_RECHECK propagation)
   */
  it('no shaking cells more than 18 rows above driller (2min observation)', async () => {
    const { data, log } = await runProbe<OffscreenShakeResult>(
      './probes/offscreen-shake.probe.js',
      { timeoutSec: 180 },
    )

    if (data.violationCount > 0) {
      const samples = data.violationSamples
        .map(
          (v) =>
            `  @(${v.col},${v.row}) tile=${v.tile} drillerRow=${v.drillerRow} ` +
            `distAbove=${v.distAbove} t=${v.tMs}ms`,
        )
        .join('\n')
      throw new Error(
        `Found ${data.violationCount} cells shaking >${data.threshold} rows above the driller.\n` +
          `These should not be re-evaluated for sag. Likely causes:\n` +
          `  - SCAN_WINDOW_ROWS_ABOVE widened in src/systems/collapse.ts\n` +
          `  - stale entity from unloadChunk (clearChunkEntitiesInRowRange)\n` +
          `  - cascade source using markCellAndNeighborsDirty when it should\n` +
          `    use markAutotileDirty / markCellAndNeighborsDirtyExcept\n\n` +
          `Sample violations (up to 20):\n${samples}\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }

    expect(data.violationCount).toBe(0)
  })
})
