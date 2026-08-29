import { Suspense, useRef, useEffect, useMemo, useState } from 'react'
import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { Vector2 } from 'three'
import {
  Flatland,
  EmissiveEffect,
  Light2D,
  Sprite2D,
  AnimatedSprite2D,
  SpriteGroup,
  TileMap2D,
  SpriteSheetLoader,
  LDtkLoader,
  SortLayers,
  PixelPerfectCamera,
  attachLighting,
  attachEffect,
  type DdaExecutionPath,
  type AnimationSetDefinition,
  type SpriteFrame,
} from 'three-flatland/react'
import { exampleRendererColorConfig } from './rendererColorManagement'
import { ExampleFallback } from './ExampleFallback'
import { DdaFixedRadianceLightEffect, NormalMapProvider } from '@three-flatland/presets'
import '@three-flatland/presets/react'
import { usePane, usePaneFolder, usePaneInput } from '@three-flatland/devtools/react'
import {
  DEFAULT_BENCHMARK_SEED,
  benchmarkParams,
  createBenchmarkSimulationGate,
  createSeededRandom,
  integerParam,
  numberParam,
  publishBenchmarkReady,
  rendererGpuAdapterInfo,
} from '../../_shared/benchmark'
import { expandDungeonMap } from './dungeonLayout'

extend({
  Flatland,
  Sprite2D,
  AnimatedSprite2D,
  SpriteGroup,
  TileMap2D,
  Light2D,
  EmissiveEffect,
  DdaFixedRadianceLightEffect,
  NormalMapProvider,
})

// ============================================
// CONSTANTS
// ============================================

const TILE_PX = 16
const ART_WORLD_SCALE = 2
const TILE_SCALE = ART_WORLD_SCALE
const KNIGHT_SCALE = 32 * ART_WORLD_SCALE
const SLIME_SCALE = 24 * ART_WORLD_SCALE
const WALL_TILE = 24
const AUTHORED_LANDSCAPE = { width: 640, height: 360 } as const
const AUTHORED_PORTRAIT = { width: 360, height: 640 } as const
const DUNGEON_LIGHTING_DEFAULTS = {
  ambient: 0.28,
  torchEmission: 8,
  slimeEmission: 0.5,
  radianceRange: 8,
} as const
const WALL_TORCH_TILE_ID = 91
const FLOOR_TORCH_TILE_ID = 93
const TILE_FLIP_X = 0x80000000
const TILE_FLIP_Y = 0x40000000
const TILE_GID_MASK = 0x1fffffff
const WALL_TORCH_FRAME: SpriteFrame = {
  name: 'wall-torch',
  x: 0.1,
  y: 0,
  width: 0.1,
  height: 0.1,
  sourceWidth: TILE_PX,
  sourceHeight: TILE_PX,
}
const FLOOR_TORCH_FRAME: SpriteFrame = {
  name: 'floor-torch',
  x: 0.3,
  y: 0,
  width: 0.1,
  height: 0.1,
  sourceWidth: TILE_PX,
  sourceHeight: TILE_PX,
}

type AuthoredSurface = { width: number; height: number }

function authoredSurface(): AuthoredSurface {
  const landscapeFit = Math.min(
    window.innerWidth / AUTHORED_LANDSCAPE.width,
    window.innerHeight / AUTHORED_LANDSCAPE.height
  )
  const portraitFit = Math.min(
    window.innerWidth / AUTHORED_PORTRAIT.width,
    window.innerHeight / AUTHORED_PORTRAIT.height
  )
  return landscapeFit >= 1 || landscapeFit >= portraitFit ? { ...AUTHORED_LANDSCAPE } : { ...AUTHORED_PORTRAIT }
}

function authoredSurfaceScale(surface: AuthoredSurface): number {
  const fit = Math.min(window.innerWidth / surface.width, window.innerHeight / surface.height)
  return fit >= 1 ? Math.max(1, Math.floor(fit)) : fit
}

function pixelPerfectViewHeight(_canvasW: number, canvasH: number): number {
  return canvasH
}

const benchmarkQuery = benchmarkParams()
const benchmarkEnabled = benchmarkQuery.get('bench') === '1'
const benchmarkSlimes = integerParam(benchmarkQuery, 'slimes', 5)
const benchmarkSeed = integerParam(benchmarkQuery, 'seed', DEFAULT_BENCHMARK_SEED)
const benchmarkFixedDeltaMs = numberParam(benchmarkQuery, 'fixedDelta')
const simulationGate = createBenchmarkSimulationGate(benchmarkEnabled)

// Hero movement speed (world u/s) + click-to-walk tuning.
const HERO_SPEED = 70
// Distance at which click-target navigation "arrives" — smaller than
// the hero sprite to avoid overshoot jitter.
const HERO_ARRIVE_RADIUS = 4
// Click radius used to decide if a click intended a torch vs. a
// bare-floor walk target. 1.25 tile-widths covers sloppy aim.
const TORCH_CLICK_RADIUS = TILE_PX * TILE_SCALE * 1.25

// ─── Slime behavior tuning ──────────────────────────────────────────
// World-distance beyond which a slime ignores nearby knights. ~1.5
// knight-widths keeps excitement local without making slimes skittish
// from across the room.
const SLIME_EXCITE_RADIUS = KNIGHT_SCALE * 1.5
const SLIME_SPEED_WANDER = 14 // world units / s — slow crawl
const SLIME_SPEED_EXCITED = 32 // ~2.3× — visibly agitated
// Stamina drain rates — higher = shorter burst before needing rest.
// Applied only during the `hop` sub-phase; pauses hold stamina flat.
// Tuned so wandering slimes hop around for a good long stretch before
// collapsing, and excited slimes burn out comparatively quickly.
const SLIME_STAMINA_DRAIN_WANDER = 0.05
const SLIME_STAMINA_DRAIN_EXCITED = 0.25
// Recovery rate while resting. 0.3/s → ~3 s from empty to full refill.
const SLIME_STAMINA_RECOVER = 0.3
// Minimum stamina before a resting slime starts wandering again. A
// soft threshold (not 1.0) prevents "rest → move one frame → rest"
// oscillation when the slime is bumping the map edge.
const SLIME_STAMINA_RESUME = 0.6
// Hop/pause rhythm — slimes don't move continuously. They launch in a
// direction for a short hop, then settle and pick a new direction.
// Excited slimes hop a touch longer but pause far less.
const SLIME_HOP_MIN_WANDER = 0.5
const SLIME_HOP_MAX_WANDER = 0.8
const SLIME_PAUSE_MIN_WANDER = 0.4
const SLIME_PAUSE_MAX_WANDER = 0.8
const SLIME_HOP_MIN_EXCITED = 0.3
const SLIME_HOP_MAX_EXCITED = 0.5
const SLIME_PAUSE_MIN_EXCITED = 0.1
const SLIME_PAUSE_MAX_EXCITED = 0.25

// ============================================
// ANIMATION
// ============================================

const knightAnimations: AnimationSetDefinition = {
  fps: 8,
  animations: {
    idle: { frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'], fps: 6, loop: true },
    run: {
      frames: Array.from({ length: 16 }, (_, i) => `run_${i}`),
      fps: 16,
      loop: true,
    },
  },
}

// Slime sheet is a strict 8×5 grid of 24×24 frames — each row is one
// animation. The demo only plays `idle` (resting) and `walk` (wander /
// excited). `walk` runs faster when the slime is excited to hint at the
// agitation without needing a dedicated animation track.
const slimeAnimations: AnimationSetDefinition = {
  fps: 8,
  animations: {
    idle: {
      frames: Array.from({ length: 8 }, (_, i) => `idle_${i}`),
      fps: 6,
      loop: true,
    },
    walk: {
      frames: Array.from({ length: 8 }, (_, i) => `walk_${i}`),
      fps: 10,
      loop: true,
    },
  },
}

// ============================================
// TILEMAP
// ============================================

// ============================================
// MAP DATA EXTRACTION
// ============================================

import type { TileMapData, TileMapObject } from 'three-flatland/react'

function extractObjectsByType(mapData: TileMapData, type: string): TileMapObject[] {
  const results: TileMapObject[] = []
  for (const layer of mapData.objectLayers) {
    for (const obj of layer.objects) {
      if (obj.type === type) results.push(obj)
    }
  }
  return results
}

function mapToWorld(obj: TileMapObject, mapData: TileMapData, scale: number): [number, number] {
  const mapH = mapData.height * mapData.tileHeight
  const cx = (obj.x + obj.width / 2) * scale
  const cy = (mapH - obj.y - obj.height / 2) * scale
  const offsetX = (mapData.width * mapData.tileWidth * scale) / 2
  const offsetY = (mapH * scale) / 2
  return [cx - offsetX, cy - offsetY]
}

function tileFlipAtObject(
  obj: TileMapObject,
  mapData: TileMapData,
  localTileId: number
): { flipX: boolean; flipY: boolean } {
  const cellX = Math.floor((obj.x + obj.width * 0.5) / mapData.tileWidth)
  const cellY = Math.floor((obj.y + obj.height * 0.5) / mapData.tileHeight)

  for (const layer of mapData.tileLayers) {
    const packed = layer.data[cellY * layer.width + cellX] ?? 0
    const gid = packed & TILE_GID_MASK
    const tileset = mapData.tilesets.find(({ firstGid, tileCount }) => gid >= firstGid && gid < firstGid + tileCount)
    if (!tileset || gid !== tileset.firstGid + localTileId) continue
    return {
      flipX: (packed & TILE_FLIP_X) !== 0,
      flipY: (packed & TILE_FLIP_Y) !== 0,
    }
  }

  return { flipX: false, flipY: false }
}

function tilePositionsById(
  mapData: TileMapData,
  localTileId: number,
  scale: number
): Array<[number, number, boolean, boolean]> {
  const positions: Array<[number, number, boolean, boolean]> = []
  const mapWidth = mapData.width * mapData.tileWidth * scale
  const mapHeight = mapData.height * mapData.tileHeight * scale

  for (const layer of mapData.tileLayers) {
    for (let cellY = 0; cellY < layer.height; cellY++) {
      for (let cellX = 0; cellX < layer.width; cellX++) {
        const packed = layer.data[cellY * layer.width + cellX] ?? 0
        const gid = packed & TILE_GID_MASK
        const tileset = mapData.tilesets.find(
          ({ firstGid, tileCount }) => gid >= firstGid && gid < firstGid + tileCount
        )
        if (!tileset || gid !== tileset.firstGid + localTileId) continue
        positions.push([
          (cellX + 0.5) * mapData.tileWidth * scale - mapWidth * 0.5,
          mapHeight * 0.5 - (cellY + 0.5) * mapData.tileHeight * scale,
          (packed & TILE_FLIP_X) !== 0,
          (packed & TILE_FLIP_Y) !== 0,
        ])
      }
    }
  }

  return positions
}

// ============================================
// WANDERERS
// ============================================

interface Wanderer {
  pos: Vector2
  vel: Vector2
  retargetTimer: number
}

/**
 * Uniform spawn anywhere inside the playable map interior (the square
 * inside the wall tiles, shrunk by `entityHalf` so the sprite's centre
 * never overlaps a wall on frame 0). Used for slime spawns so the
 * group scatters across the whole dungeon rather than clumping at the
 * hero's starting spot.
 *
 * `wallInset` is the collision thickness of the outer wall ring. Pass
 * `TILE_PX * TILE_SCALE` (full wall tile) for tight-bodied sprites
 * like slimes; pass the smaller `WALL_TILE` fudge for sprites whose
 * art is designed to overlap the wall a bit (e.g. the hero).
 */
function newInteriorWanderer(
  halfW: number,
  halfH: number,
  entityHalf: number,
  wallInset: number,
  random: () => number
): Wanderer {
  const mx = halfW - wallInset - entityHalf
  const my = halfH - wallInset - entityHalf
  return {
    pos: new Vector2((random() * 2 - 1) * mx, (random() * 2 - 1) * my),
    vel: new Vector2(),
    retargetTimer: random() * 2,
  }
}

// ============================================
// SCENE
// ============================================

interface SceneProps {
  paused: boolean
  lightingEnabled: boolean
  webGpuAcceleration: boolean
  executionPath: DdaExecutionPath
  onDdaDiagnostics: (path: string, fallback: string) => void
  ambient: number
  slimeCount: number
  pixelSize: number
  paletteBands: number
  torchIntensity: number
  slimeIntensity: number
  surface: AuthoredSurface
}

function FlatlandScene(props: SceneProps) {
  const random = useMemo(() => (benchmarkEnabled ? createSeededRandom(benchmarkSeed) : Math.random), [])
  const knightSheet = useLoader(SpriteSheetLoader, './sprites/knight.json', (l) => {
    l.normals = true
    l.forceRuntime = true
  })
  const slimeSheet = useLoader(SpriteSheetLoader, './sprites/slime.json', (l) => {
    l.normals = true
    l.forceRuntime = true
  })
  const sourceMapData = useLoader(LDtkLoader, './maps/dungeon.ldtk', (l) => {
    l.normals = true
    l.forceRuntime = true
  })
  const mapData = useMemo(() => expandDungeonMap(sourceMapData), [sourceMapData])

  const renderer = useThree((s) => s.renderer)
  const flatlandRef = useRef<Flatland>(null)
  const lightEffectRef = useRef<InstanceType<typeof DdaFixedRadianceLightEffect>>(null)
  const tilemapRef = useRef<TileMap2D>(null)

  const torchEmissionRefs = useRef<(InstanceType<typeof EmissiveEffect> | null)[]>([])
  const torchStatesRef = useRef<
    Array<{ enabled: boolean; current: number; target: number; changeIn: number; response: number }>
  >([])

  const mapHalfW = (mapData.width * mapData.tileWidth * TILE_SCALE) / 2
  const mapHalfH = (mapData.height * mapData.tileHeight * TILE_SCALE) / 2
  const collisionRects = useMemo(
    () =>
      extractObjectsByType(mapData, 'collision').map((object) => {
        const [x, y] = mapToWorld(object, mapData, TILE_SCALE)
        return {
          minX: x - (object.width * TILE_SCALE) / 2,
          maxX: x + (object.width * TILE_SCALE) / 2,
          minY: y - (object.height * TILE_SCALE) / 2,
          maxY: y + (object.height * TILE_SCALE) / 2,
        }
      }),
    [mapData]
  )
  const isBlocked = (x: number, y: number, halfExtent: number): boolean =>
    collisionRects.some(
      (rect) =>
        x + halfExtent > rect.minX &&
        x - halfExtent < rect.maxX &&
        y + halfExtent > rect.minY &&
        y - halfExtent < rect.maxY
    )

  const viewSize = pixelPerfectViewHeight(props.surface.width, props.surface.height)
  const fixedLightPositions = useMemo(
    () =>
      extractObjectsByType(mapData, 'light').map((obj) => {
        const [x, y] = mapToWorld(obj, mapData, TILE_SCALE)
        const { flipX, flipY } = tileFlipAtObject(obj, mapData, WALL_TORCH_TILE_ID)
        return [x, y, flipX, flipY] as const
      }),
    [mapData]
  )

  const switchPositions = useMemo(
    () => extractObjectsByType(mapData, 'torch_switch').map((obj) => mapToWorld(obj, mapData, TILE_SCALE)),
    [mapData]
  )

  const floorTorchPositions = useMemo(() => tilePositionsById(mapData, FLOOR_TORCH_TILE_ID, TILE_SCALE), [mapData])
  const switchToTorch = useMemo(
    () =>
      switchPositions.map(([sx, sy]) => {
        let best = 0
        let bestDistance = Infinity
        for (let i = 0; i < fixedLightPositions.length; i++) {
          const [tx, ty] = fixedLightPositions[i]!
          const distance = (tx - sx) ** 2 + (ty - sy) ** 2
          if (distance < bestDistance) {
            bestDistance = distance
            best = i
          }
        }
        return best
      }),
    [fixedLightPositions, switchPositions]
  )
  const torchEmitters = useMemo(
    () => [
      ...fixedLightPositions.map(([x, y, flipX, flipY]) => ({ x, y, flipX, flipY, frame: 'wall' as const })),
      ...floorTorchPositions.map(([x, y, flipX, flipY]) => ({ x, y, flipX, flipY, frame: 'floor' as const })),
    ],
    [fixedLightPositions, floorTorchPositions]
  )
  while (torchStatesRef.current.length < torchEmitters.length) {
    torchStatesRef.current.push({
      enabled: true,
      current: 1,
      target: 1,
      changeIn: random() * 0.2,
      response: 8,
    })
  }
  if (torchStatesRef.current.length > torchEmitters.length) torchStatesRef.current.length = torchEmitters.length

  const heroRef = useRef<AnimatedSprite2D | null>(null)
  const heroPos = useRef(new Vector2(0, 0))
  const heroKeys = useRef({ up: false, down: false, left: false, right: false })
  const heroAnim = useRef<'idle' | 'run'>('idle')
  const heroFacing = useRef(new Vector2(1, 0))
  /**
   * Diablo-style click-to-walk target. `null` when no click target is
   * active (keyboard-only control). When set, the hero path-walks
   * toward it each frame. Keyboard input cancels the target so player
   * intent always wins.
   */
  const heroMoveTarget = useRef<Vector2 | null>(null)
  /**
   * When the click target is a torch switch, we queue its index here
   * so the hero can toggle the corresponding emissive overlay on arrival.
   */
  const heroTargetTorchIdx = useRef<number | null>(null)
  /** Once-only flag so hero placement only runs after map data lands. */
  const heroSpawnedRef = useRef(false)
  // Slimes run a three-state behavior: rest (recover stamina), wander
  // (default ambling), and excited (sprinting when a knight is nearby).
  // Within wander/excited the slime alternates between `hop` (brief
  // directional burst) and `pause` (stand still, pick a direction for
  // the next hop) sub-phases — very slime-like rhythm. Stamina only
  // drains during the hop sub-phase. `drainBias` is a per-slime ±10%
  // multiplier on drain/recovery rates so otherwise-identical slimes
  // drift apart in phase over time — without this they'd synchronize
  // into a single collective heartbeat.
  const slimesRef = useRef<
    Array<{
      anim: Wanderer
      sprite: AnimatedSprite2D | null
      emission: InstanceType<typeof EmissiveEffect> | null
      stamina: number
      state: 'rest' | 'wander' | 'excited'
      hopPhase: 'hop' | 'pause'
      hopTimer: number
      animation: 'idle' | 'walk'
      drainBias: number
    }>
  >([])

  // Spawn hero near the first fixed torch so the map starts lit around
  // the player. Falls back to origin if the map has no torches (shouldn't
  // happen with the dungeon LDtk but keeps the guard cheap).
  if (!heroSpawnedRef.current && fixedLightPositions.length > 0) {
    const [tx, ty] = fixedLightPositions[0]!
    // Offset one tile along +X so the hero isn't physically on top of
    // the torch sprite — reads better visually.
    heroPos.current.set(tx + TILE_PX * TILE_SCALE, ty)
    heroSpawnedRef.current = true
  }

  if (slimesRef.current.length !== props.slimeCount) {
    while (slimesRef.current.length < props.slimeCount) {
      // Spread starting stamina across the full range AND randomly
      // drop some spawns straight into `rest` so the group never
      // shares a single collective cycle phase. drainBias (±10%)
      // ensures that even slimes that happen to align drift apart
      // over time from the accumulated rate difference.
      const stamina = random()
      const state = stamina < 0.4 ? 'rest' : 'wander'
      // Random initial hop phase + leftover timer so wandering slimes
      // don't all burst out of the gate in unison either.
      const hopPhase = random() < 0.5 ? 'hop' : 'pause'
      let anim = newInteriorWanderer(mapHalfW, mapHalfH, SLIME_SCALE / 2, TILE_PX * TILE_SCALE, random)
      for (let attempt = 0; attempt < 24 && isBlocked(anim.pos.x, anim.pos.y, TILE_PX * 0.4); attempt++) {
        anim = newInteriorWanderer(mapHalfW, mapHalfH, SLIME_SCALE / 2, TILE_PX * TILE_SCALE, random)
      }
      slimesRef.current.push({
        // Full-tile wall inset (TILE_PX * TILE_SCALE = 32) keeps the
        // slime's tight body clear of the wall art. The hero uses the
        // smaller WALL_TILE fudge because its frame has transparent
        // padding that can visually overlap the wall without clipping.
        anim,
        sprite: null,
        emission: null,
        stamina,
        state,
        hopPhase,
        hopTimer: random() * 0.5,
        animation: state === 'rest' || hopPhase === 'pause' ? 'idle' : 'walk',
        drainBias: 0.85 + random() * 0.3,
      })
    }
    if (slimesRef.current.length > props.slimeCount) slimesRef.current.length = props.slimeCount
  }

  useEffect(() => {
    // torch_switch tiles hold a torch Light2D at their center — treating
    // them as shadow casters would self-shadow their own light. They remain
    // collision for the hero (handled separately), just not occluders.
    tilemapRef.current?.markOccluders(['collision'])
  }, [mapData])

  // Hero input
  useEffect(() => {
    const keymap = (e: KeyboardEvent): keyof typeof heroKeys.current | null => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          return 'up'
        case 'KeyS':
        case 'ArrowDown':
          return 'down'
        case 'KeyA':
        case 'ArrowLeft':
          return 'left'
        case 'KeyD':
        case 'ArrowRight':
          return 'right'
        default:
          return null
      }
    }
    const tryActivateTorch = () => {
      const hero = heroPos.current
      const facing = heroFacing.current
      const activationRadius = TILE_PX * TILE_SCALE * 2.5
      const facingThreshold = 0.3 // ~72° cone — plenty of slop
      let bestIdx = -1
      let bestDist = Infinity
      for (let i = 0; i < switchPositions.length; i++) {
        const [sx, sy] = switchPositions[i]!
        const dx = sx - hero.x
        const dy = sy - hero.y
        const dist = Math.hypot(dx, dy)
        if (dist > activationRadius) continue
        if (dist > 1) {
          const dot = (dx / dist) * facing.x + (dy / dist) * facing.y
          if (dot < facingThreshold) continue
        }
        if (dist < bestDist) {
          bestDist = dist
          bestIdx = i
        }
      }
      if (bestIdx < 0) return
      const torch = torchStatesRef.current[switchToTorch[bestIdx]!]
      if (torch) torch.enabled = !torch.enabled
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        tryActivateTorch()
        e.preventDefault()
        return
      }
      const k = keymap(e)
      if (k) {
        heroKeys.current[k] = true
        // Keyboard input cancels any in-flight click-to-walk path —
        // player intent beats queued navigation.
        heroMoveTarget.current = null
        heroTargetTorchIdx.current = null
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      const k = keymap(e)
      if (k) {
        heroKeys.current[k] = false
        e.preventDefault()
      }
    }
    const canvas = (renderer as unknown as { domElement: HTMLCanvasElement }).domElement
    const click = (e: MouseEvent) => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      const camera = flatlandRef.current?.camera
      if (!camera) return
      const worldX = camera.position.x + camera.left + ((ndcX + 1) / 2) * (camera.right - camera.left)
      const worldY = camera.position.y + camera.bottom + ((ndcY + 1) / 2) * (camera.top - camera.bottom)

      // Diablo-style click-to-walk. If the click landed near a torch
      // switch, queue that switch's index so the hero toggles it on
      // arrival. Otherwise it's a bare-floor move target.
      let snapX = worldX
      let snapY = worldY
      let torchIdx: number | null = null
      let bestDistSq = TORCH_CLICK_RADIUS * TORCH_CLICK_RADIUS
      for (let i = 0; i < switchPositions.length; i++) {
        const [sx, sy] = switchPositions[i]!
        const dx = sx - worldX
        const dy = sy - worldY
        const d2 = dx * dx + dy * dy
        if (d2 < bestDistSq) {
          bestDistSq = d2
          torchIdx = switchToTorch[i]!
          // Stand one sprite-width off the torch so the hero's own
          // body doesn't fully occlude the light glyph.
          const dist = Math.sqrt(d2) || 1
          const off = TILE_PX * TILE_SCALE
          // Toward the current hero — so we approach from the nearer
          // side rather than teleporting around the torch.
          const toHeroX = heroPos.current.x - sx
          const toHeroY = heroPos.current.y - sy
          const thLen = Math.hypot(toHeroX, toHeroY) || 1
          snapX = sx + (toHeroX / thLen) * off
          snapY = sy + (toHeroY / thLen) * off
          void dist
        }
      }
      heroMoveTarget.current = new Vector2(snapX, snapY)
      heroTargetTorchIdx.current = torchIdx
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    canvas.addEventListener('click', click)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      canvas.removeEventListener('click', click)
    }
  }, [renderer, switchPositions, switchToTorch])

  useFrame((_, rawDelta) => {
    // When paused, freeze the simulation. Rendering still happens, so the
    // canvas continues to update — useful for capturing comparison
    // screenshots on identical entity positions.
    if (props.paused) return
    if (!simulationGate.advance()) return
    const delta = benchmarkFixedDeltaMs === undefined ? rawDelta : benchmarkFixedDeltaMs / 1000

    for (let i = 0; i < torchStatesRef.current.length; i++) {
      const torch = torchStatesRef.current[i]!
      torch.changeIn -= delta
      if (torch.changeIn <= 0) {
        const fastFlicker = random() < 0.08
        torch.target = fastFlicker ? 0.2 + random() * 0.45 : 0.86 + random() * 0.24
        torch.changeIn = fastFlicker ? 0.025 + random() * 0.055 : 0.12 + random() * 0.28
        torch.response = fastFlicker ? 30 : 7 + random() * 4
      }
      const smoothing = 1 - Math.exp(-torch.response * delta)
      torch.current += (torch.target - torch.current) * smoothing
      const emission = torchEmissionRefs.current[i]
      if (emission) emission.intensity = torch.enabled ? props.torchIntensity * torch.current : 0
    }
    // ── Hero movement: keyboard wins, else click-to-walk ──────
    const k = heroKeys.current
    const hvx = (k.right ? 1 : 0) - (k.left ? 1 : 0)
    const hvy = (k.up ? 1 : 0) - (k.down ? 1 : 0)
    let moveX = 0
    let moveY = 0
    let moving = false
    let facingX = heroFacing.current.x
    let facingY = heroFacing.current.y

    if (hvx !== 0 || hvy !== 0) {
      const len = Math.hypot(hvx, hvy)
      facingX = hvx / len
      facingY = hvy / len
      moveX = facingX * HERO_SPEED * delta
      moveY = facingY * HERO_SPEED * delta
      moving = true
    } else if (heroMoveTarget.current !== null) {
      const tgt = heroMoveTarget.current
      const dx = tgt.x - heroPos.current.x
      const dy = tgt.y - heroPos.current.y
      const dist = Math.hypot(dx, dy)
      if (dist <= HERO_ARRIVE_RADIUS) {
        if (heroTargetTorchIdx.current !== null) {
          const torch = torchStatesRef.current[heroTargetTorchIdx.current]
          if (torch) torch.enabled = !torch.enabled
        }
        heroMoveTarget.current = null
        heroTargetTorchIdx.current = null
      } else {
        facingX = dx / dist
        facingY = dy / dist
        // Don't overshoot the target: cap travel to remaining distance.
        const step = Math.min(HERO_SPEED * delta, dist)
        moveX = facingX * step
        moveY = facingY * step
        moving = true
      }
    }

    if (moving) {
      heroFacing.current.set(facingX, facingY)
      const prevX = heroPos.current.x
      const prevY = heroPos.current.y
      const mx = mapHalfW - WALL_TILE - KNIGHT_SCALE / 2
      const my = mapHalfH - WALL_TILE - KNIGHT_SCALE / 2
      const nextX = Math.max(-mx, Math.min(mx, heroPos.current.x + moveX))
      const nextY = Math.max(-my, Math.min(my, heroPos.current.y + moveY))
      const heroHalfExtent = TILE_PX * 0.5
      if (!isBlocked(nextX, heroPos.current.y, heroHalfExtent)) heroPos.current.x = nextX
      if (!isBlocked(heroPos.current.x, nextY, heroHalfExtent)) heroPos.current.y = nextY

      // Wall-stop: if a click-target walk hit a wall this frame, the
      // clamp will have eaten most of the intended step. Detect that
      // and cancel the navigation so the hero doesn't "run in place"
      // against the edge. Keyboard paths never set a target so this
      // only affects click-to-walk.
      if (heroMoveTarget.current !== null) {
        const expected = Math.hypot(moveX, moveY)
        const actual = Math.hypot(heroPos.current.x - prevX, heroPos.current.y - prevY)
        // Allow ~half the intended step before declaring a stall — a
        // glancing wall contact (hero sliding along an edge) shouldn't
        // cancel the walk if the tangential component still progresses.
        if (expected > 0 && actual < expected * 0.5) {
          heroMoveTarget.current = null
          heroTargetTorchIdx.current = null
        }
      }
    }

    if (heroRef.current) {
      heroRef.current.position.set(heroPos.current.x, heroPos.current.y, 0)
      heroRef.current.zIndex = -Math.floor(heroPos.current.y)
      if (moving && heroAnim.current !== 'run') {
        heroRef.current.play('run')
        heroAnim.current = 'run'
      } else if (!moving && heroAnim.current !== 'idle') {
        heroRef.current.play('idle')
        heroAnim.current = 'idle'
      }
      if (Math.abs(facingX) > 0.01) heroRef.current.flipX = facingX < 0
      heroRef.current.update(delta * 1000)
    }
    const camera = flatlandRef.current?.camera
    if (camera) {
      const halfViewW = (camera.right - camera.left) / 2
      const halfViewH = (camera.top - camera.bottom) / 2
      const cameraLimitX = Math.max(0, mapHalfW - halfViewW)
      const cameraLimitY = Math.max(0, mapHalfH - halfViewH)
      const followX = Math.max(-cameraLimitX, Math.min(cameraLimitX, heroPos.current.x))
      const followY = Math.max(-cameraLimitY, Math.min(cameraLimitY, heroPos.current.y))
      camera.position.set(followX, followY, camera.position.z)
      if (camera instanceof PixelPerfectCamera) camera.snapPositionToGrid(ART_WORLD_SCALE)
    }
    // Build a flat list of "predator" positions (hero + knight NPCs)
    // once per frame; each slime samples it for proximity. O(slimes ×
    // predators) = ~N distance tests — just the hero now.
    const predatorPositions: Array<{ x: number; y: number }> = [{ x: heroPos.current.x, y: heroPos.current.y }]
    const exciteRadiusSq = SLIME_EXCITE_RADIUS * SLIME_EXCITE_RADIUS

    // Slimes use the full wall-tile thickness (TILE_PX * TILE_SCALE)
    // for collision instead of the looser WALL_TILE fudge the hero
    // gets away with. Without this, the tight slime body visually
    // punches into the wall art by ~8 world units on impact.
    const slimeWallInset = TILE_PX * TILE_SCALE
    const slimeBoundX = mapHalfW - slimeWallInset - SLIME_SCALE / 2
    const slimeBoundY = mapHalfH - slimeWallInset - SLIME_SCALE / 2

    for (let i = 0; i < slimesRef.current.length; i++) {
      const s = slimesRef.current[i]!

      // ── Proximity check ────────────────────────────────────────
      // Squared-distance compare avoids the sqrt that `Math.hypot`
      // would cost per predator.
      let knightNear = false
      for (const p of predatorPositions) {
        const dx = p.x - s.anim.pos.x
        const dy = p.y - s.anim.pos.y
        if (dx * dx + dy * dy < exciteRadiusSq) {
          knightNear = true
          break
        }
      }

      // ── State transitions ──────────────────────────────────────
      // Forced rest when stamina depletes — overrides knight proximity
      // so a winded slime can't stay excited even if harassed.
      if (s.stamina <= 0) {
        s.state = 'rest'
      } else if (s.state === 'rest') {
        if (s.stamina >= SLIME_STAMINA_RESUME) {
          s.state = knightNear ? 'excited' : 'wander'
          // Entering wander/excited from rest — snap into a pause so
          // the slime pre-roll-surveys before hopping. Feels more
          // natural than teleporting straight into motion.
          s.hopPhase = 'pause'
          s.hopTimer = 0.2 + random() * 0.2
          s.anim.vel.x = 0
          s.anim.vel.y = 0
        }
      } else {
        s.state = knightNear ? 'excited' : 'wander'
      }

      // ── Movement: rest vs. hop/pause rhythm ────────────────────
      if (s.state === 'rest') {
        s.anim.vel.x = 0
        s.anim.vel.y = 0
        s.stamina = Math.min(1, s.stamina + SLIME_STAMINA_RECOVER * s.drainBias * delta)
      } else {
        // Advance the hop/pause timer and flip phases when it expires.
        s.hopTimer -= delta
        if (s.hopTimer <= 0) {
          if (s.hopPhase === 'hop') {
            // Hop done — settle into a pause.
            s.hopPhase = 'pause'
            s.hopTimer =
              s.state === 'excited'
                ? SLIME_PAUSE_MIN_EXCITED + random() * (SLIME_PAUSE_MAX_EXCITED - SLIME_PAUSE_MIN_EXCITED)
                : SLIME_PAUSE_MIN_WANDER + random() * (SLIME_PAUSE_MAX_WANDER - SLIME_PAUSE_MIN_WANDER)
            s.anim.vel.x = 0
            s.anim.vel.y = 0
          } else {
            // Pause done — launch into a new hop in a random direction.
            s.hopPhase = 'hop'
            s.hopTimer =
              s.state === 'excited'
                ? SLIME_HOP_MIN_EXCITED + random() * (SLIME_HOP_MAX_EXCITED - SLIME_HOP_MIN_EXCITED)
                : SLIME_HOP_MIN_WANDER + random() * (SLIME_HOP_MAX_WANDER - SLIME_HOP_MIN_WANDER)
            const angle = random() * Math.PI * 2
            const speed = s.state === 'excited' ? SLIME_SPEED_EXCITED : SLIME_SPEED_WANDER
            s.anim.vel.x = Math.cos(angle) * speed
            s.anim.vel.y = Math.sin(angle) * speed
          }
        }

        // Apply velocity (only non-zero during hop phase) + wall bounce.
        // Velocity is driven explicitly per hop above rather than
        // continuously retargeted, so slimes rest between hops.
        const nextSlimeX = s.anim.pos.x + s.anim.vel.x * delta
        const nextSlimeY = s.anim.pos.y + s.anim.vel.y * delta
        const slimeHalfExtent = TILE_PX * 0.4
        if (isBlocked(nextSlimeX, s.anim.pos.y, slimeHalfExtent)) s.anim.vel.x *= -1
        else s.anim.pos.x = nextSlimeX
        if (isBlocked(s.anim.pos.x, nextSlimeY, slimeHalfExtent)) s.anim.vel.y *= -1
        else s.anim.pos.y = nextSlimeY
        if (s.anim.pos.x > slimeBoundX) {
          s.anim.pos.x = slimeBoundX
          s.anim.vel.x = -Math.abs(s.anim.vel.x)
        }
        if (s.anim.pos.x < -slimeBoundX) {
          s.anim.pos.x = -slimeBoundX
          s.anim.vel.x = Math.abs(s.anim.vel.x)
        }
        if (s.anim.pos.y > slimeBoundY) {
          s.anim.pos.y = slimeBoundY
          s.anim.vel.y = -Math.abs(s.anim.vel.y)
        }
        if (s.anim.pos.y < -slimeBoundY) {
          s.anim.pos.y = -slimeBoundY
          s.anim.vel.y = Math.abs(s.anim.vel.y)
        }

        // Drain stamina only during active hops — pauses hold the
        // value steady so the slime's total movement endurance is
        // determined by hop-time alone.
        if (s.hopPhase === 'hop') {
          const drain = s.state === 'excited' ? SLIME_STAMINA_DRAIN_EXCITED : SLIME_STAMINA_DRAIN_WANDER
          s.stamina = Math.max(0, s.stamina - drain * s.drainBias * delta)
        }
      }

      // ── Animation + transform ──────────────────────────────────
      if (s.sprite) {
        // Walk while actively hopping, idle otherwise (rest OR pause
        // between hops). Animation changes drive `.play()` only on
        // transition — not every frame.
        const wantAnim: 'idle' | 'walk' = s.state !== 'rest' && s.hopPhase === 'hop' ? 'walk' : 'idle'
        if (wantAnim !== s.animation) {
          s.sprite.play(wantAnim)
          s.animation = wantAnim
        }
        s.sprite.position.set(s.anim.pos.x, s.anim.pos.y, 0)
        s.sprite.zIndex = -Math.floor(s.anim.pos.y)
        if (Math.abs(s.anim.vel.x) > 1) s.sprite.flipX = s.anim.vel.x < 0
        s.sprite.update(delta * 1000)
      }

      if (s.emission) {
        const stateScale = s.state === 'excited' ? 1.35 : s.state === 'rest' ? 0.65 : 1
        s.emission.intensity = props.slimeIntensity * stateScale
      }
    }
  })

  useFrame(
    () => {
      const flatland = flatlandRef.current
      const effect = lightEffectRef.current
      if (effect) {
        effect.radiance.ddaWebGpuAccelerationEnabled = props.webGpuAcceleration
        effect.radiance.ddaExecutionPath = props.executionPath
        effect.radiance.ddaPixelSize = Math.max(1, Math.round(props.pixelSize))
        effect.radiance.ddaPaletteBands = Math.max(0, Math.round(props.paletteBands))
        effect.radiance.ddaRadianceRange = DUNGEON_LIGHTING_DEFAULTS.radianceRange
        effect.radiance.filterRadius = 1.25
        effect.radiance.filterStrength = 0.85
        props.onDdaDiagnostics(
          effect.radiance.resolvedDdaExecutionPath,
          effect.radiance.ddaAccelerationFallbackReason ?? 'none'
        )
      }
      flatland?.render(renderer as unknown as WebGPURenderer)
      if (benchmarkEnabled && flatland) {
        // This render-phase callback owns Flatland.render(), so readiness is
        // published only after batching and the renderer pass have completed.
        publishBenchmarkReady({
          example: 'radiance-dungeon',
          variant: 'react',
          seed: benchmarkSeed,
          fixedDeltaMs: benchmarkFixedDeltaMs ?? null,
          requestedSprites: benchmarkSlimes,
          actualSprites: slimesRef.current.length,
          actualBatches: flatland.spriteGroup.batchCount,
          simulationGated: benchmarkEnabled,
          simulationFrame: simulationGate.frame(),
          gpuAdapter: rendererGpuAdapterInfo(renderer),
          requestedLights: 0,
          actualLights: 0,
        })
      }
    },
    { phase: 'render' }
  )

  return (
    <>
      <flatland ref={flatlandRef} viewSize={viewSize} clearColor={0x06060c}>
        {props.lightingEnabled && (
          <ddaFixedRadianceLightEffect ref={lightEffectRef} attach={attachLighting} radianceIntensity={2.5} />
        )}

        {/* Floor + walls. Tileset's baked normalMap (synthesized by
            LDtkLoader from per-tile `tileDir` / `tileCap*` custom data)
            drives directional lighting — walls tilt toward their visible
            face, floors stay flat. */}
        <tileMap2D
          ref={tilemapRef}
          data={mapData}
          scale={[TILE_SCALE, TILE_SCALE, 1]}
          position={[-mapHalfW, -mapHalfH, -100]}
        >
          <normalMapProvider attach={attachEffect} normalMap={mapData.tilesets[0]?.normalMap ?? null} />
        </tileMap2D>

        {/* Ambient — purple-tinted dungeon atmosphere */}
        <light2D lightType="ambient" color={0x8190bd} intensity={props.ambient} />

        {/* RC transports sprite radiance, not point lights. These source-only
            overlays reuse the exact authored torch pixels and tile flips. */}
        {mapData.tilesets[0]?.texture &&
          torchEmitters.map((torch, i) => (
            <sprite2D
              key={`${torch.frame}-torch-${i}`}
              texture={mapData.tilesets[0]!.texture}
              frame={torch.frame === 'wall' ? WALL_TORCH_FRAME : FLOOR_TORCH_FRAME}
              flipX={torch.flipX}
              flipY={torch.flipY}
              position={[torch.x, torch.y, 0]}
              scale={[TILE_PX * TILE_SCALE, TILE_PX * TILE_SCALE, 1]}
              lit={false}
              castsShadow={false}
              sortLayer={SortLayers.EFFECTS}
            >
              <emissiveEffect
                ref={(effect) => {
                  torchEmissionRefs.current[i] = effect
                }}
                attach={attachEffect}
                color={[1, 0.2, 0.02]}
                intensity={1}
                threshold={0.18}
              />
            </sprite2D>
          ))}

        {/* Hero — rendered on a layer ABOVE slimes (ENTITIES + 1) so
            the knight sorts on top when they overlap. Slimes share a
            sheet/material with each other, hero uses a different one,
            so they can't collapse into the same batch regardless of
            layer — bumping the layer is purely a visual z-order hint. */}
        <animatedSprite2D
          ref={(el) => {
            heroRef.current = el
          }}
          texture={knightSheet.texture}
          spriteSheet={knightSheet}
          animationSet={knightAnimations}
          animation="idle"
          position={[0, 0, 0]}
          scale={[KNIGHT_SCALE, KNIGHT_SCALE, 1]}
          castsShadow
          lit
          sortLayer={SortLayers.ENTITIES + 1}
        >
          <normalMapProvider attach={attachEffect} normalMap={knightSheet.normalMap ?? null} />
        </animatedSprite2D>

        {/* Emission is resolved before occupancy, so slimes can emit from
            their green pixels and still occlude radiance from other sources. */}
        {slimesRef.current.map((s, i) => (
          <animatedSprite2D
            key={`slime-${i}`}
            ref={(el) => {
              // Stagger the animation cursor once on first mount so
              // each slime's walk/idle cycle starts at a random frame
              // instead of every slime playing frame 0 in lockstep.
              const firstMount = el !== null && s.sprite === null
              s.sprite = el
              if (firstMount && el !== null) {
                const frames = slimeAnimations.animations[s.animation]!.frames.length
                el.play(s.animation, { startFrame: Math.floor(random() * frames) })
              }
            }}
            texture={slimeSheet.texture}
            spriteSheet={slimeSheet}
            animationSet={slimeAnimations}
            animation={s.animation}
            scale={[SLIME_SCALE, SLIME_SCALE, 1]}
            anchor={[0.5, 0.5]}
            lit
            castsShadow
            sortLayer={SortLayers.ENTITIES}
          >
            <emissiveEffect
              ref={(effect) => {
                s.emission = effect
              }}
              attach={attachEffect}
              color={[0.033, 1, 0.135]}
              intensity={props.slimeIntensity}
              threshold={0.1}
            />
            <normalMapProvider attach={attachEffect} normalMap={slimeSheet.normalMap ?? null} />
          </animatedSprite2D>
        ))}
      </flatland>
    </>
  )
}

// ============================================
// APP
// ============================================

export default function App() {
  const { pane } = usePane()
  const [surface, setSurface] = useState<AuthoredSurface>(() => authoredSurface())

  useEffect(() => {
    const resize = () => {
      const next = authoredSurface()
      setSurface((current) => (current.width === next.width && current.height === next.height ? current : next))
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // The example exposes scene-level values only. Fixed-point transport
  // defaults come directly from DdaFixedRadianceLightEffect.
  const [paused] = usePaneInput(pane, 'pause', false)

  const light = usePaneFolder(pane, 'Lighting', { expanded: true })
  const [lightingEnabled] = usePaneInput(light, 'enabled', true)
  const [webGpuAcceleration] = usePaneInput(light, 'WebGPU accel', true)
  const [executionPath] = usePaneInput<DdaExecutionPath>(light, 'DDA path', 'auto', {
    options: {
      auto: 'auto',
      fragment: 'fragment',
      workgroup: 'webgpu-workgroup',
      subgroup: 'webgpu-subgroup',
    },
  })
  const [resolvedPath, setResolvedPath] = usePaneInput(light, 'active path', 'fragment', { readonly: true })
  const [accelerationFallback, setAccelerationFallback] = usePaneInput(light, 'fallback', 'pending', {
    readonly: true,
  })
  const updateDdaDiagnostics = (path: string, fallback: string) => {
    if (path !== resolvedPath) setResolvedPath(path)
    if (fallback !== accelerationFallback) setAccelerationFallback(fallback)
  }
  const [pixelSize] = usePaneInput(light, 'DDA cell px', ART_WORLD_SCALE, {
    options: { '1×': 1, '2×': 2, '4×': 4, '8×': 8 },
  })
  const [_renderSurface, setRenderSurface] = usePaneInput(light, 'buffer', `${surface.width}x${surface.height}`, {
    readonly: true,
  })
  const [ambient] = usePaneInput(light, 'ambient', DUNGEON_LIGHTING_DEFAULTS.ambient, {
    min: 0,
    max: 0.5,
    step: 0.01,
  })
  const [paletteBands] = usePaneInput(light, 'bands', 0, { min: 0, max: 64, step: 1 })

  const torches = usePaneFolder(pane, 'Torches')
  const [torchIntensity] = usePaneInput(torches, 'emission', DUNGEON_LIGHTING_DEFAULTS.torchEmission, {
    min: 0,
    max: 16,
    step: 0.1,
  })

  const slimes = usePaneFolder(pane, 'Slimes')
  const [slimeCount] = usePaneInput(slimes, 'count', 5, { min: 0, max: 1000, step: 1 })
  const [slimeIntensity] = usePaneInput(slimes, 'emission', DUNGEON_LIGHTING_DEFAULTS.slimeEmission, {
    min: 0,
    max: 12,
    step: 0.1,
  })
  useEffect(() => setRenderSurface(`${surface.width}x${surface.height}`), [setRenderSurface, surface])
  const sceneSlimeCount = benchmarkEnabled ? benchmarkSlimes : slimeCount
  const surfaceScale = authoredSurfaceScale(surface)

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#06060c',
      }}
    >
      <div
        style={{
          width: `${surface.width}px`,
          height: `${surface.height}px`,
          flex: '0 0 auto',
          transform: `scale(${surfaceScale})`,
          imageRendering: 'pixelated',
        }}
      >
        <Canvas
          width={surface.width}
          height={surface.height}
          dpr={1}
          renderer={{ antialias: false, ...exampleRendererColorConfig }}
          fallback={<ExampleFallback />}
          style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
        >
          <color attach="background" args={['#06060c']} />
          <Suspense fallback={null}>
            <FlatlandScene
              paused={paused}
              lightingEnabled={lightingEnabled}
              webGpuAcceleration={webGpuAcceleration}
              executionPath={executionPath}
              onDdaDiagnostics={updateDdaDiagnostics}
              ambient={ambient}
              slimeCount={sceneSlimeCount}
              pixelSize={pixelSize}
              paletteBands={paletteBands}
              torchIntensity={torchIntensity}
              slimeIntensity={slimeIntensity}
              surface={surface}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  )
}
