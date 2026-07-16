// Probe: the `drag` user-action user surface, end-to-end. Find or
// seed a STONE cluster of 4+, start a drag on it, advance several
// game ticks, then assert:
//   * Drag.clusterId !== 0 (the drag is alive)
//   * No FLAG_FALLING or FLAG_SHAKING bit on cluster cells while held
//     (the avalanche system MUST skip the held cluster — this is the
//     "trait + NOT" gate)
//   * After endDrag, FLAG_FALLING re-arms (cluster resumes its fall)
//
// The avalanche-re-arms-FLAG_FALLING-mid-drag bug was the original
// motivation for this probe. Unit tests caught it once an isolation
// case was written; this is the live-system version that would have
// caught it at the integration boundary.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))

const traits = await import('/src/traits/index.ts')
const drag = await import('/src/systems/drag.ts')
const w = window.__drillerWorld

w.set(traits.GameState, { runState: 'playing', gems: 99 })

const FLAG_FALLING = 1 << 1
const FLAG_SHAKING = 1 << 5
const FLAG_AUTOTILE_DIRTY = 1 << 2

const grid = w.get(traits.Grid)

// Wait briefly for the world to settle a cluster — generation seeds
// stones in the lower biomes. Poll up to 5s for any cluster of 4+.
let anchor = null
const findClusterDeadline = Date.now() + 5000
while (Date.now() < findClusterDeadline && !anchor) {
  // Pass 1: gather size per cluster id.
  const sizeByCid = new Map()
  for (let i = 0; i < grid.tiles.length; i++) {
    if (grid.tiles[i] !== traits.TILE_STONE) continue
    const cid = grid.clusterId[i]
    if (!cid) continue
    sizeByCid.set(cid, (sizeByCid.get(cid) ?? 0) + 1)
  }
  // Pass 2: pick the first id with size >= 4; pick a representative cell.
  for (const [cid, size] of sizeByCid) {
    if (size < 4) continue
    for (let i = 0; i < grid.clusterId.length; i++) {
      if (grid.clusterId[i] === cid && grid.tiles[i] === traits.TILE_STONE) {
        const c = i % grid.cols
        const r = Math.floor(i / grid.cols)
        anchor = { cid, col: c, row: r, size }
        break
      }
    }
    if (anchor) break
  }
  if (!anchor) await new Promise((r) => setTimeout(r, 200))
}

if (!anchor) {
  // No rock cluster surfaced in 5s. Seed one synthetically — drag
  // mechanics are still under test even if generation didn't help. Drop
  // a 2×2 cluster in mid-grid, mark it with a fresh cluster id.
  const seedCol = Math.floor(grid.cols / 2)
  const seedRow = Math.floor(grid.rows / 2)
  let synthCid = 1
  for (let i = 0; i < grid.clusterId.length; i++) {
    if (grid.clusterId[i] > synthCid) synthCid = grid.clusterId[i]
  }
  synthCid++
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      const idx = (seedRow + dr) * grid.cols + (seedCol + dc)
      grid.tiles[idx] = traits.TILE_STONE
      grid.clusterId[idx] = synthCid
      grid.flags[idx] = (grid.flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
      grid.hits[idx] = 0
    }
  }
  anchor = { cid: synthCid, col: seedCol, row: seedRow, size: 4 }
  console.log('[probe] seeded synthetic 2x2 cluster at', seedCol, seedRow, 'cid=', synthCid)
} else {
  console.log(
    '[probe] found cluster cid=',
    anchor.cid,
    'size=',
    anchor.size,
    'at',
    anchor.col,
    anchor.row
  )
}

// Park pointer on the anchor cell so the dragSystem's offset math has
// a sane source.
w.set(traits.Pointer, {
  hoverTargetCol: anchor.col,
  hoverTargetRow: anchor.row,
  hoverAction: 'drag',
  active: true,
  lockedAction: 'drag',
})

const gsAtStart = w.get(traits.GameState)
const dragStarted = drag.startDrag(w, anchor.col, anchor.row)
console.log('[probe] startDrag returned', dragStarted, 'at tick', gsAtStart.tick)
const dragState = w.get(traits.Drag)

// Sample for ~1s — long enough that the avalanche system has run many
// times (it tick at 60Hz). Track whether ANY cluster cell ever flips
// FLAG_FALLING or FLAG_SHAKING during the held window.
let heldViolations = 0
const SAMPLE_MS = 33
const HOLD_MS = 1000
const samples = []
let heldUntil = Date.now() + HOLD_MS
let progressAt = 0
while (Date.now() < heldUntil) {
  for (let i = 0; i < grid.clusterId.length; i++) {
    if (grid.clusterId[i] !== anchor.cid) continue
    if (grid.tiles[i] !== traits.TILE_STONE) continue
    const f = grid.flags[i] ?? 0
    if ((f & (FLAG_FALLING | FLAG_SHAKING)) !== 0) {
      heldViolations++
      if (samples.length < 8) {
        const c = i % grid.cols
        const r = Math.floor(i / grid.cols)
        samples.push({ col: c, row: r, flags: f })
      }
    }
  }
  const now = Date.now()
  if (now - progressAt >= 250) {
    progressAt = now
    console.log(
      `[progress] drag held ${now - (heldUntil - HOLD_MS)}ms heldViolations=${heldViolations}`
    )
  }
  await new Promise((r) => setTimeout(r, SAMPLE_MS))
}

const gsBeforeRelease = w.get(traits.GameState)
drag.endDrag(w)
console.log('[probe] endDrag fired at tick', gsBeforeRelease.tick)

// Spend a tick or two so the avalanche system has time to re-apply
// FLAG_FALLING on the released cluster (assuming it can fall — if it's
// supported, FLAG_FALLING will stay clear, which is also valid).
await new Promise((r) => setTimeout(r, 200))

// Snapshot post-release flag state.
let postReleaseFalling = 0
let postReleaseCells = 0
for (let i = 0; i < grid.clusterId.length; i++) {
  if (grid.clusterId[i] !== anchor.cid) continue
  if (grid.tiles[i] !== traits.TILE_STONE) continue
  postReleaseCells++
  const f = grid.flags[i] ?? 0
  if ((f & FLAG_FALLING) !== 0) postReleaseFalling++
}
const dragStateAfter = w.get(traits.Drag)
const gsAtEnd = w.get(traits.GameState)

const result = {
  cluster: anchor,
  dragStarted,
  dragClusterId: dragState ? dragState.clusterId : 0,
  dragClusterIdAfterRelease: dragStateAfter ? dragStateAfter.clusterId : 0,
  heldDurationMs: HOLD_MS,
  heldViolations,
  heldViolationSamples: samples,
  postReleaseCells,
  postReleaseFalling,
  gemsBefore: gsAtStart.gems,
  gemsAfter: gsAtEnd.gems,
  ticksElapsed: gsAtEnd.tick - gsAtStart.tick,
}
console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
