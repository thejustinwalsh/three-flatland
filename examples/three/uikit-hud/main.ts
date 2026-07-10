import { WebGPURenderer } from 'three/webgpu'
import { DataTexture, RGBAFormat, NearestFilter, SRGBColorSpace } from 'three'
import {
  Flatland,
  Light2D,
  TileMap2D,
  createDevtoolsProvider,
  type TileMapData,
  type TilesetData,
  type TileLayerData,
} from 'three-flatland'
import { DefaultLightEffect } from '@three-flatland/presets'
import { createPane } from '@three-flatland/devtools'
import { Container, Fullscreen, Text, withOpacity } from '@three-flatland/uikit'
import type { RenderContext } from '@three-flatland/uikit'
import { ChevronUp } from '@three-flatland/uikit-lucide'
import { SlugFontLoader } from '@three-flatland/slug'
import type { SlugFont } from '@three-flatland/slug'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

// ============================================
// uikit-hud — HUD over the tilemap + Light2D base scene (U4)
//
// U1 (TSL panel material), U2 (Slug text), and U3 (Slug SVG shapes) have all
// landed, so the uikit `Fullscreen` HUD mounts here: a rounded score panel,
// a `Text` readout, and a lucide `Svg` icon — composed with three-flatland's
// own renderer/camera rather than standing alone. See u1.ts/u2.ts/u3.ts for
// the isolated per-feature harnesses this composes.
// ============================================

// Tile IDs for our procedural tileset (copied from examples/three/tilemap)
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

/**
 * A tiny hand-authored room (no BSP generator needed for a HUD demo —
 * we just need floor/walls/decor for Light2D to play against).
 */
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

  // A few decorations to break up the floor visually.
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

async function loadFont(): Promise<SlugFont> {
  return SlugFontLoader.load(`${import.meta.env.BASE_URL}Inter-Regular.ttf`, {
    forceRuntime: true,
  })
}

/* HMR-tracked teardown state. Without this, every dev save accumulates
 * a fresh renderer + animate() loop while the previous one keeps
 * RAFing forever. Dev-only — `import.meta.hot` is undefined in prod. */
let rafId = 0
let activeRenderer: WebGPURenderer | null = null

async function main() {
  // ─── Renderer ───────────────────────────────────────────────────
  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  renderer.domElement.style.imageRendering = 'pixelated'
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  // ─── Flatland ───────────────────────────────────────────────────
  const flatland = new Flatland({
    viewSize: VIEW_SIZE,
    aspect: window.innerWidth / window.innerHeight,
  })
  ;(flatland.scene as unknown as { backgroundNode: unknown }).backgroundNode = gemGradientNode({ gem: GEM })
  flatland.resize(window.innerWidth, window.innerHeight)

  // ─── Lighting ───────────────────────────────────────────────────
  const lightEffect = new DefaultLightEffect()
  flatland.setLighting(lightEffect)

  const ambientLight = new Light2D({ type: 'ambient', color: 0x5544aa, intensity: 0.6 })
  flatland.add(ambientLight)

  const halfExtent = (MAP_SIZE * TILE_SIZE) / 2
  const torchLight = new Light2D({
    type: 'point',
    color: 0xff6600,
    intensity: 1.6,
    distance: 140,
    decay: 2,
    position: [-halfExtent * 0.5, halfExtent * 0.5],
  })
  flatland.add(torchLight)
  const torchLight2 = new Light2D({
    type: 'point',
    color: 0xffcc44,
    intensity: 1.3,
    distance: 120,
    decay: 2,
    position: [halfExtent * 0.5, halfExtent * 0.5],
  })
  flatland.add(torchLight2)

  // ─── Tilemap ────────────────────────────────────────────────────
  const tileset: TilesetData = {
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
  }
  const layers = buildRoomLayers(MAP_SIZE)
  const mapData = createTileMapData(MAP_SIZE, tileset, layers)
  const tilemap = new TileMap2D({ data: mapData })
  tilemap.position.set(-halfExtent, -halfExtent, -100)
  flatland.add(tilemap)
  tilemap.markOccluders(['collision'])

  // ─── uikit HUD ──────────────────────────────────────────────────
  // `Fullscreen` walks its Object3D ancestors looking for a Camera
  // (`searchFor(this, Camera, 2, true)` in fullscreen.ts) to size itself
  // against, so the camera has to be part of the graph `Fullscreen` is
  // rendered in — add it to Flatland's internal scene and hang the HUD
  // root off the camera itself (the same trick the R3F twin's
  // `scene.add(camera)` + `camera.add(fullscreenWrapper)` performs).
  flatland.add(flatland.camera)

  const font = await loadFont()
  // Imperative render loop already runs every frame — uikit's reactive
  // invalidation hook (used by the React twin's `invalidate()`) has nothing
  // to do here, so it's a no-op (same contract as u1.ts/u2.ts/u3.ts).
  const renderContext: RenderContext = { requestFrame: () => {} }

  const hud = new Fullscreen(
    renderer,
    {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      padding: 16,
    },
    undefined,
    { renderContext }
  )

  const scorePanel = new Container({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingX: 14,
    paddingY: 8,
    backgroundColor: withOpacity('#111418', 0.85),
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  })

  const scoreIcon = new ChevronUp({ width: 20, height: 20, fill: '#f5c451' })

  let score = 0
  const scoreText = new Text({
    text: `Score: ${score}`,
    color: 'white',
    fontSize: 20,
    fontFamilies: { inter: { normal: font } },
  })

  scorePanel.add(scoreIcon)
  scorePanel.add(scoreText)
  hud.add(scorePanel)
  flatland.camera.add(hud)

  // ─── Tweakpane UI ───────────────────────────────────────────────
  const { pane, update: updateDevtools } = createPane({ driver: 'manual' })
  const devtools = createDevtoolsProvider({ name: 'uikit-hud' })

  const params = { ambient: 0.6 }
  pane.addBinding(params, 'ambient', { min: 0, max: 3, step: 0.05 }).on('change', (ev) => {
    ambientLight.intensity = ev.value
  })

  // ─── Resize ─────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // ─── Render loop ────────────────────────────────────────────────
  let flickerT = 0
  let scoreT = 0
  let lastTime = performance.now()

  function animate() {
    rafId = requestAnimationFrame(animate)
    const now = performance.now()
    const delta = Math.min(0.1, (now - lastTime) / 1000)
    lastTime = now
    flickerT += delta
    scoreT += delta

    torchLight.intensity = 1.6 * (1 + Math.sin(flickerT * 15) * 0.1)
    torchLight2.intensity = 1.3 * (1 + Math.sin(flickerT * 18 + 1) * 0.1)

    if (scoreT > 1) {
      scoreT -= 1
      score += 10
      scoreText.setProperties({ text: `Score: ${score}` })
    }

    hud.update(delta)

    devtools.beginFrame(performance.now(), renderer)
    flatland.render(renderer)
    devtools.endFrame(renderer)
    updateDevtools()
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
