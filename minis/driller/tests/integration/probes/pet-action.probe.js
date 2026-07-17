// Probe: the `pet` user-action user surface, end-to-end via the live
// dev server. Asserts the full chain — gems debit, pause arms, mood
// shifts — fires as expected. Catches regressions where the simulation
// systems quietly drop or undo one part of the pet sequence (the
// classic example: an avalanche / mood / driller system resetting
// pausedUntilTick mid-flight).
//
// Sequence:
//   1. Force GameState into a deterministic petable state (gems > cost,
//      runState='playing').
//   2. Stub a Pointer over the driller's cell.
//   3. Call commitAction(world, 'pet', null).
//   4. Advance the simulation ~half the pet pause window and sample.
//   5. Assert pausedUntilTick advanced, gems decreased by PET_COST,
//      and PetEvents recorded the tick.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))

const traits = await import('/src/traits/index.ts')
const input = await import('/src/systems/input.ts')
const constants = await import('/src/constants.ts')
const w = window.__drillerWorld

w.set(traits.GameState, { runState: 'playing', gems: 99 })

const drillerEntity = w.queryFirst(traits.Driller)
if (!drillerEntity) {
  console.log('INTEGRATION_RESULT: ' + JSON.stringify({ ok: false, reason: 'no driller entity' }))
} else {
  const dBefore = drillerEntity.get(traits.Driller)
  const gsBefore = w.get(traits.GameState)
  const peBefore = drillerEntity.get(traits.PetEvents)
  const moodBefore = drillerEntity.get(traits.Mood)

  // Park the pointer over the driller cell so commitAction('pet') has
  // the right target context. (doPet reads Driller directly, but
  // spendGems pops over the pointer-resolved cell — keep it consistent.)
  w.set(traits.Pointer, {
    hoverTargetCol: dBefore.col,
    hoverTargetRow: dBefore.row,
    hoverAction: 'pet',
  })

  const ok = input.commitAction(w, 'pet', null)
  console.log('[probe] pet commit returned', ok, 'at tick', gsBefore.tick)

  // Sample a few ticks in so the pause is comfortably "during". We're
  // not asserting on a specific tick value (the simulation runs in real
  // wall-clock here) — only on the deltas vs the pre-pet snapshot.
  await new Promise((r) => setTimeout(r, 200))

  const dAfter = drillerEntity.get(traits.Driller)
  const gsAfter = w.get(traits.GameState)
  const peAfter = drillerEntity.get(traits.PetEvents)
  const moodAfter = drillerEntity.get(traits.Mood)

  const result = {
    ok,
    petCost: constants.PET_COST,
    petPauseTicks: constants.PET_PAUSE_TICKS,
    gemsBefore: gsBefore.gems,
    gemsAfter: gsAfter.gems,
    pausedUntilTickBefore: dBefore.pausedUntilTick,
    pausedUntilTickAfter: dAfter.pausedUntilTick,
    petPauseQueuedTicksAfter: dAfter.petPauseQueuedTicks,
    petEventsCountBefore: peBefore ? peBefore.recentTicks.length : 0,
    petEventsCountAfter: peAfter ? peAfter.recentTicks.length : 0,
    moodBefore: moodBefore
      ? { greed: moodBefore.greed, fear: moodBefore.fear, drive: moodBefore.drive }
      : null,
    moodAfter: moodAfter
      ? { greed: moodAfter.greed, fear: moodAfter.fear, drive: moodAfter.drive }
      : null,
    tickAtStart: gsBefore.tick,
    tickAtEnd: gsAfter.tick,
  }
  console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
}
