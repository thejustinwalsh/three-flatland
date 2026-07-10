/**
 * S3 — SlugBatch harness: per-instance transform, per-instance Jacobian,
 * per-instance 4-plane clip. Runs on BOTH backends (WebGPU + forceWebGL).
 *
 * The AA regression gate is a pixel comparison against the NON-batched
 * `SlugText` path: for every transform scenario the batch carries the
 * transform per instance (folded into the dilation MVP in the shader),
 * while the reference `SlugText` carries the SAME transform on the mesh —
 * where the Jacobian is trivially correct. If the per-instance Jacobian
 * were wrong, edges would go blurry/fat at rotations and non-uniform
 * scales and the diff fraction would spike.
 *
 * Scenarios per backend:
 *  - rot0 / rot37 / rot90         batch vs SlugText, rotation transforms
 *  - scale1x2 / scale3x05         non-uniform per-instance scales
 *  - mixedPixelSize               two fontSizes + two transforms in ONE batch
 *  - clip                         angled plane: leak, kept-region parity,
 *                                 smooth-edge intermediates, AA ramp model fit
 *  - sentinel                     clip-enabled material + disabled sentinel is
 *                                 pixel-identical to the clip-free material
 *  - strokeClip                   SlugStrokeMaterial batch clips too
 *
 * Result on `window.__S3__` and `console.log('[S3]', json)`.
 */
import { Matrix4, OrthographicCamera, RenderTarget, Scene } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { SlugBatch, SlugFontLoader, SlugStrokeMaterial, SlugText } from '@three-flatland/slug'
import type { SlugFont } from '@three-flatland/slug'

const SIZE = 384
const HALF = SIZE / 2

type DiffStats = {
  maxDiff: number
  meanDiff: number
  fracOver16: number
  litA: number
  litB: number
}

type ScenarioResult = DiffStats & { pass: boolean }

type ClipResult = {
  leakMax: number
  keptFracOver16: number
  smoothEdgeIntermediates: number
  modelMeanDiff: number
  orientation: 'y-up' | 'y-down'
  pass: boolean
}

type Ok = {
  backend: string
  rot0: ScenarioResult
  rot37: ScenarioResult
  rot90: ScenarioResult
  scale1x2: ScenarioResult
  scale3x05: ScenarioResult
  mixedPixelSize: ScenarioResult
  clip: ClipResult
  sentinel: { maxDiff: number; pass: boolean }
  strokeClip: { lit: number; leakMax: number; pass: boolean }
  warnings: string[]
  errors: string[]
  pass: boolean
}

type Result = Ok | { failed: string }

// AA regression gate: batch and SlugText renders may differ by float-op
// ordering (CPU-composed MVP vs shader-folded rows) but never structurally.
const FRAC_OVER_16_MAX = 0.005
const MEAN_DIFF_MAX = 1.0
const MIN_LIT = 200

function diffStats(a: Uint8Array, b: Uint8Array): DiffStats {
  let maxDiff = 0
  let sum = 0
  let over16 = 0
  let litA = 0
  let litB = 0
  const pixels = SIZE * SIZE
  for (let p = 0; p < pixels; p++) {
    const o = p * 4
    let d = 0
    for (let c = 0; c < 3; c++) {
      const dc = Math.abs(a[o + c]! - b[o + c]!)
      if (dc > d) d = dc
    }
    if (a[o]! > 32) litA++
    if (b[o]! > 32) litB++
    if (d > maxDiff) maxDiff = d
    if (d > 16) over16++
    sum += d
  }
  return {
    maxDiff,
    meanDiff: sum / pixels,
    fracOver16: over16 / pixels,
    litA,
    litB,
  }
}

async function loadFont(): Promise<SlugFont> {
  return SlugFontLoader.load(`${import.meta.env.BASE_URL}Inter-Regular.ttf`, {
    forceRuntime: true,
  })
}

/** Write `text` into `batch` starting at instance `startIndex`. */
function writeText(
  batch: SlugBatch,
  font: SlugFont,
  text: string,
  fontSize: number,
  matrix: Matrix4,
  startIndex = 0,
  clip: Matrix4 | null = null
): number {
  const glyphs = font.shapeText(text, fontSize)
  for (let i = 0; i < glyphs.length; i++) {
    const pg = glyphs[i]!
    batch.writeGlyph(startIndex + i, pg.glyphId, font, {
      x: pg.x,
      y: pg.y,
      // Reproduce SlugGeometry's exact float path (pg.scale * unitsPerEm)
      fontSize: pg.scale * font.unitsPerEm,
      matrix,
      clip,
    })
  }
  return startIndex + glyphs.length
}

interface Ctx {
  renderer: WebGPURenderer
  rt: RenderTarget
  camera: OrthographicCamera
}

async function renderScene(ctx: Ctx, scene: Scene): Promise<Uint8Array> {
  scene.updateMatrixWorld(true)
  ctx.camera.updateMatrixWorld(true)
  ctx.camera.matrixWorldInverse.copy(ctx.camera.matrixWorld).invert()
  // MVP uniforms for dilation are pushed in update(camera) by each caller
  ctx.renderer.setRenderTarget(ctx.rt)
  ctx.renderer.render(scene, ctx.camera)
  ctx.renderer.setRenderTarget(null)
  return (await ctx.renderer.readRenderTargetPixelsAsync(ctx.rt, 0, 0, SIZE, SIZE)) as Uint8Array
}

/** Render `text` through a SlugBatch whose every instance carries `matrix`. */
async function renderBatch(
  ctx: Ctx,
  font: SlugFont,
  runs: { text: string; fontSize: number; matrix: Matrix4 }[],
  clip: Matrix4 | null = null,
  useClipMaterial = true
): Promise<Uint8Array> {
  const scene = new Scene()
  const batch = new SlugBatch({ font, clip: useClipMaterial })
  let count = 0
  for (const run of runs) {
    count = writeText(batch, font, run.text, run.fontSize, run.matrix, count, clip)
  }
  batch.count = count
  batch.setViewportSize(SIZE, SIZE)
  scene.add(batch)
  scene.updateMatrixWorld(true)
  ctx.camera.updateMatrixWorld(true)
  ctx.camera.matrixWorldInverse.copy(ctx.camera.matrixWorld).invert()
  batch.update(ctx.camera)
  const pixels = await renderScene(ctx, scene)
  batch.dispose()
  return pixels
}

/** Render the same runs through non-batched SlugText meshes (reference). */
async function renderReference(
  ctx: Ctx,
  font: SlugFont,
  runs: { text: string; fontSize: number; matrix: Matrix4 }[]
): Promise<Uint8Array> {
  const scene = new Scene()
  const texts: SlugText[] = []
  for (const run of runs) {
    const text = new SlugText({
      font,
      text: run.text,
      fontSize: run.fontSize,
      pixelSnap: false,
    })
    run.matrix.decompose(text.position, text.quaternion, text.scale)
    text.setViewportSize(SIZE, SIZE)
    scene.add(text)
    texts.push(text)
  }
  scene.updateMatrixWorld(true)
  ctx.camera.updateMatrixWorld(true)
  ctx.camera.matrixWorldInverse.copy(ctx.camera.matrixWorld).invert()
  for (const text of texts) text.update(ctx.camera)
  const pixels = await renderScene(ctx, scene)
  for (const text of texts) text.dispose()
  return pixels
}

async function compareScenario(
  ctx: Ctx,
  font: SlugFont,
  runs: { text: string; fontSize: number; matrix: Matrix4 }[]
): Promise<ScenarioResult> {
  const a = await renderBatch(ctx, font, runs)
  const b = await renderReference(ctx, font, runs)
  const stats = diffStats(a, b)
  const pass =
    stats.litA >= MIN_LIT &&
    stats.litB >= MIN_LIT &&
    stats.fracOver16 < FRAC_OVER_16_MAX &&
    stats.meanDiff < MEAN_DIFF_MAX
  return { ...stats, pass }
}

/** T · M — place a run whose glyph-space transform is `m` at (tx, ty). */
function placed(tx: number, ty: number, m?: Matrix4): Matrix4 {
  const t = new Matrix4().makeTranslation(tx, ty, 0)
  return m ? t.multiply(m) : t
}

function centered(font: SlugFont, text: string, fontSize: number, sx = 1, sy = 1): Matrix4 {
  const w = font.measureText(text, fontSize).width
  return new Matrix4().makeTranslation((-w * sx) / 2, (-fontSize * sy) / 2, 0)
}

/** Local-space (x, y) of pixel p under a given readback row orientation. */
function pixelLocal(p: number, yUp: boolean): { x: number; y: number } {
  const col = p % SIZE
  const row = (p / SIZE) | 0
  const x = col - HALF + 0.5
  const y = yUp ? row - HALF + 0.5 : HALF - row - 0.5
  return { x, y }
}

function evalClip(
  clipped: Uint8Array,
  unclipped: Uint8Array,
  plane: { nx: number; ny: number; d: number }
): ClipResult {
  const orientations: ('y-up' | 'y-down')[] = ['y-up', 'y-down']
  let best: ClipResult | null = null
  for (const orientation of orientations) {
    const yUp = orientation === 'y-up'
    let leakMax = 0
    let keptOver16 = 0
    let keptCount = 0
    let intermediates = 0
    let modelSum = 0
    const pixels = SIZE * SIZE
    for (let p = 0; p < pixels; p++) {
      const { x, y } = pixelLocal(p, yUp)
      const d = plane.nx * x + plane.ny * y + plane.d
      const o = p * 4
      const c = clipped[o]!
      const u = unclipped[o]!
      // AA ramp model: coverage multiplier saturate(d + 0.5) at |∇d| = 1 px
      const factor = Math.min(1, Math.max(0, d + 0.5))
      modelSum += Math.abs(c - u * factor)
      if (d < -2) {
        if (c > leakMax) leakMax = c
      } else if (d > 2) {
        keptCount++
        if (Math.abs(c - u) > 16) keptOver16++
      } else if (u >= 96 && c > 16 && c < u - 16) {
        intermediates++
      }
    }
    const result: ClipResult = {
      leakMax,
      keptFracOver16: keptCount > 0 ? keptOver16 / keptCount : 1,
      smoothEdgeIntermediates: intermediates,
      modelMeanDiff: modelSum / pixels,
      orientation,
      pass: false,
    }
    if (!best || result.modelMeanDiff < best.modelMeanDiff) best = result
  }
  const r = best!
  r.pass =
    r.leakMax < 16 &&
    r.keptFracOver16 < FRAC_OVER_16_MAX &&
    r.smoothEdgeIntermediates >= 3 &&
    r.modelMeanDiff < 2.0
  return r
}

async function run(forceWebGL: boolean, font: SlugFont): Promise<Ok> {
  const warnings: string[] = []
  const errors: string[] = []
  const warn = console.warn
  const err = console.error
  console.warn = (...a: unknown[]) => {
    warnings.push(a.map(String).join(' '))
    warn(...a)
  }
  console.error = (...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
    err(...a)
  }

  try {
    const renderer = new WebGPURenderer({ antialias: false, forceWebGL })
    await renderer.init()
    renderer.setSize(SIZE, SIZE)
    const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
      ? 'webgpu'
      : 'webgl2'

    const camera = new OrthographicCamera(-HALF, HALF, HALF, -HALF, 0.1, 10)
    camera.position.z = 5
    const rt = new RenderTarget(SIZE, SIZE)
    const ctx: Ctx = { renderer, rt, camera }

    const deg = (a: number) => (a * Math.PI) / 180
    const rotZ = (a: number) => new Matrix4().makeRotationZ(deg(a))
    const scale = (x: number, y: number) => new Matrix4().makeScale(x, y, 1)

    // --- Transform scenarios (per-instance Jacobian gate) ---
    const rot0 = await compareScenario(ctx, font, [
      { text: 'Slug batch', fontSize: 42, matrix: centered(font, 'Slug batch', 42) },
    ])
    const rot37 = await compareScenario(ctx, font, [
      { text: 'Rot 37', fontSize: 42, matrix: placed(-80, -40, rotZ(37)) },
    ])
    const rot90 = await compareScenario(ctx, font, [
      { text: 'Rot 90', fontSize: 42, matrix: placed(20, -90, rotZ(90)) },
    ])
    const scale1x2 = await compareScenario(ctx, font, [
      {
        text: 'Tall 1x2',
        fontSize: 36,
        matrix: centered(font, 'Tall 1x2', 36, 1, 2).multiply(scale(1, 2)),
      },
    ])
    const scale3x05 = await compareScenario(ctx, font, [
      {
        text: 'Wide',
        fontSize: 36,
        matrix: centered(font, 'Wide', 36, 3, 0.5).multiply(scale(3, 0.5)),
      },
    ])
    // Mixed pixelSize within ONE batch: two font sizes, two transforms
    const mixedPixelSize = await compareScenario(ctx, font, [
      { text: 'small 14', fontSize: 14, matrix: placed(-160, 96) },
      { text: 'LARGE 64', fontSize: 64, matrix: placed(-170, -110) },
    ])

    // --- Clip: angled plane through a glyph row ---
    // Plane normal ~16.3° off vertical → a visibly slanted cut.
    const nx = 0.28
    const ny = 0.96
    const planeD = 8 // line passes below the text midline
    const clipMatrix = new Matrix4().set(nx, ny, 0, planeD, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
    const clipRuns = [{ text: 'CLIP EDGE', fontSize: 44, matrix: centered(font, 'CLIP EDGE', 44) }]
    const clippedPx = await renderBatch(ctx, font, clipRuns, clipMatrix)
    const unclippedPx = await renderBatch(ctx, font, clipRuns, null)
    const clip = evalClip(clippedPx, unclippedPx, { nx, ny, d: planeD })

    // --- Sentinel: clip-enabled material + sentinel == clip-free material ---
    const sentinelPx = await renderBatch(ctx, font, clipRuns, null, true)
    const noClipMaterialPx = await renderBatch(ctx, font, clipRuns, null, false)
    const sentinelStats = diffStats(sentinelPx, noClipMaterialPx)
    const sentinel = { maxDiff: sentinelStats.maxDiff, pass: sentinelStats.maxDiff === 0 }

    // --- Stroke material: per-instance transform + clip in the stroke pass ---
    const strokeScene = new Scene()
    const strokeBatch = new SlugBatch({ font })
    strokeBatch.material = new SlugStrokeMaterial(font, {
      instanceTransform: true,
      instanceClip: true,
      strokeHalfWidth: 0.04,
      color: 0xffffff,
    })
    // Keep-right clip plane x >= 0 (orientation-proof: vertical plane)
    const strokeClipMatrix = new Matrix4().set(1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
    const strokeCount = writeText(
      strokeBatch,
      font,
      'STROKE',
      48,
      centered(font, 'STROKE', 48),
      0,
      strokeClipMatrix
    )
    strokeBatch.count = strokeCount
    strokeBatch.setViewportSize(SIZE, SIZE)
    strokeScene.add(strokeBatch)
    strokeScene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    strokeBatch.update(camera)
    const strokePx = await renderScene(ctx, strokeScene)
    strokeBatch.dispose()
    let strokeLit = 0
    let strokeLeakMax = 0
    for (let p = 0; p < SIZE * SIZE; p++) {
      const x = (p % SIZE) - HALF + 0.5
      const v = strokePx[p * 4]!
      if (x > 2 && v > 64) strokeLit++
      if (x < -2 && v > strokeLeakMax) strokeLeakMax = v
    }
    const strokeClip = {
      lit: strokeLit,
      leakMax: strokeLeakMax,
      pass: strokeLit >= 100 && strokeLeakMax < 16,
    }

    rt.dispose()
    renderer.dispose()

    const pass =
      rot0.pass &&
      rot37.pass &&
      rot90.pass &&
      scale1x2.pass &&
      scale3x05.pass &&
      mixedPixelSize.pass &&
      clip.pass &&
      sentinel.pass &&
      strokeClip.pass &&
      errors.length === 0

    return {
      backend,
      rot0,
      rot37,
      rot90,
      scale1x2,
      scale3x05,
      mixedPixelSize,
      clip,
      sentinel,
      strokeClip,
      warnings,
      errors,
      pass,
    }
  } finally {
    console.warn = warn
    console.error = err
  }
}

const out = document.getElementById('out')!
;(async () => {
  const font = await loadFont()
  const results: Record<string, Result> = {}
  for (const forceWebGL of [false, true]) {
    const key = forceWebGL ? 'webgl2' : 'webgpu'
    try {
      results[key] = await run(forceWebGL, font)
    } catch (e) {
      results[key] = { failed: e instanceof Error ? e.message : String(e) }
    }
  }
  const pass = Object.values(results).every((r): r is Ok => 'pass' in r && r.pass)
  const payload = { pass, results }
  ;(window as unknown as { __S3__: unknown }).__S3__ = payload
  out.textContent = JSON.stringify(payload, null, 2)
  console.log('[S3]', JSON.stringify(payload))
})()
