import { NearestFilter } from 'three'
import { compileComputeNode, createShaderTexture } from '@three-flatland/tsl-test'
import { describe, expect, it } from 'vitest'
import { DDA_WORKGROUP_2D_SIZE, DdaWorkgroupHierarchy } from './DdaWorkgroupHierarchy'

describe('DdaWorkgroupHierarchy lifecycle', () => {
  it('preserves odd source edges and avoids redundant rebuilds', () => {
    const occlusion = createShaderTexture()
    const emission = createShaderTexture()
    const hierarchy = new DdaWorkgroupHierarchy()

    expect(hierarchy.configure(occlusion, emission, 7, 5, 3)).toBe(true)
    expect(hierarchy.levels.map(({ width, height, scale }) => ({ width, height, scale }))).toEqual([
      { width: 4, height: 3, scale: 2 },
      { width: 2, height: 2, scale: 4 },
      { width: 1, height: 1, scale: 8 },
    ])
    expect(hierarchy.levels.every((level) => level.texture.minFilter === NearestFilter)).toBe(true)
    expect(hierarchy.computeNodes.every((node) => node.workgroupSize[0] === DDA_WORKGROUP_2D_SIZE ** 2)).toBe(true)
    expect(hierarchy.configure(occlusion, emission, 7, 5, 3)).toBe(false)

    hierarchy.dispose()
    expect(hierarchy.levelCount).toBe(0)
    occlusion.dispose()
    emission.dispose()
  })

  it('keeps occupancy, emitter, and emission reduction flags independent in generated WGSL', () => {
    const occlusion = createShaderTexture()
    const emission = createShaderTexture()
    const hierarchy = new DdaWorkgroupHierarchy()
    hierarchy.configure(occlusion, emission, 8, 8, 2)

    const leafProgram = compileComputeNode(hierarchy.computeNodes[0]!)
    const reductionProgram = compileComputeNode(hierarchy.computeNodes[1]!)
    expect(leafProgram.diagnostics).toEqual([])
    expect(reductionProgram.diagnostics).toEqual([])
    expect(reductionProgram.computeShader).not.toContain('all(')
    expect(reductionProgram.computeShader?.match(/> 0\.00196078431372549/g)).toHaveLength(3)

    hierarchy.dispose()
    occlusion.dispose()
    emission.dispose()
  })
})
