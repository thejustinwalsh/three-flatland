import { Canvas, extend, useLoader, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useRef, useEffect, useState } from 'react'
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
import { usePane, useStatsMonitor } from '@three-flatland/tweakpane/react'
import type { StatsHandle } from '@three-flatland/tweakpane/react'

extend({ Flatland, Sprite2D })

// ─── PassEffect Definitions (from original — uses `pass:` API) ──────────────

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
  schema: { resolution: 200, gridIntensity: 0.18, subpixelIntensity: 0.12 },
  pass: ({ uniforms }) => (input, uv) =>
    lcdGrid(input, uv, uniforms.resolution, uniforms.gridIntensity, uniforms.subpixelIntensity),
})

const PosterizePass = createPassEffect({
  name: 'posterize',
  schema: { bands: 6 },
  pass: ({ uniforms }) => (input) => posterize(input, uniforms.bands),
})

const QuantizePass = createPassEffect({
  name: 'quantize',
  schema: { levels: 8 },
  pass: ({ uniforms }) => (input) => quantize(input, uniforms.levels),
})

const ScanlinesPass = createPassEffect({
  name: 'scanlines',
  schema: { resolution: 300, intensity: 0.2 },
  pass: ({ uniforms }) => (input, uv) =>
    scanlinesSmooth(input, uv, uniforms.resolution, uniforms.intensity),
})

const VHSPass = createPassEffect({
  name: 'vhs',
  schema: { time: 0, intensity: 0.012, noiseAmount: 0.05 },
  pass: ({ uniforms }) => (input, uv) => {
    const tex = convertToTexture(input) as TextureNode<'vec4'>
    return vhsDistortion(tex, uv, uniforms.time, uniforms.intensity, uniforms.noiseAmount)
  },
})

const StaticPass = createPassEffect({
  name: 'static',
  schema: { time: 0, intensity: 0.04 },
  pass: ({ uniforms }) => (input, uv) =>
    staticNoise(input, uv, uniforms.time, uniforms.intensity),
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
  schema: { intensity: 0.4, curvature: 2 },
  pass: ({ uniforms }) => (input, uv) =>
    crtVignette(input, uv, uniforms.intensity, uniforms.curvature),
})

const BacklightPass = createPassEffect({
  name: 'backlight',
  schema: { intensity: 0.12 },
  pass: ({ uniforms }) => (input, uv) =>
    lcdBacklightBleed(input, uv, uniforms.intensity),
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
    case 'crt':
      return { passes: [new CRTPass()], timeDriven: [] }
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
  { x: 0, y: 0, scale: 120, tint: '#ffffff' },
  { x: -100, y: 60, scale: 60, tint: '#ff6b9d' },
  { x: 100, y: 60, scale: 60, tint: '#47cca9' },
  { x: -100, y: -60, scale: 60, tint: '#ffd166' },
  { x: 100, y: -60, scale: 60, tint: '#6b9dff' },
  { x: 0, y: 120, scale: 40, tint: '#bb86fc' },
  { x: 0, y: -120, scale: 40, tint: '#ff8a65' },
] as const

function SpriteScene() {
  const texture = useLoader(TextureLoader, './icon.svg')
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

// ─── FlatlandScene (receives preset as prop, matches original architecture) ─

function FlatlandScene({ preset, stats }: { preset: PresetName; stats: StatsHandle }) {
  const flatlandRef = useRef<Flatland>(null)
  const gl = useThree((s) => s.gl)
  const presetRef = useRef<ActivePreset>({ passes: [], timeDriven: [] })
  const elapsedRef = useRef(0)
  const statsRef = useRef(stats)
  statsRef.current = stats

  // Apply preset when it changes (effect fires after mount, flatlandRef is ready)
  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return

    flatland.clearPasses()
    const active = createPreset(preset)
    for (const p of active.passes) flatland.addPass(p)
    presetRef.current = active
    elapsedRef.current = 0
  }, [preset])

  useFrame((_state, delta) => {
    elapsedRef.current += delta
    for (const { pass } of presetRef.current.timeDriven) {
      pass.time = elapsedRef.current
    }
  })

  // Render in the 'render' phase so R3F skips its own render.
  // Since we take over rendering, useStatsMonitor's scene.onAfterRender
  // hook never fires (R3F's state.scene isn't rendered) — read the draw
  // counts directly from renderer.info.render immediately after our render
  // call, while the values are still valid and before three.js's next
  // autoReset.
  const size = useThree((s) => s.size)
  useFrame(() => {
    const flatland = flatlandRef.current
    if (!flatland) return
    flatland.resize(size.width, size.height)
    flatland.render(gl as unknown as WebGPURenderer)
    const render = gl.info.render as unknown as { drawCalls: number; triangles: number; lines: number; points: number }
    const memory = gl.info.memory as unknown as { geometries: number; textures: number }
    statsRef.current.update({
      drawCalls: render.drawCalls,
      triangles: render.triangles,
      lines: render.lines,
      points: render.points,
      geometries: memory.geometries,
      textures: memory.textures,
    })
  }, { phase: 'render' })

  return (
    <flatland ref={flatlandRef} viewSize={400} clearColor={0x1a1a2e}>
      <SpriteScene />
    </flatland>
  )
}

// ─── StatsTracker (inside Canvas for useFrame access) ───────────────────────

function StatsTracker({ stats }: { stats: StatsHandle }) {
  useStatsMonitor(stats)
  return null
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const { pane, stats } = usePane()
  const [preset, setPreset] = useState<PresetName>('clean')

  // Preset selector (synchronous init, no effect)
  const initRef = useRef(false)
  if (!initRef.current) {
    initRef.current = true
    pane.addBinding({ preset: 'clean' as string }, 'preset', {
      label: 'Preset',
      options: {
        Clean: 'clean',
        'CRT Arcade': 'crt',
        Handheld: 'lcd',
        'VHS Tape': 'vhs',
        'Retro PC': 'retro',
      },
    }).on('change', (ev) => {
      setPreset(ev.value as PresetName)
    })
  }

  return (
    <Canvas
      orthographic
      dpr={1}
      camera={{ zoom: 5, position: [0, 0, 100] }}
      renderer={{ antialias: false, trackTimestamp: true }}
      onCreated={({ gl }) => {
        gl.domElement.style.imageRendering = 'pixelated'
      }}
    >
      <StatsTracker stats={stats} />
      <FlatlandScene preset={preset} stats={stats} />
    </Canvas>
  )
}
