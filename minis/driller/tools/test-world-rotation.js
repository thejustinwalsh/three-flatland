// Force the driller deep, observe the world-rotate transition.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

// Forcibly teleport the driller to depth 245 to trigger rotation soon.
let driller = null
w.query(traits.Driller).forEach(e => { driller ??= e })
driller.set(traits.Driller, {
  col: 9,
  row: 245,
  px: 9 * 16 + 8,
  py: 245 * 16 + 8,
  destCol: 9,
  destRow: 245,
})

// Watch GameState.depthM and worldNumber for 6 seconds.
const t0 = performance.now()
const snapshots = []
const interval = setInterval(() => {
  const gs = w.get(traits.GameState)
  let d = null
  w.query(traits.Driller).forEach(e => { if (!d) d = e.get(traits.Driller) })
  snapshots.push({
    t: Math.round(performance.now() - t0),
    depthM: gs.depthM,
    worldNumber: gs.worldNumber,
    drillerRow: d?.row ?? -1,
    drillerCol: d?.col ?? -1,
  })
}, 100)

await new Promise(r => setTimeout(r, 6000))
clearInterval(interval)

// Print transitions: any change in worldNumber, depthM jumping > 50, etc.
console.log('time | depthM | worldNumber | drillerCol,Row')
let prev = null
for (const s of snapshots) {
  const interesting = !prev ||
    s.worldNumber !== prev.worldNumber ||
    Math.abs(s.depthM - prev.depthM) > 30 ||
    Math.abs(s.drillerRow - prev.drillerRow) > 30
  if (interesting) {
    console.log(`  t=${String(s.t).padStart(5)}  depth=${String(s.depthM).padStart(4)}  world=${s.worldNumber}  driller=(${s.drillerCol},${s.drillerRow})`)
  }
  prev = s
}
console.log(`\nFINAL: depth=${snapshots.at(-1).depthM} world=${snapshots.at(-1).worldNumber} driller=(${snapshots.at(-1).drillerCol},${snapshots.at(-1).drillerRow})`)
console.log(`Snapshots collected: ${snapshots.length}`)
