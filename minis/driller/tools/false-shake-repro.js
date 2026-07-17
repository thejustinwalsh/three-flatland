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

// Stay in the first biome — the user's reported repro. Don't
// teleport; let the driller actually play through the first
// biome (and its void, and the next) so we observe the bug in
// the natural flow.
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
const SAMPLE_INTERVAL_MS = 33   // ~30Hz so we don't miss a 300ms shake
const RUN_DURATION_MS = 180000  // 3 min — patient observation through several biome cycles
const FALL_DEADLINE_MS = 1500   // generous window after last shake
const STUCK_THRESHOLD_MS = 500  // shake longer than this without resolution = bug

// Also track FLAG_SAGGING. A cell that stays in SAG for > SAG_DURATION
// (700ms) without resolving is a stalled sag — same bug class.
const sagTracker = new Map()

const interval = setInterval(() => {
  const grid = w.get(traits.Grid)
  const tNow = performance.now() - t0
  for (let i = 0; i < grid.tiles.length; i++) {
    const f = grid.flags[i] ?? 0
    const tile = grid.tiles[i]
    const isSagging = (f & FLAG_SAGGING) !== 0
    let sagEntry = sagTracker.get(i)
    if (isSagging) {
      if (!sagEntry) {
        sagEntry = { firstAt: tNow, lastAt: tNow, currentRun: tNow, longest: 0, finalTile: tile, stillSet: true }
        sagTracker.set(i, sagEntry)
      } else {
        if (tNow - sagEntry.lastAt > SAMPLE_INTERVAL_MS * 2.5) sagEntry.currentRun = tNow
        sagEntry.lastAt = tNow
        sagEntry.stillSet = true
        const cont = tNow - sagEntry.currentRun
        if (cont > sagEntry.longest) sagEntry.longest = cont
      }
    } else if (sagEntry) {
      sagEntry.stillSet = false
    }
    if (sagEntry) sagEntry.finalTile = tile
    const isShaking = (f & FLAG_SHAKING) !== 0
    let entry = tracker.get(i)

    if (isShaking) {
      if (!entry) {
        entry = {
          firstShakeAt: tNow,
          lastShakeAt: tNow,
          currentRunStart: tNow,        // start of current continuous-on run
          longestContinuousMs: 0,
          startedAsTile: tile,
          firstFlags: f,
          resolved: false,
          finalTile: tile,
          finalFlags: f,
          stillShakingAtEnd: true,
        }
        tracker.set(i, entry)
      } else {
        // If we missed a sample (>2 sample intervals since last
        // shake), this is a NEW continuous run.
        if (tNow - entry.lastShakeAt > SAMPLE_INTERVAL_MS * 2.5) {
          entry.currentRunStart = tNow
        }
        entry.lastShakeAt = tNow
        const continuous = tNow - entry.currentRunStart
        if (continuous > entry.longestContinuousMs) {
          entry.longestContinuousMs = continuous
        }
        entry.stillShakingAtEnd = true
      }
    } else if (entry) {
      entry.stillShakingAtEnd = false
    }

    if (entry) {
      entry.finalTile = tile
      entry.finalFlags = f
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
  resolvedFell: 0,
  longestContinuousMs: 0,
  stillShakingAtEnd: 0,
  trueStuckShakes: 0, // continuous shake > STUCK_THRESHOLD_MS
}
const stuck = []
const grid = w.get(traits.Grid)
for (const [idx, e] of tracker) {
  const c = idx % grid.cols
  const r = (idx - c) / grid.cols
  const tag = e.finalTile === 1 ? 'SOIL' : e.finalTile === 2 ? 'STONE' : `t${e.finalTile}`
  if (e.longestContinuousMs > stats.longestContinuousMs) stats.longestContinuousMs = e.longestContinuousMs
  if (e.resolved) stats.resolvedFell++
  if (e.stillShakingAtEnd) stats.stillShakingAtEnd++
  if (e.longestContinuousMs > STUCK_THRESHOLD_MS) {
    stats.trueStuckShakes++
    if (stuck.length < 30) {
      stuck.push({
        c, r, tag, finalFlags: e.finalFlags, resolved: e.resolved,
        stillShakingAtEnd: e.stillShakingAtEnd,
        longestContinuousMs: Math.round(e.longestContinuousMs),
        firstShakeAt: Math.round(e.firstShakeAt),
        lastShakeAt: Math.round(e.lastShakeAt),
      })
    }
  }
}

const driller = w.queryFirst(traits.Driller)
const dRow = driller ? driller.get(traits.Driller).row : -1
console.log('=== FALSE-SHAKE STATS over ' + RUN_DURATION_MS + 'ms (driller depth ' + dRow + ') ===')
console.log(JSON.stringify(stats, null, 2))
console.log('\n=== TRUE STUCK SHAKES (continuous shake > ' + STUCK_THRESHOLD_MS + 'ms) ===')
for (const s of stuck) {
  console.log(`  @(${s.c},${s.r}) ${s.tag} flags=${s.finalFlags.toString(2).padStart(8, '0')} continuousMs=${s.longestContinuousMs} resolved=${s.resolved} stillShakingAtEnd=${s.stillShakingAtEnd}`)
}

// Sag tracking
const stalledSags = []
let stillSagging = 0, sagOver1s = 0
for (const [idx, s] of sagTracker) {
  if (s.stillSet) stillSagging++
  if (s.longest > 1000) sagOver1s++
  if (s.longest > 1500) {
    if (stalledSags.length < 30) {
      const c = idx % grid.cols
      const r = (idx - c) / grid.cols
      stalledSags.push({ c, r, finalTile: s.finalTile, longestSagMs: Math.round(s.longest), stillSet: s.stillSet })
    }
  }
}
console.log('\n=== SAG STATS ===')
console.log(JSON.stringify({ totalCellsSagged: sagTracker.size, stillSaggingAtEnd: stillSagging, sagOver1s }, null, 2))
console.log('\n=== STALLED SAGS (continuous SAG > 1.5s — should never exceed SAG_DURATION_TICKS=700ms) ===')
for (const s of stalledSags) {
  console.log(`  @(${s.c},${s.r}) tile=${s.finalTile} continuousSagMs=${s.longestSagMs} stillSagging=${s.stillSet}`)
}
