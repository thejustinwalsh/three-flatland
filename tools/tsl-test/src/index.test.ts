import { describe, expect, it } from 'vitest'
import { Fn, workgroupBarrier } from 'three/tsl'
import {
  compileComputeNode,
  glslCompilerFailure,
  hasSemanticGLSLCompiler,
  nagaFailure,
  validateGLSL,
  validateShaderSources,
  validateWGSL,
  type ShaderSource,
} from './index'

function shader(output: string, backend: 'glsl' | 'wgsl'): ShaderSource {
  return { backend, label: 'validator-fixture', output, stage: 'fragment' }
}

describe('shader validators', () => {
  it('compiles and exposes a WebGPU TSL compute stage', async () => {
    const compute = Fn(() => {
      workgroupBarrier()
    })()
      .compute(1, [1])
      .setName('compute fixture')
    const program = compileComputeNode(compute)

    expect(program.diagnostics).toEqual([])
    expect(program.computeShader).toMatch(/@compute\s+@workgroup_size\(\s*1,\s*1,\s*1\s*\)/)
    const sources = program.computeShader
      ? [
          {
            backend: 'wgsl' as const,
            label: 'compute-fixture',
            output: program.computeShader,
            stage: 'compute' as const,
          },
        ]
      : []
    await expect(validateWGSL(sources)).resolves.toBeUndefined()
  })

  it('accepts empty and single-backend batches', async () => {
    await expect(validateWGSL([])).resolves.toBeUndefined()
    await expect(
      validateShaderSources([shader('#version 300 es\nprecision highp float;\nvoid main() {}', 'glsl')])
    ).resolves.toBeUndefined()
  })

  it('accepts current-spec unsigned textureLoad mip levels despite Naga 24', async () => {
    const output = `
      @group(0) @binding(0) var sampledTexture: texture_2d<f32>;
      @fragment fn main() -> @location(0) vec4<f32> {
        return textureLoad(sampledTexture, vec2<i32>(0, 0), u32(0));
      }
    `

    await expect(validateWGSL([shader(output, 'wgsl')])).resolves.toBeUndefined()
  })

  it('normalizes nested and compound unsigned textureLoad selectors for Naga 24', async () => {
    const output = `
      @group(0) @binding(0) var sampledTexture: texture_2d<f32>;
      @group(0) @binding(1) var indexTexture: texture_2d<u32>;
      @fragment fn main() -> @location(0) vec4<f32> {
        // textureLoad(fake, vec2<i32>(0), u32(0))
        let level = textureLoad(indexTexture, vec2<i32>(0, 0), u32(0)).x;
        return textureLoad(sampledTexture, vec2<i32>(0, 0), u32(level) + u32(0));
      }
    `

    await expect(validateWGSL([shader(output, 'wgsl')])).resolves.toBeUndefined()
  })

  it('rejects malformed WGSL', async () => {
    await expect(validateWGSL([shader('@fragment fn main(', 'wgsl')])).rejects.toThrow(/WGSL parser rejected/)
  })

  it('reports synchronous and asynchronous compiler timeouts precisely', () => {
    expect(glslCompilerFailure({ code: 'ETIMEDOUT' })).toBe('glslangValidator timed out after 25000ms')
    expect(glslCompilerFailure({ code: null, killed: true, signal: 'SIGKILL' })).toBe(
      'glslangValidator timed out after 25000ms'
    )
    expect(nagaFailure({ code: 'ETIMEDOUT' })).toBe('Naga timed out after 25000ms')
    expect(nagaFailure({ code: null, killed: true, signal: 'SIGKILL' })).toBe('Naga timed out after 25000ms')
  })

  it('accepts valid GLSL and rejects malformed GLSL', async () => {
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

    await expect(validateGLSL([shader(valid, 'glsl')])).resolves.toBeUndefined()
    await expect(validateGLSL([shader('void main( {', 'glsl')])).rejects.toThrow(/GLSL parser rejected/)
  })

  it('rejects GLSL semantic warnings', async () => {
    const output = `#version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() { fragColor = missingColor; }
    `

    await expect(validateGLSL([shader(output, 'glsl')])).rejects.toThrow(/GLSL parser rejected/)
  })

  it.runIf(hasSemanticGLSLCompiler())('rejects type-invalid GLSL with the reference compiler', async () => {
    const output = `#version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() { fragColor = vec4(1.0 - 1); }
    `

    await expect(validateGLSL([shader(output, 'glsl')])).rejects.toThrow(
      /GLSL compiler rejected emitted shaders:\n[\s\S]*validator-fixture\.frag[\s\S]*ERROR:/
    )
  })
})
