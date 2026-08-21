import { describe, expect, it } from 'vitest'
import { SlugText } from './SlugText'

describe('SlugText', () => {
  it('preserves its fluent disposal contract', () => {
    const text = new SlugText()

    expect(text.dispose()).toBe(text)
  })
})
