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
  render(): void
  setClearColor(): void
  setRenderTarget(): void
}

interface Context {
  camera: object
  geometries: GeometryFixture[]
  materials: Sprite2DMaterial[]
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

interface SceneFixture {
  add(...children: object[]): void
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
  Mesh: new (geometry: object, material: object) => object
  OrthographicCamera: new () => object
  Scene: new () => SceneFixture
  Texture: new () => TextureFixture
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

  for (let index = 0; index < sourceCount; index++) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('instanceSystem', new InstancedBufferAttribute(new Float32Array(4), 4))
    geometries.push(geometry)
    scene.add(new Mesh(geometry, materials[index % materialKeys]!))
  }

  return {
    camera,
    geometries,
    materials,
    pass: new OcclusionPass(),
    renderer: {
      clear() {},
      getRenderTarget: () => null,
      render() {},
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

group('OcclusionPass dirty preparation @shadow-occluder-projection', () => {
  register('32 sources / 1 material @smoke', 32, 1)
  register('32 sources / 8 materials', 32, 8)
  register('256 sources / 1 material', 256, 1)
  register('256 sources / 8 materials', 256, 8)
  register('2,048 sources / 8 materials @scale', 2_048, 8)
  register('2,048 sources / 64 materials @scale', 2_048, 64)
})
