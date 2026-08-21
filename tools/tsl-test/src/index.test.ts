import { describe, expect, it } from 'vitest'
import { hasSemanticGLSLCompiler, validateGLSL, validateShaderSources, validateWGSL, type ShaderSource } from './index'

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

  it('normalizes nested and compound unsigned textureLoad selectors for Naga 24', () => {
    const output = `
      @group(0) @binding(0) var sampledTexture: texture_2d<f32>;
      @group(0) @binding(1) var indexTexture: texture_2d<u32>;
      @fragment fn main() -> @location(0) vec4<f32> {
        // textureLoad(fake, vec2<i32>(0), u32(0))
        let level = textureLoad(indexTexture, vec2<i32>(0, 0), u32(0)).x;
        return textureLoad(sampledTexture, vec2<i32>(0, 0), u32(level) + u32(0));
      }
    `

    expect(() => validateWGSL([shader(output, 'wgsl')])).not.toThrow()
  })

  it('rejects malformed WGSL', () => {
    expect(() => validateWGSL([shader('@fragment fn main(', 'wgsl')])).toThrow(/WGSL parser rejected/)
  })

  it('accepts valid GLSL and rejects malformed GLSL', () => {
    const valid = `#version 300 es
      precision highp float;
      layout(std140) uniform render {
        mat4 cameraViewMatrix;
      };
      uniform InstanceBuffer {
        mat4 instanceMatrix[1];
      };
      out vec4 fragColor;
      void main() { fragColor = cameraViewMatrix * instanceMatrix[0] * vec4(1.0); }
    `

    expect(() => validateGLSL([shader(valid, 'glsl')])).not.toThrow()
    expect(() => validateGLSL([shader('void main( {', 'glsl')])).toThrow(/GLSL parser rejected/)
  })

  it('rejects GLSL semantic warnings', () => {
    const output = `#version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() { fragColor = missingColor; }
    `

    expect(() => validateGLSL([shader(output, 'glsl')])).toThrow(/GLSL parser rejected/)
  })

  it.runIf(hasSemanticGLSLCompiler())('rejects type-invalid GLSL with the reference compiler', () => {
    const output = `#version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() { fragColor = vec4(1.0 - 1); }
    `

    expect(() => validateGLSL([shader(output, 'glsl')])).toThrow(/GLSL compiler rejected/)
  })
})
