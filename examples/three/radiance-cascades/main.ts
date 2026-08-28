import { CanvasTexture, Color, SRGBColorSpace } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { EmissiveEffect, Flatland, Light2D, Sprite2D } from 'three-flatland'
import {
  DdaFixedRadianceLightEffect,
  HierarchicalRadianceLightEffect,
  RadianceLightEffect,
} from '@three-flatland/presets'
import { createPane } from '@three-flatland/devtools'
import { initializeRenderer } from './renderStartupError'
import { configureExampleRendererColor } from './rendererColorManagement'

let activeRenderer: WebGPURenderer | null = null
let activeFlatland: Flatland | null = null

type ReadableRenderTarget = {
  width: number
  height: number
  texture: unknown
}

type RadianceReadback = {
  width: number
  height: number
  data: Float32Array
}

type LuminanceImage = {
  width: number
  height: number
  data: Float32Array
}

type ImageResolution = {
  width: number
  height: number
}

type PerceptualMetrics = {
  luminanceMae: number
  luminanceRmse: number
  ssim: number
  edgeMae: number
  highFrequencyMae: number
  profileExcessPeaks: number
}

type PerceptualCompareResult = {
  canvas: PerceptualMetrics
  finalRadiance: PerceptualMetrics
  rc: {
    canvas: ImageResolution
    finalRadiance: ImageResolution
    probe: unknown
  }
  hrc: {
    canvas: ImageResolution
    finalRadiance: ImageResolution
    probe: unknown
  }
}

type BufferStats = {
  name: string
  width: number
  height: number
  pixels: number
  meanRgb: [number, number, number]
  meanAlpha: number
  meanLuminance: number
  minLuminance: number
  maxLuminance: number
  nonBlackRatio: number
  finiteRatio: number
  error?: string
}

type BufferAuditResult = {
  probe: unknown
  buffers: BufferStats[]
}

function cloneProbeSnapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  if (value === null || value === undefined) {
    return value
  }
  return JSON.parse(JSON.stringify(value))
}

function halfToFloat(value: number): number {
  const sign = value & 0x8000 ? -1 : 1
  const exponent = (value >> 10) & 0x1f
  const fraction = value & 0x03ff
  if (exponent === 0) return sign * Math.pow(2, -14) * (fraction / 1024)
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY
  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024)
}

function readChannel(data: Float32Array, width: number, height: number, x: number, y: number, c: number): number {
  const ix = Math.max(0, Math.min(width - 1, x))
  const iy = Math.max(0, Math.min(height - 1, y))
  return data[(iy * width + ix) * 4 + c] ?? 0
}

function sampleReadback(readback: RadianceReadback, u: number, v: number, c: number): number {
  const x = Math.max(0, Math.min(readback.width - 1, u * readback.width - 0.5))
  const y = Math.max(0, Math.min(readback.height - 1, v * readback.height - 0.5))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(readback.width - 1, x0 + 1)
  const y1 = Math.min(readback.height - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const a = readChannel(readback.data, readback.width, readback.height, x0, y0, c)
  const b = readChannel(readback.data, readback.width, readback.height, x1, y0, c)
  const d = readChannel(readback.data, readback.width, readback.height, x0, y1, c)
  const e = readChannel(readback.data, readback.width, readback.height, x1, y1, c)
  return (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty
}

function imageDataToLuminance(image: ImageData): LuminanceImage {
  const data = new Float32Array(image.width * image.height)
  for (let i = 0; i < data.length; i++) {
    const j = i * 4
    const r = (image.data[j] ?? 0) / 255
    const g = (image.data[j + 1] ?? 0) / 255
    const b = (image.data[j + 2] ?? 0) / 255
    data[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  return { width: image.width, height: image.height, data }
}

function cropSceneImageData(image: ImageData): ImageData {
  const sceneAspect = 330 / 210
  const cropWidth = Math.min(Math.round(image.width * 0.522), Math.round(image.height * 0.94 * sceneAspect))
  const cropHeight = Math.round(cropWidth / sceneAspect)
  const cropX = Math.max(0, Math.round((image.width - cropWidth) / 2))
  const cropY = Math.max(0, Math.round((image.height - cropHeight) / 2))
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return image
  ctx.putImageData(image, 0, 0)
  return ctx.getImageData(cropX, cropY, cropWidth, cropHeight)
}

function sampleLuminance(image: LuminanceImage, u: number, v: number): number {
  const x = Math.max(0, Math.min(image.width - 1, u * image.width - 0.5))
  const y = Math.max(0, Math.min(image.height - 1, v * image.height - 0.5))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(image.width - 1, x0 + 1)
  const y1 = Math.min(image.height - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const a = image.data[y0 * image.width + x0] ?? 0
  const b = image.data[y0 * image.width + x1] ?? 0
  const c = image.data[y1 * image.width + x0] ?? 0
  const d = image.data[y1 * image.width + x1] ?? 0
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

function sobelAt(image: LuminanceImage, x: number, y: number): number {
  const at = (dx: number, dy: number): number =>
    image.data[
      Math.max(0, Math.min(image.height - 1, y + dy)) * image.width + Math.max(0, Math.min(image.width - 1, x + dx))
    ] ?? 0
  const gx = -at(-1, -1) + at(1, -1) - 2 * at(-1, 0) + 2 * at(1, 0) - at(-1, 1) + at(1, 1)
  const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1)
  return Math.hypot(gx, gy)
}

function highFrequencyAt(image: LuminanceImage, x: number, y: number): number {
  let sum = 0
  let count = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      sum +=
        image.data[
          Math.max(0, Math.min(image.height - 1, y + dy)) * image.width + Math.max(0, Math.min(image.width - 1, x + dx))
        ] ?? 0
      count++
    }
  }
  const center = image.data[y * image.width + x] ?? 0
  return center - sum / count
}

function countProfilePeaks(image: LuminanceImage, yRatio: number): number {
  const y = Math.max(1, Math.min(image.height - 2, Math.round(yRatio * image.height)))
  const startX = Math.round(image.width * 0.22)
  const endX = Math.round(image.width * 0.78)
  const derivatives: number[] = []
  for (let x = startX + 1; x < endX - 1; x++) {
    derivatives.push(Math.abs((image.data[y * image.width + x + 1] ?? 0) - (image.data[y * image.width + x - 1] ?? 0)))
  }
  const mean = derivatives.reduce((sum, value) => sum + value, 0) / Math.max(1, derivatives.length)
  const variance = derivatives.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, derivatives.length)
  const threshold = mean + Math.sqrt(variance) * 2.25
  let peaks = 0
  for (let i = 1; i < derivatives.length - 1; i++) {
    if (
      (derivatives[i] ?? 0) > threshold &&
      (derivatives[i] ?? 0) >= (derivatives[i - 1] ?? 0) &&
      (derivatives[i] ?? 0) >= (derivatives[i + 1] ?? 0)
    ) {
      peaks++
    }
  }
  return peaks
}

function compareLuminanceImages(reference: LuminanceImage, candidate: LuminanceImage): PerceptualMetrics {
  const width = Math.min(512, candidate.width)
  const height = Math.max(1, Math.round(width * (candidate.height / candidate.width)))
  let abs = 0
  let sq = 0
  let refSum = 0
  let candSum = 0
  let refSq = 0
  let candSq = 0
  let cross = 0
  let edgeAbs = 0
  let highAbs = 0
  const refGrid = new Float32Array(width * height)
  const candGrid = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width
      const index = y * width + x
      const ref = sampleLuminance(reference, u, v)
      const cand = sampleLuminance(candidate, u, v)
      const delta = ref - cand
      refGrid[index] = ref
      candGrid[index] = cand
      abs += Math.abs(delta)
      sq += delta * delta
      refSum += ref
      candSum += cand
      refSq += ref * ref
      candSq += cand * cand
      cross += ref * cand
    }
  }

  const count = width * height
  const refMean = refSum / count
  const candMean = candSum / count
  const refVariance = refSq / count - refMean * refMean
  const candVariance = candSq / count - candMean * candMean
  const covariance = cross / count - refMean * candMean
  const c1 = 0.01 ** 2
  const c2 = 0.03 ** 2
  const ssim =
    ((2 * refMean * candMean + c1) * (2 * covariance + c2)) /
    ((refMean * refMean + candMean * candMean + c1) * (refVariance + candVariance + c2))
  const refSmall: LuminanceImage = { width, height, data: refGrid }
  const candSmall: LuminanceImage = { width, height, data: candGrid }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      edgeAbs += Math.abs(sobelAt(refSmall, x, y) - sobelAt(candSmall, x, y))
      highAbs += Math.abs(highFrequencyAt(refSmall, x, y) - highFrequencyAt(candSmall, x, y))
    }
  }
  const innerCount = Math.max(1, (width - 2) * (height - 2))
  const refPeaks = [0.34, 0.52, 0.66].reduce((sum, row) => sum + countProfilePeaks(refSmall, row), 0)
  const candPeaks = [0.34, 0.52, 0.66].reduce((sum, row) => sum + countProfilePeaks(candSmall, row), 0)

  return {
    luminanceMae: abs / count,
    luminanceRmse: Math.sqrt(sq / count),
    ssim,
    edgeMae: edgeAbs / innerCount,
    highFrequencyMae: highAbs / innerCount,
    profileExcessPeaks: candPeaks - refPeaks,
  }
}

function solidTexture(color: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function emitterTexture(color: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
  ctx.beginPath()
  ctx.arc(16, 16, 13, 0, Math.PI * 2)
  ctx.fill()
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function addRect(
  flatland: Flatland,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { lit?: boolean; castsShadow?: boolean; z?: number } = {}
): Sprite2D {
  const sprite = new Sprite2D({
    texture: solidTexture(color),
    lit: options.lit ?? true,
    castsShadow: options.castsShadow ?? false,
  })
  sprite.scale.set(w, h, 1)
  sprite.position.set(x, y, options.z ?? 0)
  flatland.add(sprite)
  return sprite
}

function addEmitter(flatland: Flatland, color: number, x: number, y: number, intensity: number) {
  const sprite = new Sprite2D({
    texture: emitterTexture(color),
    lit: false,
    // Sources must not enter the occluder SDF or they shadow themselves.
    castsShadow: false,
  })
  sprite.scale.set(22, 22, 1)
  sprite.position.set(x, y, 3)

  const emission = new EmissiveEffect()
  const linearColor = new Color(color)
  emission.color = [linearColor.r, linearColor.g, linearColor.b]
  // Keep the on-screen source visibly saturated while the transport remains
  // HDR. A 1:1 display emission clips toward white under tone mapping.
  emission.intensity = intensity * 0.15
  sprite.addEffect(emission)
  flatland.add(sprite)

  // RC/HRC trace analytic sources exactly, so a finite emitter cannot be
  // skipped by a long sphere-trace step. Keep that source co-located with the
  // visible sprite until arbitrary emissive silhouettes have a separate
  // emitter distance field.
  const light = new Light2D({ type: 'point', color, position: [x, y], intensity })
  flatland.add(light)

  return {
    get intensity(): number {
      return light.intensity
    },
    set intensity(value: number) {
      light.intensity = value
      emission.intensity = value * 0.15
    },
    setPosition(nextX: number, nextY: number): void {
      sprite.position.set(nextX, nextY, sprite.position.z)
      light.position.set(nextX, nextY, light.position.z)
    },
  }
}

type Algorithm = 'rc' | 'dda-rc-fixed' | 'hrc' | 'dda-float' | 'dda-integer' | 'dda-fixed'
const requestedAlgorithm = new URLSearchParams(location.search).get('algorithm')
const DEFAULT_EXAMPLE = {
  algorithm: (['rc', 'dda-rc-fixed', 'hrc', 'dda-float', 'dda-integer', 'dda-fixed'].includes(requestedAlgorithm ?? '')
    ? requestedAlgorithm
    : 'hrc') as Algorithm,
}

const RAW_TRANSPORT_DIAGNOSTIC = {
  filterRadius: 0,
  filterStrength: 0,
  raymarchSteps: 64,
  intervalOverlap: 0,
  mipBlur: 0,
  mipStrength: 0,
  wideDownsampleFactor: 2,
  wideLevels: 1,
  hrcShortIntervalCount: 4,
  hrcCompositionLevels: 2,
  hrcFinalResolutionScale: 1,
}

const DEFAULT_LIGHTS = {
  warmIntensity: 1,
  coolIntensity: 1,
}

async function main(): Promise<void> {
  // The built-in stats producer resolves the same Three.js timestamp-query
  // pool as the explicit benchmark hook below. Disable that producer only for
  // isolated benchmark pages so each resolved duration belongs to one frame
  // instead of a coalesced batch. Normal example/dev-panel sessions keep the
  // standard Flatland GPU graph enabled.
  if (new URLSearchParams(location.search).get('gpuBenchmark') === '1') {
    ;(window as Window & { __FLATLAND_DEVTOOLS__?: boolean }).__FLATLAND_DEVTOOLS__ = false
  }
  const status = document.querySelector<HTMLDivElement>('#status')!
  const initialWidth = Math.max(1, document.documentElement.clientWidth)
  const initialHeight = Math.max(1, document.documentElement.clientHeight)
  const renderer = new WebGPURenderer({ antialias: false })
  configureExampleRendererColor(renderer)
  activeRenderer = renderer
  renderer.setSize(initialWidth, initialHeight, false)
  renderer.setPixelRatio(1)
  document.body.appendChild(renderer.domElement)
  if (!(await initializeRenderer(renderer))) return

  const flatland = new Flatland({
    viewSize: 360,
    aspect: initialWidth / initialHeight,
    clearColor: 0x111418,
  })
  activeFlatland = flatland
  flatland.resize(initialWidth, initialHeight)

  let rcLighting = new RadianceLightEffect()
  let ddaRcLighting = new DdaFixedRadianceLightEffect()
  let hrcLighting = new HierarchicalRadianceLightEffect()
  let rcLightingUsable = true
  let ddaRcLightingUsable = true
  let hrcLightingUsable = true
  // The panel is populated from these live effects below; it must never become
  // a second, hidden source of defaults.
  let lighting:
    | InstanceType<typeof RadianceLightEffect>
    | InstanceType<typeof DdaFixedRadianceLightEffect>
    | InstanceType<typeof HierarchicalRadianceLightEffect> =
    DEFAULT_EXAMPLE.algorithm === 'rc'
      ? rcLighting
      : DEFAULT_EXAMPLE.algorithm === 'dda-rc-fixed'
        ? ddaRcLighting
        : hrcLighting
  flatland.setLighting(lighting)

  function ensureRcLighting(): InstanceType<typeof RadianceLightEffect> {
    if (!rcLightingUsable) {
      rcLighting = new RadianceLightEffect()
      rcLightingUsable = true
    }
    return rcLighting
  }

  function ensureHrcLighting(): InstanceType<typeof HierarchicalRadianceLightEffect> {
    if (!hrcLightingUsable) {
      hrcLighting = new HierarchicalRadianceLightEffect()
      hrcLightingUsable = true
    }
    return hrcLighting
  }

  function ensureDdaRcLighting(): InstanceType<typeof DdaFixedRadianceLightEffect> {
    if (!ddaRcLightingUsable) {
      ddaRcLighting = new DdaFixedRadianceLightEffect()
      ddaRcLightingUsable = true
    }
    return ddaRcLighting
  }

  function switchLighting(
    algorithm: 'rc' | 'dda-rc-fixed' | 'hrc' | 'dda-float' | 'dda-integer' | 'dda-fixed',
    intensity: number
  ): void {
    const next =
      algorithm === 'rc'
        ? ensureRcLighting()
        : algorithm === 'dda-rc-fixed'
          ? ensureDdaRcLighting()
          : ensureHrcLighting()
    next.radianceIntensity = intensity
    if (next === hrcLighting) {
      next.radiance.compositionMode = 'holographic'
      next.radiance.holographicTraversal =
        algorithm === 'dda-float'
          ? 'dda-float'
          : algorithm === 'dda-integer'
            ? 'dda-integer'
            : algorithm === 'dda-fixed'
              ? 'dda-fixed'
              : 'sdf'
    }
    if (next === lighting) return

    const previous = lighting
    flatland.setLighting(next)
    if (previous === rcLighting) rcLightingUsable = false
    if (previous === ddaRcLighting) ddaRcLightingUsable = false
    if (previous === hrcLighting) hrcLightingUsable = false
    lighting = next
  }
  switchLighting(DEFAULT_EXAMPLE.algorithm, lighting.radianceIntensity)

  addRect(flatland, '#d8d6ca', 0, 0, 330, 210, { z: -20 })
  const occluders = [
    addRect(flatland, '#1a1f29', 5, 0, 22, 156, { lit: false, castsShadow: true, z: 2 }),
    addRect(flatland, '#252b35', -70, -58, 86, 18, { lit: false, castsShadow: true, z: 2 }),
    addRect(flatland, '#252b35', 94, 58, 82, 18, { lit: false, castsShadow: true, z: 2 }),
  ]
  const occluderPositions = occluders.map((occluder) => occluder.position.clone())
  const warm = addEmitter(flatland, 0xff8a45, -128, 4, DEFAULT_LIGHTS.warmIntensity)
  const cool = addEmitter(flatland, 0x4c9dff, 128, -10, DEFAULT_LIGHTS.coolIntensity)

  const ambient = new Light2D({
    type: 'ambient',
    color: 0x1c2230,
    intensity: 0.2,
  })
  flatland.add(ambient)

  const params = {
    algorithm: DEFAULT_EXAMPLE.algorithm as 'rc' | 'dda-rc-fixed' | 'hrc' | 'dda-float' | 'dda-integer' | 'dda-fixed',
    intensity: lighting.radianceIntensity,
    filterRadius: lighting.radiance.filterRadius,
    filterStrength: lighting.radiance.filterStrength,
    raymarchSteps: lighting.radiance.raymarchSteps,
    intervalOverlap: lighting.radiance.intervalOverlap,
    mipBlur: lighting.radiance.mipBlur,
    mipStrength: lighting.radiance.mipStrength,
    wideDownsampleFactor: lighting.radiance.wideDownsampleFactor,
    wideLevels: lighting.radiance.wideLevels,
    lightSourceRadius: lighting.radiance.lightSourceRadius,
    hrcCompositionMode: hrcLighting.radiance.compositionMode,
    hrcShortIntervalCount: hrcLighting.radiance.shortIntervalCount,
    hrcCompositionLevels: hrcLighting.radiance.compositionLevels,
    hrcFinalResolutionScale: hrcLighting.radiance.holographicFinalResolutionScale,
    ddaPixelSize: hrcLighting.radiance.ddaPixelSize,
    ddaBleedThreshold: hrcLighting.radiance.ddaBleedThreshold,
    ddaQuantizationBits: hrcLighting.radiance.ddaQuantizationBits,
    ddaTransferRange: hrcLighting.radiance.ddaTransferRange,
    ddaRadianceRange: hrcLighting.radiance.ddaRadianceRange,
    ddaPaletteBands: hrcLighting.radiance.ddaPaletteBands,
    ddaPaletteExposure: hrcLighting.radiance.ddaPaletteExposure,
    warmIntensity: warm.intensity,
    coolIntensity: cool.intensity,
    occluders: true,
    wallOpen: false,
    paused: false,
  }
  function syncOccluderState(): void {
    for (const [index, occluder] of occluders.entries()) {
      const enabled = params.occluders && !(params.wallOpen && index === 0)
      // Keep the ECS batch row enrolled and move disabled casters outside the
      // lighting domain. Visibility and packed shadow-bit changes otherwise
      // reach the shadow pre-pass on different projection frames.
      occluder.castsShadow = enabled
      occluder.position.copy(enabled ? occluderPositions[index]! : occluderPositions[index]!.clone().setX(10000))
    }
  }
  function syncParamsFromActiveRadiance(): void {
    const radiance = lighting.radiance
    params.filterRadius = radiance.filterRadius
    params.filterStrength = radiance.filterStrength
    params.raymarchSteps = radiance.raymarchSteps
    params.intervalOverlap = radiance.intervalOverlap
    params.mipBlur = radiance.mipBlur
    params.mipStrength = radiance.mipStrength
    params.wideDownsampleFactor = radiance.wideDownsampleFactor
    params.wideLevels = radiance.wideLevels
    params.lightSourceRadius = radiance.lightSourceRadius
    params.hrcCompositionMode = hrcLighting.radiance.compositionMode
    params.hrcShortIntervalCount = hrcLighting.radiance.shortIntervalCount
    params.hrcCompositionLevels = hrcLighting.radiance.compositionLevels
    params.hrcFinalResolutionScale = hrcLighting.radiance.holographicFinalResolutionScale
    const ddaRadiance = params.algorithm === 'dda-rc-fixed' ? ddaRcLighting.radiance : hrcLighting.radiance
    params.ddaPixelSize = ddaRadiance.ddaPixelSize
    params.ddaBleedThreshold = ddaRadiance.ddaBleedThreshold
    params.ddaQuantizationBits = ddaRadiance.ddaQuantizationBits
    params.ddaTransferRange = hrcLighting.radiance.ddaTransferRange
    params.ddaRadianceRange = ddaRadiance.ddaRadianceRange
    params.ddaPaletteBands = ddaRadiance.ddaPaletteBands
    params.ddaPaletteExposure = ddaRadiance.ddaPaletteExposure
  }
  const paneBundle = createPane({ driver: 'manual' })
  const { pane } = paneBundle
  const updateDevtools = () => paneBundle.update()
  let refreshingPane = false
  const refreshPane = (): void => {
    if (refreshingPane) return
    refreshingPane = true
    try {
      pane.refresh()
    } finally {
      refreshingPane = false
    }
  }
  const folder = pane.addFolder({ title: 'Radiance Cascades', expanded: true })
  folder
    .addBinding(params, 'algorithm', {
      options: {
        RC: 'rc',
        'DDA RC Fixed': 'dda-rc-fixed',
        HRC: 'hrc',
        'DDA Float': 'dda-float',
        'DDA Integer': 'dda-integer',
        'DDA Fixed': 'dda-fixed',
      },
    })
    .on('change', () => {
      switchLighting(params.algorithm, params.intensity)
      syncParamsFromActiveRadiance()
      refreshPane()
      syncAlgorithmVisibility()
    })
  const hrcModeBinding = folder
    .addBinding(params, 'hrcCompositionMode', {
      label: 'HRC mode',
      options: { Holographic: 'holographic', 'Legacy interval': 'hierarchical' },
    })
    .on('change', () => {
      hrcLighting.radiance.compositionMode = params.hrcCompositionMode
      refreshPane()
      syncAlgorithmVisibility()
    })
  folder.addBinding(params, 'intensity', { min: 0, max: 4, step: 0.01 }).on('change', () => {
    rcLighting.radianceIntensity = params.intensity
    ddaRcLighting.radianceIntensity = params.intensity
    hrcLighting.radianceIntensity = params.intensity
  })
  folder.addBinding(params, 'warmIntensity', { min: 0, max: 4, step: 0.01 }).on('change', () => {
    warm.intensity = params.warmIntensity
  })
  folder.addBinding(params, 'coolIntensity', { min: 0, max: 4, step: 0.01 }).on('change', () => {
    cool.intensity = params.coolIntensity
  })
  folder.addBinding(params, 'occluders', { label: 'Occluders' }).on('change', () => {
    syncOccluderState()
  })
  folder.addBinding(params, 'wallOpen', { label: 'center wall open' }).on('change', () => {
    syncOccluderState()
  })
  folder.addBinding(params, 'paused')

  const advanced = pane.addFolder({ title: 'Advanced', expanded: false })
  advanced.addBinding(params, 'filterRadius', { min: 0, max: 3, step: 0.05 }).on('change', () => {
    lighting.radiance.filterRadius = params.filterRadius
  })
  advanced.addBinding(params, 'filterStrength', { min: 0, max: 1, step: 0.05 }).on('change', () => {
    lighting.radiance.filterStrength = params.filterStrength
  })
  const raymarchStepsBinding = advanced
    .addBinding(params, 'raymarchSteps', { min: 8, max: 96, step: 1 })
    .on('change', () => {
      lighting.radiance.raymarchSteps = params.raymarchSteps
      params.raymarchSteps = lighting.radiance.raymarchSteps
      refreshPane()
    })
  const intervalOverlapBinding = advanced
    .addBinding(params, 'intervalOverlap', { label: 'interval overlap (RC)', min: 0, max: 0.3, step: 0.01 })
    .on('change', () => {
      rcLighting.radiance.intervalOverlap = params.intervalOverlap
    })
  advanced.addBinding(params, 'mipBlur', { label: 'approx GI blur', min: 0, max: 1, step: 0.05 }).on('change', () => {
    lighting.radiance.mipBlur = params.mipBlur
  })
  advanced
    .addBinding(params, 'mipStrength', { label: 'approx GI blend', min: 0, max: 1, step: 0.05 })
    .on('change', () => {
      lighting.radiance.mipStrength = params.mipStrength
    })
  advanced.addBinding(params, 'wideDownsampleFactor', { min: 2, max: 4, step: 1 }).on('change', () => {
    lighting.radiance.wideDownsampleFactor = params.wideDownsampleFactor
    params.wideDownsampleFactor = lighting.radiance.wideDownsampleFactor
    refreshPane()
  })
  advanced.addBinding(params, 'wideLevels', { min: 1, max: 2, step: 1 }).on('change', () => {
    lighting.radiance.wideLevels = params.wideLevels
  })
  advanced
    .addBinding(params, 'lightSourceRadius', { label: 'emitter radius (0=auto)', min: 0, max: 24, step: 0.25 })
    .on('change', () => {
      lighting.radiance.lightSourceRadius = params.lightSourceRadius
    })
  const hrcShortIntervalBinding = advanced
    .addBinding(params, 'hrcShortIntervalCount', { label: 'legacy interval count', min: 4, max: 16, step: 1 })
    .on('change', () => {
      hrcLighting.radiance.shortIntervalCount = params.hrcShortIntervalCount
      params.hrcShortIntervalCount = hrcLighting.radiance.shortIntervalCount
      refreshPane()
    })
  const hrcCompositionLevelsBinding = advanced
    .addBinding(params, 'hrcCompositionLevels', { label: 'legacy composition levels', min: 1, max: 4, step: 1 })
    .on('change', () => {
      hrcLighting.radiance.compositionLevels = params.hrcCompositionLevels
      params.hrcCompositionLevels = hrcLighting.radiance.compositionLevels
      refreshPane()
    })
  const hrcResolutionBinding = advanced
    .addBinding(params, 'hrcFinalResolutionScale', {
      label: 'HRC hierarchy scale',
      options: { 'Full / default (4x)': 4, 'Mobile (2x)': 2, 'Diagnostic (1x)': 1 },
    })
    .on('change', () => {
      hrcLighting.radiance.holographicFinalResolutionScale = params.hrcFinalResolutionScale
      params.hrcFinalResolutionScale = hrcLighting.radiance.holographicFinalResolutionScale
      refreshPane()
    })
  const ddaPixelSizeBinding = advanced
    .addBinding(params, 'ddaPixelSize', { label: 'lighting pixel size', min: 1, max: 32, step: 1 })
    .on('change', () => {
      hrcLighting.radiance.ddaPixelSize = params.ddaPixelSize
      ddaRcLighting.radiance.ddaPixelSize = params.ddaPixelSize
      params.ddaPixelSize = hrcLighting.radiance.ddaPixelSize
      refreshPane()
    })
  const ddaBleedThresholdBinding = advanced
    .addBinding(params, 'ddaBleedThreshold', { label: 'bleed color threshold', min: 0, max: 2, step: 0.05 })
    .on('change', () => {
      hrcLighting.radiance.ddaBleedThreshold = params.ddaBleedThreshold
      ddaRcLighting.radiance.ddaBleedThreshold = params.ddaBleedThreshold
      params.ddaBleedThreshold = hrcLighting.radiance.ddaBleedThreshold
      refreshPane()
    })
  const ddaQuantizationBitsBinding = advanced
    .addBinding(params, 'ddaQuantizationBits', { label: 'fixed-point bits', min: 2, max: 8, step: 1 })
    .on('change', () => {
      hrcLighting.radiance.ddaQuantizationBits = params.ddaQuantizationBits
      ddaRcLighting.radiance.ddaQuantizationBits = params.ddaQuantizationBits
      params.ddaQuantizationBits = hrcLighting.radiance.ddaQuantizationBits
      refreshPane()
    })
  const ddaRadianceRangeBinding = advanced
    .addBinding(params, 'ddaRadianceRange', { label: 'fixed R0 range', min: 0.25, max: 16, step: 0.25 })
    .on('change', () => {
      hrcLighting.radiance.ddaRadianceRange = params.ddaRadianceRange
      ddaRcLighting.radiance.ddaRadianceRange = params.ddaRadianceRange
      params.ddaRadianceRange = hrcLighting.radiance.ddaRadianceRange
      refreshPane()
    })
  const ddaTransferRangeBinding = advanced
    .addBinding(params, 'ddaTransferRange', { label: 'fixed transfer range', min: 0.25, max: 16, step: 0.25 })
    .on('change', () => {
      hrcLighting.radiance.ddaTransferRange = params.ddaTransferRange
      params.ddaTransferRange = hrcLighting.radiance.ddaTransferRange
      refreshPane()
    })
  const ddaPaletteBandsBinding = advanced
    .addBinding(params, 'ddaPaletteBands', {
      label: 'lighting palette',
      options: { Off: 0, '4 bands': 4, '8 bands': 8, '16 bands': 16, '32 bands': 32 },
    })
    .on('change', () => {
      hrcLighting.radiance.ddaPaletteBands = params.ddaPaletteBands
      ddaRcLighting.radiance.ddaPaletteBands = params.ddaPaletteBands
      params.ddaPaletteBands = hrcLighting.radiance.ddaPaletteBands
      refreshPane()
    })
  const ddaPaletteExposureBinding = advanced
    .addBinding(params, 'ddaPaletteExposure', { label: 'palette exposure', min: 0.25, max: 64, step: 0.25 })
    .on('change', () => {
      hrcLighting.radiance.ddaPaletteExposure = params.ddaPaletteExposure
      ddaRcLighting.radiance.ddaPaletteExposure = params.ddaPaletteExposure
      params.ddaPaletteExposure = hrcLighting.radiance.ddaPaletteExposure
      refreshPane()
    })
  function syncAlgorithmVisibility(): void {
    const usesHrc = params.algorithm !== 'rc' && params.algorithm !== 'dda-rc-fixed'
    const usesDdaTraversal =
      params.algorithm === 'dda-rc-fixed' ||
      params.algorithm === 'dda-float' ||
      params.algorithm === 'dda-integer' ||
      params.algorithm === 'dda-fixed'
    const usesLogicalPixelGrid =
      params.algorithm === 'dda-rc-fixed' || params.algorithm === 'dda-integer' || params.algorithm === 'dda-fixed'
    const usesFixedPoint = params.algorithm === 'dda-rc-fixed' || params.algorithm === 'dda-fixed'
    const usesLegacyIntervals = params.algorithm === 'hrc' && params.hrcCompositionMode === 'hierarchical'
    hrcModeBinding.hidden = params.algorithm !== 'hrc'
    intervalOverlapBinding.hidden = usesHrc
    raymarchStepsBinding.hidden = usesDdaTraversal
    hrcShortIntervalBinding.hidden = !usesLegacyIntervals
    hrcCompositionLevelsBinding.hidden = !usesLegacyIntervals
    // Integer DDA resolution is defined solely by viewport / pixel size.
    // The legacy HRC hierarchy scale must not shadow that contract.
    hrcResolutionBinding.hidden = !usesHrc || usesLogicalPixelGrid
    ddaPixelSizeBinding.hidden = !usesLogicalPixelGrid
    ddaBleedThresholdBinding.hidden = !usesLogicalPixelGrid
    ddaQuantizationBitsBinding.hidden = !usesFixedPoint
    ddaTransferRangeBinding.hidden = params.algorithm !== 'dda-fixed'
    ddaRadianceRangeBinding.hidden = !usesFixedPoint
    ddaPaletteBandsBinding.hidden = !usesDdaTraversal
    ddaPaletteExposureBinding.hidden = !usesDdaTraversal
  }
  syncAlgorithmVisibility()
  ;(
    window as Window & {
      __radianceCascadeControls?: {
        setAlgorithm: (algorithm: 'rc' | 'dda-rc-fixed' | 'hrc' | 'dda-float' | 'dda-integer' | 'dda-fixed') => void
        setRadianceIntensity: (intensity: number) => void
        setLocalFilter: (radius: number, strength: number) => void
        setRaymarchSteps: (steps: number) => void
        setMipFilter: (blur: number, strength: number, levels?: number) => void
        setIntervalOverlap: (overlap: number) => void
        setWideDownsampleFactor: (factor: number) => void
        setLightSourceRadius: (radius: number) => void
        setHrcComposition: (shortIntervalCount: number, compositionLevels?: number) => void
        setHrcCompositionMode: (mode: 'hierarchical' | 'holographic') => void
        setHrcFinalResolutionScale: (scale: number) => void
        setDdaPixelSize: (pixelSize: number) => void
        setDdaBleedThreshold: (threshold: number) => void
        setDdaFixedPoint: (bits: number, radianceRange?: number, transferRange?: number) => void
        setDdaPaletteBands: (bands: number) => void
        setDdaPaletteExposure: (exposure: number) => void
        setComparisonResolutionCap: (cap: number) => void
        setLightIntensities: (warmIntensity: number, coolIntensity: number) => void
        setLightPositions: (warmX: number, warmY: number, coolX: number, coolY: number) => void
        setOccluderPosition: (index: number, x: number, y: number) => void
        setOccluders: (enabled: boolean) => void
        setWallOpen: (open: boolean) => void
        setRenderSize: (width: number, height: number) => void
        setComparisonBaseline: () => void
        captureFinalRadiance: () => Promise<{
          width: number
          height: number
          byteLength: number
          hash: string
          byteSum: number
        }>
        sampleGpuTime: (sampleCount?: number) => Promise<{
          supported: boolean
          samples: number[]
          median: number | null
          p95: number | null
          min: number | null
          max: number | null
        }>
        compareFinalRadiance: () => Promise<unknown>
        comparePerceptual: () => Promise<PerceptualCompareResult>
        auditHrcBuffers: () => Promise<BufferAuditResult>
      }
    }
  ).__radianceCascadeControls = {
    setAlgorithm(algorithm: 'rc' | 'dda-rc-fixed' | 'hrc' | 'dda-float' | 'dda-integer' | 'dda-fixed'): void {
      params.algorithm = algorithm
      switchLighting(algorithm, params.intensity)
      syncParamsFromActiveRadiance()
      refreshPane()
    },
    setRadianceIntensity(intensity: number): void {
      params.intensity = intensity
      rcLighting.radianceIntensity = intensity
      ddaRcLighting.radianceIntensity = intensity
      hrcLighting.radianceIntensity = intensity
      refreshPane()
    },
    setLocalFilter(radius: number, strength: number): void {
      params.filterRadius = radius
      params.filterStrength = strength
      lighting.radiance.filterRadius = radius
      lighting.radiance.filterStrength = strength
      refreshPane()
    },
    setRaymarchSteps(steps: number): void {
      lighting.radiance.raymarchSteps = steps
      params.raymarchSteps = lighting.radiance.raymarchSteps
      refreshPane()
    },
    setMipFilter(blur: number, strength: number, levels = params.wideLevels): void {
      params.mipBlur = blur
      params.mipStrength = strength
      params.wideLevels = levels
      lighting.radiance.mipBlur = blur
      lighting.radiance.mipStrength = strength
      lighting.radiance.wideLevels = levels
      refreshPane()
    },
    setIntervalOverlap(overlap: number): void {
      params.intervalOverlap = overlap
      rcLighting.radiance.intervalOverlap = overlap
      ddaRcLighting.radiance.intervalOverlap = overlap
      refreshPane()
    },
    setWideDownsampleFactor(factor: number): void {
      lighting.radiance.wideDownsampleFactor = factor
      params.wideDownsampleFactor = lighting.radiance.wideDownsampleFactor
      refreshPane()
    },
    setLightSourceRadius(radius: number): void {
      lighting.radiance.lightSourceRadius = radius
      params.lightSourceRadius = lighting.radiance.lightSourceRadius
      refreshPane()
    },
    setHrcComposition(shortIntervalCount: number, compositionLevels = params.hrcCompositionLevels): void {
      hrcLighting.radiance.shortIntervalCount = shortIntervalCount
      hrcLighting.radiance.compositionLevels = compositionLevels
      params.hrcShortIntervalCount = hrcLighting.radiance.shortIntervalCount
      params.hrcCompositionLevels = hrcLighting.radiance.compositionLevels
      refreshPane()
    },
    setHrcCompositionMode(mode: 'hierarchical' | 'holographic'): void {
      hrcLighting.radiance.compositionMode = mode
      params.hrcCompositionMode = hrcLighting.radiance.compositionMode
      refreshPane()
    },
    setHrcFinalResolutionScale(scale: number): void {
      hrcLighting.radiance.holographicFinalResolutionScale = scale
      params.hrcFinalResolutionScale = hrcLighting.radiance.holographicFinalResolutionScale
      refreshPane()
    },
    setDdaPixelSize(pixelSize: number): void {
      hrcLighting.radiance.ddaPixelSize = pixelSize
      ddaRcLighting.radiance.ddaPixelSize = pixelSize
      params.ddaPixelSize =
        params.algorithm === 'dda-rc-fixed' ? ddaRcLighting.radiance.ddaPixelSize : hrcLighting.radiance.ddaPixelSize
      refreshPane()
    },
    setDdaBleedThreshold(threshold: number): void {
      hrcLighting.radiance.ddaBleedThreshold = threshold
      ddaRcLighting.radiance.ddaBleedThreshold = threshold
      params.ddaBleedThreshold = threshold
      refreshPane()
    },
    setDdaFixedPoint(
      bits: number,
      radianceRange = params.ddaRadianceRange,
      transferRange = params.ddaTransferRange
    ): void {
      hrcLighting.radiance.ddaQuantizationBits = bits
      hrcLighting.radiance.ddaRadianceRange = radianceRange
      hrcLighting.radiance.ddaTransferRange = transferRange
      ddaRcLighting.radiance.ddaQuantizationBits = bits
      ddaRcLighting.radiance.ddaRadianceRange = radianceRange
      params.ddaQuantizationBits = bits
      params.ddaRadianceRange = radianceRange
      params.ddaTransferRange = hrcLighting.radiance.ddaTransferRange
      refreshPane()
    },
    setDdaPaletteBands(bands: number): void {
      hrcLighting.radiance.ddaPaletteBands = bands
      ddaRcLighting.radiance.ddaPaletteBands = bands
      params.ddaPaletteBands = bands
      refreshPane()
    },
    setDdaPaletteExposure(exposure: number): void {
      hrcLighting.radiance.ddaPaletteExposure = exposure
      ddaRcLighting.radiance.ddaPaletteExposure = exposure
      params.ddaPaletteExposure = exposure
      refreshPane()
    },
    setComparisonResolutionCap(cap: number): void {
      const resolutionCap = Math.max(128, Math.min(2048, Math.round(cap)))
      rcLighting.radiance.config.maxAutoCascadeResolution = resolutionCap
      ddaRcLighting.radiance.config.maxAutoCascadeResolution = resolutionCap
      hrcLighting.radiance.config.maxAutoCascadeResolution = resolutionCap
      flatland.setLighting(lighting)
      refreshPane()
    },
    setLightIntensities(warmIntensity: number, coolIntensity: number): void {
      params.warmIntensity = warmIntensity
      params.coolIntensity = coolIntensity
      warm.intensity = warmIntensity
      cool.intensity = coolIntensity
      refreshPane()
    },
    setLightPositions(warmX: number, warmY: number, coolX: number, coolY: number): void {
      warm.setPosition(warmX, warmY)
      cool.setPosition(coolX, coolY)
    },
    setOccluderPosition(index: number, x: number, y: number): void {
      const occluder = occluders[index]
      const position = occluderPositions[index]
      if (!occluder || !position) return
      position.set(x, y, position.z)
      occluder.position.copy(params.occluders ? position : position.clone().setX(10000))
    },
    setOccluders(enabled: boolean): void {
      params.occluders = enabled
      syncOccluderState()
      refreshPane()
    },
    setWallOpen(open: boolean): void {
      params.wallOpen = open
      syncOccluderState()
      refreshPane()
    },
    setRenderSize(width: number, height: number): void {
      const nextWidth = Math.max(1, Math.round(width))
      const nextHeight = Math.max(1, Math.round(height))
      renderer.setSize(nextWidth, nextHeight, false)
      flatland.resize(nextWidth, nextHeight)
      refreshPane()
    },
    setComparisonBaseline(): void {
      params.filterRadius = RAW_TRANSPORT_DIAGNOSTIC.filterRadius
      params.filterStrength = RAW_TRANSPORT_DIAGNOSTIC.filterStrength
      params.raymarchSteps = RAW_TRANSPORT_DIAGNOSTIC.raymarchSteps
      params.intervalOverlap = RAW_TRANSPORT_DIAGNOSTIC.intervalOverlap
      params.mipBlur = RAW_TRANSPORT_DIAGNOSTIC.mipBlur
      params.mipStrength = RAW_TRANSPORT_DIAGNOSTIC.mipStrength
      params.wideDownsampleFactor = RAW_TRANSPORT_DIAGNOSTIC.wideDownsampleFactor
      params.wideLevels = RAW_TRANSPORT_DIAGNOSTIC.wideLevels
      params.hrcShortIntervalCount = RAW_TRANSPORT_DIAGNOSTIC.hrcShortIntervalCount
      params.hrcCompositionLevels = RAW_TRANSPORT_DIAGNOSTIC.hrcCompositionLevels
      params.hrcFinalResolutionScale = RAW_TRANSPORT_DIAGNOSTIC.hrcFinalResolutionScale

      for (const radiance of [rcLighting.radiance, hrcLighting.radiance]) {
        radiance.filterRadius = RAW_TRANSPORT_DIAGNOSTIC.filterRadius
        radiance.filterStrength = RAW_TRANSPORT_DIAGNOSTIC.filterStrength
        radiance.raymarchSteps = RAW_TRANSPORT_DIAGNOSTIC.raymarchSteps
        radiance.mipBlur = RAW_TRANSPORT_DIAGNOSTIC.mipBlur
        radiance.mipStrength = RAW_TRANSPORT_DIAGNOSTIC.mipStrength
        radiance.wideDownsampleFactor = RAW_TRANSPORT_DIAGNOSTIC.wideDownsampleFactor
        radiance.wideLevels = RAW_TRANSPORT_DIAGNOSTIC.wideLevels
      }
      rcLighting.radiance.intervalOverlap = RAW_TRANSPORT_DIAGNOSTIC.intervalOverlap
      hrcLighting.radiance.intervalOverlap = RAW_TRANSPORT_DIAGNOSTIC.intervalOverlap
      hrcLighting.radiance.shortIntervalCount = RAW_TRANSPORT_DIAGNOSTIC.hrcShortIntervalCount
      hrcLighting.radiance.compositionLevels = RAW_TRANSPORT_DIAGNOSTIC.hrcCompositionLevels
      hrcLighting.radiance.holographicFinalResolutionScale = RAW_TRANSPORT_DIAGNOSTIC.hrcFinalResolutionScale
      params.hrcCompositionMode = hrcLighting.radiance.compositionMode
      refreshPane()
    },
    async captureFinalRadiance(): Promise<{
      width: number
      height: number
      byteLength: number
      hash: string
      byteSum: number
    }> {
      const target = (
        lighting.radiance as unknown as {
          _finalRadianceRT: ReadableRenderTarget
        }
      )._finalRadianceRT
      const readAsync = (
        renderer as unknown as {
          readRenderTargetPixelsAsync?: (
            renderTarget: unknown,
            x: number,
            y: number,
            width: number,
            height: number
          ) => Promise<ArrayBufferView>
        }
      ).readRenderTargetPixelsAsync
      if (typeof readAsync !== 'function') {
        throw new Error('renderer.readRenderTargetPixelsAsync is unavailable')
      }
      const pixels = await readAsync.call(renderer, target, 0, 0, target.width, target.height)
      const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
      let hash = 0x811c9dc5
      let byteSum = 0
      for (const byte of bytes) {
        hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
        byteSum += byte
      }
      return {
        width: target.width,
        height: target.height,
        byteLength: bytes.byteLength,
        hash: hash.toString(16).padStart(8, '0'),
        byteSum,
      }
    },
    async sampleGpuTime(sampleCount = 12): Promise<{
      supported: boolean
      samples: number[]
      median: number | null
      p95: number | null
      min: number | null
      max: number | null
    }> {
      const backend = renderer.backend as unknown as {
        trackTimestamp?: boolean
        device?: { features?: { has(name: string): boolean } }
      }
      const supported = backend.device?.features?.has('timestamp-query') === true
      const resolve = (
        renderer as unknown as {
          resolveTimestampsAsync?: (type: 'render') => Promise<void>
        }
      ).resolveTimestampsAsync
      if (!supported || typeof resolve !== 'function') {
        return { supported: false, samples: [], median: null, p95: null, min: null, max: null }
      }

      const previousTracking = backend.trackTimestamp
      backend.trackTimestamp = true
      const samples: number[] = []
      const requested = Math.max(1, Math.min(60, Math.round(sampleCount)))
      try {
        // Warm the timestamp pool after enabling it, then resolve one completed
        // render batch at a time. Three reports milliseconds in
        // `info.render.timestamp` after the async pool resolve lands.
        for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame)
        for (let i = 0; i < requested * 3 && samples.length < requested; i++) {
          await new Promise(requestAnimationFrame)
          await resolve.call(renderer, 'render')
          const value = renderer.info.render.timestamp
          if (Number.isFinite(value) && value > 0) samples.push(value)
        }
      } finally {
        if (previousTracking !== true) {
          await resolve.call(renderer, 'render').catch(() => undefined)
          backend.trackTimestamp = previousTracking
        }
      }

      const sorted = [...samples].sort((a, b) => a - b)
      const quantile = (q: number): number | null => {
        if (sorted.length === 0) return null
        return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] ?? null
      }
      return {
        supported: true,
        samples,
        median: quantile(0.5),
        p95: quantile(0.95),
        min: sorted[0] ?? null,
        max: sorted.at(-1) ?? null,
      }
    },
    async compareFinalRadiance(): Promise<unknown> {
      const waitFrames = async (count: number): Promise<void> => {
        for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame)
      }
      const readTarget = async (target: ReadableRenderTarget): Promise<RadianceReadback> => {
        const readAsync = (
          renderer as unknown as {
            readRenderTargetPixelsAsync?: (
              renderTarget: unknown,
              x: number,
              y: number,
              width: number,
              height: number
            ) => Promise<ArrayBufferView>
          }
        ).readRenderTargetPixelsAsync
        if (typeof readAsync !== 'function') {
          throw new Error('renderer.readRenderTargetPixelsAsync is unavailable')
        }
        const pixels = await readAsync.call(renderer, target, 0, 0, target.width, target.height)
        const values = new Float32Array(target.width * target.height * 4)
        if (pixels instanceof Float32Array) {
          values.set(pixels.subarray(0, values.length))
        } else if (pixels instanceof Uint16Array) {
          for (let i = 0; i < values.length; i++) values[i] = halfToFloat(pixels[i] ?? 0)
        } else if (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) {
          for (let i = 0; i < values.length; i++) values[i] = (pixels[i] ?? 0) / 255
        } else {
          const view = new Uint16Array(pixels.buffer, pixels.byteOffset, Math.floor(pixels.byteLength / 2))
          for (let i = 0; i < values.length; i++) values[i] = halfToFloat(view[i] ?? 0)
        }
        return { width: target.width, height: target.height, data: values }
      }
      const setAlgorithmAndWait = async (algorithm: 'rc' | 'hrc'): Promise<void> => {
        params.algorithm = algorithm
        switchLighting(algorithm, params.intensity)
        syncParamsFromActiveRadiance()
        refreshPane()
        await waitFrames(8)
      }

      await setAlgorithmAndWait('rc')
      const rcTarget = (rcLighting.radiance as unknown as { _finalRadianceRT: ReadableRenderTarget })._finalRadianceRT
      const rcReadback = await readTarget(rcTarget)
      await setAlgorithmAndWait('hrc')
      const hrcTarget = (hrcLighting.radiance as unknown as { _finalRadianceRT: ReadableRenderTarget })._finalRadianceRT
      const hrcReadback = await readTarget(hrcTarget)

      const compareWidth = hrcReadback.width
      const compareHeight = hrcReadback.height
      const abs = [0, 0, 0]
      const sq = [0, 0, 0]
      const max = [0, 0, 0]
      const rcMean = [0, 0, 0]
      const hrcMean = [0, 0, 0]
      const count = compareWidth * compareHeight
      for (let y = 0; y < compareHeight; y++) {
        const v = (y + 0.5) / compareHeight
        for (let x = 0; x < compareWidth; x++) {
          const u = (x + 0.5) / compareWidth
          for (let c = 0; c < 3; c++) {
            const rcValue = sampleReadback(rcReadback, u, v, c)
            const hrcValue = sampleReadback(hrcReadback, u, v, c)
            const delta = Math.abs(rcValue - hrcValue)
            abs[c]! += delta
            sq[c]! += delta * delta
            max[c] = Math.max(max[c]!, delta)
            rcMean[c]! += rcValue
            hrcMean[c]! += hrcValue
          }
        }
      }
      const result = {
        compare: { width: compareWidth, height: compareHeight, samples: count },
        rc: {
          width: rcReadback.width,
          height: rcReadback.height,
          mean: rcMean.map((value) => value / count),
        },
        hrc: {
          width: hrcReadback.width,
          height: hrcReadback.height,
          mean: hrcMean.map((value) => value / count),
        },
        mae: abs.map((value) => value / count),
        rmse: sq.map((value) => Math.sqrt(value / count)),
        max,
      }
      console.log('final-radiance-compare', JSON.stringify(result))
      return result
    },
    async comparePerceptual(): Promise<PerceptualCompareResult> {
      const waitFrames = async (count: number): Promise<void> => {
        for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame)
      }
      const readTarget = async (target: ReadableRenderTarget): Promise<RadianceReadback> => {
        const readAsync = (
          renderer as unknown as {
            readRenderTargetPixelsAsync?: (
              renderTarget: unknown,
              x: number,
              y: number,
              width: number,
              height: number
            ) => Promise<ArrayBufferView>
          }
        ).readRenderTargetPixelsAsync
        if (typeof readAsync !== 'function') {
          throw new Error('renderer.readRenderTargetPixelsAsync is unavailable')
        }
        const pixels = await readAsync.call(renderer, target, 0, 0, target.width, target.height)
        const values = new Float32Array(target.width * target.height * 4)
        if (pixels instanceof Float32Array) {
          values.set(pixels.subarray(0, values.length))
        } else if (pixels instanceof Uint16Array) {
          for (let i = 0; i < values.length; i++) values[i] = halfToFloat(pixels[i] ?? 0)
        } else if (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) {
          for (let i = 0; i < values.length; i++) values[i] = (pixels[i] ?? 0) / 255
        } else {
          const view = new Uint16Array(pixels.buffer, pixels.byteOffset, Math.floor(pixels.byteLength / 2))
          for (let i = 0; i < values.length; i++) values[i] = halfToFloat(view[i] ?? 0)
        }
        return { width: target.width, height: target.height, data: values }
      }
      const setAlgorithmAndWait = async (algorithm: 'rc' | 'hrc'): Promise<void> => {
        params.algorithm = algorithm
        switchLighting(algorithm, params.intensity)
        syncParamsFromActiveRadiance()
        refreshPane()
        await waitFrames(12)
      }
      const captureCanvas = async (): Promise<LuminanceImage> => {
        const bitmap = await createImageBitmap(renderer.domElement)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('2D canvas context is unavailable')
        ctx.drawImage(bitmap, 0, 0)
        bitmap.close()
        return imageDataToLuminance(cropSceneImageData(ctx.getImageData(0, 0, canvas.width, canvas.height)))
      }
      const finalRadianceLuminance = (readback: RadianceReadback): LuminanceImage => {
        const data = new Float32Array(readback.width * readback.height)
        for (let y = 0; y < readback.height; y++) {
          for (let x = 0; x < readback.width; x++) {
            const i = y * readback.width + x
            const j = i * 4
            data[i] =
              0.2126 * (readback.data[j] ?? 0) +
              0.7152 * (readback.data[j + 1] ?? 0) +
              0.0722 * (readback.data[j + 2] ?? 0)
          }
        }
        return { width: readback.width, height: readback.height, data }
      }

      await setAlgorithmAndWait('rc')
      const rcCanvas = await captureCanvas()
      const rcTarget = (rcLighting.radiance as unknown as { _finalRadianceRT: ReadableRenderTarget })._finalRadianceRT
      const rcFinal = await readTarget(rcTarget)
      const rcProbe = cloneProbeSnapshot(
        (window as Window & { __radianceCascadeProbe?: unknown }).__radianceCascadeProbe
      )

      await setAlgorithmAndWait('hrc')
      const hrcCanvas = await captureCanvas()
      const hrcTarget = (hrcLighting.radiance as unknown as { _finalRadianceRT: ReadableRenderTarget })._finalRadianceRT
      const hrcFinal = await readTarget(hrcTarget)
      const hrcProbe = cloneProbeSnapshot(
        (window as Window & { __radianceCascadeProbe?: unknown }).__radianceCascadeProbe
      )

      const result = {
        canvas: compareLuminanceImages(rcCanvas, hrcCanvas),
        finalRadiance: compareLuminanceImages(finalRadianceLuminance(rcFinal), finalRadianceLuminance(hrcFinal)),
        rc: {
          canvas: { width: rcCanvas.width, height: rcCanvas.height },
          finalRadiance: { width: rcFinal.width, height: rcFinal.height },
          probe: rcProbe,
        },
        hrc: {
          canvas: { width: hrcCanvas.width, height: hrcCanvas.height },
          finalRadiance: { width: hrcFinal.width, height: hrcFinal.height },
          probe: hrcProbe,
        },
      }
      console.log('perceptual-compare', JSON.stringify(result))
      return result
    },
    async auditHrcBuffers(): Promise<BufferAuditResult> {
      const waitFrames = async (count: number): Promise<void> => {
        for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame)
      }
      const readTarget = async (target: ReadableRenderTarget): Promise<RadianceReadback> => {
        const readAsync = (
          renderer as unknown as {
            readRenderTargetPixelsAsync?: (
              renderTarget: unknown,
              x: number,
              y: number,
              width: number,
              height: number
            ) => Promise<ArrayBufferView>
          }
        ).readRenderTargetPixelsAsync
        if (typeof readAsync !== 'function') {
          throw new Error('renderer.readRenderTargetPixelsAsync is unavailable')
        }
        const pixels = await readAsync.call(renderer, target, 0, 0, target.width, target.height)
        const values = new Float32Array(target.width * target.height * 4)
        if (pixels instanceof Float32Array) {
          values.set(pixels.subarray(0, values.length))
        } else if (pixels instanceof Uint16Array) {
          for (let i = 0; i < values.length; i++) values[i] = halfToFloat(pixels[i] ?? 0)
        } else if (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) {
          for (let i = 0; i < values.length; i++) values[i] = (pixels[i] ?? 0) / 255
        } else {
          const view = new Uint16Array(pixels.buffer, pixels.byteOffset, Math.floor(pixels.byteLength / 2))
          for (let i = 0; i < values.length; i++) values[i] = halfToFloat(view[i] ?? 0)
        }
        return { width: target.width, height: target.height, data: values }
      }
      const statsFor = (name: string, readback: RadianceReadback): BufferStats => {
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        let luma = 0
        let minLuma = Number.POSITIVE_INFINITY
        let maxLuma = Number.NEGATIVE_INFINITY
        let finite = 0
        let nonBlack = 0
        const pixels = readback.width * readback.height
        for (let i = 0; i < pixels; i++) {
          const j = i * 4
          const rv = readback.data[j] ?? 0
          const gv = readback.data[j + 1] ?? 0
          const bv = readback.data[j + 2] ?? 0
          const av = readback.data[j + 3] ?? 0
          const valuesFinite = Number.isFinite(rv) && Number.isFinite(gv) && Number.isFinite(bv) && Number.isFinite(av)
          if (valuesFinite) finite++
          const y = 0.2126 * rv + 0.7152 * gv + 0.0722 * bv
          r += rv
          g += gv
          b += bv
          a += av
          luma += y
          minLuma = Math.min(minLuma, y)
          maxLuma = Math.max(maxLuma, y)
          if (Math.abs(rv) + Math.abs(gv) + Math.abs(bv) + Math.abs(av) > 1e-5) nonBlack++
        }
        const inv = 1 / Math.max(1, pixels)
        return {
          name,
          width: readback.width,
          height: readback.height,
          pixels,
          meanRgb: [r * inv, g * inv, b * inv],
          meanAlpha: a * inv,
          meanLuminance: luma * inv,
          minLuminance: Number.isFinite(minLuma) ? minLuma : 0,
          maxLuminance: Number.isFinite(maxLuma) ? maxLuma : 0,
          nonBlackRatio: nonBlack * inv,
          finiteRatio: finite * inv,
        }
      }

      params.algorithm = 'hrc'
      switchLighting('hrc', params.intensity)
      syncParamsFromActiveRadiance()
      refreshPane()
      await waitFrames(12)

      const internals = hrcLighting.radiance as unknown as {
        _holographicTransferRTs: ReadableRenderTarget[]
        _holographicRadianceRTs: ReadableRenderTarget[]
        _rawFinalRadianceRT: ReadableRenderTarget
        _wideRadianceRT: ReadableRenderTarget
        _wideBlurRT: ReadableRenderTarget
        _wideRadianceRT2: ReadableRenderTarget
        _wideBlurRT2: ReadableRenderTarget
        _finalRadianceRT: ReadableRenderTarget
      }
      const targets: Array<[string, ReadableRenderTarget | null | undefined]> = [
        ...internals._holographicTransferRTs.map(
          (target, index) => [`hrc.T${index}`, target] as [string, ReadableRenderTarget]
        ),
        ...internals._holographicRadianceRTs.map(
          (target, index) => [`hrc.R${index}`, target] as [string, ReadableRenderTarget]
        ),
        ['hrc.finalRadiance', internals._finalRadianceRT],
      ]
      if (hrcLighting.radiance.wideFilterEnabled) {
        targets.push(['hrc.rawFinalRadiance', internals._rawFinalRadianceRT])
        targets.push(['hrc.wideRadiance', internals._wideRadianceRT])
        if (hrcLighting.radiance.wideBlurEnabled) {
          targets.push(['hrc.wideBlur', internals._wideBlurRT])
          if (hrcLighting.radiance.wideLevels > 1) {
            targets.push(['hrc.wideRadiance2', internals._wideRadianceRT2])
            targets.push(['hrc.wideBlur2', internals._wideBlurRT2])
          }
        }
      }
      const buffers: BufferStats[] = []
      for (const [name, target] of targets) {
        if (!target || target.width <= 0 || target.height <= 0) continue
        try {
          buffers.push(statsFor(name, await readTarget(target)))
        } catch (error) {
          buffers.push({
            name,
            width: target.width,
            height: target.height,
            pixels: target.width * target.height,
            meanRgb: [0, 0, 0],
            meanAlpha: 0,
            meanLuminance: 0,
            minLuminance: 0,
            maxLuminance: 0,
            nonBlackRatio: 0,
            finiteRatio: 0,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      const result = {
        probe: cloneProbeSnapshot((window as Window & { __radianceCascadeProbe?: unknown }).__radianceCascadeProbe),
        buffers,
      }
      console.log('hrc-buffer-audit', JSON.stringify(result))
      return result
    },
  }

  const automatedGpuSampleCount = Number(new URLSearchParams(location.search).get('autoGpuBenchmark') ?? 0)
  if (automatedGpuSampleCount > 0) {
    const benchmarkControls = (
      window as Window & {
        __radianceCascadeControls?: {
          sampleGpuTime: (sampleCount?: number) => Promise<unknown>
        }
      }
    ).__radianceCascadeControls
    setTimeout(() => {
      void benchmarkControls
        ?.sampleGpuTime(automatedGpuSampleCount)
        .then((result) => {
          status.dataset.gpuBenchmark = JSON.stringify(result)
        })
        .catch((error: unknown) => {
          status.dataset.gpuBenchmark = JSON.stringify({ error: String(error) })
        })
    }, 500)
  }

  let renderSurfaceWidth = initialWidth
  let renderSurfaceHeight = initialHeight
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  const resizeObserver = new ResizeObserver(() => {
    const width = Math.max(1, document.documentElement.clientWidth)
    const height = Math.max(1, document.documentElement.clientHeight)
    if (width === renderSurfaceWidth && height === renderSurfaceHeight) return
    if (resizeTimer !== null) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      resizeTimer = null
      const settledWidth = Math.max(1, document.documentElement.clientWidth)
      const settledHeight = Math.max(1, document.documentElement.clientHeight)
      if (settledWidth === renderSurfaceWidth && settledHeight === renderSurfaceHeight) return
      renderSurfaceWidth = settledWidth
      renderSurfaceHeight = settledHeight
      renderer.setSize(settledWidth, settledHeight, false)
      flatland.resize(settledWidth, settledHeight)
    }, 120)
  })
  resizeObserver.observe(document.documentElement)

  let frames = 0
  function animate(): void {
    if (!params.paused) {
      frames++
      flatland.render(renderer)
    }
    updateDevtools()
    const finalImage = lighting.radiance.finalRadianceTexture.image as {
      width: number
      height: number
    }
    const rcInternals = rcLighting.radiance as unknown as {
      _sceneRadianceRT: { width: number; height: number } | null
      _wideRadianceRT: { width: number; height: number }
      _wideRadianceRT2: { width: number; height: number }
    }
    const hrcInternals = hrcLighting.radiance as unknown as {
      _shortIntervalAtlasRT: { width: number; height: number }
      _compositionRTs: Array<{ width: number; height: number }>
      _rawFinalRadianceRT: { width: number; height: number }
      _wideRadianceRT: { width: number; height: number }
      _wideRadianceRT2: { width: number; height: number }
      _lastComposedSpan: number
    }
    const activeMode =
      params.algorithm === 'rc' || params.algorithm === 'dda-rc-fixed' ? '' : `/${hrcLighting.radiance.compositionMode}`
    status.textContent = `${params.algorithm}${activeMode} frames:${frames} final:${finalImage.width}x${finalImage.height}`
    const activeRadiance = lighting.radiance
    const activeInternals = activeRadiance as unknown as {
      _worldSize?: { x: number; y: number }
      _worldOffset?: { x: number; y: number }
    }
    ;(
      window as Window & {
        __radianceCascadeProbe?: unknown
      }
    ).__radianceCascadeProbe = {
      algorithm: params.algorithm,
      hrcCompositionMode: hrcLighting.radiance.compositionMode,
      frames,
      finalRadiance: {
        width: finalImage.width,
        height: finalImage.height,
      },
      world: {
        size: activeInternals._worldSize ? { x: activeInternals._worldSize.x, y: activeInternals._worldSize.y } : null,
        offset: activeInternals._worldOffset
          ? { x: activeInternals._worldOffset.x, y: activeInternals._worldOffset.y }
          : null,
      },
      radiance: {
        intensity: lighting.radianceIntensity,
        intervalOverlap: activeRadiance.intervalOverlap,
        filterRadius: activeRadiance.filterRadius,
        filterStrength: activeRadiance.filterStrength,
        raymarchSteps: activeRadiance.raymarchSteps,
        mipBlur: activeRadiance.mipBlur,
        mipStrength: activeRadiance.mipStrength,
        wideDownsampleFactor: activeRadiance.wideDownsampleFactor,
        wideLevels: activeRadiance.wideLevels,
        wideFilterEnabled: activeRadiance.wideFilterEnabled,
        wideBlurEnabled: activeRadiance.wideBlurEnabled,
        estimatedPassCount: activeRadiance.estimatedPassCount,
        estimatedRaymarchTexelCount: activeRadiance.estimatedRaymarchTexelCount,
        estimatedRaymarchSampleCount: activeRadiance.estimatedRaymarchSampleCount,
      },
      hrc: {
        config: hrcLighting.radiance.config,
        wideFilterEnabled: hrcLighting.radiance.wideFilterEnabled,
        wideBlurEnabled: hrcLighting.radiance.wideBlurEnabled,
        finalRadianceReadoutMode: hrcLighting.radiance.finalRadianceReadoutMode,
        estimatedCompositionPassCount: hrcLighting.radiance.estimatedCompositionPassCount,
        estimatedPassCount: hrcLighting.radiance.estimatedPassCount,
        estimatedRaymarchTexelCount: hrcLighting.radiance.estimatedRaymarchTexelCount,
        estimatedPhysicalRaymarchTexelCount: hrcLighting.radiance.estimatedPhysicalRaymarchTexelCount,
        estimatedUnusedRaymarchTexelCount: hrcLighting.radiance.estimatedUnusedRaymarchTexelCount,
        estimatedRaymarchSampleCount: hrcLighting.radiance.estimatedRaymarchSampleCount,
        estimatedHolographicDirectTransferPassCount: hrcLighting.radiance.estimatedHolographicDirectTransferPassCount,
        estimatedHolographicDirectTransferTexelCount: hrcLighting.radiance.estimatedHolographicDirectTransferTexelCount,
        estimatedHolographicDirectTransferSampleCount:
          hrcLighting.radiance.estimatedHolographicDirectTransferSampleCount,
        estimatedHolographicRecursiveTransferPassCount:
          hrcLighting.radiance.estimatedHolographicRecursiveTransferPassCount,
        estimatedHolographicRecursiveTransferTexelCount:
          hrcLighting.radiance.estimatedHolographicRecursiveTransferTexelCount,
        estimatedHolographicRadiancePassCount: hrcLighting.radiance.estimatedHolographicRadiancePassCount,
        estimatedHolographicRadianceTexelCount: hrcLighting.radiance.estimatedHolographicRadianceTexelCount,
        holographicLevelCount: hrcLighting.radiance.holographicLevelCount,
        holographicLevelInfo: hrcLighting.radiance.holographicLevelInfo,
        holographicFinalResolutionScale: hrcLighting.radiance.holographicFinalResolutionScale,
        estimatedHolographicTransferValueCount: hrcLighting.radiance.estimatedHolographicTransferValueCount,
        estimatedHolographicRadianceValueCount: hrcLighting.radiance.estimatedHolographicRadianceValueCount,
        holographicStorageBytesPerTexel: hrcLighting.radiance.holographicStorageBytesPerTexel,
        estimatedHolographicStorageBytes: hrcLighting.radiance.estimatedHolographicStorageBytes,
        shortIntervalCount: hrcLighting.radiance.shortIntervalCount,
        compositionLevels: hrcLighting.radiance.compositionLevels,
        effectiveBaseInterval: hrcLighting.radiance.effectiveBaseInterval,
        shortIntervalAtlas: {
          width: hrcInternals._shortIntervalAtlasRT.width,
          height: hrcInternals._shortIntervalAtlasRT.height,
        },
        composedIntervalAtlas: {
          width: hrcInternals._compositionRTs[0]!.width,
          height: hrcInternals._compositionRTs[0]!.height,
        },
        rawFinalRadiance: {
          width: hrcInternals._rawFinalRadianceRT.width,
          height: hrcInternals._rawFinalRadianceRT.height,
        },
        wideRadiance: {
          width: hrcInternals._wideRadianceRT.width,
          height: hrcInternals._wideRadianceRT.height,
        },
        wideRadiance2: {
          width: hrcInternals._wideRadianceRT2.width,
          height: hrcInternals._wideRadianceRT2.height,
        },
        lastComposedSpan: hrcInternals._lastComposedSpan,
      },
      rc: {
        config: rcLighting.radiance.config,
        wideFilterEnabled: rcLighting.radiance.wideFilterEnabled,
        wideBlurEnabled: rcLighting.radiance.wideBlurEnabled,
        estimatedPassCount: rcLighting.radiance.estimatedPassCount,
        estimatedRaymarchTexelCount: rcLighting.radiance.estimatedRaymarchTexelCount,
        estimatedRaymarchSampleCount: rcLighting.radiance.estimatedRaymarchSampleCount,
      },
      ddaRcFixed: {
        config: ddaRcLighting.radiance.config,
        wideFilterEnabled: ddaRcLighting.radiance.wideFilterEnabled,
        wideBlurEnabled: ddaRcLighting.radiance.wideBlurEnabled,
        estimatedPassCount: ddaRcLighting.radiance.estimatedPassCount,
        estimatedRaymarchTexelCount: ddaRcLighting.radiance.estimatedRaymarchTexelCount,
        estimatedRaymarchSampleCount: ddaRcLighting.radiance.estimatedRaymarchSampleCount,
        cascadeStorageBytesPerTexel: ddaRcLighting.radiance.cascadeStorageBytesPerTexel,
        estimatedCascadeStorageBytes: ddaRcLighting.radiance.estimatedCascadeStorageBytes,
      },
      lights: {
        warmIntensity: warm.intensity,
        coolIntensity: cool.intensity,
      },
      sceneRadiance: rcInternals._sceneRadianceRT
        ? {
            width: rcInternals._sceneRadianceRT.width,
            height: rcInternals._sceneRadianceRT.height,
          }
        : null,
      wideRadiance: {
        width: rcInternals._wideRadianceRT.width,
        height: rcInternals._wideRadianceRT.height,
      },
      wideRadiance2: {
        width: rcInternals._wideRadianceRT2.width,
        height: rcInternals._wideRadianceRT2.height,
      },
      canvas: {
        width: renderer.domElement.width,
        height: renderer.domElement.height,
      },
    }
  }

  void renderer.setAnimationLoop(animate)
}

main().catch((error: unknown) => {
  console.error(error)
  const status = document.querySelector<HTMLDivElement>('#status')
  if (status) status.textContent = error instanceof Error ? error.message : String(error)
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void activeRenderer?.setAnimationLoop(null)
    activeRenderer?.dispose()
    activeRenderer?.domElement.remove()
    activeRenderer = null
    activeFlatland?.dispose()
    activeFlatland = null
  })
}
