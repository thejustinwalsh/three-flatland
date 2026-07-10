/**
 * E1 — phase-0 experiment. Proves uikit's duck-typed instancing survives
 * WebGPURenderer on BOTH backends, and that a mat4 carried as four vec4 lanes
 * (Q1's resolution) recomposes correctly in the node graph.
 *
 * Static evidence (three@0.183.1) says it should:
 *   NodeMaterial.js:832          instancing gated on a property check, not instanceof
 *   RenderObject.js:573-575      instanceCount = object.count when geometry is plain
 *   WebGPUAttributeUtils.js:264  WebGPU stepMode derived from the attribute
 *   WebGLBackend.js:2457         WebGL2 vertexAttribDivisor likewise
 *
 * This draws the pixels. Result lands on `window.__E1__` and in the console.
 *
 * What each assertion buys:
 *  - `drew`                  the duck type produced a draw call at all
 *  - `distinctColors === N`  per-instance vec4 attributes are stepped per instance
 *                            AND `mat4(v0,v1,v2,v3)` recomposed + indexed correctly
 *  - `instancesSeparated`    `instanceMatrix` was consumed (instances do not overlap)
 *  - `updateVisibleNextFrame` addUpdateRange + needsUpdate reaches the GPU
 */
import {
  InstancedBufferAttribute,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
} from 'three'
import { MeshBasicNodeMaterial, WebGPURenderer } from 'three/webgpu'
import { attribute, mat4, vec4 } from 'three/tsl'

const N = 4
const SIZE = 256

/** A Mesh that merely *claims* to be instanced — exactly uikit's InstancedPanelMesh. */
class DuckMesh extends Mesh {
  count = N
  readonly isInstancedMesh = true // `protected` in uikit; erases at runtime either way
  instanceMatrix: InstancedBufferAttribute
  readonly instanceColor = null
  readonly morphTexture = null

  constructor(geometry: PlaneGeometry, material: MeshBasicNodeMaterial) {
    super(geometry, material)
    const m = new Float32Array(16 * N)
    for (let i = 0; i < N; i++) {
      const tx = (i - (N - 1) / 2) * 1.4
      m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, 0, 0, 1], i * 16)
    }
    this.instanceMatrix = new InstancedBufferAttribute(m, 16)
  }
}

type Ok = {
  backend: string
  drew: boolean
  distinctColors: number
  expected: number
  instancesSeparated: boolean
  updateVisibleNextFrame: boolean
  warnings: string[]
  errors: string[]
}
type Result = Ok | { failed: string }

const rgb = (r: number, g: number, b: number) => `${r >> 4},${g >> 4},${b >> 4}`

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
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? 'webgpu'
    : 'webgl2'

  // Plain geometry — deliberately NOT an InstancedBufferGeometry.
  const geometry = new PlaneGeometry(1, 1)

  // Four vec4 lanes encoding diag(r, g, b, 1) per instance. Recomposing them with
  // mat4() and reading the diagonal proves both instanced-vec4 stepping and mat4
  // construction/indexing in the node graph.
  const laneArrays: Float32Array[] = []
  const laneAttrs: InstancedBufferAttribute[] = []
  for (let l = 0; l < 4; l++) {
    const a = new Float32Array(4 * N)
    laneArrays.push(a)
    const attr = new InstancedBufferAttribute(a, 4)
    geometry.setAttribute(`aLane${l}`, attr)
    laneAttrs.push(attr)
  }
  const setInstanceColor = (i: number, r: number, g: number, b: number) => {
    laneArrays[0]!.set([r, 0, 0, 0], i * 4)
    laneArrays[1]!.set([0, g, 0, 0], i * 4)
    laneArrays[2]!.set([0, 0, b, 0], i * 4)
    laneArrays[3]!.set([0, 0, 0, 1], i * 4)
  }
  for (let i = 0; i < N; i++) setInstanceColor(i, (i + 1) / N, 0.2, 1 - i / N)

  const material = new MeshBasicNodeMaterial()
  const laneMat = mat4(
    attribute('aLane0', 'vec4'),
    attribute('aLane1', 'vec4'),
    attribute('aLane2', 'vec4'),
    attribute('aLane3', 'vec4')
  )
  // `.element()` indexes storage/buffer arrays, not matrix columns. Extract
  // columns by multiplying against basis vectors — unambiguous in WGSL and GLSL.
  const col0 = laneMat.mul(vec4(1, 0, 0, 0))
  const col1 = laneMat.mul(vec4(0, 1, 0, 0))
  const col2 = laneMat.mul(vec4(0, 0, 1, 0))
  material.colorNode = vec4(col0.x, col1.y, col2.z, 1)

  const mesh = new DuckMesh(geometry, material)
  const scene = new Scene()
  scene.add(mesh)
  const camera = new OrthographicCamera(-3.5, 3.5, 3.5, -3.5, 0.1, 10)
  camera.position.z = 5

  const rt = new RenderTarget(SIZE, SIZE)

  const sample = async () => {
    renderer.setRenderTarget(rt)
    // `render()` after an awaited `init()` — `renderAsync()` is deprecated.
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    const buf = (await renderer.readRenderTargetPixelsAsync(rt, 0, 0, SIZE, SIZE)) as Uint8Array
    const colors = new Set<string>()
    const columns = new Set<number>()
    for (let p = 0; p < SIZE * SIZE; p++) {
      const o = p * 4
      if (buf[o + 3]! < 200) continue
      colors.add(rgb(buf[o]!, buf[o + 1]!, buf[o + 2]!))
      columns.add((p % SIZE) >> 5) // coarse x-bucket, to detect separated quads
    }
    return { colors, columns }
  }

  const first = await sample()
  const drew = first.colors.size > 0
  // N quads at distinct x must occupy at least N separated coarse x-buckets.
  const instancesSeparated = first.columns.size >= N

  // addUpdateRange: recolour instance 0 green, mark only its range, re-render.
  setInstanceColor(0, 0.05, 0.95, 0.05)
  for (const a of laneAttrs) {
    a.clearUpdateRanges()
    a.addUpdateRange(0, 4)
    a.needsUpdate = true
  }
  const second = await sample()
  const updateVisibleNextFrame =
    second.colors.has(rgb(13, 242, 13)) && !second.colors.has(rgb(64, 51, 255))

  console.warn = warn
  console.error = err
  rt.dispose()
  renderer.dispose()

  return {
    backend,
    drew,
    distinctColors: first.colors.size,
    expected: N,
    instancesSeparated,
    updateVisibleNextFrame,
    warnings,
    errors,
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
  const pass = Object.values(results).every(
    (r): r is Ok =>
      'drew' in r &&
      r.drew &&
      r.distinctColors === r.expected &&
      r.instancesSeparated &&
      r.updateVisibleNextFrame &&
      r.errors.length === 0
  )
  const payload = { pass, results }
  ;(window as unknown as { __E1__: unknown }).__E1__ = payload
  out.textContent = JSON.stringify(payload, null, 2)
  console.log('[E1]', JSON.stringify(payload))
})()
