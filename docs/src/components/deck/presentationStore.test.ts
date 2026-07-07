import { describe, it, expect, vi } from 'vitest'
import { getPosition, setPosition, subscribe } from './presentationStore'

describe('presentationStore', () => {
  it('starts at slide 0 fragment 0', () => {
    expect(getPosition()).toEqual({ slideIndex: 0, fragment: 0 })
  })

  it('notifies subscribers on change and reflects new position', () => {
    const listener = vi.fn()
    const unsub = subscribe(listener)
    setPosition({ slideIndex: 3, fragment: 1 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getPosition()).toEqual({ slideIndex: 3, fragment: 1 })
    unsub()
  })

  it('does not notify when the position is unchanged', () => {
    setPosition({ slideIndex: 5, fragment: 0 })
    const listener = vi.fn()
    const unsub = subscribe(listener)
    setPosition({ slideIndex: 5, fragment: 0 })
    expect(listener).not.toHaveBeenCalled()
    unsub()
  })
})
