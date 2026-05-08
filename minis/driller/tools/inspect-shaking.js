// Inventory cells with FLAG_SHAKING — tile type, cluster size, position
// relative to the driller. Catches stuck-shake-without-fall bugs.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

// Sample once per second for 8 seconds — lots of chances to see clusters.
const FLAG_SHAKING = 1 << 5
const FLAG_DISTURBED = 1 << 4
const FLAG_SAGGING = 1 << 0

for (let sample = 0; sample < 8; sample++) {
  await new Promise(r => setTimeout(r, 1000))
  const grid = w.get(traits.Grid)
  let driller = null
  w.query(traits.Driller).forEach(e => { driller ??= e.get(traits.Driller) })

  const shaking = []
  for (let i = 0; i < grid.tiles.length; i++) {
    const f = grid.flags[i] ?? 0
    if ((f & FLAG_SHAKING) !== 0) {
      const c = i % grid.cols
      const r = (i - c) / grid.cols
      shaking.push({
        idx: i, c, r,
        tile: grid.tiles[i],
        disturbed: (f & FLAG_DISTURBED) !== 0,
        sagging: (f & FLAG_SAGGING) !== 0,
      })
    }
  }

  // Group by tile-class and report.
  const tileBins = {}
  for (const s of shaking) {
    const tag = s.tile === 0 ? 'AIR' : s.tile === 1 ? 'SOIL' : s.tile === 2 ? 'STONE' : s.tile === 8 ? 'ROCK' : `t${s.tile}`
    tileBins[tag] = (tileBins[tag] ?? 0) + 1
  }
  // Sample positions of stuck-shaking STONE cells (no DISTURBED bit
  // shouldn't normally happen, but is exactly the "stuck" symptom).
  const stuckStones = shaking.filter(s => s.tile === 2 && !s.disturbed)
  const dRow = driller?.row ?? 0
  const dCol = driller?.col ?? 0
  console.log(`t=${sample + 1}s driller=(${dCol},${dRow}) shaking=${shaking.length} bins=${JSON.stringify(tileBins)} stuck-no-disturbed=${stuckStones.length}`)
  if (stuckStones.length > 0) {
    for (const s of stuckStones.slice(0, 8)) {
      console.log(`  stuck STONE @(${s.c},${s.r}) sagging=${s.sagging}`)
    }
  }
}
