import { describe, expect, it } from 'vitest'
import { validateGLSL, validateShaderSources, validateWGSL, type ShaderSource } from './index'

function shader(output: string, backend: 'glsl' | 'wgsl'): ShaderSource {
  return { backend, label: 'validator-fixture', output, stage: 'fragment' }
}

describe('shader validators', () => {
  it('accepts empty and single-backend batches', () => {
    expect(() => validateWGSL([])).not.toThrow()
    expect(() =>
      validateShaderSources([shader('#version 300 es\nprecision highp float;\nvoid main() {}', 'glsl')])
    ).not.toThrow()
  })

  it('accepts current-spec unsigned textureLoad mip levels despite Naga 24', () => {
    const output = `
      @group(0) @binding(0) var sampledTexture: texture_2d<f32>;
      @fragment fn main() -> @location(0) vec4<f32> {
        return textureLoad(sampledTexture, vec2<i32>(0, 0), u32(0));
      }
    `

    expect(() => validateWGSL([shader(output, 'wgsl')])).not.toThrow()
  })

  it('rejects malformed WGSL', () => {
    expect(() => validateWGSL([shader('@fragment fn main(', 'wgsl')])).toThrow(/WGSL parser rejected/)
  })

  it('accepts valid GLSL and rejects malformed GLSL', () => {
    const valid = `
      #version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() { fragColor = vec4(1.0); }
    `

    expect(() => validateGLSL([shader(valid, 'glsl')])).not.toThrow()
    expect(() => validateGLSL([shader('void main( {', 'glsl')])).toThrow(/GLSL parser rejected/)
  })
})
