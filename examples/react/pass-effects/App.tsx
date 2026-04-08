import { Canvas, extend, useLoader, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useRef, useEffect, useCallback } from 'react'
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
import { usePane } from '@three-flatland/tweakpane/react'
import type { FolderApi } from 'tweakpane'

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

// ─── Default Slider Values per Preset ──────────────────────────────────────

const CRT_DEFAULTS = {
  curvature: 0.08,
  scanlineIntensity: 0.18,
  vignetteIntensity: 0.3,
  bloomIntensity: 0.15,
  colorBleed: 0.0012,
}

const LCD_DEFAULTS = {
  resolution: 200,
  gridIntensity: 0.18,
  subpixelIntensity: 0.12,
  bands: 10,
}

const VHS_DEFAULTS = {
  intensity: 0.012,
  noiseAmount: 0.05,
  aberration: 0.003,
}

const RETRO_DEFAULTS = {
  levels: 8,
  scanResolution: 300,
  scanIntensity: 0.2,
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

// ─── Flatland + Effects Component ───────────────────────────────────────────

function FlatlandScene() {
  const flatlandRef = useRef<Flatland>(null)
  const gl = useThree((s) => s.gl)
  const presetRef = useRef<ActivePreset>({ passes: [], timeDriven: [] })
  const elapsedRef = useRef(0)

  // Tweakpane — created once, imperatively managed
  const { pane, fpsGraph } = usePane()
  const fpsRef = useRef(fpsGraph)
  fpsRef.current = fpsGraph

  // Refs for folder visibility management
  const foldersRef = useRef<Record<string, FolderApi>>({})
  const paramsRef = useRef({
    crt: { ...CRT_DEFAULTS },
    lcd: { ...LCD_DEFAULTS },
    vhs: { ...VHS_DEFAULTS },
    retro: { ...RETRO_DEFAULTS },
  })
  const monitorsRef = useRef({ drawCalls: 0, passCount: 0 })
  const refreshTimerRef = useRef(0)

  const applyPreset = useCallback((name: PresetName) => {
    const flatland = flatlandRef.current
    if (!flatland) return

    flatland.clearPasses()

    // Reset params to defaults
    Object.assign(paramsRef.current.crt, CRT_DEFAULTS)
    Object.assign(paramsRef.current.lcd, LCD_DEFAULTS)
    Object.assign(paramsRef.current.vhs, VHS_DEFAULTS)
    Object.assign(paramsRef.current.retro, RETRO_DEFAULTS)

    const active = createPreset(name)
    for (const p of active.passes) {
      flatland.addPass(p)
    }
    presetRef.current = active
    elapsedRef.current = 0
  }, [])

  // Build all tweakpane folders imperatively
  useEffect(() => {
    const presetParams = { preset: 'clean' as string }
    const presetBinding = pane.addBinding(presetParams, 'preset', {
      label: 'Preset',
      options: {
        Clean: 'clean',
        'CRT Arcade': 'crt',
        Handheld: 'lcd',
        'VHS Tape': 'vhs',
        'Retro PC': 'retro',
      },
    })

    // CRT folder
    const crtFolder = pane.addFolder({ title: 'CRT', hidden: true })
    crtFolder.addBinding(paramsRef.current.crt, 'curvature', { min: 0, max: 0.2, step: 0.01 })
    crtFolder.addBinding(paramsRef.current.crt, 'scanlineIntensity', { min: 0, max: 0.5, step: 0.01 })
    crtFolder.addBinding(paramsRef.current.crt, 'vignetteIntensity', { min: 0, max: 1, step: 0.01 })
    crtFolder.addBinding(paramsRef.current.crt, 'bloomIntensity', { min: 0, max: 0.5, step: 0.01 })
    crtFolder.addBinding(paramsRef.current.crt, 'colorBleed', { min: 0, max: 0.005, step: 0.0001 })
    crtFolder.on('change', () => {
      const crt = presetRef.current.passes[0]
      if (!crt) return
      const c = crt as PassEffect & typeof CRT_DEFAULTS
      c.curvature = paramsRef.current.crt.curvature
      c.scanlineIntensity = paramsRef.current.crt.scanlineIntensity
      c.vignetteIntensity = paramsRef.current.crt.vignetteIntensity
      c.bloomIntensity = paramsRef.current.crt.bloomIntensity
      c.colorBleed = paramsRef.current.crt.colorBleed
    })

    // LCD folder
    const lcdFolder = pane.addFolder({ title: 'LCD', hidden: true })
    lcdFolder.addBinding(paramsRef.current.lcd, 'resolution', { min: 50, max: 500, step: 10 })
    lcdFolder.addBinding(paramsRef.current.lcd, 'gridIntensity', { min: 0, max: 0.5, step: 0.01 })
    lcdFolder.addBinding(paramsRef.current.lcd, 'subpixelIntensity', { min: 0, max: 0.3, step: 0.01 })
    lcdFolder.addBinding(paramsRef.current.lcd, 'bands', { min: 2, max: 16, step: 1 })
    lcdFolder.on('change', () => {
      const post = presetRef.current.passes[0] as PassEffect & { bands: number } | undefined
      const grid = presetRef.current.passes[1] as PassEffect & { resolution: number; gridIntensity: number; subpixelIntensity: number } | undefined
      if (post) post.bands = paramsRef.current.lcd.bands
      if (grid) {
        grid.resolution = paramsRef.current.lcd.resolution
        grid.gridIntensity = paramsRef.current.lcd.gridIntensity
        grid.subpixelIntensity = paramsRef.current.lcd.subpixelIntensity
      }
    })

    // VHS folder
    const vhsFolder = pane.addFolder({ title: 'VHS', hidden: true })
    vhsFolder.addBinding(paramsRef.current.vhs, 'intensity', { min: 0, max: 0.05, step: 0.001 })
    vhsFolder.addBinding(paramsRef.current.vhs, 'noiseAmount', { min: 0, max: 0.2, step: 0.005 })
    vhsFolder.addBinding(paramsRef.current.vhs, 'aberration', { min: 0, max: 0.01, step: 0.001 })
    vhsFolder.on('change', () => {
      const vhs = presetRef.current.passes[0] as PassEffect & { intensity: number; noiseAmount: number } | undefined
      const aber = presetRef.current.passes[2] as PassEffect & { amount: number } | undefined
      if (vhs) {
        vhs.intensity = paramsRef.current.vhs.intensity
        vhs.noiseAmount = paramsRef.current.vhs.noiseAmount
      }
      if (aber) aber.amount = paramsRef.current.vhs.aberration
    })

    // Retro folder
    const retroFolder = pane.addFolder({ title: 'Retro', hidden: true })
    retroFolder.addBinding(paramsRef.current.retro, 'levels', { min: 2, max: 16, step: 1 })
    retroFolder.addBinding(paramsRef.current.retro, 'scanResolution', { min: 100, max: 500, step: 10 })
    retroFolder.addBinding(paramsRef.current.retro, 'scanIntensity', { min: 0, max: 0.5, step: 0.01 })
    retroFolder.on('change', () => {
      const quant = presetRef.current.passes[0] as PassEffect & { levels: number } | undefined
      const scan = presetRef.current.passes[1] as PassEffect & { resolution: number; intensity: number } | undefined
      if (quant) quant.levels = paramsRef.current.retro.levels
      if (scan) {
        scan.resolution = paramsRef.current.retro.scanResolution
        scan.intensity = paramsRef.current.retro.scanIntensity
      }
    })

    // Monitors folder
    const monitorFolder = pane.addFolder({ title: 'Monitors' })
    monitorFolder.addBinding(monitorsRef.current, 'drawCalls', { readonly: true })
    monitorFolder.addBinding(monitorsRef.current, 'passCount', { readonly: true })

    foldersRef.current = { crt: crtFolder, lcd: lcdFolder, vhs: vhsFolder, retro: retroFolder }

    // Preset change handler
    presetBinding.on('change', (ev) => {
      const value = ev.value as PresetName
      for (const [key, folder] of Object.entries(foldersRef.current)) {
        folder.hidden = key !== value
      }
      applyPreset(value)
      pane.refresh()
    })

    return () => {
      presetBinding.dispose()
      crtFolder.dispose()
      lcdFolder.dispose()
      vhsFolder.dispose()
      retroFolder.dispose()
      monitorFolder.dispose()
    }
  }, [pane, applyPreset])

  // FPS graph + render loop
  useFrame(() => {
    fpsRef.current?.begin()
  }, -Infinity)

  useFrame((_state, delta) => {
    const flatland = flatlandRef.current
    if (!flatland) return

    elapsedRef.current += delta

    // Update time-driven passes
    for (const { pass } of presetRef.current.timeDriven) {
      pass.time = elapsedRef.current
    }

    // Cast: R3F types gl as WebGLRenderer, but Canvas from fiber/webgpu provides WebGPURenderer
    flatland.render(gl as unknown as WebGPURenderer)

    // Update monitors periodically
    refreshTimerRef.current += delta
    if (refreshTimerRef.current >= 0.5) {
      monitorsRef.current.drawCalls = flatland.stats.drawCalls
      monitorsRef.current.passCount = presetRef.current.passes.length
      pane.refresh()
      refreshTimerRef.current = 0
    }
  })

  useFrame(() => {
    fpsRef.current?.end()
  }, Infinity)

  return (
    <flatland ref={flatlandRef} viewSize={80} clearColor={0x1a1a2e}>
      <SpriteScene />
    </flatland>
  )
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Canvas
      orthographic
      camera={{ zoom: 5, position: [0, 0, 100] }}
      renderer={{ antialias: true }}
    >
      <FlatlandScene />
    </Canvas>
  )
}
