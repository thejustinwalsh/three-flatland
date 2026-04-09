import { WebGPURenderer } from 'three/webgpu'
import { convertToTexture } from 'three/tsl'
import { Color } from 'three'
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'
import {
  Flatland,
  Sprite2D,
  TextureLoader,
  createPassEffect,
} from 'three-flatland'
import type { PassEffect } from 'three-flatland'
import {
  // CRT display nodes
  crtComplete,
  crtVignette,
  // Scanline nodes
  scanlinesSmooth,
  // LCD display nodes
  lcdGrid,
  lcdBacklightBleed,
  // Retro color nodes
  posterize,
  quantize,
  // Analog video nodes
  vhsDistortion,
  staticNoise,
  chromaticAberration,
} from '@three-flatland/nodes'
import { createPane } from '@three-flatland/tweakpane'
import type { FolderApi } from 'tweakpane'

// ─── PassEffect Definitions ─────────────────────────────────────────────────

/**
 * CRT Arcade — Full CRT monitor simulation with curvature, scanlines,
 * bloom, vignette, and color bleed. Like playing at the local arcade.
 */
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

/**
 * LCD Grid — Visible pixel grid like a GBA or handheld console.
 * Applied after posterization for the chunky handheld look.
 */
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

/**
 * Posterize — Reduce color bands for retro palette looks.
 * 4 bands = Game Boy feel, 8 bands = early PC, 16 bands = subtle.
 */
const PosterizePass = createPassEffect({
  name: 'posterize',
  schema: { bands: 6 },
  pass: ({ uniforms }) => (input, _uv) => {
    return posterize(input, uniforms.bands)
  },
})

/**
 * Quantize — 8-bit color reduction for retro PC look.
 */
const QuantizePass = createPassEffect({
  name: 'quantize',
  schema: { levels: 8 },
  pass: ({ uniforms }) => (input, _uv) => {
    return quantize(input, uniforms.levels)
  },
})

/**
 * Smooth Scanlines — Sine-wave scanline overlay.
 */
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

/**
 * VHS Distortion — Tracking errors, color separation, and wave distortion.
 * Needs texture sampling for UV distortion. Time-driven animation.
 */
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

/**
 * Static Noise — Analog TV snow/static overlay.
 */
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

/**
 * Chromatic Aberration — RGB channel separation for worn analog feel.
 */
const AberrationPass = createPassEffect({
  name: 'aberration',
  schema: { amount: 0.003 },
  pass: ({ uniforms }) => (input, uv) => {
    const tex = convertToTexture(input) as TextureNode<'vec4'>
    return chromaticAberration(tex, uv, uniforms.amount)
  },
})

/**
 * Vignette — Edge darkening for focused display look.
 */
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

/**
 * LCD Backlight Bleed — Uneven backlight for handheld LCD feel.
 */
const BacklightPass = createPassEffect({
  name: 'backlight',
  schema: { intensity: 0.12 },
  pass: ({ uniforms }) => (input, uv) => {
    return lcdBacklightBleed(input, uv, uniforms.intensity)
  },
})

// ─── Preset Configurations ──────────────────────────────────────────────────

type PresetName = 'clean' | 'crt' | 'lcd' | 'vhs' | 'retro'

interface ActivePreset {
  passes: PassEffect[]
  /** Passes that need `time` updated each frame */
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

// ─── Scene Setup ────────────────────────────────────────────────────────────

/** Sprite arrangement — a small grid of tinted sprites like game pickups */
const SPRITE_LAYOUT = [
  { x: 0, y: 0, scale: 120, tint: 0xffffff },       // Center — white
  { x: -100, y: 60, scale: 60, tint: 0xff6b9d },     // Top-left — pink
  { x: 100, y: 60, scale: 60, tint: 0x47cca9 },      // Top-right — teal
  { x: -100, y: -60, scale: 60, tint: 0xffd166 },     // Bottom-left — gold
  { x: 100, y: -60, scale: 60, tint: 0x6b9dff },      // Bottom-right — blue
  { x: 0, y: 120, scale: 40, tint: 0xbb86fc },        // Top — purple
  { x: 0, y: -120, scale: 40, tint: 0xff8a65 },       // Bottom — orange
]

async function main() {
  const flatland = new Flatland({
    viewSize: 400,
    clearColor: 0x1a1a2e,
  })

  const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1) // Pixel-perfect for pixel art
  renderer.domElement.style.imageRendering = 'pixelated'
  document.body.appendChild(renderer.domElement)

  await renderer.init()

  flatland.resize(window.innerWidth, window.innerHeight)

  // Load texture and create sprite scene
  const texture = await TextureLoader.load('./icon.svg')

  const sprites: Sprite2D[] = []
  for (const layout of SPRITE_LAYOUT) {
    const sprite = new Sprite2D({
      texture,
      anchor: [0.5, 0.5],
    })
    sprite.scale.set(layout.scale, layout.scale, 1)
    sprite.position.set(layout.x, layout.y, 0)
    sprite.tint = new Color(layout.tint)
    flatland.add(sprite)
    sprites.push(sprite)
  }

  // ─── Pass Effect State ──────────────────────────────────────────────────

  let activePreset: ActivePreset = createPreset('clean')
  let elapsed = 0

  // Slider param objects (mutated by tweakpane bindings)
  const crtParams = { ...CRT_DEFAULTS }
  const lcdParams = { ...LCD_DEFAULTS }
  const vhsParams = { ...VHS_DEFAULTS }
  const retroParams = { ...RETRO_DEFAULTS }

  function applyPreset(name: PresetName) {
    // Remove old passes
    flatland.clearPasses()

    // Reset slider params to defaults
    Object.assign(crtParams, CRT_DEFAULTS)
    Object.assign(lcdParams, LCD_DEFAULTS)
    Object.assign(vhsParams, VHS_DEFAULTS)
    Object.assign(retroParams, RETRO_DEFAULTS)

    // Create and add new preset
    activePreset = createPreset(name)
    for (const p of activePreset.passes) {
      flatland.addPass(p)
    }

    // Refresh pane to show reset values
    pane.refresh()
  }

  // ─── Tweakpane UI ───────────────────────────────────────────────────────

  // Pass flatland.scene so draws/triangles are wired via scene.onAfterRender
  // (fires inside flatland.render() → renderer.render()).
  const { pane, stats } = createPane({ scene: flatland.scene })

  // ─── CRT Folder ─────────────────────────────────────────────────────────

  const crtFolder = pane.addFolder({ title: 'CRT', hidden: true })
  crtFolder.addBinding(crtParams, 'curvature', { min: 0, max: 0.2, step: 0.01 })
  crtFolder.addBinding(crtParams, 'scanlineIntensity', { min: 0, max: 0.5, step: 0.01 })
  crtFolder.addBinding(crtParams, 'vignetteIntensity', { min: 0, max: 1, step: 0.01 })
  crtFolder.addBinding(crtParams, 'bloomIntensity', { min: 0, max: 0.5, step: 0.01 })
  crtFolder.addBinding(crtParams, 'colorBleed', { min: 0, max: 0.005, step: 0.0001 })

  crtFolder.on('change', () => {
    const crt = activePreset.passes[0]
    if (!crt) return
    const c = crt as PassEffect & typeof CRT_DEFAULTS
    c.curvature = crtParams.curvature
    c.scanlineIntensity = crtParams.scanlineIntensity
    c.vignetteIntensity = crtParams.vignetteIntensity
    c.bloomIntensity = crtParams.bloomIntensity
    c.colorBleed = crtParams.colorBleed
  })

  // ─── LCD Folder ─────────────────────────────────────────────────────────

  const lcdFolder = pane.addFolder({ title: 'LCD', hidden: true })
  lcdFolder.addBinding(lcdParams, 'resolution', { min: 50, max: 500, step: 10 })
  lcdFolder.addBinding(lcdParams, 'gridIntensity', { min: 0, max: 0.5, step: 0.01 })
  lcdFolder.addBinding(lcdParams, 'subpixelIntensity', { min: 0, max: 0.3, step: 0.01 })
  lcdFolder.addBinding(lcdParams, 'bands', { min: 2, max: 16, step: 1 })

  lcdFolder.on('change', () => {
    // LCD preset: [posterize, lcdGrid, backlight, vignette]
    const post = activePreset.passes[0] as PassEffect & { bands: number } | undefined
    const grid = activePreset.passes[1] as PassEffect & { resolution: number; gridIntensity: number; subpixelIntensity: number } | undefined
    if (post) post.bands = lcdParams.bands
    if (grid) {
      grid.resolution = lcdParams.resolution
      grid.gridIntensity = lcdParams.gridIntensity
      grid.subpixelIntensity = lcdParams.subpixelIntensity
    }
  })

  // ─── VHS Folder ─────────────────────────────────────────────────────────

  const vhsFolder = pane.addFolder({ title: 'VHS', hidden: true })
  vhsFolder.addBinding(vhsParams, 'intensity', { min: 0, max: 0.05, step: 0.001 })
  vhsFolder.addBinding(vhsParams, 'noiseAmount', { min: 0, max: 0.2, step: 0.005 })
  vhsFolder.addBinding(vhsParams, 'aberration', { min: 0, max: 0.01, step: 0.001 })

  vhsFolder.on('change', () => {
    // VHS preset: [vhs, static, aberration]
    const vhs = activePreset.passes[0] as PassEffect & { intensity: number; noiseAmount: number } | undefined
    const aber = activePreset.passes[2] as PassEffect & { amount: number } | undefined
    if (vhs) {
      vhs.intensity = vhsParams.intensity
      vhs.noiseAmount = vhsParams.noiseAmount
    }
    if (aber) aber.amount = vhsParams.aberration
  })

  // ─── Retro Folder ───────────────────────────────────────────────────────

  const retroFolder = pane.addFolder({ title: 'Retro', hidden: true })
  retroFolder.addBinding(retroParams, 'levels', { min: 2, max: 16, step: 1 })
  retroFolder.addBinding(retroParams, 'scanResolution', { min: 100, max: 500, step: 10 })
  retroFolder.addBinding(retroParams, 'scanIntensity', { min: 0, max: 0.5, step: 0.01 })

  retroFolder.on('change', () => {
    // Retro preset: [quantize, scanlines, vignette]
    const quant = activePreset.passes[0] as PassEffect & { levels: number } | undefined
    const scan = activePreset.passes[1] as PassEffect & { resolution: number; intensity: number } | undefined
    if (quant) quant.levels = retroParams.levels
    if (scan) {
      scan.resolution = retroParams.scanResolution
      scan.intensity = retroParams.scanIntensity
    }
  })

  // ─── Monitors ───────────────────────────────────────────────────────────

  const monitors = { passCount: 0 }
  const monitorFolder = pane.addFolder({ title: 'Passes', expanded: false })
  monitorFolder.addBinding(monitors, 'passCount', { readonly: true, format: (v: number) => v.toFixed(0) })

  // ─── Preset Selector (at bottom) ───────────────────────────────────────

  const params = { preset: 'clean' as string }
  const presetBinding = pane.addBinding(params, 'preset', {
    label: 'Preset',
    options: {
      Clean: 'clean',
      'CRT Arcade': 'crt',
      Handheld: 'lcd',
      'VHS Tape': 'vhs',
      'Retro PC': 'retro',
    },
  })

  // ─── Folder Visibility Toggle ───────────────────────────────────────────

  const folders: Record<string, FolderApi> = {
    crt: crtFolder,
    lcd: lcdFolder,
    vhs: vhsFolder,
    retro: retroFolder,
  }

  presetBinding.on('change', (ev) => {
    const value = ev.value as PresetName
    for (const [key, folder] of Object.entries(folders)) {
      folder.hidden = key !== value
    }
    applyPreset(value)
  })

  // ─── Resize ─────────────────────────────────────────────────────────────

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // ─── Render Loop ────────────────────────────────────────────────────────

  let lastTime = performance.now()
  let refreshTimer = 0

  function animate() {
    requestAnimationFrame(animate)
    stats.begin()

    const now = performance.now()
    const delta = (now - lastTime) / 1000
    lastTime = now

    elapsed += delta

    // Gentle floating animation on sprites
    for (let i = 0; i < sprites.length; i++) {
      const layout = SPRITE_LAYOUT[i]!
      const offset = i * 0.7
      sprites[i]!.position.y = layout.y + Math.sin(elapsed * 1.2 + offset) * 6
    }

    // Update time-driven passes
    for (const { pass } of activePreset.timeDriven) {
      pass.time = elapsed
    }

    flatland.render(renderer)

    // Update monitors periodically
    refreshTimer += delta
    if (refreshTimer >= 0.5) {
      monitors.passCount = activePreset.passes.length
      pane.refresh()
      refreshTimer = 0
    }

    stats.end()
  }

  animate()
}

main()
