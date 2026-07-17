// Drop 3 rocks above the driller and watch what happens.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))

const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

// Let the driller dig a few rows down so we have a clear column above.
await new Promise(r => setTimeout(r, 6000))

let driller = null
w.query(traits.Driller).forEach(e => { driller ??= e })
const d = driller.get(traits.Driller)
console.log('driller @', d.col, d.row)

// Spawn 3 hazards in the driller's column, all warning state, will fall.
for (let i = 0; i < 3; i++) {
  w.spawn(traits.Hazard({
    col: d.col,
    py: 8,
    vy: 0,
    phase: 'warning',
    fallAtTick: 0, // fall immediately
  }))
}
console.log('spawned 3 hazards in col', d.col)

// Watch for 12s
const grid = w.get(traits.Grid)
const cols = grid.cols
let lastReport = 0
let lastDrillerRow = d.row
let stuckTicks = 0
const t0 = performance.now()

const interval = setInterval(() => {
  const now = performance.now() - t0
  let dCur = null
  w.query(traits.Driller).forEach(e => { if (!dCur) dCur = e.get(traits.Driller) })
  if (!dCur) return

  // Count rocks (TILE_STONE) above and around the driller.
  let rocksAbove = 0
  for (let r = Math.max(0, dCur.row - 10); r < dCur.row; r++) {
    const t = grid.tiles[r * cols + dCur.col]
    if (t === 2 /* TILE_STONE */) rocksAbove++
  }

  let target = null
  let m = null
  w.query(traits.Driller).forEach(e => { target ??= e.get(traits.PlannerTarget) })
  w.query(traits.Mood).forEach(e => { m ??= e.get(traits.Mood) })

  if (now - lastReport > 1000) {
    lastReport = now
    const tgt = target ? `${target.col},${target.row}` : '—'
    const mood = m ? `g${m.greed.toFixed(1)} f${m.fear.toFixed(1)} d${m.drive.toFixed(1)} [${m.planner}]` : ''
    console.log(`t=${(now/1000).toFixed(1)}s @(${dCur.col},${dCur.row}) dest=(${dCur.destCol},${dCur.destRow}) drillCD=${dCur.drillCooldownMs.toFixed(0)} rocksAbove=${rocksAbove} target=${tgt} ${mood}`)
  }

  if (dCur.row === lastDrillerRow) stuckTicks++
  else stuckTicks = 0
  lastDrillerRow = dCur.row
}, 50)

await new Promise(r => setTimeout(r, 12000))
clearInterval(interval)

let dFinal = null
w.query(traits.Driller).forEach(e => { dFinal ??= e.get(traits.Driller) })
console.log(`\nFINAL: driller @(${dFinal.col},${dFinal.row}) stuck-ticks=${stuckTicks}`)

// Print column above driller
const finalGrid = w.get(traits.Grid)
console.log(`COLUMN ${dFinal.col} from row ${dFinal.row - 12} to ${dFinal.row + 2}:`)
for (let r = Math.max(0, dFinal.row - 12); r < Math.min(finalGrid.rows, dFinal.row + 3); r++) {
  const idxL = r * finalGrid.cols + Math.max(0, dFinal.col - 1)
  const idxC = r * finalGrid.cols + dFinal.col
  const idxR = r * finalGrid.cols + Math.min(finalGrid.cols - 1, dFinal.col + 1)
  const code = (t) => t === 0 ? '.' : t === 1 ? '#' : t === 2 ? 'S' : t === 8 ? 'R' : t === 9 ? '!' : 'F'
  const marker = r === dFinal.row ? '<-driller' : ''
  console.log(`  r=${r}: ${code(finalGrid.tiles[idxL])} ${code(finalGrid.tiles[idxC])} ${code(finalGrid.tiles[idxR])} ${marker}`)
}
