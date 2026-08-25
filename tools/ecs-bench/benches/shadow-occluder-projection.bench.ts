import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { bench, group } from '@pmndrs/labs'
import { OcclusionPass } from '../../../packages/three-flatland/src/lights/OcclusionPass.ts'
import { Sprite2DMaterial } from '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts'

if (
  process.env['NODE_ENV'] !== 'production' ||
  process.env['FL_PROFILE'] === 'true' ||
  process.env['FL_DEVTOOLS'] === 'true'
) {
  throw new Error('Shadow Labs benchmarks require NODE_ENV=production with FL_PROFILE and FL_DEVTOOLS disabled')
}

interface RendererStub {
  clear(): void
  getRenderTarget(): null
  render(scene?: object, camera?: object): number
  renderCalls: number
  setClearColor(): void
  setRenderTarget(): void
}

interface Context {
  camera: object
  geometries: GeometryFixture[]
  materials: Sprite2DMaterial[]
  meshes: MeshFixture[]
  pass: OcclusionPass
  renderer: RendererStub
  scene: SceneFixture
  textures: TextureFixture[]
}

interface DisposableFixture {
  dispose(): void
}

interface GeometryFixture extends DisposableFixture {
  setAttribute(name: string, attribute: object): void
}

interface MeshFixture {
  clone(recursive?: boolean): MeshFixture
}

interface SceneFixture {
  add(...children: MeshFixture[]): void
  clear(): void
}

interface TextureFixture extends DisposableFixture {
  image: { height: number; width: number }
}

const ROOT = resolve(import.meta.dirname, '../../..')
const { BufferGeometry, InstancedBufferAttribute, Mesh, OrthographicCamera, Scene, Texture } = createRequire(
  resolve(ROOT, 'packages/three-flatland/package.json')
)('three') as {
  BufferGeometry: new () => GeometryFixture
  InstancedBufferAttribute: new (array: Float32Array, itemSize: number) => object
  Mesh: new (geometry: object, material: object) => MeshFixture
  OrthographicCamera: new () => object
  Scene: new () => SceneFixture
  Texture: new () => TextureFixture
}

/**
 * Candidate-B preparation floor. Views share source geometry and keep their
 * render material for their entire lifetime, so a camera-only dirty shadow
 * pass performs no discovery or material swap/restore work. Full renderer
 * traversal and GPU cost remain owned by the headed WebGPU gate.
 */
class PersistentShadowViewPrototype {
  private readonly _scene = new Scene()
  private readonly _views: MeshFixture[]

  constructor(sources: readonly MeshFixture[]) {
    this._views = sources.map((source) => {
      const view = source.clone(false)
      this._scene.add(view)
      return view
    })
  }

  get viewCount(): number {
    return this._views.length
  }

  render(renderer: RendererStub, camera: object): number {
    return renderer.render(this._scene, camera) ^ this._views.length
  }

  dispose(): void {
    this._scene.clear()
    this._views.length = 0
  }
}

function createContext(sourceCount: number, materialKeys: number): Context {
  const scene = new Scene()
  const camera = new OrthographicCamera()
  const textures = Array.from({ length: materialKeys }, () => {
    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    return texture
  })
  const materials = textures.map((texture) => new Sprite2DMaterial({ alphaTest: 0.5, map: texture as never }))
  const geometries: GeometryFixture[] = []
  const meshes: MeshFixture[] = []

  for (let index = 0; index < sourceCount; index++) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('instanceSystem', new InstancedBufferAttribute(new Float32Array(4), 4))
    geometries.push(geometry)
    const mesh = new Mesh(geometry, materials[index % materialKeys]!)
    meshes.push(mesh)
    scene.add(mesh)
  }

  return {
    camera,
    geometries,
    materials,
    meshes,
    pass: new OcclusionPass(),
    renderer: {
      clear() {},
      getRenderTarget: () => null,
      render() {
        return ++this.renderCalls
      },
      renderCalls: 0,
      setClearColor() {},
      setRenderTarget() {},
    },
    scene,
    textures,
  }
}

function register(name: string, sourceCount: number, materialKeys: number): void {
  bench(name, function* () {
    const context = createContext(sourceCount, materialKeys)
    context.pass.render(context.renderer as never, context.scene as never, context.camera as never)

    try {
      yield () => context.pass.render(context.renderer as never, context.scene as never, context.camera as never)
    } finally {
      context.pass.dispose()
      for (const geometry of context.geometries) geometry.dispose()
      for (const material of context.materials) material.dispose()
      for (const texture of context.textures) texture.dispose()
    }
  }).gc('inner')
}

function registerPersistentView(name: string, sourceCount: number, materialKeys: number): void {
  bench(`${name} / persistent view prototype`, function* () {
    const context = createContext(sourceCount, materialKeys)
    const projection = new PersistentShadowViewPrototype(context.meshes)
    if (projection.viewCount !== sourceCount) throw new Error('Persistent shadow view count mismatch')

    try {
      yield () => projection.render(context.renderer as never, context.camera)
    } finally {
      if (context.renderer.renderCalls === 0) throw new Error('Persistent shadow view was not rendered')
      projection.dispose()
      context.pass.dispose()
      for (const geometry of context.geometries) geometry.dispose()
      for (const material of context.materials) material.dispose()
      for (const texture of context.textures) texture.dispose()
    }
  }).gc('inner')
}

function registerPair(name: string, sourceCount: number, materialKeys: number): void {
  register(`${name} / authoritative scene`, sourceCount, materialKeys)
  registerPersistentView(name, sourceCount, materialKeys)
}

group('OcclusionPass dirty preparation @shadow-occluder-projection', () => {
  registerPair('32 sources / 1 material @smoke', 32, 1)
  registerPair('32 sources / 8 materials', 32, 8)
  registerPair('256 sources / 1 material', 256, 1)
  registerPair('256 sources / 8 materials', 256, 8)
  registerPair('2,048 sources / 8 materials @scale', 2_048, 8)
  registerPair('2,048 sources / 64 materials @scale', 2_048, 64)
})
