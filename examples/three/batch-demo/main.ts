import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Vector2, Raycaster, Plane, Vector3 } from 'three'
import {
  Sprite2D,
  Sprite2DMaterial,
  SpriteGroup,
  SortLayers,
  TextureLoader,
  SpriteSheetLoader,
  createDevtoolsProvider,
} from 'three-flatland'
import { createPane } from '@three-flatland/devtools'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

// Configuration
const TILE_SIZE = 64
const GRID_WIDTH = 12
const GRID_HEIGHT = 8
const ASSET_BASE = './assets/'

// Grass tilemap UV size (32x32 tiles in 640x256 texture)
const TILE_UV_SIZE = { width: 32 / 640, height: 32 / 256 }
const SLICE_TILES = 6 // 6x6 region for 9-slice
const SLICE_START_X = 0 // in tiles
const SLICE_START_Y = 0 // in tiles

// Building definitions — frame names refer to the shared sprites atlas
// (sprites.png + sprites.atlas.json). All buildings load from one
// texture → one material → one SpriteBatch, so per-sprite zIndex
// Y-sort works across building types (tree-in-front-of-house etc.).
interface BuildingDef {
  name: string
  frame: string
  width: number
  height: number
  shadowScale: number
}

// Render dimensions = atlas sourceSize so manual scale and Sprite2D's
// auto-sizing (setFrame → updateSize on first frame) agree. Without
// this, hover sprite (reuses one Sprite2D across buildings, so
// updateSize fires only the first time) diverges from placed sprites
// (one Sprite2D per placement, updateSize always fires on init). The
// bottom-anchor position math `+ height/2 - TILE_SIZE/2` is invariant
// under height changes so sprite ground-anchoring stays correct.
const BUILDINGS: BuildingDef[] = [
  { name: 'house', frame: 'house', width: 108, height: 148, shadowScale: 1.2 },
  { name: 'tower', frame: 'tower_0', width: 114, height: 183, shadowScale: 1.0 },
  { name: 'tree', frame: 'tree_0', width: 111, height: 174, shadowScale: 1.5 },
]

// Placed entity
interface PlacedEntity {
  sprite: Sprite2D
  shadow: Sprite2D
  gridX: number
  gridY: number
}

/* HMR-tracked teardown state. Without this, every dev save accumulates
 * a fresh renderer + animate() loop while the previous one keeps
 * RAFing forever. Dev-only — `import.meta.hot` is undefined in prod. */
let rafId = 0
let activeRenderer: WebGPURenderer | null = null

async function main() {
  // Scene setup
  const scene = new Scene()
  ;(scene as any).backgroundNode = gemGradientNode({ gem: GEM })

  // Calculate view size based on grid
  const viewWidth = TILE_SIZE * (GRID_WIDTH + 2)
  const viewHeight = TILE_SIZE * (GRID_HEIGHT + 4)

  // Orthographic camera
  const camera = new OrthographicCamera(-viewWidth / 2, viewWidth / 2, viewHeight / 2, -viewHeight / 2, 0.1, 1000)
  camera.position.z = 100

  // WebGPU Renderer
  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1) // Pixel-perfect for pixel art
  renderer.domElement.style.imageRendering = 'pixelated'
  document.body.appendChild(renderer.domElement)

  await renderer.init()

  // Load textures (uses 'pixel-art' preset by default with NearestFilter + SRGBColorSpace)
  const [grassTex, shadowTex, spritesSheet] = await Promise.all([
    TextureLoader.load(ASSET_BASE + 'terrain/Tilemap_Flat.png'),
    TextureLoader.load(ASSET_BASE + 'terrain/Shadows.png'),
    SpriteSheetLoader.load(ASSET_BASE + 'buildings/sprites.atlas.json'),
  ])

  // Create materials
  const grassMaterial = new Sprite2DMaterial({ map: grassTex })
  const shadowMaterial = new Sprite2DMaterial({ map: shadowTex })
  // ONE material for ALL buildings + trees → ONE batch → per-sprite
  // zIndex Y-sort works across building types.
  const spritesMaterial = new Sprite2DMaterial({ map: spritesSheet.texture })

  // Create the 2D renderer
  const spriteGroup = new SpriteGroup()
  scene.add(spriteGroup)

  // Grid offset to center the grid
  const gridOffsetX = (-GRID_WIDTH * TILE_SIZE) / 2 + TILE_SIZE / 2
  const gridOffsetY = (-GRID_HEIGHT * TILE_SIZE) / 2 + TILE_SIZE / 2

  // Helper to get the correct grass tile UV based on grid position
  function getGrassTileUV(x: number, y: number) {
    // Map grid position to 9-slice tile index (0-5 for 6x6 region)
    const maxX = GRID_WIDTH - 1
    const maxY = GRID_HEIGHT - 1

    // Determine which 9-slice index this tile is (0, 1, ..., 5)
    let sliceCol = 0
    let sliceRow = 0
    if (x === 0) sliceCol = 0
    else if (x === maxX) sliceCol = SLICE_TILES - 1
    else sliceCol = 1 + ((x - 1) % (SLICE_TILES - 2))

    if (y === 0) sliceRow = 0
    else if (y === maxY) sliceRow = SLICE_TILES - 1
    else sliceRow = 1 + ((y - 1) % (SLICE_TILES - 2))

    // Compute UVs (flip y so v=0 is top of texture)
    // Invert sliceRow so top row in grid maps to top row in texture
    const flippedSliceRow = SLICE_TILES - 1 - sliceRow
    const uv = {
      x: (SLICE_START_X + sliceCol) * TILE_UV_SIZE.width,
      y: 1 - (SLICE_START_Y + flippedSliceRow + 1) * TILE_UV_SIZE.height,
    }
    return uv
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
      tile.sortLayer = SortLayers.GROUND
      tile.zIndex = 0

      spriteGroup.add(tile)
    }
  }

  // Placed entities
  const entities: PlacedEntity[] = []
  const occupiedCells = new Set<string>()

  // Currently selected building
  let selectedBuilding = 0

  // Hover indicator (preview sprite for placing buildings)
  // Added directly to scene (not SpriteGroup) so it's not batched with other sprites
  // renderOrder set high to ensure it renders above all batched sprites
  const hoverSprite = new Sprite2D({ material: spritesMaterial })
  hoverSprite.alpha = 0.5
  hoverSprite.sortLayer = SortLayers.FOREGROUND
  hoverSprite.visible = false
  hoverSprite.renderOrder = 1000 // Render above all batched sprites
  const building = BUILDINGS[selectedBuilding]!
  // Same order as placeBuilding (scale.set BEFORE setFrame) so that
  // setFrame's first-frame updateSize() wins → render dimensions match
  // the atlas frame's sourceSize, matching what R3F does for the React
  // version's <sprite2D> in declaration order.
  hoverSprite.scale.set(building.width, building.height, 1)
  hoverSprite.setFrame(spritesSheet.getFrame(building.frame))
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
    const pos = gridToWorld(gridX, gridY)

    // Create shadow
    const shadow = new Sprite2D({ material: shadowMaterial })
    shadow.scale.set(TILE_SIZE * buildingDef.shadowScale, TILE_SIZE * buildingDef.shadowScale * 0.5, 1)
    shadow.position.set(pos.x, pos.y - TILE_SIZE * 0.3, 0)
    shadow.sortLayer = SortLayers.SHADOWS
    shadow.zIndex = 0
    shadow.alpha = 0.5
    spriteGroup.add(shadow)

    // Create building sprite — all buildings share spritesMaterial, so
    // they batch together and zIndex Y-sort works across types.
    //
    // scale.set BEFORE setFrame: Sprite2D.setFrame runs updateSize() on
    // the first frame and overwrites .scale with the atlas frame's
    // sourceSize. Setting scale first lets updateSize win — render size
    // matches the atlas source dimensions (the natural pixel-art size).
    // This matches what R3F does automatically because its declaration-
    // order prop application puts scale before frame.
    const sprite = new Sprite2D({ material: spritesMaterial })
    sprite.scale.set(buildingDef.width, buildingDef.height, 1)
    sprite.setFrame(spritesSheet.getFrame(buildingDef.frame))

    // Position with anchor at bottom center
    sprite.position.set(pos.x, pos.y + buildingDef.height / 2 - TILE_SIZE / 2, 0)
    sprite.sortLayer = SortLayers.ENTITIES
    // Y-sort: use zIndex for depth sorting (lower Y = higher zIndex = renders in front)
    sprite.zIndex = -Math.floor(pos.y)

    spriteGroup.add(sprite)

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
    hoverSprite.scale.set(buildingDef.width, buildingDef.height, 1)
    hoverSprite.setFrame(spritesSheet.getFrame(buildingDef.frame))
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

  // Tweakpane debug UI
  const { pane, update: updateDevtools } = createPane({ driver: 'manual' })
  const devtools = createDevtoolsProvider({ name: 'batch-demo' })
  const exampleStats = { sprites: 0, batches: 0 }
  const statsFolder = pane.addFolder({ title: 'Batching', expanded: false })
  statsFolder.addBinding(exampleStats, 'sprites', { readonly: true, format: (v: number) => v.toFixed(0) })
  statsFolder.addBinding(exampleStats, 'batches', { readonly: true, format: (v: number) => v.toFixed(0) })

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
  function animate() {
    rafId = requestAnimationFrame(animate)

    devtools.beginFrame(performance.now(), renderer)
    renderer.render(scene, camera)
    devtools.endFrame(renderer)
    updateDevtools()

    // Update stats monitors
    const groupStats = spriteGroup.stats
    exampleStats.sprites = groupStats.spriteCount
    exampleStats.batches = groupStats.batchCount
    pane.refresh()
  }

  animate()
}

main()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (activeRenderer) {
      activeRenderer.dispose?.()
      activeRenderer.domElement.remove()
      activeRenderer = null
    }
  })
}
