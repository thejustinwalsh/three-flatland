// Long-running observation: every cell that turns ON FLAG_SHAKING
// gets tracked. We watch what happens to it. If it doesn't go to
// AIR (= actually fell) within FALL_DEADLINE_MS of the last shake
// being on, that's a false-shake bug. Print the offenders along
// with the cell's tile class, position, and full flag history.
const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) await new Promise(r => setTimeout(r, 100))
await new Promise(r => setTimeout(r, 1500))
const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

// Teleport the driller to a deeper biome where there are stone
// clusters + avalanche risk + hazards. Lets us observe shake
// behaviour where it actually matters.
let driller = null
w.query(traits.Driller).forEach(e => { driller ??= e })
driller.set(traits.Driller, {
  col: 9, row: 220,
  px: 9 * 16 + 8, py: 220 * 16 + 8,
  destCol: 9, destRow: 220,
})
await new Promise(r => setTimeout(r, 500))

const FLAG_SHAKING = 1 << 5
const FLAG_SAGGING = 1 << 0
const FLAG_DISTURBED = 1 << 4
const FLAG_FALLING = 1 << 1

// per-idx tracking
// shakeOnAt: first time we saw FLAG_SHAKING ON for this cell
// shakeLastOnAt: last sample where we saw it ON
// resolved: true if cell became AIR after shake
// finalTile: tile value at sample end
const tracker = new Map()

const t0 = performance.now()
const SAMPLE_INTERVAL_MS = 50
const RUN_DURATION_MS = 25000
const FALL_DEADLINE_MS = 1500 // generous window after last shake

const interval = setInterval(() => {
  const grid = w.get(traits.Grid)
  const tNow = performance.now() - t0
  for (let i = 0; i < grid.tiles.length; i++) {
    const f = grid.flags[i] ?? 0
    const tile = grid.tiles[i]
    const isShaking = (f & FLAG_SHAKING) !== 0
    let entry = tracker.get(i)

    if (isShaking) {
      if (!entry) {
        entry = {
          firstShakeAt: tNow,
          lastShakeAt: tNow,
          startedAsTile: tile,
          firstFlags: f,
          resolved: false,
          finalTile: tile,
          finalFlags: f,
          maxShakeDuration: 0,
        }
        tracker.set(i, entry)
      } else {
        entry.lastShakeAt = tNow
        const dur = entry.lastShakeAt - entry.firstShakeAt
        if (dur > entry.maxShakeDuration) entry.maxShakeDuration = dur
      }
    }

    if (entry) {
      entry.finalTile = tile
      entry.finalFlags = f
      // Resolved = the cell is now AIR (truly fell) OR it lost
      // FLAG_SHAKING but is in some non-shake state for a while.
      if (tile === 0 && !entry.resolved) {
        entry.resolved = true
        entry.resolvedAt = tNow
      }
    }
  }
}, SAMPLE_INTERVAL_MS)

await new Promise(r => setTimeout(r, RUN_DURATION_MS))
clearInterval(interval)

// Classify each tracked cell.
const stats = {
  total: tracker.size,
  resolvedFell: 0,        // good — became AIR after shake
  shookButStillSolid: 0,  // BAD — shook, never fell, still tile != AIR at end
  shookBriefly: 0,        // OK — shook 1 frame then stopped (false alarm but not stuck)
}
const offenders = []
for (const [idx, e] of tracker) {
  const finishedAt = performance.now() - t0
  const sinceLastShake = finishedAt - e.lastShakeAt
  const shakeDuration = e.lastShakeAt - e.firstShakeAt
  if (e.resolved) {
    stats.resolvedFell++
  } else if (sinceLastShake > FALL_DEADLINE_MS && e.finalTile !== 0) {
    stats.shookButStillSolid++
    if (offenders.length < 20) {
      const grid = w.get(traits.Grid)
      const c = idx % grid.cols
      const r = (idx - c) / grid.cols
      offenders.push({
        c, r, tile: e.finalTile, finalFlags: e.finalFlags,
        firstShakeAt: Math.round(e.firstShakeAt),
        lastShakeAt: Math.round(e.lastShakeAt),
        shakeDurationMs: Math.round(shakeDuration),
      })
    }
  } else if (shakeDuration < 100) {
    stats.shookBriefly++
  }
}

console.log('=== FALSE-SHAKE STATS over ' + RUN_DURATION_MS + 'ms ===')
console.log(JSON.stringify(stats, null, 2))
console.log('\n=== OFFENDERS (shook + still solid + no shake recently) ===')
for (const o of offenders) {
  const tag = o.tile === 1 ? 'SOIL' : o.tile === 2 ? 'STONE' : `t${o.tile}`
  console.log(`  @(${o.c},${o.r}) ${tag} flags=${o.finalFlags.toString(2).padStart(8, '0')} shakeDur=${o.shakeDurationMs}ms (first=${o.firstShakeAt}ms last=${o.lastShakeAt}ms)`)
}
