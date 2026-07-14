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
  installIconAtlas,
} from '@three-flatland/uikit/react'
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

// Simplified-Chinese content font: a COMMON SUBSET of Noto Sans SC (OFL) — 358 of the most
// common hanzi + Latin + punctuation, 741 glyphs total. It packs into ONE curve/band page
// (4096×32, ~2.1MB GPU) — the whole point: a common subset needs no paging, only subsetting.
// (Full Noto SC is ~65k glyphs ≈ 229MB, which is why you can't hold the whole repertoire.)
// Loaded lazily and ONLY under ?lang=zh so the Latin path never downloads or packs it.
let zhFontPromise: Promise<SlugFont> | null = null

/**
 * The scene's CONTENT font, chosen by the language toggle: the Noto SC subset under
 * `?lang=zh`, else Inter. `lang` is a reload-scoped URL param (constant for the mount), so a
 * single unconditional `use()` picks the right promise — no conditional-hook violation.
 */
function useContentFont(): SlugFont {
  const promise =
    readLang() === 'zh'
      ? (zhFontPromise ??= SlugFontLoader.load('./NotoSansSC-common.ttf'))
      : (interFontPromise ??= SlugFontLoader.load('./Inter-Regular.ttf'))
  return use(promise)
}

// The baked full-Lucide icon atlas (1,594 shapes, keyed by kebab basename — see ICON_NAMES).
// Installed ONCE and shared by every scene, so every `<Svg icon>` resolves with zero SVG
// parsing at runtime — the fork's analog of useSharedFont, but for shapes instead of glyphs.
let iconAtlasPromise: Promise<void> | null = null
function useIconAtlas(): void {
  iconAtlasPromise ??= installIconAtlas('./icons.slug.glb')
  use(iconAtlasPromise)
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
// 13 doubling-ish steps (8→192). Dense enough that sub-pixel crawl shows at every size the
// eye actually reads text at — the whole point of the shipped shimmer test. The former 256px
// top step overflowed the fold at common screen sizes; 192 leaves a little more breathing room.
const LADDER_SIZES = [8, 10, 12, 14, 16, 20, 24, 32, 48, 64, 96, 128, 192]
const LADDER_FG = '#e6edf3'
const LADDER_BG = '#0b0e13'
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

// Simplified-Chinese content for ?lang=zh. Every character here is inside the baked common
// subset (NotoSansSC-common.ttf) — the ladder sentence and the grid's random-label pool. The
// pool is the exact 358 unique hanzi the font was subset to, so nothing renders as notdef.
const ZH_LADDER_TEXT = '图形渲染是计算机科学中一个重要而有趣的领域'
const ZH_HANZI =
  '图形渲染是计算机科学中一个重要而有趣的领域我们使用现代着色器语言来绘制文字和矢量状这库支持网页接口能够在浏览里高效地显示成千上万符性非常关键必须尽减少调数合理利存与带宽体包含大因此只加载子集设师开发者都可以轻松创建漂亮二维场景无论游戏还据视化获得流畅验今天气很好阳光明媚微风吹过小朋友起去公园散步看见许多美丽花草树木他坐长椅聊谈最近读书籍电影时间真快转眼已经到了傍晚分习需坚不懈努力也正确方法良惯每人应该保奇心勇于探索未知三四五六七八九十百颜红橙黄绿青蓝紫黑白灰东西南北春夏秋冬年月日秒国家城市乡村山川河湖海星辰雨雷父母女兄弟姐妹老同医生工农民商吃饭喝水睡觉走路说话听写想做玩笑哭闹跑跳低短慢新旧远深浅冷热干湿济政治教育技艺术历史音乐物外爱平尊自然珍惜命追求团结善诚实守信勤劳节俭助段测试质速度请仔细观察笔画否清晰锐'

// The 62-icon pool, cycled deterministically per cell — kebab basenames resolved zero-parse
// against the baked atlas installed by useIconAtlas. The MSDF twin instead imports 62 Lucide
// mesh COMPONENTS in this same order (Activity, Airplay, …, Zap), so the two lists are a pure
// name/component pairing. Order is load-bearing: the PRNG indexes into it, so both apps MUST
// keep this list identical for the grids to match.
const ICON_NAMES = [
  'activity',
  'airplay',
  'anchor',
  'aperture',
  'apple',
  'archive',
  'atom',
  'award',
  'battery-full',
  'bell',
  'book',
  'box',
  'camera',
  'check',
  'clock',
  'cloud',
  'code',
  'coffee',
  'compass',
  'cpu',
  'crown',
  'database',
  'diamond',
  'feather',
  'flag',
  'flame',
  'flower',
  'folder',
  'gem',
  'gift',
  'globe',
  'hammer',
  'heart',
  'house',
  'image',
  'key',
  'leaf',
  'lock',
  'mail',
  'map',
  'moon',
  'music',
  'rocket',
  'save',
  'search',
  'send',
  'settings',
  'shield',
  'star',
  'sun',
  'tag',
  'target',
  'terminal',
  'trophy',
  'umbrella',
  'user',
  'video',
  'wallet',
  'wifi',
  'wind',
  'wrench',
  'zap',
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
 * Deterministic (icon, label) for grid cell `i`: a random icon index into ICON_NAMES and a
 * random label. `zh` swaps the ASCII alphabet for the common-hanzi pool and shortens the label
 * to 1–3 glyphs (hanzi are full-width, so 3 fit the cell where 6 Latin do). PURE — same grid
 * every run. `iconIndex` is drawn at the SAME r() call the old `Icon` pick used, so the PRNG
 * sequence (and the MSDF twin's parity) is untouched.
 */
function gridCell(i: number, zh: boolean): { iconIndex: number; text: string } {
  const r = mulberry32((GRID_SEED + Math.imul(i, 0x9e3779b9)) | 0)
  const iconIndex = Math.floor(r() * ICON_NAMES.length)
  const pool = zh ? ZH_HANZI : GRID_ALPHA
  const len = 1 + Math.floor(r() * (zh ? 3 : 6))
  let text = ''
  for (let k = 0; k < len; k++) {
    text += pool[Math.floor(r() * pool.length)]
  }
  return { iconIndex, text }
}

// ── LANGUAGE toggle (?lang=en|zh) ────────────────────────────────────────────
// A second-pass Simplified-Chinese switch, present in every benchmark's nav. `zh` DOES render: a
// common subset of Noto Sans SC (358 hanzi, 741 glyphs) packs into ONE curve/band page, so the
// content actually shown needs no paging. The R32Float band-atlas repack still caps a single
// glyph page (curve texture ≤4096 rows, band offset <16383), so the FULL ~65k-glyph CJK
// repertoire needs multi-page bakes (planning/perf/glyph-paging-design.md) — that gap is what
// CostPopover's cost table explains, not a gate on the subset rendered here.
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
  dpr: number
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
 * Read the ladder query params ONCE at load: `?rotate=D`, `?dpr=N` (default 1), `?wobble=1`.
 * The MODE is derived (reload-based, so each path sets up its whole Canvas differently): any
 * yaw (`wobble` or a nonzero `rotate`) selects the world-space 3D path; otherwise the 2D
 * screen-space path.
 */
function readLadderParams(): LadderParams {
  const params = new URLSearchParams(window.location.search)
  const rotate = Number(params.get('rotate'))
  const rotateDeg = Number.isFinite(rotate) ? rotate : 0
  const dprParam = params.get('dpr')
  const dprValue = dprParam == null ? NaN : Number(dprParam)
  const dpr = Number.isFinite(dprValue) && dprValue > 0 ? dprValue : 1
  const wobble = params.get('wobble') === '1'
  return {
    rotateDeg,
    dpr,
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
        // `dpr` defaults to 1 (readLadderParams) — device-dpr scaling is opt-in via ?dpr=2.
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
      <CostPopover />
    </>
  )
}

/**
 * DENSE LABEL-GRID app (?scene=labelgrid) — the ladder's structural twin. Reload-branched 2D/3D
 * exactly like `LadderApp` (same `readLadderParams`, same camera/dpr/OrbitControls shape), and
 * reuses the ladder's whole shell: the same renderer config, the same
 * `LadderBridge`/`PerfHud`/`HudCycleOverlay` perf plumbing, and the same `LadderNav`.
 */
function LabelGridApp() {
  const { rotateDeg, dpr, wobble, mode } = useMemo(() => readLadderParams(), [])
  const rendererConfig = useRendererConfig()
  const perfRef = useRef<PerfSample>({ fps: 0, frameMs: 0, gpuMs: 0, drawCalls: 0, memMB: 0 })
  const metricRef = useRef<MetricId>('gpu')
  const is3d = mode === '3d'

  return (
    <>
      <Canvas
        events={noEvents}
        style={{ height: '100dvh', touchAction: 'none' }}
        renderer={rendererConfig}
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
          {is3d ? <LabelGrid3DScene rotateDeg={rotateDeg} wobble={wobble} /> : <LabelGrid2DScene />}
          <PerfHud perfRef={perfRef} metricRef={metricRef} />
        </Suspense>
        {is3d && <LadderControls />}
      </Canvas>
      <LadderNav />
      <HudCycleOverlay metricRef={metricRef} />
      <CostPopover />
    </>
  )
}

/**
 * One hairline-bordered (excel-like) icon+label cell per grid entry — no Fullscreen/Root
 * wrapper, just the cells, so both the 2D and 3D grid scenes share this exact markup and only
 * differ in what wraps it.
 */
function GridCells({ cells }: { cells: Array<{ iconIndex: number; text: string }> }) {
  return (
    <>
      {cells.map(({ iconIndex, text }, i) => (
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
          <Svg
            icon={ICON_NAMES[iconIndex]!}
            width={GRID_ICON}
            height={GRID_ICON}
            color={GRID_FG}
            flexShrink={0}
          />
          <Text fontSize={GRID_FONT} fontFamily="inter" color={GRID_FG} wordBreak="keep-all">
            {text}
          </Text>
        </Container>
      ))}
    </>
  )
}

/**
 * 2D path — fill the viewport with as many `GRID_CELL_W × GRID_CELL_H` cells as fit. `flex-wrap`
 * on a full-width Fullscreen packs the cells left-to-right, top-to-bottom. Cell count is derived
 * from the live viewport ONCE at mount — several thousand on a laptop.
 */
function LabelGrid2DScene() {
  const font = useContentFont()
  useIconAtlas()
  useBenchReady()
  const cells = useMemo(() => {
    const zh = readLang() === 'zh'
    const cols = Math.max(1, Math.floor(window.innerWidth / GRID_CELL_W))
    const rows = Math.max(1, Math.floor(window.innerHeight / GRID_CELL_H))
    const count = cols * rows
    return Array.from({ length: count }, (_unused, i) => gridCell(i, zh))
  }, [])

  return (
    <Fullscreen
      flexDirection="row"
      flexWrap="wrap"
      alignContent="flex-start"
      justifyContent="flex-start"
      fontFamilies={{ inter: { normal: font } }}
    >
      <GridCells cells={cells} />
    </Fullscreen>
  )
}

/**
 * The 14 shared rows: a Lucide "atom" `<Svg icon>` + the pangram at each fontSize, the icon
 * sized to and vertically centered with the text. TEXT + ICON ONLY — no backgroundColor/border,
 * so uikit draws nothing but glyphs and the analytic atom shape. The PARENT sets alignment
 * (2D Fullscreen: top-left; 3D Root: centered), so this stays layout-agnostic. `icon="atom"`
 * resolves zero-parse against the baked atlas (see useIconAtlas) — pinned to match the MSDF app.
 */
function LadderRows({ text }: { text: string }) {
  return (
    <>
      {LADDER_SIZES.map((size) => (
        <Container key={size} flexDirection="row" alignItems="center" gap={Math.round(size * 0.3)}>
          <Svg icon="atom" width={size} height={size} color={LADDER_FG} flexShrink={0} />
          <Text fontSize={size} fontFamily="inter" color={LADDER_FG} wordBreak="keep-all">
            {text}
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
  const font = useContentFont()
  useIconAtlas()
  useBenchReady()
  const text = readLang() === 'zh' ? ZH_LADDER_TEXT : LADDER_TEXT
  return (
    <Fullscreen
      flexDirection="column"
      justifyContent="flex-start"
      alignItems="flex-start"
      gap={LADDER_GAP}
      padding={LADDER_2D_PADDING}
      fontFamilies={{ inter: { normal: font } }}
    >
      <LadderRows text={text} />
    </Fullscreen>
  )
}

/**
 * Drives a group's Y yaw as a slow sine wobble when `wobble` is on (ref mutation, never
 * setState — `delta` is R3F's per-frame seconds, accumulated for the phase). Shared by every 3D
 * scene so the wobble math lives in exactly one place. When off, the group's static `rotation`
 * prop stands untouched (and OrbitControls still orbits it).
 */
function useWobbleGroup(wobble: boolean): RefObject<Group | null> {
  const groupRef = useRef<Group>(null)
  const elapsedRef = useRef(0)
  useFrame((_frameState, delta) => {
    const group = groupRef.current
    if (wobble && group != null) {
      elapsedRef.current += delta
      const amp = (LADDER_WOBBLE_AMP_DEG * Math.PI) / 180
      group.rotation.y = amp * Math.sin((elapsedRef.current / LADDER_WOBBLE_PERIOD_S) * Math.PI * 2)
    }
  })
  return groupRef
}

/**
 * 3D path — world-space `<Root>` inside the wobble group. Rows are CENTER-aligned and the
 * Root's default center anchor puts the ladder's own middle on the group origin, so the sine
 * yaw (and OrbitControls) pivot on the center of the text block, not a corner. TEXT + ICON
 * ONLY; the dark backdrop is the three.js clear color.
 */
function Ladder3DScene({ rotateDeg, wobble }: { rotateDeg: number; wobble: boolean }) {
  const font = useContentFont()
  useIconAtlas()
  useBenchReady()
  const text = readLang() === 'zh' ? ZH_LADDER_TEXT : LADDER_TEXT
  const yaw = (rotateDeg * Math.PI) / 180
  const groupRef = useWobbleGroup(wobble)

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
        <LadderRows text={text} />
      </Root>
    </group>
  )
}

/**
 * 3D path for the dense grid — mirrors Ladder3DScene: a world-space `<Root>` in the wobble
 * group, CENTER-aligned, the same sine-yaw wobble. Cell count is derived from the ROOT's own
 * size (`LADDER_ROOT_WIDTH`/`HEIGHT`), not the live viewport, so it's fixed regardless of camera
 * framing — a fixed-size inner `<Container>` does the flex-wrap packing, centered inside Root.
 */
function LabelGrid3DScene({ rotateDeg, wobble }: { rotateDeg: number; wobble: boolean }) {
  const font = useContentFont()
  useIconAtlas()
  useBenchReady()
  const yaw = (rotateDeg * Math.PI) / 180
  const groupRef = useWobbleGroup(wobble)
  const cells = useMemo(() => {
    const zh = readLang() === 'zh'
    const cols = Math.max(1, Math.floor(LADDER_ROOT_WIDTH / GRID_CELL_W))
    const rows = Math.max(1, Math.floor(LADDER_ROOT_HEIGHT / GRID_CELL_H))
    const count = cols * rows
    return Array.from({ length: count }, (_unused, i) => gridCell(i, zh))
  }, [])

  return (
    <group ref={groupRef} rotation={[0, yaw, 0]}>
      <Root
        width={LADDER_ROOT_WIDTH}
        height={LADDER_ROOT_HEIGHT}
        justifyContent="center"
        alignItems="center"
        overflow="visible"
        fontFamilies={{ inter: { normal: font } }}
      >
        <Container
          width={LADDER_ROOT_WIDTH}
          height={LADDER_ROOT_HEIGHT}
          flexDirection="row"
          flexWrap="wrap"
          alignContent="flex-start"
          justifyContent="flex-start"
        >
          <GridCells cells={cells} />
        </Container>
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
function PerfHud({
  perfRef,
  metricRef,
}: {
  perfRef: RefObject<PerfSample>
  metricRef: RefObject<MetricId>
}) {
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
        metricRef.current =
          HUD_CYCLE[(HUD_CYCLE.indexOf(metricRef.current) + 1) % HUD_CYCLE.length]!
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

// GPU curve/band-page memory per CJK coverage tier, for CostPopover's table. Slug's cost model:
// a page holds a fixed curve/band budget, so cost scales with glyph count, not repertoire size —
// the common 3,500-hanzi tier is the one this app actually ships (see the language-toggle
// comment above readLang).
const ZH_COST_ROWS: Array<{ tier: string; glyphs: string; cost: string }> = [
  { tier: 'common 3,500', glyphs: '3,500', cost: '12 MB (1 page)' },
  { tier: 'GB2312', glyphs: '6,763', cost: '24 MB (1 page)' },
  { tier: 'GBK', glyphs: '21,000', cost: '74 MB (1 page)' },
  { tier: 'full CJK (Noto SC)', glyphs: '65,535', cost: '229 MB (paged)' },
]
const COST_PANEL_FONT = "500 11px/1.4 ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace"

/**
 * Simplified-Chinese cost popover (Slug app) — a fixed DOM panel shown ONLY when `?lang=zh`,
 * breaking down Slug's curve/band GPU-memory cost per CJK coverage tier (see ZH_COST_ROWS).
 * Dismissible: `×` hides it (local useState, no persistence); a small "cost" chip (bottom-right)
 * reopens it. Pure DOM, zero render cost — never touches the Canvas.
 */
function CostPopover() {
  const [open, setOpen] = useState(true)
  if (readLang() !== 'zh') {
    return null
  }
  if (!open) {
    return (
      <button
        type="button"
        aria-label="Show Slug's CJK GPU-memory cost table"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          padding: '6px 12px',
          borderRadius: 999,
          background: 'rgba(11, 14, 19, 0.82)',
          border: '1px solid rgba(74, 222, 128, 0.4)',
          color: '#e6edf3',
          font: COST_PANEL_FONT,
          cursor: 'pointer',
          backdropFilter: 'blur(6px)',
          zIndex: 20,
        }}
      >
        cost
      </button>
    )
  }
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        width: 400,
        maxWidth: 'calc(100vw - 24px)',
        padding: '10px 14px 12px',
        borderRadius: 10,
        background: 'rgba(11, 14, 19, 0.9)',
        border: '1px solid rgba(74, 222, 128, 0.4)',
        color: '#e6edf3',
        font: COST_PANEL_FONT,
        backdropFilter: 'blur(6px)',
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span>
          <strong style={{ color: '#4ade80' }}>简体中文</strong> · Slug curve-memory cost
        </span>
        <button
          type="button"
          aria-label="Dismiss the cost table"
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(230, 237, 243, 0.62)',
            font: COST_PANEL_FONT,
            cursor: 'pointer',
            padding: '0 0 0 8px',
          }}
        >
          ×
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'rgba(230, 237, 243, 0.4)', textAlign: 'left' }}>
            <th style={{ fontWeight: 500, padding: '2px 6px 4px 0' }}>tier</th>
            <th style={{ fontWeight: 500, padding: '2px 6px 4px' }}>glyphs</th>
            <th style={{ fontWeight: 500, padding: '2px 0 4px' }}>Slug (curves)</th>
          </tr>
        </thead>
        <tbody>
          {ZH_COST_ROWS.map((row) => (
            <tr key={row.tier}>
              <td style={{ padding: '2px 6px 2px 0' }}>{row.tier}</td>
              <td style={{ padding: '2px 6px' }}>{row.glyphs}</td>
              <td style={{ padding: '2px 0' }}>{row.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, color: 'rgba(230, 237, 243, 0.62)' }}>
        Common subset renders here (741 glyphs, 1 page, ~2.1&nbsp;MB). Resolution-independent —
        crisp at any size.
      </div>
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

  // Bench switches scene, View sets rotate/wobble, Lang switches pass; ALL groups show on EVERY
  // route (ladder + grid) so any demo is reachable from any demo. View's rotate/wobble params
  // apply just as well to the grid's 3D branch as to the ladder's.
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
    {
      label: 'DPI',
      links: [
        { text: '1×', href: withParams({ dpr: '1' }), active: dpr == null || dpr === '1' },
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
        flexWrap: 'nowrap',
        whiteSpace: 'nowrap',
        alignItems: 'center',
        gap: 13,
        maxWidth: 'calc(100vw - 16px)',
        padding: '8px 14px',
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
        <span key={group.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'rgba(230, 237, 243, 0.4)' }}>{group.label}</span>
          {group.links.map((link, index) => (
            <span key={link.text} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
