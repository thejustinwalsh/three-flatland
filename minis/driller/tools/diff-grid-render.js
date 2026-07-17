// Diagnose: walk the SpriteBatch instance buffer to see what's actually
// being rendered, then ASCII-print grid-vs-render side by side.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })
await new Promise(r => setTimeout(r, 8000))

const grid = w.get(traits.Grid)
let driller = null
w.query(traits.Driller).forEach(e => { driller ??= e.get(traits.Driller) })
const dc = driller.col, dr = driller.row

const flat = window.__drillerFlat
const batch = flat.spriteGroup.children[0]
const matArr = batch.instanceMatrix.array
const cnt = batch._activeCount

const renderMap = new Map()
for (let i = 0; i < cnt; i++) {
  const o = i * 16
  const sx = matArr[o]
  if (sx === 0) continue
  const tx = matArr[o + 12]
  const ty = matArr[o + 13]
  const col = Math.round((tx - 8) / 16)
  const row = Math.round((-ty - 8) / 16)
  if (col < 0 || col >= grid.cols) continue
  if (row < 0 || row >= grid.rows) continue
  renderMap.set(row * grid.cols + col, true)
}

const top = Math.max(0, dr - 12)
const bot = Math.min(grid.rows, dr + 6)
const lines = []
lines.push('GRID                |  RENDER (any sprite at cell)')
for (let r = top; r < bot; r++) {
  let g = String(r).padStart(3) + ': '
  let v = String(r).padStart(3) + ': '
  for (let c = 0; c < grid.cols; c++) {
    if (c === dc && r === dr) { g += '@'; v += '@'; continue }
    const t = grid.tiles[r * grid.cols + c]
    g += t === 0 ? '.' : t === 1 ? '#' : t === 2 ? 'S' : t === 8 ? 'R' : t === 9 ? '!' : 'F'
    v += renderMap.has(r * grid.cols + c) ? '#' : '.'
  }
  lines.push(g + '  |  ' + v)
}
console.log(lines.join('\n'))
console.log('driller', dc, dr)
