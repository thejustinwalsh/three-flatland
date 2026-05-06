import { describe, it, expect, beforeEach, vi } from 'vitest'
import { devtimeWarn, _resetDevtimeWarnings } from './devtimeWarn.js'

describe('devtimeWarn', () => {
  beforeEach(() => {
    _resetDevtimeWarnings()
    vi.restoreAllMocks()
  })

  it('warns once per (category, url) pair', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    devtimeWarn('normal', '/a.png', 'no baked sibling')
    devtimeWarn('normal', '/a.png', 'no baked sibling')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('fires again for a different url in the same category', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    devtimeWarn('normal', '/a.png', 'no baked sibling')
    devtimeWarn('normal', '/b.png', 'no baked sibling')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('fires again for the same url in a different category', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    devtimeWarn('normal', '/a.png', 'x')
    devtimeWarn('font', '/a.png', 'y')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('is silent under NODE_ENV=production', () => {
    const original = process.env['NODE_ENV']
    process.env['NODE_ENV'] = 'production'
    try {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      devtimeWarn('normal', '/a.png', 'x')
      expect(spy).not.toHaveBeenCalled()
    } finally {
      process.env['NODE_ENV'] = original
    }
  })

  it('prefixes the category in the emitted message', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    devtimeWarn('normal', '/a.png', 'no baked sibling')
    expect(spy).toHaveBeenCalledWith('[normal] no baked sibling')
  })
})
