import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface ViolatorSample {
  idx: number
  row: number
  col: number
  gridFrames: number
  renderedFrames: number
  lastRenderedFrame: number
  finalTile: number
}

interface VisibleShakeResult {
  observationMs: number
  totalCellsWithGridShake: number
  totalCellsWithRenderedShake: number
  totalCellsRenderedAtLeastOnce: number
  totalGridFrames: number
  totalRenderedFrames: number
  silentShakeCells: number
  silentShakeFrames: number
  finalWindow: { topRow: number; bottomRow: number }
  violatorSamples: ViolatorSample[]
}

/**
 * Cantilever / rock codex — VISUAL half. The grid-side codex says
 * "every cell that ever turns ON FLAG_SHAKING must fall to AIR"
 * (shake-contract). This sibling test enforces the OTHER half: the
 * SHAKING bit must be visible to the player. Every cell that flipped
 * FLAG_SHAKING must have observed at least one frame of non-zero
 * jitter in the renderer.
 *
 * If this fails, look for:
 *   - shake happening in cells outside the renderer's
 *     `[topRow..bottomRow]` window (rows above or below the camera);
 *   - sprite-pool exhaustion (cell falls in window but no slot was
 *     assigned this frame);
 *   - `useFrame` skipped during a shake window (rare; investigate
 *     frame-budget loops);
 *   - the renderer's `if (shaking)` branch not actually applying
 *     non-zero jitter (math regression).
 *
 * The fix space is broad: tighten what the simulation considers
 * "valid to telegraph" (don't shake what won't be visible), or
 * extend the renderer's iteration window so the player sees the
 * tell when a chunk is approaching from above.
 */
describe('integration: visible shake (cantilever codex — visual half)', () => {
  it('every cell that flips FLAG_SHAKING is rendered with jitter at some sample', async () => {
    const { data, log } = await runProbe<VisibleShakeResult>(
      './probes/visible-shake.probe.js',
      { timeoutSec: 150 },
    )

    expect(
      data.totalCellsWithGridShake,
      `Probe observed only ${data.totalCellsWithGridShake} cells flipping FLAG_SHAKING in ${data.observationMs / 1000}s — too few to assert visibility. Is the AI driller making progress?`,
    ).toBeGreaterThanOrEqual(5)

    if (data.silentShakeCells > 0) {
      const samples = data.violatorSamples
        .map(
          (v) =>
            `  @(${v.col},${v.row}) gridFrames=${v.gridFrames} renderedFrames=${v.renderedFrames} ` +
            `lastRenderedFrame=${v.lastRenderedFrame} finalTile=${v.finalTile}`,
        )
        .join('\n')
      throw new Error(
        `Visible-shake contract violated: ${data.silentShakeCells} cell(s) had FLAG_SHAKING ` +
          `set in the grid for >=6 frames each but the renderer never drew jitter for them.\n` +
          `Player-facing impact: chunks fall without visible warning ("dropped out of nowhere").\n\n` +
          `Final render window during the run: ` +
          `[topRow=${data.finalWindow.topRow}..bottomRow=${data.finalWindow.bottomRow}]\n` +
          `Total grid-side shake frames: ${data.totalGridFrames}\n` +
          `Total renderer-drawn shake frames: ${data.totalRenderedFrames}\n` +
          `Cells ever rendered: ${data.totalCellsRenderedAtLeastOnce}\n\n` +
          `Likely causes:\n` +
          `  - shake happens above topRow or below bottomRow (cell off-camera);\n` +
          `    in src/components/TileRenderer.tsx, the iterator is\n` +
          `    [topRow=cam.y/TILE_PX-1, bottomRow=topRow+cam.rows+3) — anything\n` +
          `    outside that range is invisible regardless of what flags say.\n` +
          `  - sprite pool exhaustion mid-frame (POOL_SIZE = PLAY_COLS * (MIN_PLAY_ROWS + 24));\n` +
          `  - simulation telegraphs in cells that never enter the camera before falling.\n\n` +
          `Sample violators (up to 30):\n${samples}\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }

    // If we observed enough cells, assert global counters align too.
    // Some natural variance is expected (grid bit set the same tick
    // useFrame runs, slight timing skew), so we tolerate up to 25%
    // unrendered FRAMES across the whole run as long as ZERO cells
    // are completely silent.
    if (data.totalGridFrames > 200) {
      const renderedFraction =
        data.totalRenderedFrames / data.totalGridFrames
      expect(
        renderedFraction,
        `Renderer drew jitter on only ${(renderedFraction * 100).toFixed(1)}% ` +
          `of grid-side SHAKING frames (${data.totalRenderedFrames}/${data.totalGridFrames}). ` +
          `Some skew is normal but a low fraction implies many shakes happen ` +
          `outside the visible window. The coverage gap is real even when no ` +
          `single cell is silent.`,
      ).toBeGreaterThan(0.75)
    }
  })
})
