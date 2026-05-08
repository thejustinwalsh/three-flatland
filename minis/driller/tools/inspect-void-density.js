// Generate a few chunks and tally void gems by row-within-void.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 300))
const gen = await import('/src/systems/generation.ts')
const biomes = await import('/src/biomes.ts')
const { CHUNK_ROWS } = await import('/src/constants.ts')

// Chunks 3-7 contain world 0..1 boundaries — pick chunks straddling void
// for world 0, world 1, world 2 to compare progressive density.
const chunkSamples = [
  { worldIndex: 0, chunkY: 3 },
  { worldIndex: 1, chunkY: 7 },
  { worldIndex: 2, chunkY: 11 },
]
for (const { worldIndex, chunkY } of chunkSamples) {
  // Aggregate over a few seeds so we see the average shape.
  const histogram = new Map() // voidRow → gemCount across seeds
  let total = 0
  for (let seed = 1; seed <= 8; seed++) {
    const c = gen.generateChunk(seed, chunkY)
    for (const g of c.gems) {
      const absRow = chunkY * CHUNK_ROWS + g.rowInChunk
      if (!biomes.isFreeFall(absRow)) continue
      const voidRow = (absRow % biomes.WORLD_LENGTH_ROWS) - biomes.WORLD_BODY_ROWS
      histogram.set(voidRow, (histogram.get(voidRow) ?? 0) + 1)
      total++
    }
  }
  const sorted = [...histogram.entries()].sort((a, b) => a[0] - b[0])
  console.log(`\nworld ${worldIndex} (chunkY=${chunkY}) — total void gems across 8 seeds: ${total}`)
  console.log('  voidRow / count')
  for (const [r, n] of sorted) {
    const bar = '█'.repeat(n)
    console.log(`  ${String(r).padStart(3)}  ${bar} ${n}`)
  }
}
