import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
// Three's own OrbitControls, not drei's. drei 11-alpha's `/webgpu` build statically imports
// `WebGLCubeRenderTarget` — a symbol three 0.183's webgpu build drops — and even the bare entry
// can drag that graph in, poisoning the WebGPU dep-scan (a known drei/three-webgpu bug). three's
// addon control is backend-agnostic with no cubemap dependency, so it sidesteps the issue and
// keeps drei out of the import graph entirely.
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Container,
  Fullscreen,
  Root,
  Svg,
  Text,
  VanillaContainer,
  VanillaText,
  noEvents,
  PointerEvents,
} from '@three-flatland/uikit/react'
// Icon pool for the dense label-grid benchmark (?scene=labelgrid). Named Lucide components —
// in the fork these are analytic <Svg> shapes that batch into ONE shared SlugShapeSet; the MSDF
// twin imports the SAME names from @react-three/uikit-lucide (triangulated meshes). `Map`/`Image`
// are aliased so they don't shadow the JS globals. See ICON_POOL below.
import {
  Activity, Airplay, Anchor, Aperture, Apple, Archive, Atom, Award, BatteryFull, Bell,
  Book, Box, Camera, Check, Clock, Cloud, Code, Coffee, Compass, Cpu, Crown, Database,
  Diamond, Feather, Flag, Flame, Flower, Folder, Gem, Gift, Globe, Hammer, Heart, House,
  Image as ImageIcon, Key, Leaf, Lock, Mail, Map as MapIcon, Moon, Music, Rocket, Save,
  Search, Send, Settings, Shield, Star, Sun, Tag, Target, Terminal, Trophy, Umbrella,
  User, Video, Wallet, Wifi, Wind, Wrench, Zap,
} from '@three-flatland/uikit-lucide/react'
import { effect, signal } from '@preact/signals-core'
import { Suspense, use, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Color, type Group } from 'three'
import { SlugFontLoader } from '@three-flatland/slug/react'
import type { SlugFont } from '@three-flatland/slug'

type Mode = 'cards' | 'decorated' | 'sampled'

type Backend = 'webgpu' | 'webgl'

type SceneState = {
  mode: Mode
  level: number
}

type Preset = {
  label: string
  items: number
  columns: number
}

const presets: Array<Preset> = [
  { label: 'Desk', items: 192, columns: 16 },
  { label: 'Busy', items: 768, columns: 32 },
  { label: 'Ops', items: 1536, columns: 48 },
  { label: 'Wall', items: 3072, columns: 64 },
  { label: 'Dense', items: 6144, columns: 96 },
  { label: 'Stress', items: 12288, columns: 128 },
  { label: 'Melt', items: 24576, columns: 192 },
  { label: 'Flood', items: 49152, columns: 256 },
  { label: 'Crush', items: 98304, columns: 384 },
]

const modes: Array<{ id: Mode; label: string }> = [
  { id: 'cards', label: 'Cards' },
  { id: 'decorated', label: 'Decorated' },
  { id: 'sampled', label: 'Sampled' },
]

const palette = [
  '#f8fafc',
  '#d8e2dc',
  '#ffd166',
  '#7bdff2',
  '#b2f7ef',
  '#ffafcc',
  '#cdb4db',
  '#bde0fe',
]
const ink = '#172033'
const muted = '#607080'

// The bench-harness contract, shared by BOTH scenes (default Fullscreen + ladder). The
// default scene layers Preset fields (label/items/columns) over this via spread; the
// index signature keeps those extras assignable. `mode` is a plain string so the ladder
// can report `'ladder'` without widening the default scene's `Mode` union.
type PerfSnapshot = {
  mode: string
  level: number
  items: number
  objects: number
  render: Record<string, number>
  memory: Record<string, number>
  gpuMs: number
  backend: Backend
}

declare global {
  interface Window {
    __uikitPerf?: {
      getState: () => PerfSnapshot & Record<string, unknown>
      setLevel: (level: number) => void
      setMode: (mode: Mode) => void
      setComplexity: (level: number, mode?: Mode) => void
    }
    // Set true once the ladder scene has rendered its first frame — the Playwright
    // harness polls this before it screenshots / measures the world-space text ladder.
    __benchReady?: boolean
  }
}

/**
 * Reads `?renderer=webgl` and, when present, forces `WebGPURenderer` onto its
 * WebGL2 fallback backend via `forceWebGL: true` — the A/B harness's WebGPU
 * vs. forced-WebGL comparison lever. Default (no query param) leaves the
 * renderer to pick WebGPU when available.
 */
function useRendererConfig() {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const forceWebGL = params.get('renderer') === 'webgl'
    // trackTimestamp enables GPU-timing queries (WebGPU: TimestampQuery; WebGL2 fallback:
    // EXT_disjoint_timer_query, Chrome-only) — read back per-frame in PerformanceBridge as gpuMs.
    return {
      antialias: false,
      trackTimestamp: true,
      ...(forceWebGL ? { forceWebGL: true } : {}),
    }
  }, [])
}

// Load Inter ONCE and share it across every Text via `fontFamilies`, so all glyphs
// batch into one baked SlugShapeSet — the same shared-font path the bento and every
// real app use. No `forceRuntime`, so the loader fetches the pre-baked
// Inter-Regular.slug.glb sidecar (run `slug-bake public/Inter-Regular.ttf`). Without
// this the scene falls back to uikit's DEFAULT font, which shares no shape set and
// fans the text out into ~1 draw per run — a scene-authoring artifact, not the fork.
let interFontPromise: Promise<SlugFont> | null = null
function useSharedFont(): SlugFont {
  interFontPromise ??= SlugFontLoader.load('./Inter-Regular.ttf')
  return use(interFontPromise)
}

function Scene({
  state,
  preset,
  setLevel,
  setMode,
}: {
  state: SceneState
  preset: Preset
  setLevel: (level: number) => void
  setMode: (mode: Mode) => void
}) {
  const font = useSharedFont()
  return (
    <Fullscreen
      flexDirection="column"
      gap={16}
      padding={28}
      backgroundColor="#eef3f7"
      fontFamilies={{ inter: { normal: font } }}
      {...{ '*': { fontSize: 14, fontFamily: 'inter' } }}
    >
      <Header state={state} preset={preset} setLevel={setLevel} setMode={setMode} />
      <Container flexGrow={1} alignSelf="stretch" flexDirection="row" gap={16} minHeight={0}>
        <SummaryPanel state={state} preset={preset} />
        <WorkSurface state={state} preset={preset} />
      </Container>
    </Fullscreen>
  )
}

/**
 * Scene router. The ladder IS the app: the bare root (no params) and `?scene=ladder` render
 * `<LadderApp/>` (2D by default — see readLadderParams). `?scene=labelgrid` is the dense
 * icon+label grid stress; the old cards perf lab is parked behind `?scene=default`.
 */
export default function App() {
  const scene = useMemo(() => new URLSearchParams(window.location.search).get('scene'), [])
  if (scene === 'default') {
    return <DefaultApp />
  }
  if (scene === 'labelgrid') {
    return <LabelGridApp />
  }
  return <LadderApp />
}

function DefaultApp() {
  const [state, setState] = useState<SceneState>(() => readInitialState())
  const preset = presets[state.level]!
  const setLevel = (level: number) =>
    setState((current) => ({ ...current, level: clampLevel(level) }))
  const setMode = (mode: Mode) => setState((current) => ({ ...current, mode }))
  const rendererConfig = useRendererConfig()

  return (
    <Canvas
      events={noEvents}
      style={{ height: '100dvh', touchAction: 'none' }}
      renderer={rendererConfig}
      camera={{ position: [0, 0, 900], near: 0.1, far: 5000 }}
    >
      <color attach="background" args={['#eef3f7']} />
      <ambientLight intensity={0.7} />
      <directionalLight intensity={0.4} position={[5, 8, 12]} />
      <PointerEvents />
      <PerformanceBridge state={state} setState={setState} />
      <Suspense fallback={null}>
        <Scene state={state} preset={preset} setLevel={setLevel} setMode={setMode} />
      </Suspense>
    </Canvas>
  )
}

// ── TEXT-LADDER benchmark (?scene=ladder) ────────────────────────────────────
// The Slug side of a Slug-vs-uikit text/icon-quality compare, and the SHIPPED app
// (the app IS the benchmark). Two reload-branched rendering paths share one row
// set, one perf bridge, one HUD, one nav:
//   • 2D   (nav "2D", no rotate/wobble) — screen-space <Fullscreen>, top-left,
//     EXACT pixels (8px text == 8 screen px), no perspective, no OrbitControls.
//   • 3D   (nav "Off-axis" rotate=35 / "Wobble" wobble=1) — world-space <Root>
//     centered on the wobble group's pivot, PerspectiveCamera + sine wobble +
//     <OrbitControls> so you can orbit the text while it shimmers.
// Ladder ROWS stay text+icon-only in BOTH paths; the only panels anywhere are the
// perf HUD's. The spec is pinned identically in the uikit app for a fair compare.
const LADDER_TEXT = 'Sphinx of black quartz, judge my vow'
// 14 doubling-ish steps (8→256). Dense enough that sub-pixel crawl shows at every size the
// eye actually reads text at — the whole point of the shipped shimmer test.
const LADDER_SIZES = [8, 10, 12, 14, 16, 20, 24, 32, 48, 64, 96, 128, 192, 256]
const LADDER_FG = '#e6edf3'
const LADDER_BG = '#0b0e13'
// Lucide "atom" — its elliptical electron-orbit curves are exactly what shows Slug's
// analytic Bézier edges vs a tessellated mesh. This is the oslllo-svg-fixer output shipped
// in packages/uikit-lucide/icons/atom.svg (stroke baked to a filled outline, fill="black"
// standing in for currentColor); it's the exact markup slug/svg's runtime parser is
// validated against (parseSVG.lucide.test.ts). Rendered via @three-flatland/uikit's
// <Svg content=…>, it registers into the shared SlugShapeSet — one analytic vector shape,
// tinted per-instance to LADDER_FG. Pinned to match the MSDF app.
const LADDER_ICON_SVG =
  '<svg class="lucide lucide-atom" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.404 2.046 C 3.229 2.273,1.891 3.960,2.013 6.320 C 2.094 7.894,2.809 9.925,3.924 11.746 L 4.077 11.997 3.925 12.248 C 2.927 13.894,2.251 15.666,2.061 17.132 C 1.651 20.301,3.577 22.299,6.712 21.958 C 8.145 21.802,9.969 21.133,11.591 20.167 L 12.003 19.923 12.264 20.082 C 14.073 21.190,16.098 21.902,17.679 21.986 C 20.524 22.139,22.277 20.213,21.958 17.288 C 21.801 15.855,21.131 14.029,20.168 12.410 L 19.924 12.000 20.168 11.590 C 21.131 9.971,21.801 8.145,21.958 6.712 C 22.157 4.885,21.569 3.430,20.304 2.621 C 18.948 1.754,16.873 1.818,14.480 2.802 C 13.911 3.036,12.909 3.536,12.370 3.855 L 12.000 4.075 11.630 3.855 C 11.047 3.510,9.992 2.990,9.380 2.747 C 7.865 2.145,6.594 1.921,5.404 2.046 M7.039 4.118 C 7.834 4.272,8.679 4.578,9.650 5.065 C 9.931 5.206,10.160 5.327,10.160 5.335 C 10.160 5.344,9.957 5.511,9.710 5.707 C 8.346 6.789,6.896 8.234,5.763 9.640 C 5.559 9.893,5.377 10.116,5.359 10.135 C 5.319 10.177,4.884 9.321,4.629 8.700 C 3.913 6.959,3.815 5.404,4.375 4.670 C 4.840 4.060,5.758 3.870,7.039 4.118 M18.737 4.100 C 19.598 4.327,19.977 4.926,19.975 6.060 C 19.973 7.113,19.641 8.244,18.903 9.715 C 18.777 9.965,18.659 10.154,18.641 10.135 C 18.623 10.116,18.441 9.893,18.237 9.640 C 17.107 8.238,15.650 6.786,14.290 5.707 C 14.043 5.511,13.840 5.344,13.840 5.335 C 13.840 5.305,14.878 4.802,15.303 4.627 C 16.040 4.323,16.712 4.142,17.540 4.024 C 17.767 3.991,18.500 4.038,18.737 4.100 M12.312 6.707 C 14.161 8.070,15.931 9.840,17.295 11.690 L 17.523 12.000 17.295 12.310 C 15.960 14.120,14.319 15.779,12.528 17.129 L 11.997 17.529 11.468 17.128 C 9.651 15.749,8.037 14.117,6.705 12.310 L 6.477 12.000 6.705 11.690 C 7.947 10.006,9.577 8.334,11.189 7.091 C 11.887 6.553,11.978 6.484,11.992 6.482 C 11.999 6.481,12.143 6.582,12.312 6.707 M11.477 10.073 C 10.806 10.249,10.238 10.823,10.060 11.508 C 9.941 11.962,10.003 12.492,10.225 12.930 C 10.361 13.199,10.801 13.639,11.070 13.775 C 11.659 14.073,12.341 14.073,12.930 13.775 C 13.196 13.640,13.638 13.200,13.771 12.937 C 13.994 12.498,14.052 12.007,13.940 11.529 C 13.858 11.182,13.720 10.927,13.465 10.653 C 13.074 10.232,12.560 10.005,12.000 10.005 C 11.857 10.005,11.622 10.036,11.477 10.073 M5.763 14.360 C 6.893 15.762,8.304 17.170,9.705 18.291 C 9.955 18.491,10.145 18.671,10.127 18.689 C 10.064 18.752,9.101 19.208,8.620 19.402 C 6.718 20.172,5.140 20.188,4.468 19.444 C 4.143 19.084,4.023 18.677,4.026 17.940 C 4.029 16.893,4.355 15.767,5.068 14.345 C 5.210 14.062,5.341 13.846,5.359 13.865 C 5.377 13.884,5.559 14.107,5.763 14.360 M18.905 14.290 C 19.641 15.756,19.973 16.888,19.975 17.940 C 19.976 18.678,19.857 19.084,19.532 19.444 C 18.860 20.188,17.281 20.172,15.380 19.402 C 14.860 19.192,13.893 18.734,13.862 18.684 C 13.852 18.667,14.047 18.489,14.297 18.289 C 15.708 17.159,17.160 15.708,18.290 14.295 C 18.491 14.045,18.661 13.840,18.667 13.840 C 18.674 13.840,18.781 14.043,18.905 14.290 " stroke="none" fill-rule="evenodd" fill="black"></path></svg>'
// 2D screen-space inset (px in from the top-left corner). Fullscreen == 1 uikit px per CSS
// px, so this is a literal 40px pad and 8px text renders at 8 screen px.
const LADDER_2D_PADDING = 40
// 3D world-space Root. pixelSize defaults to 0.01, so 1600px == 16 world units. Rows are
// CENTER-aligned in 3D (anchorX/anchorY default to center too), so the ladder's own middle
// sits on the group origin — the wobble/orbit pivot — and the swing looks balanced instead
// of hinging from a corner. Height holds the 14-row stack (~1180px) with margin. Big rows
// spill both sides at native size (overflow:visible, no wrap), which is wanted.
const LADDER_ROOT_WIDTH = 1600
const LADDER_ROOT_HEIGHT = 1320
const LADDER_GAP = 6
// PerspectiveCamera framing (3D). Distance frames the full fourteen-row vertical stack with
// headroom; X == 0 keeps the centered ladder centered. A Y yaw never changes the rows' Y
// extent, so every row stays vertically in frame across the wobble. OrbitControls takes over
// from here.
const LADDER_CAM_Z = 18
const LADDER_CAM_X = 0
// Wobble (`?wobble=1`): a slow sine yaw that turns the released app into a live shimmer test
// — you watch the text + icons for edge crawl as the surface swings off-axis and back.
const LADDER_WOBBLE_AMP_DEG = 35
const LADDER_WOBBLE_PERIOD_S = 6

// ── DENSE LABEL-GRID benchmark (?scene=labelgrid) ────────────────────────────
// An Excel-tight uniform grid that fills the viewport with as many icon+label cells as fit —
// several thousand on a laptop. Each cell picks a DETERMINISTIC (icon, ≤6-char mixed-case
// string) from a seeded PRNG, so the Slug app and the MSDF twin render the exact same grid for
// a fair A/B. The font never drops below GRID_FONT (8px), the readable floor. This is the
// icon-batching stress: Slug folds all 62 icon types into one shared SlugShapeSet; upstream
// meshes each one (one draw per icon), which is the whole point of the compare.
const GRID_FONT = 8 // text size (px) — the hard floor the spec pins
const GRID_ICON = 10 // icon box (px) — a touch bigger than the text so the glyph reads
const GRID_CELL_W = 46 // cell width (px) — icon + up-to-6 chars + insets (keeps 6-char labels unclipped)
const GRID_CELL_H = 13 // cell height (px) — one 8px line, packed tight so real displays clear several thousand
const GRID_FG = '#c9d4e0' // label + icon ink
const GRID_LINE = '#20262e' // excel gridline (a dim hairline on the near-black field)
const GRID_SEED = 0x9e3779b9 // golden-ratio seed, shared by both apps → identical grid
const GRID_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

// The 62-icon pool, cycled deterministically per cell. Names exist in BOTH
// @three-flatland/uikit-lucide (analytic) and @react-three/uikit-lucide (mesh), so the MSDF
// twin is a pure import-source swap. Order is load-bearing: the PRNG indexes into it, so both
// apps MUST keep this list identical for the grids to match.
const ICON_POOL = [
  Activity, Airplay, Anchor, Aperture, Apple, Archive, Atom, Award, BatteryFull, Bell,
  Book, Box, Camera, Check, Clock, Cloud, Code, Coffee, Compass, Cpu, Crown, Database,
  Diamond, Feather, Flag, Flame, Flower, Folder, Gem, Gift, Globe, Hammer, Heart, House,
  ImageIcon, Key, Leaf, Lock, Mail, MapIcon, Moon, Music, Rocket, Save, Search, Send,
  Settings, Shield, Star, Sun, Tag, Target, Terminal, Trophy, Umbrella, User, Video,
  Wallet, Wifi, Wind, Wrench, Zap,
] as const

/**
 * mulberry32 — a tiny, fast, deterministic PRNG. Seeded PER CELL (not one shared stream) so
 * cell `i` is identical no matter how many cells the viewport fits — the two apps may size
 * slightly differently, but cell 0 is cell 0 in both.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic (icon, label) for grid cell `i`: a random icon from ICON_POOL and a random
 * 1–6-char mixed-case ASCII string. PURE — identical in the Slug app and the MSDF twin.
 */
function gridCell(i: number): { Icon: (typeof ICON_POOL)[number]; text: string } {
  const r = mulberry32((GRID_SEED + Math.imul(i, 0x9e3779b9)) | 0)
  const Icon = ICON_POOL[Math.floor(r() * ICON_POOL.length)]!
  const len = 1 + Math.floor(r() * 6)
  let text = ''
  for (let k = 0; k < len; k++) {
    text += GRID_ALPHA[Math.floor(r() * GRID_ALPHA.length)]
  }
  return { Icon, text }
}

// ── LANGUAGE toggle (?lang=en|zh) ────────────────────────────────────────────
// A second-pass Simplified-Chinese switch, present in every benchmark's nav. The `zh` RENDER
// is intentionally NOT wired yet: the R32Float band-atlas repack caps a single glyph page
// (curve texture ≤4096 rows, band offset <16383), so a CJK repertoire needs multi-page bakes
// (planning/perf/glyph-paging-design.md). Until paging lands, selecting 简中 keeps the Latin
// content and raises LangNotice explaining the gate — an honest stop-point, not broken tofu.
type Lang = 'en' | 'zh'
function readLang(): Lang {
  return new URLSearchParams(window.location.search).get('lang') === 'zh' ? 'zh' : 'en'
}

// Perf HUD (dogfoods uikit): a compact single-row FPS/GPU/MEM readout + a small live graph of
// one selected metric, backed by pre-allocated ring buffers (one per metric) and fixed bars.
const LADDER_HUD_BARS = 60
const LADDER_HUD_BAR_AREA = 42
const LADDER_HUD_BAR_WIDTH = 3
const LADDER_HUD_TEXT_HZ = 4

type LadderMode = '2d' | '3d'
type LadderParams = {
  rotateDeg: number
  dpr: number | undefined
  wobble: boolean
  mode: LadderMode
}

/** Per-frame perf sample, written by LadderBridge and read by the HUD (shared ref). */
type PerfSample = { fps: number; frameMs: number; gpuMs: number; drawCalls: number; memMB: number }

/** Metrics the HUD graph can plot. The stat-row label colors are fixed; the graph tracks the
 *  selected metric (its color + normalization), cycled by the DOM overlay. */
type MetricId = 'fps' | 'gpu' | 'mem'
type HudMetric = { label: string; color: string; max: number }
const HUD_METRICS: Record<MetricId, HudMetric> = {
  fps: { label: 'FPS', color: '#4ade80', max: 120 }, // green
  gpu: { label: 'GPU', color: '#f5a524', max: 8 }, // orange
  mem: { label: 'MEM', color: '#a78bfa', max: 256 }, // purple
}
const HUD_ROW: MetricId[] = ['fps', 'gpu', 'mem'] // left→right order in the single stat row
const HUD_CYCLE: MetricId[] = ['gpu', 'fps', 'mem'] // graph selection cycle; starts at GPU

/**
 * Read the ladder query params ONCE at load: `?rotate=D`, `?dpr=N`, `?wobble=1`. The MODE is
 * derived (reload-based, so each path sets up its whole Canvas differently): any yaw
 * (`wobble` or a nonzero `rotate`) selects the world-space 3D path; otherwise the 2D
 * screen-space path.
 */
function readLadderParams(): LadderParams {
  const params = new URLSearchParams(window.location.search)
  const rotate = Number(params.get('rotate'))
  const rotateDeg = Number.isFinite(rotate) ? rotate : 0
  const dprParam = params.get('dpr')
  const dpr = dprParam == null ? undefined : Number(dprParam)
  const wobble = params.get('wobble') === '1'
  return {
    rotateDeg,
    dpr: dpr != null && Number.isFinite(dpr) && dpr > 0 ? dpr : undefined,
    wobble,
    mode: wobble || rotateDeg !== 0 ? '3d' : '2d',
  }
}

/**
 * Orbit the camera around the ladder center with three's own OrbitControls (drei's webgpu build
 * pulls `WebGLCubeRenderTarget`, a symbol three 0.183's webgpu build drops — a known
 * incompatibility). Constructed in an effect (no render-time side effects) against the live
 * camera + canvas; pan off, target the origin (the centered ladder's pivot), update per frame.
 */
function LadderControls() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controlsRef = useRef<OrbitControls | null>(null)
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.target.set(0, 0, 0)
    controls.update()
    controlsRef.current = controls
    return () => {
      controlsRef.current = null
      controls.dispose()
    }
  }, [camera, gl])
  useFrame(() => controlsRef.current?.update())
  return null
}

function LadderApp() {
  const { rotateDeg, dpr, wobble, mode } = useMemo(() => readLadderParams(), [])
  // Reuses the shared renderer config so `?renderer=webgl` still forces the WebGL2
  // fallback backend in ladder mode, exactly like the default scene.
  const rendererConfig = useRendererConfig()
  // One perf sample, written by the bridge each frame and read by the HUD — no allocation
  // per frame, one shared object.
  const perfRef = useRef<PerfSample>({ fps: 0, frameMs: 0, gpuMs: 0, drawCalls: 0, memMB: 0 })
  // Which metric the HUD graph plots (default GPU). Mutated by the DOM overlay's click, read
  // by PerfHud's useFrame — a ref, so cycling never re-renders the imperative HUD.
  const metricRef = useRef<MetricId>('gpu')

  // Reload-branched: the whole Canvas (camera + controls) is configured per mode. 2D uses a
  // screen-space Fullscreen (a default camera is enough); 3D uses the PerspectiveCamera and
  // adds OrbitControls. Both share the bridge, the HUD, and the DOM nav.
  const is3d = mode === '3d'

  return (
    <>
      <Canvas
        events={noEvents}
        style={{ height: '100dvh', touchAction: 'none' }}
        renderer={rendererConfig}
        // `dpr` omitted (undefined) falls back to R3F's device-dpr default.
        dpr={dpr}
        camera={
          is3d
            ? { fov: 45, position: [LADDER_CAM_X, 0, LADDER_CAM_Z], near: 0.1, far: 5000 }
            : { position: [0, 0, 900], near: 0.1, far: 5000 }
        }
      >
        <color attach="background" args={[LADDER_BG]} />
        <LadderBridge perfRef={perfRef} />
        <Suspense fallback={null}>
          {is3d ? <Ladder3DScene rotateDeg={rotateDeg} wobble={wobble} /> : <Ladder2DScene />}
          {/* Dogfooded uikit perf HUD — screen-space in BOTH modes, so it stays put under
              orbit. Its counter panel + bars are the ONLY panels in the whole scene. */}
          <PerfHud perfRef={perfRef} metricRef={metricRef} />
        </Suspense>
        {/* OrbitControls ONLY in 3D — orbit the camera around the wobbling text. Targets the
            ladder center (origin) so it pivots on the middle of the block. */}
        {is3d && <LadderControls />}
      </Canvas>
      {/* Plain DOM, OUTSIDE the Canvas — not a three.js object, so zero cost to the
          measured render. */}
      <LadderNav />
      {/* Transparent DOM hit-target over the HUD: the Canvas runs events={noEvents} (no
          per-move raycast, benchmark purity), so the graph's click-to-cycle comes from here. */}
      <HudCycleOverlay metricRef={metricRef} />
      <LangNotice />
    </>
  )
}

/**
 * DENSE LABEL-GRID app (?scene=labelgrid). 2D-only (no 3D/orbit) — a screen-space grid of
 * several thousand icon+label cells. Reuses the ladder's whole shell: the same renderer config,
 * the same `LadderBridge`/`PerfHud`/`HudCycleOverlay` perf plumbing, and the same `LadderNav`
 * (which shows the Bench/Grid switch + the Lang toggle). `dpr` is honored so 1×/2× still A/B.
 */
function LabelGridApp() {
  const { dpr } = useMemo(() => readLadderParams(), [])
  const rendererConfig = useRendererConfig()
  const perfRef = useRef<PerfSample>({ fps: 0, frameMs: 0, gpuMs: 0, drawCalls: 0, memMB: 0 })
  const metricRef = useRef<MetricId>('gpu')

  return (
    <>
      <Canvas
        events={noEvents}
        style={{ height: '100dvh', touchAction: 'none' }}
        renderer={rendererConfig}
        dpr={dpr}
        camera={{ position: [0, 0, 900], near: 0.1, far: 5000 }}
      >
        <color attach="background" args={[LADDER_BG]} />
        <LadderBridge perfRef={perfRef} />
        <Suspense fallback={null}>
          <LabelGridScene />
          <PerfHud perfRef={perfRef} metricRef={metricRef} />
        </Suspense>
      </Canvas>
      <LadderNav />
      <HudCycleOverlay metricRef={metricRef} />
      <LangNotice />
    </>
  )
}

/**
 * The grid itself: fill the viewport with as many `GRID_CELL_W × GRID_CELL_H` cells as fit,
 * each a hairline-bordered (excel-like) row of one deterministic icon + one ≤6-char label.
 * `flex-wrap` on a full-width Fullscreen packs the cells left-to-right, top-to-bottom. Cell
 * count is derived from the live viewport ONCE at mount — several thousand on a laptop.
 */
function LabelGridScene() {
  const font = useSharedFont()
  useBenchReady()
  const cells = useMemo(() => {
    const cols = Math.max(1, Math.floor(window.innerWidth / GRID_CELL_W))
    const rows = Math.max(1, Math.floor(window.innerHeight / GRID_CELL_H))
    const count = cols * rows
    return Array.from({ length: count }, (_unused, i) => gridCell(i))
  }, [])

  return (
    <Fullscreen
      flexDirection="row"
      flexWrap="wrap"
      alignContent="flex-start"
      justifyContent="flex-start"
      fontFamilies={{ inter: { normal: font } }}
    >
      {cells.map(({ Icon, text }, i) => (
        <Container
          key={i}
          width={GRID_CELL_W}
          height={GRID_CELL_H}
          flexDirection="row"
          alignItems="center"
          gap={2}
          paddingLeft={3}
          paddingRight={2}
          borderWidth={1}
          borderColor={GRID_LINE}
          overflow="hidden"
        >
          <Icon width={GRID_ICON} height={GRID_ICON} color={GRID_FG} flexShrink={0} />
          <Text fontSize={GRID_FONT} fontFamily="inter" color={GRID_FG} wordBreak="keep-all">
            {text}
          </Text>
        </Container>
      ))}
    </Fullscreen>
  )
}

/**
 * The 14 shared rows: a Lucide "atom" `<Svg>` + the pangram at each fontSize, the icon sized
 * to and vertically centered with the text. TEXT + ICON ONLY — no backgroundColor/border, so
 * uikit draws nothing but glyphs and the analytic atom shapes. The PARENT sets alignment
 * (2D Fullscreen: top-left; 3D Root: centered), so this stays layout-agnostic.
 */
function LadderRows() {
  return (
    <>
      {LADDER_SIZES.map((size) => (
        <Container key={size} flexDirection="row" alignItems="center" gap={Math.round(size * 0.3)}>
          <Svg
            content={LADDER_ICON_SVG}
            width={size}
            height={size}
            color={LADDER_FG}
            flexShrink={0}
          />
          <Text fontSize={size} fontFamily="inter" color={LADDER_FG} wordBreak="keep-all">
            {LADDER_TEXT}
          </Text>
        </Container>
      ))}
    </>
  )
}

/**
 * Raise `window.__benchReady` after a few frames. Called from inside each scene, which only
 * mounts once useSharedFont has resolved (it suspends) — so this is a true "the ladder has
 * drawn" signal, unlike the bridge, which ticks before the font arrives.
 */
function useBenchReady() {
  const framesRef = useRef(0)
  useFrame(() => {
    framesRef.current += 1
    if (framesRef.current >= 3) {
      window.__benchReady = true
    }
  })
}

/**
 * 2D path — screen-space `<Fullscreen>`, rows pinned TOP-LEFT with a 40px inset. Fullscreen
 * maps 1 uikit px to 1 CSS px, so this is the honest 1:1 ladder: 8px text is 8 screen px,
 * zero perspective. The tall bottom rows run past the fold at native size (that's the point).
 */
function Ladder2DScene() {
  const font = useSharedFont()
  useBenchReady()
  return (
    <Fullscreen
      flexDirection="column"
      justifyContent="flex-start"
      alignItems="flex-start"
      gap={LADDER_GAP}
      padding={LADDER_2D_PADDING}
      fontFamilies={{ inter: { normal: font } }}
    >
      <LadderRows />
    </Fullscreen>
  )
}

/**
 * 3D path — world-space `<Root>` inside the wobble group. Rows are CENTER-aligned and the
 * Root's default center anchor puts the ladder's own middle on the group origin, so the sine
 * yaw (and OrbitControls) pivot on the center of the text block, not a corner. TEXT + ICON
 * ONLY; the dark backdrop is the three.js clear color.
 */
function Ladder3DScene({ rotateDeg, wobble }: { rotateDeg: number; wobble: boolean }) {
  const font = useSharedFont()
  useBenchReady()
  const yaw = (rotateDeg * Math.PI) / 180
  const groupRef = useRef<Group>(null)
  const elapsedRef = useRef(0)

  // Wobble overrides the static `?rotate`: drive the group's Y yaw as a slow sine each frame
  // (ref mutation, never setState). `delta` is R3F's per-frame seconds; accumulate it for the
  // phase. When off, the static `rotation` prop stands (and OrbitControls still orbits).
  useFrame((_frameState, delta) => {
    const group = groupRef.current
    if (wobble && group != null) {
      elapsedRef.current += delta
      const amp = (LADDER_WOBBLE_AMP_DEG * Math.PI) / 180
      group.rotation.y =
        amp * Math.sin((elapsedRef.current / LADDER_WOBBLE_PERIOD_S) * Math.PI * 2)
    }
  })

  return (
    <group ref={groupRef} rotation={[0, yaw, 0]}>
      <Root
        width={LADDER_ROOT_WIDTH}
        height={LADDER_ROOT_HEIGHT}
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        gap={LADDER_GAP}
        overflow="visible"
        fontFamilies={{ inter: { normal: font } }}
      >
        <LadderRows />
      </Root>
    </group>
  )
}

/**
 * Dogfooded uikit perf HUD — a screen-space `<Fullscreen>` pinning a compact TOP-RIGHT panel
 * that survives 2D/3D/orbit (offset down so it clears the DOM nav strip). A single row of three
 * color-coded counters — FPS (green) · GPU (orange) · MEM (purple), refreshed at ~4Hz so the
 * digits don't strobe — above a small live graph of ONE selected metric (default GPU; the DOM
 * overlay cycles it, recoloring the bars to the metric's hue).
 *
 * PRE-ALLOCATION (required, to keep the HUD from adding GC noise to the very thing it measures):
 * one `Float32Array(LADDER_HUD_BARS)` ring PER metric and `LADDER_HUD_BARS` bar `<Container>`s
 * are created ONCE. Every frame writes each metric's sample into its ring at `head++` and maps
 * the SELECTED ring → bars via imperative `setProperties` — no array growth, no Container
 * creation, no React re-render (a setState here would let build.tsx's per-render resetProperties
 * clobber the imperative bars).
 */
function PerfHud({ perfRef, metricRef }: { perfRef: RefObject<PerfSample>; metricRef: RefObject<MetricId> }) {
  const font = useSharedFont()
  // One pre-allocated ring per metric (shared head) so cycling shows each metric's own
  // continuous history — no reallocation, no history reset on switch.
  const ringsRef = useRef<Record<MetricId, Float32Array>>({
    fps: new Float32Array(LADDER_HUD_BARS),
    gpu: new Float32Array(LADDER_HUD_BARS),
    mem: new Float32Array(LADDER_HUD_BARS),
  })
  const headRef = useRef(0)
  const barRefs = useRef<Array<VanillaContainer | null>>([])
  const textRefs = useRef<Record<MetricId, VanillaText | null>>({ fps: null, gpu: null, mem: null })
  const textAccumRef = useRef(0)
  const shownRef = useRef<MetricId>('gpu') // last metric applied to the bar color

  useFrame((_frameState, delta) => {
    const perf = perfRef.current
    const rings = ringsRef.current
    const slot = headRef.current % LADDER_HUD_BARS
    rings.fps[slot] = perf.fps
    rings.gpu[slot] = perf.gpuMs
    rings.mem[slot] = perf.memMB
    headRef.current += 1

    // Plot the SELECTED metric; recolor the bars once when the selection changes.
    const id = metricRef.current
    const metric = HUD_METRICS[id]
    const ring = rings[id]
    const recolor = shownRef.current !== id
    if (recolor) {
      shownRef.current = id
    }
    const bars = barRefs.current
    for (let i = 0; i < LADDER_HUD_BARS; i++) {
      const bar = bars[i]
      if (bar == null) {
        continue
      }
      // Oldest sample on the left, newest on the right.
      const value = ring[(headRef.current + i) % LADDER_HUD_BARS]!
      const height = Math.max(1, Math.min(value / metric.max, 1) * LADDER_HUD_BAR_AREA)
      if (recolor) {
        bar.setProperties({ height, backgroundColor: metric.color })
      } else {
        bar.setProperties({ height })
      }
    }

    // Counters at ~4Hz so digits are readable, updated imperatively (no setState → no React
    // re-render → the pre-allocated bars/text keep their imperative state).
    textAccumRef.current += delta
    if (textAccumRef.current >= 1 / LADDER_HUD_TEXT_HZ) {
      textAccumRef.current = 0
      const texts = textRefs.current
      texts.fps?.setProperties({ text: `FPS ${perf.fps.toFixed(0)}` })
      texts.gpu?.setProperties({ text: `GPU ${perf.gpuMs.toFixed(1)}` })
      texts.mem?.setProperties({ text: `MEM ${perf.memMB.toFixed(0)}` })
    }
  })

  return (
    <Fullscreen
      flexDirection="column"
      justifyContent="flex-start"
      alignItems="flex-end"
      paddingTop={8}
      paddingRight={16}
      fontFamilies={{ inter: { normal: font } }}
    >
      <Container
        flexDirection="column"
        gap={6}
        padding={8}
        borderRadius={6}
        backgroundColor="#0b0e13"
        borderWidth={1}
        borderColor="#1c2530"
      >
        {/* Single row: FPS (green) · GPU (orange) · MEM (purple), each in its fixed metric hue.
            Each stat sits in a FIXED-WIDTH cell so changing digit counts never reflow the row —
            without it the right-anchored box (and its labels) jitter as the numbers tick. */}
        <Container flexDirection="row" gap={6}>
          {HUD_ROW.map((id) => (
            <Container key={id} width={62} flexShrink={0}>
              <Text
                ref={(el) => {
                  textRefs.current[id] = el
                }}
                fontSize={11}
                fontFamily="inter"
                color={HUD_METRICS[id].color}
                wordBreak="keep-all"
              >
                {`${HUD_METRICS[id].label} —`}
              </Text>
            </Container>
          ))}
        </Container>
        {/* Live graph of the SELECTED metric (default GPU/orange). LADDER_HUD_BARS bars,
            alignItems flex-end so they grow up from the baseline; created ONCE, heights + color
            driven imperatively from the rings above. The DOM overlay's click cycles the metric. */}
        <Container flexDirection="row" alignItems="flex-end" gap={1} height={LADDER_HUD_BAR_AREA}>
          {Array.from({ length: LADDER_HUD_BARS }, (_unused, i) => (
            <Container
              key={i}
              ref={(el) => {
                barRefs.current[i] = el
              }}
              width={LADDER_HUD_BAR_WIDTH}
              height={1}
              flexShrink={0}
              borderRadius={1}
              backgroundColor={HUD_METRICS.gpu.color}
            />
          ))}
        </Container>
      </Container>
    </Fullscreen>
  )
}

/**
 * Transparent DOM button pinned over the HUD (top-right). The ladder Canvas runs
 * `events={noEvents}` so uikit receives no pointer events (no per-move raycast — benchmark
 * purity); this DOM hit-target supplies the graph's click-to-cycle, mutating the shared metric
 * ref that PerfHud's useFrame reads. Cycles GPU → FPS → MEM; the graph recolor is the feedback.
 */
function HudCycleOverlay({ metricRef }: { metricRef: RefObject<MetricId> }) {
  return (
    <button
      type="button"
      aria-label="Cycle the perf graph metric (GPU, FPS, MEM)"
      title="Click to cycle the graph metric — GPU → FPS → MEM"
      onClick={() => {
        metricRef.current = HUD_CYCLE[(HUD_CYCLE.indexOf(metricRef.current) + 1) % HUD_CYCLE.length]!
      }}
      style={{
        position: 'fixed',
        top: 8,
        right: 12,
        width: 268,
        height: 84,
        margin: 0,
        padding: 0,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        zIndex: 5,
      }}
    />
  )
}

/**
 * Simplified-Chinese pending-paging notice — a fixed DOM banner (outside the Canvas, so zero
 * render cost) shown ONLY when `?lang=zh`. The CJK second pass is gated on glyph paging (the
 * R32F band-atlas caps a single page); until that lands, selecting 简中 keeps the Latin scene
 * and surfaces this. That's the deliberate "stop before Chinese" state.
 */
function LangNotice() {
  if (readLang() !== 'zh') {
    return null
  }
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 20,
        transform: 'translateX(-50%)',
        maxWidth: 560,
        padding: '10px 16px',
        borderRadius: 8,
        background: 'rgba(11, 14, 19, 0.82)',
        border: '1px solid rgba(245, 165, 36, 0.4)',
        color: '#e6edf3',
        font: "500 12px/1.5 ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
        textAlign: 'center',
        backdropFilter: 'blur(6px)',
        zIndex: 20,
      }}
    >
      <strong style={{ color: '#f5a524' }}>简体中文 — pending glyph paging.</strong> The R32Float
      band-atlas caps a single page (curve texture ≤4096 rows, band offset &lt;16383); a CJK
      repertoire needs multi-page bakes. Latin still renders.{' '}
      <span style={{ opacity: 0.8 }}>See planning/perf/glyph-paging-design.md</span>
    </div>
  )
}

/**
 * Build an href that keeps the CURRENT query string and changes only the given params
 * (value `null` deletes the param). Every nav link is a plain reload to one of these — the
 * app IS the benchmark, so switching views is just navigating with different params.
 */
function withParams(changes: Record<string, string | null>): string {
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(changes)) {
    if (value == null) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  const query = params.toString()
  return query.length > 0 ? `${window.location.pathname}?${query}` : window.location.pathname
}

/**
 * Plain-DOM nav strip rendered OUTSIDE the R3F Canvas (a fixed top bar) — never a three.js
 * object, so it adds nothing to the measured render. Titles the app "Slug" (the two-tab
 * compare self-labels) and offers param-preserving reload links for View / DPI / Backend,
 * highlighting whichever is active in the current URL.
 */
function LadderNav() {
  const params = new URLSearchParams(window.location.search)
  const scene = params.get('scene')
  const isGrid = scene === 'labelgrid'
  const wobbleOn = params.get('wobble') === '1'
  const rotateVal = params.get('rotate')
  const rotateOn = !wobbleOn && rotateVal != null && rotateVal !== '0'
  const dpr = params.get('dpr')
  const webgl = params.get('renderer') === 'webgl'
  const zh = params.get('lang') === 'zh'

  // Bench switches scene, Lang switches pass; both are shared with the MSDF twin. The View group
  // (2D / Off-axis / Wobble) only makes sense for the ladder, so it's hidden in the 2D grid.
  const groups: Array<{
    label: string
    links: Array<{ text: string; href: string; active: boolean }>
  }> = [
    {
      label: 'Bench',
      links: [
        { text: 'Ladder', href: withParams({ scene: null }), active: !isGrid },
        {
          text: 'Grid',
          href: withParams({ scene: 'labelgrid', rotate: null, wobble: null }),
          active: isGrid,
        },
      ],
    },
    ...(isGrid
      ? []
      : [
          {
            label: 'View',
            links: [
              {
                text: '2D',
                href: withParams({ rotate: null, wobble: null }),
                active: !rotateOn && !wobbleOn,
              },
              { text: 'Off-axis', href: withParams({ rotate: '35', wobble: null }), active: rotateOn },
              { text: 'Wobble', href: withParams({ wobble: '1', rotate: null }), active: wobbleOn },
            ],
          },
        ]),
    {
      label: 'DPI',
      links: [
        { text: '1×', href: withParams({ dpr: '1' }), active: dpr === '1' },
        { text: '2×', href: withParams({ dpr: '2' }), active: dpr === '2' },
      ],
    },
    {
      label: 'Backend',
      links: [
        { text: 'WebGPU', href: withParams({ renderer: null }), active: !webgl },
        { text: 'WebGL', href: withParams({ renderer: 'webgl' }), active: webgl },
      ],
    },
    {
      label: 'Lang',
      links: [
        { text: 'EN', href: withParams({ lang: null }), active: !zh },
        { text: '简中', href: withParams({ lang: 'zh' }), active: zh },
      ],
    },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '8px 16px',
        margin: 8,
        borderRadius: 8,
        background: 'rgba(11, 14, 19, 0.66)',
        border: '1px solid rgba(230, 237, 243, 0.12)',
        backdropFilter: 'blur(6px)',
        color: 'rgba(230, 237, 243, 0.62)',
        font: "500 12px/1 ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
        letterSpacing: '0.02em',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      <span style={{ color: '#e6edf3', fontWeight: 700, letterSpacing: '0.04em' }}>Slug</span>
      {groups.map((group) => (
        <span key={group.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'rgba(230, 237, 243, 0.4)' }}>{group.label}</span>
          {group.links.map((link, index) => (
            <span key={link.text} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {index > 0 && <span style={{ color: 'rgba(230, 237, 243, 0.25)' }}>·</span>}
              <a
                href={link.href}
                style={{
                  color: link.active ? '#e6edf3' : 'rgba(230, 237, 243, 0.62)',
                  textDecoration: link.active ? 'underline' : 'none',
                  textUnderlineOffset: 3,
                }}
              >
                {link.text}
              </a>
            </span>
          ))}
        </span>
      ))}
    </div>
  )
}

/**
 * Ladder-mode `window.__uikitPerf` bridge — same GPU-ms / drawCalls / backend contract
 * the harness reads for the default scene. Also fills the shared `perfRef` each frame for the
 * in-scene HUD. `setLevel`/`setMode`/`setComplexity` are no-ops: the ladder is a fixed scene
 * with nothing to sweep. (`window.__benchReady` is raised by the scene, which — unlike this
 * bridge — only runs once the font has resolved.)
 */
function LadderBridge({ perfRef }: { perfRef: RefObject<PerfSample> }) {
  const gl = useThree((threeState) => threeState.gl)
  const renderer = useThree((threeState) => threeState.renderer)
  const scene = useThree((threeState) => threeState.scene)
  const camera = useThree((threeState) => threeState.camera)
  const gpuMsRef = useRef(0)

  useEffect(() => {
    // DEV shader-dump handle: exposes the live three objects so a Playwright probe can call
    // renderer.debug.getShaderAsync(scene, camera, mesh) to emit the compiled WGSL/GLSL. Inert
    // at runtime (a window ref), removed on unmount.
    Object.assign(window, { __three: { gl, renderer, scene, camera } })
    window.__uikitPerf = {
      getState: () => ({
        mode: 'ladder',
        level: 0,
        items: LADDER_SIZES.length,
        objects: countObjects(scene),
        render: { ...gl.info.render },
        memory: { ...gl.info.memory },
        gpuMs: gpuMsRef.current,
        backend: getBackend(renderer),
      }),
      setLevel: () => {},
      setMode: () => {},
      setComplexity: () => {},
    }
    // three auto-resets info at each render's START (before the update-phase useFrame), which
    // would zero drawCalls before we read it in-frame. Own the reset ourselves (at the tail of
    // the useFrame, before the next render) so both getState AND the HUD read the last render's
    // count.
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
      delete window.__uikitPerf
      delete (window as { __three?: unknown }).__three
    }
  }, [gl, renderer, scene, camera])

  useFrame((_frameState, delta) => {
    // `gl.info` still holds the frame that just rendered (we own the reset at the tail below),
    // so read draw calls now. frame/fps are EMA-smoothed so the HUD digits are steady.
    const perf = perfRef.current
    const render = gl.info.render as unknown as { drawCalls?: number; calls?: number }
    perf.drawCalls = render.drawCalls || render.calls || 0
    const frameMs = delta * 1000
    perf.frameMs = perf.frameMs === 0 ? frameMs : perf.frameMs * 0.9 + frameMs * 0.1
    perf.fps = perf.frameMs > 0 ? 1000 / perf.frameMs : 0
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    perf.memMB = mem != null ? mem.usedJSHeapSize / 1048576 : 0
    perf.gpuMs = gpuMsRef.current

    const timed = gl as unknown as { resolveTimestampsAsync?: (type: string) => Promise<number> }
    timed
      .resolveTimestampsAsync?.('render')
      .then((durationMs) => {
        if (typeof durationMs === 'number' && durationMs > 0) {
          gpuMsRef.current = durationMs
        }
      })
      .catch(() => {})
    gl.info.reset()
  })

  return null
}

function Header({
  state,
  preset,
  setLevel,
  setMode,
}: {
  state: SceneState
  preset: Preset
  setLevel: (level: number) => void
  setMode: (mode: Mode) => void
}) {
  return (
    <Container
      height={96}
      alignSelf="stretch"
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      gap={20}
      padding={18}
      borderRadius={8}
      backgroundColor="#ffffff"
      borderWidth={1}
      borderColor="#d7dee8"
    >
      <Container flexDirection="column" gap={4}>
        <Text fontSize={26} fontWeight="bold" color={ink}>
          R3F UI Performance Lab
        </Text>
        <Text color={muted}>
          Preset {preset.label} keeps {preset.items.toLocaleString()} live cards in view.
        </Text>
      </Container>
      <Container flexDirection="row" gap={14} alignItems="center">
        <SegmentedControl
          values={modes}
          value={state.mode}
          onChange={(value) => setMode(value as Mode)}
          width={330}
        />
        <Container flexDirection="row" gap={6} alignItems="center">
          {presets.map((item, index) => (
            <StepButton
              key={item.label}
              selected={state.level === index}
              label={`${index + 1}`}
              onClick={() => setLevel(index)}
            />
          ))}
        </Container>
      </Container>
    </Container>
  )
}

function SegmentedControl({
  values,
  value,
  onChange,
  width,
}: {
  values: Array<{ id: string; label: string }>
  value: string
  onChange: (value: string) => void
  width: number
}) {
  return (
    <Container
      flexDirection="row"
      width={width}
      height={42}
      padding={4}
      gap={4}
      borderRadius={8}
      backgroundColor="#e8edf2"
    >
      {values.map((item) => {
        const selected = value === item.id
        return (
          <Container
            key={item.id}
            flexGrow={1}
            alignItems="center"
            justifyContent="center"
            borderRadius={6}
            backgroundColor={selected ? '#172033' : '#e8edf2'}
            hover={{ backgroundColor: selected ? '#172033' : '#d9e1ea' }}
            onClick={() => onChange(item.id)}
          >
            <Text color={selected ? '#ffffff' : ink} fontSize={13}>
              {item.label}
            </Text>
          </Container>
        )
      })}
    </Container>
  )
}

function StepButton({
  selected,
  label,
  onClick,
}: {
  selected: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Container
      width={36}
      height={36}
      alignItems="center"
      justifyContent="center"
      borderRadius={6}
      backgroundColor={selected ? '#2d6cdf' : '#ffffff'}
      borderWidth={1}
      borderColor={selected ? '#2d6cdf' : '#cad3df'}
      hover={{ backgroundColor: selected ? '#245bbd' : '#eef3f7' }}
      onClick={onClick}
    >
      <Text color={selected ? '#ffffff' : ink} fontSize={13} fontWeight="bold">
        {label}
      </Text>
    </Container>
  )
}

function SummaryPanel({ state, preset }: { state: SceneState; preset: Preset }) {
  const rows = [
    ['Mode', state.mode],
    ['Cards', preset.items.toLocaleString()],
    ['Columns', preset.columns.toLocaleString()],
    ['Text runs', (state.mode === 'cards' ? preset.items : preset.items * 2).toLocaleString()],
    ['Signals', state.mode === 'sampled' ? preset.items.toLocaleString() : '0'],
  ]

  return (
    <Container
      width={300}
      flexShrink={0}
      flexDirection="column"
      gap={14}
      padding={18}
      borderRadius={8}
      backgroundColor="#ffffff"
      borderWidth={1}
      borderColor="#d7dee8"
    >
      <Text fontSize={18} fontWeight="bold" color={ink}>
        Load Shape
      </Text>
      {rows.map(([label, value]) => (
        <Container
          key={label}
          height={38}
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Text color={muted}>{label}</Text>
          <Text color={ink} fontWeight="bold">
            {value}
          </Text>
        </Container>
      ))}
      <Container height={1} backgroundColor="#d7dee8" />
      <Text color={muted} lineHeight="150%">
        Cards isolates layout and glyph instancing. Decorated adds panel groups, hover styles,
        borders, and depth. Sampled adds one relative-center effect and color signal per card.
      </Text>
    </Container>
  )
}

function WorkSurface({ state, preset }: { state: SceneState; preset: Preset }) {
  const columns = preset.columns
  const rows = Math.ceil(preset.items / columns)
  const cellWidth = state.level > 4 ? 38 : state.level > 2 ? 46 : 58
  const cellHeight = state.mode === 'cards' ? 30 : 40
  const surfaceWidth = columns * cellWidth
  const surfaceHeight = rows * cellHeight
  const items = useMemo(
    () =>
      new Array(preset.items).fill(null).map((_, index) => ({
        id: index,
        hue: palette[index % palette.length]!,
        value: 20 + ((index * 17) % 80),
        radius: 3 + (index % 4),
        border: index % 3 === 0 ? 1 : 0,
        z: (index % 8) * 0.25,
      })),
    [preset.items]
  )

  return (
    <Container
      flexGrow={1}
      minWidth={0}
      overflow="scroll"
      padding={14}
      borderRadius={8}
      backgroundColor="#f8fafc"
      borderWidth={1}
      borderColor="#d7dee8"
    >
      <Container
        width={surfaceWidth}
        height={surfaceHeight}
        flexDirection="row"
        flexWrap="wrap"
        alignContent="flex-start"
        gap={0}
      >
        {items.map((item) =>
          state.mode === 'sampled' ? (
            <SampledCard
              key={item.id}
              item={item}
              width={cellWidth}
              height={cellHeight}
              surfaceWidth={surfaceWidth}
            />
          ) : (
            <StressCard
              key={item.id}
              item={item}
              width={cellWidth}
              height={cellHeight}
              decorated={state.mode === 'decorated'}
            />
          )
        )}
      </Container>
    </Container>
  )
}

type Item = {
  id: number
  hue: string
  value: number
  radius: number
  border: number
  z: number
}

function StressCard({
  item,
  width,
  height,
  decorated,
}: {
  item: Item
  width: number
  height: number
  decorated: boolean
}) {
  return (
    <Container
      width={width}
      height={height}
      padding={decorated ? 5 : 3}
      flexDirection="column"
      justifyContent="center"
      gap={2}
      backgroundColor={decorated ? item.hue : '#ffffff'}
      borderRadius={decorated ? item.radius : 2}
      borderWidth={decorated ? item.border : 0}
      borderColor="#7b8794"
      transformTranslateZ={decorated ? item.z : 0}
      {...(decorated ? { hover: { backgroundColor: '#ffffff', borderColor: '#172033' } } : {})}
    >
      <Text pointerEvents="none" color={ink} fontSize={decorated ? 11 : 10}>
        {item.id}
      </Text>
      {decorated && (
        <Text pointerEvents="none" color="#334155" fontSize={9}>
          {item.value}%
        </Text>
      )}
    </Container>
  )
}

function SampledCard({
  item,
  width,
  height,
  surfaceWidth,
}: {
  item: Item
  width: number
  height: number
  surfaceWidth: number
}) {
  const color = useMemo(() => signal(new Color(item.hue)), [item.hue])
  const ref = useRef<VanillaContainer>(null)

  useEffect(() => {
    const internals = ref.current
    if (internals == null) {
      return
    }
    return effect(() => {
      const center = internals.relativeCenter.value
      if (center == null) {
        return
      }
      const wave = (Math.sin((center[0] / surfaceWidth) * Math.PI * 4) + 1) * 0.5
      color.value = new Color().setHSL((wave + item.id * 0.0007) % 1, 0.68, 0.62)
    })
  }, [color, item.id, surfaceWidth])

  return (
    <Container
      ref={ref}
      width={width}
      height={height}
      padding={5}
      flexDirection="column"
      justifyContent="center"
      gap={2}
      backgroundColor={color}
      borderRadius={item.radius}
      borderWidth={item.border}
      borderColor="#64748b"
      transformTranslateZ={item.z}
      hover={{ backgroundColor: '#ffffff', borderColor: '#172033' }}
    >
      <Text pointerEvents="none" color={ink} fontSize={10}>
        {item.id}
      </Text>
      <Text pointerEvents="none" color="#334155" fontSize={9}>
        {item.value}%
      </Text>
    </Container>
  )
}

/**
 * Reads the renderer's active backend the same way R3F's own webgpu Canvas
 * does internally (`backend && "isWebGPUBackend" in backend`) — the fallback
 * WebGL2 backend lacks that marker.
 */
function getBackend(renderer: unknown): Backend {
  const backend = (renderer as { backend?: unknown } | null | undefined)?.backend
  return backend != null && typeof backend === 'object' && 'isWebGPUBackend' in backend
    ? 'webgpu'
    : 'webgl'
}

function PerformanceBridge({
  state,
  setState,
}: {
  state: SceneState
  setState: (updater: (current: SceneState) => SceneState) => void
}) {
  const gl = useThree((threeState) => threeState.gl)
  const renderer = useThree((threeState) => threeState.renderer)
  const scene = useThree((threeState) => threeState.scene)
  const latest = useRef(state)
  latest.current = state
  // GPU time (ms) from the renderer's timestamp query, read back asynchronously (trails 1-2 frames).
  const gpuMsRef = useRef(0)

  useEffect(() => {
    window.__uikitPerf = {
      getState: () => ({
        ...latest.current,
        ...presets[latest.current.level]!,
        objects: countObjects(scene),
        render: { ...gl.info.render },
        memory: { ...gl.info.memory },
        gpuMs: gpuMsRef.current,
        backend: getBackend(renderer),
      }),
      setLevel: (level) => setState((current) => ({ ...current, level: clampLevel(level) })),
      setMode: (mode) => setState((current) => ({ ...current, mode })),
      setComplexity: (level, mode) =>
        setState((current) => ({
          mode: mode ?? current.mode,
          level: clampLevel(level),
        })),
    }
    return () => {
      delete window.__uikitPerf
    }
  }, [gl, renderer, scene, setState])

  useFrame(() => {
    // Async GPU-timing readback: resolveTimestampsAsync resolves to the render duration in MS (WebGPU
    // via TimestampQuery, WebGL2 via EXT_disjoint_timer_query). It trails a frame or two — fine for a
    // benchmark that samples p50/p95 over many frames.
    const timed = gl as unknown as { resolveTimestampsAsync?: (type: string) => Promise<number> }
    timed
      .resolveTimestampsAsync?.('render')
      .then((durationMs) => {
        if (typeof durationMs === 'number' && durationMs > 0) {
          gpuMsRef.current = durationMs
        }
      })
      .catch(() => {})
    gl.info.reset()
  })

  return null
}

function readInitialState(): SceneState {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  const levelParam = params.get('level')
  const level = levelParam == null ? undefined : Number(levelParam)
  return {
    mode: mode === 'decorated' || mode === 'sampled' ? mode : 'cards',
    level: level != null && Number.isFinite(level) ? clampLevel(level) : 1,
  }
}

function clampLevel(level: number) {
  return Math.min(Math.max(Math.round(level), 0), presets.length - 1)
}

function countObjects(root: { traverse: (callback: () => void) => void }) {
  let count = 0
  root.traverse(() => {
    count += 1
  })
  return count
}
