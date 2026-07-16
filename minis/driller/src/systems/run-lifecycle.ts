import type { World } from 'koota'
import {
  Animation,
  Camera,
  Driller,
  Drag,
  Explosive,
  FallingChunk,
  GameState,
  Gem,
  GemSpendPopup,
  Grid,
  Hazard,
  Mood,
  OverPetIndicator,
  Particle,
  PetEvents,
  Pointer,
  RockCluster,
  SaggingChunk,
  Seed,
} from '../traits'
import { PLAY_COLS, PLAY_ROWS, TILE_PX } from '../constants'
import { resetDeathSystem } from './death'
import { resetStreaming } from './generation'
import { resetAvalanche, resetHazardSpawn } from './hazard'

export interface ResetRunOptions {
  seed: number
  runState?: 'attract' | 'playing'
}

/**
 * Rebuild every piece of mutable per-run state after game over.
 * Structural singleton entities remain installed, while gameplay entities,
 * grid storage, timers, camera position, input state, and module caches are
 * reset atomically before the next title-screen frame can simulate.
 */
export function resetRun(world: World, options: ResetRunOptions): void {
  const previousGameState = world.get(GameState)
  const previousCamera = world.get(Camera)
  if (!previousGameState || !previousCamera) return

  resetDeathSystem()
  resetStreaming()
  resetHazardSpawn()
  resetAvalanche(world)

  world.query(Driller).forEach((entity) => entity.destroy())
  world.query(Gem).forEach((entity) => entity.destroy())
  world.query(Explosive).forEach((entity) => entity.destroy())
  world.query(Hazard).forEach((entity) => entity.destroy())
  world.query(SaggingChunk).forEach((entity) => entity.destroy())
  world.query(FallingChunk).forEach((entity) => entity.destroy())
  world.query(RockCluster).forEach((entity) => entity.destroy())
  world.query(Particle).forEach((entity) => entity.destroy())
  world.query(GemSpendPopup).forEach((entity) => entity.destroy())
  world.query(OverPetIndicator).forEach((entity) => entity.destroy())

  world.set(GameState, {
    mode: previousGameState.mode,
    runState: options.runState ?? 'attract',
    tick: 0,
    gems: 0,
    lives: 3,
    depthM: 0,
    deepestM: 0,
    worldNumber: 0,
  })
  world.set(Seed, { value: options.seed })
  world.set(Camera, {
    y: 0,
    targetY: 0,
    scale: previousCamera.scale,
    rows: previousCamera.rows || PLAY_ROWS,
  })
  world.set(Grid, {
    cols: PLAY_COLS,
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
  world.set(Pointer, {
    px: 0,
    py: 0,
    active: false,
    hoverAction: 'none',
    hoverTargetCol: 0,
    hoverTargetRow: 0,
    hoverGemEntity: 0,
    lockedAction: 'none',
    dragEntity: 0,
    dragHeldSinceTick: 0,
    dragLastCostTick: 0,
    collectCooldownUntilTick: 0,
  })
  world.set(Drag, {
    clusterId: 0,
    anchorCol: 0,
    anchorRow: 0,
    startTick: 0,
    intervalsCharged: 0,
  })

  const startY = TILE_PX / 2
  world.spawn(
    Driller({
      col: 9,
      row: 0,
      px: 9 * TILE_PX + TILE_PX / 2,
      py: startY,
      destCol: 9,
      destRow: 0,
      facing: 1,
      drillCooldownMs: 0,
    }),
    Mood({ greed: 0.2, fear: 0.1, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    Animation({ state: 'idle', frame: 0, frameAccumMs: 0 }),
    PetEvents()
  )
}
