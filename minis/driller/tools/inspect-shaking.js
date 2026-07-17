// Inventory cells with FLAG_SHAKING. Sample at high frequency to
// catch the actual shake window (which is only ~300ms wide).
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const FLAG_SHAKING = 1 << 5
const FLAG_DISTURBED = 1 << 4
const FLAG_SAGGING = 1 << 0

// Track which cell indices have been shaking for how long. If a cell
// stays in FLAG_SHAKING for many sample ticks, that's the bug we
// want to see.
const shakeSeenSince = new Map()
const samples = []

const t0 = performance.now()
for (let sample = 0; sample < 200; sample++) {
  await new Promise(r => setTimeout(r, 50)) // 20Hz sampling
  const tNow = performance.now() - t0
  const grid = w.get(traits.Grid)
  let driller = null
  w.query(traits.Driller).forEach(e => { driller ??= e.get(traits.Driller) })
  if (!driller) continue
  const dCol = driller.col, dRow = driller.row

  // Update shakeSeenSince map.
  const stillShaking = new Set()
  for (let i = 0; i < grid.tiles.length; i++) {
    const f = grid.flags[i] ?? 0
    if ((f & FLAG_SHAKING) !== 0) {
      stillShaking.add(i)
      if (!shakeSeenSince.has(i)) shakeSeenSince.set(i, tNow)
    }
  }
  // Drop entries for cells that stopped shaking.
  for (const i of [...shakeSeenSince.keys()]) {
    if (!stillShaking.has(i)) shakeSeenSince.delete(i)
  }

  // Aggregate stats.
  let stones = 0, soils = 0, stuck = 0, longest = 0
  for (const i of stillShaking) {
    const t = grid.tiles[i]
    if (t === 2) stones++
    if (t === 1) soils++
    const dur = tNow - shakeSeenSince.get(i)
    if (dur > 600) stuck++ // anything over 2× the design window is suspect
    if (dur > longest) longest = dur
  }
  samples.push({ tMs: Math.round(tNow), shaking: stillShaking.size, stones, soils, stuck, longest: Math.round(longest), dCol, dRow })
}

// Print a condensed summary — most "interesting" samples.
console.log('Per-sample (only when shaking changes):')
let prev = { shaking: -1 }
for (const s of samples) {
  if (s.shaking !== prev.shaking || s.stuck !== prev.stuck) {
    console.log(`  t=${String(s.tMs).padStart(5)}ms d=(${s.dCol},${s.dRow}) shaking=${s.shaking} (S:${s.stones} D:${s.soils}) stuck=${s.stuck} longest=${s.longest}ms`)
    prev = s
  }
}

// Stuck cells at end of sampling.
const final = w.get(traits.Grid)
const finalStuck = []
for (const [i, since] of shakeSeenSince) {
  const dur = (performance.now() - t0) - since
  if (dur > 600) {
    const c = i % final.cols
    const r = (i - c) / final.cols
    finalStuck.push({ c, r, tile: final.tiles[i], dur: Math.round(dur), flags: final.flags[i] })
  }
}
console.log(`\nCells STUCK shaking >600ms at end: ${finalStuck.length}`)
for (const s of finalStuck.slice(0, 16)) {
  console.log(`  @(${s.c},${s.r}) tile=${s.tile} flags=${s.flags.toString(2).padStart(8, '0')} dur=${s.dur}ms`)
}
