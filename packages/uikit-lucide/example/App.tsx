import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Inspector } from 'three/addons/inspector/Inspector.js'
import {
  Fullscreen,
  Container,
  Svg,
  Text,
  canvasInputProps,
  installIconAtlas,
  setPreferredColorScheme,
} from '@three-flatland/uikit/react'
import type { Container as VanillaContainer } from '@three-flatland/uikit'
import { colors, Button, Input } from '@three-flatland/uikit-default/react'
import * as LucideIcons from '@three-flatland/uikit-lucide/react'
import { SlugFontLoader } from '@three-flatland/slug/react'
import type { SlugFont } from '@three-flatland/slug'
import { suspend } from 'suspend-react'
import iconNames from './icon-names.json'
import iconTags from './icon-tags.json'

// ============================================================================
// uikit-lucide icon browser — the showcase for `@three-flatland/uikit-lucide`.
//
// Every lucide icon (1594) is enumerated FROM SOURCE by `generate-icon-list.mts`
// (reads `../icons/*.svg` basenames → `icon-names.json`, plus `icon-tags.json`
// from lucide-static). The browser ships its OWN baked atlas of all of them
// (`public/lucide.shapes.glb`, produced from `lucide.icons.manifest.json` via
// `uikit-bake icons --manifest`), installed BEFORE the grid mounts — so every tile
// is a zero-parse baked lookup and all icons batch into ONE `InstancedShapeMesh`.
//
// The grid is VIRTUALIZED + RECYCLED: a pool of `windowRows × columns` cells, each
// filtered index binding to slot `index % poolSize`, so sliding one row rebinds
// only that row (offscreen, in the overscan buffer) — the uikit Container AND its
// `<Svg>` are reused (the `icon` prop just re-resolves), no unmount/remount churn.
// Search matches by NAME or TAG.
//
// Flow: search → select → Copy manifest → `uikit-bake icons --manifest <file>`.
// The browser's OUTPUT is that `IconBakeManifest` (see packages/uikit/src/cli.ts)
// for a consumer to bake their own trimmed atlas; the browser itself ships the
// full one so scrolling all 1594 stays on the baked (parse-free) path.
// ============================================================================

const ALL_ICONS: string[] = iconNames

/** Per-icon lowercased search haystack (`name + tags`), aligned to ALL_ICONS.
 * Built once at module load so filtering is a cheap substring scan. */
const HAYSTACKS: string[] = (() => {
  const tagMap = iconTags as Record<string, string[]>
  return ALL_ICONS.map((name) => `${name} ${(tagMap[name] ?? []).join(' ')}`.toLowerCase())
})()

// Responsive chip geometry (uikit px): columns = as many MIN_CHIP_W cells as fit the measured
// viewport (minus the gutter), then every cell stretches to divide the row evenly — no ragged
// right edge, and it reflows to fewer/more columns as the window resizes. Height tracks width by
// CHIP_ASPECT so tiles grow up/down proportionally. The live cell size rides in `win` so the
// virtualization math and the rendered chips agree on the same stride.
const MIN_CHIP_W = 104
const CHIP_ASPECT = 96 / 104
const GAP = 8
const OVERSCAN = 5 // rows rendered beyond the viewport each side — recycled, so the icon-swap happens offscreen and scroll never pops
const GUTTER = 18 // right gutter reserved so cells never slide under the scrollbar
const CHIP_ICON_SIZE = 26
const INITIAL_COLUMNS = 10

/** The recycled window: `poolSize` cells covering filtered indices [start, start+poolSize),
 *  one cell per pool slot (`index % poolSize`) so the same instances rebind as it slides. */
interface Window {
  start: number
  poolSize: number
  columns: number
  cellW: number
  cellH: number
}

/** Shape emitted to the clipboard — an `IconBakeManifest` (uikit CLI). */
interface BakeManifest {
  out: string
  sources: Array<{ path: string; name: string }>
}

/** One selectable icon tile, absolutely positioned at its grid cell. */
const IconChip = memo(function IconChip({
  name,
  selected,
  onToggle,
  top,
  left,
  width,
  height,
}: {
  name: string
  selected: boolean
  onToggle: (name: string) => void
  top: number
  left: number
  width: number
  height: number
}) {
  return (
    <Container
      positionType="absolute"
      positionTop={top}
      positionLeft={left}
      width={width}
      height={height}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap={8}
      padding={8}
      borderRadius={8}
      borderWidth={1}
      borderColor={selected ? colors.primary : colors.border}
      backgroundColor={selected ? colors.accent : colors.card}
      hover={{ borderColor: colors.primary }}
      cursor="pointer"
      onClick={() => onToggle(name)}
    >
      {name ? (
        // A single reusable <Svg> whose `icon` prop changes as the pool slot rebinds — the
        // uikit Svg re-resolves the baked shape reactively (no component swap, no GC churn).
        <Svg
          icon={name}
          width={CHIP_ICON_SIZE}
          height={CHIP_ICON_SIZE}
          color={selected ? colors.primary : colors.foreground}
        />
      ) : null}
      <Text
        fontSize={10}
        lineHeight="120%"
        textAlign="center"
        wordBreak="break-all"
        color={colors.mutedForeground}
      >
        {name}
      </Text>
    </Container>
  )
})

/**
 * Load the browser's assets in ONE suspense gate, before the grid ever mounts: first install
 * the baked all-icons atlas as the shared shape set — so every `<Icon>` resolves baked-by-name
 * (`icon: "settings"` → the packed shape), zero runtime parse, smooth scroll — THEN load the
 * text font. Installing here, a single gate ahead of any `<Svg>`, is what guarantees the icons
 * mount against the baked set (an already-mounted `Svg` keeps its old set). The ~4 MB GLB fetch
 * + decode is covered by the LoadingSplash. Absolute base URL so the loader resolves it against
 * the site root, not a module path.
 */
function useBrowserAssets(): SlugFont {
  return suspend(async () => {
    await installIconAtlas(`${import.meta.env.BASE_URL}lucide.shapes.glb`)
    return SlugFontLoader.load('./Inter-Regular.ttf', { forceRuntime: true })
  }, ['uikit-lucide-browser-assets'])
}

function IconBrowser() {
  const font = useBrowserAssets()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>())
  const [copyLabel, setCopyLabel] = useState('Copy manifest')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // The scroll container (a vanilla uikit `Container`) exposes reactive
  // `scrollPosition` / `size` signals — we poll them in `useFrame` to drive
  // virtualization without a per-tick React render (see below).
  const scrollRef = useRef<VanillaContainer | null>(null)
  const [win, setWin] = useState<Window>({
    start: 0,
    poolSize: INITIAL_COLUMNS * 15,
    columns: INITIAL_COLUMNS,
    cellW: MIN_CHIP_W,
    cellH: Math.round(MIN_CHIP_W * CHIP_ASPECT),
  })
  const lastWin = useRef<Window>(win)

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q === '' ? ALL_ICONS : ALL_ICONS.filter((_, i) => HAYSTACKS[i]!.includes(q))),
    [q]
  )

  // Reset to the top whenever the filter changes — the old scroll offset is
  // meaningless against a different (often shorter) result set.
  useEffect(() => {
    const c = scrollRef.current
    if (c) c.scrollPosition.value = [0, 0]
    lastWin.current = { start: -1, poolSize: 0, columns: 0, cellW: 0, cellH: 0 }
    setWin((w) => ({
      start: 0,
      poolSize: w.poolSize,
      columns: w.columns,
      cellW: w.cellW,
      cellH: w.cellH,
    }))
  }, [q])

  // Poll scroll offset + viewport size every frame; recompute the visible row
  // window and only `setState` when it actually changes (a row-boundary crossing
  // or a resize) — reading signals is cheap, React renders are not, so this is
  // where the thrash is avoided.
  useFrame(() => {
    const c = scrollRef.current
    if (c == null) return
    const size = c.size.value
    if (size == null) return
    const [w, h] = size
    // usable row width = viewport minus the left GAP and the reserved right GUTTER
    const availW = w - GAP - GUTTER
    // as many MIN_CHIP_W cells (+ their gaps) as fit, then stretch each to divide it evenly
    const columns = Math.max(1, Math.floor((availW + GAP) / (MIN_CHIP_W + GAP)))
    const cellW = Math.max(MIN_CHIP_W, Math.floor((availW - (columns - 1) * GAP) / columns))
    const cellH = Math.round(cellW * CHIP_ASPECT)
    const rowStride = cellH + GAP
    const scrollY = c.scrollPosition.value?.[1] ?? 0
    const firstRow = Math.max(0, Math.floor((scrollY - GAP) / rowStride) - OVERSCAN)
    const windowRows = Math.ceil(h / rowStride) + OVERSCAN * 2 + 1
    // pool spans a whole number of rows so a one-row slide reuses the vacated slots (see render)
    const poolSize = windowRows * columns
    const start = firstRow * columns
    const prev = lastWin.current
    if (
      prev.start !== start ||
      prev.poolSize !== poolSize ||
      prev.columns !== columns ||
      prev.cellW !== cellW ||
      prev.cellH !== cellH
    ) {
      lastWin.current = { start, poolSize, columns, cellW, cellH }
      setWin({ start, poolSize, columns, cellW, cellH })
    }
  })

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const name of filtered) next.add(name)
      return next
    })
  }, [filtered])

  const clearSelection = useCallback(() => setSelected(new Set<string>()), [])

  const copyManifest = useCallback(() => {
    const names = [...selected].sort((a, b) => a.localeCompare(b))
    if (names.length === 0) return
    const manifest: BakeManifest = {
      out: 'lucide.shapes.glb',
      sources: names.map((name) => ({
        path: `node_modules/@three-flatland/uikit-lucide/icons/${name}.svg`,
        name,
      })),
    }
    void navigator.clipboard.writeText(JSON.stringify(manifest, null, 2))
    setCopyLabel(`Copied ${names.length}`)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyLabel('Copy manifest'), 1600)
  }, [selected])

  const selectedCount = selected.size
  const columns = Math.max(1, win.columns)
  const poolSize = Math.max(columns, win.poolSize)
  const colStride = win.cellW + GAP
  const rowStride = win.cellH + GAP
  const totalRows = Math.ceil(filtered.length / columns)
  const contentHeight = GAP + totalRows * rowStride

  // RECYCLED pool: each filtered index i binds to pool slot `i % poolSize`. poolSize is a whole
  // number of rows, so sliding the window one row lands the entering row on the SAME slots the
  // leaving row vacated (i+poolSize ≡ i mod poolSize) — one row rebinds (offscreen, in the
  // overscan buffer) and every other slot is memo-skipped. No unmount/remount churn: the uikit
  // Container is reused and only its (baked, so cheap) icon swaps. Empty trailing slots park off.
  const bySlot: Array<{ name: string; top: number; left: number } | null> = new Array(
    poolSize
  ).fill(null)
  const end = Math.min(win.start + poolSize, filtered.length)
  for (let i = win.start; i < end; i++) {
    const row = Math.floor(i / columns)
    const col = i % columns
    bySlot[i % poolSize] = {
      name: filtered[i]!,
      top: GAP + row * rowStride,
      left: GAP + col * colStride,
    }
  }

  return (
    <Fullscreen
      flexDirection="column"
      backgroundColor={colors.background}
      padding={24}
      gap={16}
      fontFamilies={{ inter: { normal: font } }}
    >
      <Container flexDirection="row" alignItems="center" gap={12} marginBottom={8}>
        <Input
          flexGrow={1}
          placeholder="Search 1594 icons by name or tag…"
          value={query}
          onValueChange={setQuery}
        />
        <Text fontSize={13} color={colors.mutedForeground}>
          {selectedCount} selected
        </Text>
        <Button
          variant="outline"
          disabled={filtered.length === 0}
          onClick={selectAll}
          flexDirection="row"
          gap={8}
        >
          <LucideIcons.CheckCheck width={16} height={16} />
          <Text>Select all {filtered.length}</Text>
        </Button>
        <Button
          variant="secondary"
          disabled={selectedCount === 0}
          onClick={copyManifest}
          flexDirection="row"
          gap={8}
        >
          <LucideIcons.Copy width={16} height={16} />
          <Text>{copyLabel}</Text>
        </Button>
        <Button
          variant="outline"
          disabled={selectedCount === 0}
          onClick={clearSelection}
          flexDirection="row"
          gap={8}
        >
          <LucideIcons.X width={16} height={16} />
          <Text>Clear</Text>
        </Button>
      </Container>

      <Container
        ref={scrollRef}
        flexGrow={1}
        overflow="scroll"
        flexDirection="column"
        borderRadius={10}
        borderWidth={1}
        borderColor={colors.border}
        backgroundColor={colors.card}
        scrollbarColor={colors.mutedForeground}
        scrollbarWidth={8}
        scrollbarBorderRadius={4}
      >
        {filtered.length === 0 ? (
          <Container flexGrow={1} alignItems="center" justifyContent="center" padding={48}>
            <Text color={colors.mutedForeground}>No icons match “{query}”.</Text>
          </Container>
        ) : (
          // Full-height content sizer so the scrollbar spans ALL matches; the
          // visible slice is absolutely positioned at its true grid offset.
          <Container width="100%" height={contentHeight} flexShrink={0} positionType="relative">
            {bySlot.map((cell, slot) => (
              // Key by POOL SLOT (index % poolSize): the instance is reused as the window slides;
              // only the row that changed rebinds. Empty trailing slots park offscreen.
              <IconChip
                key={slot}
                name={cell?.name ?? ''}
                selected={cell != null && selected.has(cell.name)}
                onToggle={toggle}
                top={cell?.top ?? -9999}
                left={cell?.left ?? -9999}
                width={win.cellW}
                height={win.cellH}
              />
            ))}
          </Container>
        )}
      </Container>
    </Fullscreen>
  )
}

// A deterministic dark tool surface regardless of the host color scheme.
setPreferredColorScheme('dark')

/** HTML loading splash (outside the Canvas): a bold "uikit" wordmark pulsing on near-black.
 *  Fades out once the scene has drawn a few frames — covering the atlas fetch + first draw. */
function LoadingSplash({ hidden }: { hidden: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#0b0d11',
        zIndex: 10,
        pointerEvents: 'none',
        opacity: hidden ? 0 : 1,
        transition: 'opacity 500ms ease',
      }}
    >
      <style>{`
        @font-face {
          font-family: 'InterSplash';
          src: url('${import.meta.env.BASE_URL}Inter-Bold.woff') format('woff');
          font-weight: 700;
          font-display: block; /* invisible until the real Inter 700 loads — no FOUT */
        }
        @keyframes uikitSplashPulse { 0%, 100% { opacity: 0.8 } 50% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .uikit-splash-word { animation: none !important; opacity: 0.85 }
        }
      `}</style>
      <span
        className="uikit-splash-word"
        style={{
          fontFamily: "'InterSplash', Inter, system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 'clamp(72px, 13vw, 180px)',
          letterSpacing: '-0.05em',
          color: '#f5f6fa',
          animation: 'uikitSplashPulse 2.2s ease-in-out infinite',
        }}
      >
        uikit
      </span>
    </div>
  )
}

/** Fires once the renderer has drawn a few frames — the cue to fade the splash. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0)
  useFrame(() => {
    frames.current += 1
    if (frames.current === 3) onReady()
  })
  return null
}

/** three.js' built-in WebGPU Inspector (r180+), opt-in via `?inspector=true`: per-pass GPU
 *  timings, scene graph, and console overlaid on the canvas. Same wiring as the bento — assign
 *  `renderer.inspector` and it drives the panel from the render loop. `__inspector` guards
 *  StrictMode's double-mount. */
function ThreeInspector() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('inspector') !== 'true') return
    const renderer = gl as unknown as { inspector: Inspector; __inspector?: boolean }
    if (renderer.__inspector) return
    renderer.__inspector = true
    const inspector = new Inspector()
    renderer.inspector = inspector
    // three auto-mounts the panel from init(); under R3F the canvas isn't attached on the first
    // run, so re-run next frame when it's in the DOM (init() is idempotent once parented).
    requestAnimationFrame(() => inspector.init())
  }, [gl])
  return null
}

export default function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // Safety net: never let the splash stick if the ready signal is missed.
    const id = setTimeout(() => setReady(true), 8000)
    return () => clearTimeout(id)
  }, [])
  return (
    <>
      {/* `canvasInputProps` stops the canvas pointer-down from blurring the hidden
          <input> the search `Input` types into. Native DPR keeps Slug text crisp. */}
      <Canvas {...canvasInputProps} style={{ height: '100dvh', touchAction: 'none' }}>
        <color attach="background" args={['black']} />
        <ambientLight intensity={0.5} />
        <directionalLight intensity={0} position={[5, 1, 10]} />
        <ThreeInspector />
        <Suspense fallback={null}>
          <IconBrowser />
          <ReadySignal onReady={() => setReady(true)} />
        </Suspense>
      </Canvas>
      <LoadingSplash hidden={ready} />
    </>
  )
}
