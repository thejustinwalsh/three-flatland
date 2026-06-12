import { describe, it, expect, vi } from 'vitest'
import { resolveHitTestMode, ALL_HIT_TEST_MODES } from './HitTestMode'

describe('HitTestMode', () => {
  it('exposes all four modes', () => {
    expect(ALL_HIT_TEST_MODES).toEqual(['radius', 'bounds', 'alpha', 'none'])
  })

  it('returns the requested mode when supported', () => {
    expect(resolveHitTestMode('alpha', ['radius', 'bounds', 'alpha', 'none'], 'Sprite2D')).toBe(
      'alpha'
    )
  })

  it('falls back to bounds first, then radius, then first supported', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveHitTestMode('alpha', ['bounds', 'none'], 'TileMap2D')).toBe('bounds')
    expect(resolveHitTestMode('alpha', ['radius', 'none'], 'X')).toBe('radius')
    expect(resolveHitTestMode('alpha', ['none'], 'X')).toBe('none')
    expect(warn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })
})
