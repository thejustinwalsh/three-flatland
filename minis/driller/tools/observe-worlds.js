// Teleport through worlds, observe transitions and free-fall.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const biomes = await import('/src/biomes.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

// Teleport driller to right above the first world's void band so we can
// observe the free-fall transition into world 1.
const targetRow = biomes.WORLD_BODY_ROWS - 4 // row 96
let driller = null
w.query(traits.Driller).forEach(e => { driller ??= e })
driller.set(traits.Driller, {
  col: 9, row: targetRow,
  px: 9 * 16 + 8, py: targetRow * 16 + 8,
  destCol: 9, destRow: targetRow,
})

console.log(`teleported to row ${targetRow} (just above void band at row ${biomes.WORLD_BODY_ROWS})`)

const t0 = performance.now()
const log = []
const interval = setInterval(() => {
  let d = null
  w.query(traits.Driller).forEach(e => { if (!d) d = e.get(traits.Driller) })
  const gs = w.get(traits.GameState)
  const biome = biomes.biomeAt(d.row)
  const inFreeFall = biomes.isFreeFall(d.row)
  log.push({
    t: Math.round(performance.now() - t0),
    row: d.row,
    biome: biome.name,
    free: inFreeFall,
    depth: gs.depthM,
  })
}, 200)

await new Promise(r => setTimeout(r, 12000))
clearInterval(interval)

let lastBiome = null
let lastFree = null
console.log('\nrow / biome / freeFall transitions:')
for (const s of log) {
  if (s.biome !== lastBiome || s.free !== lastFree) {
    console.log(`  t=${String(s.t).padStart(5)}  row=${s.row}  biome=${s.biome}  free=${s.free}  depthM=${s.depth}`)
  }
  lastBiome = s.biome
  lastFree = s.free
}
