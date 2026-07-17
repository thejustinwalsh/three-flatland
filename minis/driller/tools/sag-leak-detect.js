// Compare cells-flagged-SAGGING vs cells-tracked-by-SaggingChunk
// entities. Any mismatch = a leak.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const FLAG_SAGGING = 1 << 0

const t0 = performance.now()
const samples = []

// Track SaggingChunk entities by their startTick — see if any
// entity stays alive longer than SAG_DURATION_TICKS = 42 (~700ms).
const entityLifetimes = new Map() // startTick → first time we saw it

const interval = setInterval(() => {
  const grid = w.get(traits.Grid)
  const gs = w.get(traits.GameState)
  const t = Math.round(performance.now() - t0)

  let entityCount = 0
  let oldestEntityElapsedTicks = 0
  w.query(traits.SaggingChunk).forEach((entity) => {
    entityCount++
    const sag = entity.get(traits.SaggingChunk)
    const elapsedTicks = gs.tick - sag.startTick
    if (elapsedTicks > oldestEntityElapsedTicks) oldestEntityElapsedTicks = elapsedTicks
    if (!entityLifetimes.has(sag.startTick)) entityLifetimes.set(sag.startTick, t)
  })

  if (entityCount > 0) {
    samples.push({ t, entityCount, oldestElapsedTicks: oldestEntityElapsedTicks, currentTick: gs.tick })
  }
}, 100)

await new Promise(r => setTimeout(r, 60000))
clearInterval(interval)

console.log('Samples with at least one SaggingChunk:', samples.length)
let maxElapsed = 0
let maxEntities = 0
for (const s of samples) maxElapsed = Math.max(maxElapsed, s.oldestElapsedTicks), maxEntities = Math.max(maxEntities, s.entityCount)
console.log(`maxOldestElapsedTicks=${maxElapsed} (SAG_DURATION_TICKS=42) maxEntityCount=${maxEntities}`)
console.log('\nSamples where oldest entity elapsed > SAG_DURATION_TICKS (42):')
for (const s of samples) {
  if (s.oldestElapsedTicks > 42) {
    console.log(`  t=${String(s.t).padStart(6)}ms tick=${s.currentTick} entities=${s.entityCount} oldestElapsedTicks=${s.oldestElapsedTicks}`)
  }
}
