import { Suspense, useRef, useEffect, useMemo } from 'react'
import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import {
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
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
  TextureLoader,
  Layers,
  attachLighting,
  attachEffect,
  type TilesetData,
  type TileLayerData,
  type TileMapData,
  type AnimationSetDefinition,
} from 'three-flatland/react'
import { DefaultLightEffect, AutoNormalProvider } from '@three-flatland/presets'
import '@three-flatland/presets/react'
import { usePane, usePaneFolder, usePaneInput, useStatsMonitor, useDevtoolsPanel, type StatsHandle } from '@three-flatland/devtools/react'

extend({
  Flatland,
  Sprite2D,
  AnimatedSprite2D,
  SpriteGroup,
  TileMap2D,
  Light2D,
  DefaultLightEffect,
  AutoNormalProvider,
})

// ============================================
// CONSTANTS
// ============================================

const VIEW_SIZE = 400
const INDICATOR_SIZE = 20
const TILE_PX = 16
const TILE_SCALE = 2
const KNIGHT_SCALE = 28
const SLIME_SCALE = 18
const WALL_TILE = 24
const KNIGHT_COUNT = 4
const ROOM_HALF_W = 170
const ROOM_HALF_H = 120

// ============================================
// SYNTHETIC ASSETS
// ============================================

function solidCircle(r: number, g: number, b: number, size = 32, softEdge = false): DataTexture {
  const data = new Uint8Array(size * size * 4)
  const center = size / 2
  const radius = size / 2 - 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5
      const dy = y - center + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const i = (y * size + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      const a = dist < radius - 1 ? 255 : dist < radius ? Math.round((radius - dist) * 255) : 0
      data[i + 3] = softEdge ? Math.round(a * Math.max(0, 1 - dist / radius)) : a
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

function flatRect(r: number, g: number, b: number, size = WALL_TILE): DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const noise = (Math.sin(x * 0.7) + Math.sin(y * 0.9)) * 8
      const i = (y * size + x) * 4
      data[i] = Math.max(0, Math.min(255, r + noise))
      data[i + 1] = Math.max(0, Math.min(255, g + noise))
      data[i + 2] = Math.max(0, Math.min(255, b + noise))
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

const torch1Tex = solidCircle(255, 102, 0)
const torch2Tex = solidCircle(255, 170, 0)
const slimeTex = solidCircle(0x3f, 0xff, 0x73, 24, true)
const wallTex = flatRect(84, 84, 100)
const pillarTex = flatRect(54, 54, 70)

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

function useDungeonFloor(tilesetTex: ReturnType<typeof useLoader>): TileMapData {
  return useMemo(() => {
    const TS_COLS = 10
    const TS_ROWS = 10
    const mapCols = Math.ceil((VIEW_SIZE * 2) / TILE_PX) + 4
    const mapRows = Math.ceil(VIEW_SIZE / TILE_PX) + 4
    const FLOOR_PATTERN = [7, 8, 9, 10, 17, 18, 19, 20, 27, 28, 29, 30]
    const floorData = new Uint32Array(mapCols * mapRows)
    for (let y = 0; y < mapRows; y++) {
      for (let x = 0; x < mapCols; x++) {
        floorData[y * mapCols + x] = FLOOR_PATTERN[(y % 3) * 4 + (x % 4)]!
      }
    }
    const tilesetData: TilesetData = {
      name: 'dungeon',
      firstGid: 1,
      tileWidth: TILE_PX,
      tileHeight: TILE_PX,
      imageWidth: TS_COLS * TILE_PX,
      imageHeight: TS_ROWS * TILE_PX,
      columns: TS_COLS,
      tileCount: TS_COLS * TS_ROWS,
      tiles: new Map(),
      texture: tilesetTex as unknown as DataTexture,
    }
    const floorLayer: TileLayerData = {
      name: 'Floor',
      id: 0,
      width: mapCols,
      height: mapRows,
      data: floorData,
    }
    return {
      width: mapCols,
      height: mapRows,
      tileWidth: TILE_PX,
      tileHeight: TILE_PX,
      orientation: 'orthogonal',
      renderOrder: 'right-down',
      infinite: false,
      tilesets: [tilesetData],
      tileLayers: [floorLayer],
      objectLayers: [],
    }
  }, [tilesetTex])
}

// ============================================
// WALLS + PILLARS + TORCH POSITIONS
// ============================================

interface WallSegment {
  x: number
  y: number
  w: number
  h: number
}

function buildRoomWalls(): WallSegment[] {
  const segs: WallSegment[] = []
  const T = WALL_TILE
  segs.push({ x: 0, y: ROOM_HALF_H, w: ROOM_HALF_W * 2 + T, h: T })
  segs.push({ x: 0, y: -ROOM_HALF_H, w: ROOM_HALF_W * 2 + T, h: T })
  segs.push({ x: -ROOM_HALF_W, y: 0, w: T, h: ROOM_HALF_H * 2 })
  segs.push({ x: ROOM_HALF_W, y: 0, w: T, h: ROOM_HALF_H * 2 })
  segs.push({ x: -40, y: 40, w: 80, h: T })
  segs.push({ x: 0, y: 10, w: T, h: 60 })
  segs.push({ x: 60, y: -50, w: T, h: 40 })
  return segs
}

const ROOM_WALLS = buildRoomWalls()

const PILLARS: [number, number][] = [
  [-100, 60],
  [100, 60],
  [-100, -60],
  [100, -60],
]

const TORCH_POSITIONS: [number, number][] = [
  [-100, 80],
  [100, 80],
]

// ============================================
// WANDERERS
// ============================================

interface Wanderer {
  pos: Vector2
  vel: Vector2
  retargetTimer: number
}

function newWanderer(): Wanderer {
  return {
    pos: new Vector2(
      (Math.random() - 0.5) * ROOM_HALF_W * 0.6,
      (Math.random() - 0.5) * ROOM_HALF_H * 0.6
    ),
    vel: new Vector2(),
    retargetTimer: Math.random() * 2,
  }
}

function updateWanderer(w: Wanderer, delta: number, speed: number): void {
  w.retargetTimer -= delta
  if (w.retargetTimer <= 0) {
    const a = Math.random() * Math.PI * 2
    w.vel.set(Math.cos(a) * speed, Math.sin(a) * speed)
    w.retargetTimer = 1 + Math.random() * 2
  }
  w.pos.x += w.vel.x * delta
  w.pos.y += w.vel.y * delta
  const mx = ROOM_HALF_W - WALL_TILE
  const my = ROOM_HALF_H - WALL_TILE
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
  shadowSoftness: number
  shadowBias: number
  ambient: number
  slimeCount: number
  torch1: boolean
  torch2: boolean
  torchIntensity: number
  torchDistance: number
  showWalls: boolean
  showPillars: boolean
  showKnights: boolean
}

function FlatlandScene(props: SceneProps) {
  const knightSheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const tilesetTex = useLoader(TextureLoader, './sprites/Dungeon_Tileset.png')
  // Individual selectors — destructuring `useThree()` subscribes to the
  // entire zustand store, so any `set(...)` (including our camera ref
  // callback setting `camera`) re-renders this component, recreates the
  // OrthoCamera ref, and cascades into a render loop.
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const flatlandRef = useRef<Flatland>(null)
  const defaultLightRef = useRef<InstanceType<typeof DefaultLightEffect>>(null)
  const ambientRef = useRef<Light2D>(null)

  const mapData = useDungeonFloor(tilesetTex)

  const torch1Ref = useRef<Light2D>(null)
  const torch2Ref = useRef<Light2D>(null)
  const flickerTimer = useRef(0)

  const heroRef = useRef<AnimatedSprite2D | null>(null)
  const heroPos = useRef(new Vector2(0, 0))
  const heroKeys = useRef({ up: false, down: false, left: false, right: false })
  const heroAnim = useRef<'idle' | 'run'>('idle')

  const knightsRef = useRef<{ anim: Wanderer; sprite: AnimatedSprite2D | null }[]>([])
  const slimesRef = useRef<{ anim: Wanderer; sprite: Sprite2D | null; light: Light2D | null }[]>([])

  if (knightsRef.current.length === 0) {
    for (let i = 0; i < KNIGHT_COUNT; i++) knightsRef.current.push({ anim: newWanderer(), sprite: null })
  }
  if (slimesRef.current.length !== props.slimeCount) {
    while (slimesRef.current.length < props.slimeCount) {
      slimesRef.current.push({ anim: newWanderer(), sprite: null, light: null })
    }
    if (slimesRef.current.length > props.slimeCount) slimesRef.current.length = props.slimeCount
  }

  // Push uniform values each frame via refs — effect instance updates are
  // zero-cost `.value =` writes on the underlying uniform nodes.
  useEffect(() => {
    const e = defaultLightRef.current as unknown as {
      bands: number
      shadowStrength: number
      shadowSoftness: number
      shadowBias: number
    } | null
    if (!e) return
    e.bands = props.quantize ? props.bands : 0
    e.shadowStrength = props.shadowStrength
    e.shadowSoftness = props.shadowSoftness
    e.shadowBias = props.shadowBias
  }, [props.bands, props.quantize, props.shadowStrength, props.shadowSoftness, props.shadowBias])

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
    const down = (e: KeyboardEvent) => {
      const k = keymap(e)
      if (k) { heroKeys.current[k] = true; e.preventDefault() }
    }
    const up = (e: KeyboardEvent) => {
      const k = keymap(e)
      if (k) { heroKeys.current[k] = false; e.preventDefault() }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, delta) => {
    flickerTimer.current += delta
    const t = flickerTimer.current

    if (torch1Ref.current) {
      torch1Ref.current.enabled = props.torch1
      torch1Ref.current.distance = props.torchDistance
      torch1Ref.current.intensity =
        props.torchIntensity * (1 + Math.sin(t * 15) * 0.1 + Math.sin(t * 23) * 0.05)
    }
    if (torch2Ref.current) {
      torch2Ref.current.enabled = props.torch2
      torch2Ref.current.distance = props.torchDistance
      torch2Ref.current.intensity =
        props.torchIntensity *
        0.85 *
        (1 + Math.sin(t * 17 + 1) * 0.1 + Math.sin(t * 19 + 2) * 0.05)
    }
    if (ambientRef.current) ambientRef.current.intensity = props.ambient

    const k = heroKeys.current
    const hvx = (k.right ? 1 : 0) - (k.left ? 1 : 0)
    const hvy = (k.up ? 1 : 0) - (k.down ? 1 : 0)
    if (hvx !== 0 || hvy !== 0) {
      const len = Math.hypot(hvx, hvy)
      heroPos.current.x += (hvx / len) * 70 * delta
      heroPos.current.y += (hvy / len) * 70 * delta
      const mx = ROOM_HALF_W - WALL_TILE
      const my = ROOM_HALF_H - WALL_TILE
      heroPos.current.x = Math.max(-mx, Math.min(mx, heroPos.current.x))
      heroPos.current.y = Math.max(-my, Math.min(my, heroPos.current.y))
    }
    if (heroRef.current) {
      heroRef.current.position.set(heroPos.current.x, heroPos.current.y, 0)
      heroRef.current.zIndex = -Math.floor(heroPos.current.y)
      const moving = hvx !== 0 || hvy !== 0
      if (moving && heroAnim.current !== 'run') {
        heroRef.current.play('run')
        heroAnim.current = 'run'
      } else if (!moving && heroAnim.current !== 'idle') {
        heroRef.current.play('idle')
        heroAnim.current = 'idle'
      }
      if (hvx !== 0) heroRef.current.flipX = hvx < 0
      heroRef.current.update(delta * 1000)
    }

    for (const kn of knightsRef.current) {
      updateWanderer(kn.anim, delta, 28)
      if (kn.sprite) {
        kn.sprite.position.set(kn.anim.pos.x, kn.anim.pos.y, 0)
        kn.sprite.zIndex = -Math.floor(kn.anim.pos.y)
        kn.sprite.flipX = kn.anim.vel.x < 0
        kn.sprite.update(delta * 1000)
      }
    }
    for (let i = 0; i < slimesRef.current.length; i++) {
      const s = slimesRef.current[i]!
      updateWanderer(s.anim, delta, 36)
      if (s.sprite) {
        s.sprite.position.set(s.anim.pos.x, s.anim.pos.y, 0)
        s.sprite.zIndex = -Math.floor(s.anim.pos.y)
      }
      if (s.light) {
        s.light.position.set(s.anim.pos.x, s.anim.pos.y, 0)
        s.light.intensity = 0.5 * (1 + Math.sin(t * 4 + i) * 0.25)
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
          shadowSoftness={props.shadowSoftness}
          shadowBias={props.shadowBias}
        />

        {/* Floor */}
        <tileMap2D data={mapData} scale={[TILE_SCALE, TILE_SCALE, 1]} position={[0, 0, -100]} />

        {/* Lights */}
        <light2D
          ref={torch1Ref}
          lightType="point"
          position={[TORCH_POSITIONS[0]![0], TORCH_POSITIONS[0]![1], 0]}
          color={0xff6600}
          intensity={1.2}
          distance={180}
          decay={2}
        />
        <light2D
          ref={torch2Ref}
          lightType="point"
          position={[TORCH_POSITIONS[1]![0], TORCH_POSITIONS[1]![1], 0]}
          color={0xffaa00}
          intensity={1.0}
          distance={180}
          decay={2}
        />
        <light2D ref={ambientRef} lightType="ambient" color={0x222233} intensity={props.ambient} />

        {/* Hero */}
        <animatedSprite2D
          ref={(el) => { heroRef.current = el }}
          texture={knightSheet.texture}
          spriteSheet={knightSheet}
          animationSet={knightAnimations}
          animation="idle"
          position={[0, 0, 0]}
          scale={[KNIGHT_SCALE * 1.2, KNIGHT_SCALE * 1.2, 1]}
          castsShadow
          lit
          layer={Layers.ENTITIES}
        >
          <autoNormalProvider attach={attachEffect} />
        </animatedSprite2D>

        {/* Walls */}
        {props.showWalls &&
          ROOM_WALLS.map((w, i) => (
            <sprite2D
              key={`wall-${i}`}
              texture={wallTex}
              position={[w.x, w.y, 0]}
              scale={[w.w, w.h, 1]}
              castsShadow
              lit
              layer={Layers.ENTITIES}
            >
              <autoNormalProvider attach={attachEffect} />
            </sprite2D>
          ))}

        {/* Pillars */}
        {props.showPillars &&
          PILLARS.map((p, i) => (
            <sprite2D
              key={`pillar-${i}`}
              texture={pillarTex}
              position={[p[0], p[1], 0]}
              scale={[WALL_TILE, WALL_TILE * 1.5, 1]}
              castsShadow
              lit
              layer={Layers.ENTITIES}
            >
              <autoNormalProvider attach={attachEffect} />
            </sprite2D>
          ))}

        {/* Wandering knights */}
        {props.showKnights &&
          knightsRef.current.map((kn, i) => (
            <animatedSprite2D
              key={`knight-${i}`}
              ref={(el) => { kn.sprite = el }}
              texture={knightSheet.texture}
              spriteSheet={knightSheet}
              animationSet={knightAnimations}
              animation="run"
              scale={[KNIGHT_SCALE, KNIGHT_SCALE, 1]}
              castsShadow
              lit
              layer={Layers.ENTITIES}
            >
              <autoNormalProvider attach={attachEffect} />
            </animatedSprite2D>
          ))}

        {/* Slimes + per-slime lights */}
        {slimesRef.current.map((s, i) => (
          <sprite2D
            key={`slime-${i}`}
            ref={(el) => { s.sprite = el }}
            texture={slimeTex}
            scale={[SLIME_SCALE, SLIME_SCALE, 1]}
            castsShadow
            lit
            layer={Layers.ENTITIES}
          >
            <autoNormalProvider attach={attachEffect} />
          </sprite2D>
        ))}
        {slimesRef.current.map((s, i) => (
          <light2D
            key={`slime-light-${i}`}
            ref={(el) => { s.light = el }}
            lightType="point"
            color={0x33ff66}
            intensity={0.5}
            distance={80}
            decay={2}
          />
        ))}

        {/* Fixed torch flame indicators */}
        <sprite2D
          texture={torch1Tex}
          position={[TORCH_POSITIONS[0]![0], TORCH_POSITIONS[0]![1], 0]}
          scale={[INDICATOR_SIZE, INDICATOR_SIZE, 1]}
          layer={Layers.FOREGROUND}
          alpha={props.torch1 ? 0.9 : 0.25}
          lit={false}
        />
        <sprite2D
          texture={torch2Tex}
          position={[TORCH_POSITIONS[1]![0], TORCH_POSITIONS[1]![1], 0]}
          scale={[INDICATOR_SIZE, INDICATOR_SIZE, 1]}
          layer={Layers.FOREGROUND}
          alpha={props.torch2 ? 0.9 : 0.25}
          lit={false}
        />
      </flatland>
    </>
  )
}

// ============================================
// APP
// ============================================

function Stats({ stats }: { stats: StatsHandle }) {
  useStatsMonitor(stats)
  return null
}

export default function App() {
  const { pane, stats } = usePane()
  useDevtoolsPanel(pane)

  const light = usePaneFolder(pane, 'Lighting', { expanded: true })
  const [quantize] = usePaneInput(light, 'quantize', true)
  const [bands] = usePaneInput(light, 'bands', 4, { min: 0, max: 8, step: 1 })
  const [ambient] = usePaneInput(light, 'ambient', 0.12, { min: 0, max: 0.6, step: 0.01 })

  const shadows = usePaneFolder(pane, 'Shadows')
  const [shadowStrength] = usePaneInput(shadows, 'strength', 0.85, { min: 0, max: 1, step: 0.05 })
  const [shadowSoftness] = usePaneInput(shadows, 'softness', 16, { min: 1, max: 48, step: 1 })
  const [shadowBias] = usePaneInput(shadows, 'bias', 1, { min: 0, max: 4, step: 0.1 })

  const torches = usePaneFolder(pane, 'Torches')
  const [torch1] = usePaneInput(torches, 'torch1', true)
  const [torch2] = usePaneInput(torches, 'torch2', true)
  const [torchIntensity] = usePaneInput(torches, 'intensity', 1.2, { min: 0, max: 3, step: 0.05 })
  const [torchDistance] = usePaneInput(torches, 'distance', 180, { min: 40, max: 400, step: 10 })

  const lights = usePaneFolder(pane, 'Slimes')
  const [slimeCount] = usePaneInput(lights, 'count', 10, { min: 0, max: 20, step: 1 })

  const scene = usePaneFolder(pane, 'Scene', { expanded: false })
  const [showWalls] = usePaneInput(scene, 'walls', true)
  const [showPillars] = usePaneInput(scene, 'pillars', true)
  const [showKnights] = usePaneInput(scene, 'knights', true)

  return (
    <Canvas renderer={{ antialias: false, trackTimestamp: true }}>
      <color attach="background" args={['#06060c']} />
      <Stats stats={stats} />
      <Suspense fallback={null}>
        <FlatlandScene
          bands={bands}
          quantize={quantize}
          shadowStrength={shadowStrength}
          shadowSoftness={shadowSoftness}
          shadowBias={shadowBias}
          ambient={ambient}
          slimeCount={slimeCount}
          torch1={torch1}
          torch2={torch2}
          torchIntensity={torchIntensity}
          torchDistance={torchDistance}
          showWalls={showWalls}
          showPillars={showPillars}
          showKnights={showKnights}
        />
      </Suspense>
    </Canvas>
  )
}
