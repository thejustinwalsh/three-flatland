import { WebGPURenderer } from 'three/webgpu'
import { convertToTexture } from 'three/tsl'
import { Color } from 'three'
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'
import {
  Flatland,
  Sprite2D,
  TextureLoader,
  createPassEffect,
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
} from '@three-flatland/core'
import type { PassEffect } from '@three-flatland/core'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js'
import '@awesome.me/webawesome/dist/components/radio/radio.js'

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

// ─── Wrapping Group Helper ──────────────────────────────────────────────────

function setupWrappingGroup(container: Element, childSelector: string) {
  const update = () => {
    const children = [...container.querySelectorAll(childSelector)]
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

  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  await renderer.init()

  flatland.resize(window.innerWidth, window.innerHeight)

  // Load texture and create sprite scene
  const texture = await TextureLoader.load(import.meta.env.BASE_URL + 'icon.svg')

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

  function applyPreset(name: PresetName) {
    // Remove old passes
    flatland.clearPasses()

    // Create and add new preset
    activePreset = createPreset(name)
    for (const p of activePreset.passes) {
      flatland.addPass(p)
    }
  }

  // ─── UI ─────────────────────────────────────────────────────────────────

  const radioGroup = document.querySelector('wa-radio-group')!
  setupWrappingGroup(radioGroup, 'wa-radio')
  radioGroup.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value as PresetName
    applyPreset(value)
  })

  const statsEl = document.getElementById('stats')!
  let frameCount = 0
  let fpsElapsed = 0
  let displayFps: string | number = '-'
  let displayDraws: string | number = '-'

  // ─── Resize ─────────────────────────────────────────────────────────────

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // ─── Render Loop ────────────────────────────────────────────────────────

  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)

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

    // Stats (update once per second)
    frameCount++
    fpsElapsed += delta
    if (fpsElapsed >= 1) {
      displayFps = Math.round(frameCount / fpsElapsed)
      displayDraws = flatland.stats.drawCalls
      frameCount = 0
      fpsElapsed = 0
    }
    const passCount = activePreset.passes.length
    statsEl.textContent = `FPS: ${displayFps}\nDraws: ${displayDraws}\nPasses: ${passCount}`
  }

  animate()
}

main()
