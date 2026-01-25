import { Suspense, useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import {
  DataTexture,
  RGBAFormat,
  NearestFilter,
  SRGBColorSpace,
  Vector3,
  Plane,
} from 'three'
import {
  TileMap2D,
  type TileMapData,
  type TilesetData,
  type TileLayerData,
} from '@three-flatland/react'

// Register TileMap2D with R3F
extend({ TileMap2D })

// Tile IDs for our procedural tileset
const TILES = {
  EMPTY: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  WALL_TOP: 5,
  WALL_LEFT: 6,
  WALL_RIGHT: 7,
  WALL_BOTTOM: 8,
  CORNER_TL: 9,
  CORNER_TR: 10,
  CORNER_BL: 11,
  CORNER_BR: 12,
  TORCH: 13,
  CHEST: 14,
  SKULL: 15,
  BONES: 16,
} as const

// Tile colors (RGBA)
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

const MAP_WIDTH = 256
const MAP_HEIGHT = 256
const TILE_SIZE = 16
const TILESET_COLUMNS = 4
const TILESET_ROWS = 4

function createProceduralTileset(): DataTexture {
  const width = TILESET_COLUMNS * TILE_SIZE
  const height = TILESET_ROWS * TILE_SIZE
  const data = new Uint8Array(width * height * 4)

  for (let tileId = 0; tileId < TILESET_COLUMNS * TILESET_ROWS; tileId++) {
    const col = tileId % TILESET_COLUMNS
    const row = Math.floor(tileId / TILESET_COLUMNS)
    const color = TILE_COLORS[tileId + 1] ?? [128, 128, 128, 255]

    for (let py = 0; py < TILE_SIZE; py++) {
      for (let px = 0; px < TILE_SIZE; px++) {
        const x = col * TILE_SIZE + px
        const y = row * TILE_SIZE + py
        const i = (y * width + x) * 4

        const noise = Math.floor(Math.random() * 20) - 10
        const isBorder = px === 0 || py === 0 || px === TILE_SIZE - 1 || py === TILE_SIZE - 1
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
function generateDungeon(): {
  ground: Uint32Array
  walls: Uint32Array
  decor: Uint32Array
} {
  const width = MAP_WIDTH
  const height = MAP_HEIGHT
  const ground = new Uint32Array(width * height)
  const walls = new Uint32Array(width * height)
  const decor = new Uint32Array(width * height)

  const MIN_PARTITION_SIZE = 20
  const MIN_ROOM_SIZE = 8
  const ROOM_PADDING = 3
  const CORRIDOR_WIDTH = 2

  function splitNode(node: BSPNode, depth: number): void {
    if (depth <= 0) return
    if (node.w < MIN_PARTITION_SIZE * 2 && node.h < MIN_PARTITION_SIZE * 2) return

    let splitHorizontal: boolean
    if (node.w > node.h * 1.25) splitHorizontal = false
    else if (node.h > node.w * 1.25) splitHorizontal = true
    else splitHorizontal = Math.random() > 0.5

    if (splitHorizontal && node.h < MIN_PARTITION_SIZE * 2) splitHorizontal = false
    if (!splitHorizontal && node.w < MIN_PARTITION_SIZE * 2) splitHorizontal = true
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

  function createRooms(node: BSPNode): void {
    if (node.left && node.right) {
      createRooms(node.left)
      createRooms(node.right)
      return
    }

    const maxRoomW = node.w - ROOM_PADDING * 2
    const maxRoomH = node.h - ROOM_PADDING * 2
    if (maxRoomW < MIN_ROOM_SIZE || maxRoomH < MIN_ROOM_SIZE) return

    const roomW = MIN_ROOM_SIZE + Math.floor(Math.random() * (maxRoomW - MIN_ROOM_SIZE + 1))
    const roomH = MIN_ROOM_SIZE + Math.floor(Math.random() * (maxRoomH - MIN_ROOM_SIZE + 1))
    const roomX = node.x + ROOM_PADDING + Math.floor(Math.random() * (maxRoomW - roomW + 1))
    const roomY = node.y + ROOM_PADDING + Math.floor(Math.random() * (maxRoomH - roomH + 1))

    node.room = { x: roomX, y: roomY, w: roomW, h: roomH }
  }

  function getRoom(node: BSPNode): { x: number; y: number; w: number; h: number } | undefined {
    if (node.room) return node.room
    if (node.left && node.right) return Math.random() > 0.5 ? getRoom(node.left) : getRoom(node.right)
    if (node.left) return getRoom(node.left)
    if (node.right) return getRoom(node.right)
    return undefined
  }

  function connectNodes(node: BSPNode): void {
    if (!node.left || !node.right) return
    connectNodes(node.left)
    connectNodes(node.right)

    const roomA = getRoom(node.left)
    const roomB = getRoom(node.right)
    if (!roomA || !roomB) return

    const ax = roomA.x + Math.floor(roomA.w / 2)
    const ay = roomA.y + Math.floor(roomA.h / 2)
    const bx = roomB.x + Math.floor(roomB.w / 2)
    const by = roomB.y + Math.floor(roomB.h / 2)
    const midX = Math.random() > 0.5 ? ax : bx

    // Horizontal from ax to midX at ay
    for (let x = Math.min(ax, midX); x <= Math.max(ax, midX); x++) {
      for (let dy = -Math.floor(CORRIDOR_WIDTH / 2); dy <= Math.floor(CORRIDOR_WIDTH / 2); dy++) {
        const ty = ay + dy
        if (ty >= 0 && ty < height && x >= 0 && x < width) {
          ground[ty * width + x] = TILES.FLOOR_1 + Math.floor(Math.random() * 4)
        }
      }
    }

    // Vertical from ay to by at midX
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
      for (let dx = -Math.floor(CORRIDOR_WIDTH / 2); dx <= Math.floor(CORRIDOR_WIDTH / 2); dx++) {
        const tx = midX + dx
        if (y >= 0 && y < height && tx >= 0 && tx < width) {
          ground[y * width + tx] = TILES.FLOOR_1 + Math.floor(Math.random() * 4)
        }
      }
    }

    // Horizontal from midX to bx at by
    for (let x = Math.min(midX, bx); x <= Math.max(midX, bx); x++) {
      for (let dy = -Math.floor(CORRIDOR_WIDTH / 2); dy <= Math.floor(CORRIDOR_WIDTH / 2); dy++) {
        const ty = by + dy
        if (ty >= 0 && ty < height && x >= 0 && x < width) {
          ground[ty * width + x] = TILES.FLOOR_1 + Math.floor(Math.random() * 4)
        }
      }
    }
  }

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

  connectNodes(root)

  // Add walls
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (ground[idx] === 0) continue

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          const nidx = ny * width + nx
          if (ground[nidx] === 0 && walls[nidx] === 0) {
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
    const corners = [
      { x: room.x + 1, y: room.y + 1 },
      { x: room.x + room.w - 2, y: room.y + 1 },
      { x: room.x + 1, y: room.y + room.h - 2 },
      { x: room.x + room.w - 2, y: room.y + room.h - 2 },
    ]
    for (const corner of corners) {
      if (Math.random() > 0.6) {
        const idx = corner.y * width + corner.x
        if (ground[idx] !== 0 && decor[idx] === 0) decor[idx] = TILES.TORCH
      }
    }

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

function createTileMapData(
  tileset: TilesetData,
  layers: { ground: Uint32Array; walls: Uint32Array; decor: Uint32Array }
): TileMapData {
  const tileLayers: TileLayerData[] = [
    { name: 'Ground', id: 0, width: MAP_WIDTH, height: MAP_HEIGHT, data: layers.ground, visible: true },
    { name: 'Walls', id: 1, width: MAP_WIDTH, height: MAP_HEIGHT, data: layers.walls, visible: true },
    { name: 'Decor', id: 2, width: MAP_WIDTH, height: MAP_HEIGHT, data: layers.decor, visible: true },
  ]

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    infinite: false,
    tilesets: [tileset],
    tileLayers,
    objectLayers: [],
  }
}

interface TilemapSceneProps {
  mapData: TileMapData
  layerVisibility: boolean[]
  onStats: (stats: { tiles: number; chunks: number; layers: number }) => void
}

function TilemapScene({ mapData, layerVisibility, onStats }: TilemapSceneProps) {
  const tilemapRef = useRef<TileMap2D>(null)
  const { camera } = useThree()

  // Update layer visibility
  useEffect(() => {
    if (tilemapRef.current) {
      layerVisibility.forEach((visible, i) => {
        const layer = tilemapRef.current!.getLayerAt(i)
        if (layer) layer.visible = visible
      })
    }
  }, [layerVisibility])

  // Report stats
  useEffect(() => {
    if (tilemapRef.current) {
      onStats({
        tiles: tilemapRef.current.totalTileCount,
        chunks: tilemapRef.current.totalChunkCount,
        layers: tilemapRef.current.layerCount,
      })
    }
  }, [mapData, onStats])

  // Camera controls
  useFrame((state, delta) => {
    tilemapRef.current?.update(delta * 1000)
  })

  return (
    <tileMap2D
      ref={tilemapRef}
      data={mapData}
      chunkSize={16}
      position={[0, 0, 0]}
    />
  )
}

function CameraController() {
  const { camera, gl } = useThree()
  const keys = useRef(new Set<string>())
  const zoom = useRef(1)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const cameraStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    // Center camera on map
    camera.position.x = (MAP_WIDTH * TILE_SIZE) / 2
    camera.position.y = (MAP_HEIGHT * TILE_SIZE) / 2

    const canvas = gl.domElement

    const handleKeyDown = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase())
    const handleKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoom.current *= e.deltaY > 0 ? 1.1 : 0.9
      zoom.current = Math.max(0.2, Math.min(5, zoom.current))
    }

    const handlePointerDown = (e: PointerEvent) => {
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      cameraStart.current = { x: camera.position.x, y: camera.position.y }
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      const dragDistance = Math.sqrt(dx * dx + dy * dy)

      // Show move cursor once we start dragging
      if (dragDistance > 3) {
        document.body.style.cursor = 'move'
      }

      // Convert screen pixels to world units using camera frustum
      // @ts-expect-error - ortho camera has top/bottom
      const visibleHeight = camera.top - camera.bottom
      const worldPerPixel = visibleHeight / window.innerHeight
      camera.position.x = cameraStart.current.x - dx * worldPerPixel
      camera.position.y = cameraStart.current.y + dy * worldPerPixel
    }

    const handlePointerUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [camera, gl])

  useFrame((_, delta) => {
    const speed = 200 * delta * zoom.current
    if (keys.current.has('w') || keys.current.has('arrowup')) camera.position.y += speed
    if (keys.current.has('s') || keys.current.has('arrowdown')) camera.position.y -= speed
    if (keys.current.has('a') || keys.current.has('arrowleft')) camera.position.x -= speed
    if (keys.current.has('d') || keys.current.has('arrowright')) camera.position.x += speed

    // @ts-expect-error - ortho camera zoom
    camera.zoom = 2 / zoom.current
    camera.updateProjectionMatrix()
  })

  return null
}

export default function App() {
  const [layerVisibility, setLayerVisibility] = useState([true, true, true])
  const [stats, setStats] = useState({ tiles: 0, chunks: 0, layers: 0 })
  const [seed, setSeed] = useState(0)

  // Create tileset (memoized, never changes)
  const tileset = useMemo<TilesetData>(() => ({
    name: 'dungeon',
    firstGid: 1,
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    imageWidth: TILESET_COLUMNS * TILE_SIZE,
    imageHeight: TILESET_ROWS * TILE_SIZE,
    columns: TILESET_COLUMNS,
    tileCount: TILESET_COLUMNS * TILESET_ROWS,
    tiles: new Map(),
    texture: createProceduralTileset(),
  }), [])

  // Generate map data (regenerates when seed changes)
  const mapData = useMemo(() => {
    const layers = generateDungeon()
    return createTileMapData(tileset, layers)
  }, [tileset, seed])

  const toggleLayer = useCallback((index: number) => {
    setLayerVisibility(prev => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }, [])

  const regenerate = useCallback(() => {
    setSeed(s => s + 1)
  }, [])

  const handleStats = useCallback((newStats: typeof stats) => {
    setStats(newStats)
  }, [])

  const layerNames = ['Ground', 'Walls', 'Decor']

  return (
    <>
      {/* Info Panel */}
      <div style={{
        position: 'fixed',
        top: 20,
        left: 20,
        color: '#4a9eff',
        fontSize: 12,
        fontFamily: 'monospace',
        zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        padding: 10,
        borderRadius: 4,
      }}>
        <div>Map: {MAP_WIDTH}x{MAP_HEIGHT}</div>
        <div>Tiles: {stats.tiles}</div>
        <div>Chunks: {stats.chunks}</div>
        <div>Layers: {stats.layers}</div>
      </div>

      {/* Legend */}
      <div style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#888',
        fontSize: 11,
        fontFamily: 'monospace',
        textAlign: 'center',
        zIndex: 100,
      }}>
        Drag: Pan | WASD/Arrows: Pan | Scroll: Zoom
      </div>

      {/* Controls */}
      <div style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 10,
        zIndex: 100,
      }}>
        {layerNames.map((name, i) => (
          <button
            key={name}
            onClick={() => toggleLayer(i)}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontFamily: 'monospace',
              border: '2px solid #4a9eff',
              background: layerVisibility[i] ? '#4a9eff' : 'rgba(74, 158, 255, 0.1)',
              color: layerVisibility[i] ? '#1a1a2e' : '#4a9eff',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            {name}
          </button>
        ))}
        <button
          onClick={regenerate}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontFamily: 'monospace',
            border: '2px solid #4a9eff',
            background: 'rgba(74, 158, 255, 0.1)',
            color: '#4a9eff',
            cursor: 'pointer',
            borderRadius: 4,
          }}
        >
          Regenerate
        </button>
      </div>

      {/* Canvas */}
      <Canvas
        orthographic
        camera={{ zoom: 2, position: [0, 0, 100] }}
        renderer={{ antialias: false }}
      >
        <color attach="background" args={['#0a0a12']} />
        <CameraController />
        <Suspense fallback={null}>
          <TilemapScene
            mapData={mapData}
            layerVisibility={layerVisibility}
            onStats={handleStats}
          />
        </Suspense>
      </Canvas>
    </>
  )
}
