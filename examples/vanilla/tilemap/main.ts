import { WebGPURenderer } from 'three/webgpu'
import {
  Scene,
  OrthographicCamera,
  Color,
  DataTexture,
  RGBAFormat,
  NearestFilter,
  SRGBColorSpace,
  Raycaster,
  Vector2,
  Plane,
  Vector3,
} from 'three'
import { TileMap2D, type TileMapData, type TilesetData, type TileLayerData } from '@three-flatland/core'

// Web Awesome web components
import '@awesome.me/webawesome/dist/styles/themes/default.css'
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js'
import '@awesome.me/webawesome/dist/components/radio/radio.js'
import '@awesome.me/webawesome/dist/components/button-group/button-group.js'
import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/select/select.js'
import '@awesome.me/webawesome/dist/components/option/option.js'
import '@awesome.me/webawesome/dist/components/input/input.js'

/** Re-apply per-line first/last pill rounding when a flex container wraps */
function setupWrappingGroup(container: Element, childSelector: string) {
  const update = () => {
    const children = [...container.querySelectorAll(childSelector)]
    if (!children.length) return
    const lines: Element[][] = []
    let lastTop = -Infinity
    let line: Element[] = []
    for (const child of children) {
      const top = child.getBoundingClientRect().top
      if (Math.abs(top - lastTop) > 2) {
        if (line.length) lines.push(line)
        line = []
        lastTop = top
      }
      line.push(child)
    }
    if (line.length) lines.push(line)
    for (const ln of lines) {
      for (let i = 0; i < ln.length; i++) {
        const pos =
          ln.length === 1 ? 'solo' :
          i === 0 ? 'first' :
          i === ln.length - 1 ? 'last' : 'inner'
        ln[i]!.setAttribute('data-line-pos', pos)
      }
    }
  }
  const ro = new ResizeObserver(update)
  ro.observe(container)
  update()
  return () => ro.disconnect()
}

// Tile IDs for our procedural tileset
const TILES = {
  EMPTY: 0,
  // Ground tiles (row 0)
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  // Wall tiles (row 1)
  WALL_TOP: 5,
  WALL_LEFT: 6,
  WALL_RIGHT: 7,
  WALL_BOTTOM: 8,
  // Corner tiles (row 2)
  CORNER_TL: 9,
  CORNER_TR: 10,
  CORNER_BL: 11,
  CORNER_BR: 12,
  // Decoration tiles (row 3)
  TORCH: 13,
  CHEST: 14,
  SKULL: 15,
  BONES: 16,
} as const

// Tile colors (RGBA) for our procedural tileset
const TILE_COLORS: Record<number, [number, number, number, number]> = {
  [TILES.EMPTY]: [0, 0, 0, 0],
  [TILES.FLOOR_1]: [80, 70, 60, 255],
  [TILES.FLOOR_2]: [90, 80, 70, 255],
  [TILES.FLOOR_3]: [85, 75, 65, 255],
  [TILES.FLOOR_4]: [75, 65, 55, 255],
  [TILES.WALL_TOP]: [50, 50, 60, 255],
  [TILES.WALL_LEFT]: [45, 45, 55, 255],
  [TILES.WALL_RIGHT]: [55, 55, 65, 255],
  [TILES.WALL_BOTTOM]: [40, 40, 50, 255],
  [TILES.CORNER_TL]: [60, 60, 70, 255],
  [TILES.CORNER_TR]: [60, 60, 70, 255],
  [TILES.CORNER_BL]: [50, 50, 60, 255],
  [TILES.CORNER_BR]: [50, 50, 60, 255],
  [TILES.TORCH]: [255, 200, 100, 255],
  [TILES.CHEST]: [200, 150, 50, 255],
  [TILES.SKULL]: [200, 200, 200, 255],
  [TILES.BONES]: [180, 180, 170, 255],
}

/**
 * Generate a procedural tileset texture.
 */
function createProceduralTileset(tileSize: number, columns: number, rows: number): DataTexture {
  const width = columns * tileSize
  const height = rows * tileSize
  const data = new Uint8Array(width * height * 4)

  // Fill with tile colors
  for (let tileId = 0; tileId < columns * rows; tileId++) {
    const col = tileId % columns
    const row = Math.floor(tileId / columns)
    const color = TILE_COLORS[tileId + 1] ?? [128, 128, 128, 255]

    // Draw tile with slight variation for visual interest
    for (let py = 0; py < tileSize; py++) {
      for (let px = 0; px < tileSize; px++) {
        const x = col * tileSize + px
        const y = row * tileSize + py
        const i = (y * width + x) * 4

        // Add slight noise
        const noise = Math.floor(Math.random() * 20) - 10

        // Add border (1px darker edge)
        const isBorder = px === 0 || py === 0 || px === tileSize - 1 || py === tileSize - 1
        const borderDarken = isBorder ? 20 : 0

        data[i] = Math.max(0, Math.min(255, color[0] + noise - borderDarken))
        data[i + 1] = Math.max(0, Math.min(255, color[1] + noise - borderDarken))
        data[i + 2] = Math.max(0, Math.min(255, color[2] + noise - borderDarken))
        data[i + 3] = color[3]
      }
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

// Density presets for BSP dungeon generation
const DENSITY_PRESETS: Record<string, { minPartition: number; roomPadding: number; minRoom: number }> = {
  sparse: { minPartition: 28, roomPadding: 4, minRoom: 10 },
  normal: { minPartition: 20, roomPadding: 3, minRoom: 8 },
  dense: { minPartition: 14, roomPadding: 2, minRoom: 6 },
  packed: { minPartition: 10, roomPadding: 1, minRoom: 4 },
}

/**
 * BSP Node for dungeon generation
 */
interface BSPNode {
  x: number
  y: number
  w: number
  h: number
  left?: BSPNode
  right?: BSPNode
  room?: { x: number; y: number; w: number; h: number }
}

/**
 * Generate a procedural dungeon using BSP (Binary Space Partitioning).
 */
function generateDungeon(width: number, height: number, density: string): {
  ground: Uint32Array
  walls: Uint32Array
  decor: Uint32Array
} {
  const ground = new Uint32Array(width * height)
  const walls = new Uint32Array(width * height)
  const decor = new Uint32Array(width * height)

  const preset = DENSITY_PRESETS[density] ?? DENSITY_PRESETS['normal']!
  const MIN_PARTITION_SIZE = preset.minPartition
  const MIN_ROOM_SIZE = preset.minRoom
  const ROOM_PADDING = preset.roomPadding
  const CORRIDOR_WIDTH = 2

  // BSP split function
  function splitNode(node: BSPNode, depth: number): void {
    if (depth <= 0) return
    if (node.w < MIN_PARTITION_SIZE * 2 && node.h < MIN_PARTITION_SIZE * 2) return

    // Decide split direction based on aspect ratio
    let splitHorizontal: boolean
    if (node.w > node.h * 1.25) {
      splitHorizontal = false // split vertically
    } else if (node.h > node.w * 1.25) {
      splitHorizontal = true // split horizontally
    } else {
      splitHorizontal = Math.random() > 0.5
    }

    // Check if we can split in the chosen direction
    if (splitHorizontal && node.h < MIN_PARTITION_SIZE * 2) splitHorizontal = false
    if (!splitHorizontal && node.w < MIN_PARTITION_SIZE * 2) splitHorizontal = true

    // Final check
    if (splitHorizontal && node.h < MIN_PARTITION_SIZE * 2) return
    if (!splitHorizontal && node.w < MIN_PARTITION_SIZE * 2) return

    if (splitHorizontal) {
      const splitY = node.y + MIN_PARTITION_SIZE + Math.floor(Math.random() * (node.h - MIN_PARTITION_SIZE * 2))
      node.left = { x: node.x, y: node.y, w: node.w, h: splitY - node.y }
      node.right = { x: node.x, y: splitY, w: node.w, h: node.y + node.h - splitY }
    } else {
      const splitX = node.x + MIN_PARTITION_SIZE + Math.floor(Math.random() * (node.w - MIN_PARTITION_SIZE * 2))
      node.left = { x: node.x, y: node.y, w: splitX - node.x, h: node.h }
      node.right = { x: splitX, y: node.y, w: node.x + node.w - splitX, h: node.h }
    }

    splitNode(node.left, depth - 1)
    splitNode(node.right, depth - 1)
  }

  // Create rooms in leaf nodes
  function createRooms(node: BSPNode): void {
    if (node.left && node.right) {
      createRooms(node.left)
      createRooms(node.right)
      return
    }

    // Leaf node - create a room
    const maxRoomW = node.w - ROOM_PADDING * 2
    const maxRoomH = node.h - ROOM_PADDING * 2

    if (maxRoomW < MIN_ROOM_SIZE || maxRoomH < MIN_ROOM_SIZE) return

    const roomW = MIN_ROOM_SIZE + Math.floor(Math.random() * (maxRoomW - MIN_ROOM_SIZE + 1))
    const roomH = MIN_ROOM_SIZE + Math.floor(Math.random() * (maxRoomH - MIN_ROOM_SIZE + 1))
    const roomX = node.x + ROOM_PADDING + Math.floor(Math.random() * (maxRoomW - roomW + 1))
    const roomY = node.y + ROOM_PADDING + Math.floor(Math.random() * (maxRoomH - roomH + 1))

    node.room = { x: roomX, y: roomY, w: roomW, h: roomH }
  }

  // Get a room from a node (descends into children)
  function getRoom(node: BSPNode): { x: number; y: number; w: number; h: number } | undefined {
    if (node.room) return node.room
    if (node.left && node.right) {
      return Math.random() > 0.5 ? getRoom(node.left) : getRoom(node.right)
    }
    if (node.left) return getRoom(node.left)
    if (node.right) return getRoom(node.right)
    return undefined
  }

  // Connect sibling nodes with corridors
  function connectNodes(node: BSPNode): void {
    if (!node.left || !node.right) return

    connectNodes(node.left)
    connectNodes(node.right)

    const roomA = getRoom(node.left)
    const roomB = getRoom(node.right)

    if (!roomA || !roomB) return

    // Get center points
    const ax = roomA.x + Math.floor(roomA.w / 2)
    const ay = roomA.y + Math.floor(roomA.h / 2)
    const bx = roomB.x + Math.floor(roomB.w / 2)
    const by = roomB.y + Math.floor(roomB.h / 2)

    // Create L-shaped corridor with width
    const midX = Math.random() > 0.5 ? ax : bx

    // Horizontal segment
    const startX = Math.min(ax, midX)
    const endX = Math.max(ax, midX)
    for (let x = startX; x <= endX; x++) {
      for (let dy = -Math.floor(CORRIDOR_WIDTH / 2); dy <= Math.floor(CORRIDOR_WIDTH / 2); dy++) {
        const ty = ay + dy
        if (ty >= 0 && ty < height && x >= 0 && x < width) {
          ground[ty * width + x] = TILES.FLOOR_1 + Math.floor(Math.random() * 4)
        }
      }
    }

    // Vertical segment from ay to by at midX
    const startY = Math.min(ay, by)
    const endY = Math.max(ay, by)
    for (let y = startY; y <= endY; y++) {
      for (let dx = -Math.floor(CORRIDOR_WIDTH / 2); dx <= Math.floor(CORRIDOR_WIDTH / 2); dx++) {
        const tx = midX + dx
        if (y >= 0 && y < height && tx >= 0 && tx < width) {
          ground[y * width + tx] = TILES.FLOOR_1 + Math.floor(Math.random() * 4)
        }
      }
    }

    // Horizontal segment from midX to bx at by
    const startX2 = Math.min(midX, bx)
    const endX2 = Math.max(midX, bx)
    for (let x = startX2; x <= endX2; x++) {
      for (let dy = -Math.floor(CORRIDOR_WIDTH / 2); dy <= Math.floor(CORRIDOR_WIDTH / 2); dy++) {
        const ty = by + dy
        if (ty >= 0 && ty < height && x >= 0 && x < width) {
          ground[ty * width + x] = TILES.FLOOR_1 + Math.floor(Math.random() * 4)
        }
      }
    }
  }

  // Collect all rooms for decoration
  function collectRooms(node: BSPNode, rooms: Array<{ x: number; y: number; w: number; h: number }>): void {
    if (node.room) rooms.push(node.room)
    if (node.left) collectRooms(node.left, rooms)
    if (node.right) collectRooms(node.right, rooms)
  }

  // Build BSP tree
  const root: BSPNode = { x: 1, y: 1, w: width - 2, h: height - 2 }
  const depth = Math.floor(Math.log2(Math.min(width, height) / MIN_PARTITION_SIZE)) + 1
  splitNode(root, depth)
  createRooms(root)

  // Draw rooms
  const rooms: Array<{ x: number; y: number; w: number; h: number }> = []
  collectRooms(root, rooms)

  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          ground[y * width + x] = TILES.FLOOR_1 + Math.floor(Math.random() * 4)
        }
      }
    }
  }

  // Connect rooms
  connectNodes(root)

  // Add walls around floor tiles
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (ground[idx] === 0) continue

      // Check all 8 neighbors for wall placement
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          const nidx = ny * width + nx
          if (ground[nidx] === 0 && walls[nidx] === 0) {
            // Choose wall type based on direction
            if (dy === -1) walls[nidx] = TILES.WALL_TOP
            else if (dy === 1) walls[nidx] = TILES.WALL_BOTTOM
            else if (dx === -1) walls[nidx] = TILES.WALL_LEFT
            else walls[nidx] = TILES.WALL_RIGHT
          }
        }
      }
    }
  }

  // Add decorations
  for (const room of rooms) {
    // Torches in all 4 corners
    const corners = [
      { x: room.x + 1, y: room.y + 1 },
      { x: room.x + room.w - 2, y: room.y + 1 },
      { x: room.x + 1, y: room.y + room.h - 2 },
      { x: room.x + room.w - 2, y: room.y + room.h - 2 },
    ]
    for (const corner of corners) {
      if (Math.random() > 0.6) {
        const idx = corner.y * width + corner.x
        if (ground[idx] !== 0 && decor[idx] === 0) {
          decor[idx] = TILES.TORCH
        }
      }
    }

    // Random decorations in room interior
    const numDecorations = Math.floor(room.w * room.h / 40) + 1
    for (let i = 0; i < numDecorations; i++) {
      if (room.w <= 4 || room.h <= 4) continue
      const rx = room.x + 2 + Math.floor(Math.random() * (room.w - 4))
      const ry = room.y + 2 + Math.floor(Math.random() * (room.h - 4))
      const idx = ry * width + rx
      if (ground[idx] !== 0 && decor[idx] === 0) {
        const roll = Math.random()
        if (roll < 0.3) decor[idx] = TILES.CHEST
        else if (roll < 0.6) decor[idx] = TILES.SKULL
        else decor[idx] = TILES.BONES
      }
    }
  }

  return { ground, walls, decor }
}

/**
 * Create tilemap data from generated layers.
 */
function createTileMapData(
  width: number,
  height: number,
  tileSize: number,
  tileset: TilesetData,
  layers: { ground: Uint32Array; walls: Uint32Array; decor: Uint32Array }
): TileMapData {
  const tileLayers: TileLayerData[] = [
    {
      name: 'Ground',
      id: 0,
      width,
      height,
      data: layers.ground,
      visible: true,
    },
    {
      name: 'Walls',
      id: 1,
      width,
      height,
      data: layers.walls,
      visible: true,
    },
    {
      name: 'Decor',
      id: 2,
      width,
      height,
      data: layers.decor,
      visible: true,
    },
  ]

  return {
    width,
    height,
    tileWidth: tileSize,
    tileHeight: tileSize,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    infinite: false,
    tilesets: [tileset],
    tileLayers,
    objectLayers: [],
  }
}

// Map size presets (in tiles)
const MAP_SIZE_PRESETS: Record<string, number> = {
  sm: 64,
  md: 128,
  lg: 256,
  xl: 512,
}

// GUI state
let mapSize = MAP_SIZE_PRESETS['md']!
let chunkSize = 512
let density = 'normal'
let seed = 42
let showGround = true
let showWalls = true
let showDecor = true

async function main() {
  const TILE_SIZE = 16
  const TILESET_COLUMNS = 4
  const TILESET_ROWS = 4

  // Scene setup
  const scene = new Scene()
  scene.background = new Color(0x0a0a12)

  // Orthographic camera
  const frustumSize = 800
  const aspect = window.innerWidth / window.innerHeight
  const camera = new OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
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

  // Create procedural tileset
  const tilesetTexture = createProceduralTileset(TILE_SIZE, TILESET_COLUMNS, TILESET_ROWS)

  const tilesetData: TilesetData = {
    name: 'dungeon',
    firstGid: 1,
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    imageWidth: TILESET_COLUMNS * TILE_SIZE,
    imageHeight: TILESET_ROWS * TILE_SIZE,
    columns: TILESET_COLUMNS,
    tileCount: TILESET_COLUMNS * TILESET_ROWS,
    tiles: new Map(),
    texture: tilesetTexture,
  }

  // Build tilemap from current state
  function buildTilemap(): TileMap2D {
    const dungeonLayers = generateDungeon(mapSize, mapSize, density)
    const mapData = createTileMapData(mapSize, mapSize, TILE_SIZE, tilesetData, dungeonLayers)
    const tm = new TileMap2D({ data: mapData, chunkSize })

    // Apply current layer visibility
    const groundLayer = tm.getLayerAt(0)
    const wallsLayer = tm.getLayerAt(1)
    const decorLayer = tm.getLayerAt(2)
    if (groundLayer) groundLayer.visible = showGround
    if (wallsLayer) wallsLayer.visible = showWalls
    if (decorLayer) decorLayer.visible = showDecor

    return tm
  }

  // Initial build
  let tilemap = buildTilemap()
  scene.add(tilemap)

  // Center camera on map
  camera.position.x = (mapSize * TILE_SIZE) / 2
  camera.position.y = (mapSize * TILE_SIZE) / 2

  // Rebuild tilemap (on map size, density, or seed change)
  function rebuildTilemap() {
    scene.remove(tilemap)
    tilemap.dispose()
    tilemap = buildTilemap()
    scene.add(tilemap)

    // Re-center camera
    camera.position.x = (mapSize * TILE_SIZE) / 2
    camera.position.y = (mapSize * TILE_SIZE) / 2

    updateStats()
  }

  // Wire up Web Awesome controls
  document.getElementById('map-size')!.addEventListener('change', (e) => {
    const preset = (e.target as any).value as string
    mapSize = MAP_SIZE_PRESETS[preset] ?? 128
    rebuildTilemap()
  })

  document.getElementById('chunk-size')!.addEventListener('change', (e) => {
    chunkSize = Number((e.target as any).value)
    rebuildTilemap()
  })

  document.getElementById('density')!.addEventListener('change', (e) => {
    density = (e.target as any).value
    rebuildTilemap()
  })

  const seedInput = document.getElementById('seed') as any
  seedInput.addEventListener('change', () => {
    seed = Number(seedInput.value)
    rebuildTilemap()
  })

  const groundBtn = document.getElementById('show-ground')! as any
  const wallsBtn = document.getElementById('show-walls')! as any
  const decorBtn = document.getElementById('show-decor')! as any

  function updateLayerButton(btn: HTMLElement, active: boolean) {
    ;(btn as any).variant = active ? 'brand' : 'neutral'
    const icon = btn.querySelector('[slot="start"]')
    if (icon) icon.textContent = active ? '\u2713' : '\u2715'
  }

  groundBtn.addEventListener('click', () => {
    showGround = !showGround
    updateLayerButton(groundBtn, showGround)
    const layer = tilemap.getLayerAt(0)
    if (layer) layer.visible = showGround
  })

  wallsBtn.addEventListener('click', () => {
    showWalls = !showWalls
    updateLayerButton(wallsBtn, showWalls)
    const layer = tilemap.getLayerAt(1)
    if (layer) layer.visible = showWalls
  })

  decorBtn.addEventListener('click', () => {
    showDecor = !showDecor
    updateLayerButton(decorBtn, showDecor)
    const layer = tilemap.getLayerAt(2)
    if (layer) layer.visible = showDecor
  })

  // Set up per-line pill rounding for all wrapping groups
  const buttonGroup = document.querySelector('#layers wa-button-group')!
  setupWrappingGroup(buttonGroup, 'wa-button')
  for (const rg of document.querySelectorAll('#settings wa-radio-group')) {
    setupWrappingGroup(rg, 'wa-radio')
  }

  document.getElementById('regen-btn')!.addEventListener('click', () => {
    seed = Math.floor(Math.random() * 999999)
    seedInput.value = String(seed)
    rebuildTilemap()
  })

  // Settings panel toggle (mobile)
  const settingsToggle = document.getElementById('settings-toggle')!
  const settingsPanel = document.getElementById('settings')!
  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('open')
    settingsToggle.textContent = settingsPanel.classList.contains('open') ? '\u2715' : '\u2630'
  })

  // Camera controls
  const keys = new Set<string>()
  let zoom = 1

  window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()))
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))

  window.addEventListener('wheel', (e) => {
    e.preventDefault()
    zoom *= e.deltaY > 0 ? 1.1 : 0.9
    zoom = Math.max(0.2, Math.min(5, zoom))
  }, { passive: false })

  // Drag to pan
  let isDragging = false
  let dragStart = { x: 0, y: 0 }
  let cameraStart = { x: 0, y: 0 }
  let dragDistance = 0

  renderer.domElement.addEventListener('mousedown', (e) => {
    isDragging = true
    dragStart = { x: e.clientX, y: e.clientY }
    cameraStart = { x: camera.position.x, y: camera.position.y }
    dragDistance = 0
  })

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return

    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    dragDistance = Math.sqrt(dx * dx + dy * dy)

    if (dragDistance > 3) {
      renderer.domElement.style.cursor = 'move'
    }

    const worldPerPixel = (frustumSize * zoom) / window.innerHeight
    camera.position.x = cameraStart.x - dx * worldPerPixel
    camera.position.y = cameraStart.y + dy * worldPerPixel
  })

  window.addEventListener('mouseup', () => {
    isDragging = false
    renderer.domElement.style.cursor = ''
  })

  // Click to toggle tile (only if not dragging)
  const raycaster = new Raycaster()
  const mouse = new Vector2()
  const plane = new Plane(new Vector3(0, 0, 1), 0)
  const intersection = new Vector3()

  renderer.domElement.addEventListener('click', (e) => {
    if (dragDistance > 5) return

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1

    raycaster.setFromCamera(mouse, camera)
    raycaster.ray.intersectPlane(plane, intersection)

    const tilePos = tilemap.worldToTile(intersection.x, intersection.y)

    const decorLayer = tilemap.getLayerAt(2)
    if (decorLayer) {
      const currentTile = decorLayer.getTileAt(tilePos.x, tilePos.y)
      const newTile = currentTile === 0 ? TILES.TORCH : 0
      decorLayer.setTileAt(tilePos.x, tilePos.y, newTile)
    }
  })

  // Handle resize
  window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight
    camera.left = (-frustumSize * aspect) / 2
    camera.right = (frustumSize * aspect) / 2
    camera.top = frustumSize / 2
    camera.bottom = -frustumSize / 2
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // Stats elements
  const fpsEl = document.getElementById('fps')!
  const drawCallsEl = document.getElementById('draw-calls')!
  const tileCountEl = document.getElementById('tile-count')!
  const chunkCountEl = document.getElementById('chunk-count')!
  const layerCountEl = document.getElementById('layer-count')!

  function updateStats() {
    tileCountEl.textContent = String(tilemap.totalTileCount)
    chunkCountEl.textContent = String(tilemap.totalChunkCount)
    layerCountEl.textContent = String(tilemap.layerCount)
  }
  updateStats()

  // Animation loop
  let lastTime = performance.now()
  let frameCount = 0
  let fpsTime = 0

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - lastTime
    lastTime = now

    // Camera movement
    const speed = 200 * (deltaMs / 1000) * zoom
    if (keys.has('w') || keys.has('arrowup')) camera.position.y += speed
    if (keys.has('s') || keys.has('arrowdown')) camera.position.y -= speed
    if (keys.has('a') || keys.has('arrowleft')) camera.position.x -= speed
    if (keys.has('d') || keys.has('arrowright')) camera.position.x += speed

    // Apply zoom
    camera.left = (-frustumSize * aspect * zoom) / 2
    camera.right = (frustumSize * aspect * zoom) / 2
    camera.top = (frustumSize * zoom) / 2
    camera.bottom = (-frustumSize * zoom) / 2
    camera.updateProjectionMatrix()

    // Update animated tiles
    tilemap.update(deltaMs)

    renderer.render(scene, camera)

    // FPS counter (read draw calls AFTER render)
    frameCount++
    fpsTime += deltaMs
    if (fpsTime >= 1000) {
      fpsEl.textContent = String(Math.round(frameCount * 1000 / fpsTime))
      drawCallsEl.textContent = String(renderer.info.render.drawCalls)
      frameCount = 0
      fpsTime = 0
    }
  }

  animate()
}

main()
