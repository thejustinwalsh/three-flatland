import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrthographicCamera } from 'three'
import { SlugText, SlugStackText, SlugFontLoader, SlugFontStack } from '@three-flatland/slug/react'
import type { SlugFont, StyleSpan, TextMetrics } from '@three-flatland/slug/react'
import {
  usePane,
  usePaneFolder,
  usePaneInput,
  usePaneRadioGrid,
  useStatsMonitor,
} from '@three-flatland/tweakpane/react'
import type { StatsHandle } from '@three-flatland/tweakpane/react'

extend({ SlugText, SlugStackText })

const FONT_URL = './Inter-Regular.ttf'
/** Font Awesome 6 Free Solid — baked subset of 12 icons in the PUA
 *  codepoints U+F000–U+F7FF. Demoed as a fallback font in the SlugFontStack:
 *  primary Inter has no PUA glyphs, so the stack routes those codepoints to
 *  FA. No TTF on disk — baked artifacts (`fa-solid.slug.{json,bin}`) are
 *  served directly; `SlugFontLoader` derives the baked URLs from the passed
 *  path. forceRuntime would 404 here, so the toggle is primary-only. */
const FA_FONT_URL = './fa-solid.ttf'
/** PUA codepoints for the baked FA icons. Keep in sync with the `-r` args
 *  in the slug-bake command that produced `fa-solid.slug.*`. */
const ICON = {
  heart: '\uf004', star: '\uf005', home: '\uf015', user: '\uf007',
  gear: '\uf013', bolt: '\uf0e7', thumbsUp: '\uf164', paperPlane: '\uf1d8',
  code: '\uf121', coffee: '\uf0f4', rocket: '\uf135', book: '\uf02d',
} as const
const ICON_DEMO =
  `Built with ${ICON.code} and ${ICON.heart}\n` +
  `${ICON.coffee} brewed  ${ICON.rocket} launched  ${ICON.bolt} fast`
const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
const LOREM_WORDS = LOREM.split(' ')
const MAX_WIDTH_FRACTION = 0.8
const LINE_HEIGHT = 1.2

type CompareMode = 'off' | 'onion' | 'diff' | 'split'

const MODE_LABELS: Record<CompareMode, string> = {
  off: '',
  onion: 'Canvas (Onion Skin)',
  diff: 'Canvas (Diff)',
  split: 'Canvas (Split)',
}

const FONT_SIZE_OPTIONS = {
  '6': 6, '8': 8, '10': 10, '12': 12, '16': 16, '24': 24,
  '32': 32, '48': 48, '72': 72, '96': 96, '200': 200,
}

const COMPARE_MODE_OPTIONS = {
  Off: 'off' as const,
  Onion: 'onion' as const,
  Diff: 'diff' as const,
  Split: 'split' as const,
}

function getLoremText(wordCount: number): string {
  const words: string[] = []
  for (let i = 0; i < wordCount; i++) {
    words.push(LOREM_WORDS[i % LOREM_WORDS.length]!)
  }
  return words.join(' ')
}

// --- Canvas2D text rendering (ported from examples/three/slug-text/main.ts) ---

/**
 * Line wrapping uses `font.wrapText` so line breaks match Slug's shaped output
 * exactly — browser hinting at medium font sizes (48/72/96) can shrink
 * `ctx.measureText` widths below the opentype-derived advances, giving a
 * different line count and breaking vertical alignment.
 *
 * `fontFamily` is the `ctx.font` font-family list. For plain Inter use
 * `'Inter-Slug, sans-serif'`; for icons mode use `'Inter-Slug, FA-Solid, sans-serif'`
 * so the browser's native per-codepoint fallback mirrors the Slug font
 * stack (Inter → FA-Solid).
 *
 * `preWrappedLines` overrides the internal `font.wrapText` — pass this in
 * icons mode with `SlugFontStack.wrapText` so line breaks agree with the
 * per-codepoint advances that `SlugStackText` actually uses.
 */
function drawCompareText(
  ctx: CanvasRenderingContext2D,
  font: SlugFont,
  text: string,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
  mode: CompareMode,
  fontFamily: string = 'Inter-Slug, sans-serif',
  preWrappedLines: string[] | null = null,
) {
  const dpr = window.devicePixelRatio
  const w = ctx.canvas.width / dpr
  const h = ctx.canvas.height / dpr

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.save()
  ctx.scale(dpr, dpr)

  if (mode !== 'onion') {
    ctx.fillStyle = '#00021c'
    ctx.fillRect(0, 0, w, h)
  }

  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.fillStyle = mode === 'onion' ? 'rgba(255, 100, 100, 0.6)' : '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const lines = preWrappedLines ?? font.wrapText(text, fontSize, maxWidth)
  const lineHeightPx = fontSize * lineHeight

  const totalBlockHeight = (lines.length - 1) * lineHeightPx
  const baselineY = h / 2 - totalBlockHeight / 2

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, w / 2, baselineY + i * lineHeightPx)
  }

  ctx.restore()
}

function drawDiff(
  compareCtx: CanvasRenderingContext2D,
  gpuCanvas: HTMLCanvasElement,
  font: SlugFont,
  text: string,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
  fontFamily: string = 'Inter-Slug, sans-serif',
  preWrappedLines: string[] | null = null,
) {
  const cw = compareCtx.canvas.width
  const ch = compareCtx.canvas.height

  drawCompareText(compareCtx, font, text, fontSize, maxWidth, lineHeight, 'diff', fontFamily, preWrappedLines)
  const canvasPixels = compareCtx.getImageData(0, 0, cw, ch)

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = cw
  tempCanvas.height = ch
  const tempCtx = tempCanvas.getContext('2d')!
  tempCtx.drawImage(gpuCanvas, 0, 0, gpuCanvas.width, gpuCanvas.height, 0, 0, cw, ch)
  const gpuPixels = tempCtx.getImageData(0, 0, cw, ch)

  const lum = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722

  const out = compareCtx.createImageData(cw, ch)
  const cd = canvasPixels.data
  const gd = gpuPixels.data
  const od = out.data

  const lo = 20
  const hi = 128

  for (let i = 0; i < cd.length; i += 4) {
    const lumCanvas = lum(cd[i]!, cd[i + 1]!, cd[i + 2]!)
    const lumGpu = lum(gd[i]!, gd[i + 1]!, gd[i + 2]!)
    const diff = Math.abs(lumCanvas - lumGpu)

    if (diff > lo) {
      const t = Math.min((diff - lo) / (hi - lo), 1)
      od[i] = Math.round(80 + 175 * t)
      od[i + 1] = Math.round(40 * (1 - t))
      od[i + 2] = 0
      od[i + 3] = 255
    } else {
      od[i] = 0
      od[i + 1] = 2
      od[i + 2] = 28
      od[i + 3] = 255
    }
  }

  compareCtx.putImageData(out, 0, 0)
}

// --- Scene components ---

/** Syncs ortho camera to 1:1 pixel mapping on every resize. */
function PixelCamera() {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)
  camera.left = -size.width / 2
  camera.right = size.width / 2
  camera.top = size.height / 2
  camera.bottom = -size.height / 2
  camera.updateProjectionMatrix()
  return null
}

/** Surfaces the WebGPU canvas element to the parent for pixel reads (diff mode). */
function CanvasGrabber({ onReady }: { onReady: (canvas: HTMLCanvasElement) => void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    onReady(gl.domElement as HTMLCanvasElement)
  }, [gl, onReady])
  return null
}

/**
 * Force the WebGPU renderer's pixel ratio to match the tracked DPR.
 * R3F's `<Canvas>` captures DPR at mount and doesn't re-sync on
 * monitor-swap / OS-zoom / fullscreen transitions. Post-transition the
 * Slug canvas ends up at the old ratio while the compare canvas uses
 * the live DPR — producing sub-pixel drift and visible desync.
 * This component lives inside `<Canvas>` and pushes `windowSize.dpr`
 * onto the renderer whenever it changes.
 */
function DprSync({ dpr }: { dpr: number }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.setPixelRatio(Math.min(dpr, 2))
  }, [gl, dpr])
  return null
}

/** Renders SlugText with per-frame updates. */
function SlugTextScene({
  font,
  text,
  fontSize,
  align,
  stemDarken,
  thicken,
  styles,
  outlineStyle,
  outlineWidth,
  outlineColor,
}: {
  font: SlugFont
  text: string
  fontSize: number
  align: 'left' | 'center' | 'right'
  stemDarken: number
  thicken: number
  styles: readonly StyleSpan[]
  outlineStyle: 'fill' | 'outline' | 'both'
  outlineWidth: number
  outlineColor: string
}) {
  const ref = useRef<SlugText>(null)
  const { camera, size } = useThree()

  useEffect(() => {
    ref.current?.setViewportSize(size.width, size.height)
  }, [size])

  // Runtime uniform updates — avoid React re-rendering the JSX prop on
  // every slider tick by mutating the material in place. The `outline`
  // prop on <slugText> configures the mesh's child; width/color changes
  // never rebuild.
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    if (outlineStyle === 'fill') {
      mesh.outline = null
    } else {
      mesh.outline = { width: outlineWidth, color: outlineColor }
    }
  }, [outlineStyle])

  useEffect(() => {
    ref.current?.setOutlineWidth(outlineWidth)
  }, [outlineWidth])

  useEffect(() => {
    ref.current?.setOutlineColor(outlineColor)
  }, [outlineColor])

  // Fill opacity: when the user selects Outline-only, drop the fill
  // alpha to 0 so only the stroke pass shows. Transparent blend on the
  // fill material handles the composite.
  useEffect(() => {
    ref.current?.setOpacity(outlineStyle === 'outline' ? 0 : 1)
  }, [outlineStyle])

  useFrame(() => {
    ref.current?.update(camera)
  })

  return (
    <slugText
      ref={ref}
      font={font}
      text={text}
      fontSize={fontSize}
      color={0xffffff}
      align={align}
      maxWidth={size.width * MAX_WIDTH_FRACTION}
      stemDarken={stemDarken}
      thicken={thicken}
      styles={styles}
    />
  )
}

/** Renders SlugStackText — used for the icon-fallback demo.
 *  1:1 parity with SlugTextScene for styles + outline controls so
 *  icons mode isn't feature-starved relative to fill mode. */
function SlugStackTextScene({
  stack,
  text,
  fontSize,
  styles,
  outlineStyle,
  outlineWidth,
  outlineColor,
}: {
  stack: SlugFontStack
  text: string
  fontSize: number
  styles: readonly StyleSpan[]
  outlineStyle: 'fill' | 'outline' | 'both'
  outlineWidth: number
  outlineColor: string
}) {
  const ref = useRef<SlugStackText>(null)
  const { camera, size } = useThree()

  useEffect(() => {
    ref.current?.setViewportSize(size.width, size.height)
  }, [size])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    if (outlineStyle === 'fill') {
      mesh.outline = null
    } else {
      mesh.outline = { width: outlineWidth, color: outlineColor }
    }
  }, [outlineStyle])

  useEffect(() => {
    ref.current?.setOutlineWidth(outlineWidth)
  }, [outlineWidth])

  useEffect(() => {
    ref.current?.setOutlineColor(outlineColor)
  }, [outlineColor])

  // Outline-only mode: drop fill alpha to 0. Parity with SlugTextScene.
  useEffect(() => {
    ref.current?.setOpacity(outlineStyle === 'outline' ? 0 : 1)
  }, [outlineStyle])

  useFrame(() => {
    ref.current?.update(camera)
  })

  return (
    <slugStackText
      ref={ref}
      font={stack}
      text={text}
      fontSize={fontSize}
      color={0xffffff}
      align="center"
      lineHeight={LINE_HEIGHT}
      maxWidth={size.width * MAX_WIDTH_FRACTION}
      styles={styles}
    />
  )
}

function StatsTracker({ stats }: { stats: StatsHandle }) {
  useStatsMonitor(stats)
  return null
}

// --- Compare UI components ---

function useWindowSize() {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio,
  }))
  useEffect(() => {
    // Measure all three together — DPR changes can happen without a
    // dimension change (monitor swap), and fullscreen transitions fire
    // resize events that are sometimes dispatched before the layout
    // viewport has actually settled. Reading live from window on every
    // event keeps the canvas DPR-aware on multi-monitor setups and
    // correct after fullscreen enter/exit.
    const measure = () => setSize({
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
    })

    // The `resolution` media query fires whenever DPR changes — covers
    // moving the window between monitors with different scale factors,
    // system zoom, OS UI-scale changes. Re-subscribed each time because
    // the matched resolution changes.
    let mediaQuery: MediaQueryList | null = null
    const attachDprListener = () => {
      mediaQuery?.removeEventListener('change', onDprChange)
      mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      mediaQuery.addEventListener('change', onDprChange)
    }
    const onDprChange = () => {
      measure()
      attachDprListener()
    }

    // Re-measure once more on the next frame after a fullscreen
    // change — the 'resize' event that browsers fire on fullscreen
    // transition can land before the document has finished re-layout,
    // leaving innerWidth/innerHeight stale for one tick.
    const onFullscreenChange = () => {
      measure()
      requestAnimationFrame(measure)
    }

    window.addEventListener('resize', measure)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    attachDprListener()

    return () => {
      window.removeEventListener('resize', measure)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      mediaQuery?.removeEventListener('change', onDprChange)
    }
  }, [])
  return size
}

function CompareCanvas({
  font,
  stack,
  text,
  fontSize,
  mode,
  splitX,
  gpuCanvas,
  windowSize,
  stemDarken,
  thicken,
  iconsMode,
}: {
  font: SlugFont
  stack: SlugFontStack | null
  text: string
  fontSize: number
  mode: CompareMode
  splitX: number
  gpuCanvas: HTMLCanvasElement | null
  windowSize: { w: number; h: number; dpr: number }
  stemDarken: number
  thicken: number
  iconsMode: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [computing, setComputing] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Pull DPR from the tracked state (not window.devicePixelRatio
    // directly) so monitor swaps + scale changes re-run this effect.
    canvas.width = windowSize.w * windowSize.dpr
    canvas.height = windowSize.h * windowSize.dpr
    canvas.style.width = `${windowSize.w}px`
    canvas.style.height = `${windowSize.h}px`
  }, [windowSize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const maxWidth = windowSize.w * MAX_WIDTH_FRACTION
    const fontFamily = iconsMode
      ? 'Inter-Slug, FA-Solid, sans-serif'
      : 'Inter-Slug, sans-serif'
    // In icons mode, wrap via the stack so line breaks agree with
    // `SlugStackText` (which uses per-codepoint FA advance widths). The
    // primary-only `font.wrapText` would diverge as soon as FA glyphs
    // push a line over the limit.
    const preWrappedLines = iconsMode && stack
      ? stack.wrapText(text, fontSize, maxWidth)
      : null

    if (mode === 'diff') {
      if (!gpuCanvas) return
      setComputing(true)
      // Two RAFs — one for R3F to run its useFrame and schedule the
      // WebGPU render, one to let the browser actually commit it. Same
      // rationale as the non-diff path below.
      let rafA = 0
      const rafB = { current: 0 }
      rafA = requestAnimationFrame(() => {
        rafB.current = requestAnimationFrame(() => {
          drawDiff(ctx, gpuCanvas, font, text, fontSize, maxWidth, LINE_HEIGHT, fontFamily, preWrappedLines)
        })
      })
      const t = setTimeout(() => setComputing(false), 1000)
      return () => {
        cancelAnimationFrame(rafA)
        cancelAnimationFrame(rafB.current)
        clearTimeout(t)
      }
    }

    setComputing(false)

    // Defer the Canvas2D draw by two RAFs so the Slug WebGPU canvas
    // has a chance to render the new content before the compare
    // overlay updates. Without this, `useEffect` fires synchronously
    // after state change and Canvas2D paints the new text *one frame
    // ahead* of the Slug canvas — producing a visible flash during
    // scene toggle (Lorem ↔ Icons), wordCount changes, font reload,
    // etc. Two RAFs guarantees we're past at least one R3F render
    // cycle (R3F schedules its own RAF for the frame loop) plus the
    // browser's next paint. Net effect: both layers flip on the same
    // frame.
    let rafA = 0
    const rafB = { current: 0 }
    rafA = requestAnimationFrame(() => {
      rafB.current = requestAnimationFrame(() => {
        drawCompareText(ctx, font, text, fontSize, maxWidth, LINE_HEIGHT, mode, fontFamily, preWrappedLines)
      })
    })
    return () => {
      cancelAnimationFrame(rafA)
      cancelAnimationFrame(rafB.current)
    }
  }, [font, stack, text, fontSize, mode, stemDarken, thicken, windowSize, gpuCanvas, iconsMode])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
          clipPath: `inset(0 0 0 ${splitX}px)`,
        }}
      />
      {computing && <ComputingIndicator />}
    </>
  )
}

function SplitHandle({ splitX, onDrag }: { splitX: number; onDrag: (x: number) => void }) {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      onDrag(Math.max(0, Math.min(e.clientX, window.innerWidth)))
    }
    const onUp = () => setDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, onDrag])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: splitX - 16,
        width: 32,
        height: '100%',
        zIndex: 2,
        cursor: 'col-resize',
      }}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        setDragging(true)
        e.preventDefault()
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 15,
          top: 0,
          width: 2,
          height: '100%',
          background: 'rgba(255, 255, 255, 0.5)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 20,
          height: 40,
          background: 'rgba(255, 255, 255, 0.15)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: 16,
          lineHeight: '40px',
          textAlign: 'center',
        }}
      >
        ⋮
      </div>
    </div>
  )
}

function SplitLabels({ splitX, mode }: { splitX: number; mode: CompareMode }) {
  const base: React.CSSProperties = {
    position: 'fixed',
    top: 8,
    zIndex: 3,
    fontFamily: 'monospace',
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 3,
    background: 'rgba(0, 2, 28, 0.7)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  }
  return (
    <>
      <div style={{ ...base, color: '#fff', left: splitX - 60 }}>SLUG</div>
      <div style={{ ...base, color: '#ff6464', left: splitX + 20 }}>{MODE_LABELS[mode]}</div>
    </>
  )
}

/**
 * Hover any rendered line → measure overlays (cyan tight ink, yellow
 * dashed font envelope) appear and the parent's `onMetrics` fires for
 * that line. Live, transient — leave the line and the overlays + measure
 * monitors clear.
 */
function MeasureOverlay({
  font,
  text,
  fontSize,
  maxWidth,
  windowSize,
  onMetrics,
}: {
  font: SlugFont
  text: string
  fontSize: number
  maxWidth: number
  windowSize: { w: number; h: number }
  onMetrics: (m: TextMetrics | null) => void
}) {
  const shapedLines = useMemo(() => font.wrapText(text, fontSize, maxWidth), [font, text, fontSize, maxWidth])
  const lineCount = shapedLines.length

  const lineMetrics = useMemo(
    () => shapedLines.map((line) => font.measureText(line, fontSize)),
    [font, shapedLines, fontSize],
  )

  const [hoveredLine, setHoveredLine] = useState<number | null>(null)
  const overlayLine = hoveredLine
  const overlayMetrics = overlayLine != null ? lineMetrics[overlayLine] : null

  // Surface metrics for whichever line is hovered (or null when none).
  useEffect(() => {
    onMetrics(overlayMetrics ?? null)
  }, [overlayMetrics, onMetrics])

  const lineHeightPx = fontSize * LINE_HEIGHT
  const firstBaselineY = windowSize.h / 2 - (lineCount - 1) * lineHeightPx / 2
  const centerX = windowSize.w / 2

  const baselineFor = (lineIndex: number) => firstBaselineY + lineIndex * lineHeightPx

  return (
    <>
      {/* Per-line hit-rects — transparent, hover → measure, click → select. */}
      {lineMetrics.map((m, i) => {
        const by = baselineFor(i)
        return (
          <div
            key={i}
            onPointerEnter={() => setHoveredLine(i)}
            onPointerLeave={() => setHoveredLine((cur) => (cur === i ? null : cur))}
            style={{
              position: 'fixed',
              left: centerX - m.width / 2,
              top: by - m.fontBoundingBoxAscent,
              width: m.width,
              height: m.fontBoundingBoxAscent + m.fontBoundingBoxDescent,
              // Below the split handle (z:2) so its drag always wins.
              zIndex: 1,
            }}
          />
        )
      })}

      {/* Measure overlays follow the hovered line. */}
      {overlayMetrics && overlayLine != null && (
        <>
          <div
            style={{
              position: 'fixed',
              left: centerX - overlayMetrics.width / 2,
              top: baselineFor(overlayLine) - overlayMetrics.fontBoundingBoxAscent,
              width: overlayMetrics.width,
              height: overlayMetrics.fontBoundingBoxAscent + overlayMetrics.fontBoundingBoxDescent,
              border: '1px dashed rgba(255, 214, 102, 0.8)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: centerX - overlayMetrics.width / 2 - overlayMetrics.actualBoundingBoxLeft,
              top: baselineFor(overlayLine) - overlayMetrics.actualBoundingBoxAscent,
              width: overlayMetrics.actualBoundingBoxLeft + overlayMetrics.actualBoundingBoxRight,
              height: overlayMetrics.actualBoundingBoxAscent + overlayMetrics.actualBoundingBoxDescent,
              border: '1px solid rgba(102, 217, 239, 0.9)',
              pointerEvents: 'none',
              zIndex: 6,
            }}
          />
        </>
      )}
    </>
  )
}

function ComputingIndicator() {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 4,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          style={{ animation: 'slug-spin 0.7s linear infinite' }}
        >
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="none" />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="#fff"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <style>{`@keyframes slug-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

// --- App ---

export default function App() {
  const { pane, stats } = usePane()

  // Top-of-pane toggle bar — scene selector. Inline radiogrid (essentials)
  // gives an active-state button affordance that reads better than a
  // dropdown for a two-way scene switch.
  const [scene] = usePaneRadioGrid<'lorem' | 'icons'>(pane, {
    groupName: 'scene',
    initialValue: 'lorem',
    cells: [
      { title: 'Lorem', value: 'lorem' },
      { title: 'Icons', value: 'icons' },
    ],
  })
  const iconsMode = scene === 'icons'

  const settings = usePaneFolder(pane, 'Settings')
  const [fontSize] = usePaneInput<number>(settings, 'size', 48, { options: FONT_SIZE_OPTIONS })
  const [wordCount] = usePaneInput<number>(settings, 'words', 20, { min: 5, max: 200, step: 1 })
  const [stemDarken] = usePaneInput<number>(settings, 'darken', 0, { min: 0, max: 2, step: 0.01 })
  const [thicken] = usePaneInput<number>(settings, 'thicken', 0, { min: 0, max: 2, step: 0.01 })

  // Outline folder — Phase 4 stroke surface. `style` toggles which meshes
  // render: Fill = fill only (stroke alpha=0), Outline = stroke only
  // (fill alpha=0), Both = both visible and composited.
  const outline = usePaneFolder(pane, 'Outline')
  const [outlineStyle] = usePaneInput<'fill' | 'outline' | 'both'>(outline, 'style', 'fill', {
    options: { Fill: 'fill', Outline: 'outline', Both: 'both' },
  })
  const [outlineWidth] = usePaneInput<number>(outline, 'width', 0.025, {
    min: 0.001, max: 0.15, step: 0.001,
  })
  const [outlineColor] = usePaneInput<string>(outline, 'color', '#000000')

  const mode = usePaneFolder(pane, 'Mode')
  const [compareMode] = usePaneInput<CompareMode>(
    mode,
    'compare',
    'onion',
    { options: COMPARE_MODE_OPTIONS },
  )
  const [forceRuntime] = usePaneInput<boolean>(mode, 'forceRuntime', false, {
    label: 'runtime',
  })

  // Measure folder: paragraph monitors are live (always populate for the
  // currently-rendered block); line-level monitors populate when a line
  // is clicked and reset when deselected.
  // Styles folder — demonstrates the public StyleSpan API by applying
  // decorations to one of three preset character ranges. Anything richer
  // (per-character spans, multiple stacked styles, click-and-drag
  // selection) is rich-text editor territory and lives in a future
  // example. Here we just prove `font.emitDecorations` round-trips.
  const stylesFolder = usePaneFolder(pane, 'Styles')
  const [styleScope] = usePaneInput<'word' | 'sentence' | 'line'>(stylesFolder, 'scope', 'word', {
    options: { 'First word': 'word', 'First sentence': 'sentence', 'First line': 'line' },
  })
  const [styleUnderline] = usePaneInput<boolean>(stylesFolder, 'underline', false)
  const [styleStrike] = usePaneInput<boolean>(stylesFolder, 'strike', false)

  const measure = usePaneFolder(pane, 'Measure')
  const numFmt = (v: number) => v.toFixed(1)
  const intFmt = (v: number) => v.toFixed(0)
  const [, setParaWidth] = usePaneInput<number>(measure, 'paraWidth', 0, { label: 'block w', readonly: true, format: numFmt })
  const [, setParaHeight] = usePaneInput<number>(measure, 'paraHeight', 0, { label: 'block h', readonly: true, format: numFmt })
  const [, setParaLines] = usePaneInput<number>(measure, 'paraLines', 0, { label: 'lines', readonly: true, format: intFmt })
  const [, setWidth] = usePaneInput<number>(measure, 'width', 0, { label: 'line w', readonly: true, format: numFmt })
  const [, setActualAscent] = usePaneInput<number>(measure, 'actualAscent', 0, { label: 'actual ↑', readonly: true, format: numFmt })
  const [, setActualDescent] = usePaneInput<number>(measure, 'actualDescent', 0, { label: 'actual ↓', readonly: true, format: numFmt })
  const [, setFontAscent] = usePaneInput<number>(measure, 'fontAscent', 0, { label: 'font ↑', readonly: true, format: numFmt })
  const [, setFontDescent] = usePaneInput<number>(measure, 'fontDescent', 0, { label: 'font ↓', readonly: true, format: numFmt })

  const handleMetrics = useCallback((m: TextMetrics | null) => {
    if (!m) {
      setWidth(0)
      setActualAscent(0)
      setActualDescent(0)
      setFontAscent(0)
      setFontDescent(0)
      return
    }
    setWidth(m.width)
    setActualAscent(m.actualBoundingBoxAscent)
    setActualDescent(m.actualBoundingBoxDescent)
    setFontAscent(m.fontBoundingBoxAscent)
    setFontDescent(m.fontBoundingBoxDescent)
  }, [setWidth, setActualAscent, setActualDescent, setFontAscent, setFontDescent])

  const [font, setFont] = useState<SlugFont | null>(null)
  const [iconFont, setIconFont] = useState<SlugFont | null>(null)
  const [gpuCanvas, setGpuCanvas] = useState<HTMLCanvasElement | null>(null)
  const windowSize = useWindowSize()
  const [splitX, setSplitX] = useState(() => Math.round(window.innerWidth / 2))
  const text = useMemo(
    () => (iconsMode ? ICON_DEMO : getLoremText(wordCount)),
    [iconsMode, wordCount],
  )
  const stack = useMemo(
    () => (font && iconFont ? new SlugFontStack([font, iconFont]) : null),
    [font, iconFont],
  )

  // Compute the demo span [start, end) from the chosen scope. Falls back
  // to the entire text if the heuristic finds nothing (e.g. a line scope
  // with no wrapping yet).
  const styleRange = useMemo<{ start: number; end: number }>(() => {
    if (styleScope === 'word') {
      const m = text.match(/^\S+/)
      return { start: 0, end: m ? m[0].length : 0 }
    }
    if (styleScope === 'sentence') {
      const m = text.match(/^[^.!?]*[.!?]?/)
      return { start: 0, end: m ? m[0].length : text.length }
    }
    // 'line' — first wrapped line via the font's own wrap.
    if (font) {
      const lines = font.wrapText(text, fontSize, windowSize.w * MAX_WIDTH_FRACTION)
      return { start: 0, end: lines[0]?.length ?? 0 }
    }
    return { start: 0, end: 0 }
  }, [styleScope, text, font, fontSize, windowSize.w])

  const styles = useMemo<StyleSpan[]>(() => {
    if (!styleUnderline && !styleStrike) return []
    if (styleRange.start === styleRange.end) return []
    return [{
      start: styleRange.start,
      end: styleRange.end,
      underline: styleUnderline,
      strike: styleStrike,
    }]
  }, [styleRange, styleUnderline, styleStrike])

  useEffect(() => {
    setSplitX(Math.round(windowSize.w / 2))
  }, [windowSize.w])

  // Live paragraph monitors — always reflect the currently-rendered text.
  useEffect(() => {
    if (!font) return
    const p = font.measureParagraph(text, fontSize, {
      maxWidth: windowSize.w * MAX_WIDTH_FRACTION,
      lineHeight: LINE_HEIGHT,
    })
    setParaWidth(p.width)
    setParaHeight(p.height)
    setParaLines(p.lines.length)
  }, [font, text, fontSize, windowSize, setParaWidth, setParaHeight, setParaLines])

  // Load Inter — reloads when `forceRuntime` changes. The static cache is
  // keyed on `${url}:runtime?`, so toggling uses a fresh slot; no manual
  // clearCache needed. @font-face preloads keep Canvas2D compare + icons
  // overlay aligned with the Slug shaping on first paint.
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      document.fonts.load('48px Inter-Slug'),
      document.fonts.load('48px FA-Solid'),
    ]).finally(() => {
      SlugFontLoader.load(FONT_URL, { forceRuntime })
        .then((f) => { if (!cancelled) setFont(f) })
        .catch((err) => {
          if (!cancelled) console.error('[slug-text] Inter load failed:', err)
        })
    })
    return () => { cancelled = true }
  }, [forceRuntime])

  // Icon fallback font — baked-only (no .ttf on disk), independent of
  // forceRuntime. Load once on mount.
  useEffect(() => {
    let cancelled = false
    SlugFontLoader.load(FA_FONT_URL)
      .then((f) => { if (!cancelled) setIconFont(f) })
      .catch((err) => {
        if (!cancelled) console.error('[slug-text] FA load failed:', err)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 100], near: 0.1, far: 1000 }}
        // Slug provides its own analytic anti-aliasing via per-fragment
        // coverage — MSAA adds 4× sample cost + a canvas-area resolve pass
        // for zero visual gain. Keep it off.
        renderer={{ antialias: false, trackTimestamp: true }}
      >
        <color attach="background" args={['#00021c']} />
        <PixelCamera />
        <DprSync dpr={windowSize.dpr} />
        <StatsTracker stats={stats} />
        <CanvasGrabber onReady={setGpuCanvas} />
        {iconsMode && stack && (
          <SlugStackTextScene
            stack={stack}
            text={text}
            fontSize={fontSize}
            styles={styles}
            outlineStyle={outlineStyle}
            outlineWidth={outlineWidth}
            outlineColor={outlineColor}
          />
        )}
        {!iconsMode && font && (
          <SlugTextScene
            font={font}
            text={text}
            fontSize={fontSize}
            align="center"
            stemDarken={stemDarken}
            thicken={thicken}
            styles={styles}
            outlineStyle={outlineStyle}
            outlineWidth={outlineWidth}
            outlineColor={outlineColor}
          />
        )}
      </Canvas>

      {font && (
        <>
          {/* Compare overlay + split affordance only when comparison is
              on. `off` mode hides every piece of the overlay so the
              Slug canvas renders standalone — useful for pure-signal
              verification and for screenshotting. */}
          {compareMode !== 'off' && (
            <>
              <CompareCanvas
                font={font}
                stack={stack}
                text={text}
                fontSize={fontSize}
                mode={compareMode}
                splitX={splitX}
                gpuCanvas={gpuCanvas}
                windowSize={windowSize}
                stemDarken={stemDarken}
                thicken={thicken}
                iconsMode={iconsMode}
              />
              <SplitHandle splitX={splitX} onDrag={setSplitX} />
              <SplitLabels splitX={splitX} mode={compareMode} />
            </>
          )}
          {/* Measure overlays are primary-font only — in icons mode they
              would misreport FA glyph widths (treated as notdef), so hide. */}
          {!iconsMode && (
            <MeasureOverlay
              font={font}
              text={text}
              fontSize={fontSize}
              maxWidth={windowSize.w * MAX_WIDTH_FRACTION}
              windowSize={windowSize}
              onMetrics={handleMetrics}
            />
          )}
        </>
      )}
    </>
  )
}
