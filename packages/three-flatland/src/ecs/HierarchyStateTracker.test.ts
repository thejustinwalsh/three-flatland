import { Group, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { Sprite2D } from '../sprites/Sprite2D'
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

  it('tracks every authored Sprite2D matrix entry used by the seven-element fast path', () => {
    const trackedEntries = [0, 1, 4, 5, 12, 13, 14]

    for (const index of trackedEntries) {
      const tracker = new HierarchyStateTracker()
      const source = new Sprite2D()
      source.updateMatrix()

      tracker.beginFrame()
      expect(tracker.pathChanged(source, null)).toBe(true)
      tracker.beginFrame()
      expect(tracker.pathChanged(source, null)).toBe(false)

      source.matrix.elements[index]! += 1
      tracker.beginFrame()
      expect(tracker.pathChanged(source, null)).toBe(true)
    }
  })

  it('tracks source visibility, parent changes, and same-frame memoization', () => {
    const tracker = new HierarchyStateTracker()
    const firstParent = new Group()
    const secondParent = new Group()
    const source = new Object3D() as Object3D & { _batchVisibilityState(): boolean }
    let visible = true
    source._batchVisibilityState = () => visible
    firstParent.add(source)
    source.updateMatrix()

    tracker.beginFrame()
    expect(tracker.pathChanged(source, null)).toBe(true)
    expect(tracker.pathChanged(source, null)).toBe(true)

    tracker.beginFrame()
    expect(tracker.pathChanged(source, null)).toBe(false)
    visible = false
    expect(tracker.pathChanged(source, null)).toBe(false)

    tracker.beginFrame()
    expect(tracker.pathChanged(source, null)).toBe(true)

    secondParent.add(source)
    tracker.beginFrame()
    expect(tracker.pathChanged(source, null)).toBe(true)
  })
})
