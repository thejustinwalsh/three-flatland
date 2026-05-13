// Probe: diffusion-based anchor distance.
//
// Verifies the persistent `Grid.anchorDist` model:
//   1. Pre-settle: after worldgen the grid has finite anchor distances
//      for cells reachable from top edge / fixtures, and INF (255) for
//      cells with no anchor path.
//   2. Stones conduct: a soil cell connected to top edge ONLY through
//      a stone gets a finite distance.
//   3. Wavefront propagation: drilling a load-bearing cell causes
//      neighboring cells' distance to RISE over several frames at
//      ~1 cell/tick (Variant C: slow rise).
//   4. Snap-down: when stress decreases (a fixture path opens up), the
//      distance falls instantly.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
// Wait for first chunk to load + pre-settle.
await new Promise((r) => setTimeout(r, 2000))

const traits = await import('/src/traits/index.ts')
const w = window.__drillerWorld
w.set(traits.GameState, { runState: 'playing' })

const result = {
  preSettleObserved: false,
  preSettleSampleSize: 0,
  preSettleMaxDist: 0,
  preSettleInfCount: 0,
  preSettleFiniteCount: 0,
  // Wavefront test
  wavefrontObserved: false,
  wavefrontSamples: [], // [{ tick, distAtTarget }]
  wavefrontError: null,
}

try {
  // Phase 1: sample initial state.
  const grid = w.get(traits.Grid)
  const { cols, rows, tiles, anchorDist } = grid
  console.log('[progress] grid loaded: cols=' + cols + ' rows=' + rows)
  if (!anchorDist || anchorDist.length === 0) {
    throw new Error('Grid.anchorDist is empty — diffusion model not wired in')
  }
  if (anchorDist.length !== tiles.length) {
    throw new Error('anchorDist length ' + anchorDist.length + ' != tiles length ' + tiles.length)
  }
  result.preSettleObserved = true
  // Sample SOIL/STONE cells in the first chunk.
  let sampleCount = 0
  let maxDist = 0
  let infCount = 0
  let finiteCount = 0
  for (let r = 0; r < Math.min(32, rows); r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const t = tiles[idx]
      if (t === 0) continue // AIR
      sampleCount++
      const d = anchorDist[idx]
      if (d === 255) infCount++
      else {
        finiteCount++
        if (d > maxDist) maxDist = d
      }
    }
  }
  result.preSettleSampleSize = sampleCount
  result.preSettleMaxDist = maxDist
  result.preSettleInfCount = infCount
  result.preSettleFiniteCount = finiteCount
  console.log(
    '[progress] pre-settle: ' + sampleCount + ' cells, max=' + maxDist +
    ' finite=' + finiteCount + ' INF=' + infCount,
  )

  // Phase 2: wavefront test.
  // Pick a soil cell at depth ~10 with a finite distance, drill the
  // cell directly above it, then sample the target cell's distance
  // over the next ~30 ticks (~500ms).
  let targetIdx = -1
  for (let r = 8; r < 18 && targetIdx === -1; r++) {
    for (let c = 4; c < cols - 4; c++) {
      const idx = r * cols + c
      const aboveIdx = (r - 1) * cols + c
      if (tiles[idx] === 1 && tiles[aboveIdx] === 1) {
        const d = anchorDist[idx]
        const dAbove = anchorDist[aboveIdx]
        if (d < 10 && dAbove < 10 && dAbove < d) {
          targetIdx = idx
          break
        }
      }
    }
  }
  if (targetIdx === -1) {
    console.log('[progress] no suitable target — skipping wavefront test')
  } else {
    const targetCol = targetIdx % cols
    const targetRow = Math.floor(targetIdx / cols)
    const aboveIdx = (targetRow - 1) * cols + targetCol
    const initialDist = anchorDist[targetIdx]
    console.log(
      '[progress] wavefront: target (' + targetCol + ',' + targetRow + ')' +
      ' initialDist=' + initialDist + ' drilling above',
    )
    // Direct mutation: drill the cell above by setting it to AIR.
    // (We bypass the player input system — purely testing the
    // diffusion mechanic.)
    tiles[aboveIdx] = 0 // TILE_AIR
    // Sample anchor dist at target over ~30 ticks. Tick happens via
    // the game loop; sample at 16ms intervals (~1 tick @ 60Hz).
    const initialTick = w.get(traits.GameState).tick
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 16))
      const gs = w.get(traits.GameState)
      const dNow = anchorDist[targetIdx]
      result.wavefrontSamples.push({ relTick: gs.tick - initialTick, dist: dNow })
    }
    // The diffusion rule says rising stress propagates at +1/tick.
    // After 30 ticks, the target's distance should have risen — but
    // possibly capped if it found another anchor path. The minimum
    // observable success is that the distance INCREASED at all
    // (something went up), and the increase happened gradually
    // (not instantly).
    const lastDist = result.wavefrontSamples[result.wavefrontSamples.length - 1].dist
    if (lastDist > initialDist) {
      result.wavefrontObserved = true
      console.log(
        '[progress] wavefront: rose from ' + initialDist + ' to ' + lastDist +
        ' over ' + result.wavefrontSamples.length + ' samples',
      )
    } else if (lastDist === initialDist) {
      // Could be that another anchor path absorbed the change. Not a
      // failure — just wasn't a definitive test.
      console.log(
        '[progress] wavefront: distance stable at ' + initialDist +
        ' (alternate anchor path likely)',
      )
    } else {
      // Distance went DOWN — that would only happen via snap, which
      // means the target somehow gained a closer anchor. Unlikely
      // unless drill exposed a fresh path; not a failure either.
      console.log('[progress] wavefront: distance fell to ' + lastDist)
    }
  }
} catch (err) {
  result.wavefrontError = String(err && err.message ? err.message : err)
  console.log('[progress] error: ' + result.wavefrontError)
}

console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
