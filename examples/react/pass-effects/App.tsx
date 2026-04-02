import { Canvas, extend, useLoader, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useState, useRef, useEffect, useCallback } from 'react'
import { convertToTexture } from 'three/tsl'
import type { WebGPURenderer } from 'three/webgpu'
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'
import {
  Flatland,
  Sprite2D,
  TextureLoader,
  createPassEffect,
} from 'three-flatland/react'
import type { PassEffect } from 'three-flatland/react'
import {
  crtComplete,
  crtVignette,
  scanlinesSmooth,
  lcdGrid,
  lcdBacklightBleed,
  posterize,
  quantize,
  vhsDistortion,
  staticNoise,
  chromaticAberration,
} from '@three-flatland/nodes'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import WaRadioGroup from '@awesome.me/webawesome/dist/react/radio-group/index.js'
import WaRadio from '@awesome.me/webawesome/dist/react/radio/index.js'

extend({ Flatland, Sprite2D })

// ─── PassEffect Definitions ─────────────────────────────────────────────────

const CRTPass = createPassEffect({
  name: 'crt',
  schema: {
    curvature: 0.08,
    scanlineIntensity: 0.18,
    vignetteIntensity: 0.3,
    bloomIntensity: 0.15,
    colorBleed: 0.0012,
  },
  pass: ({ uniforms }) => (input, uv) => {
    const tex = convertToTexture(input) as TextureNode<'vec4'>
    return crtComplete(tex, uv, {
      curvature: uniforms.curvature,
      scanlineIntensity: uniforms.scanlineIntensity,
      vignetteIntensity: uniforms.vignetteIntensity,
      bloomIntensity: uniforms.bloomIntensity,
      colorBleed: uniforms.colorBleed,
    })
  },
})

const LCDGridPass = createPassEffect({
  name: 'lcdGrid',
  schema: {
    resolution: 200,
    gridIntensity: 0.18,
    subpixelIntensity: 0.12,
  },
  pass: ({ uniforms }) => (input, uv) => {
    return lcdGrid(input, uv, uniforms.resolution, uniforms.gridIntensity, uniforms.subpixelIntensity)
  },
})

const PosterizePass = createPassEffect({
  name: 'posterize',
  schema: { bands: 6 },
  pass: ({ uniforms }) => (input, _uv) => {
    return posterize(input, uniforms.bands)
  },
})

const QuantizePass = createPassEffect({
  name: 'quantize',
  schema: { levels: 8 },
  pass: ({ uniforms }) => (input, _uv) => {
    return quantize(input, uniforms.levels)
  },
})

const ScanlinesPass = createPassEffect({
  name: 'scanlines',
  schema: {
    resolution: 300,
    intensity: 0.2,
  },
  pass: ({ uniforms }) => (input, uv) => {
    return scanlinesSmooth(input, uv, uniforms.resolution, uniforms.intensity)
  },
})

const VHSPass = createPassEffect({
  name: 'vhs',
  schema: {
    time: 0,
    intensity: 0.012,
    noiseAmount: 0.05,
  },
  pass: ({ uniforms }) => (input, uv) => {
    const tex = convertToTexture(input) as TextureNode<'vec4'>
    return vhsDistortion(tex, uv, uniforms.time, uniforms.intensity, uniforms.noiseAmount)
  },
})

const StaticPass = createPassEffect({
  name: 'static',
  schema: {
    time: 0,
    intensity: 0.04,
  },
  pass: ({ uniforms }) => (input, uv) => {
    return staticNoise(input, uv, uniforms.time, uniforms.intensity)
  },
})

const AberrationPass = createPassEffect({
  name: 'aberration',
  schema: { amount: 0.003 },
  pass: ({ uniforms }) => (input, uv) => {
    const tex = convertToTexture(input) as TextureNode<'vec4'>
    return chromaticAberration(tex, uv, uniforms.amount)
  },
})

const VignettePass = createPassEffect({
  name: 'vignette',
  schema: {
    intensity: 0.4,
    curvature: 2,
  },
  pass: ({ uniforms }) => (input, uv) => {
    return crtVignette(input, uv, uniforms.intensity, uniforms.curvature)
  },
})

const BacklightPass = createPassEffect({
  name: 'backlight',
  schema: { intensity: 0.12 },
  pass: ({ uniforms }) => (input, uv) => {
    return lcdBacklightBleed(input, uv, uniforms.intensity)
  },
})

// ─── Preset Types ───────────────────────────────────────────────────────────

type PresetName = 'clean' | 'crt' | 'lcd' | 'vhs' | 'retro'

interface ActivePreset {
  passes: PassEffect[]
  timeDriven: { pass: PassEffect & { time: number } }[]
}

function createPreset(name: PresetName): ActivePreset {
  switch (name) {
    case 'clean':
      return { passes: [], timeDriven: [] }

    case 'crt': {
      const crt = new CRTPass()
      return { passes: [crt], timeDriven: [] }
    }

    case 'lcd': {
      const post = new PosterizePass()
      ;(post as PassEffect & { bands: number }).bands = 10
      const grid = new LCDGridPass()
      const bleed = new BacklightPass()
      const vig = new VignettePass()
      ;(vig as PassEffect & { intensity: number }).intensity = 0.25
      return { passes: [post, grid, bleed, vig], timeDriven: [] }
    }

    case 'vhs': {
      const vhs = new VHSPass()
      const noise = new StaticPass()
      const aber = new AberrationPass()
      return {
        passes: [vhs, noise, aber],
        timeDriven: [
          { pass: vhs as PassEffect & { time: number } },
          { pass: noise as PassEffect & { time: number } },
        ],
      }
    }

    case 'retro': {
      const quant = new QuantizePass()
      const scan = new ScanlinesPass()
      const vig = new VignettePass()
      ;(vig as PassEffect & { intensity: number }).intensity = 0.2
      return { passes: [quant, scan, vig], timeDriven: [] }
    }
  }
}

// ─── Sprite Layout ──────────────────────────────────────────────────────────

const SPRITE_LAYOUT = [
  { x: 0, y: 0, scale: 24, tint: '#ffffff' },
  { x: -20, y: 12, scale: 12, tint: '#ff6b9d' },
  { x: 20, y: 12, scale: 12, tint: '#47cca9' },
  { x: -20, y: -12, scale: 12, tint: '#ffd166' },
  { x: 20, y: -12, scale: 12, tint: '#6b9dff' },
  { x: 0, y: 24, scale: 8, tint: '#bb86fc' },
  { x: 0, y: -24, scale: 8, tint: '#ff8a65' },
] as const

// ─── Scene Component ────────────────────────────────────────────────────────

function SpriteScene() {
  const texture = useLoader(TextureLoader, import.meta.env.BASE_URL + 'icon.svg')
  const spritesRef = useRef<Sprite2D[]>([])
  const timeRef = useRef(0)

  useFrame((_, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    for (let i = 0; i < spritesRef.current.length; i++) {
      const sprite = spritesRef.current[i]
      const layout = SPRITE_LAYOUT[i]
      if (sprite && layout) {
        sprite.position.y = layout.y + Math.sin(t * 1.2 + i * 0.7) * 1.2
      }
    }
  })

  return (
    <>
      {SPRITE_LAYOUT.map((layout, i) => (
        <sprite2D
          key={i}
          ref={(el: Sprite2D | null) => {
            if (el) spritesRef.current[i] = el
          }}
          texture={texture}
          tint={layout.tint}
          anchor={[0.5, 0.5]}
          position={[layout.x, layout.y, 0]}
          scale={[layout.scale, layout.scale, 1]}
        />
      ))}
    </>
  )
}

// ─── Stats Tracker ──────────────────────────────────────────────────────────

function StatsTracker({ passCount, onStats }: { passCount: number; onStats: (fps: number, draws: number) => void }) {
  const gl = useThree((s) => s.gl)
  const frameCount = useRef(0)
  const elapsed = useRef(0)
  useFrame((_, delta) => {
    frameCount.current++
    elapsed.current += delta
    if (elapsed.current >= 1) {
      // Cast: R3F types gl as WebGLRenderer, but we use WebGPURenderer which has drawCalls
      const draws = (gl.info.render as any).drawCalls as number
      onStats(Math.round(frameCount.current / elapsed.current), draws)
      frameCount.current = 0
      elapsed.current = 0
    }
  })
  return null
}

// ─── Flatland + Effects Component ───────────────────────────────────────────

function FlatlandScene({ preset, onPassCount }: { preset: PresetName; onPassCount: (n: number) => void }) {
  const flatlandRef = useRef<Flatland>(null)
  const { renderer } = useThree()
  const presetRef = useRef<ActivePreset>({ passes: [], timeDriven: [] })
  const elapsedRef = useRef(0)

  // Apply preset when it changes
  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return

    flatland.clearPasses()
    const active = createPreset(preset)
    for (const p of active.passes) {
      flatland.addPass(p)
    }
    presetRef.current = active
    elapsedRef.current = 0
    onPassCount(active.passes.length)
  }, [preset, onPassCount])

  // Update time-driven passes (runs in default update phase)
  useFrame((_state, delta) => {
    elapsedRef.current += delta
    for (const { pass } of presetRef.current.timeDriven) {
      pass.time = elapsedRef.current
    }
  })

  // Render in render phase so R3F skips its own render
  useFrame(() => {
    flatlandRef.current?.render(renderer as unknown as WebGPURenderer)
  }, { phase: 'render' })

  return (
    <flatland ref={flatlandRef} viewSize={80} clearColor={0x1a1a2e}>
      <SpriteScene />
    </flatland>
  )
}

// ─── Preset Options ─────────────────────────────────────────────────────────

const PRESET_OPTIONS = [
  { value: 'clean', label: 'Clean' },
  { value: 'crt', label: 'CRT Arcade' },
  { value: 'lcd', label: 'Handheld' },
  { value: 'vhs', label: 'VHS Tape' },
  { value: 'retro', label: 'Retro PC' },
] as const

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [preset, setPreset] = useState<PresetName>('clean')
  const [passCount, setPassCount] = useState(0)
  const [stats, setStats] = useState({ fps: '-' as string | number, draws: '-' as string | number })
  const controlsRef = useRef<HTMLDivElement>(null)

  const handleStats = useCallback((fps: number, draws: number) => setStats({ fps, draws }), [])
  const handlePassCount = useCallback((n: number) => setPassCount(n), [])

  // Per-line pill rounding for wrapped radio groups
  useEffect(() => {
    const group = controlsRef.current?.querySelector('wa-radio-group')
    if (!group) return
    const update = () => {
      const radios = [...group.querySelectorAll('wa-radio')]
      if (!radios.length) return
      const lines: Element[][] = []
      let lastTop = -Infinity
      let line: Element[] = []
      for (const radio of radios) {
        const top = radio.getBoundingClientRect().top
        if (Math.abs(top - lastTop) > 2) {
          if (line.length) lines.push(line)
          line = []
          lastTop = top
        }
        line.push(radio)
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
    ro.observe(group)
    update()
    return () => ro.disconnect()
  }, [])

  return (
    <>
      {/* Hide radio group label */}
      <style>{`
        .filter-bar wa-radio-group::part(form-control-label) { display: none; }
        .filter-bar wa-radio-group::part(form-control) { margin: 0; border: 0; padding: 0; }
        .filter-bar wa-radio-group::part(form-control-input) { row-gap: 4px; justify-content: center; }
        wa-radio[data-line-pos="first"] {
          border-start-start-radius: var(--wa-border-radius-m);
          border-end-start-radius: var(--wa-border-radius-m);
          border-start-end-radius: 0;
          border-end-end-radius: 0;
        }
        wa-radio[data-line-pos="inner"] { border-radius: 0; }
        wa-radio[data-line-pos="last"] {
          border-start-end-radius: var(--wa-border-radius-m);
          border-end-end-radius: var(--wa-border-radius-m);
          border-start-start-radius: 0;
          border-end-start-radius: 0;
        }
        wa-radio[data-line-pos="solo"] { border-radius: var(--wa-border-radius-m); }
      `}</style>

      {/* Controls — centered bottom bar */}
      <div
        ref={controlsRef}
        className="filter-bar"
        style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        <WaRadioGroup
          label="Display Filter"
          size="small"
          orientation="horizontal"
          value={preset}
          onChange={(e: any) =>
            setPreset((e.target as HTMLInputElement).value as PresetName)
          }
        >
          {PRESET_OPTIONS.map((opt) => (
            <WaRadio key={opt.value} value={opt.value} size="small" appearance="button">
              {opt.label}
            </WaRadio>
          ))}
        </WaRadioGroup>
      </div>

      {/* Stats overlay */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          padding: '5px 10px',
          background: 'rgba(0, 2, 28, 0.7)',
          borderRadius: 6,
          color: '#4a9eff',
          fontFamily: 'monospace',
          fontSize: 10,
          lineHeight: 1.5,
          zIndex: 100,
          whiteSpace: 'pre',
        }}
      >
        {`FPS: ${stats.fps}\nDraws: ${stats.draws}\nPasses: ${passCount}`}
      </div>

      {/* Three.js Canvas */}
      <Canvas
        orthographic
        camera={{ zoom: 5, position: [0, 0, 100] }}
        renderer={{ antialias: true }}
      >
        <StatsTracker passCount={passCount} onStats={handleStats} />
        <FlatlandScene preset={preset} onPassCount={handlePassCount} />
      </Canvas>
    </>
  )
}
