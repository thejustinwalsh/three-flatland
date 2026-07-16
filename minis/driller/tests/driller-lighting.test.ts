import { describe, expect, it } from 'vitest'
import {
  MAX_GEM_LIGHTS,
  selectVisibleLights,
  surfaceSunIntensity,
} from '../src/lib/driller-lighting'

describe('selectVisibleLights', () => {
  it('culls outside the padded camera bounds', () => {
    const selected = selectVisibleLights(
      [
        { x: 4, y: 4 },
        { x: 12, y: 12 },
        { x: 20, y: 20 },
      ],
      { left: 0, right: 16, top: 0, bottom: 16 },
      { x: 8, y: 8 },
      8
    )
    expect(selected).toEqual([
      { x: 4, y: 4 },
      { x: 12, y: 12 },
    ])
  })

  it('enforces the 64-light cap and prefers gems nearest the driller', () => {
    const candidates = Array.from({ length: 100 }, (_, index) => ({ x: index, y: 0 }))
    const selected = selectVisibleLights(
      candidates,
      { left: 0, right: 100, top: -1, bottom: 1 },
      { x: 50, y: 0 },
      MAX_GEM_LIGHTS
    )
    expect(selected).toHaveLength(64)
    expect(selected[0]).toEqual({ x: 50, y: 0 })
    expect(selected.every((candidate) => Math.abs(candidate.x - 50) <= 32)).toBe(true)
  })
})

describe('surfaceSunIntensity', () => {
  it('fades from full daylight to zero over four camera rows', () => {
    expect(surfaceSunIntensity(0)).toBe(1)
    expect(surfaceSunIntensity(2)).toBe(0.5)
    expect(surfaceSunIntensity(4)).toBe(0)
    expect(surfaceSunIntensity(20)).toBe(0)
  })
})
