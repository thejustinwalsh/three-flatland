import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { OrthographicCamera } from 'three'
import { SlugText, SlugFontLoader } from '@three-flatland/slug/react'
import type { SlugFont } from '@three-flatland/slug/react'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import WaRadioGroup from '@awesome.me/webawesome/dist/react/radio-group/index.js'
import WaRadio from '@awesome.me/webawesome/dist/react/radio/index.js'
import WaSlider from '@awesome.me/webawesome/dist/react/slider/index.js'

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

const FONT_SIZE_OPTIONS = [
  '6', '8', '10', '12', '16', '24', '32', '48', '72', '96', '200',
] as const

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

// --- UI components ---

/** Per-line pill rounding for wrapped radio groups (Web Awesome only). */
function useWrappingGroup(ref: React.RefObject<HTMLDivElement | null>, selector: string) {
  useEffect(() => {
    const container = ref.current?.querySelector(selector)?.parentElement
    if (!container) return
    const update = () => {
      const children = [...container.querySelectorAll(selector)]
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
    return () => ro.disconnect()
  }, [ref, selector])
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

/** Full-window Canvas2D reference comparison, driven by props. */
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

  // Resize canvas (backing store + CSS) to match window with DPR.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio
    canvas.width = windowSize.w * dpr
    canvas.height = windowSize.h * dpr
    canvas.style.width = `${windowSize.w}px`
    canvas.style.height = `${windowSize.h}px`
  }, [windowSize])

  // Redraw on content / mode change.
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
          zIndex: 10,
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
        zIndex: 20,
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
    zIndex: 21,
    fontFamily: 'monospace',
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 3,
    background: 'rgba(0, 2, 28, 0.7)',
    pointerEvents: 'none',
  }
  return (
    <>
      <div style={{ ...base, color: '#fff', left: splitX - 60 }}>SLUG</div>
      <div style={{ ...base, color: '#ff6464', left: splitX + 20 }}>{MODE_LABELS[mode]}</div>
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
          right: 12,
          zIndex: 200,
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
  const [font, setFont] = useState<SlugFont | null>(null)
  const [fontSize, setFontSize] = useState(48)
  const [wordCount, setWordCount] = useState(20)
  const [stemDarken, setStemDarken] = useState(0)
  const [thicken, setThicken] = useState(0)
  const [compareMode, setCompareMode] = useState<CompareMode>('onion')
  const [forceRuntime, setForceRuntime] = useState(false)
  const [loadStatus, setLoadStatus] = useState('Loading font...')
  const [gpuCanvas, setGpuCanvas] = useState<HTMLCanvasElement | null>(null)
  const windowSize = useWindowSize()
  const [splitX, setSplitX] = useState(() => Math.round(window.innerWidth / 2))
  const uiRef = useRef<HTMLDivElement>(null)

  const text = useMemo(() => getLoremText(wordCount), [wordCount])

  useWrappingGroup(uiRef, 'wa-radio')

  // Re-center split on resize.
  useEffect(() => {
    setSplitX(Math.round(windowSize.w / 2))
  }, [windowSize.w])

  // Load font — reloads when forceRuntime changes. Waits for @font-face to be
  // ready so Canvas2D comparison renders with the same glyph metrics.
  useEffect(() => {
    let cancelled = false
    setLoadStatus('Loading font...')
    SlugFontLoader.clearCache()
    document.fonts.load('48px Inter-Slug').finally(() => {
      const t0 = performance.now()
      SlugFontLoader.load(FONT_URL, { forceRuntime }).then((f) => {
        if (cancelled) return
        const ms = (performance.now() - t0).toFixed(0)
        setFont(f)
        setLoadStatus(`${forceRuntime ? 'Runtime gen' : 'Baked'}: ${f.glyphs.size} glyphs in ${ms}ms`)
      })
    })
    return () => {
      cancelled = true
    }
  }, [forceRuntime])

  // Hotkeys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'r') setForceRuntime((v) => !v)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleFontSizeChange = useCallback((e: Event) => {
    setFontSize(parseInt((e.target as HTMLInputElement).value, 10))
  }, [])

  const handleCompareModeChange = useCallback((e: Event) => {
    setCompareMode((e.target as HTMLInputElement).value as CompareMode)
  }, [])

  return (
    <>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 100], near: 0.1, far: 1000 }}
        renderer={{ antialias: true }}
      >
        <color attach="background" args={['#00021c']} />
        <PixelCamera />
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
      )}

      <SplitHandle splitX={splitX} onDrag={setSplitX} />
      <SplitLabels splitX={splitX} mode={compareMode} />

      {/* Status */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 100,
          color: '#f0edd8',
          fontFamily: 'monospace',
          fontSize: 12,
          background: 'rgba(0, 2, 28, 0.85)',
          padding: '8px 12px',
          borderRadius: 6,
        }}
      >
        {loadStatus}
      </div>

      {/* UI panel */}
      <div
        ref={uiRef}
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 100,
          pointerEvents: 'auto',
          padding: 10,
          background: 'rgba(0, 2, 28, 0.85)',
          borderRadius: 8,
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        <WaRadioGroup
          label="Font Size"
          size="small"
          orientation="horizontal"
          value={String(fontSize)}
          onChange={handleFontSizeChange as unknown as React.FormEventHandler}
        >
          {FONT_SIZE_OPTIONS.map((v) => (
            <WaRadio key={v} value={v} size="small" appearance="button">
              {v}
            </WaRadio>
          ))}
        </WaRadioGroup>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginTop: 8,
            color: 'var(--wa-color-text-normal)',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 80 }}>Words</span>
            <WaSlider
              size="small"
              min={5}
              max={200}
              value={wordCount}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onInput={(e: any) => setWordCount(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{wordCount}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 80 }}>Darken</span>
            <WaSlider
              size="small"
              min={0}
              max={100}
              value={Math.round((stemDarken / 2) * 100)}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onInput={(e: any) => setStemDarken((Number(e.target.value) / 100) * 2)}
              style={{ width: 100 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>
              {Math.round((stemDarken / 2) * 100)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 80 }}>Thicken</span>
            <WaSlider
              size="small"
              min={0}
              max={100}
              value={Math.round((thicken / 2) * 100)}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onInput={(e: any) => setThicken((Number(e.target.value) / 100) * 2)}
              style={{ width: 100 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>
              {Math.round((thicken / 2) * 100)}
            </span>
          </div>
          <WaRadioGroup
            label="Compare"
            size="small"
            orientation="horizontal"
            value={compareMode}
            onChange={handleCompareModeChange as unknown as React.FormEventHandler}
            style={{ marginTop: 4 }}
          >
            <WaRadio value="onion" size="small" appearance="button">
              Onion
            </WaRadio>
            <WaRadio value="diff" size="small" appearance="button">
              Diff
            </WaRadio>
            <WaRadio value="split" size="small" appearance="button">
              Split
            </WaRadio>
          </WaRadioGroup>
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 4,
              color: 'var(--wa-color-text-normal)',
              fontSize: 13,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={forceRuntime}
                onChange={(e) => setForceRuntime(e.target.checked)}
              />
              <span>
                <span style={{ textDecoration: 'underline' }}>R</span>untime Gen
              </span>
            </label>
          </div>
        </div>
      </div>
    </>
  )
}
