// Sample d.px/d.py every frame to confirm SMOOTH motion (continuous
// pixel deltas), not just cell snaps.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

await new Promise(r => setTimeout(r, 800))

const samples = []
const t0 = performance.now()
const interval = setInterval(() => {
  let d = null
  w.query(traits.Driller).forEach(e => { d ??= e.get(traits.Driller) })
  if (!d) return
  samples.push({
    t: Math.round(performance.now() - t0),
    col: d.col, row: d.row,
    pCol: d.prevCol, pRow: d.prevRow,
    px: d.px.toFixed(2), py: d.py.toFixed(2),
    fcd: d.fallCooldownMs, dcd: d.digCooldownMs,
    sdur: d.stepDurationMs,
  })
}, 16)

await new Promise(r => setTimeout(r, 2000))
clearInterval(interval)

console.log('frame samples (t, prev→cur, py, cd, sdur):')
for (const s of samples.slice(0, 80)) {
  console.log(`  t=${String(s.t).padStart(5)} (${s.pCol},${s.pRow})→(${s.col},${s.row}) py=${s.py} fcd=${s.fcd} dcd=${s.dcd} sdur=${s.sdur}`)
}
