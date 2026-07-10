/**
 * U2 — uikit text on Slug. Exercises the real reactive `Text`/`Input`
 * components (not a hand-rolled duck-typed mesh, unlike E1/U1/S3) against
 * the `SlugBatch`-backed `text/render/**` rewrite. Runs on BOTH backends.
 *
 * Scenarios per backend:
 *  - legible          a `Text` renders visible ink somewhere inside its box
 *  - batching         glyphs from TWO sibling `Text` components (same font,
 *                     same order bucket) draw in the SAME number of calls as
 *                     ONE — proves cross-component batching (D4/§6.5)
 *  - clip             an `overflow: 'scroll'` `Container` clips an overflowing
 *                     `Text` with a smooth (antialiased) edge, not a hard cut
 *  - zoom              the SAME text rendered at camera zoom 1x and 8x has an
 *                     antialiased edge fringe of comparable SCREEN-PIXEL width
 *                     at both — resolution independence, not a blurrier atlas
 *  - caretSelection    `Input.focus(start, end)` places a caret/selection whose
 *                     rendered panel lands at the position `getCaretTransformation`/
 *                     `getSelectionTransformations` (uikit's OWN query module —
 *                     the caret/selection contract text/render/** never touches)
 *                     predict from the same `textLayout`
 *
 * Result on `window.__U2__` and `console.log('[U2]', json)`.
 */
import { OrthographicCamera, RenderTarget, Scene } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Container, Input, Text } from '@three-flatland/uikit'
import type { RenderContext } from '@three-flatland/uikit'
import { SlugFontLoader } from '@three-flatland/slug'
import type { SlugFont } from '@three-flatland/slug'
// Deep source import — mirrors u1.ts's precedent of reaching past the package's
// public surface into internals under test. `getCaretTransformation`/
// `getSelectionTransformations` are uikit's OWN query module (structurally
// mirrors `slug/query`, per spec §6.4/§8's boundary — this is the uikit-side
// copy that `Input`'s caret/selection panels actually consume) and aren't
// re-exported from the package root.
import {
  getCaretTransformation,
  getSelectionTransformations,
} from '../../../packages/uikit/src/text/layout/query.js'

const SIZE = 384
const HALF = SIZE / 2

type Ok = {
  backend: string
  legible: { pass: boolean; litPixels: number }
  batching: { pass: boolean; drawCallsOne: number; drawCallsTwo: number }
  clip: { pass: boolean; insideLit: boolean; outsideLit: boolean; edgeIntermediate: number }
  zoom: { pass: boolean; fringe1x: number; fringe8x: number }
  caretSelection: { pass: boolean; caretHit: boolean; selectionHit: boolean }
  warnings: string[]
  errors: string[]
}
type Result = Ok | { failed: string }

async function loadFont(): Promise<SlugFont> {
  return SlugFontLoader.load(`${import.meta.env.BASE_URL}Inter-Regular.ttf`, {
    forceRuntime: true,
  })
}

const noopRenderContext: RenderContext = { requestFrame: () => {} }

/** Tick the root component's reactive pipeline (layout + glyph/panel groups)
 * enough times for deferred effects (layout is one-frame-deferred; glyph
 * activation is queued for the following `onFrame`) to fully settle. */
/**
 * uikit resolves fonts through an async signal effect (`loadCachedFont(url, cb)`),
 * so pumping `root.update()` synchronously samples before any glyph exists. Yield
 * to the macrotask queue between frames so the font signal, yoga measure, and the
 * glyph-group effects all flush before we read pixels.
 */
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
  return (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, SIZE, SIZE)) as Uint8Array
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

async function testLegible(
  renderer: WebGPURenderer,
  rt: RenderTarget,
  font: SlugFont
): Promise<Ok['legible']> {
  const camera = makeCamera()
  const scene = new Scene()
  const root = new Container(
    { pixelSize: 1, width: SIZE, height: SIZE, backgroundColor: 'transparent' },
    undefined,
    { renderContext: noopRenderContext }
  )
  const text = new Text({
    text: 'Hello',
    color: 'white',
    fontSize: 48,
    fontFamilies: { inter: { normal: font } },
  })
  root.add(text)
  scene.add(root)
  await settle(root)
  const buf = await readPixels(renderer, scene, camera, rt)
  const litPixels = countLit(buf)
  root.remove(text)
  return { pass: litPixels > 50, litPixels }
}

async function testBatching(
  renderer: WebGPURenderer,
  rt: RenderTarget,
  font: SlugFont
): Promise<Ok['batching']> {
  const camera = makeCamera()

  const buildScene = async (count: 1 | 2) => {
    const scene = new Scene()
    const root = new Container(
      { pixelSize: 1, width: SIZE, height: SIZE, backgroundColor: 'transparent' },
      undefined,
      { renderContext: noopRenderContext }
    )
    for (let i = 0; i < count; i++) {
      root.add(
        new Text({
          text: `glyph batch ${i}`,
          color: 'white',
          fontSize: 24,
          positionType: 'absolute',
          positionTop: i * 40,
          fontFamilies: { inter: { normal: font } },
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

  const two = await buildScene(2)
  await readPixels(renderer, two.scene, camera, rt)
  const drawCallsTwo = renderer.info.render.drawCalls

  return { pass: drawCallsTwo === drawCallsOne && drawCallsOne > 0, drawCallsOne, drawCallsTwo }
}

async function testClip(
  renderer: WebGPURenderer,
  rt: RenderTarget,
  font: SlugFont
): Promise<Ok['clip']> {
  const camera = makeCamera()
  const scene = new Scene()
  const root = new Container(
    { pixelSize: 1, width: SIZE, height: SIZE, backgroundColor: 'transparent' },
    undefined,
    { renderContext: noopRenderContext }
  )
  // A small scroll container near the top-left, holding text far too tall to fit —
  // only the container's own box should ever show ink.
  const scroller = new Container({
    positionType: 'absolute',
    positionLeft: -HALF + 20,
    positionTop: -HALF + 20,
    width: 120,
    height: 60,
    overflow: 'scroll',
    backgroundColor: 'transparent',
  })
  scroller.add(
    new Text({
      text: 'clip clip clip clip clip clip clip clip',
      color: 'white',
      fontSize: 28,
      wordBreak: 'break-all',
      fontFamilies: { inter: { normal: font } },
    })
  )
  root.add(scroller)
  scene.add(root)
  await settle(root)
  const buf = await readPixels(renderer, scene, camera, rt)

  // scroller box in world space: left edge at -HALF+20, top at HALF-20 (y-up),
  // spanning 120x60. Sample well inside vs. well outside (below the box).
  const boxLeft = -HALF + 20
  const boxTop = HALF - 20
  const insideLit = alphaAt(buf, boxLeft + 30, boxTop - 20) > 16
  const outsideLit = alphaAt(buf, boxLeft + 30, boxTop - 90) > 16

  // scan the bottom clip edge for an antialiased (partial-coverage) fringe
  // rather than a hard binary cut
  let edgeIntermediate = 0
  const edgeY = boxTop - 60
  for (let dy = -3; dy <= 3; dy++) {
    for (let x = boxLeft + 10; x < boxLeft + 110; x += 4) {
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
 * through a vertical glyph stroke, at the given camera zoom. */
async function measureFringe(
  renderer: WebGPURenderer,
  rt: RenderTarget,
  font: SlugFont,
  zoom: number
): Promise<number> {
  const camera = makeCamera(zoom)
  const scene = new Scene()
  const root = new Container(
    { pixelSize: 1, width: SIZE, height: SIZE, backgroundColor: 'transparent' },
    undefined,
    { renderContext: noopRenderContext }
  )
  // "I" has a simple, wide vertical stroke — an easy, stable edge to scan.
  const text = new Text({
    text: 'I',
    color: 'white',
    fontSize: 20,
    fontFamilies: { inter: { normal: font } },
  })
  root.add(text)
  scene.add(root)
  await settle(root)
  const buf = await readPixels(renderer, scene, camera, rt)

  // Scan a horizontal line through vertical screen-center for the widest
  // run of "partial coverage" alpha (neither background-dark nor fully lit) —
  // that run IS the antialiased edge, in screen pixels.
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

async function testZoom(
  renderer: WebGPURenderer,
  rt: RenderTarget,
  font: SlugFont
): Promise<Ok['zoom']> {
  const fringe1x = await measureFringe(renderer, rt, font, 1)
  const fringe8x = await measureFringe(renderer, rt, font, 8)
  // Resolution independence claim: the fringe stays a THIN, comparable band at
  // both zooms (an atlas-backed renderer would show it balloon roughly
  // proportional to zoom as the same fixed-resolution texel footprint is
  // magnified 8x). Generous bound — this is a sanity gate, not a tolerance spec.
  const pass = fringe1x > 0 && fringe8x > 0 && fringe8x < fringe1x * 4
  return { pass, fringe1x, fringe8x }
}

async function testCaretSelection(
  renderer: WebGPURenderer,
  rt: RenderTarget,
  font: SlugFont
): Promise<Ok['caretSelection']> {
  const camera = makeCamera()
  const scene = new Scene()
  const root = new Container(
    { pixelSize: 1, width: SIZE, height: SIZE, backgroundColor: 'transparent' },
    undefined,
    { renderContext: noopRenderContext }
  )
  const input = new Input(
    {
      value: 'Hello World',
      color: 'white',
      caretColor: 'red',
      selectionColor: 'blue',
      fontSize: 24,
      fontFamilies: { inter: { normal: font } },
    },
    undefined,
    { renderContext: noopRenderContext }
  )
  root.add(input)
  scene.add(root)
  await settle(root)

  // Focus + select "World" (chars 6..11) — exercises both the caret AND the
  // selection-rect path through the SAME query module the panels consume.
  input.focus(6, 11, 'forward')
  await settle(root)

  const buf = await readPixels(renderer, scene, camera, rt)

  const layout = input.textLayout.value
  const caret = getCaretTransformation(layout, 11)
  const { selections } = getSelectionTransformations(layout, [6, 11])

  // input.textLayout is in the box's own local (y-up, center-origin) space;
  // the box itself sits at the root's center (Container default position), so
  // local == world here (root pixelSize 1, root centered at origin).
  const caretHit = caret != null && alphaAt(buf, caret.position[0], caret.position[1]) > 16
  const selectionHit =
    selections.length > 0 && selections.some((s) => alphaAt(buf, s.position[0], s.position[1]) > 16)

  return { pass: caretHit && selectionHit, caretHit, selectionHit }
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

  const renderer = new WebGPURenderer({ antialias: false, forceWebGL })
  await renderer.init()
  renderer.setSize(SIZE, SIZE)
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? 'webgpu'
    : 'webgl2'

  const rt = new RenderTarget(SIZE, SIZE)

  const legible = await testLegible(renderer, rt, font)
  const batching = await testBatching(renderer, rt, font)
  const clip = await testClip(renderer, rt, font)
  const zoom = await testZoom(renderer, rt, font)
  const caretSelection = await testCaretSelection(renderer, rt, font)

  console.warn = warn
  console.error = err
  rt.dispose()
  renderer.dispose()

  return { backend, legible, batching, clip, zoom, caretSelection, warnings, errors }
}

const out = document.getElementById('out')!
;(async () => {
  const results: Record<string, Result> = {}
  let font: SlugFont | undefined
  try {
    font = await loadFont()
  } catch (e) {
    const payload = {
      pass: false,
      results: { failed: `font load: ${e instanceof Error ? e.message : String(e)}` },
    }
    ;(window as unknown as { __U2__: unknown }).__U2__ = payload
    out.textContent = JSON.stringify(payload, null, 2)
    console.log('[U2]', JSON.stringify(payload))
    return
  }

  for (const forceWebGL of [false, true]) {
    const key = forceWebGL ? 'webgl2' : 'webgpu'
    try {
      results[key] = await run(forceWebGL, font)
    } catch (e) {
      results[key] = { failed: e instanceof Error ? (e.stack ?? e.message) : String(e) }
    }
  }

  const pass = Object.values(results).every(
    (r): r is Ok =>
      'legible' in r &&
      r.legible.pass &&
      r.batching.pass &&
      r.clip.pass &&
      r.zoom.pass &&
      r.caretSelection.pass &&
      r.errors.length === 0
  )
  const payload = { pass, results }
  ;(window as unknown as { __U2__: unknown }).__U2__ = payload
  out.textContent = JSON.stringify(payload, null, 2)
  console.log('[U2]', JSON.stringify(payload))
})()
