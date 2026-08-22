// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RENDERER_FAILURE_MESSAGE, renderStartupError } from './renderStartupError'

describe('renderStartupError', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main><canvas></canvas><p>loading</p></main>'
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('replaces a failed canvas with visible accessible status text', () => {
    const error = new Error('Neither renderer backend initialized')

    renderStartupError(error)

    expect(document.querySelector('canvas')).toBeNull()
    expect(document.body.children).toHaveLength(1)
    expect(document.body.firstElementChild).toMatchObject({
      textContent: RENDERER_FAILURE_MESSAGE,
    })
    expect(document.body.firstElementChild?.getAttribute('role')).toBe('status')
    expect(console.error).toHaveBeenCalledWith('[three-flatland] Example startup failed', error)
  })
})
