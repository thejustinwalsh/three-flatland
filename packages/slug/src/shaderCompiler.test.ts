import { Mesh } from 'three'
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
import { SlugFont } from './SlugFont'
import { SlugGeometry } from './SlugGeometry'
import { SlugMaterial } from './SlugMaterial'
import { SlugStrokeMaterial } from './SlugStrokeMaterial'

const curveTexture = createShaderTexture()
const bandTexture = createShaderTexture()
const font = new SlugFont(
  new Map(),
  { bandTexture, curveTexture, textureWidth: 2 },
  {
    unitsPerEm: 1000,
    ascender: 0.8,
    descender: -0.2,
    capHeight: 0.7,
    underlinePosition: -0.1,
    underlineThickness: 0.05,
    strikethroughPosition: 0.3,
    strikethroughThickness: 0.05,
    subscriptScale: { x: 0.6, y: 0.6 },
    subscriptOffset: { x: 0, y: -0.2 },
    superscriptScale: { x: 0.6, y: 0.6 },
    superscriptOffset: { x: 0, y: 0.4 },
  }
)

const materials = [
  ['fill-default', new SlugMaterial(font)],
  [
    'fill-optional-branches',
    new SlugMaterial(font, {
      evenOdd: true,
      pixelSnap: false,
      stemDarken: 0.4,
      supersample: true,
      thicken: 1.5,
      weightBoost: true,
    }),
  ],
  ['stroke', new SlugStrokeMaterial(font)],
] satisfies Array<[string, NodeMaterial]>

const shaders = new Map<string, ShaderSource>()

function capture(label: string, backend: ShaderBackend, material: NodeMaterial) {
  const geometry = new SlugGeometry(1)
  const program = compileMaterial(material, backend, { object: new Mesh(geometry, material) })
  geometry.dispose()
  expect(program.diagnostics, `${backend} ${label} logged shader code-generation errors`).toEqual([])
  for (const shader of shaderSources(program, label)) {
    shaders.set(`${shader.backend}:${shader.stage}:${shader.output}`, shader)
  }
}

afterAll(() => {
  try {
    validateShaderSources([...shaders.values()])
  } finally {
    for (const [, material] of materials) material.dispose()
    curveTexture.dispose()
    bandTexture.dispose()
  }
}, 60_000)

describe.each<ShaderBackend>(['wgsl', 'glsl'])('%s Slug TSL compatibility', (backend) => {
  it.each(materials)('compiles the %s material', (label, material) => {
    capture(label, backend, material)
  })
})
