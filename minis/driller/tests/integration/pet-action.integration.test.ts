import { describe, it, expect } from 'vitest'
import { runProbe } from './_runner'

interface PetActionResult {
  ok: boolean
  petCost: number
  petPauseTicks: number
  gemsBefore: number
  gemsAfter: number
  pausedUntilTickBefore: number
  pausedUntilTickAfter: number
  petPauseQueuedTicksAfter: number
  petEventsCountBefore: number
  petEventsCountAfter: number
  moodBefore: { greed: number; fear: number; drive: number } | null
  moodAfter: { greed: number; fear: number; drive: number } | null
  tickAtStart: number
  tickAtEnd: number
  reason?: string
}

describe('integration: user-action — pet', () => {
  /**
   * `commitAction(world, 'pet', null)` must:
   *   1. Return true (driller exists, gems >= PET_COST).
   *   2. Debit PET_COST gems.
   *   3. Either arm pausedUntilTick (if grounded) OR queue the pause via
   *      petPauseQueuedTicks (if mid-fall). One or the other — both 0
   *      is a regression.
   *   4. Append the tick to PetEvents.recentTicks.
   *
   * Likely suspects on failure (file:symbol):
   *   - minis/driller/src/systems/input.ts:doPet
   *   - minis/driller/src/systems/driller.ts (pausedUntilTick clear paths)
   *   - minis/driller/src/systems/gem-spend.ts:spendGems
   */
  it('pet commits gems-for-pause across a tick window', async () => {
    const { data, log } = await runProbe<PetActionResult>('./probes/pet-action.probe.js', {
      timeoutSec: 30,
    })

    if (!data.ok) {
      throw new Error(
        `commitAction('pet', null) returned false. ` +
          `Pre-state: gems=${data.gemsBefore}, petCost=${data.petCost}. ` +
          `Reason from probe: ${data.reason ?? '(none)'}.\n` +
          `Look at: minis/driller/src/systems/input.ts:doPet — does it short-circuit ` +
          `before debiting? Check the gems gate, queryFirst(Driller), and the gs guard.\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }

    const gemsDelta = data.gemsBefore - data.gemsAfter
    if (gemsDelta !== data.petCost) {
      throw new Error(
        `Gems delta ${gemsDelta} !== PET_COST ${data.petCost}.\n` +
          `Look at: minis/driller/src/systems/gem-spend.ts:spendGems — is it being ` +
          `called with PET_COST? Also check input.ts:doPet for any conditional skip.\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }

    const pauseArmed = data.pausedUntilTickAfter > data.pausedUntilTickBefore
    const pauseQueued = data.petPauseQueuedTicksAfter > 0
    if (!pauseArmed && !pauseQueued) {
      throw new Error(
        `Neither pausedUntilTick advanced (${data.pausedUntilTickBefore} → ${data.pausedUntilTickAfter}) ` +
          `nor petPauseQueuedTicks armed (${data.petPauseQueuedTicksAfter}). ` +
          `One MUST fire — the pet was paid for.\n` +
          `Look at: minis/driller/src/systems/input.ts:doPet — the grounded vs queued ` +
          `branch. Also check that no other system (driller.ts, hazard.ts) is clearing ` +
          `pausedUntilTick within the same tick.\n\n` +
          `--- vitexec tail ---\n${log}`
      )
    }

    expect(
      data.petEventsCountAfter,
      `PetEvents.recentTicks did not record the pet (before=${data.petEventsCountBefore}, after=${data.petEventsCountAfter}). ` +
        `doPet writes to it via drillerEntity.set(PetEvents, {recentTicks: pruned}); ` +
        `if this fails, the over-pet detector won't fire either.`
    ).toBeGreaterThan(data.petEventsCountBefore)
  })
})
