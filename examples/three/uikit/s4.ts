/**
 * S4 — SlugShapeSet / SlugShapeBatch / slug/svg harness. Runs on BOTH
 * backends (WebGPU + forceWebGL).
 *
 * Scenarios per backend:
 *  - activityIcon / circleIcon  real lucide (post-oslllo-svg-fixer) icons via
 *                               parseSVG → SlugShapeBatch, pixel-compared to a
 *                               4× supersampled tessellated SVGLoader
 *                               reference (downsampled). Both sides render a
 *                               WHITE consumer tint: the fixer bakes
 *                               fill="black" (its currentColor stand-in), so
 *                               a faithful-color render is black-on-black and
 *                               invisible to these red-channel gates — fill
 *                               capture (black + evenodd) is asserted
 *                               separately. circleIcon also asserts its HOLE
 *                               (nonzero winding on a real donut outline).
 *  - winding                    synthetic hole coverage: reversed inner
 *                               contour (nonzero) and same-winding inner
 *                               contour (even-odd) both punch the hole; the
 *                               nonzero control with same-winding inner
 *                               stays filled.
 *  - curvature                  hairpin blob at the DEFAULT adaptive
 *                               tolerance vs a 64×-tighter reference set —
 *                               visible faceting would spike the diff.
 *  - oneDrawCall                120 instances from 5 shapes → exactly 1
 *                               renderer draw call.
 *  - clip                       per-instance 4-plane clip (keep x ≥ 0):
 *                               leak/kept-region checks.
 *  - growth                     atlas repack after +900 registrations
 *                               re-renders the ORIGINAL instance
 *                               bit-identically (auto re-bind in update()).
 *  - bakedRoundTrip             public/s4-shapes.glb (packShapeSet fixture,
 *                               see s4-bake-fixture.mts) renders
 *                               bit-identically to runtime registration of
 *                               the same contours.
 *  - multiColor                 two-path two-fill SVG → per-instance fill
 *                               colors land on the right pixels.
 *
 * Result on `window.__S4__` and `console.log('[S4]', json)`.
 */
import {
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  RenderTarget,
  Scene,
  ShapeGeometry,
} from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { SlugShapeBatch, SlugShapeSet, parseSVG, registerSVG } from '@three-flatland/slug'
import type { ParsedSVG, SlugShapeBatchWriteOptions } from '@three-flatland/slug'
import {
  fixtureShapes,
  hairpinContour,
  rectContour,
  rectContourReversed,
} from './s4-fixture-shapes'
import activitySvg from '../../../packages/uikit-lucide/icons/activity.svg?raw'
import circleSvg from '../../../packages/uikit-lucide/icons/circle.svg?raw'

const SIZE = 384
const HALF = SIZE / 2
const REF_SS = 4 // reference supersample factor

type DiffStats = {
  maxDiff: number
  meanDiff: number
  fracOver16: number
  fracOver64: number
  litA: number
  litB: number
}

type IconResult = DiffStats & {
  shapes: number
  quads: number
  fills: { color: number[]; rule: string }[]
  pass: boolean
}
type HoleResult = { holeAlpha: number; ringAlpha: number; pass: boolean }

type Ok = {
  backend: string
  activityIcon: IconResult
  circleIcon: IconResult & { hole: HoleResult }
  winding: {
    nonzeroHole: HoleResult
    evenOddHole: HoleResult
    nonzeroControlCenter: number
    pass: boolean
  }
  curvature: DiffStats & { quadsDefault: number; quadsFine: number; pass: boolean }
  oneDrawCall: { drawCalls: number; instances: number; lit: number; pass: boolean }
  clip: { leakMax: number; litKept: number; keptFracOver16: number; pass: boolean }
  growth: { maxDiff: number; repacked: boolean; pass: boolean }
  bakedRoundTrip: { maxDiff: number; lit: number; pass: boolean }
  multiColor: { left: number[]; right: number[]; rules: string[]; pass: boolean }
  warnings: string[]
  errors: string[]
  pass: boolean
}

type Result = Ok | { failed: string }

function diffStats(a: Uint8Array, b: Uint8Array): DiffStats {
  let maxDiff = 0
  let sum = 0
  let over16 = 0
  let over64 = 0
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
    if (d > 64) over64++
    sum += d
  }
  return {
    maxDiff,
    meanDiff: sum / pixels,
    fracOver16: over16 / pixels,
    fracOver64: over64 / pixels,
    litA,
    litB,
  }
}

interface Ctx {
  renderer: WebGPURenderer
  rt: RenderTarget
  rtRef: RenderTarget
  camera: OrthographicCamera
}

async function renderScene(
  ctx: Ctx,
  scene: Scene,
  rt: RenderTarget,
  size: number
): Promise<{ pixels: Uint8Array; drawCalls: number }> {
  scene.updateMatrixWorld(true)
  ctx.camera.updateMatrixWorld(true)
  ctx.camera.matrixWorldInverse.copy(ctx.camera.matrixWorld).invert()
  ctx.renderer.setRenderTarget(rt)
  ctx.renderer.render(scene, ctx.camera)
  const drawCalls = ctx.renderer.info.render.drawCalls
  ctx.renderer.setRenderTarget(null)
  const pixels = (await ctx.renderer.readRenderTargetPixelsAsync(
    rt,
    0,
    0,
    size,
    size
  )) as Uint8Array
  return { pixels, drawCalls }
}

/** Render a shape batch alone in a scene at SIZE and dispose it. */
async function renderBatch(
  ctx: Ctx,
  set: SlugShapeSet,
  writes: { handleId: number; opts: SlugShapeBatchWriteOptions }[],
  materialOptions?: { evenOdd?: boolean }
): Promise<{ pixels: Uint8Array; drawCalls: number }> {
  const scene = new Scene()
  const batch = new SlugShapeBatch({ shapes: set, material: materialOptions })
  for (let i = 0; i < writes.length; i++) {
    batch.writeShape(i, writes[i]!.handleId, writes[i]!.opts)
  }
  batch.count = writes.length
  batch.setViewportSize(SIZE, SIZE)
  scene.add(batch)
  scene.updateMatrixWorld(true)
  ctx.camera.updateMatrixWorld(true)
  ctx.camera.matrixWorldInverse.copy(ctx.camera.matrixWorld).invert()
  batch.update(ctx.camera)
  const out = await renderScene(ctx, scene, ctx.rt, SIZE)
  batch.dispose()
  return out
}

/**
 * Tessellated SVGLoader reference (upstream uikit's mesh-forest approach),
 * rendered at REF_SS× resolution and box-downsampled — an antialiased
 * ground truth for the analytic Slug fill.
 */
async function renderIconReference(ctx: Ctx, svgText: string, scale: number): Promise<Uint8Array> {
  const { paths, xml } = new SVGLoader().parse(svgText)
  const vb = (xml as unknown as Element)
    .getAttribute('viewBox')!
    .split(/[\s,]+/)
    .map(Number) as [number, number, number, number]
  const [minX, minY, vbW, vbH] = vb
  const s = scale / Math.max(vbW, vbH)

  const scene = new Scene()
  const material = new MeshBasicMaterial({ color: 0xffffff })
  for (const path of paths) {
    for (const shape of SVGLoader.createShapes(path)) {
      const mesh = new Mesh(new ShapeGeometry(shape, 64), material)
      // Match slug/svg's normalization: x' = (x−minX)·s − scale/2,
      // y' = (minY + vbH − y)·s − scale/2 (y-up flip)
      mesh.scale.set(s, -s, 1)
      mesh.position.set(-minX * s - scale / 2, (minY + vbH) * s - scale / 2, 0)
      scene.add(mesh)
    }
  }

  const refSize = SIZE * REF_SS
  const { pixels: hi } = await renderScene(ctx, scene, ctx.rtRef, refSize)
  material.dispose()
  for (const child of scene.children) (child as Mesh).geometry.dispose()

  // Box-downsample REF_SS× → SIZE
  const out = new Uint8Array(SIZE * SIZE * 4)
  const n = REF_SS * REF_SS
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < REF_SS; sy++) {
        for (let sx = 0; sx < REF_SS; sx++) {
          const o = ((y * REF_SS + sy) * refSize + x * REF_SS + sx) * 4
          r += hi[o]!
          g += hi[o + 1]!
          b += hi[o + 2]!
          a += hi[o + 3]!
        }
      }
      const oo = (y * SIZE + x) * 4
      out[oo] = Math.round(r / n)
      out[oo + 1] = Math.round(g / n)
      out[oo + 2] = Math.round(b / n)
      out[oo + 3] = Math.round(a / n)
    }
  }
  return out
}

/** Alpha proxy (red channel of the white fill) at column offset dx from center, row = center. */
function sampleCenterRow(px: Uint8Array, dx: number): number {
  // Row order (y-up vs y-down) doesn't matter: we only sample the center row.
  const x = HALF + dx
  return px[(HALF * SIZE + x) * 4]!
}

const ICON_SCALE = 256
const ICON_ORIGIN = { x: -ICON_SCALE / 2, y: -ICON_SCALE / 2 }

async function runIcon(
  ctx: Ctx,
  svgText: string,
  parsed: ParsedSVG
): Promise<{ result: IconResult; pixels: Uint8Array }> {
  const set = new SlugShapeSet()
  const reg = registerSVG(set, parsed)
  const quads = reg.handles.reduce((sum, h) => sum + h.curves.length, 0)
  // Consumer tint, NOT reg.fills[i].color: post-fixer lucide paths carry
  // fill="black" (the fixer's currentColor stand-in), and the tessellated
  // reference below is forced white — writing the faithful black fill here
  // renders black-on-black and zeroes every red-channel gate. Consumers
  // tint by replacing the instance color (upstream uikit replaces material
  // color the same way); fill CAPTURE is asserted in `fillsOk` instead.
  const writes = reg.handles.map((h) => ({
    handleId: h.glyphId,
    opts: { scale: ICON_SCALE, ...ICON_ORIGIN, color: { r: 1, g: 1, b: 1, a: 1 } },
  }))
  const { pixels } = await renderBatch(ctx, set, writes)
  const ref = await renderIconReference(ctx, svgText, ICON_SCALE)
  const stats = diffStats(pixels, ref)
  const fills = reg.fills.map((f) => ({
    color: [f.color.r, f.color.g, f.color.b, f.color.a],
    rule: f.rule,
  }))
  // Lucide fixer output is black + evenodd on every painted path — parseSVG
  // must report it faithfully (a browser renders these icons black too).
  const fillsOk =
    reg.fills.length === reg.handles.length &&
    reg.fills.every(
      (f) =>
        f.color.r === 0 &&
        f.color.g === 0 &&
        f.color.b === 0 &&
        f.color.a === 1 &&
        f.rule === 'evenodd'
    )
  const pass =
    fillsOk &&
    stats.litA >= 500 &&
    stats.litB >= 500 &&
    stats.meanDiff < 2.5 &&
    stats.fracOver64 < 0.006 &&
    Math.abs(stats.litA - stats.litB) / Math.max(stats.litA, stats.litB) < 0.15
  set.dispose()
  return { result: { ...stats, shapes: reg.handles.length, quads, fills, pass }, pixels }
}

function holeCheck(px: Uint8Array, holeDx: number, ringDx: number): HoleResult {
  const holeAlpha = sampleCenterRow(px, holeDx)
  const ringAlpha = sampleCenterRow(px, ringDx)
  return { holeAlpha, ringAlpha, pass: holeAlpha < 16 && ringAlpha > 128 }
}

async function run(forceWebGL: boolean): Promise<Ok> {
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
    const rtRef = new RenderTarget(SIZE * REF_SS, SIZE * REF_SS)
    const ctx: Ctx = { renderer, rt, rtRef, camera }

    // --- Real lucide icons vs supersampled tessellated reference ---
    const activity = await runIcon(ctx, activitySvg, parseSVG(activitySvg))
    const circleParsed = parseSVG(circleSvg)
    const circle = await runIcon(ctx, circleSvg, circleParsed)
    // circle.svg post-fixer is an annulus (r ≈ 9..11 of viewBox 24):
    // center is a HOLE, ±10/24·ICON_SCALE sits on the ring.
    const circleHole = holeCheck(circle.pixels, 0, Math.round((10 / 24) * ICON_SCALE))
    const circleIcon = {
      ...circle.result,
      hole: circleHole,
      pass: circle.result.pass && circleHole.pass,
    }

    // --- Synthetic winding / fill-rule holes ---
    const donutWrites = (id: number) => [{ handleId: id, opts: { scale: 256, x: -128, y: -128 } }]
    const setNZ = new SlugShapeSet()
    const donutNZ = setNZ.registerShape([
      rectContour(0, 0, 1, 1),
      rectContourReversed(0.3, 0.3, 0.7, 0.7),
    ])
    const nzPx = (await renderBatch(ctx, setNZ, donutWrites(donutNZ.glyphId))).pixels
    // hole spans |x| < 51px, ring spans 51..128
    const nonzeroHole = holeCheck(nzPx, 0, 100)

    const setEO = new SlugShapeSet()
    const donutEO = setEO.registerShape([
      rectContour(0, 0, 1, 1),
      rectContour(0.3, 0.3, 0.7, 0.7), // SAME winding — only even-odd punches it
    ])
    const eoPx = (await renderBatch(ctx, setEO, donutWrites(donutEO.glyphId), { evenOdd: true }))
      .pixels
    const evenOddHole = holeCheck(eoPx, 0, 100)

    // control: same-winding inner under NONZERO stays filled
    const ctrlPx = (await renderBatch(ctx, setEO, donutWrites(donutEO.glyphId))).pixels
    const nonzeroControlCenter = sampleCenterRow(ctrlPx, 0)
    const winding = {
      nonzeroHole,
      evenOddHole,
      nonzeroControlCenter,
      pass: nonzeroHole.pass && evenOddHole.pass && nonzeroControlCenter > 128,
    }

    // --- Curvature: default tolerance vs 64×-tighter reference ---
    const setDefault = new SlugShapeSet()
    const blobDefault = setDefault.registerShape([hairpinContour()])
    const setFine = new SlugShapeSet()
    const blobFine = setFine.registerShape([hairpinContour((0.0025 * Math.SQRT2) / 64)])
    const defPx = (await renderBatch(ctx, setDefault, donutWrites(blobDefault.glyphId))).pixels
    const finePx = (await renderBatch(ctx, setFine, donutWrites(blobFine.glyphId))).pixels
    const curvStats = diffStats(defPx, finePx)
    const curvature = {
      ...curvStats,
      quadsDefault: blobDefault.curves.length,
      quadsFine: blobFine.curves.length,
      pass:
        curvStats.litA >= 500 &&
        curvStats.meanDiff < 1.0 &&
        curvStats.fracOver64 < 0.002 &&
        blobFine.curves.length > blobDefault.curves.length,
    }

    // --- One draw call for many shapes ---
    const setMany = new SlugShapeSet()
    const activityReg = registerSVG(setMany, parseSVG(activitySvg))
    const manyHandles = [
      ...fixtureShapes().map((contours) => setMany.registerShape(contours)),
      ...activityReg.handles,
    ]
    const grid: { handleId: number; opts: SlugShapeBatchWriteOptions }[] = []
    for (let i = 0; i < 120; i++) {
      const col = i % 12
      const row = (i / 12) | 0
      grid.push({
        handleId: manyHandles[i % manyHandles.length]!.glyphId,
        opts: { scale: 26, x: col * 30 - 178, y: row * 34 - 172 },
      })
    }
    const many = await renderBatch(ctx, setMany, grid)
    let manyLit = 0
    for (let p = 0; p < SIZE * SIZE; p++) if (many.pixels[p * 4]! > 32) manyLit++
    const oneDrawCall = {
      drawCalls: many.drawCalls,
      instances: grid.length,
      lit: manyLit,
      pass: many.drawCalls === 1 && manyLit > 2000,
    }

    // --- Per-instance clip: keep x >= 0 (vertical plane, orientation-proof) ---
    const setBar = new SlugShapeSet()
    const bar = setBar.registerShape([rectContour(0.05, 0.4, 0.95, 0.6)])
    const clipMatrix = new Matrix4().set(1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
    const clippedPx = (
      await renderBatch(ctx, setBar, [
        { handleId: bar.glyphId, opts: { scale: 300, x: -150, y: -150, clip: clipMatrix } },
      ])
    ).pixels
    const unclippedPx = (
      await renderBatch(ctx, setBar, [
        { handleId: bar.glyphId, opts: { scale: 300, x: -150, y: -150 } },
      ])
    ).pixels
    let leakMax = 0
    let litKept = 0
    let keptCount = 0
    let keptOver16 = 0
    for (let p = 0; p < SIZE * SIZE; p++) {
      const x = (p % SIZE) - HALF + 0.5
      const c = clippedPx[p * 4]!
      const u = unclippedPx[p * 4]!
      if (x < -2 && c > leakMax) leakMax = c
      if (x > 2) {
        if (c > 64) litKept++
        keptCount++
        if (Math.abs(c - u) > 16) keptOver16++
      }
    }
    const clip = {
      leakMax,
      litKept,
      keptFracOver16: keptCount > 0 ? keptOver16 / keptCount : 1,
      pass: leakMax < 16 && litKept > 1000 && keptOver16 / keptCount < 0.005,
    }

    // --- Growth: repack must not disturb existing instances ---
    const setGrow = new SlugShapeSet()
    const donutGrow = setGrow.registerShape([
      rectContour(0, 0, 1, 1),
      rectContourReversed(0.3, 0.3, 0.7, 0.7),
    ])
    const growScene = new Scene()
    const growBatch = new SlugShapeBatch({ shapes: setGrow })
    growBatch.writeShape(0, donutGrow, { scale: 256, x: -128, y: -128 })
    growBatch.count = 1
    growBatch.setViewportSize(SIZE, SIZE)
    growScene.add(growBatch)
    growScene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    growBatch.update(camera)
    const growBefore = (await renderScene(ctx, growScene, ctx.rt, SIZE)).pixels
    const textureBefore = setGrow.curveTexture
    // 900 × 5-texel shapes ⇒ curve texture grows past one 4096-texel row
    for (let i = 0; i < 900; i++) {
      setGrow.registerShape([rectContour(0, 0, 0.5 + (i % 7) / 16, 0.5 + (i % 5) / 16)])
    }
    const repacked = setGrow.curveTexture !== textureBefore
    growBatch.update(camera) // re-binds the material over the repacked textures
    const growAfter = (await renderScene(ctx, growScene, ctx.rt, SIZE)).pixels
    growBatch.dispose()
    const growDiff = diffStats(growBefore, growAfter)
    const growth = {
      maxDiff: growDiff.maxDiff,
      repacked,
      pass: repacked && growDiff.maxDiff === 0 && growDiff.litA > 500,
    }

    // --- Baked round trip: fixture GLB vs runtime registration ---
    const bakedBuf = await (await fetch('./s4-shapes.glb')).arrayBuffer()
    const setBaked = SlugShapeSet.fromBaked(bakedBuf)
    const setRuntime = new SlugShapeSet()
    for (const contours of fixtureShapes()) setRuntime.registerShape(contours)
    const tri = () =>
      [0, 1, 2].map((id) => ({
        handleId: id,
        opts: { scale: 110, x: -170 + id * 115, y: -55 } as SlugShapeBatchWriteOptions,
      }))
    const bakedPx = (await renderBatch(ctx, setBaked, tri())).pixels
    const runtimePx = (await renderBatch(ctx, setRuntime, tri())).pixels
    const bakedStats = diffStats(bakedPx, runtimePx)
    const bakedRoundTrip = {
      maxDiff: bakedStats.maxDiff,
      lit: bakedStats.litA,
      pass: bakedStats.maxDiff === 0 && bakedStats.litA > 500,
    }

    // --- Multi-path multi-color SVG → per-instance fill colors ---
    const twoTone = parseSVG(
      '<svg viewBox="0 0 2 1"><path d="M0 0H1V1H0Z" fill="#ff0000"/>' +
        '<path d="M1 0H2V1H1Z" fill="#00ff00"/></svg>'
    )
    const setColor = new SlugShapeSet()
    const colorReg = registerSVG(setColor, twoTone)
    const colorPx = (
      await renderBatch(
        ctx,
        setColor,
        colorReg.handles.map((h, i) => ({
          handleId: h.glyphId,
          opts: { scale: 256, x: -128, y: -64, color: colorReg.fills[i]!.color },
        }))
      )
    ).pixels
    const sampleRGB = (dx: number): number[] => {
      const o = (HALF * SIZE + HALF + dx) * 4
      return [colorPx[o]!, colorPx[o + 1]!, colorPx[o + 2]!]
    }
    const left = sampleRGB(-64)
    const right = sampleRGB(64)
    const multiColor = {
      left,
      right,
      rules: colorReg.fills.map((f) => f.rule),
      pass:
        colorReg.handles.length === 2 &&
        left[0]! > 100 &&
        left[1]! < 40 &&
        right[1]! > 100 &&
        right[0]! < 40,
    }

    rt.dispose()
    rtRef.dispose()
    setNZ.dispose()
    setEO.dispose()
    setDefault.dispose()
    setFine.dispose()
    setMany.dispose()
    setBar.dispose()
    setGrow.dispose()
    setBaked.dispose()
    setRuntime.dispose()
    setColor.dispose()
    renderer.dispose()

    const pass =
      activity.result.pass &&
      circleIcon.pass &&
      winding.pass &&
      curvature.pass &&
      oneDrawCall.pass &&
      clip.pass &&
      growth.pass &&
      bakedRoundTrip.pass &&
      multiColor.pass &&
      errors.length === 0

    return {
      backend,
      activityIcon: activity.result,
      circleIcon,
      winding,
      curvature,
      oneDrawCall,
      clip,
      growth,
      bakedRoundTrip,
      multiColor,
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
  const results: Record<string, Result> = {}
  for (const forceWebGL of [false, true]) {
    const key = forceWebGL ? 'webgl2' : 'webgpu'
    try {
      results[key] = await run(forceWebGL)
    } catch (e) {
      results[key] = { failed: e instanceof Error ? e.message : String(e) }
    }
  }
  const pass = Object.values(results).every((r): r is Ok => 'pass' in r && r.pass)
  const payload = { pass, results }
  ;(window as unknown as { __S4__: unknown }).__S4__ = payload
  out.textContent = JSON.stringify(payload, null, 2)
  console.log('[S4]', JSON.stringify(payload))
})()
