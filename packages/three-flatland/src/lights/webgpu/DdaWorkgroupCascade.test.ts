import { float, vec4 } from 'three/tsl'
import { compileComputeNode, createShaderTexture, shaderSources, validateShaderSources } from '@three-flatland/tsl-test'
import { describe, expect, it } from 'vitest'
import {
  DDA_WORKGROUP_CAPABILITY_ASSUMPTIONS,
  DdaWorkgroupAtomicQueuePass,
  getDdaWorkgroupAvailability,
} from './DdaWorkgroupCascade'
import { DdaWorkgroupHierarchy } from './DdaWorkgroupHierarchy'

describe('DdaWorkgroupCascade', () => {
  it('advertises a hard WebGPU-only availability boundary', () => {
    expect(getDdaWorkgroupAvailability({ backend: { isWebGPUBackend: false } })).toMatchObject({
      available: false,
      reason: 'not-webgpu',
    })
    expect(getDdaWorkgroupAvailability({ backend: { isWebGPUBackend: true } })).toMatchObject({
      available: true,
      reason: null,
    })
    expect(DDA_WORKGROUP_CAPABILITY_ASSUMPTIONS).toMatchObject({
      path: 'webgpu-workgroup',
      requiresSubgroups: false,
      usesAtomics: true,
    })
  })

  it('compiles the persistent atomic queue and its separate reset dispatch', async () => {
    const pass = new DdaWorkgroupAtomicQueuePass({
      atlasWidth: 16,
      atlasHeight: 8,
      label: 'test-atomic-cascade-builder',
      persistentInvocationCount: 32,
      buildValue: (fragCoord) => vec4(fragCoord.div(float(16)), float(0), float(1)),
    })
    const resetProgram = compileComputeNode(pass.resetNode)
    const queueProgram = compileComputeNode(pass.computeNode)
    expect(resetProgram.diagnostics).toEqual([])
    expect(queueProgram.diagnostics).toEqual([])
    expect(pass.resetNode.count).toBe(1)
    expect(pass.computeNode.count).toBeNull()
    expect(pass.computeNode.dispatchSize).toEqual([1, 1, 1])
    expect(pass.persistentInvocationCount).toBe(64)
    expect(resetProgram.computeShader).toContain('atomicStore')
    expect(queueProgram.computeShader).toContain('atomicAdd')
    expect(queueProgram.computeShader).toContain('@compute @workgroup_size( 64, 1, 1 )')
    expect(queueProgram.computeShader).not.toMatch(/if \( instanceIndex >=/)
    expect(queueProgram.computeShader).toMatch(/for\s*\(/)
    expect(queueProgram.computeShader).toContain('textureStore')
    await validateShaderSources([
      ...shaderSources(resetProgram, 'dda-workgroup-atomic-reset'),
      ...shaderSources(queueProgram, 'dda-workgroup-atomic-queue'),
    ])
    pass.dispose()
  })

  it('compiles the conservative hierarchy to WGSL', async () => {
    const occlusion = createShaderTexture()
    const emission = createShaderTexture()
    const hierarchy = new DdaWorkgroupHierarchy()
    expect(hierarchy.configure(occlusion, emission, 8, 8, 2)).toBe(true)
    expect(hierarchy.levels.map(({ width, height, scale }) => ({ width, height, scale }))).toEqual([
      { width: 4, height: 4, scale: 2 },
      { width: 2, height: 2, scale: 4 },
    ])

    const hierarchyPrograms = hierarchy.computeNodes.map((node) => compileComputeNode(node))
    for (const program of hierarchyPrograms) expect(program.diagnostics).toEqual([])
    const leafSource = hierarchyPrograms[0]!.computeShader!
    const reductionSource = hierarchyPrograms[1]!.computeShader!
    expect(leafSource).toContain('@compute @workgroup_size( 64, 1, 1 )')
    expect(leafSource.match(/textureLoad/g)).toHaveLength(8)
    expect(leafSource).toContain('textureStore')
    expect(reductionSource.match(/textureLoad/g)).toHaveLength(4)
    expect(reductionSource).toContain('textureStore')
    expect(`${leafSource}\n${reductionSource}`).not.toContain('atomic')

    await validateShaderSources([
      ...hierarchyPrograms.flatMap((program, index) => shaderSources(program, `dda-workgroup-hierarchy-${index}`)),
    ])

    hierarchy.dispose()
    occlusion.dispose()
    emission.dispose()
  })
})
