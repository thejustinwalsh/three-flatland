import { describe, it, expect } from 'vitest'
import { createPane } from './create-pane'

describe('createPane', () => {
  it('returns a bundle with just a pane', () => {
    const bundle = createPane({ title: 'TestPane', expanded: false })
    expect(bundle).toBeDefined()
    expect(bundle.pane).toBeDefined()
    expect(bundle.pane.element).toBeInstanceOf(HTMLElement)
    // The public API is deliberately minimal — no stats handle, no
    // scene wiring, no debug toggle. Stats graph + row are auto-mounted
    // internally and driven by the bus.
    expect('stats' in bundle).toBe(false)
    bundle.pane.dispose()
  })

  it('mounts the pane element into the DOM', () => {
    const bundle = createPane()
    expect(document.body.contains(bundle.pane.element)).toBe(true)
    bundle.pane.dispose()
  })
})
