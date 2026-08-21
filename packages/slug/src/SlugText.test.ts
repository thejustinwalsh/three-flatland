import { describe, expect, it } from 'vitest'
import { SlugText } from './SlugText'

describe('SlugText', () => {
  it('preserves its fluent disposal contract across repeated cleanup', () => {
    const text = new SlugText()

    expect(text.dispose().dispose()).toBe(text)
  })
})
