// Inspect generated chunks for stone-cluster shape diversity. Look at
// each 4-connected TILE_STONE component and tally its size + footprint.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })
// Let the streamer build several chunks down.
await new Promise(r => setTimeout(r, 2000))

const grid = w.get(traits.Grid)
const { cols, rows, tiles } = grid

// Flood-fill 4-connected TILE_STONE components.
const seen = new Uint8Array(tiles.length)
const clusters = []
for (let i = 0; i < tiles.length; i++) {
  if (seen[i] || tiles[i] !== 2 /* STONE */) continue
  const cells = []
  const stack = [i]
  seen[i] = 1
  let minC = cols, maxC = -1, minR = rows, maxR = -1
  while (stack.length) {
    const idx = stack.pop()
    cells.push(idx)
    const c = idx % cols
    const r = (idx - c) / cols
    if (c < minC) minC = c
    if (c > maxC) maxC = c
    if (r < minR) minR = r
    if (r > maxR) maxR = r
    const ns = []
    if (c > 0) ns.push(idx - 1)
    if (c < cols - 1) ns.push(idx + 1)
    if (r > 0) ns.push(idx - cols)
    if (r < rows - 1) ns.push(idx + cols)
    for (const ni of ns) {
      if (!seen[ni] && tiles[ni] === 2) {
        seen[ni] = 1
        stack.push(ni)
      }
    }
  }
  clusters.push({ size: cells.length, w: maxC - minC + 1, h: maxR - minR + 1, top: minR, left: minC, cells })
}

clusters.sort((a, b) => a.top - b.top)
const sizeHistogram = {}
for (const cl of clusters) sizeHistogram[cl.size] = (sizeHistogram[cl.size] || 0) + 1

console.log('TOTAL STONE CLUSTERS:', clusters.length)
console.log('SIZE HISTOGRAM:', JSON.stringify(sizeHistogram))
console.log('AVALANCHE-ELIGIBLE (size>=4):', clusters.filter(c => c.size >= 4).length)
console.log('\nFirst 12 clusters (size, w×h, top-row):')
for (const cl of clusters.slice(0, 12)) {
  console.log(`  size=${cl.size} ${cl.w}x${cl.h} @row${cl.top}`)
}

// Render a few chunk-aligned snapshots so we can eye-ball shape variety.
console.log('\n--- world view rows 0-30 ---')
for (let r = 0; r < Math.min(rows, 30); r++) {
  let line = String(r).padStart(3) + ': '
  for (let c = 0; c < cols; c++) {
    const t = tiles[r * cols + c]
    line += t === 0 ? '.' : t === 1 ? '#' : t === 2 ? 'S' : t === 8 ? 'R' : t === 9 ? '!' : 'F'
  }
  console.log(line)
}
