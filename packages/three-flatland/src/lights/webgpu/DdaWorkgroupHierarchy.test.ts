import { NearestFilter } from 'three'
import { createShaderTexture } from '@three-flatland/tsl-test'
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
})
