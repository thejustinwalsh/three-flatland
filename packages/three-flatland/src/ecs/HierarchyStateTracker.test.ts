import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { HierarchyStateTracker } from './HierarchyStateTracker'

describe('HierarchyStateTracker', () => {
  it('compares every matrix entry for a generic draw root', () => {
    const tracker = new HierarchyStateTracker()
    const root = new Group()
    root.updateMatrix()

    tracker.beginFrame()
    expect(tracker.pathChanged(root, null, undefined, undefined, false)).toBe(true)
    tracker.beginFrame()
    expect(tracker.pathChanged(root, null, undefined, undefined, false)).toBe(false)

    root.scale.z = 2
    root.updateMatrix()
    tracker.beginFrame()
    expect(tracker.pathChanged(root, null, undefined, undefined, false)).toBe(true)
  })
})
