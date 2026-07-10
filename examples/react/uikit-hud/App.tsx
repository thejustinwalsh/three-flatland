import { Suspense, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import {
  DataTexture,
  RGBAFormat,
  NearestFilter,
  SRGBColorSpace,
  type OrthographicCamera as ThreeOrthographicCamera,
} from 'three'
import {
  Flatland,
  Light2D,
  TileMap2D,
  attachLighting,
  type TileMapData,
  type TilesetData,
  type TileLayerData,
} from 'three-flatland/react'
import { DefaultLightEffect } from '@three-flatland/presets'
import '@three-flatland/presets/react'
import { DevtoolsProvider, usePane, usePaneInput } from '@three-flatland/devtools/react'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

extend({ Flatland, Light2D, TileMap2D, DefaultLightEffect })

// ============================================
// uikit-hud — base scene (P0.e scaffold)
//
// Ships ONLY the tilemap + Light2D base scene. The panel material is
// stubbed (`createPanelMaterial` throws `ported in U1/U2`) — mounting
// any uikit Root/Fullscreen/Container here would eagerly construct an
// InstancedPanelGroup and throw at runtime. See the TODO below for the
// exact mount point once U1/U2 land the TSL panel material.
// ============================================

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
const MAP_SIZE = 64
const VIEW_SIZE = 800

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

function buildRoomLayers(size: number): { ground: Uint32Array; walls: Uint32Array; decor: Uint32Array } {
  const ground = new Uint32Array(size * size)
  const walls = new Uint32Array(size * size)
  const decor = new Uint32Array(size * size)

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      ground[y * size + x] = TILES.FLOOR_1 + ((x + y) % 4)
    }
  }
  for (let x = 0; x < size; x++) {
    walls[x] = TILES.WALL_TOP
    walls[(size - 1) * size + x] = TILES.WALL_BOTTOM
  }
  for (let y = 0; y < size; y++) {
    walls[y * size] = TILES.WALL_LEFT
    walls[y * size + (size - 1)] = TILES.WALL_RIGHT
  }
  walls[0] = TILES.CORNER_TL
  walls[size - 1] = TILES.CORNER_TR
  walls[(size - 1) * size] = TILES.CORNER_BL
  walls[(size - 1) * size + (size - 1)] = TILES.CORNER_BR

  const decorSpots: Array<[number, number, number]> = [
    [size * 0.25, size * 0.25, TILES.TORCH],
    [size * 0.75, size * 0.25, TILES.TORCH],
    [size * 0.5, size * 0.5, TILES.CHEST],
    [size * 0.25, size * 0.75, TILES.SKULL],
    [size * 0.75, size * 0.75, TILES.BONES],
  ]
  for (const [fx, fy, tile] of decorSpots) {
    const x = Math.floor(fx)
    const y = Math.floor(fy)
    decor[y * size + x] = tile
  }

  return { ground, walls, decor }
}

function createTileMapData(size: number, tileset: TilesetData, layers: ReturnType<typeof buildRoomLayers>): TileMapData {
  const tileLayers: TileLayerData[] = [
    { name: 'Ground', id: 0, width: size, height: size, data: layers.ground, visible: true },
    { name: 'Walls', id: 1, width: size, height: size, data: layers.walls, visible: true },
    { name: 'Decor', id: 2, width: size, height: size, data: layers.decor, visible: true },
  ]

  return {
    width: size,
    height: size,
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

function OrthoCamera({ viewSize }: { viewSize: number }) {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const camRef = useRef<ThreeOrthographicCamera | null>(null)
  const aspect = size.width / size.height

  useLayoutEffect(() => {
    const cam = camRef.current
    if (!cam) return
    cam.left = (-viewSize * aspect) / 2
    cam.right = (viewSize * aspect) / 2
    cam.top = viewSize / 2
    cam.bottom = -viewSize / 2
    cam.updateProjectionMatrix()
    set({ camera: cam })
  }, [viewSize, aspect, set])

  return <orthographicCamera ref={camRef} position={[0, 0, 100]} near={0.1} far={1000} manual />
}

function HudScene({ ambient }: { ambient: number }) {
  const { gl } = useThree()
  const flatlandRef = useRef<Flatland>(null)
  const torchRef = useRef<Light2D>(null)
  const torch2Ref = useRef<Light2D>(null)
  const flickerT = useRef(0)

  const halfExtent = (MAP_SIZE * TILE_SIZE) / 2

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

  const mapData = useMemo(() => {
    const layers = buildRoomLayers(MAP_SIZE)
    return createTileMapData(MAP_SIZE, tileset, layers)
  }, [tileset])

  // Gem-tinted backdrop lives on Flatland's *internal* scene, not the
  // R3F default scene — <GemBackground> (which targets the default
  // scene) doesn't apply here, so we set backgroundNode directly.
  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return
    const node = gemGradientNode({ gem: GEM })
    const scene = (flatland as unknown as { scene: { backgroundNode: unknown } }).scene
    scene.backgroundNode = node
  }, [])

  useFrame((_, rawDelta) => {
    flickerT.current += rawDelta
    if (torchRef.current) {
      torchRef.current.intensity = 1.6 * (1 + Math.sin(flickerT.current * 15) * 0.1)
    }
    if (torch2Ref.current) {
      torch2Ref.current.intensity = 1.3 * (1 + Math.sin(flickerT.current * 18 + 1) * 0.1)
    }
  })

  useFrame(() => {
    flatlandRef.current?.render(gl as unknown as WebGPURenderer)
  }, { phase: 'render' })

  return (
    <>
      <OrthoCamera viewSize={VIEW_SIZE} />
      <flatland ref={flatlandRef} viewSize={VIEW_SIZE}>
        <defaultLightEffect attach={attachLighting} />

        <tileMap2D data={mapData} position={[-halfExtent, -halfExtent, -100]} />

        <light2D lightType="ambient" color={0x5544aa} intensity={ambient} />
        <light2D
          ref={torchRef}
          lightType="point"
          position={[-halfExtent * 0.5, halfExtent * 0.5, 0]}
          color={0xff6600}
          intensity={1.6}
          distance={140}
          decay={2}
        />
        <light2D
          ref={torch2Ref}
          lightType="point"
          position={[halfExtent * 0.5, halfExtent * 0.5, 0]}
          color={0xffcc44}
          intensity={1.3}
          distance={120}
          decay={2}
        />

        {/* TODO(U1): mount uikit Root here once the TSL panel material
            lands. e.g.
              <root ref={rootRef} args={[renderer, style]} />
            Do NOT do this yet — createPanelMaterial() throws
            `ported in U1/U2` and any panel-bearing component eagerly
            constructs an InstancedPanelGroup, which will throw at
            runtime. */}
      </flatland>
    </>
  )
}

export default function App() {
  const { pane } = usePane()
  const [ambient] = usePaneInput<number>(pane, 'ambient', 0.6, { min: 0, max: 3, step: 0.05 })

  return (
    <Canvas
      dpr={1}
      renderer={{ antialias: false }}
      onCreated={({ gl }) => {
        gl.domElement.style.imageRendering = 'pixelated'
      }}
    >
      <DevtoolsProvider name="uikit-hud" />
      <Suspense fallback={null}>
        <HudScene ambient={ambient} />
      </Suspense>
    </Canvas>
  )
}
