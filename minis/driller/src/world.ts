import { createWorld, type World } from 'koota'
import { Animation, Camera, Drag, Driller, GameState, Grid, Mood, PetEvents, Pointer, Seed } from './traits'

/**
 * HMR-safe global handle. Module re-evaluation under HMR creates a new
 * `__drillerWorld` symbol; the guard reuses the previous instance if it
 * still has GameState attached.
 */
declare global {
  // eslint-disable-next-line no-var
  var __drillerWorld: World | undefined
}

/**
 * One-time world setup: install singleton traits.
 *
 * Per-run state (depth, lives, gems) is reset elsewhere — this only
 * sets the structural traits the rest of the game expects to exist.
 */
function initWorld(world: World): void {
  world.add(GameState({ mode: 'hero', runState: 'playing', tick: 0, gems: 0, lives: 3, depthM: 0, deepestM: 0, worldNumber: 0 }))
  world.add(Seed({ value: (Date.now() & 0xffff) ^ 0x1234 }))
  world.add(Camera({ y: 0, targetY: 0, scale: 4, rows: 40 }))
  world.add(Grid({
    cols: 18,
    rows: 0,
    topRow: 0,
    bottomRow: 0,
    tiles: new Uint8Array(0),
    flags: new Uint8Array(0),
    frameIndex: new Uint8Array(0),
    hits: new Uint8Array(0),
    clusterId: new Uint16Array(0),
    anchorDist: new Uint8Array(0),
  }))
  world.add(Pointer({ px: 0, py: 0, active: false, hoverAction: 'none', hoverTargetCol: 0, hoverTargetRow: 0, hoverGemEntity: 0 }))
  world.add(Drag({ clusterId: 0, anchorCol: 0, anchorRow: 0, startTick: 0, intervalsCharged: 0 }))

  // Driller entity — single instance, replaced on respawn (Phase 10).
  // Spawn at the surface (col 9 ≈ middle of 18-wide world, row 0).
  world.spawn(
    Driller({ col: 9, row: 0, px: 9 * 16 + 8, py: 8, destCol: 9, destRow: 0, facing: 1, drillCooldownMs: 0 }),
    Mood({ greed: 0.2, fear: 0.1, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    Animation({ state: 'idle', frame: 0, frameAccumMs: 0 }),
    PetEvents(),
  )
}

/**
 * Lazy, client-only access to the singleton Koota world. Survives HMR by
 * stashing the world on `globalThis.__drillerWorld`.
 */
export function getWorld(): World {
  if (typeof window === 'undefined') {
    throw new Error('World can only be accessed on the client')
  }
  if (globalThis.__drillerWorld && globalThis.__drillerWorld.has(GameState)) {
    return globalThis.__drillerWorld
  }
  const world = createWorld()
  initWorld(world)
  globalThis.__drillerWorld = world
  return world
}
