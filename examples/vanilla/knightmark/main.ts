import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color, NearestFilter } from 'three'
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
} from '@three-flatland/core'

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
// MAIN
// ============================================

async function main() {
  // WebGPU renderer
  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  // Scene
  const scene = new Scene()
  scene.background = new Color(0x1a1a2e)

  // Orthographic camera
  const aspect = window.innerWidth / window.innerHeight
  const halfW = (VIEW_SIZE * aspect) / 2
  const halfH = VIEW_SIZE / 2
  const camera = new OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000)
  camera.position.z = 100

  // Renderer2D for batching
  const renderer2D = new Renderer2D()
  scene.add(renderer2D)

  // Load assets
  const asset = (path: string) => import.meta.env.BASE_URL + path
  const [knightSheet, tilesetTexture] = await Promise.all([
    SpriteSheetLoader.load(asset('sprites/knight.json')),
    TextureLoader.load(asset('sprites/Dungeon_Tileset.png')),
  ])

  // Ensure pixel-art filtering for knight sprites
  knightSheet.texture.minFilter = NearestFilter
  knightSheet.texture.magFilter = NearestFilter

  // --- Floor tilemap ---
  // Dungeon_Tileset.png is a 10×10 grid of 16px tiles
  // GID = firstGid + row * columns + col (firstGid=1, columns=10)
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
    texture: tilesetTexture,
  }

  const floorLayer: TileLayerData = {
    name: 'Floor',
    id: 0,
    width: mapCols,
    height: mapRows,
    data: floorData,
  }

  const mapData: TileMapData = {
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

  const tilemap = new TileMap2D({ data: mapData, enableCollision: false })
  tilemap.scale.set(TILE_SCALE, TILE_SCALE, 1)
  const mapWorldW = mapCols * TILE_PX * TILE_SCALE
  const mapWorldH = mapRows * TILE_PX * TILE_SCALE
  tilemap.position.set(-mapWorldW / 2, -mapWorldH / 2, -1)
  scene.add(tilemap)

  // --- Bounce bounds = camera view edges ---
  let boundsLeft = -halfW
  let boundsRight = halfW
  let boundsTop = halfH
  let boundsBottom = -halfH

  // --- Knights ---
  const knights: Knight[] = []
  const spatialHash = new SpatialHash(CELL_SIZE)

  function spawnKnight(sheet: SpriteSheet): Knight {
    const margin = KNIGHT_SCALE / 2
    const sprite = new AnimatedSprite2D({
      spriteSheet: sheet,
      animationSet: knightAnimations,
      animation: 'idle',
      layer: Layers.ENTITIES,
      anchor: [0.5, 0.5],
    })
    sprite.scale.set(KNIGHT_SCALE, KNIGHT_SCALE, 1)
    const x = boundsLeft + margin + Math.random() * (boundsRight - boundsLeft - margin * 2)
    const y = boundsBottom + margin + Math.random() * (boundsTop - boundsBottom - margin * 2)
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

  function spawnBatch(count: number) {
    for (let i = 0; i < count; i++) knights.push(spawnKnight(knightSheet))
  }

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

  spawnBatch(10)

  // --- UI ---
  const statsEl = document.getElementById('stats')!
  const addBtn = document.getElementById('btn-add')!
  addBtn.addEventListener('click', () => spawnBatch(100))
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); spawnBatch(100) }
  })

  // --- Resize ---
  function handleResize() {
    const newAspect = window.innerWidth / window.innerHeight
    const newHalfW = (VIEW_SIZE * newAspect) / 2
    const newHalfH = VIEW_SIZE / 2
    camera.left = -newHalfW
    camera.right = newHalfW
    camera.top = newHalfH
    camera.bottom = -newHalfH
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    boundsLeft = -newHalfW
    boundsRight = newHalfW
    boundsTop = newHalfH
    boundsBottom = -newHalfH
  }
  window.addEventListener('resize', handleResize)

  // --- FPS tracking ---
  let fpsFrames = 0, fpsTime = 0, fpsDisplay = 0

  // --- Animation loop ---
  let lastTime = performance.now()
  function animate() {
    requestAnimationFrame(animate)
    const now = performance.now()
    const deltaMs = now - lastTime
    lastTime = now
    const dt = deltaMs / 1000

    fpsFrames++
    fpsTime += deltaMs
    if (fpsTime >= 500) {
      fpsDisplay = Math.round((fpsFrames / fpsTime) * 1000)
      fpsFrames = 0; fpsTime = 0
    }

    // Update knight movement and animation
    const margin = KNIGHT_SCALE / 2
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
      if (k.sprite.position.x < boundsLeft + margin) {
        k.sprite.position.x = boundsLeft + margin
        k.baseVx = Math.abs(k.baseVx); k.vx = Math.abs(k.vx)
      } else if (k.sprite.position.x > boundsRight - margin) {
        k.sprite.position.x = boundsRight - margin
        k.baseVx = -Math.abs(k.baseVx); k.vx = -Math.abs(k.vx)
      }
      if (k.sprite.position.y < boundsBottom + margin) {
        k.sprite.position.y = boundsBottom + margin
        k.baseVy = Math.abs(k.baseVy); k.vy = Math.abs(k.vy)
      } else if (k.sprite.position.y > boundsTop - margin) {
        k.sprite.position.y = boundsTop - margin
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

    // Render — systems run automatically in updateMatrixWorld
    renderer.render(scene, camera)

    // Update stats
    const s = renderer2D.stats
    statsEl.textContent =
      `FPS: ${fpsDisplay}  Knights: ${knights.length}  Batches: ${s.batchCount}  Draw calls: ${s.drawCalls}`
  }
  animate()
}
main()
