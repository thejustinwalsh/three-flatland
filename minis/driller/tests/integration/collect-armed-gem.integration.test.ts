import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface CollectResult {
  ok: boolean
  cell: { col: number; row: number }
  size: 'small' | 'medium' | 'large' | 'huge'
  gemsBefore: number
  gemsAfter: number
  gemAlive: boolean
  gemCollected: boolean
  collectCooldownUntilTickAfter: number
  tickAfter: number
}

const GEM_VALUE: Record<CollectResult['size'], number> = {
  small: 1,
  medium: 3,
  large: 5,
  huge: 10,
}

describe('integration: user-action — collect', () => {
  /**
   * `commitAction(world, 'collect', gemEntity)` must:
   *   1. Return true on an armed, uncollected gem.
   *   2. Credit GEM_VALUE[size] gems.
   *   3. Destroy the gem entity (or mark it collected).
   *   4. Advance the collect cooldown (outside the free-fall band).
   *
   * Likely suspects on failure:
   *   - minis/driller/src/systems/input.ts:doCollect (gem entity gate,
   *     cooldown gate, gem-value lookup)
   *   - GEM_VALUE table drift between collectAction-tests and runtime
   */
  it('collect credits gem value and removes the gem', async () => {
    const { data, log } = await runProbe<CollectResult>('./probes/collect-armed-gem.probe.js', {
      timeoutSec: 30,
    })

    if (!data.ok) {
      throw new Error(
        `commitAction('collect', entity) returned false on a freshly-seeded gem. ` +
          `Pre-state: gems=${data.gemsBefore}, gem at (${data.cell.col},${data.cell.row}), size=${data.size}.\n` +
          `Look at: minis/driller/src/systems/input.ts:doCollect — collected gate, ` +
          `cooldown gate (Pointer.collectCooldownUntilTick), or null gem fetch.\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }

    const delta = data.gemsAfter - data.gemsBefore
    const expectedValue = GEM_VALUE[data.size]
    if (delta !== expectedValue) {
      throw new Error(
        `Gems delta ${delta} !== GEM_VALUE[${data.size}]=${expectedValue}.\n` +
          `Look at: input.ts:doCollect's GEM_VALUE constant. If the test's expected ` +
          `map drifts from runtime, update both. If runtime changes, this is a feature ` +
          `change and the assertion should be updated deliberately.\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }

    const removed = !data.gemAlive || data.gemCollected
    expect(
      removed,
      `Gem entity is still alive AND not flagged collected — neither the destroy() ` +
        `nor the collected=true path fired. doCollect ends with target.destroy(); ` +
        `if that's been replaced, the alternate must set collected=true.`
    ).toBe(true)

    expect(
      data.collectCooldownUntilTickAfter,
      `Collect cooldown did not advance after the collect (got ${data.collectCooldownUntilTickAfter}). ` +
        `Outside the void band, doCollect should set Pointer.collectCooldownUntilTick. ` +
        `If this fails, auto-clicker farming is unlocked.`
    ).toBeGreaterThan(data.tickAfter)
  })
})
