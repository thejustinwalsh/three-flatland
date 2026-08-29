import { compileMaterial, createShaderTexture } from '@three-flatland/tsl-test'
import type { NodeMaterial } from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { DdaHierarchy, getDdaCascadeHierarchyLevel, getDdaHierarchyDimensions, getDdaLeafBit } from './DdaHierarchy'

describe('DdaHierarchy', () => {
  it('packs 2x2 children in row-major bit order', () => {
    expect([getDdaLeafBit(0, 0), getDdaLeafBit(1, 0), getDdaLeafBit(0, 1), getDdaLeafBit(1, 1)]).toEqual([1, 2, 4, 8])
  })

  it('covers odd source edges conservatively at every level', () => {
    expect(getDdaHierarchyDimensions(7, 5, 3)).toEqual([
      { width: 4, height: 3, scale: 2 },
      { width: 2, height: 2, scale: 4 },
      { width: 1, height: 1, scale: 8 },
    ])
  })

  it('only enables hierarchy levels whose probe cascade can use them', () => {
    expect([0, 1, 2, 3].map((cascade) => getDdaCascadeHierarchyLevel(cascade, 2, 2))).toEqual([0, 1, 2, 2])
    expect(getDdaCascadeHierarchyLevel(3, 4, 2)).toBe(2)
    expect(getDdaCascadeHierarchyLevel(3, 0, 2)).toBe(0)
  })

  it('keeps occupancy, emitter, and emission reduction flags independent in WGSL', () => {
    const occlusion = createShaderTexture()
    const emission = createShaderTexture()
    const hierarchy = new DdaHierarchy()
    hierarchy.configure(occlusion, emission, 8, 8, 2)
    const levels = (hierarchy as unknown as { _levels: Array<{ material: NodeMaterial }> })._levels
    const leafProgram = compileMaterial(levels[0]!.material, 'wgsl')
    const reductionProgram = compileMaterial(levels[1]!.material, 'wgsl')

    expect(leafProgram.diagnostics).toEqual([])
    expect(reductionProgram.diagnostics).toEqual([])
    expect(reductionProgram.fragmentShader).not.toContain('all(')
    expect(reductionProgram.fragmentShader?.match(/> 0\.00196078431372549/g)).toHaveLength(3)

    hierarchy.dispose()
    occlusion.dispose()
    emission.dispose()
  })
})
