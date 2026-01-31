import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color, Vector2, Raycaster, Plane, Vector3 } from 'three'
import { Sprite2D, Sprite2DMaterial, Renderer2D, Layers, TextureLoader } from '@three-flatland/core'

// Configuration
const TILE_SIZE = 64
const GRID_WIDTH = 12
const GRID_HEIGHT = 8
const ASSET_BASE = import.meta.env.BASE_URL + 'assets/'

// Grass tilemap UV size (32x32 tiles in 640x256 texture)
const TILE_UV_SIZE = { width: 32 / 640, height: 32 / 256 }
const SLICE_TILES = 6; // 6x6 region for 9-slice
const SLICE_START_X = 0; // in tiles
const SLICE_START_Y = 0; // in tiles

// Building definitions
interface BuildingDef {
  name: string
  texture: string
  width: number
  height: number
  shadowScale: number
}

const BUILDINGS: BuildingDef[] = [
  { name: 'house', texture: 'buildings/House_Blue.png', width: 128, height: 192, shadowScale: 1.2 },
  { name: 'tower', texture: 'buildings/Tower_Blue.png', width: 128, height: 224, shadowScale: 1.0 },
  { name: 'tree', texture: 'deco/Tree.png', width: 192, height: 192, shadowScale: 1.5 },
]

// Placed entity
interface PlacedEntity {
  sprite: Sprite2D
  shadow: Sprite2D
  gridX: number
  gridY: number
}

async function main() {
  // Scene setup
  const scene = new Scene()
  scene.background = new Color(0x87ceeb) // Sky blue

  // Calculate view size based on grid
  const viewWidth = TILE_SIZE * (GRID_WIDTH + 2)
  const viewHeight = TILE_SIZE * (GRID_HEIGHT + 4)

  // Orthographic camera
  const camera = new OrthographicCamera(
    -viewWidth / 2,
    viewWidth / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    1000
  )
  camera.position.z = 100

  // WebGPU Renderer
  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  document.body.appendChild(renderer.domElement)

  await renderer.init()

  // Load textures (uses 'pixel-art' preset by default with NearestFilter + SRGBColorSpace)
  const [grassTex, shadowTex, ...buildingTextures] = await Promise.all([
    TextureLoader.load(ASSET_BASE + 'terrain/Tilemap_Flat.png'),
    TextureLoader.load(ASSET_BASE + 'terrain/Shadows.png'),
    ...BUILDINGS.map((b) => TextureLoader.load(ASSET_BASE + b.texture)),
  ])

  // Create materials
  const grassMaterial = new Sprite2DMaterial({ map: grassTex })
  const shadowMaterial = new Sprite2DMaterial({ map: shadowTex })
  const buildingMaterials = buildingTextures.map((tex) => new Sprite2DMaterial({ map: tex }))

  // Create the 2D renderer
  const renderer2D = new Renderer2D()
  scene.add(renderer2D)

  // Grid offset to center the grid
  const gridOffsetX = (-GRID_WIDTH * TILE_SIZE) / 2 + TILE_SIZE / 2
  const gridOffsetY = (-GRID_HEIGHT * TILE_SIZE) / 2 + TILE_SIZE / 2

  // Helper to get the correct grass tile UV based on grid position
  function getGrassTileUV(x: number, y: number) {
    // Map grid position to 9-slice tile index (0-5 for 6x6 region)
    const maxX = GRID_WIDTH - 1;
    const maxY = GRID_HEIGHT - 1;

    // Determine which 9-slice index this tile is (0, 1, ..., 5)
    let sliceCol = 0;
    let sliceRow = 0;
    if (x === 0) sliceCol = 0;
    else if (x === maxX) sliceCol = SLICE_TILES - 1;
    else sliceCol = 1 + ((x - 1) % (SLICE_TILES - 2));

    if (y === 0) sliceRow = 0;
    else if (y === maxY) sliceRow = SLICE_TILES - 1;
    else sliceRow = 1 + ((y - 1) % (SLICE_TILES - 2));

    // Compute UVs (flip y so v=0 is top of texture)
    // Invert sliceRow so top row in grid maps to top row in texture
    const flippedSliceRow = SLICE_TILES - 1 - sliceRow;
    const uv = {
      x: (SLICE_START_X + sliceCol) * TILE_UV_SIZE.width,
      y: 1 - ((SLICE_START_Y + flippedSliceRow + 1) * TILE_UV_SIZE.height),
    };
    return uv;
  }

  // Create ground tiles using 9-slice pattern
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const tile = new Sprite2D({ material: grassMaterial })
      const uv = getGrassTileUV(x, y)

      tile.setFrame({
        name: 'grass',
        x: uv.x,
        y: uv.y,
        width: TILE_UV_SIZE.width,
        height: TILE_UV_SIZE.height,
        sourceWidth: TILE_SIZE,
        sourceHeight: TILE_SIZE,
      })

      tile.position.set(gridOffsetX + x * TILE_SIZE, gridOffsetY + y * TILE_SIZE, 0)
      tile.layer = Layers.GROUND
      tile.zIndex = 0

      renderer2D.add(tile)
    }
  }

  // Placed entities
  const entities: PlacedEntity[] = []
  const occupiedCells = new Set<string>()

  // Currently selected building
  let selectedBuilding = 0

  // Hover indicator (preview sprite for placing buildings)
  // Added directly to scene (not Renderer2D) so it's not batched with other sprites
  // renderOrder set high to ensure it renders above all batched sprites
  const hoverSprite = new Sprite2D({ material: buildingMaterials[selectedBuilding]! })
  hoverSprite.alpha = 0.5
  hoverSprite.layer = Layers.FOREGROUND
  hoverSprite.visible = false
  hoverSprite.renderOrder = 1000 // Render above all batched sprites
  const building = BUILDINGS[selectedBuilding]!
  hoverSprite.scale.set(building.width, building.height, 1)
  scene.add(hoverSprite)

  // Helper to convert screen to world position
  const raycaster = new Raycaster()
  const groundPlane = new Plane(new Vector3(0, 0, 1), 0)
  const mouse = new Vector2()
  const worldPos = new Vector3()

  function screenToWorld(clientX: number, clientY: number): Vector3 {
    mouse.x = (clientX / window.innerWidth) * 2 - 1
    mouse.y = -(clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(mouse, camera)
    raycaster.ray.intersectPlane(groundPlane, worldPos)
    return worldPos
  }

  function worldToGrid(worldX: number, worldY: number): { x: number; y: number } | null {
    const gx = Math.floor((worldX - gridOffsetX + TILE_SIZE / 2) / TILE_SIZE)
    const gy = Math.floor((worldY - gridOffsetY + TILE_SIZE / 2) / TILE_SIZE)
    if (gx >= 0 && gx < GRID_WIDTH && gy >= 0 && gy < GRID_HEIGHT) {
      return { x: gx, y: gy }
    }
    return null
  }

  function gridToWorld(gx: number, gy: number): { x: number; y: number } {
    return {
      x: gridOffsetX + gx * TILE_SIZE,
      y: gridOffsetY + gy * TILE_SIZE,
    }
  }

  function placeBuilding(gridX: number, gridY: number) {
    const key = `${gridX},${gridY}`
    if (occupiedCells.has(key)) return

    const buildingDef = BUILDINGS[selectedBuilding]!
    const material = buildingMaterials[selectedBuilding]!
    const pos = gridToWorld(gridX, gridY)

    // Create shadow
    const shadow = new Sprite2D({ material: shadowMaterial })
    shadow.scale.set(TILE_SIZE * buildingDef.shadowScale, TILE_SIZE * buildingDef.shadowScale * 0.5, 1)
    shadow.position.set(pos.x, pos.y - TILE_SIZE * 0.3, 0)
    shadow.layer = Layers.SHADOWS
    shadow.zIndex = 0
    shadow.alpha = 0.5
    renderer2D.add(shadow)

    // Create building sprite
    const sprite = new Sprite2D({ material })

    // For tree, use first tree frame from spritesheet
    // UV y=0 is at BOTTOM of texture, so we need y=(576-192)/576 to get top row
    if (buildingDef.name === 'tree') {
      sprite.setFrame({
        name: 'tree',
        x: 0,
        y: (576 - 192) / 576, // Top row of trees (UV y=0 is bottom of texture)
        width: 192 / 768,
        height: 192 / 576,
        sourceWidth: buildingDef.width,
        sourceHeight: buildingDef.height,
      })
    }

    sprite.scale.set(buildingDef.width, buildingDef.height, 1)
    // Position with anchor at bottom center
    sprite.position.set(pos.x, pos.y + buildingDef.height / 2 - TILE_SIZE / 2, 0)
    sprite.layer = Layers.ENTITIES
    // Y-sort: use zIndex for depth sorting (lower Y = higher zIndex = renders in front)
    sprite.zIndex = -Math.floor(pos.y)

    renderer2D.add(sprite)

    entities.push({ sprite, shadow, gridX, gridY })
    occupiedCells.add(key)
  }

  // Mouse events
  let lastHoverGrid: { x: number; y: number } | null = null

  renderer.domElement.addEventListener('mousemove', (e) => {
    const world = screenToWorld(e.clientX, e.clientY)
    const grid = worldToGrid(world.x, world.y)

    if (grid && !occupiedCells.has(`${grid.x},${grid.y}`)) {
      const pos = gridToWorld(grid.x, grid.y)
      const buildingDef = BUILDINGS[selectedBuilding]!
      hoverSprite.position.set(pos.x, pos.y + buildingDef.height / 2 - TILE_SIZE / 2, 0)
      hoverSprite.visible = true
      lastHoverGrid = grid
    } else {
      hoverSprite.visible = false
      lastHoverGrid = null
    }
  })

  renderer.domElement.addEventListener('mouseleave', () => {
    hoverSprite.visible = false
    lastHoverGrid = null
  })

  renderer.domElement.addEventListener('click', () => {
    if (lastHoverGrid) {
      placeBuilding(lastHoverGrid.x, lastHoverGrid.y)
    }
  })

  // Building selector buttons
  function updateHoverSprite() {
    const buildingDef = BUILDINGS[selectedBuilding]!
    const material = buildingMaterials[selectedBuilding]!
    hoverSprite.material = material
    hoverSprite.scale.set(buildingDef.width, buildingDef.height, 1)

    if (buildingDef.name === 'tree') {
      hoverSprite.setFrame({
        name: 'tree',
        x: 0,
        y: (576 - 192) / 576, // Top row of trees (UV y=0 is bottom of texture)
        width: 192 / 768,
        height: 192 / 576,
        sourceWidth: buildingDef.width,
        sourceHeight: buildingDef.height,
      })
    } else {
      // Reset to full texture for non-spritesheet items
      hoverSprite.setFrame({
        name: 'full',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        sourceWidth: buildingDef.width,
        sourceHeight: buildingDef.height,
      })
    }
  }

  document.querySelectorAll('.building-btn').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      selectedBuilding = index
      updateHoverSprite()
      document.querySelectorAll('.building-btn').forEach((b, i) => {
        b.classList.toggle('selected', i === index)
      })
    })
  })

  // Place some initial entities
  placeBuilding(2, 3)
  placeBuilding(5, 5)
  placeBuilding(8, 2)
  selectedBuilding = 2 // Switch to tree
  updateHoverSprite()
  placeBuilding(1, 6)
  placeBuilding(10, 4)
  placeBuilding(7, 6)
  selectedBuilding = 0 // Back to house
  updateHoverSprite()

  // Stats display
  const statsEl = document.getElementById('stats')!
  let frameCount = 0
  let fpsTime = 0
  let currentFps = 0

  // Handle resize
  function handleResize() {
    const aspect = window.innerWidth / window.innerHeight
    const viewAspect = viewWidth / viewHeight

    if (aspect > viewAspect) {
      // Window is wider - fit to height
      camera.top = viewHeight / 2
      camera.bottom = -viewHeight / 2
      camera.left = (-viewHeight * aspect) / 2
      camera.right = (viewHeight * aspect) / 2
    } else {
      // Window is taller - fit to width
      camera.left = -viewWidth / 2
      camera.right = viewWidth / 2
      camera.top = viewWidth / aspect / 2
      camera.bottom = -viewWidth / aspect / 2
    }
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  window.addEventListener('resize', handleResize)
  handleResize()

  // Animation loop
  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - lastTime
    lastTime = now

    renderer2D.update()

    renderer.render(scene, camera)

    // Update stats (~once per second)
    frameCount++
    fpsTime += deltaMs
    if (fpsTime >= 1000) {
      currentFps = Math.round(frameCount * 1000 / fpsTime)
      frameCount = 0
      fpsTime = 0

      const stats = renderer2D.stats
      statsEl.innerHTML = `FPS: ${currentFps}<br>Draws: ${renderer.info.render.drawCalls}<br>Sprites: ${stats.spriteCount}<br>Batches: ${stats.batchCount}`
    }
  }

  animate()
}

main()
