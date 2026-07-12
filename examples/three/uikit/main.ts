import { WebGPURenderer } from 'three/webgpu'
import { DataTexture, RGBAFormat, NearestFilter, SRGBColorSpace, Object3D } from 'three'
import {
  Flatland,
  Light2D,
  TileMap2D,
  type TileMapData,
  type TilesetData,
  type TileLayerData,
} from 'three-flatland'
import { DefaultLightEffect } from '@three-flatland/presets'
import { createPane } from '@three-flatland/devtools'
import {
  Container,
  Fullscreen,
  Text,
  withOpacity,
  setPreferredColorScheme,
  attachCanvasInputProps,
  setupA11yProjection,
} from '@three-flatland/uikit'
import type { RenderContext, ContainerProperties, TextProperties } from '@three-flatland/uikit'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Input,
  Slider,
  Switch,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Button,
  Progress,
  Label,
  Separator,
  Badge,
} from '@three-flatland/uikit-default'
import { Gamepad2, Zap, Play, X, Save, Volume2, Music, Shield } from '@three-flatland/uikit-lucide'
import { forwardHtmlEvents } from '@pmndrs/pointer-events'
import { SlugFontLoader } from '@three-flatland/slug'
import type { SlugFont } from '@three-flatland/slug'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

// ============================================
// uikit — a fullscreen game front-end over the tilemap + Light2D scene.
//
// The `@three-flatland/uikit-default` (shadcn-flavoured) kit composes a real
// game menu — Tabs, a live text Input, Sliders, a Switch, a Checkbox, a
// RadioGroup, a scrollable save-slot list, Buttons, an animated Progress bar,
// and lucide icons — laid out with flexbox and drawn through Flatland's
// batched, TSL-native pipeline, sitting over the same lit dungeon room as the
// tilemap example. Pointer events reach the UI through `forwardHtmlEvents`, so
// the Input actually accepts typing and the buttons hover / press.
// ============================================

// The shadcn kit resolves its palette through uikit's color-scheme signal —
// pin dark so the menu reads the same on every tester's machine instead of
// following the system scheme.
setPreferredColorScheme('dark')

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
 * A tiny hand-authored room (no BSP generator needed for a UI demo —
 * we just need floor/walls/decor for Light2D to play against).
 */
function buildRoomLayers(size: number): {
  ground: Uint32Array
  walls: Uint32Array
  decor: Uint32Array
} {
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

function createTileMapData(
  size: number,
  tileset: TilesetData,
  layers: ReturnType<typeof buildRoomLayers>
): TileMapData {
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
  return SlugFontLoader.load('./Inter-Regular.ttf', {
    forceRuntime: true,
  })
}

// ─── Small tree helpers ─────────────────────────────────────────────
// The React twin expresses the same tree in JSX; these keep the vanilla
// tree readable and 1:1 with it.
function row(props: ContainerProperties, ...children: Object3D[]): Container {
  const c = new Container({ flexDirection: 'row', ...props })
  for (const ch of children) c.add(ch)
  return c
}
function col(props: ContainerProperties, ...children: Object3D[]): Container {
  const c = new Container({ flexDirection: 'column', ...props })
  for (const ch of children) c.add(ch)
  return c
}
function text(value: string, props?: TextProperties): Text {
  return new Text({ text: value, ...props })
}
/** A shadcn `Label` wrapping a single line of text. */
function labeled(value: string): Label {
  const l = new Label()
  l.add(new Text({ text: value }))
  return l
}

const PANEL_BG = withOpacity('#0d0f13', 0.94)
const AMETHYST = '#995bff'
const WHITE = '#f5f6fa'
const MUTED = '#8b8f9a'

/** Threshold color for the stamina bar — reads like a game health gauge. */
function staminaColor(pct: number): string {
  if (pct > 55) return '#00c38b'
  if (pct > 25) return '#d29a00'
  return '#eb3c67'
}

/** Realtime nodes the render loop mutates each frame. */
interface Realtime {
  fps: Text
  credits: Text
  staminaFill: Container
  staminaPct: Text
  loadBar: Progress
  loadPct: Text
  /** The menu card. Anchored by `anchorMenu` so tab switches never move it. */
  panel: Container
}

/** Padding on the fullscreen root, in px. Subtracted from the anchor's available height. */
const ROOT_PADDING = 24

/**
 * Pin the menu card's top edge instead of centring it every frame.
 *
 * `justifyContent: 'center'` re-centres the card whenever its height changes, so
 * switching to a taller tab slides the tab strip out from under the pointer. We
 * centre once, against the height of the *first* laid-out frame, then hold that
 * top edge and let taller tabs grow downward.
 *
 * The captured height is deliberately the initial one: recomputing it per tab
 * would reintroduce the shift it exists to prevent.
 */
function createMenuAnchor(ui: Fullscreen, panel: Container): () => void {
  let initialCardHeight: number | undefined
  let appliedTop: number | undefined

  return () => {
    const rootSize = ui.size.peek()
    const cardSize = panel.size.peek()
    if (rootSize == null || cardSize == null) return

    // Layout has not settled on the first frames; a zero height would anchor to the top.
    if (initialCardHeight == null) {
      if (cardSize[1] <= 0) return
      initialCardHeight = cardSize[1]
    }

    const available = rootSize[1] - ROOT_PADDING * 2
    const top = Math.max(0, (available - initialCardHeight) / 2)
    // Re-runs on resize; a no-op while the viewport is stable.
    if (top === appliedTop) return
    appliedTop = top
    panel.setProperties({ marginTop: top })
  }
}

const SAVE_SLOTS: Array<{ name: string; stamp: string; level: string }> = [
  { name: 'The Sunken Crypt', stamp: 'Autosave · 2m ago', level: 'Lv 12' },
  { name: 'Ashfall Barrows', stamp: 'Manual · 1h ago', level: 'Lv 11' },
  { name: 'Gloomreach Vault', stamp: 'Manual · 3h ago', level: 'Lv 9' },
  { name: 'The Hollow Spire', stamp: 'Autosave · yesterday', level: 'Lv 8' },
  { name: 'Emberdeep Mines', stamp: 'Manual · 2d ago', level: 'Lv 6' },
  { name: 'Frostgate Keep', stamp: 'Manual · 4d ago', level: 'Lv 4' },
  { name: 'The Pale Warren', stamp: 'Autosave · 1w ago', level: 'Lv 2' },
]

/* HMR-tracked teardown state. Without this, every dev save accumulates
 * a fresh renderer + animate() loop while the previous one keeps
 * RAFing forever. Dev-only — `import.meta.hot` is undefined in prod. */
let rafId = 0
let activeRenderer: WebGPURenderer | null = null
let activePointerEvents: { destroy: () => void } | null = null
let activeDisposeA11yProjection: (() => void) | null = null

async function main() {
  // ─── Renderer ───────────────────────────────────────────────────
  // Native device pixel ratio, NOT `setPixelRatio(1)` + `image-rendering:
  // pixelated`. That pair renders the whole framebuffer at 1x and nearest-
  // upscales it — which pixelates Slug's analytic text along with everything
  // else, defeating the entire point of resolution-independent glyphs. The
  // tilemap stays chunky regardless of canvas resolution because its tileset is
  // NearestFilter-sampled from a 64x64 texture (Flatland's `TextureConfig`
  // defaults to 'pixel-art'). Texture filtering is the right lever for pixel
  // art; canvas downscaling is not — never reach for it when UI text shares the
  // frame.
  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  // ─── Flatland ───────────────────────────────────────────────────
  const flatland = new Flatland({
    viewSize: VIEW_SIZE,
    aspect: window.innerWidth / window.innerHeight,
  })
  ;(flatland.scene as unknown as { backgroundNode: unknown }).backgroundNode = gemGradientNode({
    gem: GEM,
  })
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

  // ─── uikit game front-end ───────────────────────────────────────
  // `Fullscreen` walks its Object3D ancestors looking for a Camera
  // (`searchFor(this, Camera, 2, true)` in fullscreen.ts) to size itself
  // against, so the camera has to be part of the graph `Fullscreen` is
  // rendered in — add it to Flatland's internal scene and hang the UI root
  // off the camera itself (mirrors the R3F twin's `scene.add(camera)` +
  // `camera.add(fullscreenWrapper)`).
  flatland.add(flatland.camera)

  const font = await loadFont()
  // Imperative render loop already runs every frame — uikit's reactive
  // invalidation hook (used by the React twin's `invalidate()`) has nothing
  // to do here, so it's a no-op.
  const renderContext: RenderContext = { requestFrame: () => {} }

  const ui = new Fullscreen(
    renderer,
    {
      flexDirection: 'column',
      // Top-anchored, not centred: `createMenuAnchor` supplies the card's
      // marginTop once, so a taller tab grows downward instead of shoving the
      // tab strip out from under the pointer.
      justifyContent: 'flex-start',
      alignItems: 'center',
      padding: ROOT_PADDING,
      // Inherited by every descendant Text / kit component.
      fontFamilies: { inter: { normal: font } },
    },
    undefined,
    { renderContext }
  )

  const rt = buildMenu(ui)
  const anchorMenu = createMenuAnchor(ui, rt.panel)
  flatland.camera.add(ui)

  // ─── Accessibility projection ────────────────────────────────────
  // The React twin wires this up for free — `build.tsx`'s root binding calls
  // `setupA11yProjection` itself inside a `useEffect` once `camera` + `renderer`
  // are known. Vanilla three has no such lifecycle to hook, so the example must
  // call it explicitly, once the root uikit component, camera, and renderer all
  // exist. It re-projects every hidden a11y DOM element under `ui` onto its
  // panel's on-screen rect each frame, so screen readers / tab focus / switch
  // access hit-test the real, currently-visible location instead of an
  // off-screen fallback.
  activeDisposeA11yProjection = setupA11yProjection(ui, { camera: flatland.camera, renderer })

  // ─── Pointer events ─────────────────────────────────────────────
  // Vanilla three has no built-in raycast / event routing. `forwardHtmlEvents`
  // (@pmndrs/pointer-events — uikit's own event source) forwards DOM pointer +
  // wheel events into Flatland's internal scene using Flatland's camera, so
  // the Input focuses + types, buttons hover / press, sliders drag, and the
  // save-slot list scrolls. `update()` runs once per frame below.
  // `batchEvents: false` is load-bearing, not a tuning knob. At its default (`true`)
  // forwardHtmlEvents queues events and dispatches them from `update()` at frame
  // time, so the `Input` claims a pointer-down a frame *after* the browser already
  // blurred the hidden field — `attachCanvasInputProps` then finds nothing to
  // protect, and the field renders a caret while accepting no keystrokes.
  const flatlandScene = (flatland as unknown as { scene: Object3D }).scene
  const { update: updatePointerEvents, destroy: destroyPointerEvents } = forwardHtmlEvents(
    renderer.domElement,
    flatland.camera,
    flatlandScene,
    { batchEvents: false }
  )
  // Must follow forwardHtmlEvents: listeners fire in registration order, so the
  // component claims the event before this guard reads the claim.
  const detachCanvasInputProps = attachCanvasInputProps(renderer.domElement)
  activePointerEvents = {
    destroy: () => {
      detachCanvasInputProps()
      destroyPointerEvents()
    },
  }

  // ─── Tweakpane UI ───────────────────────────────────────────────
  // No manual `createDevtoolsProvider` here: `Flatland` owns its own provider
  // and brackets every internal pass with beginFrame/endFrame, which is what
  // keeps GPU-timestamp tracking correct across its multi-pass render. A second
  // provider on the same renderer fights it over `backend.trackTimestamp` and
  // the GPU graph goes blank — see examples/three/lighting, which drives
  // `flatland.render()` with no provider of its own.
  const { pane, update: updateDevtools } = createPane({ driver: 'manual' })

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
  let creditsT = 0
  let elapsed = 0
  let fpsAccum = 0
  let fpsFrames = 0
  let credits = 1280
  let lastTime = performance.now()

  function animate() {
    rafId = requestAnimationFrame(animate)
    const now = performance.now()
    const delta = Math.min(0.1, (now - lastTime) / 1000)
    lastTime = now
    flickerT += delta
    creditsT += delta
    elapsed += delta

    torchLight.intensity = 1.6 * (1 + Math.sin(flickerT * 15) * 0.1)
    torchLight2.intensity = 1.3 * (1 + Math.sin(flickerT * 18 + 1) * 0.1)

    // Realtime: FPS (smoothed over ~0.5s), ticking credits, oscillating
    // stamina bar, looping loading progress.
    fpsAccum += delta
    fpsFrames += 1
    if (fpsAccum >= 0.5) {
      rt.fps.setProperties({ text: `${Math.round(fpsFrames / fpsAccum)} FPS` })
      fpsAccum = 0
      fpsFrames = 0
    }
    if (creditsT > 1) {
      creditsT -= 1
      credits += 7
      rt.credits.setProperties({ text: `${credits}` })
    }
    const stamina = 50 + Math.sin(elapsed * 0.9) * 45
    rt.staminaFill.setProperties({ width: `${stamina}%`, backgroundColor: staminaColor(stamina) })
    rt.staminaPct.setProperties({ text: `${Math.round(stamina)}%` })
    const load = (elapsed * 12) % 100
    rt.loadBar.setProperties({ value: load })
    rt.loadPct.setProperties({ text: `${Math.round(load)}%` })

    updatePointerEvents()
    // uikit wants milliseconds — scroll velocity is px/ms (the React twin's
    // wrapper passes `delta * 1000` for the same reason).
    ui.update(delta * 1000)
    // After layout, so the card's measured height is this frame's.
    anchorMenu()

    // Flatland instruments its own frame internally — no beginFrame/endFrame here.
    flatland.render(renderer)
    updateDevtools()
  }

  animate()
}

/**
 * Build the game menu into `ui` and return the nodes the render loop
 * animates. The tree here is 1:1 with the React twin's JSX.
 */
function buildMenu(ui: Fullscreen): Realtime {
  // Text inside kit components (Badge / Button) inherits the kit's own
  // foreground color; only text sitting directly on the dark panel is
  // tinted explicitly (WHITE / MUTED / AMETHYST).
  const fps = text('— FPS', { fontSize: 12 })
  const credits = text('1280', { fontSize: 13, fontWeight: 'semi-bold' })
  const staminaPct = text('50%', { color: MUTED, fontSize: 12 })
  const loadPct = text('0%', { color: MUTED, fontSize: 12 })

  // Header: title block + live badges.
  const fpsBadge = new Badge({ variant: 'secondary' })
  fpsBadge.add(fps)
  const creditsBadge = new Badge({
    variant: 'default',
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  })
  creditsBadge.add(new Zap({ width: 12, height: 12 }), credits)

  const header = row(
    { justifyContent: 'space-between', alignItems: 'center', width: '100%' },
    row(
      { gap: 10, alignItems: 'center' },
      new Gamepad2({ width: 26, height: 26, color: AMETHYST }),
      col(
        { gap: 2 },
        text('CRYPT RAIDER', { color: WHITE, fontSize: 20, fontWeight: 'bold' }),
        text('front-end demo', { color: MUTED, fontSize: 11 })
      )
    ),
    row({ gap: 8, alignItems: 'center' }, fpsBadge, creditsBadge)
  )

  // ── Play tab ──────────────────────────────────────────────────
  const nameInput = new Input({
    placeholder: 'Enter your name',
    defaultValue: 'Ranger',
    fontSize: 14,
    width: '100%',
    ariaLabel: 'Player Name',
  })

  const difficulty = new RadioGroup({
    defaultValue: 'normal',
    flexDirection: 'row',
    gap: 16,
    ariaLabel: 'Difficulty',
  })
  difficulty.add(
    radioOption('easy', 'Easy'),
    radioOption('normal', 'Normal'),
    radioOption('hardcore', 'Hardcore')
  )

  const staminaFill = new Container({
    height: '100%',
    width: '50%',
    borderRadius: 999,
    backgroundColor: staminaColor(50),
  })
  const staminaBar = new Container({
    height: 10,
    width: '100%',
    borderRadius: 999,
    backgroundColor: withOpacity('white', 0.12),
  })
  staminaBar.add(staminaFill)

  const playTab = new TabsContent({ value: 'play', flexDirection: 'column', gap: 14 })
  playTab.add(
    col({ gap: 6 }, labeled('Player Name'), nameInput),
    col({ gap: 8 }, labeled('Difficulty'), difficulty),
    col(
      { gap: 6 },
      row(
        { justifyContent: 'space-between', alignItems: 'center' },
        labeled('Stamina'),
        staminaPct
      ),
      staminaBar
    )
  )

  // ── Loadout tab: a scrollable list proving per-instance clipping ──
  const slots = col(
    {
      height: 168,
      width: '100%',
      overflow: 'scroll',
      gap: 8,
      backgroundColor: withOpacity('black', 0.25),
      borderRadius: 10,
      padding: 8,
    },
    ...SAVE_SLOTS.map((slot) => {
      const badge = new Badge({ variant: 'secondary' })
      badge.add(text(slot.level, { fontSize: 12 }))
      return row(
        {
          gap: 10,
          alignItems: 'center',
          padding: 8,
          borderRadius: 8,
          backgroundColor: withOpacity('white', 0.04),
          flexShrink: 0,
        },
        new Save({ width: 18, height: 18, color: AMETHYST }),
        col(
          { gap: 2, flexGrow: 1 },
          text(slot.name, { color: WHITE, fontSize: 14 }),
          text(slot.stamp, { color: MUTED, fontSize: 11 })
        ),
        badge
      )
    })
  )

  const loadoutTab = new TabsContent({ value: 'loadout', flexDirection: 'column', gap: 8 })
  loadoutTab.add(
    row(
      { gap: 8, alignItems: 'center' },
      new Shield({ width: 16, height: 16, color: MUTED }),
      labeled('Save Slots')
    ),
    slots
  )

  // ── Settings tab ──────────────────────────────────────────────
  const masterValue = text('70', { color: MUTED, fontSize: 12 })
  const musicValue = text('45', { color: MUTED, fontSize: 12 })
  const masterSlider = new Slider({
    defaultValue: 70,
    min: 0,
    max: 100,
    step: 1,
    onValueChange: (v) => masterValue.setProperties({ text: `${v}` }),
    ariaLabel: 'Master Volume',
  })
  const musicSlider = new Slider({
    defaultValue: 45,
    min: 0,
    max: 100,
    step: 1,
    onValueChange: (v) => musicValue.setProperties({ text: `${v}` }),
    ariaLabel: 'Music Volume',
  })

  const settingsTab = new TabsContent({ value: 'settings', flexDirection: 'column', gap: 16 })
  settingsTab.add(
    col(
      { gap: 6 },
      row(
        { justifyContent: 'space-between', alignItems: 'center' },
        row(
          { gap: 8, alignItems: 'center' },
          new Volume2({ width: 16, height: 16, color: MUTED }),
          labeled('Master Volume')
        ),
        masterValue
      ),
      masterSlider
    ),
    col(
      { gap: 6 },
      row(
        { justifyContent: 'space-between', alignItems: 'center' },
        row(
          { gap: 8, alignItems: 'center' },
          new Music({ width: 16, height: 16, color: MUTED }),
          labeled('Music Volume')
        ),
        musicValue
      ),
      musicSlider
    ),
    row(
      { justifyContent: 'space-between', alignItems: 'center' },
      labeled('Fullscreen'),
      new Switch({ defaultChecked: true, ariaLabel: 'Fullscreen' })
    ),
    row(
      { gap: 10, alignItems: 'center' },
      new Checkbox({ defaultChecked: true, ariaLabel: 'V-Sync' }),
      labeled('V-Sync')
    )
  )

  // ── Tabs shell ────────────────────────────────────────────────
  const tabs = new Tabs({ defaultValue: 'play' })
  const tabsList = new TabsList({ width: '100%' })
  tabsList.add(
    tabTrigger('play', 'Play'),
    tabTrigger('loadout', 'Loadout'),
    tabTrigger('settings', 'Settings')
  )
  tabs.add(tabsList, playTab, loadoutTab, settingsTab)

  // ── Footer: loading bar + primary / secondary buttons ─────────
  const loadBar = new Progress({ value: 0 })
  const footer = col(
    { gap: 6, width: '100%' },
    row(
      { justifyContent: 'space-between', alignItems: 'center' },
      text('Loading assets', { color: MUTED, fontSize: 12 }),
      loadPct
    ),
    loadBar
  )

  // `active` (pressed) restyles flow through getStarProperties — a visible
  // press-down is both game-feel and a regression guard for that path.
  const playButton = new Button({
    gap: 8,
    flexGrow: 1,
    active: { transformTranslateY: 1, opacity: 0.85 },
    ariaLabel: 'Play',
  })
  playButton.add(new Play({ width: 16, height: 16 }), new Text({ text: 'Play' }))
  const quitButton = new Button({
    variant: 'secondary',
    gap: 8,
    flexGrow: 1,
    active: { transformTranslateY: 1, opacity: 0.85 },
    ariaLabel: 'Quit',
  })
  quitButton.add(new X({ width: 16, height: 16 }), new Text({ text: 'Quit' }))
  const buttons = row({ gap: 12, width: '100%' }, playButton, quitButton)

  // ── Panel ─────────────────────────────────────────────────────
  const panel = col(
    {
      width: 480,
      maxWidth: '92%',
      gap: 16,
      padding: 24,
      backgroundColor: PANEL_BG,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: withOpacity(AMETHYST, 0.4),
    },
    header,
    new Separator(),
    tabs,
    new Separator(),
    footer,
    buttons
  )
  ui.add(panel)

  return { fps, credits, staminaFill, staminaPct, loadBar, loadPct, panel }
}

function radioOption(value: string, label: string): RadioGroupItem {
  const item = new RadioGroupItem({ value, ariaLabel: label })
  item.add(new Text({ text: label, color: WHITE, fontSize: 14 }))
  return item
}

function tabTrigger(value: string, label: string): TabsTrigger {
  const trigger = new TabsTrigger({ value, flexGrow: 1, ariaLabel: `${label} tab` })
  trigger.add(new Text({ text: label }))
  return trigger
}

main()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (activePointerEvents) {
      activePointerEvents.destroy()
      activePointerEvents = null
    }
    if (activeDisposeA11yProjection) {
      activeDisposeA11yProjection()
      activeDisposeA11yProjection = null
    }
    if (activeRenderer) {
      activeRenderer.dispose?.()
      activeRenderer.domElement.remove()
      activeRenderer = null
    }
  })
}
