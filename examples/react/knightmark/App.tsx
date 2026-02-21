import { Suspense, useRef, useMemo, useCallback, useEffect } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import type { OrthographicCamera as OrthoCamera } from 'three'
import {
  AnimatedSprite2D,
  Renderer2D,
  SpriteSheetLoader,
  TextureLoader,
  TileMap2D,
  Layers,
  type AnimationSetDefinition,
  type SpriteSheet,
  type TileMapData,
  type TilesetData,
  type TileLayerData,
} from '@three-flatland/react'

extend({ Renderer2D, TileMap2D })

// ============================================
// CONSTANTS
// ============================================

const HIT_RADIUS = 8
const CELL_SIZE = HIT_RADIUS * 4
const KNIGHT_SCALE = 64
const SPEED_MIN = 30
const SPEED_MAX = 200
const SPEED_THRESHOLD = 80
const TRIP_LERP_RATE = 5
const IDLE_AFTER_TRIP_MS = 400

const VIEW_SIZE = 640

// Tilemap
const TILE_PX = 16
const TILE_SCALE = 2

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
// KNIGHT ANIMATIONS
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
        'run_0', 'run_1', 'run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7',
        'run_8', 'run_9', 'run_10', 'run_11', 'run_12', 'run_13', 'run_14', 'run_15',
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
// SPATIAL HASH
// ============================================

class SpatialHash {
  private cellSize: number
  private cells = new Map<number, Knight[]>()
  private _bucketPool: Knight[][] = []
  private _activeBuckets: Knight[][] = []

  constructor(cellSize: number) {
    this.cellSize = cellSize
  }

  private key(cx: number, cy: number): number {
    const a = cx + 0x8000
    const b = cy + 0x8000
    return (a << 16) | (b & 0xffff)
  }

  clear(): void {
    for (let i = 0; i < this._activeBuckets.length; i++) {
      const bucket = this._activeBuckets[i]!
      bucket.length = 0
      this._bucketPool.push(bucket)
    }
    this._activeBuckets.length = 0
    this.cells.clear()
  }

  insert(knight: Knight): void {
    const cx = Math.floor(knight.sprite.position.x / this.cellSize)
    const cy = Math.floor(knight.sprite.position.y / this.cellSize)
    const k = this.key(cx, cy)
    let bucket = this.cells.get(k)
    if (!bucket) {
      bucket = this._bucketPool.pop() || []
      this._activeBuckets.push(bucket)
      this.cells.set(k, bucket)
    }
    bucket.push(knight)
  }

  forEachNeighbor(knight: Knight, visitor: (other: Knight) => boolean): void {
    const cx = Math.floor(knight.sprite.position.x / this.cellSize)
    const cy = Math.floor(knight.sprite.position.y / this.cellSize)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(this.key(cx + dx, cy + dy))
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) {
            if (bucket[i] !== knight) {
              if (visitor(bucket[i]!)) return
            }
          }
        }
      }
    }
  }
}

// ============================================
// STATE TRANSITIONS
// ============================================

function triggerTrip(knight: Knight) {
  knight.state = 'TRIP'
  knight.sprite.play('death', {
    onComplete: () => {
      knight.state = 'TRIP_IDLE'
      knight.idleTimer = IDLE_AFTER_TRIP_MS
      knight.sprite.play('idle')
    },
  })
}

function triggerRoll(knight: Knight) {
  knight.state = 'ROLL'
  knight.sprite.play('roll', {
    onComplete: () => {
      knight.state = 'WALK'
      const animName = knight.speed < SPEED_THRESHOLD ? 'idle' : 'run'
      knight.sprite.play(animName)
    },
  })
}

// ============================================
// SPAWN HELPER
// ============================================

function spawnKnight(
  sheet: SpriteSheet,
  renderer2D: Renderer2D,
  bounds: { left: number; right: number; top: number; bottom: number },
): Knight {
  const margin = KNIGHT_SCALE / 2
  const sprite = new AnimatedSprite2D({
    spriteSheet: sheet,
    animationSet: knightAnimations,
    animation: 'idle',
    layer: Layers.ENTITIES,
    anchor: [0.5, 0.5],
  })
  sprite.scale.set(KNIGHT_SCALE, KNIGHT_SCALE, 1)
  const x = bounds.left + margin + Math.random() * (bounds.right - bounds.left - margin * 2)
  const y = bounds.bottom + margin + Math.random() * (bounds.top - bounds.bottom - margin * 2)
  sprite.position.set(x, y, 0)
  const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)
  const angle = Math.random() * Math.PI * 2
  const baseVx = Math.cos(angle) * speed
  const baseVy = Math.sin(angle) * speed
  const animName = speed < SPEED_THRESHOLD ? 'idle' : 'run'
  sprite.play(animName)
  sprite.flipX = baseVx < 0
  renderer2D.add(sprite)
  return {
    sprite, state: 'WALK', baseVx, baseVy, speed,
    vx: baseVx, vy: baseVy, idleTimer: 0,
  }
}

// ============================================
// SCENE COMPONENT
// ============================================

interface KnightmarkSceneProps {
  statsRef: React.RefObject<HTMLDivElement | null>
  addKnightsRef: React.RefObject<(() => void) | null>
}

function KnightmarkScene({ statsRef, addKnightsRef }: KnightmarkSceneProps) {
  const { size } = useThree()
  const camera = useThree((s) => s.camera) as OrthoCamera

  // Load assets (presets automatically apply NearestFilter)
  const knightSheet = useLoader(SpriteSheetLoader, import.meta.env.BASE_URL + 'sprites/knight.json')
  const tilesetTex = useLoader(TextureLoader, import.meta.env.BASE_URL + 'sprites/Dungeon_Tileset.png')

  const renderer2DRef = useRef<Renderer2D>(null)
  const knightsRef = useRef<Knight[]>([])
  const spatialHashRef = useRef(new SpatialHash(CELL_SIZE))
  const boundsRef = useRef({ left: 0, right: 0, top: 0, bottom: 0 })
  const fpsRef = useRef({ frames: 0, time: 0, display: 0 })

  // Update camera frustum and bounds when size changes
  useEffect(() => {
    const aspect = size.width / size.height
    const halfW = (VIEW_SIZE * aspect) / 2
    const halfH = VIEW_SIZE / 2
    camera.left = -halfW
    camera.right = halfW
    camera.top = halfH
    camera.bottom = -halfH
    camera.updateProjectionMatrix()
    boundsRef.current = { left: -halfW, right: halfW, top: halfH, bottom: -halfH }
  }, [size, camera])

  // Build floor tilemap data
  const { mapData, mapWorldW, mapWorldH } = useMemo(() => {
    const TS_COLS = 10
    const TS_ROWS = 10

    // Cover the camera view generously (support ultrawide)
    const mapCols = Math.ceil((VIEW_SIZE * 3) / TILE_PX) + 4
    const mapRows = Math.ceil(VIEW_SIZE / TILE_PX) + 4

    // Floor tile pattern — 4×3 clean stone floor from rows 0-2, cols 6-9.
    // The upper-left room tiles have wall shading baked in; these upper-right
    // tiles are the standalone floor meant to be tiled freely.
    const FLOOR_PATTERN = [
       7,  8,  9, 10, // row 0, cols 6-9
      17, 18, 19, 20, // row 1, cols 6-9
      27, 28, 29, 30, // row 2, cols 6-9
    ]

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

  // Spawn batch of knights
  const spawnBatch = useCallback((count: number) => {
    const r2d = renderer2DRef.current
    if (!r2d) return
    const bounds = boundsRef.current
    for (let i = 0; i < count; i++) {
      knightsRef.current.push(spawnKnight(knightSheet, r2d, bounds))
    }
  }, [knightSheet])

  // Initial spawn + expose add handler
  useEffect(() => {
    spawnBatch(10)
    addKnightsRef.current = () => spawnBatch(100)
    return () => { addKnightsRef.current = null }
  }, [spawnBatch, addKnightsRef])

  // Game loop
  useFrame((_, delta) => {
    const dt = delta
    const deltaMs = delta * 1000
    const knights = knightsRef.current
    const spatialHash = spatialHashRef.current
    const bounds = boundsRef.current
    const margin = KNIGHT_SCALE / 2

    // FPS tracking
    fpsRef.current.frames++
    fpsRef.current.time += deltaMs
    if (fpsRef.current.time >= 500) {
      fpsRef.current.display = Math.round((fpsRef.current.frames / fpsRef.current.time) * 1000)
      fpsRef.current.frames = 0
      fpsRef.current.time = 0
    }

    // Update knight movement and animation
    for (const k of knights) {
      switch (k.state) {
        case 'WALK': case 'ROLL':
          k.vx = k.baseVx; k.vy = k.baseVy; break
        case 'TRIP':
          k.vx += (0 - k.vx) * Math.min(1, TRIP_LERP_RATE * dt)
          k.vy += (0 - k.vy) * Math.min(1, TRIP_LERP_RATE * dt)
          break
        case 'TRIP_IDLE':
          k.vx = 0; k.vy = 0
          k.idleTimer -= deltaMs
          if (k.idleTimer <= 0) {
            k.state = 'WALK'; k.vx = k.baseVx; k.vy = k.baseVy
            const animName = k.speed < SPEED_THRESHOLD ? 'idle' : 'run'
            k.sprite.play(animName)
          }
          break
      }
      k.sprite.position.x += k.vx * dt
      k.sprite.position.y += k.vy * dt

      // Bounce off screen edges
      if (k.sprite.position.x < bounds.left + margin) {
        k.sprite.position.x = bounds.left + margin
        k.baseVx = Math.abs(k.baseVx); k.vx = Math.abs(k.vx)
      } else if (k.sprite.position.x > bounds.right - margin) {
        k.sprite.position.x = bounds.right - margin
        k.baseVx = -Math.abs(k.baseVx); k.vx = -Math.abs(k.vx)
      }
      if (k.sprite.position.y < bounds.bottom + margin) {
        k.sprite.position.y = bounds.bottom + margin
        k.baseVy = Math.abs(k.baseVy); k.vy = Math.abs(k.vy)
      } else if (k.sprite.position.y > bounds.top - margin) {
        k.sprite.position.y = bounds.top - margin
        k.baseVy = -Math.abs(k.baseVy); k.vy = -Math.abs(k.vy)
      }
      k.sprite.flipX = k.baseVx < 0
      k.sprite.zIndex = -Math.floor(k.sprite.position.y)
      k.sprite.update(deltaMs)
    }

    // Knight-knight collisions via spatial hash
    spatialHash.clear()
    for (const k of knights) spatialHash.insert(k)
    const collisionDist = HIT_RADIUS * 2
    const collisionDistSq = collisionDist * collisionDist
    for (const k of knights) {
      if (k.state !== 'WALK') continue
      spatialHash.forEachNeighbor(k, (other) => {
        if (other.state !== 'WALK') return false
        const dx = other.sprite.position.x - k.sprite.position.x
        const dy = other.sprite.position.y - k.sprite.position.y
        const distSq = dx * dx + dy * dy
        if (distSq < collisionDistSq) {
          const tripChanceA = k.speed / (k.speed + other.speed)
          if (Math.random() < tripChanceA) {
            triggerTrip(k); triggerRoll(other)
          } else {
            triggerTrip(other); triggerRoll(k)
          }
          return true
        }
        return false
      })
    }

    // Update stats DOM directly (bypasses React rendering for perf)
    if (statsRef.current && renderer2DRef.current) {
      const s = renderer2DRef.current.stats
      statsRef.current.textContent =
        `FPS: ${fpsRef.current.display}  Knights: ${knights.length}  Batches: ${s.batchCount}  Draw calls: ${s.drawCalls}`
    }
  })

  return (
    <>
      <tileMap2D
        data={mapData}
        enableCollision={false}
        scale={[TILE_SCALE, TILE_SCALE, 1]}
        position={[-mapWorldW / 2, -mapWorldH / 2, -1]}
      />
      <renderer2D ref={renderer2DRef} />
    </>
  )
}

// ============================================
// APP
// ============================================

export default function App() {
  const statsRef = useRef<HTMLDivElement>(null)
  const addKnightsRef = useRef<(() => void) | null>(null)

  // Keyboard: Space to add knights
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        addKnightsRef.current?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <Canvas
        dpr={1}
        orthographic
        camera={{ position: [0, 0, 100], near: 0.1, far: 1000 }}
        renderer={{ antialias: false }}
      >
        <color attach="background" args={['#1a1a2e']} />
        <Suspense fallback={null}>
          <KnightmarkScene statsRef={statsRef} addKnightsRef={addKnightsRef} />
        </Suspense>
      </Canvas>

      {/* Stats overlay */}
      <div
        ref={statsRef}
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          color: '#4a9eff',
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre',
          zIndex: 100,
          userSelect: 'none',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          fontFamily: 'monospace',
        }}
      >
        Loading...
      </div>

      {/* Controls */}
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 10,
          zIndex: 100,
        }}
      >
        <button
          onClick={() => addKnightsRef.current?.()}
          style={{
            padding: '10px 24px',
            fontSize: 14,
            fontFamily: 'monospace',
            border: '2px solid #4a9eff',
            background: 'rgba(74,158,255,0.1)',
            color: '#4a9eff',
            cursor: 'pointer',
            borderRadius: 4,
            transition: 'background 0.15s',
          }}
        >
          + 100 Knights (Space)
        </button>
      </div>
    </>
  )
}
