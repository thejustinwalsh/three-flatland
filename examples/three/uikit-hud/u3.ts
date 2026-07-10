/**
 * U3 — uikit `Svg` on `SlugShapeBatch`. Exercises the real reactive `Svg`
 * component (a REAL lucide icon via `@three-flatland/uikit-lucide`, not a
 * hand-rolled duck-typed mesh) against the shape-batch rewrite of
 * `components/svg.ts`. Runs on BOTH backends.
 *
 * Scenarios per backend:
 *  - legible   a `ChevronDown` icon renders visible ink somewhere in its box
 *  - batching  N sibling `Svg` icons sharing the SAME source draw in the
 *              SAME number of calls as ONE — proves the shared `SlugShapeSet`
 *              batches into a single draw call (mirrors U2's text batching)
 *  - tint      the `fill` property replaces the icon's own (black) fill with
 *              a requested colour, per-instance
 *  - clip      an `overflow: 'scroll'` `Container` clips a stack of
 *              overflowing icons with a smooth (antialiased) edge
 *  - zoom      the SAME icon rendered at camera zoom 1x and 8x has an
 *              antialiased edge fringe of comparable SCREEN-PIXEL width at
 *              both — resolution independence, not a blurrier atlas
 *
 * Result on `window.__U3__` and `console.log('[U3]', json)`.
 */
import { OrthographicCamera, RenderTarget, Scene } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Container } from '@three-flatland/uikit'
import type { RenderContext } from '@three-flatland/uikit'
import { ChevronDown } from '@three-flatland/uikit-lucide'

const SIZE = 384
const HALF = SIZE / 2

type Ok = {
  backend: string
  legible: { pass: boolean; litPixels: number }
  batching: { pass: boolean; drawCallsOne: number; drawCallsMany: number }
  tint: { pass: boolean; sampled: { r: number; g: number; b: number } | null }
  clip: { pass: boolean; insideLit: boolean; outsideLit: boolean; edgeIntermediate: number }
  zoom: { pass: boolean; fringe1x: number; fringe8x: number }
  warnings: string[]
  errors: string[]
}
type Result = Ok | { failed: string }

const noopRenderContext: RenderContext = { requestFrame: () => {} }

/** Same settle contract as U2: layout is one-frame-deferred and the SVG
 * source resolves through a Promise, so pump `root.update()` across a few
 * macrotask boundaries before sampling. */
async function settle(root: Container, frames = 8): Promise<void> {
  for (let i = 0; i < frames; i++) {
    root.update(1 / 60)
    await new Promise((r) => setTimeout(r, 0))
  }
  root.update(1 / 60)
}

function makeCamera(zoom = 1): OrthographicCamera {
  const camera = new OrthographicCamera(-HALF, HALF, HALF, -HALF, 0.1, 10)
  camera.position.z = 5
  camera.zoom = zoom
  camera.updateProjectionMatrix()
  return camera
}

async function readPixels(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: OrthographicCamera,
  rt: RenderTarget
): Promise<Uint8Array> {
  renderer.info.reset()
  renderer.setRenderTarget(rt)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  const buf = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, SIZE, SIZE)) as Uint8Array
  // Same WebGL2-vs-WebGPU readback row-order flip as U2 — see u2.ts's comment.
  const isWebGPU = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true
  return isWebGPU ? buf : flipRowsY(buf, SIZE, SIZE)
}

function flipRowsY(buf: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4
  const out = new Uint8Array(buf.length)
  for (let row = 0; row < height; row++) {
    const src = row * stride
    const dst = (height - 1 - row) * stride
    out.set(buf.subarray(src, src + stride), dst)
  }
  return out
}

function alphaAt(buf: Uint8Array, x: number, y: number): number {
  // world (x,y), y-up, origin center -> pixel row/col, y-down
  const col = Math.round(x + HALF)
  const row = Math.round(HALF - y)
  if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return 0
  return buf[(row * SIZE + col) * 4 + 3]!
}

function countLit(buf: Uint8Array, threshold = 32): number {
  let count = 0
  for (let p = 0; p < SIZE * SIZE; p++) {
    if (buf[p * 4 + 3]! > threshold) count++
  }
  return count
}

async function testLegible(renderer: WebGPURenderer, rt: RenderTarget): Promise<Ok['legible']> {
  const camera = makeCamera()
  const scene = new Scene()
  const root = new Container(
    {
      pixelSize: 1,
      width: SIZE,
      height: SIZE,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    undefined,
    { renderContext: noopRenderContext }
  )
  const icon = new ChevronDown({ width: 200, height: 200 })
  root.add(icon)
  scene.add(root)
  await settle(root)
  const buf = await readPixels(renderer, scene, camera, rt)
  const litPixels = countLit(buf)
  root.remove(icon)
  return { pass: litPixels > 50, litPixels }
}

async function testBatching(renderer: WebGPURenderer, rt: RenderTarget): Promise<Ok['batching']> {
  const camera = makeCamera()

  const buildScene = async (count: 1 | 3) => {
    const scene = new Scene()
    const root = new Container(
      { pixelSize: 1, width: SIZE, height: SIZE, backgroundColor: 'transparent' },
      undefined,
      { renderContext: noopRenderContext }
    )
    for (let i = 0; i < count; i++) {
      root.add(
        new ChevronDown({
          width: 32,
          height: 32,
          positionType: 'absolute',
          positionTop: i * 40,
          positionLeft: i * 40,
        })
      )
    }
    scene.add(root)
    await settle(root)
    return { scene, root }
  }

  const one = await buildScene(1)
  await readPixels(renderer, one.scene, camera, rt)
  const drawCallsOne = renderer.info.render.drawCalls

  const many = await buildScene(3)
  await readPixels(renderer, many.scene, camera, rt)
  const drawCallsMany = renderer.info.render.drawCalls

  return {
    pass: drawCallsMany === drawCallsOne && drawCallsOne > 0,
    drawCallsOne,
    drawCallsMany,
  }
}

async function testTint(renderer: WebGPURenderer, rt: RenderTarget): Promise<Ok['tint']> {
  const camera = makeCamera()
  const scene = new Scene()
  const root = new Container(
    {
      pixelSize: 1,
      width: SIZE,
      height: SIZE,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    undefined,
    { renderContext: noopRenderContext }
  )
  // lucide icons carry a literal `fill="black"` post-fixer — `fill` here
  // REPLACES that per-path colour with a single requested tint (per-instance
  // colour on the shape batch), the same contract upstream uikit's `Svg` uses.
  const icon = new ChevronDown({ width: 200, height: 200, fill: 'red' })
  root.add(icon)
  scene.add(root)
  await settle(root)
  const buf = await readPixels(renderer, scene, camera, rt)

  // First solidly-opaque pixel (skip the antialiased fringe) tells us the
  // tinted colour without depending on exact icon geometry.
  let sampled: { r: number; g: number; b: number } | null = null
  for (let p = 0; p < SIZE * SIZE && sampled == null; p++) {
    const a = buf[p * 4 + 3]!
    if (a > 200) {
      sampled = { r: buf[p * 4]!, g: buf[p * 4 + 1]!, b: buf[p * 4 + 2]! }
    }
  }
  const pass = sampled != null && sampled.r > 150 && sampled.g < 100 && sampled.b < 100
  return { pass, sampled }
}

async function testClip(renderer: WebGPURenderer, rt: RenderTarget): Promise<Ok['clip']> {
  const camera = makeCamera()
  const scene = new Scene()
  const root = new Container(
    { pixelSize: 1, width: SIZE, height: SIZE, backgroundColor: 'transparent' },
    undefined,
    { renderContext: noopRenderContext }
  )
  // A small scroll container near the top-left, holding a column of icons
  // far too tall to fit — only the container's own box should ever show ink.
  // Offsets are Yoga box-model offsets from the PARENT's top-left edge
  // (0..parentWidth/Height, y-down), NOT world coordinates — see u2.ts's
  // identical note on this exact gotcha.
  const scroller = new Container({
    positionType: 'absolute',
    positionLeft: 20,
    positionTop: 20,
    width: 60,
    height: 60,
    overflow: 'scroll',
    backgroundColor: 'transparent',
  })
  const stack = new Container({ flexDirection: 'column' })
  for (let i = 0; i < 6; i++) {
    stack.add(new ChevronDown({ width: 40, height: 40 }))
  }
  scroller.add(stack)
  root.add(scroller)
  scene.add(root)
  await settle(root)
  const buf = await readPixels(renderer, scene, camera, rt)

  // scroller box in world space: left edge at -HALF+20, top at HALF-20 (y-up),
  // spanning 60x60. Scan a small grid inside vs. a strip well below the box —
  // "any ink in the box" / "no ink below it" is the actual claim, not "this
  // one pixel happens to be lit" (icon ink isn't dense like wrapped text).
  const boxLeft = -HALF + 20
  const boxTop = HALF - 20
  let insideLit = false
  for (let dy = 2; dy <= 58 && !insideLit; dy += 3) {
    for (let dx = 2; dx <= 58 && !insideLit; dx += 3) {
      if (alphaAt(buf, boxLeft + dx, boxTop - dy) > 16) insideLit = true
    }
  }
  let outsideLit = false
  for (let dy = 70; dy <= 110 && !outsideLit; dy += 5) {
    for (let dx = 2; dx <= 58 && !outsideLit; dx += 5) {
      if (alphaAt(buf, boxLeft + dx, boxTop - dy) > 16) outsideLit = true
    }
  }

  // scan the bottom clip edge for an antialiased (partial-coverage) fringe
  // rather than a hard binary cut
  let edgeIntermediate = 0
  const edgeY = boxTop - 60
  for (let dy = -3; dy <= 3; dy++) {
    for (let x = boxLeft + 2; x < boxLeft + 58; x += 2) {
      const a = alphaAt(buf, x, edgeY + dy)
      if (a > 16 && a < 224) edgeIntermediate++
    }
  }

  return {
    pass: insideLit && !outsideLit && edgeIntermediate > 0,
    insideLit,
    outsideLit,
    edgeIntermediate,
  }
}

/** Antialiased-fringe width (in screen pixels) along a horizontal scanline
 * through the icon's centered box, at the given camera zoom. */
async function measureFringe(
  renderer: WebGPURenderer,
  rt: RenderTarget,
  zoom: number
): Promise<number> {
  const camera = makeCamera(zoom)
  const scene = new Scene()
  const root = new Container(
    {
      pixelSize: 1,
      width: SIZE,
      height: SIZE,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    undefined,
    { renderContext: noopRenderContext }
  )
  const icon = new ChevronDown({ width: 60, height: 60 })
  root.add(icon)
  scene.add(root)
  await settle(root)
  const buf = await readPixels(renderer, scene, camera, rt)

  // Scan a horizontal line through vertical screen-center for the widest run
  // of "partial coverage" alpha — that run IS the antialiased edge, in
  // screen pixels, regardless of the icon's own path geometry.
  const row = Math.floor(SIZE / 2)
  let maxRun = 0
  let run = 0
  for (let col = 0; col < SIZE; col++) {
    const a = buf[(row * SIZE + col) * 4 + 3]!
    if (a > 8 && a < 247) {
      run += 1
      maxRun = Math.max(maxRun, run)
    } else {
      run = 0
    }
  }
  return maxRun
}

async function testZoom(renderer: WebGPURenderer, rt: RenderTarget): Promise<Ok['zoom']> {
  const fringe1x = await measureFringe(renderer, rt, 1)
  const fringe8x = await measureFringe(renderer, rt, 8)
  // Resolution independence claim: the fringe stays a THIN, comparable band
  // at both zooms (an atlas-backed renderer would show it balloon roughly
  // proportional to zoom). Generous bound — a sanity gate, not a tolerance spec.
  const pass = fringe1x > 0 && fringe8x > 0 && fringe8x < fringe1x * 4
  return { pass, fringe1x, fringe8x }
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

  const renderer = new WebGPURenderer({ antialias: false, forceWebGL })
  await renderer.init()
  renderer.setSize(SIZE, SIZE)
  // Same ambient-rAF-loop gotcha as U2: `Renderer.init()` starts an internal
  // loop that calls `info.reset()` every browser frame whenever
  // `info.autoReset` is true, regardless of `setAnimationLoop`. Every
  // `settle()`/readback here awaits across a macrotask boundary, giving that
  // loop a chance to zero `info.render.drawCalls` out from under us between
  // `renderer.render()` and reading the counter — disable autoReset so only
  // our own explicit `info.reset()` (in readPixels) controls the counter.
  renderer.info.autoReset = false
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? 'webgpu'
    : 'webgl2'

  const rt = new RenderTarget(SIZE, SIZE)

  const legible = await testLegible(renderer, rt)
  const batching = await testBatching(renderer, rt)
  const tint = await testTint(renderer, rt)
  const clip = await testClip(renderer, rt)
  const zoom = await testZoom(renderer, rt)

  console.warn = warn
  console.error = err
  rt.dispose()
  renderer.dispose()

  return { backend, legible, batching, tint, clip, zoom, warnings, errors }
}

const out = document.getElementById('out')!
;(async () => {
  const results: Record<string, Result> = {}

  for (const forceWebGL of [false, true]) {
    const key = forceWebGL ? 'webgl2' : 'webgpu'
    try {
      results[key] = await run(forceWebGL)
    } catch (e) {
      results[key] = { failed: e instanceof Error ? (e.stack ?? e.message) : String(e) }
    }
  }

  const pass = Object.values(results).every(
    (r): r is Ok =>
      'legible' in r &&
      r.legible.pass &&
      r.batching.pass &&
      r.tint.pass &&
      r.clip.pass &&
      r.zoom.pass &&
      r.errors.length === 0
  )
  const payload = { pass, results }
  ;(window as unknown as { __U3__: unknown }).__U3__ = payload
  out.textContent = JSON.stringify(payload, null, 2)
  console.log('[U3]', JSON.stringify(payload))
})()
