/**
 * U1 — the TSL panel material harness. This IS experiments E2 and E3.
 *
 * E3: the panel coverage graph compiles clean on BOTH backends (zero WGSL
 * uniformity diagnostics, zero GLSL warnings) and renders antialiased rounded
 * corners; per-instance data/clipping lanes step per instance and dynamic
 * writes (addUpdateRange + needsUpdate on the itemSize-16 source attributes)
 * reach the GPU through InstancedPanelMesh's lane forwarding.
 *
 * E2: an instanced duck-typed panel mesh casts a directional-light shadow whose
 * silhouette matches the main pass — pixels inside a corner's rounded cutout
 * are UNSHADOWED (colorNode.a coverage + alphaTest drive the shadow pass; no
 * PanelDepth/DistanceMaterial exists anymore). The point-light (distance)
 * variant is recorded separately and does not gate `pass`.
 *
 * Results land on `window.__U1__` and in the console as '[U1] {...}'.
 */
import {
  AmbientLight,
  DirectionalLight,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  PointLight,
  RenderTarget,
  Scene,
} from 'three'
import { MeshBasicNodeMaterial, MeshLambertNodeMaterial, WebGPURenderer } from 'three/webgpu'
import { createPanelGeometry } from '../../../packages/uikit/src/panel/geometry.js'
import { createPanelNodeMaterial } from '../../../packages/uikit/src/panel/material/create.js'
import { InstancedPanelMesh } from '../../../packages/uikit/src/panel/instance/mesh.js'

const MAIN_SIZE = 256
const SHADOW_SIZE = 512

type RootStub = ConstructorParameters<typeof InstancedPanelMesh>[0]
const makeRootStub = () =>
  ({ onUpdateMatrixWorldSet: new Set<() => void>() }) as unknown as RootStub

/** base-50 packed border radius, per-corner units of 1% of height (0..49). */
const packRadius = (bl: number, br: number, tr: number, tl: number) =>
  bl + br * 50 + tr * 2500 + tl * 125000

const NO_CLIP = [-1, 0, 0, Number.MAX_SAFE_INTEGER] as const

type PanelBundle = {
  mesh: InstancedPanelMesh
  matrix: InstancedBufferAttribute
  data: InstancedBufferAttribute
  clip: InstancedBufferAttribute
}

function createPanelBundle(count: number): PanelBundle {
  const make = (fill?: (a: Float32Array, i: number) => void) => {
    const array = new Float32Array(count * 16)
    if (fill != null) for (let i = 0; i < count; i++) fill(array, i)
    const attr = new InstancedBufferAttribute(array, 16, false)
    attr.setUsage(DynamicDrawUsage)
    return attr
  }
  const matrix = make()
  const data = make()
  const clip = make((a, i) => {
    for (let p = 0; p < 4; p++) a.set(NO_CLIP, i * 16 + p * 4)
  })
  const mesh = new InstancedPanelMesh(makeRootStub(), matrix, data, clip)
  mesh.count = count
  mesh.material = createPanelNodeMaterial(MeshBasicNodeMaterial, { type: 'instanced' })
  return { mesh, matrix, data, clip }
}

function setInstanceMatrix(
  attr: InstancedBufferAttribute,
  i: number,
  x: number,
  y: number,
  z: number
) {
  attr.array.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1], i * 16)
  attr.addUpdateRange(i * 16, 16)
  attr.needsUpdate = true
}

function setInstanceData(
  attr: InstancedBufferAttribute | Float32Array,
  i: number,
  rgba: [number, number, number, number],
  radiusUnits: number
) {
  const array = attr instanceof Float32Array ? attr : (attr.array as Float32Array)
  const o = i * 16
  array.fill(0, o, o + 16)
  array.set(rgba, o + 4)
  array[o + 8] = packRadius(radiusUnits, radiusUnits, radiusUnits, radiusUnits)
  array[o + 14] = 100 // width
  array[o + 15] = 100 // height
  if (!(attr instanceof Float32Array)) {
    attr.addUpdateRange(o, 16)
    attr.needsUpdate = true
  }
}

async function readPixels(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: OrthographicCamera,
  rt: RenderTarget,
  size: number
): Promise<Uint8Array> {
  renderer.setRenderTarget(rt)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  return (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, size, size)) as Uint8Array
}

/** world → pixel index for a square ortho camera centered at origin. */
const worldToPx = (v: number, extent: number, size: number) =>
  Math.min(size - 1, Math.max(0, Math.round(((v + extent) / (2 * extent)) * size)))

function sample(buf: Uint8Array, size: number, ix: number, iy: number) {
  const o = (iy * size + ix) * 4
  return [buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!] as const
}

function luminance3x3(buf: Uint8Array, size: number, ix: number, iy: number) {
  let sum = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const [r, g, b] = sample(buf, size, ix + dx, iy + dy)
      sum += (r + g + b) / 3
    }
  }
  return sum / 9
}

// ---------------------------------------------------------------------------
// E3 — main pass: compile-clean, antialiased corners, per-instance lanes
// ---------------------------------------------------------------------------

async function testMainPass(renderer: WebGPURenderer) {
  const EXTENT = 1.1
  const scene = new Scene()
  const camera = new OrthographicCamera(-EXTENT, EXTENT, EXTENT, -EXTENT, 0.1, 10)
  camera.position.z = 2

  const bundle = createPanelBundle(2)
  setInstanceMatrix(bundle.matrix, 0, -0.55, 0, 0)
  setInstanceMatrix(bundle.matrix, 1, 0.55, 0, 0)
  setInstanceData(bundle.data, 0, [1, 1, 1, 1], 49) // white, 49% corner radius
  setInstanceData(bundle.data, 1, [1, 0, 0, 1], 49) // red
  scene.add(bundle.mesh)

  const rt = new RenderTarget(MAIN_SIZE, MAIN_SIZE)
  const w2p = (v: number) => worldToPx(v, EXTENT, MAIN_SIZE)
  const at = (buf: Uint8Array, x: number, y: number) => sample(buf, MAIN_SIZE, w2p(x), w2p(y))

  // 1 — base render: per-instance colors, transparent corner cutouts, AA arc
  const base = await readPixels(renderer, scene, camera, rt, MAIN_SIZE)
  const c0 = at(base, -0.55, 0)
  const c1 = at(base, 0.55, 0)
  const perInstanceColors =
    c0[3] > 230 && c0[0] > 230 && c0[1] > 230 && c1[3] > 230 && c1[0] > 230 && c1[1] < 60
  // mirrored pair so the assertion is row-order (y-flip) proof
  const cutA = at(base, -0.98, 0.43)
  const cutB = at(base, -0.98, -0.43)
  const cornersTransparent = cutA[3] < 25 && cutB[3] < 25

  const scanAA = (cy: number) => {
    let intermediate = 0
    for (let s = 0; s <= 128; s++) {
      const t = s / 128
      const x = -1.05 + t * 0.5
      const y = cy - t * cy // toward panel center y=0
      const a = at(base, x, y)[3]
      if (a > 30 && a < 225) intermediate++
    }
    return intermediate
  }
  const antialiased = scanAA(0.5) >= 1 && scanAA(-0.5) >= 1

  // 2 — dynamic data update through the lane forwarding
  setInstanceData(bundle.data, 0, [0, 1, 0, 1], 49) // green
  const dyn = await readPixels(renderer, scene, camera, rt, MAIN_SIZE)
  const d0 = at(dyn, -0.55, 0)
  const d1 = at(dyn, 0.55, 0)
  const dynamicDataUpdate = d0[1] > 230 && d0[0] < 60 && d1[0] > 230 && d1[1] < 60

  // 3 — per-instance clipping: keep x <= -0.55 on instance 0 only
  bundle.clip.array.set([-1, 0, 0, -0.55], 0)
  bundle.clip.addUpdateRange(0, 4)
  bundle.clip.needsUpdate = true
  const clipped = await readPixels(renderer, scene, camera, rt, MAIN_SIZE)
  const keep = at(clipped, -0.8, 0)
  const gone = at(clipped, -0.3, 0)
  const other = at(clipped, 0.55, 0)
  const perInstanceClip = keep[3] > 230 && gone[3] < 25 && other[3] > 230

  // 4 — instance-matrix lane forwarding: move instance 0; the clip plane is in
  // root space, so the visible boundary must stay at x = -0.55. A stale matrix
  // lane would leave x = -0.45 visible.
  setInstanceMatrix(bundle.matrix, 0, -0.35, 0, 0)
  const moved = await readPixels(renderer, scene, camera, rt, MAIN_SIZE)
  const movedKeep = at(moved, -0.7, 0)
  const movedGone = at(moved, -0.45, 0)
  const matrixLaneSync = movedKeep[3] > 230 && movedGone[3] < 25

  // 5 — the non-instanced ('normal') variant: uniform mat4 refreshed per frame
  const normalScene = new Scene()
  const normalCamera = new OrthographicCamera(-0.55, 0.55, 0.55, -0.55, 0.1, 10)
  normalCamera.position.z = 2
  const normalData = new Float32Array(16)
  setInstanceData(normalData, 0, [1, 1, 1, 1], 49)
  const normalMesh = new Mesh(
    createPanelGeometry(),
    createPanelNodeMaterial(MeshBasicNodeMaterial, { type: 'normal', data: normalData })
  )
  normalScene.add(normalMesh)
  const w2pN = (v: number) => worldToPx(v, 0.55, MAIN_SIZE)
  const nBase = await readPixels(renderer, normalScene, normalCamera, rt, MAIN_SIZE)
  const nCenter = sample(nBase, MAIN_SIZE, w2pN(0), w2pN(0))
  const nCutA = sample(nBase, MAIN_SIZE, w2pN(-0.43), w2pN(0.43))
  const nCutB = sample(nBase, MAIN_SIZE, w2pN(-0.43), w2pN(-0.43))
  setInstanceData(normalData, 0, [0, 0, 1, 1], 49) // blue — uniform path refresh
  const nDyn = await readPixels(renderer, normalScene, normalCamera, rt, MAIN_SIZE)
  const nCenter2 = sample(nDyn, MAIN_SIZE, w2pN(0), w2pN(0))
  const normalVariant =
    nCenter[3] > 230 &&
    nCenter[0] > 230 &&
    nCutA[3] < 25 &&
    nCutB[3] < 25 &&
    nCenter2[2] > 230 &&
    nCenter2[0] < 60

  rt.dispose()
  bundle.mesh.dispose()
  normalMesh.geometry.dispose()

  return {
    perInstanceColors,
    cornersTransparent,
    antialiased,
    dynamicDataUpdate,
    perInstanceClip,
    matrixLaneSync,
    normalVariant,
  }
}

// ---------------------------------------------------------------------------
// E2 — shadow silhouette: rounded corners must survive into the shadow pass
// ---------------------------------------------------------------------------

async function testShadow(renderer: WebGPURenderer, kind: 'directional' | 'point') {
  const EXTENT = 2
  const scene = new Scene()
  const camera = new OrthographicCamera(-EXTENT, EXTENT, EXTENT, -EXTENT, 0.1, 20)
  camera.position.z = 6

  const ground = new Mesh(new PlaneGeometry(8, 8), new MeshLambertNodeMaterial())
  ground.receiveShadow = true
  scene.add(ground)
  scene.add(new AmbientLight(0xffffff, 0.25))

  if (kind === 'directional') {
    const light = new DirectionalLight(0xffffff, 2.5)
    light.position.set(2, 0, 4)
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048)
    light.shadow.camera.left = -3
    light.shadow.camera.right = 3
    light.shadow.camera.top = 3
    light.shadow.camera.bottom = -3
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = 12
    light.shadow.bias = -0.0005
    light.shadow.normalBias = 0.02
    scene.add(light)
    scene.add(light.target)
  } else {
    const light = new PointLight(0xffffff, 40, 0, 2)
    light.position.set(2, 0, 4)
    light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = 20
    light.shadow.bias = -0.005
    scene.add(light)
  }

  // 2 instances so the duck-typed mesh actually draws instanced; the second one
  // sits outside the view and the shadow frustum.
  const bundle = createPanelBundle(2)
  setInstanceMatrix(bundle.matrix, 0, 0, 0, 1)
  setInstanceMatrix(bundle.matrix, 1, 8, 0, 1)
  setInstanceData(bundle.data, 0, [1, 1, 1, 1], 49)
  setInstanceData(bundle.data, 1, [1, 1, 1, 1], 49)
  scene.add(bundle.mesh)

  const rt = new RenderTarget(SHADOW_SIZE, SHADOW_SIZE)
  const w2p = (v: number) => worldToPx(v, EXTENT, SHADOW_SIZE)
  const lum = (buf: Uint8Array, x: number, y: number) =>
    luminance3x3(buf, SHADOW_SIZE, w2p(x), w2p(y))

  // A: no caster (reference) — B: casting. Ratios cancel light falloff/shading.
  bundle.mesh.castShadow = false
  const bufA = await readPixels(renderer, scene, camera, rt, SHADOW_SIZE)
  bundle.mesh.castShadow = true
  const bufB = await readPixels(renderer, scene, camera, rt, SHADOW_SIZE)

  // Directional light at (2,0,4): a panel point (x,y,1) lands at (x-0.5, y).
  // Point light: p' = L + t(p-L), t = 4/3 → square [-4/3,0]×[-2/3,2/3].
  const pts =
    kind === 'directional'
      ? {
          inside: [
            [-0.8, 0.3],
            [-0.8, -0.3],
          ],
          cutout: [
            [-0.93, 0.43],
            [-0.93, -0.43],
          ],
          lit: [-1.5, 0],
        }
      : {
          inside: [
            [-1.02, 0.42],
            [-1.02, -0.42],
          ],
          cutout: [
            [-1.243, 0.577],
            [-1.243, -0.577],
          ],
          lit: [-1.7, 0],
        }

  const ratio = (x: number, y: number) => {
    const a = lum(bufA, x, y)
    return a < 1 ? 1 : lum(bufB, x, y) / a
  }
  const insideRatios = pts.inside.map(([x, y]) => ratio(x!, y!))
  const cutoutRatios = pts.cutout.map(([x, y]) => ratio(x!, y!))
  const litReference = lum(bufA, pts.lit[0]!, pts.lit[1]!)

  const shadowPresent = insideRatios.every((r) => r < 0.7)
  const cornerCutoutUnshadowed = cutoutRatios.every((r) => r > 0.85)
  const sceneLit = litReference > 30

  rt.dispose()
  bundle.mesh.dispose()
  ground.geometry.dispose()

  return {
    shadowPresent,
    cornerCutoutUnshadowed,
    sceneLit,
    insideRatios: insideRatios.map((r) => Number(r.toFixed(3))),
    cutoutRatios: cutoutRatios.map((r) => Number(r.toFixed(3))),
  }
}

// ---------------------------------------------------------------------------

type Capture = { warnings: string[]; errors: string[]; restore: () => void }

function captureConsole(): Capture {
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
  return {
    warnings,
    errors,
    restore: () => {
      console.warn = warn
      console.error = err
    },
  }
}

type BackendResult = {
  backend: string
  e3: Awaited<ReturnType<typeof testMainPass>>
  e2Directional: Awaited<ReturnType<typeof testShadow>>
  e2Point: Awaited<ReturnType<typeof testShadow>> | { failed: string }
  warnings: string[]
  errors: string[]
  pointWarnings: string[]
  pointErrors: string[]
}

async function run(forceWebGL: boolean): Promise<BackendResult> {
  const main = captureConsole()
  const renderer = new WebGPURenderer({ antialias: false, forceWebGL })
  renderer.shadowMap.enabled = true
  await renderer.init()
  renderer.setSize(SHADOW_SIZE, SHADOW_SIZE)
  renderer.setClearColor(0x000000, 0)
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? 'webgpu'
    : 'webgl2'

  const e3 = await testMainPass(renderer)
  const e2Directional = await testShadow(renderer, 'directional')
  main.restore()

  // The point-light (distance) variant is recorded separately — its warnings
  // and failures do not gate `pass`.
  const point = captureConsole()
  let e2Point: BackendResult['e2Point']
  try {
    e2Point = await testShadow(renderer, 'point')
  } catch (e) {
    e2Point = { failed: e instanceof Error ? e.message : String(e) }
  }
  point.restore()

  renderer.dispose()

  return {
    backend,
    e3,
    e2Directional,
    e2Point,
    warnings: main.warnings,
    errors: main.errors,
    pointWarnings: point.warnings,
    pointErrors: point.errors,
  }
}

const out = document.getElementById('out')!
;(async () => {
  const results: Record<string, BackendResult | { failed: string }> = {}
  for (const forceWebGL of [false, true]) {
    const key = forceWebGL ? 'webgl2' : 'webgpu'
    try {
      results[key] = await run(forceWebGL)
    } catch (e) {
      results[key] = { failed: e instanceof Error ? e.message : String(e) }
    }
  }
  const pass = Object.values(results).every(
    (r): r is BackendResult =>
      'e3' in r &&
      Object.values(r.e3).every((v) => v === true) &&
      r.e2Directional.shadowPresent &&
      r.e2Directional.cornerCutoutUnshadowed &&
      r.e2Directional.sceneLit &&
      r.warnings.length === 0 &&
      r.errors.length === 0
  )
  const payload = { pass, results }
  ;(window as unknown as { __U1__: unknown }).__U1__ = payload
  out.textContent = JSON.stringify(payload, null, 2)
  console.log('[U1]', JSON.stringify(payload))
})()
