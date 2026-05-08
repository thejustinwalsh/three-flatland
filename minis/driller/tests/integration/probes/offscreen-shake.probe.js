// Probe: blocks more than SCAN_WINDOW_ROWS_ABOVE rows above the
// driller MUST NEVER shake. Out-of-play history is anchored — the
// player drilling well below should not be re-evaluating sag chunks
// up there. SCAN_WINDOW_ROWS_ABOVE = 16 in src/systems/collapse.ts.
//
// Final line MUST emit INTEGRATION_RESULT: {...}.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const FLAG_SHAKING = 1 << 5
const ABOVE_PLAYFIELD_ROWS = 18 // a hair beyond the scan window — anything past here is a violation

const violations = []
const t0 = performance.now()
const RUN_MS = 120_000

const interval = setInterval(() => {
  const grid = w.get(traits.Grid)
  const driller = w.queryFirst(traits.Driller)
  if (!driller) return
  const dRow = driller.get(traits.Driller).row
  const tNow = performance.now() - t0
  for (let i = 0; i < grid.tiles.length; i++) {
    if ((grid.flags[i] & FLAG_SHAKING) === 0) continue
    const r = Math.floor(i / grid.cols)
    const distAbove = dRow - r
    if (distAbove > ABOVE_PLAYFIELD_ROWS && violations.length < 50) {
      violations.push({
        tMs: Math.round(tNow),
        row: r,
        col: i % grid.cols,
        drillerRow: dRow,
        distAbove,
        tile: grid.tiles[i],
      })
    }
  }
}, 33)

await new Promise((r) => setTimeout(r, RUN_MS))
clearInterval(interval)

const result = {
  runMs: RUN_MS,
  threshold: ABOVE_PLAYFIELD_ROWS,
  violationCount: violations.length,
  violationSamples: violations.slice(0, 20),
}
console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
