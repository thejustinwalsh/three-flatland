// Probe: codex rule 3 — within a single sag lifecycle, a cell
// should flip FLAG_SHAKING ON exactly once. Counted as the number
// of OFF→ON edges per cell. We allow a cell to shake ONCE before
// going AIR; cells that re-cycle through PRECARIOUS/SAGGING are
// fine, but if they SHAKE twice without falling in between, that's
// rule 3 violation.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const FLAG_SHAKING = 1 << 5

// per-idx: { shakeEdgeCount, prevShaking, fellToAir, lastShakeAt }
// shakeEdgeCount: number of OFF→ON edges of FLAG_SHAKING since the
//                 cell was first observed.
// fellToAir: cell became AIR at some point (legit fall).
//
// A "violator" is a cell with shakeEdgeCount > 1 at end of sampling
// AND no fall happened OR the second shake started before the cell
// went AIR after the first shake. Simplest formulation: count
// distinct shake-edges per cell-incarnation, where an "incarnation"
// is a continuous solid stretch (cell becomes AIR resets it).
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
    if (!entry) {
      entry = {
        shakeEdgeCount: 0,
        prevShaking: false,
        currentIncarnationShakes: 0,
        maxShakesPerIncarnation: 0,
        col: i % grid.cols,
        row: Math.floor(i / grid.cols),
      }
      tracker.set(i, entry)
    }
    // Count OFF→ON edge.
    if (shaking && !entry.prevShaking) {
      entry.shakeEdgeCount++
      entry.currentIncarnationShakes++
      if (entry.currentIncarnationShakes > entry.maxShakesPerIncarnation) {
        entry.maxShakesPerIncarnation = entry.currentIncarnationShakes
      }
    }
    // Cell went AIR — the incarnation ended. Subsequent shakes
    // (after a re-stamp by a future FallingChunk landing) start a
    // NEW incarnation. We track max-per-incarnation, not cumulative.
    if (tile === 0) {
      entry.currentIncarnationShakes = 0
    }
    entry.prevShaking = shaking
  }
  if (tNow - lastProgressAt >= PROGRESS_MS) {
    lastProgressAt = tNow
    let oneShake = 0,
      multiShake = 0,
      neverShook = 0
    for (const [, e] of tracker) {
      if (e.maxShakesPerIncarnation === 0) neverShook++
      else if (e.maxShakesPerIncarnation === 1) oneShake++
      else multiShake++
    }
    const driller = w.queryFirst(traits.Driller)
    const dRow = driller ? driller.get(traits.Driller).row : '?'
    console.log(
      `[progress] single-shake t=${Math.round(tNow / 1000)}s/${RUN_MS / 1000}s ` +
        `dRow=${dRow} cells=${tracker.size} oneShake=${oneShake} multiShake=${multiShake}`
    )
  }
}, SAMPLE_MS)

await new Promise((r) => setTimeout(r, RUN_MS))
clearInterval(interval)

let oneShake = 0
let neverShook = 0
const violators = []
for (const [, e] of tracker) {
  if (e.maxShakesPerIncarnation === 0) neverShook++
  else if (e.maxShakesPerIncarnation === 1) oneShake++
  else if (violators.length < 20) {
    violators.push({
      col: e.col,
      row: e.row,
      maxShakes: e.maxShakesPerIncarnation,
      cumulativeShakes: e.shakeEdgeCount,
    })
  }
}

const result = {
  totalCellsObserved: tracker.size,
  neverShook,
  oneShakePerIncarnation: oneShake,
  multiShakeViolators: tracker.size - neverShook - oneShake,
  violatorSamples: violators,
}
console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
