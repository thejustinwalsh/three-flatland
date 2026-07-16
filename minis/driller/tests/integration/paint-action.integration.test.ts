import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface PaintActionResult {
  ok: boolean
  cell: { col: number; row: number }
  paintCostPerTick: number
  tileSoil: number
  tileAir: number
  tileBefore: number
  tileAfter: number
  flagBefore: number
  flagAfter: number
  flagAutotileDirty: number
  gemsBefore: number
  gemsAfter: number
  reason?: string
}

describe('integration: user-action — paint', () => {
  /**
   * `commitAction(world, 'paint', null)` on a SOIL cell under the
   * pointer must:
   *   1. Return true.
   *   2. Flip the cell to AIR in-place.
   *   3. Set FLAG_AUTOTILE_DIRTY so the renderer + sag recheck pick it up.
   *   4. Debit PAINT_COST_PER_TICK gems.
   *
   * Likely suspects on failure:
   *   - minis/driller/src/systems/input.ts:doPaint
   *   - minis/driller/src/systems/autotile-pass.ts:markCellAndNeighborsDirty
   *   - minis/driller/src/systems/gem-spend.ts:spendGems
   */
  it('paint instantly destroys a SOIL cell and debits gems', async () => {
    const { data, log } = await runProbe<PaintActionResult>('./probes/paint-action.probe.js', {
      timeoutSec: 30,
    })

    if (!data.ok) {
      throw new Error(
        `commitAction('paint', null) returned false. ` +
          `Reason: ${data.reason ?? '(none)'}.\n` +
          `Look at: minis/driller/src/systems/input.ts:doPaint — gems gate, tile === TILE_SOIL ` +
          `gate, or one of GameState/Pointer/Grid missing.\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }

    if (data.tileBefore !== data.tileSoil) {
      throw new Error(
        `Probe setup picked a non-SOIL cell (tileBefore=${data.tileBefore}, TILE_SOIL=${data.tileSoil}). ` +
          `Probe regression — see the cell-pick loop in paint-action.probe.js.\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }

    expect(
      data.tileAfter,
      `Painted cell @(${data.cell.col},${data.cell.row}) is still ${data.tileAfter}, expected TILE_AIR=${data.tileAir}. ` +
        `Paint is supposed to be instant SOIL→AIR. ` +
        `If this regresses, doPaint may have been refactored back to anchor-distance-bump (the rejected variant).`
    ).toBe(data.tileAir)

    const dirtySet = (data.flagAfter & data.flagAutotileDirty) !== 0
    if (!dirtySet) {
      throw new Error(
        `FLAG_AUTOTILE_DIRTY is not set on the painted cell (flagAfter=${data.flagAfter}). ` +
          `Without it the renderer won't refresh and the sag-recheck pass won't reconsider ` +
          `neighbors — paint creates invisible damage.\n` +
          `Look at: doPaint sets flags[idx] |= FLAG_AUTOTILE_DIRTY directly.\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }

    const delta = data.gemsBefore - data.gemsAfter
    expect(
      delta,
      `Gems delta ${delta} !== PAINT_COST_PER_TICK ${data.paintCostPerTick}. ` +
        `spendGems should be called with PAINT_COST_PER_TICK inside doPaint.`
    ).toBe(data.paintCostPerTick)
  })
})
