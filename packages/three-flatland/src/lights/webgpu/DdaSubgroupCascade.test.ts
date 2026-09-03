import { LinearFilter, RGBAFormat, UnsignedByteType } from 'three'
import { compileComputeNode, shaderSources, validateShaderSources } from '@three-flatland/tsl-test'
import { float, vec4 } from 'three/tsl'
import { describe, expect, it, vi } from 'vitest'
import {
  DDA_SUBGROUP_DEFAULT_WORKGROUP_SIZE,
  DDA_SUBGROUP_REQUIRED_FEATURE,
  createDdaSubgroupCascadeKernel,
  getDdaSubgroupAvailability,
} from './DdaSubgroupCascade'

function renderer(webgpu: boolean, subgroups: boolean, compute = vi.fn()) {
  return {
    backend: {
      isWebGPUBackend: webgpu,
      device: { features: { has: (feature: string) => feature === 'subgroups' && subgroups } },
    },
    compute,
    hasFeature: (feature: string) => feature === 'subgroups' && subgroups,
  }
}

describe('DdaSubgroupCascade', () => {
  it('reports every hard-gate and renderer capability fallback explicitly', () => {
    expect(getDdaSubgroupAvailability(renderer(true, true), false)).toEqual({
      available: false,
      reason: 'disabled',
      requiredFeature: DDA_SUBGROUP_REQUIRED_FEATURE,
    })
    expect(getDdaSubgroupAvailability(renderer(false, false))).toEqual({
      available: false,
      reason: 'not-webgpu',
      requiredFeature: DDA_SUBGROUP_REQUIRED_FEATURE,
    })
    expect(getDdaSubgroupAvailability(renderer(true, false))).toEqual({
      available: false,
      reason: 'subgroups-unavailable',
      requiredFeature: DDA_SUBGROUP_REQUIRED_FEATURE,
    })
    expect(getDdaSubgroupAvailability(renderer(true, true))).toEqual({
      available: true,
      reason: null,
      requiredFeature: DDA_SUBGROUP_REQUIRED_FEATURE,
    })
  })

  it('creates an exact-size, linearly sampled, non-mipped packed storage atlas', () => {
    const kernel = createDdaSubgroupCascadeKernel({
      width: 13,
      height: 7,
      buildValue: () => vec4(0),
    })

    expect(kernel.width).toBe(13)
    expect(kernel.height).toBe(7)
    expect(kernel.workgroupSize).toBe(DDA_SUBGROUP_DEFAULT_WORKGROUP_SIZE)
    expect(kernel.persistentWorkgroups).toBe(2)
    expect(kernel.persistentInvocationCount).toBe(128)
    expect(kernel.maxQueueRounds).toBe(2)
    expect(kernel.computeNode.count).toBeNull()
    expect(kernel.computeNode.dispatchSize).toEqual([2, 1, 1])
    expect(kernel.computeNode.workgroupSize).toEqual([DDA_SUBGROUP_DEFAULT_WORKGROUP_SIZE, 1, 1])
    expect(kernel.outputTexture.image).toMatchObject({ width: 13, height: 7 })
    expect(kernel.outputTexture.format).toBe(RGBAFormat)
    expect(kernel.outputTexture.type).toBe(UnsignedByteType)
    expect(kernel.outputTexture.minFilter).toBe(LinearFilter)
    expect(kernel.outputTexture.magFilter).toBe(LinearFilter)
    expect(kernel.outputTexture.generateMipmaps).toBe(false)
    expect(
      (kernel.outputTexture as typeof kernel.outputTexture & { mipmapsAutoUpdate: boolean }).mipmapsAutoUpdate
    ).toBe(false)

    kernel.dispose()
  })

  it('emits subgroup ballot, scan, reduction, integer atlas addressing, and one storage write', async () => {
    const kernel = createDdaSubgroupCascadeKernel({
      width: 16,
      height: 8,
      buildValue: ({ linearIndex, atlasTexel }) =>
        vec4(float(linearIndex), float(atlasTexel.x), float(atlasTexel.y), float(1)),
    })
    const program = compileComputeNode(kernel.computeNode, { features: ['subgroups'] })
    const resetProgram = compileComputeNode(kernel.resetNode)
    expect(program.diagnostics).toEqual([])
    expect(resetProgram.diagnostics).toEqual([])
    expect(program.computeShader).not.toBeNull()
    expect(resetProgram.computeShader).toContain('atomicStore(')
    const source = program.computeShader!

    expect(source).toContain('enable subgroups;')
    expect(source).toMatch(/@compute\s+@workgroup_size\(\s*64u?,\s*1u?,\s*1u?\s*\)/)
    expect(source).toContain('atomicAdd(')
    expect(source).toContain('subgroupElect(')
    expect(source).toContain('subgroupMax(')
    expect(source).toContain('subgroupBallot(')
    expect(source).toContain('subgroupExclusiveAdd(')
    expect(source).toContain('subgroupAdd(')
    expect(source).not.toMatch(/if \( instanceIndex >=/)
    expect(source).toMatch(/@builtin\(\s*subgroup_invocation_id\s*\)/)
    expect(source).toContain('textureStore(')
    expect(source.match(/textureStore\(/g)).toHaveLength(1)
    expect(source).toMatch(/%\s*16u/)
    expect(source).toMatch(/\/\s*16u/)
    expect(source.match(/subgroupExclusiveAdd\(/g)).toHaveLength(1)
    expect(source.indexOf('subgroupExclusiveAdd(')).toBeLessThan(
      source.lastIndexOf('if ( ddaSubgroupCandidateActive )')
    )

    // The repository's current Naga 24 WASM predates WebGPU's subgroup
    // extension. Three and wgsl_reflect accept the emitted source, then the
    // semantic validator rejects only the unknown extension directive. Keep
    // this explicit until the validator is upgraded rather than pretending the
    // WebGPU-only subgroup shader received portable Naga validation.
    await expect(validateShaderSources(shaderSources(program, 'dda-subgroup-cascade'))).rejects.toThrow(
      /unknown enable-extension `subgroups`/
    )
    await validateShaderSources(shaderSources(resetProgram, 'dda-subgroup-reset'))
    kernel.dispose()
  })

  it('never dispatches past the explicit hard gate or missing subgroup feature', () => {
    const compute = vi.fn()
    const kernel = createDdaSubgroupCascadeKernel({ width: 2, height: 2, buildValue: () => vec4(1) })

    expect(kernel.execute(renderer(true, true, compute) as never, false)).toEqual({
      executed: false,
      reason: 'disabled',
    })
    expect(kernel.execute(renderer(true, false, compute) as never)).toEqual({
      executed: false,
      reason: 'subgroups-unavailable',
    })
    expect(kernel.execute(renderer(false, false, compute) as never)).toEqual({
      executed: false,
      reason: 'not-webgpu',
    })
    expect(compute).not.toHaveBeenCalled()

    expect(kernel.execute(renderer(true, true, compute) as never)).toEqual({ executed: true, reason: null })
    expect(compute).toHaveBeenCalledTimes(2)
    expect(compute).toHaveBeenNthCalledWith(1, kernel.resetNode)
    expect(compute).toHaveBeenNthCalledWith(2, kernel.computeNode)
    kernel.dispose()
  })

  it('rejects invalid structural specialization parameters before building TSL', () => {
    expect(() => createDdaSubgroupCascadeKernel({ width: 0, height: 1, buildValue: () => vec4(0) })).toThrow(/width/)
    expect(() => createDdaSubgroupCascadeKernel({ width: 1, height: 0, buildValue: () => vec4(0) })).toThrow(/height/)
    expect(() =>
      createDdaSubgroupCascadeKernel({ width: 1, height: 1, workgroupSize: 1.5, buildValue: () => vec4(0) })
    ).toThrow(/workgroup size/)
    expect(() =>
      createDdaSubgroupCascadeKernel({ width: 1, height: 1, persistentWorkgroups: 0, buildValue: () => vec4(0) })
    ).toThrow(/persistent workgroups/)
  })
})
