import { createWorld, type World } from 'koota'
import {
  Animation,
  Camera,
  Drag,
  Driller,
  GameState,
  Grid,
  Mood,
  PetEvents,
  Pointer,
  Seed,
} from './traits'
import { WORLD_LENGTH_ROWS } from './biomes'
import type { DrillerMode } from './types'

interface WorldOptions {
  mode: DrillerMode
  seed?: number
}

function readDevStartWorld(): number {
  if (!import.meta.env.DEV || typeof window === 'undefined') return 0
  const value = Number.parseInt(new URLSearchParams(window.location.search).get('world') ?? '0', 10)
  return Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : 0
}

function readDevStartRow(defaultRow: number): number {
  if (!import.meta.env.DEV || typeof window === 'undefined') return defaultRow
  const value = Number.parseInt(
    new URLSearchParams(window.location.search).get('row') ?? `${defaultRow}`,
    10
  )
  return Number.isFinite(value)
    ? Math.max(0, Math.min(WORLD_LENGTH_ROWS * 5 - 1, value))
    : defaultRow
}

/**
 * HMR-safe global handle. Module re-evaluation under HMR creates a new
 * `__drillerWorld` symbol; the guard reuses the previous instance if it
 * still has GameState attached.
 */
declare global {
  var __drillerWorld: World | undefined
}

/**
 * One-time world setup: install singleton traits.
 *
 * Per-run state (depth, lives, gems) is reset elsewhere — this only
 * sets the structural traits the rest of the game expects to exist.
 */
function initWorld(world: World, options: WorldOptions): void {
  const startWorld = readDevStartWorld()
  const defaultStartRow = startWorld * WORLD_LENGTH_ROWS + (startWorld === 0 ? 0 : 12)
  const startRow = readDevStartRow(defaultStartRow)
  const startY = startRow * 16 + 8
  const cameraY = Math.max(0, (startRow - 10) * 16)
  world.add(
    GameState({
      mode: options.mode,
      runState: options.mode === 'full' ? 'attract' : 'playing',
      tick: 0,
      gems: 0,
      lives: 3,
      depthM: startRow,
      deepestM: startRow,
      worldNumber: startWorld,
    })
  )
  world.add(Seed({ value: options.seed ?? (Date.now() & 0xffff) ^ 0x1234 }))
  world.add(Camera({ y: cameraY, targetY: cameraY, scale: 4, rows: 40 }))
  world.add(
    Grid({
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
    })
  )
  world.add(
    Pointer({
      px: 0,
      py: 0,
      worldPx: 0,
      worldPy: 0,
      vacuumHasPoint: false,
      active: false,
      hoverAction: 'none',
      hoverTargetCol: 0,
      hoverTargetRow: 0,
      hoverGemEntity: 0,
      lockedAction: 'none',
    })
  )
  world.add(Drag({ clusterId: 0, anchorCol: 0, anchorRow: 0, startTick: 0, intervalsCharged: 0 }))

  // In normal play this is the surface. Development can pass ?world=0..4
  // to boot directly into a biome for deterministic visual QA.
  world.spawn(
    Driller({
      col: 9,
      row: startRow,
      px: 9 * 16 + 8,
      py: startY,
      destCol: 9,
      destRow: startRow,
      facing: 1,
      drillCooldownMs: 0,
    }),
    Mood({ greed: 0.2, fear: 0.1, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    Animation({ state: 'idle', frame: 0, frameAccumMs: 0 }),
    PetEvents()
  )
}

/**
 * Lazy, client-only access to the singleton Koota world. Survives HMR by
 * stashing the world on `globalThis.__drillerWorld`.
 */
export function getWorld(options: WorldOptions): World {
  if (typeof window === 'undefined') {
    throw new Error('World can only be accessed on the client')
  }
  if (globalThis.__drillerWorld && globalThis.__drillerWorld.has(GameState)) {
    return globalThis.__drillerWorld
  }
  const world = createWorld()
  initWorld(world, options)
  globalThis.__drillerWorld = world
  return world
}
