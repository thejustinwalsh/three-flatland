import { validateWGSL, type ShaderSource } from '@three-flatland/tsl-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkiaBlitPipeline } from './SkiaBlitPipeline'

describe('SkiaBlitPipeline shader compatibility', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('validates the production WGSL module without a renderer', async () => {
    vi.stubGlobal('GPUShaderStage', { FRAGMENT: 2 })
    let shaderSource = ''
    const device = {
      createBindGroupLayout: () => ({}),
      createSampler: () => ({}),
      createShaderModule: ({ code }: { code: string }) => {
        shaderSource = code
        return {}
      },
    } as unknown as GPUDevice

    new SkiaBlitPipeline(device)

    expect(shaderSource).toContain('@vertex fn vsFlip')
    expect(shaderSource).toContain('@vertex fn vsNoFlip')
    expect(shaderSource).toContain('@fragment fn fs')
    await validateWGSL([
      {
        backend: 'wgsl',
        label: 'skia-blit-pipeline',
        output: shaderSource,
        stage: 'fragment',
      } satisfies ShaderSource,
    ])
  })
})
