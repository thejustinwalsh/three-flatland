import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface HoverPriorityResult {
  ok: boolean
  soilCell: { col: number; row: number }
  gemCell: { col: number; row: number }
  chebyDistance: number
  beforeAction: string
  afterAction: string
  matchedSpawnedGem: boolean
  reason?: string
}

describe('integration: user-action — hover priority under contention', () => {
  /**
   * Contract under test: gem-with-halo wins over paint-on-soil.
   * Specifically — when the pointer is over a SOIL cell, and a gem
   * sits in the ±1 Chebyshev halo (but NOT on the cell), the resolved
   * action MUST be 'collect', not 'paint'. The halo exists to make
   * small gems clickable without pixel-perfect aim.
   *
   * Likely suspects on failure:
   *   - minis/driller/src/systems/input.ts:resolveHoverAction
   *     (gem-halo block at #2; if reordered with the paint case at #6
   *     the halo loses, and the bug masquerades as "I keep painting
   *     when I'm trying to collect")
   */
  it('halo-gem outranks paint-on-soil', async () => {
    const { data, log } = await runProbe<HoverPriorityResult>(
      './probes/hover-priority-contention.probe.js',
      { timeoutSec: 30 },
    )

    if (!data.ok) {
      throw new Error(
        `Probe couldn't seed a contention scenario. Reason: ${data.reason ?? '(none)'}.\n` +
          `Investigate: the cell-pick loop may need a wider radius if the world isn't ` +
          `generating soil within (driller.row + 4..10).\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }

    // Pre-spawn baseline: with no gem in the halo, the cell should
    // resolve to paint. If it's already 'collect', another gem must
    // be hiding in the halo — note it but don't fail the test.
    if (data.beforeAction !== 'paint' && data.beforeAction !== 'none') {
      // eslint-disable-next-line no-console
      console.warn(
        `Hover-priority probe: baseline (no test gem) resolved to '${data.beforeAction}', ` +
          `expected 'paint' or 'none'. Another nearby gem may be confounding the test, ` +
          `but the post-spawn assertion still verifies the halo-gem path.`,
      )
    }

    expect(
      data.afterAction,
      `After spawning a gem at Chebyshev distance ${data.chebyDistance} from the hover ` +
        `cell, action resolved to '${data.afterAction}' (expected 'collect'). The ±1 halo ` +
        `path in resolveHoverAction must outrank the paint case at #6.\n\n` +
        `vitexec tail:\n${log}`,
    ).toBe('collect')

    expect(
      data.matchedSpawnedGem,
      `Resolved gem entity does not match the freshly-spawned test gem at ` +
        `(${data.gemCell.col},${data.gemCell.row}). The halo may be picking a different ` +
        `nearby gem — that's still a valid 'collect' action but indicates probe state ` +
        `pollution. Bump the cell-pick radius in the probe if this keeps firing.`,
    ).toBe(true)
  })
})
