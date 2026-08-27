import { Suspense, useRef, useMemo, useCallback, useEffect } from 'react'
import type { OrthographicCamera } from 'three'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import {
  AnimatedSprite2D,
  Sprite2DMaterial,
  SpriteGroup,
  SpriteSheetLoader,
  TextureLoader,
  TileMap2D,
  usePixelPerfectCamera,
  SortLayers,
  type AnimationSetDefinition,
  type SpriteSheet,
  type TileMapData,
  type TilesetData,
  type TileLayerData,
} from 'three-flatland/react'
import { exampleRendererColorConfig } from './rendererColorManagement'
import { ExampleFallback } from './ExampleFallback'
import { DevtoolsProvider, usePane, usePaneFolder, usePaneInput } from '@three-flatland/devtools/react'
import {
  DEFAULT_BENCHMARK_SEED,
  benchmarkParams,
  booleanParam,
  createBenchmarkSimulationGate,
  createSeededRandom,
  integerParam,
  numberParam,
  publishBenchmarkReady,
  rendererGpuAdapterInfo,
} from '../../_shared/benchmark'
// Knightmark doesn't render any gem-background layer — its sprites
// fill the viewport. The body bg (#16191e) shows through during
// initial sprite load. GEM/GemBackground imports intentionally
// omitted; the per-example `gem.ts` is still synced for consistency.

extend({ SpriteGroup, TileMap2D })

function PixelCamera({ viewSize }: { viewSize: number }) {
  usePixelPerfectCamera({ viewSize })
  return null
}

// ============================================
// CONSTANTS
// ============================================

const SPEED_THRESHOLD = 80
const TRIP_LERP_RATE = 5
const IDLE_AFTER_TRIP_MS = 400

const VIEW_SIZE = 640

const benchmarkQuery = benchmarkParams()
const benchmarkEnabled = benchmarkQuery.get('bench') === '1'
const requestedSprites = integerParam(benchmarkQuery, 'sprites', integerParam(benchmarkQuery, 'spawn', 10))
const benchmarkSeed = integerParam(benchmarkQuery, 'seed', DEFAULT_BENCHMARK_SEED)
const collisionsEnabled = booleanParam(benchmarkQuery, 'collisions', true)
const fixedDeltaMs = numberParam(benchmarkQuery, 'fixedDelta')
const simulationGate = createBenchmarkSimulationGate(benchmarkEnabled)

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
// SPATIAL HASH
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
  spriteGroup: SpriteGroup,
  bounds: { left: number; right: number; top: number; bottom: number },
  simParams: { speedMin: number; speedMax: number; knightScale: number },
  random: () => number
): Knight {
  const margin = simParams.knightScale / 2
  // Opaque alphaTest material enables the GPU depth-test fast path:
  // the y-sort (zIndex = -y) is resolved by the depth buffer, so the
  // CPU batchSortSystem can skip this batch entirely.
  const material = Sprite2DMaterial.getShared({
    map: sheet.texture,
    alphaTest: 0.5,
  })
  const sprite = new AnimatedSprite2D({
    spriteSheet: sheet,
    animationSet: knightAnimations,
    animation: 'idle',
    sortLayer: SortLayers.ENTITIES,
    anchor: [0.5, 0.5],
    material,
  })
  sprite.scale.set(simParams.knightScale, simParams.knightScale, 1)
  const x = bounds.left + margin + random() * (bounds.right - bounds.left - margin * 2)
  const y = bounds.bottom + margin + random() * (bounds.top - bounds.bottom - margin * 2)
  sprite.position.set(x, y, 0)
  const speed = simParams.speedMin + random() * (simParams.speedMax - simParams.speedMin)
  const angle = random() * Math.PI * 2
  const baseVx = Math.cos(angle) * speed
  const baseVy = Math.sin(angle) * speed
  const animName = speed < SPEED_THRESHOLD ? 'idle' : 'run'
  sprite.play(animName)
  sprite.flipX = baseVx < 0
  spriteGroup.add(sprite)
  return {
    sprite,
    state: 'WALK',
    baseVx,
    baseVy,
    speed,
    vx: baseVx,
    vy: baseVy,
    idleTimer: 0,
  }
}

// ============================================
// SCENE COMPONENT
// ============================================

interface KnightmarkSceneProps {
  addKnightsRef: React.RefObject<(() => void) | null>
  speedMin: number
  speedMax: number
  hitRadius: number
  knightScale: number
  knightStatsRef: React.RefObject<{ knights: number; batches: number }>
}

function KnightmarkScene({
  addKnightsRef,
  speedMin,
  speedMax,
  hitRadius,
  knightScale,
  knightStatsRef,
}: KnightmarkSceneProps) {
  const { camera, gl: renderer, size } = useThree()

  // Load assets (presets automatically apply NearestFilter)
  const knightSheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const tilesetTex = useLoader(TextureLoader, './sprites/Dungeon_Tileset.png')

  const spriteGroupRef = useRef<SpriteGroup>(null)
  const knightsRef = useRef<Knight[]>([])
  const spatialHashRef = useRef(new SpatialHash(hitRadius * 4))
  const boundsRef = useRef({ left: 0, right: 0, top: 0, bottom: 0 })
  const randomRef = useRef(benchmarkEnabled ? createSeededRandom(benchmarkSeed) : Math.random)

  // Store latest sim params in refs for use in useFrame
  const simRef = useRef({ speedMin, speedMax, hitRadius, knightScale })
  simRef.current = { speedMin, speedMax, hitRadius, knightScale }

  // Track the pixel camera's expanded world bounds for spawn/cleanup logic.
  useEffect(() => {
    const ortho = camera as OrthographicCamera
    boundsRef.current = { left: ortho.left, right: ortho.right, top: ortho.top, bottom: ortho.bottom }
  }, [camera, size])

  // Build floor tilemap data
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

  // Spawn batch of knights
  const spawnBatch = useCallback(
    (count: number) => {
      const r2d = spriteGroupRef.current
      if (!r2d) return
      const bounds = boundsRef.current
      const sim = simRef.current
      for (let i = 0; i < count; i++) {
        knightsRef.current.push(spawnKnight(knightSheet, r2d, bounds, sim, randomRef.current))
      }
    },
    [knightSheet]
  )

  // Initial spawn + expose add handler
  useEffect(() => {
    const group = spriteGroupRef.current
    const knights = knightsRef.current
    randomRef.current = benchmarkEnabled ? createSeededRandom(benchmarkSeed) : Math.random
    spawnBatch(requestedSprites)
    addKnightsRef.current = () => spawnBatch(100)
    return () => {
      addKnightsRef.current = null
      for (const knight of knights) {
        group?.remove(knight.sprite)
        knight.sprite.dispose()
      }
      knights.length = 0
    }
  }, [spawnBatch, addKnightsRef])

  // Game loop
  useFrame((_, delta) => {
    if (!simulationGate.advance()) return
    const deltaMs = fixedDeltaMs ?? delta * 1000
    const dt = deltaMs / 1000
    const knights = knightsRef.current
    const spatialHash = spatialHashRef.current
    const bounds = boundsRef.current
    const sim = simRef.current
    const margin = sim.knightScale / 2

    // Update spatial hash cell size from current hitRadius
    spatialHash.cellSize = sim.hitRadius * 4

    // Update knight movement and animation
    for (const k of knights) {
      switch (k.state) {
        case 'WALK':
        case 'ROLL':
          k.vx = k.baseVx
          k.vy = k.baseVy
          break
        case 'TRIP':
          k.vx += (0 - k.vx) * Math.min(1, TRIP_LERP_RATE * dt)
          k.vy += (0 - k.vy) * Math.min(1, TRIP_LERP_RATE * dt)
          break
        case 'TRIP_IDLE':
          k.vx = 0
          k.vy = 0
          k.idleTimer -= deltaMs
          if (k.idleTimer <= 0) {
            k.state = 'WALK'
            k.vx = k.baseVx
            k.vy = k.baseVy
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
        k.baseVx = Math.abs(k.baseVx)
        k.vx = Math.abs(k.vx)
      } else if (k.sprite.position.x > bounds.right - margin) {
        k.sprite.position.x = bounds.right - margin
        k.baseVx = -Math.abs(k.baseVx)
        k.vx = -Math.abs(k.vx)
      }
      if (k.sprite.position.y < bounds.bottom + margin) {
        k.sprite.position.y = bounds.bottom + margin
        k.baseVy = Math.abs(k.baseVy)
        k.vy = Math.abs(k.vy)
      } else if (k.sprite.position.y > bounds.top - margin) {
        k.sprite.position.y = bounds.top - margin
        k.baseVy = -Math.abs(k.baseVy)
        k.vy = -Math.abs(k.vy)
      }
      k.sprite.flipX = k.baseVx < 0
      k.sprite.zIndex = -Math.floor(k.sprite.position.y)
      k.sprite.update(deltaMs)
    }

    if (collisionsEnabled) {
      // Knight-knight collisions via spatial hash. Match the Three variant:
      // one reusable visitor closure per frame, not one per sprite.
      spatialHash.clear()
      for (const knight of knights) spatialHash.insert(knight)
      const collisionDist = sim.hitRadius * 2
      const collisionDistSq = collisionDist * collisionDist
      let current = knights[0]!
      const visitor = (other: Knight): boolean => {
        if (other.state !== 'WALK') return false
        const dx = other.sprite.position.x - current.sprite.position.x
        const dy = other.sprite.position.y - current.sprite.position.y
        const distSq = dx * dx + dy * dy
        if (distSq < collisionDistSq) {
          const tripChanceA = current.speed / (current.speed + other.speed)
          if (randomRef.current() < tripChanceA) {
            triggerTrip(current)
            triggerRoll(other)
          } else {
            triggerTrip(other)
            triggerRoll(current)
          }
          return true
        }
        return false
      }
      for (const knight of knights) {
        if (knight.state !== 'WALK') continue
        current = knight
        spatialHash.forEachNeighbor(knight, visitor)
      }
    }

    // Update knight-batch monitors. Refresh bindings every frame — the
    // default readonly-binding MonitorBinding ticker (200ms) can starve
    // under heavy main-thread load (allocs, GC pauses), making the
    // display freeze even while the underlying values keep updating.
    if (spriteGroupRef.current) {
      const s = spriteGroupRef.current.stats
      knightStatsRef.current.knights = knights.length
      knightStatsRef.current.batches = s.batchCount
    }
  })

  useFrame(
    () => {
      const renderedGroup = spriteGroupRef.current
      if (!benchmarkEnabled || !renderedGroup) return
      // R3F's finish phase runs after its render phase. Publishing here proves
      // the first readiness payload observes a completed batching/render pass.
      publishBenchmarkReady({
        example: 'knightmark',
        variant: 'react',
        seed: benchmarkSeed,
        fixedDeltaMs: fixedDeltaMs ?? null,
        collisionsEnabled,
        requestedSprites,
        actualSprites: knightsRef.current.length,
        actualBatches: renderedGroup.stats.batchCount,
        simulationGated: benchmarkEnabled,
        simulationFrame: simulationGate.frame(),
        gpuAdapter: rendererGpuAdapterInfo(renderer),
      })
    },
    { phase: 'finish' }
  )

  return (
    <>
      <tileMap2D
        data={mapData}
        enableCollision={false}
        scale={[TILE_SCALE, TILE_SCALE, 1]}
        position={[-mapWorldW / 2, -mapWorldH / 2, -1]}
      />
      {/* This scene stresses 40k+ sprites — pin fixed 16384-slot batches
          (ladder off) to minimize per-batch overhead. */}
      <spriteGroup ref={spriteGroupRef} maxBatchSize={16384} />
    </>
  )
}

// ============================================
// APP
// ============================================

export default function App() {
  const addKnightsRef = useRef<(() => void) | null>(null)

  // Tweakpane
  const { pane } = usePane()

  // Knights monitors (first)
  const knightStatsRef = useRef({ knights: 0, batches: 0 })
  const statsFolder = usePaneFolder(pane, 'Knights')

  // Simulation folder (at bottom, collapsed)
  const simFolder = usePaneFolder(pane, 'Simulation')
  const [speedMin] = usePaneInput(simFolder, 'speedMin', 30, {
    min: 10,
    max: 100,
    step: 5,
    label: 'speed min',
  })
  const [speedMax] = usePaneInput(simFolder, 'speedMax', 200, {
    min: 100,
    max: 300,
    step: 10,
    label: 'speed max',
  })
  const [hitRadius] = usePaneInput(simFolder, 'hitRadius', 8, {
    min: 2,
    max: 20,
    step: 1,
    label: 'hit radius',
  })
  const [knightScale] = usePaneInput(simFolder, 'knightScale', 64, {
    min: 32,
    max: 128,
    step: 8,
    label: 'scale',
  })
  // Refresh callback driven from KnightmarkScene's useFrame — see
  // `refreshStatsRef.current()` call in the per-frame block. Per-frame
  // refresh keeps the readout current under heavy load (GC pauses can
  // starve tweakpane's 200ms internal ticker, leaving the display
  // frozen while underlying values keep updating).
  const refreshStatsRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (!statsFolder) return
    const bKnights = statsFolder.addBinding(knightStatsRef.current, 'knights', {
      readonly: true,
      format: (v: number) => v.toFixed(0),
    })
    const bBatches = statsFolder.addBinding(knightStatsRef.current, 'batches', {
      readonly: true,
      format: (v: number) => v.toFixed(0),
    })
    refreshStatsRef.current = () => {
      bKnights.refresh()
      bBatches.refresh()
    }
    return () => {
      refreshStatsRef.current = () => {}
      bKnights.dispose()
      bBatches.dispose()
    }
  }, [statsFolder])

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
        renderer={{ antialias: false, ...exampleRendererColorConfig }}
        fallback={<ExampleFallback />}
        onCreated={({ renderer }) => {
          renderer.domElement.style.imageRendering = 'pixelated'
        }}
      >
        <PixelCamera viewSize={VIEW_SIZE} />
        <DevtoolsProvider name="knightmark" />
        {/* No L1/L2/L3 — knightmark's sprites fill the viewport, so a
           backdrop wouldn't be visible anyway. Body bg (#16191e) shows
           through during initial sprite load, no color jump. */}
        <Suspense fallback={null}>
          <KnightmarkScene
            addKnightsRef={addKnightsRef}
            speedMin={speedMin}
            speedMax={speedMax}
            hitRadius={hitRadius}
            knightScale={knightScale}
            knightStatsRef={knightStatsRef}
          />
        </Suspense>
      </Canvas>

      {/* TODO: migrate game UI to three-flatland events */}
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
