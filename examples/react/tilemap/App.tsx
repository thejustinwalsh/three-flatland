import { Suspense, useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import {
  DataTexture,
  RGBAFormat,
  NearestFilter,
  SRGBColorSpace,
} from 'three'
import {
  TileMap2D,
  type TileMapData,
  type TilesetData,
  type TileLayerData,
} from '@three-flatland/react'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import WaRadioGroup from '@awesome.me/webawesome/dist/react/radio-group/index.js'
import WaRadio from '@awesome.me/webawesome/dist/react/radio/index.js'
import WaButtonGroup from '@awesome.me/webawesome/dist/react/button-group/index.js'
import WaButton from '@awesome.me/webawesome/dist/react/button/index.js'
import WaSelect from '@awesome.me/webawesome/dist/react/select/index.js'
import WaOption from '@awesome.me/webawesome/dist/react/option/index.js'
import WaInput from '@awesome.me/webawesome/dist/react/input/index.js'

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

// Density presets for BSP dungeon generation
const DENSITY_PRESETS: Record<string, { minPartition: number; roomPadding: number; minRoom: number }> = {
  sparse: { minPartition: 28, roomPadding: 4, minRoom: 10 },
  normal: { minPartition: 20, roomPadding: 3, minRoom: 8 },
  dense: { minPartition: 14, roomPadding: 2, minRoom: 6 },
  packed: { minPartition: 10, roomPadding: 1, minRoom: 4 },
}

interface BSPNode {
  x: number
  y: number
  w: number
  h: number
  left?: BSPNode
  right?: BSPNode
  room?: { x: number; y: number; w: number; h: number }
}

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

    for (let x = Math.min(ax, midX); x <= Math.max(ax, midX); x++) {
      for (let dy = -Math.floor(CORRIDOR_WIDTH / 2); dy <= Math.floor(CORRIDOR_WIDTH / 2); dy++) {
        const ty = ay + dy
        if (ty >= 0 && ty < height && x >= 0 && x < width) {
          ground[ty * width + x] = TILES.FLOOR_1 + Math.floor(Math.random() * 4)
        }
      }
    }

    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
      for (let dx = -Math.floor(CORRIDOR_WIDTH / 2); dx <= Math.floor(CORRIDOR_WIDTH / 2); dx++) {
        const tx = midX + dx
        if (y >= 0 && y < height && tx >= 0 && tx < width) {
          ground[y * width + tx] = TILES.FLOOR_1 + Math.floor(Math.random() * 4)
        }
      }
    }

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

  const root: BSPNode = { x: 1, y: 1, w: width - 2, h: height - 2 }
  const depth = Math.floor(Math.log2(Math.min(width, height) / MIN_PARTITION_SIZE)) + 1
  splitNode(root, depth)
  createRooms(root)

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
  width: number,
  height: number,
  tileset: TilesetData,
  layers: { ground: Uint32Array; walls: Uint32Array; decor: Uint32Array }
): TileMapData {
  const tileLayers: TileLayerData[] = [
    { name: 'Ground', id: 0, width, height, data: layers.ground, visible: true },
    { name: 'Walls', id: 1, width, height, data: layers.walls, visible: true },
    { name: 'Decor', id: 2, width, height, data: layers.decor, visible: true },
  ]

  return {
    width,
    height,
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
  chunkSize: number
  showGround: boolean
  showWalls: boolean
  showDecor: boolean
  onStats?: (tiles: number, chunks: number, layers: number) => void
}

function TilemapScene({ mapData, chunkSize, showGround, showWalls, showDecor, onStats }: TilemapSceneProps) {
  const tilemapRef = useRef<TileMap2D>(null)

  // Report stats when tilemap data or chunk size changes
  useEffect(() => {
    if (!tilemapRef.current || !onStats) return
    onStats(
      tilemapRef.current.totalTileCount,
      tilemapRef.current.totalChunkCount,
      tilemapRef.current.layerCount,
    )
  }, [mapData, chunkSize, onStats])

  // Update layer visibility
  useEffect(() => {
    if (!tilemapRef.current) return
    const ground = tilemapRef.current.getLayerAt(0)
    const walls = tilemapRef.current.getLayerAt(1)
    const decor = tilemapRef.current.getLayerAt(2)
    if (ground) ground.visible = showGround
    if (walls) walls.visible = showWalls
    if (decor) decor.visible = showDecor
  }, [showGround, showWalls, showDecor])

  useFrame((_, delta) => {
    tilemapRef.current?.update(delta * 1000)
  })

  return (
    <tileMap2D
      ref={tilemapRef}
      data={mapData}
      chunkSize={chunkSize}
      position={[0, 0, 0]}
    />
  )
}

function StatsTracker({ onStats }: { onStats: (fps: number, draws: number) => void }) {
  const gl = useThree((s) => s.gl)
  const frameCount = useRef(0)
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    frameCount.current++
    elapsed.current += delta
    if (elapsed.current >= 1) {
      // Cast: R3F types gl as WebGLRenderer, but we use WebGPURenderer which has drawCalls
      const draws = (gl.info.render as any).drawCalls as number
      onStats(Math.round(frameCount.current / elapsed.current), draws)
      frameCount.current = 0
      elapsed.current = 0
    }
  })

  return null
}

function CameraController({ mapSize }: { mapSize: number }) {
  const { camera, gl } = useThree()
  const keys = useRef(new Set<string>())
  const zoom = useRef(1)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const cameraStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    camera.position.x = (mapSize * TILE_SIZE) / 2
    camera.position.y = (mapSize * TILE_SIZE) / 2
  }, [camera, mapSize])

  useEffect(() => {
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

      if (dragDistance > 3) {
        document.body.style.cursor = 'move'
      }

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

    camera.zoom = 2 / zoom.current
    camera.updateProjectionMatrix()
  })

  return null
}

// Map size presets (in tiles)
const MAP_SIZE_PRESETS: Record<string, number> = {
  sm: 64,
  md: 128,
  lg: 256,
  xl: 512,
}

export default function App() {
  const [mapSizePreset, setMapSizePreset] = useState('md')
  const mapSize = MAP_SIZE_PRESETS[mapSizePreset] ?? 128
  const [chunkSize, setChunkSize] = useState(512)
  const [density, setDensity] = useState('normal')
  const [seed, setSeed] = useState(42)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showGround, setShowGround] = useState(true)
  const [showWalls, setShowWalls] = useState(true)
  const [showDecor, setShowDecor] = useState(true)
  const [fps, setFps] = useState<string | number>('-')
  const [draws, setDraws] = useState<string | number>('-')
  const [tileStats, setTileStats] = useState({ tiles: 0, chunks: 0, layers: 0 })

  const layerTogglesRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  const handlePerfStats = useCallback((fpsVal: number, drawsVal: number) => {
    setFps(fpsVal)
    setDraws(drawsVal)
  }, [])
  const handleStats = useCallback((tiles: number, chunks: number, layers: number) => setTileStats({ tiles, chunks, layers }), [])

  const handleRegenerate = () => setSeed(Math.floor(Math.random() * 999999))

  // Per-line pill rounding for all wrapping groups (radio + button)
  useEffect(() => {
    const cleanups: (() => void)[] = []
    function observeGroup(container: Element, childSelector: string) {
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
      cleanups.push(() => ro.disconnect())
    }
    // Layer toggle buttons
    const btnGroup = layerTogglesRef.current?.querySelector('wa-button-group')
    if (btnGroup) observeGroup(btnGroup, 'wa-button')
    // Settings panel radio groups
    const radioGroups = settingsRef.current?.querySelectorAll('wa-radio-group')
    if (radioGroups) {
      for (const rg of radioGroups) observeGroup(rg, 'wa-radio')
    }
    return () => cleanups.forEach(fn => fn())
  }, [])

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

  // Generate map data (regenerates when mapSize, density, or seed changes)
  const mapData = useMemo(() => {
    const layers = generateDungeon(mapSize, mapSize, density)
    return createTileMapData(mapSize, mapSize, tileset, layers)
  }, [tileset, mapSize, density, seed])

  return (
    <>
      {/* Generation settings — top-left column */}
      <style>{`
        .tilemap-settings wa-radio-group::part(form-control-label) {
          font-size: 11px;
          color: #8890a0;
          font-family: monospace;
        }
        .tilemap-settings wa-radio-group::part(form-control-input) {
          row-gap: 4px;
          justify-content: center;
        }
        wa-radio[data-line-pos="first"] {
          border-start-start-radius: var(--wa-border-radius-m);
          border-end-start-radius: var(--wa-border-radius-m);
          border-start-end-radius: 0;
          border-end-end-radius: 0;
        }
        wa-radio[data-line-pos="inner"] { border-radius: 0; }
        wa-radio[data-line-pos="last"] {
          border-start-end-radius: var(--wa-border-radius-m);
          border-end-end-radius: var(--wa-border-radius-m);
          border-start-start-radius: 0;
          border-end-start-radius: 0;
        }
        wa-radio[data-line-pos="solo"] { border-radius: var(--wa-border-radius-m); }
        .tilemap-settings-toggle {
          display: none;
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 101;
          width: 28px;
          height: 28px;
          background: rgba(0, 2, 28, 0.7);
          border: none;
          border-radius: 6px;
          color: #8890a0;
          font-size: 16px;
          cursor: pointer;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 480px) {
          .tilemap-settings-toggle { display: flex; }
          .tilemap-settings { display: none !important; }
          .tilemap-settings.open { display: flex !important; top: 48px !important; z-index: 102 !important; }
        }
      `}</style>
      <button
        className="tilemap-settings-toggle"
        title="Settings"
        onClick={() => setSettingsOpen(v => !v)}
      >
        {settingsOpen ? '\u2715' : '\u2630'}
      </button>
      <div ref={settingsRef} className={`tilemap-settings${settingsOpen ? ' open' : ''}`} style={{
        position: 'fixed', top: 12, left: 12, zIndex: 100, pointerEvents: 'auto',
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '8px 10px', background: 'rgba(0, 2, 28, 0.7)', borderRadius: 6,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: '#8890a0', fontFamily: 'monospace' }}>Map Size</span>
            <WaRadioGroup size="small" orientation="horizontal" value={mapSizePreset} onChange={(e: any) => setMapSizePreset((e.target as any).value)}>
              <WaRadio value="sm" size="small" appearance="button">SM</WaRadio>
              <WaRadio value="md" size="small" appearance="button">MD</WaRadio>
              <WaRadio value="lg" size="small" appearance="button">LG</WaRadio>
              <WaRadio value="xl" size="small" appearance="button">XL</WaRadio>
            </WaRadioGroup>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: '#8890a0', fontFamily: 'monospace' }}>Chunks</span>
            <WaSelect value={String(chunkSize)} size="small" onChange={(e: any) => setChunkSize(Number((e.target as any).value))} style={{ width: 86 }}>
              <WaOption value="256">256</WaOption>
              <WaOption value="512">512</WaOption>
              <WaOption value="1024">1024</WaOption>
              <WaOption value="2048">2048</WaOption>
            </WaSelect>
          </div>
        </div>
        <WaRadioGroup label="Density" size="small" orientation="horizontal" value={density} onChange={(e: any) => setDensity((e.target as any).value)}>
          <WaRadio value="sparse" size="small" appearance="button">Sparse</WaRadio>
          <WaRadio value="normal" size="small" appearance="button">Normal</WaRadio>
          <WaRadio value="dense" size="small" appearance="button">Dense</WaRadio>
          <WaRadio value="packed" size="small" appearance="button">Packed</WaRadio>
        </WaRadioGroup>
        <div>
          <div style={{ fontSize: 11, color: '#8890a0', fontFamily: 'monospace', marginBottom: 2 }}>Seed</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <WaInput
              type="number"
              value={String(seed)}
              size="small"
              withoutSpinButtons
              style={{ width: 120 }}
              onChange={(e: any) => setSeed(Number(e.target.value))}
            />
            <WaButton size="small" onClick={handleRegenerate} title="Random seed">
              &#x21bb;
            </WaButton>
          </div>
        </div>
      </div>

      {/* Stats — top-right */}
      <div style={{
        position: 'fixed',
        top: 12,
        right: 12,
        padding: '5px 10px',
        background: 'rgba(0, 2, 28, 0.7)',
        borderRadius: 6,
        color: '#4a9eff',
        fontSize: 10,
        fontFamily: 'monospace',
        lineHeight: 1.5,
        zIndex: 100,
      }}>
        <div>FPS: {fps}</div>
        <div>Draws: {draws}</div>
        <div>Tiles: {tileStats.tiles}</div>
        <div>Chunks: {tileStats.chunks}</div>
        <div>Layers: {tileStats.layers}</div>
      </div>

      {/* Layer toggles — bottom-center */}
      <div ref={layerTogglesRef} className="layer-toggles" style={{
        position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        zIndex: 100, pointerEvents: 'auto', maxWidth: 'calc(100vw - 24px)',
      }}>
        <WaButtonGroup>
          <WaButton size="small" variant={showGround ? 'brand' : 'neutral'} onClick={() => setShowGround(v => !v)}>
            <span slot="start">{showGround ? '\u2713' : '\u2715'}</span>
            Ground
          </WaButton>
          <WaButton size="small" variant={showWalls ? 'brand' : 'neutral'} onClick={() => setShowWalls(v => !v)}>
            <span slot="start">{showWalls ? '\u2713' : '\u2715'}</span>
            Walls
          </WaButton>
          <WaButton size="small" variant={showDecor ? 'brand' : 'neutral'} onClick={() => setShowDecor(v => !v)}>
            <span slot="start">{showDecor ? '\u2713' : '\u2715'}</span>
            Decor
          </WaButton>
        </WaButtonGroup>
      </div>

      {/* Legend — bottom-center */}
      <div style={{
        position: 'fixed',
        bottom: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#555',
        fontSize: 9,
        fontFamily: 'monospace',
        zIndex: 100,
        whiteSpace: 'nowrap',
      }}>
        Drag: Pan | WASD/Arrows: Pan | Scroll: Zoom
      </div>

      {/* Canvas */}
      <Canvas
        orthographic
        camera={{ zoom: 2, position: [0, 0, 100] }}
        renderer={{ antialias: false }}
      >
        <color attach="background" args={['#0a0a12']} />
        <StatsTracker onStats={handlePerfStats} />
        <CameraController mapSize={mapSize} />
        <Suspense fallback={null}>
          <TilemapScene
            mapData={mapData}
            chunkSize={chunkSize}
            showGround={showGround}
            showWalls={showWalls}
            showDecor={showDecor}
            onStats={handleStats}
          />
        </Suspense>
      </Canvas>
    </>
  )
}
