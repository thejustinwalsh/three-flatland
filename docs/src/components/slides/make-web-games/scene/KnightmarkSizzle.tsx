import { Suspense, useRef, useEffect, useCallback, useMemo } from 'react'
import { extend, useFrame, useLoader } from '@react-three/fiber/webgpu'
import { setSizzleStats } from '../sizzleStats'
import {
  AnimatedSprite2D,
  Sprite2DMaterial,
  SpriteGroup,
  SpriteSheetLoader,
  TextureLoader,
  TileMap2D,
  SortLayers,
  type AnimationSetDefinition,
  type SpriteSheet,
  type TileMapData,
  type TilesetData,
  type TileLayerData,
} from 'three-flatland/react'
import { useFlatlandActive } from '../../../deck/FlatlandLayer'

extend({ SpriteGroup, TileMap2D })

// ============================================
// ASSET PATHS
// ============================================

const KNIGHT_JSON = import.meta.env.BASE_URL + 'slides/make-web-games/sprites/knight.json'
const TILESET_PNG = import.meta.env.BASE_URL + 'slides/make-web-games/sprites/Dungeon_Tileset.png'

// ============================================
// CONSTANTS
// ============================================

const SPEED_THRESHOLD = 80
const TRIP_LERP_RATE = 5
const IDLE_AFTER_TRIP_MS = 400

// World bounds — matches FlatlandLayer viewSize 700 at 16:9
const VIEW_SIZE = 700
const HALF_W = (VIEW_SIZE * (16 / 9)) / 2
const HALF_H = VIEW_SIZE / 2

// Floor tilemap (Dungeon_Tileset.png — 10×10 grid of 16px tiles)
const TILE_PX = 16
const TILE_SCALE = 2

// Adaptive ramp: spawn on a timer, growing the per-tick batch like a tween, until
// the framerate dips below target — then latch and hold. "Scale until stable."
const INITIAL_BATCH = 4
const SPAWN_INTERVAL_MS = 150
const BATCH_GROWTH = 1.15
const MAX_BATCH = 400
// Presenting on a 60Hz display (FPS quantizes 60→30→20…); push until it holds ~30.
const FPS_TARGET = 32
const LATCH_MS = 1000
const SPRITE_CAP = 60000

const KNIGHT_SCALE = 48
const SPEED_MIN = 40
const SPEED_MAX = 180
const HIT_RADIUS = 10

// ============================================
// TYPES
// ============================================

type KnightState = 'WALK' | 'ROLL' | 'TRIP' | 'TRIP_IDLE'

interface Knight {
  sprite: AnimatedSprite2D
  state: KnightState
  baseVx: number
  baseVy: number
  speed: number
  vx: number
  vy: number
  idleTimer: number
}

// ============================================
// ANIMATIONS
// ============================================

const knightAnimations: AnimationSetDefinition = {
  fps: 10,
  animations: {
    idle: {
      frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'],
      fps: 8,
      loop: true,
    },
    run: {
      frames: [
        'run_0',
        'run_1',
        'run_2',
        'run_3',
        'run_4',
        'run_5',
        'run_6',
        'run_7',
        'run_8',
        'run_9',
        'run_10',
        'run_11',
        'run_12',
        'run_13',
        'run_14',
        'run_15',
      ],
      fps: 16,
      loop: true,
    },
    roll: {
      frames: ['roll_0', 'roll_1', 'roll_2', 'roll_3', 'roll_4', 'roll_5', 'roll_6', 'roll_7'],
      fps: 15,
      loop: false,
    },
    death: {
      frames: ['death_0', 'death_1', 'death_2', 'death_3'],
      fps: 8,
      loop: false,
    },
  },
}

// ============================================
// SPATIAL HASH (pooled — zero alloc per frame)
// ============================================

class SpatialHash {
  cellSize: number
  private cells = new Map<number, Knight[]>()
  private _bucketPool: Knight[][] = []
  private _activeBuckets: Knight[][] = []

  constructor(cellSize: number) {
    this.cellSize = cellSize
  }

  private key(cx: number, cy: number): number {
    return ((cx + 0x8000) << 16) | ((cy + 0x8000) & 0xffff)
  }

  clear(): void {
    for (let i = 0; i < this._activeBuckets.length; i++) {
      const b = this._activeBuckets[i]!
      b.length = 0
      this._bucketPool.push(b)
    }
    this._activeBuckets.length = 0
    this.cells.clear()
  }

  insert(k: Knight): void {
    const cx = Math.floor(k.sprite.position.x / this.cellSize)
    const cy = Math.floor(k.sprite.position.y / this.cellSize)
    const key = this.key(cx, cy)
    let bucket = this.cells.get(key)
    if (!bucket) {
      bucket = this._bucketPool.pop() ?? []
      this._activeBuckets.push(bucket)
      this.cells.set(key, bucket)
    }
    bucket.push(k)
  }

  forEachNeighbor(k: Knight, visitor: (other: Knight) => boolean): void {
    const cx = Math.floor(k.sprite.position.x / this.cellSize)
    const cy = Math.floor(k.sprite.position.y / this.cellSize)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(this.key(cx + dx, cy + dy))
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) {
            if (bucket[i] !== k && visitor(bucket[i]!)) return
          }
        }
      }
    }
  }
}

// ============================================
// STATE TRANSITIONS
// ============================================

function triggerTrip(k: Knight) {
  k.state = 'TRIP'
  k.sprite.play('death', {
    onComplete: () => {
      k.state = 'TRIP_IDLE'
      k.idleTimer = IDLE_AFTER_TRIP_MS
      k.sprite.play('idle')
    },
  })
}

function triggerRoll(k: Knight) {
  k.state = 'ROLL'
  k.sprite.play('roll', {
    onComplete: () => {
      k.state = 'WALK'
      k.sprite.play(k.speed < SPEED_THRESHOLD ? 'idle' : 'run')
    },
  })
}

// ============================================
// SPAWN HELPER
// ============================================

function spawnKnight(sheet: SpriteSheet, group: SpriteGroup): Knight {
  const margin = KNIGHT_SCALE / 2
  const material = Sprite2DMaterial.getShared({ map: sheet.texture, alphaTest: 0.5 })
  const sprite = new AnimatedSprite2D({
    spriteSheet: sheet,
    animationSet: knightAnimations,
    animation: 'idle',
    sortLayer: SortLayers.ENTITIES,
    anchor: [0.5, 0.5],
    material,
  })
  sprite.scale.set(KNIGHT_SCALE, KNIGHT_SCALE, 1)
  const x = -HALF_W + margin + Math.random() * (HALF_W * 2 - margin * 2)
  const y = -HALF_H + margin + Math.random() * (HALF_H * 2 - margin * 2)
  sprite.position.set(x, y, 0)
  const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)
  const angle = Math.random() * Math.PI * 2
  const baseVx = Math.cos(angle) * speed
  const baseVy = Math.sin(angle) * speed
  sprite.play(speed < SPEED_THRESHOLD ? 'idle' : 'run')
  sprite.flipX = baseVx < 0
  group.add(sprite)
  return { sprite, state: 'WALK', baseVx, baseVy, speed, vx: baseVx, vy: baseVy, idleTimer: 0 }
}

// ============================================
// FLOOR TILEMAP (ported from examples/react/knightmark/App.tsx)
// ============================================

function FloorTilemap() {
  const tilesetTex = useLoader(TextureLoader, TILESET_PNG)

  const { mapData, mapWorldW, mapWorldH } = useMemo(() => {
    const TS_COLS = 10
    const TS_ROWS = 10

    // Cover the camera view generously (support ultrawide)
    const mapCols = Math.ceil((VIEW_SIZE * 3) / TILE_PX) + 4
    const mapRows = Math.ceil(VIEW_SIZE / TILE_PX) + 4

    // Floor tile pattern — 4×3 clean stone floor from rows 0-2, cols 6-9.
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
      texture: tilesetTex,
    }

    const floorLayer: TileLayerData = {
      name: 'Floor',
      id: 0,
      width: mapCols,
      height: mapRows,
      data: floorData,
    }

    const data: TileMapData = {
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

    return {
      mapData: data,
      mapWorldW: mapCols * TILE_PX * TILE_SCALE,
      mapWorldH: mapRows * TILE_PX * TILE_SCALE,
    }
  }, [tilesetTex])

  return (
    <tileMap2D
      data={mapData}
      enableCollision={false}
      scale={[TILE_SCALE, TILE_SCALE, 1]}
      position={[-mapWorldW / 2, -mapWorldH / 2, -1]}
    />
  )
}

// ============================================
// INNER SCENE (needs loader — wrapped in Suspense by parent)
// ============================================

function KnightmarkScene() {
  const active = useFlatlandActive()
  const sheet = useLoader(SpriteSheetLoader, KNIGHT_JSON)
  const groupRef = useRef<SpriteGroup>(null)
  const knightsRef = useRef<Knight[]>([])
  const hashRef = useRef(new SpatialHash(HIT_RADIUS * 4))
  const spawnTimerRef = useRef(0)
  const fpsRef = useRef(60)
  const batchRef = useRef(INITIAL_BATCH)
  const saturatedRef = useRef(false)
  const lowFpsTimeRef = useRef(0)

  // Spawn first batch imperatively once group mounts
  const spawnBatch = useCallback(
    (count: number) => {
      const group = groupRef.current
      if (!group) return
      for (let i = 0; i < count; i++) {
        knightsRef.current.push(spawnKnight(sheet, group))
      }
    },
    [sheet]
  )

  // Spawn the seed batch on mount. Each visit to the slide remounts this whole
  // component (via a key in DeckScene), which is the reset — fresh empty batch,
  // ramp from zero — and disposes the old batch in one shot (no per-sprite churn).
  useEffect(() => {
    const id = setTimeout(() => spawnBatch(INITIAL_BATCH), 0)
    return () => clearTimeout(id)
  }, [spawnBatch])

  useFrame((_, delta) => {
    if (!active) return

    const deltaMs = delta * 1000
    const knights = knightsRef.current
    const hash = hashRef.current
    const margin = KNIGHT_SCALE / 2

    // Smoothed FPS first — it gates the ramp.
    if (delta > 0) fpsRef.current = fpsRef.current * 0.9 + (1 / delta) * 0.1

    // Latch only after the framerate stays below target for a sustained window —
    // brief jitter shouldn't stop the ramp.
    if (knights.length > 250 && fpsRef.current < FPS_TARGET) {
      lowFpsTimeRef.current += deltaMs
      if (lowFpsTimeRef.current > LATCH_MS) saturatedRef.current = true
    } else {
      lowFpsTimeRef.current = 0
    }

    // Adaptive ramp: grow the batch each tick (tween) and spawn until latched.
    if (!saturatedRef.current && knights.length < SPRITE_CAP) {
      spawnTimerRef.current += deltaMs
      if (spawnTimerRef.current >= SPAWN_INTERVAL_MS) {
        spawnTimerRef.current = 0
        spawnBatch(Math.round(batchRef.current))
        batchRef.current = Math.min(batchRef.current * BATCH_GROWTH, MAX_BATCH)
      }
    }

    setSizzleStats({ spriteCount: knights.length, fps: fpsRef.current })

    // Movement + animation
    for (const k of knights) {
      switch (k.state) {
        case 'WALK':
        case 'ROLL':
          k.vx = k.baseVx
          k.vy = k.baseVy
          break
        case 'TRIP':
          k.vx += (0 - k.vx) * Math.min(1, TRIP_LERP_RATE * delta)
          k.vy += (0 - k.vy) * Math.min(1, TRIP_LERP_RATE * delta)
          break
        case 'TRIP_IDLE':
          k.vx = 0
          k.vy = 0
          k.idleTimer -= deltaMs
          if (k.idleTimer <= 0) {
            k.state = 'WALK'
            k.vx = k.baseVx
            k.vy = k.baseVy
            k.sprite.play(k.speed < SPEED_THRESHOLD ? 'idle' : 'run')
          }
          break
      }
      k.sprite.position.x += k.vx * delta
      k.sprite.position.y += k.vy * delta

      // Bounce off world edges
      if (k.sprite.position.x < -HALF_W + margin) {
        k.sprite.position.x = -HALF_W + margin
        k.baseVx = Math.abs(k.baseVx)
        k.vx = Math.abs(k.vx)
      } else if (k.sprite.position.x > HALF_W - margin) {
        k.sprite.position.x = HALF_W - margin
        k.baseVx = -Math.abs(k.baseVx)
        k.vx = -Math.abs(k.vx)
      }
      if (k.sprite.position.y < -HALF_H + margin) {
        k.sprite.position.y = -HALF_H + margin
        k.baseVy = Math.abs(k.baseVy)
        k.vy = Math.abs(k.vy)
      } else if (k.sprite.position.y > HALF_H - margin) {
        k.sprite.position.y = HALF_H - margin
        k.baseVy = -Math.abs(k.baseVy)
        k.vy = -Math.abs(k.vy)
      }
      k.sprite.flipX = k.baseVx < 0
      k.sprite.zIndex = -Math.floor(k.sprite.position.y)
      k.sprite.update(deltaMs)
    }

    // Knight-knight collision via spatial hash
    hash.cellSize = HIT_RADIUS * 4
    hash.clear()
    for (const k of knights) hash.insert(k)
    const collDistSq = (HIT_RADIUS * 2) ** 2
    for (const k of knights) {
      if (k.state !== 'WALK') continue
      hash.forEachNeighbor(k, (other) => {
        if (other.state !== 'WALK') return false
        const dx = other.sprite.position.x - k.sprite.position.x
        const dy = other.sprite.position.y - k.sprite.position.y
        if (dx * dx + dy * dy < collDistSq) {
          if (Math.random() < k.speed / (k.speed + other.speed)) {
            triggerTrip(k)
            triggerRoll(other)
          } else {
            triggerTrip(other)
            triggerRoll(k)
          }
          return true
        }
        return false
      })
    }
  })

  return (
    <>
      {/* Floor renders first / at z=-1 → behind the knights */}
      <FloorTilemap />
      <spriteGroup ref={groupRef} />
    </>
  )
}

// ============================================
// PUBLIC EXPORT
// ============================================

export function KnightmarkSizzle() {
  return (
    <Suspense fallback={null}>
      <KnightmarkScene />
    </Suspense>
  )
}
