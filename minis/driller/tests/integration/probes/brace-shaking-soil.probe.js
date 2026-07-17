// Probe: the `brace` user-action against a SaggingChunk. The shake
// codex says brace extends the sag's commit time by N ticks. We:
//   1. Spawn a SaggingChunk synthetically (no need to drive the AI's
//      drill loop into spawning one — the sag-spawning paths are
//      already unit-tested in collapse.test.ts).
//   2. Snapshot its bracedUntilTick.
//   3. Park the pointer on a chunk cell + fire commitAction('brace').
//   4. Assert bracedUntilTick advanced and gems debited.

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

const grid = w.get(traits.Grid)
const gsAtSeed = w.get(traits.GameState)

// Pick a SOIL cell and spawn a SaggingChunk wrapping it. The exact
// row/col doesn't matter — we just need the chunk entity to exist
// with at least one cell so doBrace's per-cell match finds it.
let pickIdx = -1
let pickCol = -1
let pickRow = -1
const driller = w.queryFirst(traits.Driller)
const d = driller.get(traits.Driller)
outer: for (let dr = 1; dr <= 8; dr++) {
  for (let dc = -8; dc <= 8; dc++) {
    const c = d.col + dc
    const r = d.row + dr
    if (c < 0 || c >= grid.cols || r < 0 || r >= grid.rows) continue
    const idx = r * grid.cols + c
    if (grid.tiles[idx] === traits.TILE_SOIL) {
      pickIdx = idx
      pickCol = c
      pickRow = r
      break outer
    }
  }
}
if (pickIdx < 0) {
  console.log(
    'INTEGRATION_RESULT: ' +
      JSON.stringify({ ok: false, reason: 'no SOIL cell within radius for brace seed' })
  )
} else {
  const sagEntity = w.spawn(
    traits.SaggingChunk({
      cells: [{ col: pickCol, row: pickRow, tile: traits.TILE_SOIL }],
      startTick: gsAtSeed.tick,
      durationTicks: 200, // give brace a wide window to extend INTO
      bracedUntilTick: 0,
    })
  )
  const sagBefore = sagEntity.get(traits.SaggingChunk)
  console.log('[probe] seeded SaggingChunk at', pickCol, pickRow, 'startTick=', sagBefore.startTick)

  w.set(traits.Pointer, {
    hoverTargetCol: pickCol,
    hoverTargetRow: pickRow,
    hoverAction: 'brace',
  })

  const gsBefore = w.get(traits.GameState)
  const ok = input.commitAction(w, 'brace', null)
  console.log('[probe] brace commit returned', ok)
  await new Promise((r) => setTimeout(r, 100))
  const gsAfter = w.get(traits.GameState)
  const sagAfter = sagEntity.get(traits.SaggingChunk)

  const result = {
    ok,
    braceCost: constants.BRACE_COST,
    cell: { col: pickCol, row: pickRow },
    bracedUntilTickBefore: sagBefore.bracedUntilTick,
    bracedUntilTickAfter: sagAfter ? sagAfter.bracedUntilTick : 0,
    sagAlive: !!sagAfter,
    gemsBefore: gsBefore.gems,
    gemsAfter: gsAfter.gems,
    tickAfter: gsAfter.tick,
  }
  console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
}
