import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface DiffusionResult {
  preSettleObserved: boolean
  preSettleSampleSize: number
  preSettleMaxDist: number
  preSettleInfCount: number
  preSettleFiniteCount: number
  wavefrontObserved: boolean
  wavefrontSamples: { relTick: number; dist: number }[]
  wavefrontError: string | null
}

/**
 * Diffusion-based collapse model — end-to-end smoke test.
 *
 * Verifies in the live browser that:
 *   1. `Grid.anchorDist` is allocated and populated post-pre-settle
 *      (i.e. the diffusion model is wired into worldgen).
 *   2. The pre-settled distance distribution is reasonable for the
 *      current biome/fixture density tuning — most cells finite,
 *      max distance bounded.
 *   3. The relaxation step is running each tick (no probe assertion;
 *      the wavefront sub-test is best-effort because not every drill
 *      target has an isolated anchor path).
 */
describe('diffusion-based anchor distance', () => {
  it('pre-settles a non-trivial finite-distance distribution on world load', async () => {
    const { data } = await runProbe<DiffusionResult>('probes/diffusion.probe.js', {
      timeoutSec: 30,
    })
    if (!data.preSettleObserved) {
      throw new Error(
        `Diffusion model not wired: Grid.anchorDist is empty or wrong size.\n` +
          `  - Check src/world.ts adds anchorDist to the Grid trait\n` +
          `  - Check src/systems/generation.ts ensureRows() allocates anchorDist\n` +
          `  - Check loadChunk() calls seedAnchorsBFS() after stamping cells\n` +
          `  Result: ${JSON.stringify(data)}`
      )
    }
    expect(data.preSettleSampleSize).toBeGreaterThan(50)
    expect(data.preSettleFiniteCount).toBeGreaterThan(0)
    // Most cells should have a finite anchor distance — INF count
    // greater than ~30% of sample size means fixture density is way
    // too sparse and the world will collapse on stream-in.
    const infRatio = data.preSettleInfCount / data.preSettleSampleSize
    if (infRatio > 0.3) {
      throw new Error(
        `Too many cells with no anchor path: ${data.preSettleInfCount}/${data.preSettleSampleSize} (${(infRatio * 100).toFixed(1)}%)\n` +
          `  Likely cause: fixture density too low in current biome (src/biomes.ts → fixtureCount).\n` +
          `  With diffusion-based fixture-up-only anchors, the world needs more fixtures than\n` +
          `  the pre-diffusion model. Bump the affected biome's fixtureCount range.\n` +
          `  Result: ${JSON.stringify(data)}`
      )
    }
  }, 60_000)
})
