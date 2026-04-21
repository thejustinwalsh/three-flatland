import { Suspense, useRef, useEffect, useMemo, useState } from 'react'
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
  LDtkLoader,
  Layers,
  attachLighting,
  attachEffect,
  type AnimationSetDefinition,
} from 'three-flatland/react'
import { DefaultLightEffect, AutoNormalProvider } from '@three-flatland/presets'
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
  AutoNormalProvider,
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
const KNIGHT_COUNT = 4

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

const slimeTex = solidCircle(0x3f, 0xff, 0x73, 24, true)

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
  shadowSoftness: number
  shadowBias: number
  shadowMaxDistance: number
  shadowPixelSize: number
  shadowBands: number
  shadowBandCurve: number
  shadowDebug: number
  ambient: number
  slimeCount: number
  torchIntensity: number
  torchDistance: number
  showKnights: boolean
}

function FlatlandScene(props: SceneProps) {
  const knightSheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const mapData = useLoader(LDtkLoader, './maps/dungeon.ldtk')

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

  const knightsRef = useRef<{ anim: Wanderer; sprite: AnimatedSprite2D | null }[]>([])
  const slimesRef = useRef<{ anim: Wanderer; sprite: Sprite2D | null; light: Light2D | null }[]>([])

  if (knightsRef.current.length === 0) {
    for (let i = 0; i < KNIGHT_COUNT; i++) knightsRef.current.push({ anim: newWanderer(mapHalfW, mapHalfH), sprite: null })
  }
  if (slimesRef.current.length !== props.slimeCount) {
    while (slimesRef.current.length < props.slimeCount) {
      slimesRef.current.push({ anim: newWanderer(mapHalfW, mapHalfH), sprite: null, light: null })
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
      shadowMaxDistance: number
      shadowPixelSize: number
      shadowBands: number
      shadowBandCurve: number
      shadowDebug: number
    } | null
    if (!e) return
    e.bands = props.quantize ? props.bands : 0
    e.shadowStrength = props.shadowStrength
    e.shadowSoftness = props.shadowSoftness
    e.shadowBias = props.shadowBias
    e.shadowMaxDistance = props.shadowMaxDistance
    e.shadowPixelSize = props.shadowPixelSize
    e.shadowBands = props.shadowBands
    e.shadowBandCurve = props.shadowBandCurve
    e.shadowDebug = props.shadowDebug
  }, [
    props.bands,
    props.quantize,
    props.shadowStrength,
    props.shadowSoftness,
    props.shadowBias,
    props.shadowMaxDistance,
    props.shadowPixelSize,
    props.shadowBands,
    props.shadowBandCurve,
    props.shadowDebug,
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
      if (k) { heroKeys.current[k] = true; e.preventDefault() }
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
      const hitRadius = TILE_PX * TILE_SCALE
      const switchStart = fixedLightPositions.length
      for (let i = 0; i < switchPositions.length; i++) {
        const [sx, sy] = switchPositions[i]!
        if (Math.abs(worldX - sx) < hitRadius && Math.abs(worldY - sy) < hitRadius) {
          setTorchEnabled(prev => {
            const next = [...prev]
            next[switchStart + i] = !next[switchStart + i]
            return next
          })
          break
        }
      }
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
    const k = heroKeys.current
    const hvx = (k.right ? 1 : 0) - (k.left ? 1 : 0)
    const hvy = (k.up ? 1 : 0) - (k.down ? 1 : 0)
    if (hvx !== 0 || hvy !== 0) {
      const len = Math.hypot(hvx, hvy)
      heroFacing.current.set(hvx / len, hvy / len)
      heroPos.current.x += (hvx / len) * 70 * delta
      heroPos.current.y += (hvy / len) * 70 * delta
      const mx = mapHalfW - WALL_TILE - KNIGHT_SCALE / 2
      const my = mapHalfH - WALL_TILE - KNIGHT_SCALE / 2
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
      updateWanderer(kn.anim, delta, 28, mapHalfW, mapHalfH, KNIGHT_SCALE / 2)
      if (kn.sprite) {
        kn.sprite.position.set(kn.anim.pos.x, kn.anim.pos.y, 0)
        kn.sprite.zIndex = -Math.floor(kn.anim.pos.y)
        kn.sprite.flipX = kn.anim.vel.x < 0
        kn.sprite.update(delta * 1000)
      }
    }
    for (let i = 0; i < slimesRef.current.length; i++) {
      const s = slimesRef.current[i]!
      updateWanderer(s.anim, delta, 36, mapHalfW, mapHalfH, SLIME_SCALE / 2)
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
          shadowMaxDistance={props.shadowMaxDistance}
          shadowPixelSize={props.shadowPixelSize}
          shadowBands={props.shadowBands}
          shadowBandCurve={props.shadowBandCurve}
        />

        {/* Floor — centered so map origin is at screen center */}
        <tileMap2D ref={tilemapRef} data={mapData} scale={[TILE_SCALE, TILE_SCALE, 1]} position={[-mapHalfW, -mapHalfH, -100]}>
          <autoNormalProvider attach={attachEffect} />
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

        {/* Hero */}
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
          layer={Layers.ENTITIES}
        >
          <autoNormalProvider attach={attachEffect} />
        </animatedSprite2D>

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
            // castsShadow omitted — the slime IS a light source (attached
            // Light2D at its center). Marking it as an occluder would
            // self-shadow its own light. Future: emit an "emissive rim"
            // so slimes still read as glowing solids without this hack.
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
  const [ambient] = usePaneInput(light, 'ambient', 0.4, { min: 0, max: 3, step: 0.05 })

  const shadows = usePaneFolder(pane, 'Shadows')
  const [shadowStrength] = usePaneInput(shadows, 'strength', 0.85, { min: 0, max: 1, step: 0.05 })
  const [shadowSoftness] = usePaneInput(shadows, 'softness', 16, { min: 1, max: 48, step: 1 })
  const [shadowBias] = usePaneInput(shadows, 'bias', 0.5, { min: 0, max: 2, step: 0.05 })
  const [shadowMaxDistance] = usePaneInput(shadows, 'maxDistance', 0, { min: 0, max: 600, step: 10 })
  const [shadowPixelSize] = usePaneInput(shadows, 'pixelSize', 0, { min: 0, max: 8, step: 1 })
  const [shadowBands] = usePaneInput(shadows, 'bands', 0, { min: 0, max: 8, step: 1 })
  const [shadowBandCurve] = usePaneInput(shadows, 'bandCurve', 1, { min: 0.25, max: 4, step: 0.05 })
  // Debug view modes:
  //   0 = normal, 1 = avg shadow mask, 2 = direct light (no shadow),
  //   3 = direct light (w/ shadow), 4 = SDF at surface, 5 = tile light count
  const [shadowDebug] = usePaneInput(shadows, 'debug mode', 0, {
    min: 0,
    max: 5,
    step: 1,
  })

  const torches = usePaneFolder(pane, 'Torches')
  const [torchIntensity] = usePaneInput(torches, 'intensity', 1.2, { min: 0, max: 3, step: 0.05 })
  const [torchDistance] = usePaneInput(torches, 'distance', 180, { min: 40, max: 400, step: 10 })

  const lights = usePaneFolder(pane, 'Slimes')
  const [slimeCount] = usePaneInput(lights, 'count', 10, { min: 0, max: 20, step: 1 })

  const scene = usePaneFolder(pane, 'Scene', { expanded: false })
  const [showKnights] = usePaneInput(scene, 'knights', true)

  return (
    <Canvas renderer={{ antialias: false, trackTimestamp: true }}>
      <color attach="background" args={['#06060c']} />
      <Suspense fallback={null}>
        <FlatlandScene
          bands={bands}
          quantize={quantize}
          shadowStrength={shadowStrength}
          shadowSoftness={shadowSoftness}
          shadowBias={shadowBias}
          shadowMaxDistance={shadowMaxDistance}
          shadowPixelSize={shadowPixelSize}
          shadowBands={shadowBands}
          shadowBandCurve={shadowBandCurve}
          shadowDebug={shadowDebug}
          ambient={ambient}
          slimeCount={slimeCount}
          torchIntensity={torchIntensity}
          torchDistance={torchDistance}
          showKnights={showKnights}
        />
      </Suspense>
    </Canvas>
  )
}
