import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useState, useRef, useEffect, useCallback } from 'react'
import { OrthographicCamera } from 'three'
import { SlugText, SlugFontLoader } from '@three-flatland/slug/react'
import type { SlugFont } from '@three-flatland/slug/react'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import WaRadioGroup from '@awesome.me/webawesome/dist/react/radio-group/index.js'
import WaRadio from '@awesome.me/webawesome/dist/react/radio/index.js'
import WaSlider from '@awesome.me/webawesome/dist/react/slider/index.js'

extend({ SlugText })

const BASE_URL = import.meta.env.BASE_URL
const FONT_URL = BASE_URL + 'Inter-Regular.ttf'
const TEXT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'

const FONT_SIZE_OPTIONS = [
  { value: '6', label: '6' },
  { value: '8', label: '8' },
  { value: '10', label: '10' },
  { value: '12', label: '12' },
  { value: '16', label: '16' },
  { value: '24', label: '24' },
  { value: '32', label: '32' },
  { value: '48', label: '48' },
  { value: '72', label: '72' },
  { value: '96', label: '96' },
  { value: '200', label: '200' },
] as const

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
      maxWidth={size.width * 0.8}
      stemDarken={stemDarken}
      thicken={thicken}
    />
  )
}

// --- UI components ---

/** Per-line pill rounding for wrapped radio groups. */
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

function HtmlOverlay({
  text,
  fontSize,
  visible,
  ascender,
  descender,
}: {
  text: string
  fontSize: number
  visible: boolean
  ascender: number
  descender: number
}) {
  const baselineOffset = (ascender + descender) * 0.5 * fontSize
  return (
    <div
      style={{
        position: 'fixed',
        top: `calc(50% - ${baselineOffset}px)`,
        left: '50%',
        transform: 'translate(-50%, 0)',
        zIndex: 50,
        pointerEvents: 'none',
        fontFamily: "'Inter-Slug', sans-serif",
        fontSize: `${fontSize}px`,
        lineHeight: 0,
        color: 'rgba(255, 100, 100, 0.6)',
        maxWidth: '80vw',
        display: visible ? undefined : 'none',
      }}
    >
      {text}
    </div>
  )
}

// --- App ---

export default function App() {
  const [font, setFont] = useState<SlugFont | null>(null)
  const [fontSize, setFontSize] = useState(48)
  const [stemDarken, setStemDarken] = useState(0)
  const [thicken, setThicken] = useState(0)
  const [overlayVisible, setOverlayVisible] = useState(false)
  const [forceRuntime, setForceRuntime] = useState(false)
  const [loadStatus, setLoadStatus] = useState('Loading font...')
  const uiRef = useRef<HTMLDivElement>(null)

  useWrappingGroup(uiRef, 'wa-radio')

  // Load font — reloads when forceRuntime changes
  useEffect(() => {
    let cancelled = false
    setLoadStatus('Loading font...')
    SlugFontLoader.clearCache()
    const t0 = performance.now()
    SlugFontLoader.load(FONT_URL, { forceRuntime }).then((f) => {
      if (cancelled) return
      const ms = (performance.now() - t0).toFixed(0)
      setFont(f)
      setLoadStatus(`${forceRuntime ? 'Runtime gen' : 'Baked'}: ${f.glyphs.size} glyphs in ${ms}ms`)
    })
    return () => { cancelled = true }
  }, [forceRuntime])

  // Hotkeys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'h') setOverlayVisible((v) => !v)
      else if (e.key === 'r') setForceRuntime((v) => !v)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleFontSizeChange = useCallback((e: Event) => {
    setFontSize(parseInt((e.target as HTMLInputElement).value, 10))
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
        {font && (
          <SlugTextScene
            font={font}
            text={TEXT}
            fontSize={fontSize}
            align="center"
            stemDarken={stemDarken}
            thicken={thicken}
          />
        )}
      </Canvas>

      {/* HTML overlay for comparison */}
      {font && (
        <HtmlOverlay
          text={TEXT}
          fontSize={fontSize}
          visible={overlayVisible}
          ascender={font.ascender}
          descender={font.descender}
        />
      )}

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
          onChange={handleFontSizeChange}
        >
          {FONT_SIZE_OPTIONS.map((opt) => (
            <WaRadio key={opt.value} value={opt.value} size="small" appearance="button">
              {opt.label}
            </WaRadio>
          ))}
        </WaRadioGroup>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, color: 'var(--wa-color-text-normal)', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 80 }}>Darken</span>
            <WaSlider
              size="small"
              min={0}
              max={100}
              value={Math.round(stemDarken * 100)}
              onInput={(e: any) => setStemDarken(e.target.value / 100)}
              style={{ width: 100 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{Math.round(stemDarken * 100)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 80 }}>Thicken</span>
            <WaSlider
              size="small"
              min={0}
              max={100}
              value={Math.round((thicken / 3) * 100)}
              onInput={(e: any) => setThicken((e.target.value / 100) * 3)}
              style={{ width: 100 }}
            />
            <span style={{ width: 28, textAlign: 'right' }}>{Math.round((thicken / 3) * 100)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, color: 'var(--wa-color-text-normal)', fontSize: 13 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={overlayVisible}
              onChange={(e) => setOverlayVisible(e.target.checked)}
            />
            <span><span style={{ textDecoration: 'underline' }}>H</span>TML Overlay</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={forceRuntime}
              onChange={(e) => setForceRuntime(e.target.checked)}
            />
            <span><span style={{ textDecoration: 'underline' }}>R</span>untime Gen</span>
          </label>
        </div>
      </div>
    </>
  )
}
