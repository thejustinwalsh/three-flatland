import { CanvasTexture, SRGBColorSpace } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Flatland, Light2D, Sprite2D } from 'three-flatland'
import { HierarchicalRadianceLightEffect, RadianceLightEffect } from '@three-flatland/presets'
import { createPane } from '@three-flatland/devtools'

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
  const sign = (value & 0x8000) ? -1 : 1
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
    image.data[Math.max(0, Math.min(image.height - 1, y + dy)) * image.width + Math.max(0, Math.min(image.width - 1, x + dx))] ?? 0
  const gx = -at(-1, -1) + at(1, -1) - 2 * at(-1, 0) + 2 * at(1, 0) - at(-1, 1) + at(1, 1)
  const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1)
  return Math.hypot(gx, gy)
}

function highFrequencyAt(image: LuminanceImage, x: number, y: number): number {
  let sum = 0
  let count = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      sum += image.data[Math.max(0, Math.min(image.height - 1, y + dy)) * image.width + Math.max(0, Math.min(image.width - 1, x + dx))] ?? 0
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
    if ((derivatives[i] ?? 0) > threshold && (derivatives[i] ?? 0) >= (derivatives[i - 1] ?? 0) && (derivatives[i] ?? 0) >= (derivatives[i + 1] ?? 0)) {
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

const DEFAULT_RADIANCE = {
  algorithm: 'rc' as 'rc' | 'hrc',
  hrcCompositionMode: 'holographic' as 'hierarchical' | 'holographic',
  intensity: 0.005,
  filterRadius: 0.7,
  filterStrength: 1.0,
  filterDiagonals: false,
  filterJitterStrength: 0,
  raymarchSteps: 64,
  blueNoiseStrength: 0,
  intervalOverlap: 0,
  sceneRadianceDownsampleFactor: 1,
  mipBlur: 0.2,
  mipStrength: 0.4,
  wideDownsampleFactor: 2,
  wideLevels: 1,
  hrcShortIntervalCount: 4,
  hrcCompositionLevels: 2,
}

const COMPARISON_BASELINE = {
  filterRadius: 0,
  filterStrength: 0,
  filterDiagonals: false,
  filterJitterStrength: 0,
  raymarchSteps: 64,
  blueNoiseStrength: 0,
  intervalOverlap: 0,
  sceneRadianceDownsampleFactor: 1,
  mipBlur: 0,
  mipStrength: 0,
  wideDownsampleFactor: 2,
  wideLevels: 1,
  hrcShortIntervalCount: 4,
  hrcCompositionLevels: 2,
}

const DEFAULT_LIGHTS = {
  warmIntensity: 6.1,
  coolIntensity: 9.7,
}

async function main(): Promise<void> {
  const status = document.querySelector<HTMLDivElement>('#status')!
  const renderer = new WebGPURenderer({ antialias: false })
  activeRenderer = renderer
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  const flatland = new Flatland({
    viewSize: 360,
    aspect: window.innerWidth / window.innerHeight,
    clearColor: 0x111418,
  })
  activeFlatland = flatland
  flatland.resize(window.innerWidth, window.innerHeight)

  const rcLighting = new RadianceLightEffect()
  const hrcLighting = new HierarchicalRadianceLightEffect()
  rcLighting.radianceIntensity = DEFAULT_RADIANCE.intensity
  hrcLighting.radianceIntensity = DEFAULT_RADIANCE.intensity
  for (const radiance of [rcLighting.radiance, hrcLighting.radiance]) {
    radiance.filterRadius = DEFAULT_RADIANCE.filterRadius
    radiance.filterStrength = DEFAULT_RADIANCE.filterStrength
    radiance.filterDiagonals = DEFAULT_RADIANCE.filterDiagonals
    radiance.filterJitterStrength = DEFAULT_RADIANCE.filterJitterStrength
    radiance.raymarchSteps = DEFAULT_RADIANCE.raymarchSteps
    radiance.blueNoiseStrength = DEFAULT_RADIANCE.blueNoiseStrength
    radiance.sceneRadianceDownsampleFactor = DEFAULT_RADIANCE.sceneRadianceDownsampleFactor
    radiance.mipBlur = DEFAULT_RADIANCE.mipBlur
    radiance.mipStrength = DEFAULT_RADIANCE.mipStrength
    radiance.wideDownsampleFactor = DEFAULT_RADIANCE.wideDownsampleFactor
    radiance.wideLevels = DEFAULT_RADIANCE.wideLevels
  }
  rcLighting.radiance.intervalOverlap = DEFAULT_RADIANCE.intervalOverlap
  hrcLighting.radiance.intervalOverlap = DEFAULT_RADIANCE.intervalOverlap
  hrcLighting.radiance.shortIntervalCount = DEFAULT_RADIANCE.hrcShortIntervalCount
  hrcLighting.radiance.compositionLevels = DEFAULT_RADIANCE.hrcCompositionLevels
  hrcLighting.radiance.compositionMode = DEFAULT_RADIANCE.hrcCompositionMode
  let lighting:
    | InstanceType<typeof RadianceLightEffect>
    | InstanceType<typeof HierarchicalRadianceLightEffect> =
    DEFAULT_RADIANCE.algorithm === 'hrc' ? hrcLighting : rcLighting
  flatland.setLighting(lighting)

  addRect(flatland, '#d8d6ca', 0, 0, 330, 210, { z: -20 })
  const occluders = [
    addRect(flatland, '#1a1f29', 5, 0, 22, 156, { lit: false, castsShadow: true, z: 2 }),
    addRect(flatland, '#252b35', -70, -58, 86, 18, { lit: false, castsShadow: true, z: 2 }),
    addRect(flatland, '#252b35', 94, 58, 82, 18, { lit: false, castsShadow: true, z: 2 }),
  ]
  const occluderPositions = occluders.map((occluder) => occluder.position.clone())
  addRect(flatland, '#b84a3d', -122, 70, 36, 36, { castsShadow: false, z: 1 })
  addRect(flatland, '#3b76c4', 124, -70, 36, 36, { castsShadow: false, z: 1 })

  const warm = new Light2D({
    type: 'point',
    color: 0xff8a45,
    intensity: DEFAULT_LIGHTS.warmIntensity,
    distance: 135,
    decay: 2,
    position: [-128, 4],
  })
  flatland.add(warm)

  const cool = new Light2D({
    type: 'point',
    color: 0x4c9dff,
    intensity: DEFAULT_LIGHTS.coolIntensity,
    distance: 120,
    decay: 2,
    position: [128, -10],
  })
  flatland.add(cool)

  const ambient = new Light2D({
    type: 'ambient',
    color: 0x1c2230,
    intensity: 0.2,
  })
  flatland.add(ambient)

  const params = {
    algorithm: DEFAULT_RADIANCE.algorithm as 'rc' | 'hrc',
    intensity: lighting.radianceIntensity,
    filterRadius: rcLighting.radiance.filterRadius,
    filterStrength: rcLighting.radiance.filterStrength,
    filterDiagonals: rcLighting.radiance.filterDiagonals,
    filterJitterStrength: rcLighting.radiance.filterJitterStrength,
    raymarchSteps: rcLighting.radiance.raymarchSteps,
    blueNoiseStrength: rcLighting.radiance.blueNoiseStrength,
    intervalOverlap: rcLighting.radiance.intervalOverlap,
    sceneRadianceDownsampleFactor: rcLighting.radiance.sceneRadianceDownsampleFactor,
    mipBlur: rcLighting.radiance.mipBlur,
    mipStrength: rcLighting.radiance.mipStrength,
    wideDownsampleFactor: rcLighting.radiance.wideDownsampleFactor,
    wideLevels: rcLighting.radiance.wideLevels,
    hrcCompositionMode: hrcLighting.radiance.compositionMode,
    hrcShortIntervalCount: hrcLighting.radiance.shortIntervalCount,
    hrcCompositionLevels: hrcLighting.radiance.compositionLevels,
    warmIntensity: warm.intensity,
    coolIntensity: cool.intensity,
    occluders: true,
    wallOpen: false,
    paused: false,
  }
  function syncParamsFromActiveRadiance(): void {
    const radiance = lighting.radiance
    params.filterRadius = radiance.filterRadius
    params.filterStrength = radiance.filterStrength
    params.filterDiagonals = radiance.filterDiagonals
    params.filterJitterStrength = radiance.filterJitterStrength
    params.raymarchSteps = radiance.raymarchSteps
    params.blueNoiseStrength = radiance.blueNoiseStrength
    params.intervalOverlap = radiance.intervalOverlap
    params.sceneRadianceDownsampleFactor = radiance.sceneRadianceDownsampleFactor
    params.mipBlur = radiance.mipBlur
    params.mipStrength = radiance.mipStrength
    params.wideDownsampleFactor = radiance.wideDownsampleFactor
    params.wideLevels = radiance.wideLevels
    params.hrcCompositionMode = hrcLighting.radiance.compositionMode
    params.hrcShortIntervalCount = hrcLighting.radiance.shortIntervalCount
    params.hrcCompositionLevels = hrcLighting.radiance.compositionLevels
  }
  const { pane, update: updateDevtools } = createPane({ driver: 'manual' })
  const folder = pane.addFolder({ title: 'Radiance Cascades', expanded: true })
  folder
    .addBinding(params, 'algorithm', {
      options: { RC: 'rc', HRC: 'hrc' },
    })
    .on('change', () => {
      lighting = params.algorithm === 'hrc' ? hrcLighting : rcLighting
      syncParamsFromActiveRadiance()
      lighting.radianceIntensity = params.intensity
      flatland.setLighting(lighting)
      pane.refresh()
    })
  folder
    .addBinding(params, 'hrcCompositionMode', {
      label: 'HRC mode',
      options: { Holographic: 'holographic', Hierarchical: 'hierarchical' },
    })
    .on('change', () => {
      hrcLighting.radiance.compositionMode = params.hrcCompositionMode
      pane.refresh()
    })
  folder.addBinding(params, 'intensity', { min: 0, max: 0.12, step: 0.005 }).on('change', () => {
    rcLighting.radianceIntensity = params.intensity
    hrcLighting.radianceIntensity = params.intensity
  })
  folder.addBinding(params, 'warmIntensity', { min: 0, max: 12, step: 0.1 }).on('change', () => {
    warm.intensity = params.warmIntensity
  })
  folder.addBinding(params, 'coolIntensity', { min: 0, max: 12, step: 0.1 }).on('change', () => {
    cool.intensity = params.coolIntensity
  })
  folder.addBinding(params, 'occluders', { label: 'Occluders' }).on('change', () => {
    for (const [index, occluder] of occluders.entries()) {
      occluder.visible = params.occluders
      occluder.castsShadow = params.occluders
      occluder.position.copy(
        params.occluders ? occluderPositions[index]! : occluderPositions[index]!.clone().setX(10000)
      )
    }
  })
  folder.addBinding(params, 'wallOpen').on('change', () => {
    warm.position.x = params.wallOpen ? -38 : -128
  })
  folder.addBinding(params, 'paused')

  const advanced = pane.addFolder({ title: 'Advanced', expanded: false })
  advanced.addBinding(params, 'filterRadius', { min: 0, max: 3, step: 0.05 }).on('change', () => {
    rcLighting.radiance.filterRadius = params.filterRadius
    hrcLighting.radiance.filterRadius = params.filterRadius
  })
  advanced.addBinding(params, 'filterStrength', { min: 0, max: 1, step: 0.05 }).on('change', () => {
    rcLighting.radiance.filterStrength = params.filterStrength
    hrcLighting.radiance.filterStrength = params.filterStrength
  })
  advanced.addBinding(params, 'filterDiagonals').on('change', () => {
    rcLighting.radiance.filterDiagonals = params.filterDiagonals
    hrcLighting.radiance.filterDiagonals = params.filterDiagonals
  })
  advanced
    .addBinding(params, 'filterJitterStrength', { min: 0, max: 1, step: 0.05 })
    .on('change', () => {
      rcLighting.radiance.filterJitterStrength = params.filterJitterStrength
      hrcLighting.radiance.filterJitterStrength = params.filterJitterStrength
    })
  advanced.addBinding(params, 'raymarchSteps', { min: 8, max: 96, step: 1 }).on('change', () => {
    rcLighting.radiance.raymarchSteps = params.raymarchSteps
    hrcLighting.radiance.raymarchSteps = params.raymarchSteps
    params.raymarchSteps = rcLighting.radiance.raymarchSteps
    pane.refresh()
  })
  advanced
    .addBinding(params, 'blueNoiseStrength', { min: 0, max: 1, step: 0.05 })
    .on('change', () => {
      rcLighting.radiance.blueNoiseStrength = params.blueNoiseStrength
      hrcLighting.radiance.blueNoiseStrength = params.blueNoiseStrength
    })
  advanced
    .addBinding(params, 'intervalOverlap', { min: 0, max: 0.3, step: 0.01 })
    .on('change', () => {
      rcLighting.radiance.intervalOverlap = params.intervalOverlap
      hrcLighting.radiance.intervalOverlap = params.intervalOverlap
    })
  advanced
    .addBinding(params, 'sceneRadianceDownsampleFactor', { min: 1, max: 4, step: 1 })
    .on('change', () => {
      rcLighting.radiance.sceneRadianceDownsampleFactor = params.sceneRadianceDownsampleFactor
      hrcLighting.radiance.sceneRadianceDownsampleFactor = params.sceneRadianceDownsampleFactor
      params.sceneRadianceDownsampleFactor = rcLighting.radiance.sceneRadianceDownsampleFactor
      pane.refresh()
    })
  advanced.addBinding(params, 'mipBlur', { min: 0, max: 1, step: 0.05 }).on('change', () => {
    rcLighting.radiance.mipBlur = params.mipBlur
    hrcLighting.radiance.mipBlur = params.mipBlur
  })
  advanced.addBinding(params, 'mipStrength', { min: 0, max: 1, step: 0.05 }).on('change', () => {
    rcLighting.radiance.mipStrength = params.mipStrength
    hrcLighting.radiance.mipStrength = params.mipStrength
  })
  advanced
    .addBinding(params, 'wideDownsampleFactor', { min: 2, max: 4, step: 1 })
    .on('change', () => {
      rcLighting.radiance.wideDownsampleFactor = params.wideDownsampleFactor
      params.wideDownsampleFactor = rcLighting.radiance.wideDownsampleFactor
      hrcLighting.radiance.wideDownsampleFactor = params.wideDownsampleFactor
      pane.refresh()
    })
  advanced.addBinding(params, 'wideLevels', { min: 1, max: 2, step: 1 }).on('change', () => {
    rcLighting.radiance.wideLevels = params.wideLevels
    hrcLighting.radiance.wideLevels = params.wideLevels
  })
  advanced
    .addBinding(params, 'hrcShortIntervalCount', { min: 4, max: 16, step: 1 })
    .on('change', () => {
      hrcLighting.radiance.shortIntervalCount = params.hrcShortIntervalCount
      params.hrcShortIntervalCount = hrcLighting.radiance.shortIntervalCount
      pane.refresh()
    })
  advanced
    .addBinding(params, 'hrcCompositionLevels', { min: 1, max: 4, step: 1 })
    .on('change', () => {
      hrcLighting.radiance.compositionLevels = params.hrcCompositionLevels
      params.hrcCompositionLevels = hrcLighting.radiance.compositionLevels
      pane.refresh()
    })
  ;(
    window as Window & {
      __radianceCascadeControls?: {
        setAlgorithm: (algorithm: 'rc' | 'hrc') => void
        setRadianceIntensity: (intensity: number) => void
        setLocalFilter: (radius: number, strength: number, diagonals?: boolean) => void
        setRaymarchSteps: (steps: number) => void
        setMipFilter: (blur: number, strength: number, levels?: number) => void
        setBlueNoise: (strength: number) => void
        setIntervalOverlap: (overlap: number) => void
        setSceneRadianceDownsampleFactor: (factor: number) => void
        setFilterDiagonals: (enabled: boolean) => void
        setFilterJitter: (strength: number) => void
        setWideDownsampleFactor: (factor: number) => void
        setHrcComposition: (shortIntervalCount: number, compositionLevels?: number) => void
        setHrcCompositionMode: (mode: 'hierarchical' | 'holographic') => void
        setComparisonResolutionCap: (cap: number) => void
        setLightIntensities: (warmIntensity: number, coolIntensity: number) => void
        setOccluders: (enabled: boolean) => void
        setWallOpen: (open: boolean) => void
        setRenderSize: (width: number, height: number) => void
        setComparisonBaseline: () => void
        compareFinalRadiance: () => Promise<unknown>
        comparePerceptual: () => Promise<PerceptualCompareResult>
        auditHrcBuffers: () => Promise<BufferAuditResult>
      }
    }
  ).__radianceCascadeControls = {
    setAlgorithm(algorithm: 'rc' | 'hrc'): void {
      params.algorithm = algorithm
      lighting = algorithm === 'hrc' ? hrcLighting : rcLighting
      syncParamsFromActiveRadiance()
      lighting.radianceIntensity = params.intensity
      flatland.setLighting(lighting)
      pane.refresh()
    },
    setRadianceIntensity(intensity: number): void {
      params.intensity = intensity
      rcLighting.radianceIntensity = intensity
      hrcLighting.radianceIntensity = intensity
      pane.refresh()
    },
    setLocalFilter(radius: number, strength: number, diagonals = params.filterDiagonals): void {
      params.filterRadius = radius
      params.filterStrength = strength
      params.filterDiagonals = diagonals
      rcLighting.radiance.filterRadius = radius
      rcLighting.radiance.filterStrength = strength
      rcLighting.radiance.filterDiagonals = diagonals
      hrcLighting.radiance.filterRadius = radius
      hrcLighting.radiance.filterStrength = strength
      hrcLighting.radiance.filterDiagonals = diagonals
      pane.refresh()
    },
    setRaymarchSteps(steps: number): void {
      rcLighting.radiance.raymarchSteps = steps
      hrcLighting.radiance.raymarchSteps = steps
      params.raymarchSteps = rcLighting.radiance.raymarchSteps
      pane.refresh()
    },
    setMipFilter(blur: number, strength: number, levels = params.wideLevels): void {
      params.mipBlur = blur
      params.mipStrength = strength
      params.wideLevels = levels
      rcLighting.radiance.mipBlur = blur
      rcLighting.radiance.mipStrength = strength
      rcLighting.radiance.wideLevels = levels
      hrcLighting.radiance.mipBlur = blur
      hrcLighting.radiance.mipStrength = strength
      hrcLighting.radiance.wideLevels = levels
      pane.refresh()
    },
    setBlueNoise(strength: number): void {
      params.blueNoiseStrength = strength
      rcLighting.radiance.blueNoiseStrength = strength
      hrcLighting.radiance.blueNoiseStrength = strength
      pane.refresh()
    },
    setIntervalOverlap(overlap: number): void {
      params.intervalOverlap = overlap
      rcLighting.radiance.intervalOverlap = overlap
      hrcLighting.radiance.intervalOverlap = overlap
      pane.refresh()
    },
    setSceneRadianceDownsampleFactor(factor: number): void {
      rcLighting.radiance.sceneRadianceDownsampleFactor = factor
      hrcLighting.radiance.sceneRadianceDownsampleFactor = factor
      params.sceneRadianceDownsampleFactor = rcLighting.radiance.sceneRadianceDownsampleFactor
      pane.refresh()
    },
    setFilterDiagonals(enabled: boolean): void {
      params.filterDiagonals = enabled
      rcLighting.radiance.filterDiagonals = enabled
      hrcLighting.radiance.filterDiagonals = enabled
      pane.refresh()
    },
    setFilterJitter(strength: number): void {
      rcLighting.radiance.filterJitterStrength = strength
      hrcLighting.radiance.filterJitterStrength = strength
      params.filterJitterStrength = rcLighting.radiance.filterJitterStrength
      pane.refresh()
    },
    setWideDownsampleFactor(factor: number): void {
      rcLighting.radiance.wideDownsampleFactor = factor
      params.wideDownsampleFactor = rcLighting.radiance.wideDownsampleFactor
      hrcLighting.radiance.wideDownsampleFactor = params.wideDownsampleFactor
      pane.refresh()
    },
    setHrcComposition(shortIntervalCount: number, compositionLevels = params.hrcCompositionLevels): void {
      hrcLighting.radiance.shortIntervalCount = shortIntervalCount
      hrcLighting.radiance.compositionLevels = compositionLevels
      params.hrcShortIntervalCount = hrcLighting.radiance.shortIntervalCount
      params.hrcCompositionLevels = hrcLighting.radiance.compositionLevels
      pane.refresh()
    },
    setHrcCompositionMode(mode: 'hierarchical' | 'holographic'): void {
      hrcLighting.radiance.compositionMode = mode
      params.hrcCompositionMode = hrcLighting.radiance.compositionMode
      pane.refresh()
    },
    setComparisonResolutionCap(cap: number): void {
      const resolutionCap = Math.max(128, Math.min(2048, Math.round(cap)))
      rcLighting.radiance.config.maxAutoCascadeResolution = resolutionCap
      hrcLighting.radiance.config.maxAutoCascadeResolution = resolutionCap
      flatland.setLighting(lighting)
      pane.refresh()
    },
    setLightIntensities(warmIntensity: number, coolIntensity: number): void {
      params.warmIntensity = warmIntensity
      params.coolIntensity = coolIntensity
      warm.intensity = warmIntensity
      cool.intensity = coolIntensity
      pane.refresh()
    },
    setOccluders(enabled: boolean): void {
      params.occluders = enabled
      for (const [index, occluder] of occluders.entries()) {
        occluder.visible = enabled
        occluder.castsShadow = enabled
        occluder.position.copy(
          enabled ? occluderPositions[index]! : occluderPositions[index]!.clone().setX(10000)
        )
      }
      pane.refresh()
    },
    setWallOpen(open: boolean): void {
      params.wallOpen = open
      warm.position.x = open ? -38 : -128
      pane.refresh()
    },
    setRenderSize(width: number, height: number): void {
      const nextWidth = Math.max(1, Math.round(width))
      const nextHeight = Math.max(1, Math.round(height))
      renderer.setSize(nextWidth, nextHeight)
      flatland.resize(nextWidth, nextHeight)
      pane.refresh()
    },
    setComparisonBaseline(): void {
      params.filterRadius = COMPARISON_BASELINE.filterRadius
      params.filterStrength = COMPARISON_BASELINE.filterStrength
      params.filterDiagonals = COMPARISON_BASELINE.filterDiagonals
      params.filterJitterStrength = COMPARISON_BASELINE.filterJitterStrength
      params.raymarchSteps = COMPARISON_BASELINE.raymarchSteps
      params.blueNoiseStrength = COMPARISON_BASELINE.blueNoiseStrength
      params.intervalOverlap = COMPARISON_BASELINE.intervalOverlap
      params.sceneRadianceDownsampleFactor = COMPARISON_BASELINE.sceneRadianceDownsampleFactor
      params.mipBlur = COMPARISON_BASELINE.mipBlur
      params.mipStrength = COMPARISON_BASELINE.mipStrength
      params.wideDownsampleFactor = COMPARISON_BASELINE.wideDownsampleFactor
      params.wideLevels = COMPARISON_BASELINE.wideLevels
      params.hrcShortIntervalCount = COMPARISON_BASELINE.hrcShortIntervalCount
      params.hrcCompositionLevels = COMPARISON_BASELINE.hrcCompositionLevels

      for (const radiance of [rcLighting.radiance, hrcLighting.radiance]) {
        radiance.filterRadius = COMPARISON_BASELINE.filterRadius
        radiance.filterStrength = COMPARISON_BASELINE.filterStrength
        radiance.filterDiagonals = COMPARISON_BASELINE.filterDiagonals
        radiance.filterJitterStrength = COMPARISON_BASELINE.filterJitterStrength
        radiance.raymarchSteps = COMPARISON_BASELINE.raymarchSteps
        radiance.blueNoiseStrength = COMPARISON_BASELINE.blueNoiseStrength
        radiance.sceneRadianceDownsampleFactor = COMPARISON_BASELINE.sceneRadianceDownsampleFactor
        radiance.mipBlur = COMPARISON_BASELINE.mipBlur
        radiance.mipStrength = COMPARISON_BASELINE.mipStrength
        radiance.wideDownsampleFactor = COMPARISON_BASELINE.wideDownsampleFactor
        radiance.wideLevels = COMPARISON_BASELINE.wideLevels
      }
      rcLighting.radiance.intervalOverlap = COMPARISON_BASELINE.intervalOverlap
      hrcLighting.radiance.intervalOverlap = COMPARISON_BASELINE.intervalOverlap
      hrcLighting.radiance.shortIntervalCount = COMPARISON_BASELINE.hrcShortIntervalCount
      hrcLighting.radiance.compositionLevels = COMPARISON_BASELINE.hrcCompositionLevels
      params.hrcCompositionMode = hrcLighting.radiance.compositionMode
      pane.refresh()
    },
    async compareFinalRadiance(): Promise<unknown> {
      const waitFrames = async (count: number): Promise<void> => {
        for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame)
      }
      const readTarget = async (target: ReadableRenderTarget): Promise<RadianceReadback> => {
        const readAsync = (renderer as unknown as {
          readRenderTargetPixelsAsync?: (
            renderTarget: unknown,
            x: number,
            y: number,
            width: number,
            height: number
          ) => Promise<ArrayBufferView>
        }).readRenderTargetPixelsAsync
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
        lighting = algorithm === 'hrc' ? hrcLighting : rcLighting
        syncParamsFromActiveRadiance()
        lighting.radianceIntensity = params.intensity
        flatland.setLighting(lighting)
        pane.refresh()
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
        const readAsync = (renderer as unknown as {
          readRenderTargetPixelsAsync?: (
            renderTarget: unknown,
            x: number,
            y: number,
            width: number,
            height: number
          ) => Promise<ArrayBufferView>
        }).readRenderTargetPixelsAsync
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
        lighting = algorithm === 'hrc' ? hrcLighting : rcLighting
        syncParamsFromActiveRadiance()
        lighting.radianceIntensity = params.intensity
        flatland.setLighting(lighting)
        pane.refresh()
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
      const rcProbe = cloneProbeSnapshot((window as Window & { __radianceCascadeProbe?: unknown }).__radianceCascadeProbe)

      await setAlgorithmAndWait('hrc')
      const hrcCanvas = await captureCanvas()
      const hrcTarget = (hrcLighting.radiance as unknown as { _finalRadianceRT: ReadableRenderTarget })._finalRadianceRT
      const hrcFinal = await readTarget(hrcTarget)
      const hrcProbe = cloneProbeSnapshot((window as Window & { __radianceCascadeProbe?: unknown }).__radianceCascadeProbe)

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
        const readAsync = (renderer as unknown as {
          readRenderTargetPixelsAsync?: (
            renderTarget: unknown,
            x: number,
            y: number,
            width: number,
            height: number
          ) => Promise<ArrayBufferView>
        }).readRenderTargetPixelsAsync
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
      lighting = hrcLighting
      syncParamsFromActiveRadiance()
      lighting.radianceIntensity = params.intensity
      flatland.setLighting(lighting)
      pane.refresh()
      await waitFrames(12)

      const internals = hrcLighting.radiance as unknown as {
        _sceneRadianceRT: ReadableRenderTarget | null
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
        ['hrc.sceneRadiance', internals._sceneRadianceRT],
        ...internals._holographicTransferRTs.map((target, index) => [`hrc.T${index}`, target] as [string, ReadableRenderTarget]),
        ...internals._holographicRadianceRTs.map((target, index) => [`hrc.R${index}`, target] as [string, ReadableRenderTarget]),
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

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  let frames = 0
  function animate(): void {
    if (!params.paused) frames++
    flatland.render(renderer)
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
      _sceneRadianceRT: { width: number; height: number } | null
      _shortIntervalAtlasRT: { width: number; height: number }
      _compositionRTs: Array<{ width: number; height: number }>
      _rawFinalRadianceRT: { width: number; height: number }
      _wideRadianceRT: { width: number; height: number }
      _wideRadianceRT2: { width: number; height: number }
      _lastComposedSpan: number
    }
    const activeMode = params.algorithm === 'hrc' ? `/${hrcLighting.radiance.compositionMode}` : ''
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
        size: activeInternals._worldSize
          ? { x: activeInternals._worldSize.x, y: activeInternals._worldSize.y }
          : null,
        offset: activeInternals._worldOffset
          ? { x: activeInternals._worldOffset.x, y: activeInternals._worldOffset.y }
          : null,
      },
      radiance: {
        intensity: lighting.radianceIntensity,
        blueNoiseStrength: activeRadiance.blueNoiseStrength,
        intervalOverlap: rcLighting.radiance.intervalOverlap,
        sceneRadianceDownsampleFactor: activeRadiance.sceneRadianceDownsampleFactor,
        filterRadius: activeRadiance.filterRadius,
        filterStrength: activeRadiance.filterStrength,
        filterDiagonals: activeRadiance.filterDiagonals,
        filterJitterStrength: activeRadiance.filterJitterStrength,
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
        estimatedPhysicalRaymarchTexelCount:
          hrcLighting.radiance.estimatedPhysicalRaymarchTexelCount,
        estimatedUnusedRaymarchTexelCount: hrcLighting.radiance.estimatedUnusedRaymarchTexelCount,
        estimatedRaymarchSampleCount: hrcLighting.radiance.estimatedRaymarchSampleCount,
        estimatedHolographicDirectTransferPassCount:
          hrcLighting.radiance.estimatedHolographicDirectTransferPassCount,
        estimatedHolographicDirectTransferTexelCount:
          hrcLighting.radiance.estimatedHolographicDirectTransferTexelCount,
        estimatedHolographicDirectTransferSampleCount:
          hrcLighting.radiance.estimatedHolographicDirectTransferSampleCount,
        estimatedHolographicRecursiveTransferPassCount:
          hrcLighting.radiance.estimatedHolographicRecursiveTransferPassCount,
        estimatedHolographicRecursiveTransferTexelCount:
          hrcLighting.radiance.estimatedHolographicRecursiveTransferTexelCount,
        estimatedHolographicRadiancePassCount:
          hrcLighting.radiance.estimatedHolographicRadiancePassCount,
        estimatedHolographicRadianceTexelCount:
          hrcLighting.radiance.estimatedHolographicRadianceTexelCount,
        holographicLevelCount: hrcLighting.radiance.holographicLevelCount,
        holographicLevelInfo: hrcLighting.radiance.holographicLevelInfo,
        estimatedHolographicTransferValueCount:
          hrcLighting.radiance.estimatedHolographicTransferValueCount,
        estimatedHolographicRadianceValueCount:
          hrcLighting.radiance.estimatedHolographicRadianceValueCount,
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
        sceneRadiance: hrcInternals._sceneRadianceRT
          ? {
              width: hrcInternals._sceneRadianceRT.width,
              height: hrcInternals._sceneRadianceRT.height,
            }
          : null,
      },
      rc: {
        config: rcLighting.radiance.config,
        wideFilterEnabled: rcLighting.radiance.wideFilterEnabled,
        wideBlurEnabled: rcLighting.radiance.wideBlurEnabled,
        estimatedPassCount: rcLighting.radiance.estimatedPassCount,
        estimatedRaymarchTexelCount: rcLighting.radiance.estimatedRaymarchTexelCount,
        estimatedRaymarchSampleCount: rcLighting.radiance.estimatedRaymarchSampleCount,
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

  renderer.setAnimationLoop(animate)
}

main().catch((error: unknown) => {
  console.error(error)
  const status = document.querySelector<HTMLDivElement>('#status')
  if (status) status.textContent = error instanceof Error ? error.message : String(error)
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    activeRenderer?.setAnimationLoop(null)
    activeRenderer?.dispose()
    activeRenderer?.domElement.remove()
    activeRenderer = null
    activeFlatland?.dispose()
    activeFlatland = null
  })
}
