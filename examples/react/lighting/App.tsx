import { Suspense, useRef, useEffect, useMemo, useState } from 'react'
import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import {
  Vector2,
  type OrthographicCamera as ThreeOrthographicCamera,
} from 'three'
import {
  Flatland,
  Light2D,
  Sprite2D,
  AnimatedSprite2D,
  SpriteGroup,
  TileMap2D,
  SpriteSheetLoader,
  LDtkLoader,
  Layers,
  attachLighting,
  attachEffect,
  type AnimationSetDefinition,
} from 'three-flatland/react'
import {
  DefaultLightEffect,
  NormalMapProvider,
} from '@three-flatland/presets'
import '@three-flatland/presets/react'
import { usePane, usePaneFolder, usePaneInput } from '@three-flatland/devtools/react'

extend({
  Flatland,
  Sprite2D,
  AnimatedSprite2D,
  SpriteGroup,
  TileMap2D,
  Light2D,
  DefaultLightEffect,
  NormalMapProvider,
})

// ============================================
// CONSTANTS
// ============================================

const VIEW_SIZE = 640
const TILE_PX = 16
const TILE_SCALE = 2
const KNIGHT_SCALE = TILE_PX * TILE_SCALE * 2
const SLIME_SCALE = TILE_PX * TILE_SCALE
const WALL_TILE = 24

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
const SLIME_SPEED_WANDER = 14        // world units / s — slow crawl
const SLIME_SPEED_EXCITED = 32       // ~2.3× — visibly agitated
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
// ORTHO CAMERA
// ============================================

function OrthoCamera({ viewSize }: { viewSize: number }) {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const aspect = size.width / size.height
  return (
    <orthographicCamera
      ref={(cam: ThreeOrthographicCamera | null) => {
        if (!cam) return
        cam.left = (-viewSize * aspect) / 2
        cam.right = (viewSize * aspect) / 2
        cam.top = viewSize / 2
        cam.bottom = -viewSize / 2
        cam.updateProjectionMatrix()
        set({ camera: cam })
      }}
      position={[0, 0, 100]}
      near={0.1}
      far={1000}
      manual
    />
  )
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

// ============================================
// WANDERERS
// ============================================

interface Wanderer {
  pos: Vector2
  vel: Vector2
  retargetTimer: number
}

function newWanderer(halfW: number, halfH: number): Wanderer {
  return {
    pos: new Vector2(
      (Math.random() - 0.5) * halfW * 0.6,
      (Math.random() - 0.5) * halfH * 0.6
    ),
    vel: new Vector2(),
    retargetTimer: Math.random() * 2,
  }
}

/**
 * Uniform spawn anywhere inside the playable map interior (the square
 * inside the wall tiles, shrunk by `entityHalf` so the sprite's centre
 * never overlaps a wall on frame 0). Used for slime spawns so the
 * group scatters across the whole dungeon rather than clumping at the
 * hero's starting spot.
 */
function newInteriorWanderer(halfW: number, halfH: number, entityHalf: number): Wanderer {
  const mx = halfW - WALL_TILE - entityHalf
  const my = halfH - WALL_TILE - entityHalf
  return {
    pos: new Vector2(
      (Math.random() * 2 - 1) * mx,
      (Math.random() * 2 - 1) * my,
    ),
    vel: new Vector2(),
    retargetTimer: Math.random() * 2,
  }
}

function updateWanderer(w: Wanderer, delta: number, speed: number, halfW: number, halfH: number, entityRadius = 0): void {
  w.retargetTimer -= delta
  if (w.retargetTimer <= 0) {
    const a = Math.random() * Math.PI * 2
    w.vel.set(Math.cos(a) * speed, Math.sin(a) * speed)
    w.retargetTimer = 1 + Math.random() * 2
  }
  w.pos.x += w.vel.x * delta
  w.pos.y += w.vel.y * delta
  const mx = halfW - WALL_TILE - entityRadius
  const my = halfH - WALL_TILE - entityRadius
  if (w.pos.x > mx) { w.pos.x = mx; w.vel.x = -Math.abs(w.vel.x) }
  if (w.pos.x < -mx) { w.pos.x = -mx; w.vel.x = Math.abs(w.vel.x) }
  if (w.pos.y > my) { w.pos.y = my; w.vel.y = -Math.abs(w.vel.y) }
  if (w.pos.y < -my) { w.pos.y = -my; w.vel.y = Math.abs(w.vel.y) }
}

// ============================================
// SCENE
// ============================================

interface SceneProps {
  bands: number
  quantize: boolean
  shadowStrength: number
  shadowBias: number
  shadowMaxDistance: number
  shadowPixelSize: number
  shadowBands: number
  shadowBandCurve: number
  ambient: number
  slimeCount: number
  torchIntensity: number
  torchDistance: number
  lightHeight: number
  capShadowStrength: number
  capShadowThreshold: number
}

function FlatlandScene(props: SceneProps) {
  const knightSheet = useLoader(SpriteSheetLoader, './sprites/knight.json', (l) => {
    l.normals = true
  })
  const slimeSheet = useLoader(SpriteSheetLoader, './sprites/slime.json', (l) => {
    l.normals = true
  })
  const mapData = useLoader(LDtkLoader, './maps/dungeon.ldtk', (l) => {
    l.normals = true
  })

  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const flatlandRef = useRef<Flatland>(null)
  const tilemapRef = useRef<TileMap2D>(null)
  const defaultLightRef = useRef<InstanceType<typeof DefaultLightEffect>>(null)

  const torchLightRefs = useRef<(Light2D | null)[]>([])
  const [torchEnabled, setTorchEnabled] = useState<boolean[]>([])
  const flickerTimer = useRef(0)

  const mapHalfW = (mapData.width * mapData.tileWidth * TILE_SCALE) / 2
  const mapHalfH = (mapData.height * mapData.tileHeight * TILE_SCALE) / 2

  const fixedLightPositions = useMemo(() =>
    extractObjectsByType(mapData, 'light').map(obj => mapToWorld(obj, mapData, TILE_SCALE)),
  [mapData])

  const switchPositions = useMemo(() =>
    extractObjectsByType(mapData, 'torch_switch').map(obj => mapToWorld(obj, mapData, TILE_SCALE)),
  [mapData])

  const allTorchPositions = useMemo(() =>
    [...fixedLightPositions, ...switchPositions],
  [fixedLightPositions, switchPositions])

  useEffect(() => {
    setTorchEnabled(allTorchPositions.map(() => true))
  }, [allTorchPositions.length])


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
   * so the hero can toggle it on arrival. `switchStart + idx` indexes
   * into `torchEnabled`, matching the existing space-key logic.
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
  const slimesRef = useRef<Array<{
    anim: Wanderer
    sprite: AnimatedSprite2D | null
    light: Light2D | null
    stamina: number
    state: 'rest' | 'wander' | 'excited'
    hopPhase: 'hop' | 'pause'
    hopTimer: number
    animation: 'idle' | 'walk'
    drainBias: number
  }>>([])

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
      const stamina = Math.random()
      const state = stamina < 0.4 ? 'rest' : 'wander'
      // Random initial hop phase + leftover timer so wandering slimes
      // don't all burst out of the gate in unison either.
      const hopPhase = Math.random() < 0.5 ? 'hop' : 'pause'
      slimesRef.current.push({
        anim: newInteriorWanderer(mapHalfW, mapHalfH, SLIME_SCALE / 2),
        sprite: null,
        light: null,
        stamina,
        state,
        hopPhase,
        hopTimer: Math.random() * 0.5,
        animation: state === 'rest' || hopPhase === 'pause' ? 'idle' : 'walk',
        drainBias: 0.85 + Math.random() * 0.3,
      })
    }
    if (slimesRef.current.length > props.slimeCount) slimesRef.current.length = props.slimeCount
  }

  // Push uniform values each frame via refs — effect instance updates are
  // zero-cost `.value =` writes on the underlying uniform nodes.
  useEffect(() => {
    const e = defaultLightRef.current as unknown as {
      bands: number
      shadowStrength: number
      shadowBias: number
      shadowMaxDistance: number
      shadowPixelSize: number
      shadowBands: number
      shadowBandCurve: number
      lightHeight: number
      capShadowStrength: number
      capShadowThreshold: number
    } | null
    if (!e) return
    e.bands = props.quantize ? props.bands : 0
    e.shadowStrength = props.shadowStrength
    e.shadowBias = props.shadowBias
    e.shadowMaxDistance = props.shadowMaxDistance
    e.shadowPixelSize = props.shadowPixelSize
    e.shadowBands = props.shadowBands
    e.shadowBandCurve = props.shadowBandCurve
    e.lightHeight = props.lightHeight
    e.capShadowStrength = props.capShadowStrength
    e.capShadowThreshold = props.capShadowThreshold
  }, [
    props.bands,
    props.quantize,
    props.shadowStrength,
    props.shadowBias,
    props.shadowMaxDistance,
    props.shadowPixelSize,
    props.shadowBands,
    props.shadowBandCurve,
    props.lightHeight,
    props.capShadowStrength,
    props.capShadowThreshold,
  ])

  useEffect(() => {
    // torch_switch tiles hold a torch Light2D at their center — treating
    // them as shadow casters would self-shadow their own light. They remain
    // collision for the hero (handled separately), just not occluders.
    tilemapRef.current?.markOccluders(['collision'])
  }, [mapData])

  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

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
      const switchStart = fixedLightPositions.length
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
        if (dist < bestDist) { bestDist = dist; bestIdx = i }
      }
      if (bestIdx < 0) return
      setTorchEnabled(prev => {
        const next = [...prev]
        next[switchStart + bestIdx] = !next[switchStart + bestIdx]
        return next
      })
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
      if (k) { heroKeys.current[k] = false; e.preventDefault() }
    }
    const canvas = (gl as unknown as { domElement: HTMLCanvasElement }).domElement
    const click = (e: MouseEvent) => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      const aspect = rect.width / rect.height
      const worldX = ndcX * (VIEW_SIZE * aspect) / 2
      const worldY = ndcY * VIEW_SIZE / 2

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
          torchIdx = i
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
  }, [gl, fixedLightPositions.length, switchPositions])

  useFrame((_, delta) => {
    flickerTimer.current += delta
    const t = flickerTimer.current

    const wallCount = fixedLightPositions.length
    for (let i = 0; i < torchLightRefs.current.length; i++) {
      const torch = torchLightRefs.current[i]
      if (!torch) continue
      torch.enabled = torchEnabled[i] ?? true
      const isWall = i < wallCount
      const intensityMul = isWall ? 1.6 : 0.8
      const distanceMul = isWall ? 1.0 : 0.7
      torch.distance = props.torchDistance * distanceMul
      torch.intensity =
        props.torchIntensity *
        intensityMul *
        (1 + Math.sin(t * (15 + i * 2)) * 0.1 + Math.sin(t * (23 + i * 3)) * 0.05)
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
        // Arrived. If the target carried a torch toggle, flip it now.
        if (heroTargetTorchIdx.current !== null) {
          const idx = heroTargetTorchIdx.current
          const switchStart = fixedLightPositions.length
          setTorchEnabled((prev) => {
            const next = [...prev]
            next[switchStart + idx] = !next[switchStart + idx]
            return next
          })
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
      heroPos.current.x += moveX
      heroPos.current.y += moveY
      const mx = mapHalfW - WALL_TILE - KNIGHT_SCALE / 2
      const my = mapHalfH - WALL_TILE - KNIGHT_SCALE / 2
      heroPos.current.x = Math.max(-mx, Math.min(mx, heroPos.current.x))
      heroPos.current.y = Math.max(-my, Math.min(my, heroPos.current.y))

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
    // Build a flat list of "predator" positions (hero + knight NPCs)
    // once per frame; each slime samples it for proximity. O(slimes ×
    // predators) = ~N distance tests — just the hero now.
    const predatorPositions: Array<{ x: number; y: number }> = [
      { x: heroPos.current.x, y: heroPos.current.y },
    ]
    const exciteRadiusSq = SLIME_EXCITE_RADIUS * SLIME_EXCITE_RADIUS

    const slimeBoundX = mapHalfW - WALL_TILE - SLIME_SCALE / 2
    const slimeBoundY = mapHalfH - WALL_TILE - SLIME_SCALE / 2

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
          s.hopTimer = 0.2 + Math.random() * 0.2
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
        s.stamina = Math.min(
          1,
          s.stamina + SLIME_STAMINA_RECOVER * s.drainBias * delta,
        )
      } else {
        // Advance the hop/pause timer and flip phases when it expires.
        s.hopTimer -= delta
        if (s.hopTimer <= 0) {
          if (s.hopPhase === 'hop') {
            // Hop done — settle into a pause.
            s.hopPhase = 'pause'
            s.hopTimer = s.state === 'excited'
              ? SLIME_PAUSE_MIN_EXCITED + Math.random() * (SLIME_PAUSE_MAX_EXCITED - SLIME_PAUSE_MIN_EXCITED)
              : SLIME_PAUSE_MIN_WANDER + Math.random() * (SLIME_PAUSE_MAX_WANDER - SLIME_PAUSE_MIN_WANDER)
            s.anim.vel.x = 0
            s.anim.vel.y = 0
          } else {
            // Pause done — launch into a new hop in a random direction.
            s.hopPhase = 'hop'
            s.hopTimer = s.state === 'excited'
              ? SLIME_HOP_MIN_EXCITED + Math.random() * (SLIME_HOP_MAX_EXCITED - SLIME_HOP_MIN_EXCITED)
              : SLIME_HOP_MIN_WANDER + Math.random() * (SLIME_HOP_MAX_WANDER - SLIME_HOP_MIN_WANDER)
            const angle = Math.random() * Math.PI * 2
            const speed = s.state === 'excited' ? SLIME_SPEED_EXCITED : SLIME_SPEED_WANDER
            s.anim.vel.x = Math.cos(angle) * speed
            s.anim.vel.y = Math.sin(angle) * speed
          }
        }

        // Apply velocity (only non-zero during hop phase) + wall bounce.
        // Bypasses `updateWanderer` because that function continuously
        // retargets its own velocity; we drive vel explicitly here.
        s.anim.pos.x += s.anim.vel.x * delta
        s.anim.pos.y += s.anim.vel.y * delta
        if (s.anim.pos.x > slimeBoundX) { s.anim.pos.x = slimeBoundX; s.anim.vel.x = -Math.abs(s.anim.vel.x) }
        if (s.anim.pos.x < -slimeBoundX) { s.anim.pos.x = -slimeBoundX; s.anim.vel.x = Math.abs(s.anim.vel.x) }
        if (s.anim.pos.y > slimeBoundY) { s.anim.pos.y = slimeBoundY; s.anim.vel.y = -Math.abs(s.anim.vel.y) }
        if (s.anim.pos.y < -slimeBoundY) { s.anim.pos.y = -slimeBoundY; s.anim.vel.y = Math.abs(s.anim.vel.y) }

        // Drain stamina only during active hops — pauses hold the
        // value steady so the slime's total movement endurance is
        // determined by hop-time alone.
        if (s.hopPhase === 'hop') {
          const drain = s.state === 'excited'
            ? SLIME_STAMINA_DRAIN_EXCITED
            : SLIME_STAMINA_DRAIN_WANDER
          s.stamina = Math.max(0, s.stamina - drain * s.drainBias * delta)
        }
      }

      // ── Animation + transform ──────────────────────────────────
      if (s.sprite) {
        // Walk while actively hopping, idle otherwise (rest OR pause
        // between hops). Animation changes drive `.play()` only on
        // transition — not every frame.
        const wantAnim: 'idle' | 'walk' =
          s.state !== 'rest' && s.hopPhase === 'hop' ? 'walk' : 'idle'
        if (wantAnim !== s.animation) {
          s.sprite.play(wantAnim)
          s.animation = wantAnim
        }
        s.sprite.position.set(s.anim.pos.x, s.anim.pos.y, 0)
        s.sprite.zIndex = -Math.floor(s.anim.pos.y)
        if (Math.abs(s.anim.vel.x) > 1) s.sprite.flipX = s.anim.vel.x < 0
        s.sprite.update(delta * 1000)
      }

      // ── Steady glow ────────────────────────────────────────────
      // Slimes glow steadily — no flicker. Intensity shifts with state
      // so operators can read the state at a glance without HUD text.
      if (s.light) {
        s.light.position.set(s.anim.pos.x, s.anim.pos.y, 0)
        s.light.intensity = s.state === 'excited' ? 0.35
          : s.state === 'rest' ? 0.2
            : 0.28
      }
    }
  })

  useFrame(() => {
    flatlandRef.current?.render(gl as unknown as WebGPURenderer)
  }, { phase: 'render' })

  return (
    <>
      <OrthoCamera viewSize={VIEW_SIZE} />
      <flatland ref={flatlandRef} viewSize={VIEW_SIZE} clearColor={0x06060c}>
        <defaultLightEffect
          ref={defaultLightRef}
          attach={attachLighting}
          bands={props.quantize ? props.bands : 0}
          shadowStrength={props.shadowStrength}
          shadowBias={props.shadowBias}
          shadowMaxDistance={props.shadowMaxDistance}
          shadowPixelSize={props.shadowPixelSize}
          shadowBands={props.shadowBands}
          shadowBandCurve={props.shadowBandCurve}
        />

        {/* Floor + walls. Tileset's baked normalMap (synthesized by
            LDtkLoader from per-tile `tileDir` / `tileCap*` custom data)
            drives directional lighting — walls tilt toward their visible
            face, floors stay flat. */}
        <tileMap2D ref={tilemapRef} data={mapData} scale={[TILE_SCALE, TILE_SCALE, 1]} position={[-mapHalfW, -mapHalfH, -100]}>
          <normalMapProvider attach={attachEffect} normalMap={mapData.tilesets[0]?.normalMap ?? null} />
        </tileMap2D>

        {/* Ambient — purple-tinted dungeon atmosphere */}
        <light2D lightType="ambient" color={0x5544aa} intensity={props.ambient} />

        {/* Wall torches (fixed) — warm orange */}
        {fixedLightPositions.map((pos, i) => (
          <light2D
            key={`wall-torch-${i}`}
            ref={(el) => { torchLightRefs.current[i] = el }}
            lightType="point"
            position={[pos[0], pos[1], 0]}
            color={0xff6600}
            intensity={props.torchIntensity}
            distance={props.torchDistance}
            decay={2}
          />
        ))}
        {/* Toggle torches (switchable) — cool amber */}
        {switchPositions.map((pos, i) => (
          <light2D
            key={`switch-torch-${i}`}
            ref={(el) => { torchLightRefs.current[fixedLightPositions.length + i] = el }}
            lightType="point"
            position={[pos[0], pos[1], 0]}
            color={0xffcc44}
            intensity={props.torchIntensity * 0.8}
            distance={props.torchDistance * 0.7}
            decay={2}
          />
        ))}

        {/* Hero — rendered on a layer ABOVE slimes (ENTITIES + 1) so
            the knight sorts on top when they overlap. Slimes share a
            sheet/material with each other, hero uses a different one,
            so they can't collapse into the same batch regardless of
            layer — bumping the layer is purely a visual z-order hint. */}
        <animatedSprite2D
          ref={(el) => { heroRef.current = el }}
          texture={knightSheet.texture}
          spriteSheet={knightSheet}
          animationSet={knightAnimations}
          animation="idle"
          position={[0, 0, 0]}
          scale={[KNIGHT_SCALE, KNIGHT_SCALE, 1]}
          castsShadow
          lit
          layer={Layers.ENTITIES + 1}
        >
          <normalMapProvider attach={attachEffect} normalMap={knightSheet.normalMap ?? null} />
        </animatedSprite2D>

        {/* Slimes + per-slime lights. Real sprite-sheet now; the
            loader-baked normal atlas lights each frame consistently.
            `castsShadow` omitted — the slime IS a light source (attached
            Light2D at its center). Marking it as an occluder would
            self-shadow its own light. */}
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
                el.play(s.animation, { startFrame: Math.floor(Math.random() * frames) })
              }
            }}
            texture={slimeSheet.texture}
            spriteSheet={slimeSheet}
            animationSet={slimeAnimations}
            animation={s.animation}
            scale={[SLIME_SCALE, SLIME_SCALE, 1]}
            anchor={[0.5, 0.5]}
            lit
            layer={Layers.ENTITIES}
          >
            <normalMapProvider attach={attachEffect} normalMap={slimeSheet.normalMap ?? null} />
          </animatedSprite2D>
        ))}
        {slimesRef.current.map((s, i) => (
          <light2D
            key={`slime-light-${i}`}
            ref={(el) => { s.light = el }}
            lightType="point"
            color={0x33ff66}
            intensity={0.25}
            distance={40}
            decay={2}
          />
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

  const light = usePaneFolder(pane, 'Lighting', { expanded: true })
  const [quantize] = usePaneInput(light, 'quantize', true)
  const [bands] = usePaneInput(light, 'bands', 4, { min: 0, max: 8, step: 1 })
  const [ambient] = usePaneInput(light, 'ambient', 0.6, { min: 0, max: 3, step: 0.05 })
  // lightHeight: the universal +Z component added to every light's
  // direction. Higher values make flat surfaces (floors, wall caps)
  // read as more "top-lit" — classic 2.5D look. Lower values push the
  // light toward a side-lit feel where tilted faces dominate.
  const [lightHeight] = usePaneInput(light, 'lightHeight', 0.75, { min: 0, max: 2, step: 0.05 })
  // capShadowStrength: attenuate direct light on fragments whose
  // normal is ≈ (0, 0, 1). 0 = caps lit normally; 1 = caps only pick
  // up ambient. Uses `normal.z` as a proxy — floors are also
  // attenuated (tilt them slightly if you want floors lit + caps dark).
  const [capShadowStrength] = usePaneInput(light, 'capShadow', 0, { min: 0, max: 1, step: 0.05 })
  const [capShadowThreshold] = usePaneInput(light, 'capShadowThresh', 0.9, { min: 0, max: 1, step: 0.01 })

  const shadows = usePaneFolder(pane, 'Shadows')
  const [shadowStrength] = usePaneInput(shadows, 'strength', 0.8, { min: 0, max: 1, step: 0.05 })
  const [shadowBias] = usePaneInput(shadows, 'bias', 0.5, { min: 0, max: 2, step: 0.05 })
  const [shadowMaxDistance] = usePaneInput(shadows, 'maxDistance', 300, { min: 0, max: 600, step: 10 })
  const [shadowPixelSize] = usePaneInput(shadows, 'pixelSize', 4, { min: 0, max: 8, step: 1 })
  const [shadowBands] = usePaneInput(shadows, 'bands', 4, { min: 0, max: 8, step: 1 })
  const [shadowBandCurve] = usePaneInput(shadows, 'bandCurve', 1, { min: 0.25, max: 4, step: 0.05 })

  const torches = usePaneFolder(pane, 'Torches')
  const [torchIntensity] = usePaneInput(torches, 'intensity', 1.8, { min: 0, max: 3, step: 0.05 })
  const [torchDistance] = usePaneInput(torches, 'distance', 140, { min: 40, max: 400, step: 10 })

  const lights = usePaneFolder(pane, 'Slimes')
  const [slimeCount] = usePaneInput(lights, 'count', 5, { min: 0, max: 1000, step: 1 })

  return (
    <Canvas renderer={{ antialias: false, trackTimestamp: true }}>
      <color attach="background" args={['#06060c']} />
      <Suspense fallback={null}>
        <FlatlandScene
          bands={bands}
          quantize={quantize}
          shadowStrength={shadowStrength}
          shadowBias={shadowBias}
          shadowMaxDistance={shadowMaxDistance}
          shadowPixelSize={shadowPixelSize}
          shadowBands={shadowBands}
          shadowBandCurve={shadowBandCurve}
          ambient={ambient}
          slimeCount={slimeCount}
          torchIntensity={torchIntensity}
          torchDistance={torchDistance}
          lightHeight={lightHeight}
          capShadowStrength={capShadowStrength}
          capShadowThreshold={capShadowThreshold}
        />
      </Suspense>
    </Canvas>
  )
}
