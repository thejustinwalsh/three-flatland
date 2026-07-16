// Probe: the `collect` user-action user surface. Find an armed
// non-collected gem in the world, park the pointer within its halo,
// fire commitAction('collect', gemEntity), then assert:
//   * the gem entity is destroyed (or marked collected)
//   * gems += GEM_VALUE[gem.size]
//   * the collect cooldown advances (unless in the free-fall band, in
//     which case the cooldown bypass branch runs)

const start = Date.now()
while (!window.__drillerWorld && Date.now() - start < 8000) {
  await new Promise((r) => setTimeout(r, 100))
}
await new Promise((r) => setTimeout(r, 1500))

const traits = await import('/src/traits/index.ts')
const input = await import('/src/systems/input.ts')
const w = window.__drillerWorld

w.set(traits.GameState, { runState: 'playing', gems: 0 })

// Poll up to 4s for a usable gem in the world (generation seeds them
// in soil; if none surface, seed one ourselves).
let target = null
const deadline = Date.now() + 4000
while (Date.now() < deadline && !target) {
  w.query(traits.Gem).forEach((entity) => {
    if (target) return
    const g = entity.get(traits.Gem)
    if (!g || g.collected) return
    target = { entity, gem: g }
  })
  if (!target) await new Promise((r) => setTimeout(r, 200))
}

if (!target) {
  // Seed a gem deterministically. World-row mid-grid, soil typical row.
  const grid = w.get(traits.Grid)
  const col = Math.floor(grid.cols / 2)
  const row = Math.floor(grid.rows / 3)
  const e = w.spawn(traits.Gem({ col, row, color: 'amethyst', size: 'medium', collected: false }))
  target = { entity: e, gem: e.get(traits.Gem) }
  console.log('[probe] seeded gem at', col, row)
} else {
  console.log('[probe] found gem at', target.gem.col, target.gem.row, target.gem.size)
}

// Park pointer ON the gem cell — exact-cell match should always win.
w.set(traits.Pointer, {
  hoverTargetCol: target.gem.col,
  hoverTargetRow: target.gem.row,
  hoverAction: 'collect',
  collectCooldownUntilTick: 0,
})

const gsBefore = w.get(traits.GameState)
const ok = input.commitAction(w, 'collect', target.entity)
console.log('[probe] collect commit returned', ok)
await new Promise((r) => setTimeout(r, 100))

const gsAfter = w.get(traits.GameState)
const ptrAfter = w.get(traits.Pointer)

// Gem entity should be destroyed after commitAction('collect'). If the
// entity is still alive AND has collected=true we still treat it as
// success — that's a valid alternate path some engines take.
let gemAlive = false
let gemCollected = false
try {
  const stillThere = target.entity.get(traits.Gem)
  if (stillThere) {
    gemAlive = true
    gemCollected = !!stillThere.collected
  }
} catch (_e) {
  // entity has been destroyed — also valid.
}

const result = {
  ok,
  cell: { col: target.gem.col, row: target.gem.row },
  size: target.gem.size,
  gemsBefore: gsBefore.gems,
  gemsAfter: gsAfter.gems,
  gemAlive,
  gemCollected,
  collectCooldownUntilTickAfter: ptrAfter.collectCooldownUntilTick,
  tickAfter: gsAfter.tick,
}
console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))
