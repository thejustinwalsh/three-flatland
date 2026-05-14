// Probe: the `paint` user-action user surface, end-to-end. Pick a
// soil cell in the visible region, park the pointer on it, fire
// commitAction('paint'). Assert:
//   * tile flips SOIL → AIR
//   * gems debit by PAINT_COST_PER_TICK
//   * the FLAG_AUTOTILE_DIRTY bit is set on the painted cell (the
//     renderer + sag recheck rely on this)
//
// Regression bait: if `doPaint` ever gets refactored back into the
// anchor-distance-bump shape (the variant the user explicitly rejected
// before paint became "destroy now"), this fails because the tile
// would still be SOIL after one commit.

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))

const traits = await import('/src/traits/index.ts')
const input = await import('/src/systems/input.ts')
const constants = await import('/src/constants.ts')
const w = window.__drillerWorld

w.set(traits.GameState, { runState: 'playing', gems: 99 })

const grid = w.get(traits.Grid)
const driller = w.queryFirst(traits.Driller)
const d = driller.get(traits.Driller)

// Find a SOIL cell within a reasonable radius of the driller. The
// game-gen biases the top biome to soil, so a few cells below the
// driller's start row is almost always paintable.
let pickIdx = -1
let pickCol = -1
let pickRow = -1
const radius = 8
outer: for (let dr = 1; dr <= radius; dr++) {
  for (let dc = -radius; dc <= radius; dc++) {
    const c = d.col + dc
    const r = d.row + dr
    if (c < 0 || c >= grid.cols || r < 0 || r >= grid.rows) continue
    const idx = r * grid.cols + c
    if (grid.tiles[idx] === traits.TILE_SOIL) {
      pickIdx = idx
      pickCol = c
      pickRow = r
      break outer
    }
  }
}

if (pickIdx < 0) {
  console.log(
    'INTEGRATION_RESULT: ' +
      JSON.stringify({ ok: false, reason: 'no SOIL cell within radius of driller' }),
  )
} else {
  const tileBefore = grid.tiles[pickIdx]
  const flagBefore = grid.flags[pickIdx] ?? 0
  const gsBefore = w.get(traits.GameState)

  w.set(traits.Pointer, {
    hoverTargetCol: pickCol,
    hoverTargetRow: pickRow,
    hoverAction: 'paint',
  })

  const ok = input.commitAction(w, 'paint', null)
  console.log('[probe] paint commit returned', ok, 'on cell', pickCol, pickRow)

  // Sample the flags IMMEDIATELY after the commit, before any tick
  // advances. The autotile-pass system consumes FLAG_AUTOTILE_DIRTY on
  // its next tick, so even a 33ms sleep here would erase the signal
  // we're trying to verify. The tile flip and gem debit are durable;
  // the dirty bit is a same-tick consumable.
  const tileAfter = grid.tiles[pickIdx]
  const flagAfter = grid.flags[pickIdx] ?? 0
  const gsAfter = w.get(traits.GameState)

  const FLAG_AUTOTILE_DIRTY = 1 << 2
  const result = {
    ok,
    cell: { col: pickCol, row: pickRow },
    paintCostPerTick: constants.PAINT_COST_PER_TICK,
    tileSoil: traits.TILE_SOIL,
    tileAir: traits.TILE_AIR,
    tileBefore,
    tileAfter,
    flagBefore,
    flagAfter,
    flagAutotileDirty: FLAG_AUTOTILE_DIRTY,
    gemsBefore: gsBefore.gems,
    gemsAfter: gsAfter.gems,
  }
  console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
}
