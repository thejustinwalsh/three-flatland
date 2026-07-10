import { Suspense, useEffect, useMemo, useRef, useLayoutEffect, useState } from 'react'
import { Canvas, createPortal, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import {
  DataTexture,
  RGBAFormat,
  NearestFilter,
  SRGBColorSpace,
  Object3D,
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
import {
  Container,
  Text,
  VanillaFullscreen,
  VanillaText,
  VanillaContainer,
  withOpacity,
  setPreferredColorScheme,
  useRenderContext,
  useSetup,
  canvasInputProps,
  type FullscreenProperties,
} from '@three-flatland/uikit/react'
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
  VanillaProgress,
  Label,
  Separator,
  Badge,
} from '@three-flatland/uikit-default/react'
import {
  Gamepad2,
  Zap,
  Play,
  X,
  Save,
  Volume2,
  Music,
  Shield,
} from '@three-flatland/uikit-lucide/react'
import { SlugFontLoader } from '@three-flatland/slug/react'
import type { SlugFont } from '@three-flatland/slug'
import { suspend } from 'suspend-react'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

extend({ Flatland, Light2D, TileMap2D, DefaultLightEffect, VanillaFullscreen })

// The shadcn kit resolves its palette through uikit's color-scheme signal —
// pin dark so the menu reads the same on every tester's machine instead of
// following the system scheme.
setPreferredColorScheme('dark')

// ============================================
// uikit — a fullscreen game front-end over the tilemap + Light2D scene.
//
// The `@three-flatland/uikit-default` (shadcn-flavoured) kit composes a real
// game menu — Tabs, a live text Input, Sliders, a Switch, a Checkbox, a
// RadioGroup, a scrollable save-slot list, Buttons, an animated Progress bar,
// and lucide icons — laid out with flexbox and drawn through Flatland's
// batched, TSL-native pipeline, sitting over the same lit dungeon room as the
// tilemap example. This is the React twin of examples/three/uikit; the two
// render the same UI.
//
// `<Fullscreen>` from `@three-flatland/uikit/react` targets R3F's OWN default
// scene/camera. Flatland renders its *internal* scene/camera explicitly (the
// `'render'`-phase useFrame below), so a UI parented to R3F's default camera
// would silently never draw. `HudFullscreen` reimplements the createPortal
// trick but targets Flatland's own camera — mirrors the vanilla twin's
// `flatland.add(flatland.camera); flatland.camera.add(ui)`.
// ============================================

function HudFullscreen({
  camera,
  children,
  ...props
}: FullscreenProperties & { camera: ThreeOrthographicCamera }) {
  const renderer = useThree((s) => s.gl)
  const renderContext = useRenderContext()
  const ref = useRef<VanillaFullscreen>(null)
  const args = useMemo(
    () => [renderer, props, undefined, { renderContext }],
    // `props` intentionally excluded — see build.tsx's identical note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderer, renderContext]
  )
  const outProps = useSetup(ref, props, args)
  // `camera` in the portal state is what makes R3F's native events work here, and
  // it is why this twin needs no event package at all. R3F raycasts its interaction
  // registry — an Object3D list, not a scene graph (fiber dist/index.mjs:648) — but
  // it takes the ray from `getRootState(object).camera`, i.e. the *portal's* state.
  // A portal snapshots its state at creation, so mutating the root store's camera
  // later never reaches it. Scoping the camera here leaves R3F's own camera alone.
  //
  // `injectScene: false` is load-bearing too: R3F v10's Portal otherwise inserts an
  // intermediate `Scene` between the camera and the UI, and under <StrictMode> its
  // cleanup-only layout effect removes + disposes that scene on the dev double-invoke
  // without re-adding it — orphaning the UI so `Fullscreen.update()`'s camera search
  // throws and unmounts the Canvas.
  return createPortal(
    <vanillaFullscreen {...outProps} ref={ref}>
      {children}
    </vanillaFullscreen>,
    camera,
    { injectScene: false, camera }
  )
}

function useSlugFont(url: string): SlugFont {
  return suspend(() => SlugFontLoader.load(url, { forceRuntime: true }), [url, 'uikit-font'])
}

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

const PANEL_BG = withOpacity('#0d0f13', 0.94)
const AMETHYST = '#995bff'
const WHITE = '#f5f6fa'
const MUTED = '#8b8f9a'

const SAVE_SLOTS: Array<{ name: string; stamp: string; level: string }> = [
  { name: 'The Sunken Crypt', stamp: 'Autosave · 2m ago', level: 'Lv 12' },
  { name: 'Ashfall Barrows', stamp: 'Manual · 1h ago', level: 'Lv 11' },
  { name: 'Gloomreach Vault', stamp: 'Manual · 3h ago', level: 'Lv 9' },
  { name: 'The Hollow Spire', stamp: 'Autosave · yesterday', level: 'Lv 8' },
  { name: 'Emberdeep Mines', stamp: 'Manual · 2d ago', level: 'Lv 6' },
  { name: 'Frostgate Keep', stamp: 'Manual · 4d ago', level: 'Lv 4' },
  { name: 'The Pale Warren', stamp: 'Autosave · 1w ago', level: 'Lv 2' },
]

/** Threshold color for the stamina bar — reads like a game health gauge. */
function staminaColor(pct: number): string {
  if (pct > 55) return '#00c38b'
  if (pct > 25) return '#d29a00'
  return '#eb3c67'
}

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

/**
 * R3F's own orthographic camera, matching Flatland's frustum.
 *
 * Flatland renders its internal scene with its own camera, but R3F still needs one
 * for its default scene and for `useThree(s => s.camera)` consumers. The UI's events
 * do not come from here — `HudFullscreen` scopes Flatland's camera into its portal.
 */
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

/** A shadcn `Label` wrapping a single line of text. */
function Labeled({ children }: { children: string }) {
  return (
    <Label>
      <Text>{children}</Text>
    </Label>
  )
}

function GameMenu({ font }: { font: SlugFont }) {
  // Text inside kit components (Badge / Button) inherits the kit's own
  // foreground color; only text on the dark panel is tinted explicitly.
  const fpsRef = useRef<VanillaText>(null)
  const creditsRef = useRef<VanillaText>(null)
  const staminaFillRef = useRef<VanillaContainer>(null)
  const staminaPctRef = useRef<VanillaText>(null)
  const loadBarRef = useRef<VanillaProgress>(null)
  const loadPctRef = useRef<VanillaText>(null)
  const masterValueRef = useRef<VanillaText>(null)
  const musicValueRef = useRef<VanillaText>(null)

  // Realtime clocks. Held in refs so realtime updates never re-render the
  // tree (which would clobber imperative text via useSetup's resetProperties).
  const elapsed = useRef(0)
  const creditsT = useRef(0)
  const credits = useRef(1280)
  const fpsAccum = useRef(0)
  const fpsFrames = useRef(0)

  useFrame((_, rawDelta) => {
    const delta = Math.min(0.1, rawDelta)
    elapsed.current += delta
    creditsT.current += delta

    fpsAccum.current += delta
    fpsFrames.current += 1
    if (fpsAccum.current >= 0.5) {
      fpsRef.current?.setProperties({
        text: `${Math.round(fpsFrames.current / fpsAccum.current)} FPS`,
      })
      fpsAccum.current = 0
      fpsFrames.current = 0
    }
    if (creditsT.current > 1) {
      creditsT.current -= 1
      credits.current += 7
      creditsRef.current?.setProperties({ text: `${credits.current}` })
    }
    const stamina = 50 + Math.sin(elapsed.current * 0.9) * 45
    staminaFillRef.current?.setProperties({
      width: `${stamina}%`,
      backgroundColor: staminaColor(stamina),
    })
    staminaPctRef.current?.setProperties({ text: `${Math.round(stamina)}%` })
    const load = (elapsed.current * 12) % 100
    loadBarRef.current?.setProperties({ value: load })
    loadPctRef.current?.setProperties({ text: `${Math.round(load)}%` })
  })

  return (
    <Container
      width={480}
      maxWidth="92%"
      flexDirection="column"
      gap={16}
      padding={24}
      backgroundColor={PANEL_BG}
      borderRadius={16}
      borderWidth={1}
      borderColor={withOpacity(AMETHYST, 0.4)}
      fontFamilies={{ inter: { normal: font } }}
    >
      {/* Header */}
      <Container
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        width="100%"
      >
        <Container flexDirection="row" gap={10} alignItems="center">
          <Gamepad2 width={26} height={26} color={AMETHYST} />
          <Container flexDirection="column" gap={2}>
            <Text color={WHITE} fontSize={20} fontWeight="bold">
              CRYPT RAIDER
            </Text>
            <Text color={MUTED} fontSize={11}>
              front-end demo
            </Text>
          </Container>
        </Container>
        <Container flexDirection="row" gap={8} alignItems="center">
          <Badge variant="secondary">
            <Text ref={fpsRef} fontSize={12}>
              — FPS
            </Text>
          </Badge>
          <Badge variant="default" flexDirection="row" gap={4} alignItems="center">
            <Zap width={12} height={12} />
            <Text ref={creditsRef} fontSize={13} fontWeight="semi-bold">
              1280
            </Text>
          </Badge>
        </Container>
      </Container>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="play">
        <TabsList width="100%">
          <TabsTrigger value="play" flexGrow={1}>
            <Text>Play</Text>
          </TabsTrigger>
          <TabsTrigger value="loadout" flexGrow={1}>
            <Text>Loadout</Text>
          </TabsTrigger>
          <TabsTrigger value="settings" flexGrow={1}>
            <Text>Settings</Text>
          </TabsTrigger>
        </TabsList>

        {/* Play */}
        <TabsContent value="play" flexDirection="column" gap={14}>
          <Container flexDirection="column" gap={6}>
            <Labeled>Player Name</Labeled>
            <Input placeholder="Enter your name" defaultValue="Ranger" fontSize={14} width="100%" />
          </Container>
          <Container flexDirection="column" gap={8}>
            <Labeled>Difficulty</Labeled>
            <RadioGroup defaultValue="normal" flexDirection="row" gap={16}>
              <RadioGroupItem value="easy">
                <Text color={WHITE} fontSize={14}>
                  Easy
                </Text>
              </RadioGroupItem>
              <RadioGroupItem value="normal">
                <Text color={WHITE} fontSize={14}>
                  Normal
                </Text>
              </RadioGroupItem>
              <RadioGroupItem value="hardcore">
                <Text color={WHITE} fontSize={14}>
                  Hardcore
                </Text>
              </RadioGroupItem>
            </RadioGroup>
          </Container>
          <Container flexDirection="column" gap={6}>
            <Container flexDirection="row" justifyContent="space-between" alignItems="center">
              <Labeled>Stamina</Labeled>
              <Text ref={staminaPctRef} color={MUTED} fontSize={12}>
                50%
              </Text>
            </Container>
            <Container
              height={10}
              width="100%"
              borderRadius={999}
              backgroundColor={withOpacity('white', 0.12)}
            >
              <Container
                ref={staminaFillRef}
                height="100%"
                width="50%"
                borderRadius={999}
                backgroundColor={staminaColor(50)}
              />
            </Container>
          </Container>
        </TabsContent>

        {/* Loadout: scrollable list proves per-instance clipping */}
        <TabsContent value="loadout" flexDirection="column" gap={8}>
          <Container flexDirection="row" gap={8} alignItems="center">
            <Shield width={16} height={16} color={MUTED} />
            <Labeled>Save Slots</Labeled>
          </Container>
          <Container
            height={168}
            width="100%"
            overflow="scroll"
            flexDirection="column"
            gap={8}
            backgroundColor={withOpacity('black', 0.25)}
            borderRadius={10}
            padding={8}
          >
            {SAVE_SLOTS.map((slot) => (
              <Container
                key={slot.name}
                flexDirection="row"
                gap={10}
                alignItems="center"
                padding={8}
                borderRadius={8}
                backgroundColor={withOpacity('white', 0.04)}
                flexShrink={0}
              >
                <Save width={18} height={18} color={AMETHYST} />
                <Container flexDirection="column" gap={2} flexGrow={1}>
                  <Text color={WHITE} fontSize={14}>
                    {slot.name}
                  </Text>
                  <Text color={MUTED} fontSize={11}>
                    {slot.stamp}
                  </Text>
                </Container>
                <Badge variant="secondary">
                  <Text fontSize={12}>{slot.level}</Text>
                </Badge>
              </Container>
            ))}
          </Container>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" flexDirection="column" gap={16}>
          <Container flexDirection="column" gap={6}>
            <Container flexDirection="row" justifyContent="space-between" alignItems="center">
              <Container flexDirection="row" gap={8} alignItems="center">
                <Volume2 width={16} height={16} color={MUTED} />
                <Labeled>Master Volume</Labeled>
              </Container>
              <Text ref={masterValueRef} color={MUTED} fontSize={12}>
                70
              </Text>
            </Container>
            <Slider
              defaultValue={70}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => masterValueRef.current?.setProperties({ text: `${v}` })}
            />
          </Container>
          <Container flexDirection="column" gap={6}>
            <Container flexDirection="row" justifyContent="space-between" alignItems="center">
              <Container flexDirection="row" gap={8} alignItems="center">
                <Music width={16} height={16} color={MUTED} />
                <Labeled>Music Volume</Labeled>
              </Container>
              <Text ref={musicValueRef} color={MUTED} fontSize={12}>
                45
              </Text>
            </Container>
            <Slider
              defaultValue={45}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => musicValueRef.current?.setProperties({ text: `${v}` })}
            />
          </Container>
          <Container flexDirection="row" justifyContent="space-between" alignItems="center">
            <Labeled>Fullscreen</Labeled>
            <Switch defaultChecked={true} />
          </Container>
          <Container flexDirection="row" gap={10} alignItems="center">
            <Checkbox defaultChecked={true} />
            <Labeled>V-Sync</Labeled>
          </Container>
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Footer: loading bar */}
      <Container flexDirection="column" gap={6} width="100%">
        <Container flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text color={MUTED} fontSize={12}>
            Loading assets
          </Text>
          <Text ref={loadPctRef} color={MUTED} fontSize={12}>
            0%
          </Text>
        </Container>
        <Progress ref={loadBarRef} value={0} />
      </Container>

      {/* Buttons. `active` (pressed) restyles flow through getStarProperties —
          a visible press-down is both game-feel and a regression guard for
          that path. */}
      <Container flexDirection="row" gap={12} width="100%">
        <Button gap={8} flexGrow={1} active={{ transformTranslateY: 1, opacity: 0.85 }}>
          <Play width={16} height={16} />
          <Text>Play</Text>
        </Button>
        <Button
          variant="secondary"
          gap={8}
          flexGrow={1}
          active={{ transformTranslateY: 1, opacity: 0.85 }}
        >
          <X width={16} height={16} />
          <Text>Quit</Text>
        </Button>
      </Container>
    </Container>
  )
}

function GameScene({ ambient }: { ambient: number }) {
  const { gl } = useThree()
  const flatlandRef = useRef<Flatland>(null)
  const torchRef = useRef<Light2D>(null)
  const torch2Ref = useRef<Light2D>(null)
  const flickerT = useRef(0)
  const [flatlandCamera, setFlatlandCamera] = useState<ThreeOrthographicCamera | null>(null)
  const font = useSlugFont('./Inter-Regular.ttf')

  const halfExtent = (MAP_SIZE * TILE_SIZE) / 2

  const tileset = useMemo<TilesetData>(
    () => ({
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
    }),
    []
  )

  const mapData = useMemo(() => {
    const layers = buildRoomLayers(MAP_SIZE)
    return createTileMapData(MAP_SIZE, tileset, layers)
  }, [tileset])

  // Gem-tinted backdrop lives on Flatland's *internal* scene, not the
  // R3F default scene — <GemBackground> (which targets the default scene)
  // doesn't apply here, so we set backgroundNode directly.
  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return
    const node = gemGradientNode({ gem: GEM })
    const scene = (flatland as unknown as { scene: { backgroundNode: unknown } }).scene
    scene.backgroundNode = node
  }, [])

  // Flatland renders its OWN internal scene/camera explicitly (see the
  // `'render'`-phase useFrame below) — the UI needs its camera to be part of
  // THAT scene graph, not R3F's default one. `flatlandCamera` feeds
  // `<HudFullscreen>`.
  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return
    flatland.add(flatland.camera)
    setFlatlandCamera(flatland.camera)
  }, [])

  // R3F needs no extra event package — that is the whole point of the React
  // binding. It raycasts its *interaction registry* (an Object3D list every
  // component with handlers is pushed onto), not a scene graph, so the
  // flatland-camera-portalled UI is already reachable. What it needs is for the
  // ray to originate from the camera the UI is parented to.
  //
  // ray to originate from the camera the UI is parented to. `HudFullscreen` scopes
  // Flatland's camera into the portal's own state, which is where the ray is taken
  // from — mutating the root store's camera would never reach it, because a portal
  // snapshots its state at creation.
  //
  // Do NOT wire `forwardHtmlEvents` here. uikit's React layer publishes its handlers
  // as JSX props, so those objects sit in R3F's registry regardless; a second event
  // source dispatches every pointer event twice, through two different cameras.

  useFrame((_, rawDelta) => {
    flickerT.current += rawDelta
    if (torchRef.current) {
      torchRef.current.intensity = 1.6 * (1 + Math.sin(flickerT.current * 15) * 0.1)
    }
    if (torch2Ref.current) {
      torch2Ref.current.intensity = 1.3 * (1 + Math.sin(flickerT.current * 18 + 1) * 0.1)
    }
  })

  useFrame(
    () => {
      flatlandRef.current?.render(gl as unknown as WebGPURenderer)
    },
    { phase: 'render' }
  )

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
      </flatland>

      {flatlandCamera && (
        <HudFullscreen
          camera={flatlandCamera}
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          padding={24}
          fontFamilies={{ inter: { normal: font } }}
        >
          <GameMenu font={font} />
        </HudFullscreen>
      )}
    </>
  )
}

export default function App() {
  const { pane } = usePane()
  const [ambient] = usePaneInput<number>(pane, 'ambient', 0.6, { min: 0, max: 3, step: 0.05 })

  return (
    // `canvasInputProps` stops the canvas's default pointer-down from blurring the
    // hidden <input> a uikit `Input` types into. Without it the field focuses,
    // renders a caret for one frame, and silently swallows every keystroke.
    // No `dpr={1}` + `image-rendering: pixelated`: that renders the whole
    // framebuffer at 1x and nearest-upscales it, pixelating Slug's analytic text
    // along with everything else. R3F's default dpr respects the device pixel
    // ratio, so text stays crisp; the tilemap stays chunky because its tileset is
    // NearestFilter-sampled (Flatland's TextureConfig default 'pixel-art'), not
    // because the canvas is downscaled.
    <Canvas {...canvasInputProps} renderer={{ antialias: false }}>
      <DevtoolsProvider name="uikit" />
      <Suspense fallback={null}>
        <GameScene ambient={ambient} />
      </Suspense>
    </Canvas>
  )
}
