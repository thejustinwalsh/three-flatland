// Probe: every cell that ever turns ON FLAG_SHAKING must end up in
// AIR (the chunk actually fell). Cells that shook but stayed solid
// are contract violators.
//
// This script runs IN THE BROWSER via vitexec. It cannot import
// from node_modules or use Node APIs. All imports are
// vite-resolved /src/* paths.
//
// Final line MUST emit `INTEGRATION_RESULT: {...json...}` so the
// runner can parse the result.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const FLAG_SHAKING = 1 << 5

// per-idx: { startRow, fellToAir, finalTile, peakShakeMs }
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
        startRow: Math.floor(i / grid.cols),
        startCol: i % grid.cols,
        firstShakeAt: tNow,
        lastShakeAt: tNow,
        currentRunStart: tNow,
        peakShakeMs: 0,
        finalTile: tile,
        fellToAir: false,
      }
      tracker.set(i, entry)
    }
    if (entry) {
      if (shaking) {
        if (tNow - entry.lastShakeAt > SAMPLE_MS * 2.5) entry.currentRunStart = tNow
        entry.lastShakeAt = tNow
        const cont = tNow - entry.currentRunStart
        if (cont > entry.peakShakeMs) entry.peakShakeMs = cont
      }
      entry.finalTile = tile
      if (tile === 0) entry.fellToAir = true
    }
  }
  if (tNow - lastProgressAt >= PROGRESS_MS) {
    lastProgressAt = tNow
    let honest = 0,
      pending = 0
    for (const [, e] of tracker) {
      if (e.fellToAir) honest++
      else pending++
    }
    const driller = w.queryFirst(traits.Driller)
    const dRow = driller ? driller.get(traits.Driller).row : '?'
    console.log(
      `[progress] shake-contract t=${Math.round(tNow / 1000)}s/${RUN_MS / 1000}s ` +
        `dRow=${dRow} cellsTracked=${tracker.size} honest=${honest} pending=${pending}`
    )
  }
}, SAMPLE_MS)

await new Promise((r) => setTimeout(r, RUN_MS))
clearInterval(interval)

const violators = []
let honest = 0
for (const [, e] of tracker) {
  if (e.fellToAir) honest++
  else if (violators.length < 20) {
    violators.push({
      row: e.startRow,
      col: e.startCol,
      finalTile: e.finalTile,
      peakShakeMs: Math.round(e.peakShakeMs),
    })
  }
}
const violatorCount = tracker.size - honest

const result = {
  totalCells: tracker.size,
  honestShakes: honest,
  violators: violatorCount,
  violatorSamples: violators,
}
console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
