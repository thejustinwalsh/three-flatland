// Probe: the hover-resolution priority order under contention.
// Setup: a soil cell exists at (col, row). Spawn a gem within the ±1
// Chebyshev halo of that cell but NOT on it. Set the pointer to the
// soil cell. Without the halo, action resolves to 'paint'. With the
// halo, gem wins → action resolves to 'collect'.
//
// This is the integration version of the unit-tested
// hover-priority.test.ts logic, but run against the real
// resolveHoverAction in the live world.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))

const traits = await import('/src/traits/index.ts')
const input = await import('/src/systems/input.ts')
const w = window.__drillerWorld

w.set(traits.GameState, { runState: 'playing', gems: 99 })

const grid = w.get(traits.Grid)
const driller = w.queryFirst(traits.Driller)
const d = driller.get(traits.Driller)

// Find a SOIL cell with an empty (TILE_AIR or SOIL) neighbor cell
// where we can drop a gem. Stay well away from the driller's cell so
// the pet-rule (priority 3) doesn't kick in.
let soilCol = -1
let soilRow = -1
let gemCol = -1
let gemRow = -1
outer: for (let dr = 4; dr <= 10; dr++) {
  for (let dc = -10; dc <= 10; dc++) {
    const c = d.col + dc
    const r = d.row + dr
    if (c < 1 || c >= grid.cols - 1 || r < 0 || r >= grid.rows) continue
    if (grid.tiles[r * grid.cols + c] !== traits.TILE_SOIL) continue
    // Try right-neighbor for the gem.
    const ngc = c + 1
    const ngr = r
    if (ngc >= grid.cols) continue
    // Gem can sit on any tile (it lives as an entity, not a grid tile),
    // and the halo is ±1 Chebyshev, so neighbor cell type doesn't
    // affect priority. Just don't pick a cell that's a different soil
    // sag or has unusual flags.
    soilCol = c
    soilRow = r
    gemCol = ngc
    gemRow = ngr
    break outer
  }
}

if (soilCol < 0) {
  console.log(
    'INTEGRATION_RESULT: ' + JSON.stringify({ ok: false, reason: 'no suitable soil+neighbor pair found' }),
  )
} else {
  // Resolve WITHOUT gem present (expect paint).
  // Note: there might be unrelated gems in the world; we filter by
  // distance from our test cell to the resolved entity (if any).
  const beforeSpawn = input.resolveHoverAction(w, soilCol, soilRow)

  // Spawn the contention gem in the halo.
  const gemEntity = w.spawn(
    traits.Gem({ col: gemCol, row: gemRow, color: 'topaz', size: 'small', collected: false }),
  )

  // Resolve again — gem should now win via halo.
  const afterSpawn = input.resolveHoverAction(w, soilCol, soilRow)

  const result = {
    ok: true,
    soilCell: { col: soilCol, row: soilRow },
    gemCell: { col: gemCol, row: gemRow },
    chebyDistance: Math.max(Math.abs(soilCol - gemCol), Math.abs(soilRow - gemRow)),
    beforeAction: beforeSpawn.action,
    afterAction: afterSpawn.action,
    // We can't pass an entity through JSON, but we can confirm the
    // returned gem matches OUR spawn by comparing trait values.
    matchedSpawnedGem: !!(
      afterSpawn.gemEntity &&
      afterSpawn.gemEntity.get(traits.Gem).col === gemCol &&
      afterSpawn.gemEntity.get(traits.Gem).row === gemRow
    ),
  }
  console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
}
