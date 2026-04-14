import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrthographicCamera } from 'three'
import { SlugText, SlugFontLoader } from '@three-flatland/slug/react'
import type { SlugFont, TextMetrics } from '@three-flatland/slug/react'
import {
  usePane,
  usePaneFolder,
  usePaneInput,
  useStatsMonitor,
} from '@three-flatland/tweakpane/react'
import type { StatsHandle } from '@three-flatland/tweakpane/react'

extend({ SlugText })

const FONT_URL = './Inter-Regular.ttf'
const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
const LOREM_WORDS = LOREM.split(' ')
const MAX_WIDTH_FRACTION = 0.8
const LINE_HEIGHT = 1.2

type CompareMode = 'onion' | 'diff' | 'split'

const MODE_LABELS: Record<CompareMode, string> = {
  onion: 'Canvas (Onion Skin)',
  diff: 'Canvas (Diff)',
  split: 'Canvas (Split)',
}

const FONT_SIZE_OPTIONS = {
  '6': 6, '8': 8, '10': 10, '12': 12, '16': 16, '24': 24,
  '32': 32, '48': 48, '72': 72, '96': 96, '200': 200,
}

const COMPARE_MODE_OPTIONS = {
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
 */
function drawCompareText(
  ctx: CanvasRenderingContext2D,
  font: SlugFont,
  text: string,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
  mode: CompareMode,
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

  ctx.font = `${fontSize}px Inter-Slug, sans-serif`
  ctx.fillStyle = mode === 'onion' ? 'rgba(255, 100, 100, 0.6)' : '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const lines = font.wrapText(text, fontSize, maxWidth)
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
) {
  const cw = compareCtx.canvas.width
  const ch = compareCtx.canvas.height

  drawCompareText(compareCtx, font, text, fontSize, maxWidth, lineHeight, 'diff')
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

/** Renders SlugText with per-frame updates. */
function SlugTextScene({
  font,
  text,
  fontSize,
  align,
  stemDarken,
  thicken,
}: {
  font: SlugFont
  text: string
  fontSize: number
  align: 'left' | 'center' | 'right'
  stemDarken: number
  thicken: number
}) {
  const ref = useRef<SlugText>(null)
  const { camera, size } = useThree()

  useEffect(() => {
    ref.current?.setViewportSize(size.width, size.height)
  }, [size])

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
    />
  )
}

function StatsTracker({ stats }: { stats: StatsHandle }) {
  useStatsMonitor(stats)
  return null
}

// --- Compare UI components ---

function useWindowSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

function CompareCanvas({
  font,
  text,
  fontSize,
  mode,
  splitX,
  gpuCanvas,
  windowSize,
  stemDarken,
  thicken,
}: {
  font: SlugFont
  text: string
  fontSize: number
  mode: CompareMode
  splitX: number
  gpuCanvas: HTMLCanvasElement | null
  windowSize: { w: number; h: number }
  stemDarken: number
  thicken: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [computing, setComputing] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio
    canvas.width = windowSize.w * dpr
    canvas.height = windowSize.h * dpr
    canvas.style.width = `${windowSize.w}px`
    canvas.style.height = `${windowSize.h}px`
  }, [windowSize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const maxWidth = windowSize.w * MAX_WIDTH_FRACTION

    if (mode === 'diff') {
      if (!gpuCanvas) return
      setComputing(true)
      const raf = requestAnimationFrame(() => {
        drawDiff(ctx, gpuCanvas, font, text, fontSize, maxWidth, LINE_HEIGHT)
      })
      const t = setTimeout(() => setComputing(false), 1000)
      return () => {
        cancelAnimationFrame(raf)
        clearTimeout(t)
      }
    }

    setComputing(false)
    drawCompareText(ctx, font, text, fontSize, maxWidth, LINE_HEIGHT, mode)
  }, [font, text, fontSize, mode, stemDarken, thicken, windowSize, gpuCanvas])

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
 * Click-to-measure: renders `actualBoundingBox` (cyan solid) and
 * `fontBoundingBox` (yellow dashed) overlays for the currently-selected
 * line, and a transparent hit-rect per line so clicks pick.
 *
 * Clicking the already-selected line deselects; clicking empty area
 * (outside any line) also deselects.
 */
function MeasureOverlay({
  font,
  text,
  fontSize,
  maxWidth,
  windowSize,
  selectedLine,
  onSelect,
  onMetrics,
}: {
  font: SlugFont
  text: string
  fontSize: number
  maxWidth: number
  windowSize: { w: number; h: number }
  selectedLine: number | null
  onSelect: (lineIndex: number | null) => void
  onMetrics: (m: TextMetrics | null) => void
}) {
  const shapedLines = useMemo(() => font.wrapText(text, fontSize, maxWidth), [font, text, fontSize, maxWidth])
  const lineCount = shapedLines.length

  // Per-line metrics drive both the hit-rects and the selected overlay.
  const lineMetrics = useMemo(
    () => shapedLines.map((line) => font.measureText(line, fontSize)),
    [font, shapedLines, fontSize],
  )

  const metrics = selectedLine != null ? lineMetrics[selectedLine] : null

  // Surface metrics for the selected line (or null when nothing selected).
  useEffect(() => {
    onMetrics(metrics ?? null)
  }, [metrics, onMetrics])

  // Slug centers the block — first-line baseline is above viewport center.
  const lineHeightPx = fontSize * LINE_HEIGHT
  const firstBaselineY = windowSize.h / 2 - (lineCount - 1) * lineHeightPx / 2
  const centerX = windowSize.w / 2

  const baselineFor = (lineIndex: number) => firstBaselineY + lineIndex * lineHeightPx

  return (
    <>
      {/* Per-line hit-rects — transparent, click to select/deselect. */}
      {lineMetrics.map((m, i) => {
        const by = baselineFor(i)
        return (
          <div
            key={i}
            onPointerDown={(e) => {
              e.stopPropagation()
              onSelect(i === selectedLine ? null : i)
            }}
            style={{
              position: 'fixed',
              left: centerX - m.width / 2,
              top: by - m.fontBoundingBoxAscent,
              width: m.width,
              height: m.fontBoundingBoxAscent + m.fontBoundingBoxDescent,
              cursor: 'pointer',
              // Keep hit-rects *below* the split handle (z:2) so its drag
              // always wins. Bounds overlays sit higher (z:5/6) so they
              // still appear on top of the selected line.
              zIndex: 1,
            }}
          />
        )
      })}

      {/* Overlays for the selected line. */}
      {metrics && selectedLine != null && (
        <>
          <div
            style={{
              position: 'fixed',
              left: centerX - metrics.width / 2,
              top: baselineFor(selectedLine) - metrics.fontBoundingBoxAscent,
              width: metrics.width,
              height: metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent,
              border: '1px dashed rgba(255, 214, 102, 0.8)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: centerX - metrics.width / 2 - metrics.actualBoundingBoxLeft,
              top: baselineFor(selectedLine) - metrics.actualBoundingBoxAscent,
              width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
              height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
              border: '1px solid rgba(102, 217, 239, 0.9)',
              pointerEvents: 'none',
              // actual sits inside font — bump above so the cyan isn't hidden.
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

  const settings = usePaneFolder(pane, 'Settings')
  const [fontSize] = usePaneInput<number>(settings, 'size', 48, { options: FONT_SIZE_OPTIONS })
  const [wordCount] = usePaneInput<number>(settings, 'words', 20, { min: 5, max: 200, step: 1 })
  const [stemDarken] = usePaneInput<number>(settings, 'darken', 0, { min: 0, max: 2, step: 0.01 })
  const [thicken] = usePaneInput<number>(settings, 'thicken', 0, { min: 0, max: 2, step: 0.01 })

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

  const [selectedLine, setSelectedLine] = useState<number | null>(null)

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
  const [gpuCanvas, setGpuCanvas] = useState<HTMLCanvasElement | null>(null)
  const windowSize = useWindowSize()
  const [splitX, setSplitX] = useState(() => Math.round(window.innerWidth / 2))
  const text = useMemo(() => getLoremText(wordCount), [wordCount])

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

  // Load font — reloads when forceRuntime changes. Wait for @font-face so
  // Canvas2D comparison renders with the same glyph metrics.
  useEffect(() => {
    let cancelled = false
    SlugFontLoader.clearCache()
    document.fonts.load('48px Inter-Slug').finally(() => {
      SlugFontLoader.load(FONT_URL, { forceRuntime }).then((f) => {
        if (cancelled) return
        setFont(f)
      })
    })
    return () => {
      cancelled = true
    }
  }, [forceRuntime])

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
        <StatsTracker stats={stats} />
        <CanvasGrabber onReady={setGpuCanvas} />
        {font && (
          <SlugTextScene
            font={font}
            text={text}
            fontSize={fontSize}
            align="center"
            stemDarken={stemDarken}
            thicken={thicken}
          />
        )}
      </Canvas>

      {font && (
        <>
          <CompareCanvas
            font={font}
            text={text}
            fontSize={fontSize}
            mode={compareMode}
            splitX={splitX}
            gpuCanvas={gpuCanvas}
            windowSize={windowSize}
            stemDarken={stemDarken}
            thicken={thicken}
          />
          <SplitHandle splitX={splitX} onDrag={setSplitX} />
          <SplitLabels splitX={splitX} mode={compareMode} />
          <MeasureOverlay
            font={font}
            text={text}
            fontSize={fontSize}
            maxWidth={windowSize.w * MAX_WIDTH_FRACTION}
            windowSize={windowSize}
            selectedLine={selectedLine}
            onSelect={setSelectedLine}
            onMetrics={handleMetrics}
          />
        </>
      )}
    </>
  )
}
