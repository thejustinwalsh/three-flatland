import {
  compileMaterial,
  createShaderTexture,
  shaderSources,
  validateShaderSources,
  type ShaderBackend,
  type ShaderSource,
} from '@three-flatland/tsl-test'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { uniform } from 'three/tsl'
import { afterAll, describe, expect, it } from 'vitest'
import { configureCompareMaterial } from './compareMaterial'

const shaders = new Map<string, ShaderSource>()
const primaryTexture = createShaderTexture()
const compareTexture = createShaderTexture()
Object.assign(compareTexture, { isCompressedTexture: true })

afterAll(() => {
  try {
    validateShaderSources([...shaders.values()])
  } finally {
    primaryTexture.dispose()
    compareTexture.dispose()
  }
}, 60_000)

describe.each<ShaderBackend>(['wgsl', 'glsl'])('%s preview shader compatibility', (backend) => {
  it('compiles the production compare, mip, and loading graph', () => {
    const material = new MeshBasicNodeMaterial({ transparent: true, toneMapped: false })
    try {
      configureCompareMaterial({
        compareLoading: uniform(0),
        compareTexture,
        material,
        mipLevel: uniform(0),
        primaryTexture,
        split: uniform(0.5),
      })
      const program = compileMaterial(material, backend)
      expect(program.diagnostics, `${backend} preview graph logged shader code-generation errors`).toEqual([])
      for (const shader of shaderSources(program, 'preview-compare-material')) {
        shaders.set(`${shader.backend}:${shader.stage}:${shader.output}`, shader)
      }
    } finally {
      material.dispose()
    }
  })
})
