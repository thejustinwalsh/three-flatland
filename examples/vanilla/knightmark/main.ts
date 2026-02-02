import { WebGPURenderer } from 'three/webgpu'
import { NearestFilter, TextureLoader, type Texture } from 'three'
import {
  Flatland,
  Sprite2D,
  AnimatedSprite2D,
  Light2D,
  SpriteSheetLoader,
  Layers,
  type AnimationSetDefinition,
  type SpriteSheet,
  type SpriteFrame,
} from '@three-flatland/core'

// ============================================
// CONSTANTS
// ============================================

// Knight behaviour
const HIT_RADIUS = 8
const CELL_SIZE = HIT_RADIUS * 4
const KNIGHT_SCALE = 64
const SPEED_MIN = 30
const SPEED_MAX = 200
const SPEED_THRESHOLD = 80
const TRIP_LERP_RATE = 5
const IDLE_AFTER_TRIP_MS = 400

// Dungeon grid
const TILE_PX = 16
const SCALE = 2
const WORLD_TILE = TILE_PX * SCALE // 32 world units per tile
const DUNGEON_COLS = 32
const DUNGEON_ROWS = 20

// Tileset is 10×10 grid of 16px tiles (160×160)
const TS_COLS = 10
const TS_ROWS = 10

// Wall bounds for knight collision (inner floor area)
// Top wall is 2 tiles thick, sides and bottom are 1 tile
const WALL_LEFT = -(DUNGEON_COLS / 2) * WORLD_TILE + WORLD_TILE
const WALL_RIGHT = (DUNGEON_COLS / 2) * WORLD_TILE - WORLD_TILE
const WALL_TOP = (DUNGEON_ROWS / 2) * WORLD_TILE - 2 * WORLD_TILE
const WALL_BOTTOM = -(DUNGEON_ROWS / 2) * WORLD_TILE + WORLD_TILE

// Torch obstacle avoidance
const TORCH_AVOID_RADIUS = 12

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

interface TorchLight {
  light: Light2D
  baseIntensity: number
  // Random phase offsets for organic flickering
  phase1: number
  phase2: number
  phase3: number
}

interface FloorTorch {
  sprite: AnimatedSprite2D
  x: number
  y: number
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
        'run_0', 'run_1', 'run_2', 'run_3',
        'run_4', 'run_5', 'run_6', 'run_7',
        'run_8', 'run_9', 'run_10', 'run_11',
        'run_12', 'run_13', 'run_14', 'run_15',
      ],
      fps: 16,
      loop: true,
    },
    roll: {
      frames: [
        'roll_0', 'roll_1', 'roll_2', 'roll_3',
        'roll_4', 'roll_5', 'roll_6', 'roll_7',
      ],
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
// TILESET HELPERS
// ============================================

/** Create a SpriteFrame pointing to a tile in the tileset grid. */
function tileFrame(col: number, row: number): SpriteFrame {
  return {
    name: `tile_${col}_${row}`,
    x: col / TS_COLS,
    // Flip Y: image row 0 is at the top, but UV y=0 is at the bottom
    y: (TS_ROWS - row - 1) / TS_ROWS,
    width: 1 / TS_COLS,
    height: 1 / TS_ROWS,
    sourceWidth: TILE_PX,
    sourceHeight: TILE_PX,
  }
}

/** Convert grid position (col, row) to world position. Origin is center of grid. */
function gridToWorld(col: number, row: number): [number, number] {
  const x = (col - DUNGEON_COLS / 2 + 0.5) * WORLD_TILE
  const y = (DUNGEON_ROWS / 2 - row - 0.5) * WORLD_TILE
  return [x, y]
}

// Tile frames from tileset (column, row in 10×10 grid)
const TILES = {
  WALL_TL: tileFrame(0, 0),
  WALL_T: tileFrame(1, 0),
  WALL_TR: tileFrame(2, 0),
  WALL_L: tileFrame(0, 1),
  WALL_FACE: tileFrame(1, 1),
  WALL_R: tileFrame(2, 1),
  WALL_BL: tileFrame(0, 2),
  WALL_B: tileFrame(1, 2),
  WALL_BR: tileFrame(2, 2),
  FLOOR_1: tileFrame(3, 0),
  FLOOR_2: tileFrame(4, 0),
}

// ============================================
// SPATIAL HASH (knight-knight collisions)
// ============================================

class SpatialHash {
  private cellSize: number
  private cells = new Map<number, Knight[]>()

  constructor(cellSize: number) {
    this.cellSize = cellSize
  }

  private key(cx: number, cy: number): number {
    const a = cx + 0x8000
    const b = cy + 0x8000
    return (a << 16) | (b & 0xffff)
  }

  clear(): void {
    this.cells.clear()
  }

  insert(knight: Knight): void {
    const cx = Math.floor(knight.sprite.position.x / this.cellSize)
    const cy = Math.floor(knight.sprite.position.y / this.cellSize)
    const k = this.key(cx, cy)
    let bucket = this.cells.get(k)
    if (!bucket) {
      bucket = []
      this.cells.set(k, bucket)
    }
    bucket.push(knight)
  }

  query(knight: Knight): Knight[] {
    const cx = Math.floor(knight.sprite.position.x / this.cellSize)
    const cy = Math.floor(knight.sprite.position.y / this.cellSize)
    const result: Knight[] = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(this.key(cx + dx, cy + dy))
        if (bucket) {
          for (const other of bucket) {
            if (other !== knight) result.push(other)
          }
        }
      }
    }
    return result
  }
}

// ============================================
// DUNGEON BUILDER
// ============================================

function buildDungeon(
  tilesetTexture: Texture,
  flatland: Flatland,
) {
  // Build the dungeon tile map
  // Layout: 16 cols × 10 rows
  //   Row 0: wall top (TL, T×14, TR)
  //   Row 1: wall face (L, FACE×14, R)
  //   Rows 2-8: side walls + floor (L, FLOOR×14, R)
  //   Row 9: wall bottom (BL, B×14, BR)

  for (let row = 0; row < DUNGEON_ROWS; row++) {
    for (let col = 0; col < DUNGEON_COLS; col++) {
      let frame: SpriteFrame

      if (row === 0) {
        // Top wall edge
        if (col === 0) frame = TILES.WALL_TL
        else if (col === DUNGEON_COLS - 1) frame = TILES.WALL_TR
        else frame = TILES.WALL_T
      } else if (row === 1) {
        // Wall face row
        if (col === 0) frame = TILES.WALL_L
        else if (col === DUNGEON_COLS - 1) frame = TILES.WALL_R
        else frame = TILES.WALL_FACE
      } else if (row === DUNGEON_ROWS - 1) {
        // Bottom wall
        if (col === 0) frame = TILES.WALL_BL
        else if (col === DUNGEON_COLS - 1) frame = TILES.WALL_BR
        else frame = TILES.WALL_B
      } else {
        // Middle rows: side walls + floor
        if (col === 0) frame = TILES.WALL_L
        else if (col === DUNGEON_COLS - 1) frame = TILES.WALL_R
        else {
          // Alternate floor tiles for subtle variation
          frame = (col + row) % 3 === 0 ? TILES.FLOOR_2 : TILES.FLOOR_1
        }
      }

      const [x, y] = gridToWorld(col, row)
      const tile = new Sprite2D({
        texture: tilesetTexture,
        frame,
        anchor: [0.5, 0.5],
        layer: Layers.BACKGROUND,
        lit: true,
      })
      tile.scale.set(WORLD_TILE, WORLD_TILE, 1)
      tile.position.set(x, y, 0)
      // Walls render on top of floor within the background layer
      tile.zIndex = row <= 1 || row === DUNGEON_ROWS - 1 || col === 0 || col === DUNGEON_COLS - 1 ? 1 : 0
      flatland.add(tile)
    }
  }
}

// ============================================
// TORCH & LIGHT CREATION
// ============================================

function createTorchLight(
  x: number,
  y: number,
  intensity: number,
  radius: number,
  falloff: number = 2,
): TorchLight {
  const light = new Light2D({
    type: 'point',
    position: [x, y],
    color: 0xffaa44,
    intensity,
    radius,
    falloff,
  })

  return {
    light,
    baseIntensity: intensity,
    phase1: Math.random() * Math.PI * 2,
    phase2: Math.random() * Math.PI * 2,
    phase3: Math.random() * Math.PI * 2,
  }
}

function createWallTorches(
  torchSheet: SpriteSheet,
  flatland: Flatland,
): TorchLight[] {
  const torchLights: TorchLight[] = []

  // Torch animation
  const torchAnim: AnimationSetDefinition = {
    fps: 8,
    animations: {
      flicker: {
        frames: ['side_torch_1', 'side_torch_2', 'side_torch_3', 'side_torch_4'],
        fps: 8,
        loop: true,
      },
    },
  }

  // Wall torch positions: on the side walls at certain rows
  const wallTorchRows = [5, 15]

  for (const row of wallTorchRows) {
    const [, y] = gridToWorld(0, row)

    // Left wall torch
    const leftX = WALL_LEFT - WORLD_TILE / 2
    const leftTorch = new AnimatedSprite2D({
      spriteSheet: torchSheet,
      animationSet: torchAnim,
      animation: 'flicker',
      layer: Layers.ENTITIES,
      anchor: [0.5, 0.5],
    })
    leftTorch.scale.set(32, 32, 1)
    leftTorch.position.set(leftX, y, 0)
    leftTorch.zIndex = 10000 // always in front within entities
    flatland.add(leftTorch)

    const leftLight = createTorchLight(leftX + 12, y, 5.0, 300, 3)
    flatland.add(leftLight.light)
    torchLights.push(leftLight)

    // Right wall torch (flipped)
    const rightX = WALL_RIGHT + WORLD_TILE / 2
    const rightTorch = new AnimatedSprite2D({
      spriteSheet: torchSheet,
      animationSet: torchAnim,
      animation: 'flicker',
      layer: Layers.ENTITIES,
      anchor: [0.5, 0.5],
    })
    rightTorch.scale.set(32, 32, 1)
    rightTorch.position.set(rightX, y, 0)
    rightTorch.flipX = true
    rightTorch.zIndex = 10000
    flatland.add(rightTorch)

    const rightLight = createTorchLight(rightX - 12, y, 5.0, 300, 3)
    flatland.add(rightLight.light)
    torchLights.push(rightLight)
  }

  return torchLights
}

function createFloorTorches(
  torchSheet: SpriteSheet,
  flatland: Flatland,
): { torchLights: TorchLight[]; floorTorches: FloorTorch[] } {
  const torchLights: TorchLight[] = []
  const floorTorches: FloorTorch[] = []

  const candlestickAnim: AnimationSetDefinition = {
    fps: 8,
    animations: {
      flicker: {
        frames: ['candlestick_1_1', 'candlestick_1_2', 'candlestick_1_3', 'candlestick_1_4'],
        fps: 8,
        loop: true,
      },
    },
  }

  // Floor torch positions (triangle in the play area)
  // Limited to 3 so total lights stay within MAX_LIGHTS (8):
  // 4 wall torches + 3 floor torches + 1 ambient = 8
  const positions: [number, number][] = [
    [-192, 32],
    [192, 32],
    [0, -128],
  ]

  for (const [x, y] of positions) {
    const torch = new AnimatedSprite2D({
      spriteSheet: torchSheet,
      animationSet: candlestickAnim,
      animation: 'flicker',
      layer: Layers.ENTITIES,
      anchor: [0.5, 0.5],
      lit: true,
    })
    torch.scale.set(32, 32, 1)
    torch.position.set(x, y, 0)
    torch.zIndex = -Math.floor(y) // y-sort like knights
    flatland.add(torch)

    const light = createTorchLight(x, y + 8, 7.0, 150, 3)
    flatland.add(light.light)
    torchLights.push(light)

    floorTorches.push({ sprite: torch, x, y })
  }

  return { torchLights, floorTorches }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  const flatland = new Flatland({
    viewSize: 640,
    aspect: window.innerWidth / window.innerHeight,
    clearColor: 0x0a0a14,
  })

  // --- Load assets ---
  const [knightSheet, torchSheet, tilesetTexture] = await Promise.all([
    SpriteSheetLoader.load('./sprites/knight.json'),
    SpriteSheetLoader.load('./sprites/torches.json'),
    new Promise<Texture>((resolve, reject) => {
      new TextureLoader().load('./sprites/Dungeon_Tileset.png', resolve, undefined, reject)
    }),
  ])

  // Pixel art: nearest-neighbor filtering on all textures
  for (const tex of [knightSheet.texture, torchSheet.texture, tilesetTexture]) {
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
  }

  // --- Quantized pixel-perfect lighting ---
  flatland.lighting.bands = 16
  flatland.lighting.pixelSize = 4
  flatland.lighting.glowRadius = 2.5
  flatland.lighting.glowIntensity = 0.15

  // --- Auto-normals + rim lighting for 3D-like diffuse shading ---
  flatland.lighting.autoNormals = true
  flatland.lighting.normalStrength = 1.0
  flatland.lighting.lightHeight = 3.0
  flatland.lighting.rimEnabled = true
  flatland.lighting.rimPower = 2.0
  flatland.lighting.rimStrength = 0.5

  // --- Build dungeon ---
  buildDungeon(tilesetTexture, flatland)

  // --- Add ambient light (deep indigo for moody colored shadows) ---
  const ambient = new Light2D({
    type: 'ambient',
    color: 0x3a2850,
    intensity: 1.8,
  })
  flatland.add(ambient)

  // --- Add torches with lights ---
  const wallTorchLights = createWallTorches(torchSheet, flatland)
  const { torchLights: floorTorchLights, floorTorches } = createFloorTorches(
    torchSheet,
    flatland,
  )
  const allTorchLights = [...wallTorchLights, ...floorTorchLights]

  // Update wall torch sprites each frame (they are AnimatedSprite2D)
  // We keep references via the torchLights array for light flickering

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
      lit: true,
    })
    sprite.scale.set(KNIGHT_SCALE, KNIGHT_SCALE, 1)

    // Random position within floor bounds
    const x = (WALL_LEFT + margin) + Math.random() * (WALL_RIGHT - WALL_LEFT - margin * 2)
    const y = (WALL_BOTTOM + margin) + Math.random() * (WALL_TOP - WALL_BOTTOM - margin * 2)
    sprite.position.set(x, y, 0)

    // Random speed and direction
    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)
    const angle = Math.random() * Math.PI * 2
    const baseVx = Math.cos(angle) * speed
    const baseVy = Math.sin(angle) * speed

    const animName = speed < SPEED_THRESHOLD ? 'idle' : 'run'
    sprite.play(animName)
    sprite.flipX = baseVx < 0

    flatland.add(sprite)

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

  function spawnBatch(count: number) {
    for (let i = 0; i < count; i++) {
      knights.push(spawnKnight(knightSheet))
    }
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

  // Spawn initial batch
  spawnBatch(100)

  // --- UI ---
  const statsEl = document.getElementById('stats')!
  const addBtn = document.getElementById('btn-add')!

  addBtn.addEventListener('click', () => spawnBatch(100))
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault()
      spawnBatch(100)
    }
  })

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // --- FPS tracking ---
  let fpsFrames = 0
  let fpsTime = 0
  let fpsDisplay = 0

  // --- Animation loop ---
  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - lastTime
    lastTime = now
    const dt = deltaMs / 1000
    const timeSec = now / 1000

    // FPS counter
    fpsFrames++
    fpsTime += deltaMs
    if (fpsTime >= 500) {
      fpsDisplay = Math.round((fpsFrames / fpsTime) * 1000)
      fpsFrames = 0
      fpsTime = 0
    }

    // --- Flicker torch lights ---
    for (const t of allTorchLights) {
      const flicker =
        Math.sin(timeSec * 8 + t.phase1) * 0.15 +
        Math.sin(timeSec * 13 + t.phase2) * 0.1 +
        Math.sin(timeSec * 21 + t.phase3) * 0.05
      t.light.intensity = t.baseIntensity + flicker
    }

    const margin = KNIGHT_SCALE / 2

    // --- Update knights ---
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

      // Apply velocity
      k.sprite.position.x += k.vx * dt
      k.sprite.position.y += k.vy * dt

      // Bounce off dungeon walls
      if (k.sprite.position.x < WALL_LEFT + margin) {
        k.sprite.position.x = WALL_LEFT + margin
        k.baseVx = Math.abs(k.baseVx)
        k.vx = Math.abs(k.vx)
      } else if (k.sprite.position.x > WALL_RIGHT - margin) {
        k.sprite.position.x = WALL_RIGHT - margin
        k.baseVx = -Math.abs(k.baseVx)
        k.vx = -Math.abs(k.vx)
      }

      if (k.sprite.position.y < WALL_BOTTOM + margin) {
        k.sprite.position.y = WALL_BOTTOM + margin
        k.baseVy = Math.abs(k.baseVy)
        k.vy = Math.abs(k.vy)
      } else if (k.sprite.position.y > WALL_TOP - margin) {
        k.sprite.position.y = WALL_TOP - margin
        k.baseVy = -Math.abs(k.baseVy)
        k.vy = -Math.abs(k.vy)
      }

      // Avoid floor torches (push away + deflect velocity)
      for (const torch of floorTorches) {
        const dx = k.sprite.position.x - torch.x
        const dy = k.sprite.position.y - torch.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < TORCH_AVOID_RADIUS && dist > 0.1) {
          // Push out of torch radius
          const overlap = TORCH_AVOID_RADIUS - dist
          const nx = dx / dist
          const ny = dy / dist
          k.sprite.position.x += nx * overlap * 0.5
          k.sprite.position.y += ny * overlap * 0.5

          // Deflect velocity away from torch
          const dot = k.baseVx * nx + k.baseVy * ny
          if (dot < 0) {
            k.baseVx -= 2 * dot * nx
            k.baseVy -= 2 * dot * ny
            k.vx = k.baseVx
            k.vy = k.baseVy
          }
        }
      }

      // Face direction of travel
      k.sprite.flipX = k.baseVx < 0

      // Y-sort
      k.sprite.zIndex = -Math.floor(k.sprite.position.y)

      // Update animation
      k.sprite.update(deltaMs)
    }

    // --- Knight-knight collisions ---
    spatialHash.clear()
    for (const k of knights) {
      spatialHash.insert(k)
    }

    const collisionDist = HIT_RADIUS * 2
    const collisionDistSq = collisionDist * collisionDist

    for (const k of knights) {
      if (k.state !== 'WALK') continue

      const neighbors = spatialHash.query(k)
      for (const other of neighbors) {
        if (other.state !== 'WALK') continue

        const dx = other.sprite.position.x - k.sprite.position.x
        const dy = other.sprite.position.y - k.sprite.position.y
        const distSq = dx * dx + dy * dy

        if (distSq < collisionDistSq) {
          const tripChanceA = k.speed / (k.speed + other.speed)
          if (Math.random() < tripChanceA) {
            triggerTrip(k)
            triggerRoll(other)
          } else {
            triggerTrip(other)
            triggerRoll(k)
          }
          break
        }
      }
    }

    // --- Render ---
    flatland.render(renderer)

    // --- Update stats ---
    const s = flatland.stats
    statsEl.textContent =
      `FPS: ${fpsDisplay}\n` +
      `Knights: ${knights.length}\n` +
      `Batches: ${s.batchCount}\n` +
      `Draw calls: ${s.drawCalls}`
  }

  animate()
}

main()
