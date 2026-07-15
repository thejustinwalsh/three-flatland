import { describe, expect, it } from 'vitest'
import { estimateGpuMemory } from './memory'

describe('estimateGpuMemory', () => {
  it('three-default loader: PNG → RGBA8 = w*h*4', async () => {
    const [r] = await estimateGpuMemory({ width: 256, height: 256, alpha: true, format: 'png' }, 'three-default')
    expect(r).toBeDefined()
    expect(r!.gpuFormat).toBe('RGBA8')
    expect(r!.bytes).toBe(256 * 256 * 4)
    expect(r!.measured).toBeFalsy()
  })

  it('three-ktx loader: KTX2 → BC7 = w*h*1', async () => {
    const [r] = await estimateGpuMemory({ width: 1024, height: 1024, alpha: true, format: 'ktx2' }, 'three-ktx')
    expect(r!.gpuFormat).toBe('BC7')
    expect(r!.bytes).toBe(1024 * 1024)
  })

  it('all loaders returns 3 entries', async () => {
    const r = await estimateGpuMemory({ width: 512, height: 512, alpha: true, format: 'webp' }, 'all')
    expect(r.map((e) => e.loader).sort()).toEqual(['spark', 'three-default', 'three-ktx'])
  })
})
