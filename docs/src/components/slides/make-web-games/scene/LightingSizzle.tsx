import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { extend, useFrame, useLoader } from '@react-three/fiber/webgpu'
import { Vector2 } from 'three'
import {
  Light2D,
  TileMap2D,
  SpriteSheetLoader,
  LDtkLoader,
  AnimatedSprite2D,
  Layers,
  attachLighting,
  attachEffect,
} from 'three-flatland/react'
import { DefaultLightEffect, NormalMapProvider } from '@three-flatland/presets'
import '@three-flatland/presets/react'
import type { TileMapData, TileMapObject } from 'three-flatland/react'
import { useFlatlandActive } from '../../../deck/FlatlandLayer'

extend({
  Light2D,
  TileMap2D,
  AnimatedSprite2D,
  DefaultLightEffect,
  NormalMapProvider,
})

// ── Asset URLs ──────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL + 'slides/make-web-games/'
const MAP_URL = BASE + 'maps/dungeon.ldtk'
const KNIGHT_URL = BASE + 'sprites/knight.json'
const SLIME_URL = BASE + 'sprites/slime.json'

// ── Layout constants ────────────────────────────────────────────────────────

const TILE_SCALE = 2
const TILE_PX = 16
const WALL_INSET = TILE_PX * TILE_SCALE

const SLIME_COUNT = 16
const SLIME_SCALE = TILE_PX * TILE_SCALE
const SLIME_SPEED = 16 // world units / s — slow drift
const SLIME_RETARGET_MIN = 1.5
const SLIME_RETARGET_MAX = 3.5

const KNIGHT_SCALE = TILE_PX * TILE_SCALE * 2
const KNIGHT_SPEED = 60 // world units / s
const KNIGHT_ARRIVE_RADIUS = 6

// ── Map helpers ─────────────────────────────────────────────────────────────

function extractObjectsByType(mapData: TileMapData, type: string): TileMapObject[] {
  const out: TileMapObject[] = []
  for (const layer of mapData.objectLayers) {
    for (const obj of layer.objects) {
      if (obj.type === type) out.push(obj)
    }
  }
  return out
}

function mapToWorld(obj: TileMapObject, mapData: TileMapData, scale: number): [number, number] {
  const mapH = mapData.height * mapData.tileHeight
  const cx = (obj.x + obj.width / 2) * scale
  const cy = (mapH - obj.y - obj.height / 2) * scale
  const offsetX = (mapData.width * mapData.tileWidth * scale) / 2
  const offsetY = (mapH * scale) / 2
  return [cx - offsetX, cy - offsetY]
}

// Pick a uniformly-random point inside the playable interior (the square
// inside the wall ring, shrunk by `entityHalf` so the sprite centre never
// starts overlapping a wall).
function randomInterior(halfW: number, halfH: number, entityHalf: number): Vector2 {
  const mx = halfW - WALL_INSET - entityHalf
  const my = halfH - WALL_INSET - entityHalf
  return new Vector2((Math.random() * 2 - 1) * mx, (Math.random() * 2 - 1) * my)
}

// ── Tilemap + lighting scene (inner — runs inside FlatlandLayer's <flatland>) ──

function LightingScene({ lit }: { lit: boolean }) {
  const active = useFlatlandActive()

  const mapData = useLoader(LDtkLoader, MAP_URL, (l) => {
    l.normals = true
  })
  const knightSheet = useLoader(SpriteSheetLoader, KNIGHT_URL, (l) => {
    l.normals = true
  })
  const slimeSheet = useLoader(SpriteSheetLoader, SLIME_URL, (l) => {
    l.normals = true
  })

  const tilemapRef = useRef<TileMap2D>(null)
  const torchLightRefs = useRef<(Light2D | null)[]>([])
  const flickerTimer = useRef(0)

  const mapHalfW = (mapData.width * mapData.tileWidth * TILE_SCALE) / 2
  const mapHalfH = (mapData.height * mapData.tileHeight * TILE_SCALE) / 2

  const fixedLightPositions = useMemo(
    () => extractObjectsByType(mapData, 'light').map((obj) => mapToWorld(obj, mapData, TILE_SCALE)),
    [mapData],
  )

  const switchPositions = useMemo(
    () => extractObjectsByType(mapData, 'torch_switch').map((obj) => mapToWorld(obj, mapData, TILE_SCALE)),
    [mapData],
  )

  const allTorchPositions = useMemo(
    () => [...fixedLightPositions, ...switchPositions],
    [fixedLightPositions, switchPositions],
  )

  const [torchEnabled, setTorchEnabled] = useState<boolean[]>([])
  useEffect(() => {
    setTorchEnabled(allTorchPositions.map(() => true))
  }, [allTorchPositions.length])

  // ── Hero wander state ─────────────────────────────────────────────
  // The hero auto-walks to randomly generated interior targets (the
  // "generated click coordinate" wander). No keyboard / mouse input.
  const heroRef = useRef<AnimatedSprite2D | null>(null)
  const heroPos = useRef(new Vector2(0, 0))
  const heroTarget = useRef<Vector2 | null>(null)
  const heroMoving = useRef(false)
  const heroSpawned = useRef(false)
  if (!heroSpawned.current && fixedLightPositions.length > 0) {
    const [tx, ty] = fixedLightPositions[0]!
    heroPos.current.set(tx + WALL_INSET, ty)
    heroSpawned.current = true
  }

  // ── Slime wander state ────────────────────────────────────────────
  // Each slime drifts on a slow random velocity, retargets every few
  // seconds, and bounces off the interior bounds.
  type Slime = {
    sprite: AnimatedSprite2D | null
    light: Light2D | null
    pos: Vector2
    vel: Vector2
    retarget: number
  }
  const slimesRef = useRef<Slime[]>([])
  if (slimesRef.current.length !== SLIME_COUNT) {
    slimesRef.current = Array.from({ length: SLIME_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2
      return {
        sprite: null,
        light: null,
        pos: randomInterior(mapHalfW, mapHalfH, SLIME_SCALE / 2),
        vel: new Vector2(Math.cos(angle) * SLIME_SPEED, Math.sin(angle) * SLIME_SPEED),
        retarget: SLIME_RETARGET_MIN + Math.random() * (SLIME_RETARGET_MAX - SLIME_RETARGET_MIN),
      }
    })
  }

  useEffect(() => {
    tilemapRef.current?.markOccluders(['collision'])
  }, [mapData])

  // Torch flicker animation — only runs when the layer is active.
  useFrame((_, rawDelta) => {
    if (!active) return
    flickerTimer.current += rawDelta
    const t = flickerTimer.current
    const wallCount = fixedLightPositions.length
    for (let i = 0; i < torchLightRefs.current.length; i++) {
      const torch = torchLightRefs.current[i]
      if (!torch) continue
      const isWall = i < wallCount
      const intensityBase = 1.8 * (isWall ? 1.6 : 0.8)
      torch.enabled = lit && (torchEnabled[i] ?? true)
      torch.intensity =
        intensityBase *
        (1 + Math.sin(t * (15 + i * 2)) * 0.1 + Math.sin(t * (23 + i * 3)) * 0.05)
    }
  })

  // Entity motion — slimes wander on drifting velocities, the knight
  // auto-walks to generated targets. Gated on the active layer.
  useFrame((_, delta) => {
    if (!active) return

    // ── Slimes: drift + retarget + bounce ──────────────────────────
    const slimeBoundX = mapHalfW - WALL_INSET - SLIME_SCALE / 2
    const slimeBoundY = mapHalfH - WALL_INSET - SLIME_SCALE / 2
    for (const s of slimesRef.current) {
      s.retarget -= delta
      if (s.retarget <= 0) {
        const angle = Math.random() * Math.PI * 2
        s.vel.set(Math.cos(angle) * SLIME_SPEED, Math.sin(angle) * SLIME_SPEED)
        s.retarget = SLIME_RETARGET_MIN + Math.random() * (SLIME_RETARGET_MAX - SLIME_RETARGET_MIN)
      }
      s.pos.x += s.vel.x * delta
      s.pos.y += s.vel.y * delta
      if (s.pos.x > slimeBoundX) { s.pos.x = slimeBoundX; s.vel.x = -Math.abs(s.vel.x) }
      if (s.pos.x < -slimeBoundX) { s.pos.x = -slimeBoundX; s.vel.x = Math.abs(s.vel.x) }
      if (s.pos.y > slimeBoundY) { s.pos.y = slimeBoundY; s.vel.y = -Math.abs(s.vel.y) }
      if (s.pos.y < -slimeBoundY) { s.pos.y = -slimeBoundY; s.vel.y = Math.abs(s.vel.y) }

      if (s.sprite) {
        s.sprite.position.set(s.pos.x, s.pos.y, 0)
        s.sprite.zIndex = -Math.floor(s.pos.y)
        if (Math.abs(s.vel.x) > 1) s.sprite.flipX = s.vel.x < 0
        s.sprite.update(delta * 1000)
      }
      if (s.light) s.light.position.set(s.pos.x, s.pos.y, 0)
    }

    // ── Knight: auto-walk toward a generated target ────────────────
    const hero = heroRef.current
    if (hero) {
      if (heroTarget.current === null) {
        heroTarget.current = randomInterior(mapHalfW, mapHalfH, KNIGHT_SCALE / 2)
      }
      const tgt = heroTarget.current
      const dx = tgt.x - heroPos.current.x
      const dy = tgt.y - heroPos.current.y
      const dist = Math.hypot(dx, dy)
      let moving = false
      let facingX = 1
      if (dist <= KNIGHT_ARRIVE_RADIUS) {
        // Arrived — pick a fresh generated target next frame.
        heroTarget.current = null
      } else {
        facingX = dx / dist
        const step = Math.min(KNIGHT_SPEED * delta, dist)
        heroPos.current.x += (dx / dist) * step
        heroPos.current.y += (dy / dist) * step
        moving = true
      }

      hero.position.set(heroPos.current.x, heroPos.current.y, 0)
      hero.zIndex = -Math.floor(heroPos.current.y)
      if (moving && !heroMoving.current) {
        hero.play('run')
        heroMoving.current = true
      } else if (!moving && heroMoving.current) {
        hero.play('idle')
        heroMoving.current = false
      }
      if (moving && Math.abs(facingX) > 0.01) hero.flipX = facingX < 0
      hero.update(delta * 1000)
    }
  })

  return (
    <>
      {/* DefaultLightEffect: only attached when lit=true */}
      {lit && (
        <defaultLightEffect
          attach={attachLighting}
          bands={4}
          shadowStrength={0.8}
          shadowBias={0.5}
          shadowStartOffsetScale={1}
          shadowMaxDistance={300}
          shadowPixelSize={4}
          pixelSize={4}
          lightHeight={0.75}
        />
      )}

      {/* Tilemap */}
      <tileMap2D
        ref={tilemapRef}
        data={mapData}
        scale={[TILE_SCALE, TILE_SCALE, 1]}
        position={[-mapHalfW, -mapHalfH, -100]}
      >
        <normalMapProvider
          attach={attachEffect}
          normalMap={mapData.tilesets[0]?.normalMap ?? null}
        />
      </tileMap2D>

      {/* Ambient — purple dungeon atmosphere */}
      {lit && <light2D lightType="ambient" color={0x5544aa} intensity={0.6} />}

      {/* Wall torches (fixed) — warm orange */}
      {fixedLightPositions.map((pos, i) => (
        <light2D
          key={`wall-torch-${i}`}
          ref={(el: Light2D | null) => {
            torchLightRefs.current[i] = el
          }}
          lightType="point"
          position={[pos[0], pos[1], 0]}
          color={0xff6600}
          intensity={1.8 * 1.6}
          distance={140}
          decay={2}
          importance={10}
          enabled={lit && (torchEnabled[i] ?? true)}
        />
      ))}

      {/* Toggle torches (switchable) — cool amber */}
      {switchPositions.map((pos, i) => (
        <light2D
          key={`switch-torch-${i}`}
          ref={(el: Light2D | null) => {
            torchLightRefs.current[fixedLightPositions.length + i] = el
          }}
          lightType="point"
          position={[pos[0], pos[1], 0]}
          color={0xffcc44}
          intensity={1.8 * 0.8 * 0.8}
          distance={140 * 0.7}
          decay={2}
          importance={10}
          enabled={lit && (torchEnabled[fixedLightPositions.length + i] ?? true)}
        />
      ))}

      {/* Hero knight — auto-wanders to generated interior targets */}
      <animatedSprite2D
        ref={(el: AnimatedSprite2D | null) => {
          heroRef.current = el
        }}
        texture={knightSheet.texture}
        spriteSheet={knightSheet}
        animationSet={{
          fps: 8,
          animations: {
            idle: { frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'], fps: 6, loop: true },
            run: {
              frames: Array.from({ length: 16 }, (_, k) => `run_${k}`),
              fps: 16,
              loop: true,
            },
          },
        }}
        animation="idle"
        position={[heroPos.current.x, heroPos.current.y, 0]}
        scale={[KNIGHT_SCALE, KNIGHT_SCALE, 1]}
        castsShadow
        lit={lit}
        layer={Layers.ENTITIES + 1}
      >
        <normalMapProvider attach={attachEffect} normalMap={knightSheet.normalMap ?? null} />
      </animatedSprite2D>

      {/* Slimes — drift around the interior and bounce off the bounds */}
      {slimesRef.current.map((s, i) => (
        <animatedSprite2D
          key={`slime-${i}`}
          ref={(el: AnimatedSprite2D | null) => {
            // Stagger each slime's animation cursor once on first mount so
            // they don't all play frame 0 in lockstep.
            const firstMount = el !== null && s.sprite === null
            s.sprite = el
            if (firstMount && el !== null) {
              el.play('walk', { startFrame: Math.floor(Math.random() * 8) })
            }
          }}
          texture={slimeSheet.texture}
          spriteSheet={slimeSheet}
          animationSet={{
            fps: 8,
            animations: {
              idle: {
                frames: Array.from({ length: 8 }, (_, k) => `idle_${k}`),
                fps: 6,
                loop: true,
              },
              walk: {
                frames: Array.from({ length: 8 }, (_, k) => `walk_${k}`),
                fps: 10,
                loop: true,
              },
            },
          }}
          animation="walk"
          position={[s.pos.x, s.pos.y, 0]}
          scale={[SLIME_SCALE, SLIME_SCALE, 1]}
          anchor={[0.5, 0.5]}
          lit={lit}
          layer={Layers.ENTITIES}
        >
          <normalMapProvider attach={attachEffect} normalMap={slimeSheet.normalMap ?? null} />
        </animatedSprite2D>
      ))}

      {/* Slime glow lights — only when lit; positions tracked each frame */}
      {lit &&
        slimesRef.current.map((s, i) => (
          <light2D
            key={`slime-light-${i}`}
            ref={(el: Light2D | null) => {
              s.light = el
            }}
            lightType="point"
            position={[s.pos.x, s.pos.y, 0]}
            color={0x33ff66}
            intensity={0.25}
            distance={40}
            decay={2}
            castsShadow={false}
          />
        ))}
    </>
  )
}

// ── Public export ────────────────────────────────────────────────────────────

export function LightingSizzle({ lit = true }: { lit?: boolean }) {
  return (
    <Suspense fallback={null}>
      <LightingScene lit={lit} />
    </Suspense>
  )
}
