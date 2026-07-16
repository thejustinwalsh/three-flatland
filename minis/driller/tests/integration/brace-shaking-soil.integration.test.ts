import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface BraceResult {
  ok: boolean
  braceCost: number
  cell: { col: number; row: number }
  bracedUntilTickBefore: number
  bracedUntilTickAfter: number
  sagAlive: boolean
  gemsBefore: number
  gemsAfter: number
  tickAfter: number
  reason?: string
}

describe('integration: user-action — brace (sagging soil)', () => {
  /**
   * `commitAction(world, 'brace', null)` on a SaggingChunk cell must:
   *   1. Return true (gems >= BRACE_COST, hover cell matches a sag cell).
   *   2. Advance the chunk's bracedUntilTick to gs.tick + 120 (the
   *      doBrace constant) — pausing the sag timer.
   *   3. Debit BRACE_COST gems.
   *
   * Likely suspects on failure:
   *   - minis/driller/src/systems/input.ts:doBrace
   *     (gems gate, soil-first lookup, cell match against sag.cells)
   *   - braceShakingCluster (hazard.ts) if the soil path doesn't match
   */
  it('brace extends bracedUntilTick on a sagging soil chunk', async () => {
    const { data, log } = await runProbe<BraceResult>('./probes/brace-shaking-soil.probe.js', {
      timeoutSec: 30,
    })

    if (!data.ok) {
      throw new Error(
        `commitAction('brace', null) returned false on a freshly-seeded SaggingChunk. ` +
          `Reason: ${data.reason ?? '(none)'}.\n` +
          `Look at: minis/driller/src/systems/input.ts:doBrace — the per-cell match in ` +
          `the world.query(SaggingChunk).forEach loop, and the BRACE_COST gate.\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }

    expect(
      data.sagAlive,
      `The SaggingChunk entity was destroyed during brace. Brace should EXTEND the sag, ` +
        `not consume it.`
    ).toBe(true)

    expect(
      data.bracedUntilTickAfter,
      `bracedUntilTick did not advance (before=${data.bracedUntilTickBefore}, ` +
        `after=${data.bracedUntilTickAfter}). doBrace writes bracedUntilTick = gs.tick + 120 ` +
        `on the matched soil sag entity.`
    ).toBeGreaterThan(data.bracedUntilTickBefore)

    const delta = data.gemsBefore - data.gemsAfter
    expect(
      delta,
      `Gems delta ${delta} !== BRACE_COST ${data.braceCost}. spendGems is called with ` +
        `BRACE_COST inside doBrace after the brace lands.`
    ).toBe(data.braceCost)
  })
})
