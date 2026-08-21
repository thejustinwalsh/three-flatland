import { BufferAttribute, Mesh, PlaneGeometry } from 'three'
import type { NodeMaterial } from 'three/webgpu'
import {
  compileMaterial,
  createShaderTexture,
  shaderSources,
  validateShaderSources,
  type ShaderBackend,
  type ShaderSource,
} from '@three-flatland/tsl-test'
import { afterAll, describe, expect, it } from 'vitest'
import { SDFGenerator } from './lights/SDFGenerator'
import { OcclusionPass } from './lights/OcclusionPass'
import { Sprite2DMaterial } from './materials/Sprite2DMaterial'
import { Sprite2D } from './sprites/Sprite2D'

const shaders = new Map<string, ShaderSource>()

function capture(label: string, backend: ShaderBackend, material: NodeMaterial, object?: Mesh) {
  const program = compileMaterial(material, backend, object ? { object } : undefined)
  expect(program.diagnostics, `${backend} ${label} logged shader code-generation errors`).toEqual([])
  for (const shader of shaderSources(program, label)) {
    shaders.set(`${shader.backend}:${shader.stage}:${shader.output}`, shader)
  }
}

const sdfGenerator = new SDFGenerator()
const sdfMaterials = (
  ['_jfaMaterialA', '_jfaMaterialB', '_finalMaterialA', '_finalMaterialB', '_blurHMaterial', '_blurVMaterial'] as const
).map((name) => [name.slice(1), Reflect.get(sdfGenerator, name) as NodeMaterial] satisfies [string, NodeMaterial])

const occlusionPass = new OcclusionPass()
const getOcclusionMaterial = Reflect.get(occlusionPass, '_getOrCreateOcclusionMaterial') as (
  texture: ReturnType<typeof createShaderTexture>,
  tightMesh: boolean
) => NodeMaterial
const occlusionTexture = createShaderTexture()
const occlusionMaterials = [
  ['occlusion-synth-quad', getOcclusionMaterial.call(occlusionPass, occlusionTexture, false)],
  ['occlusion-tight-mesh', getOcclusionMaterial.call(occlusionPass, occlusionTexture, true)],
] satisfies Array<[string, NodeMaterial]>

function occlusionGeometry() {
  const geometry = new PlaneGeometry(1, 1)
  geometry.setAttribute(
    'instanceUV',
    new BufferAttribute(new Float32Array([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]), 4)
  )
  geometry.setAttribute(
    'instanceSystem',
    new BufferAttribute(new Float32Array([1, 1, 7, 0, 1, 1, 7, 0, 1, 1, 7, 0, 1, 1, 7, 0]), 4)
  )
  return geometry
}

afterAll(() => {
  try {
    validateShaderSources([...shaders.values()])
  } finally {
    sdfGenerator.dispose()
    occlusionPass.dispose()
    occlusionTexture.dispose()
  }
}, 60_000)

describe.each<ShaderBackend>(['wgsl', 'glsl'])('%s core TSL compatibility', (backend) => {
  it('compiles standalone sprite materials', () => {
    const sprite = new Sprite2D({ texture: createShaderTexture() })
    capture('sprite-material', backend, sprite.material, sprite)
  })

  it('compiles opaque premultiplied sprite variants', () => {
    const material = new Sprite2DMaterial({
      alphaTest: 0.5,
      map: createShaderTexture(),
      premultipliedAlpha: true,
      transparent: false,
    })
    const sprite = new Sprite2D({ material })
    capture('sprite-material-opaque-premultiplied', backend, material, sprite)
  })

  it.each(sdfMaterials)('compiles the %s pass', (label, material) => {
    capture(label, backend, material)
  })

  it.each(occlusionMaterials)('compiles the %s pass', (label, material) => {
    const mesh = new Mesh(occlusionGeometry(), material)
    capture(label, backend, material, mesh)
  })
})
