import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface DragHoldResult {
  cluster: { cid: number; col: number; row: number; size: number }
  dragStarted: boolean
  dragClusterId: number
  dragClusterIdAfterRelease: number
  heldDurationMs: number
  heldViolations: number
  heldViolationSamples: Array<{ col: number; row: number; flags: number }>
  postReleaseCells: number
  postReleaseFalling: number
  gemsBefore: number
  gemsAfter: number
  ticksElapsed: number
}

describe('integration: user-action — drag (held cluster)', () => {
  /**
   * Contract under test: while a STONE cluster is held via `startDrag`,
   * the avalanche system MUST NOT re-apply FLAG_FALLING or FLAG_SHAKING
   * on any cluster cell. The held cluster is gated by `Drag.clusterId`
   * (the "trait + NOT" pattern). When the user releases, Drag.clusterId
   * resets to 0 and the avalanche resumes normal processing.
   *
   * Regression history: prior to the avalanche-skips-held-cluster fix,
   * a held rock would visibly continue falling because
   * `rockAvalancheSystem` recomputed FLAG_FALLING every tick from
   * cells-with-air-below. This probe runs the live system for ~1s of
   * wall-clock — that's many dozens of avalanche ticks — and asserts
   * zero violations across the entire window.
   *
   * Likely suspects on failure:
   *   - minis/driller/src/systems/hazard.ts:rockAvalancheSystem
   *     (does the cluster-skip read Drag.clusterId at loop start?)
   *   - minis/driller/src/systems/drag.ts:startDrag / endDrag
   *     (do they clear / re-set FLAG_FALLING correctly?)
   */
  it('held cluster keeps FLAG_FALLING clear for a full hold window', async () => {
    const { data, log } = await runProbe<DragHoldResult>(
      './probes/drag-hold.probe.js',
      { timeoutSec: 30 },
    )

    if (!data.dragStarted) {
      throw new Error(
        `startDrag returned false for cluster cid=${data.cluster.cid} at ` +
          `(${data.cluster.col},${data.cluster.row}) size=${data.cluster.size}.\n` +
          `Look at: minis/driller/src/systems/drag.ts:startDrag — Grid / GameState / Drag ` +
          `singleton must all be present; the target tile must be TILE_STONE; clusterId must be != 0.\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }

    if (data.dragClusterId !== data.cluster.cid) {
      throw new Error(
        `Drag.clusterId is ${data.dragClusterId}, expected ${data.cluster.cid}. ` +
          `startDrag may be writing to a different singleton or losing the cid.\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }

    if (data.heldViolations > 0) {
      const samples = data.heldViolationSamples
        .map((s) => `  @(${s.col},${s.row}) flags=0x${s.flags.toString(16)}`)
        .join('\n')
      throw new Error(
        `${data.heldViolations} flag-set samples observed on held cluster cells over ` +
          `${data.heldDurationMs}ms (cid=${data.cluster.cid}). FLAG_FALLING / FLAG_SHAKING ` +
          `MUST stay clear while a drag is active.\n` +
          `Look at: minis/driller/src/systems/hazard.ts:rockAvalancheSystem — does the ` +
          `per-seed loop check Drag.clusterId BEFORE setting flags? The pattern is "trait ` +
          `+ NOT": one trait singleton (Drag) gates other systems' writes.\n\n` +
          `Sample violators:\n${samples}\n\n` +
          `--- vitexec tail ---\n${log}`,
      )
    }

    expect(
      data.dragClusterIdAfterRelease,
      `Drag.clusterId did not reset to 0 after endDrag (got ${data.dragClusterIdAfterRelease}). ` +
        `endDrag must call world.set(Drag, { clusterId: 0 }).`,
    ).toBe(0)
  })
})
