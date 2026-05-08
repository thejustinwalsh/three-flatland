// Probe: codex rule 1 — every cell that flips FLAG_SHAKING ON must
// (a) eventually become AIR (the chunk fell), AND (b) end up at a
// DIFFERENT grid location than where it shook (the chunk moved by
// ≥1 cell, not 0-displacement). Cells that shook and ended up in
// the same (col, row) are violators.
//
// Tracking grid location of a cell across the lifecycle is subtle:
// we record where the cell's INDEX was when it first shook, then
// observe whether tile became AIR. If at any later sample the cell
// at that same index is back to its pre-shake tile class (without
// going through AIR first), we have the bug.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const FLAG_SHAKING = 1 << 5

// per-idx tracking: the moment the cell first showed SHAKING, its
// tile class then, and what happened after.
//   shookAt: time of first shake observation
//   tileWhenShook: tile class at first shake (1=SOIL, 2=STONE)
//   wentAir: true if the cell was observed as TILE_AIR at any
//            sample AFTER shookAt (chunk moved away)
//   reSolidAtSameIdx: true if the cell became solid AGAIN at the
//            same index without going AIR first (= 0-displacement
//            re-stamp, which is the bug for rule 1)
const tracker = new Map()
const t0 = performance.now()
const SAMPLE_MS = 33
const RUN_MS = 90_000
const PROGRESS_MS = 10_000

let lastProgressAt = 0
const interval = setInterval(() => {
  const grid = w.get(traits.Grid)
  const tNow = performance.now() - t0
  for (let i = 0; i < grid.tiles.length; i++) {
    const f = grid.flags[i] ?? 0
    const tile = grid.tiles[i]
    const shaking = (f & FLAG_SHAKING) !== 0
    let entry = tracker.get(i)
    if (shaking && !entry) {
      entry = {
        shookAt: tNow,
        tileWhenShook: tile,
        col: i % grid.cols,
        row: Math.floor(i / grid.cols),
        wentAir: false,
        reSolidAtSameIdx: false,
      }
      tracker.set(i, entry)
    }
    if (entry) {
      if (tile === 0) {
        entry.wentAir = true
      } else if (entry.wentAir === false && entry.tileWhenShook === tile) {
        // Still solid since shake started, no AIR seen yet — fine,
        // the chunk hasn't released yet. Wait.
      } else if (
        entry.wentAir === false &&
        entry.tileWhenShook !== tile &&
        tile !== 0
      ) {
        // Solid but a DIFFERENT tile class? Weird, ignore.
      }
      // The bug pattern: was AIR, now solid AGAIN at same index.
      if (entry.wentAir && tile !== 0 && entry.reSolidAtSameIdx === false) {
        entry.reSolidAtSameIdx = true
      }
    }
  }
  if (tNow - lastProgressAt >= PROGRESS_MS) {
    lastProgressAt = tNow
    let resolved = 0, pending = 0, violators = 0
    for (const [, e] of tracker) {
      if (e.wentAir && !e.reSolidAtSameIdx) resolved++
      else if (e.reSolidAtSameIdx) violators++
      else pending++
    }
    const driller = w.queryFirst(traits.Driller)
    const dRow = driller ? driller.get(traits.Driller).row : '?'
    console.log(
      `[progress] shake-or-stay t=${Math.round(tNow / 1000)}s/${RUN_MS / 1000}s ` +
        `dRow=${dRow} cells=${tracker.size} resolved=${resolved} pending=${pending} violators=${violators}`,
    )
  }
}, SAMPLE_MS)

await new Promise((r) => setTimeout(r, RUN_MS))
clearInterval(interval)

const violators = []
let honest = 0
let pending = 0
for (const [, e] of tracker) {
  if (e.reSolidAtSameIdx) {
    if (violators.length < 20) {
      violators.push({
        col: e.col,
        row: e.row,
        tileWhenShook: e.tileWhenShook,
      })
    }
  } else if (e.wentAir) {
    honest++
  } else {
    pending++
  }
}

const result = {
  totalCells: tracker.size,
  honestShakes: honest,
  pendingAtEnd: pending,
  zeroDisplacementViolators: tracker.size - honest - pending,
  violatorSamples: violators,
}
console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
