// Observe driller cell movement cadence for ~6 seconds. Each tick we
// record (col,row); we want to see SOIL→AIR digs alternating with cell
// moves on side steps, and consistent fall/walk per-cell timings.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const observations = []
let lastCol = -1, lastRow = -1
const t0 = performance.now()
const interval = setInterval(() => {
  let d = null
  w.query(traits.Driller).forEach(e => { d ??= e.get(traits.Driller) })
  if (!d) return
  if (d.col !== lastCol || d.row !== lastRow) {
    observations.push({ t: Math.round(performance.now() - t0), col: d.col, row: d.row })
    lastCol = d.col; lastRow = d.row
  }
}, 16)

await new Promise(r => setTimeout(r, 6000))
clearInterval(interval)

// Print cell movements with deltas.
console.log('cell movements (t in ms, col, row, dt):')
for (let i = 0; i < observations.length; i++) {
  const o = observations[i]
  const prev = observations[i - 1]
  const dt = prev ? o.t - prev.t : 0
  const dir = prev
    ? o.col > prev.col ? '→'
    : o.col < prev.col ? '←'
    : o.row > prev.row ? '↓'
    : o.row < prev.row ? '↑' : '·'
    : '·'
  console.log(`  t=${String(o.t).padStart(5)}  ${dir}  (${o.col},${o.row})  dt=${dt}`)
}

// Look at the grid right now - is there a clear dug column?
const grid = w.get(traits.Grid)
let lastDriller = null
w.query(traits.Driller).forEach(e => { lastDriller ??= e.get(traits.Driller) })
const dr = lastDriller.row, dc = lastDriller.col
const top = Math.max(0, dr - 8)
const bot = Math.min(grid.rows, dr + 2)
console.log('\nGRID view around driller:')
for (let r = top; r < bot; r++) {
  let line = String(r).padStart(3) + ': '
  for (let c = 0; c < grid.cols; c++) {
    if (c === dc && r === dr) { line += '@'; continue }
    const t = grid.tiles[r * grid.cols + c]
    line += t === 0 ? '.' : t === 1 ? '#' : t === 2 ? 'S' : t === 8 ? 'R' : t === 9 ? '!' : 'F'
  }
  console.log(line)
}
console.log(`driller @(${dc},${dr})`)
