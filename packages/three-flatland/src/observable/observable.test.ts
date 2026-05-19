import { describe, it, expect, vi } from 'vitest'
import { Color, Vector2, Vector3, Euler } from 'three'
import { observable, shallowEqual } from './index'

// ============================================
// COLOR
// ============================================

describe('observable.color', () => {
  it('fires notify on .r/.g/.b property assignment', () => {
    const c = new Color(1, 1, 1)
    const notify = vi.fn()
    observable.color.attach(c, notify)

    c.r = 0.5
    expect(notify).toHaveBeenCalledTimes(1)
    c.g = 0.25
    expect(notify).toHaveBeenCalledTimes(2)
    c.b = 0.0
    expect(notify).toHaveBeenCalledTimes(3)
  })

  it('preserves Color value semantics through accessors', () => {
    const c = new Color(0.25, 0.5, 0.75)
    observable.color.attach(c, () => {})
    expect(c.r).toBe(0.25)
    expect(c.g).toBe(0.5)
    expect(c.b).toBe(0.75)
  })

  it('fires notify through .setRGB (which writes via property setters)', () => {
    const c = new Color()
    const notify = vi.fn()
    observable.color.attach(c, notify)
    c.setRGB(0.1, 0.2, 0.3)
    // setRGB writes r, g, b individually → 3 notify fires
    expect(notify).toHaveBeenCalledTimes(3)
    expect(c.r).toBeCloseTo(0.1)
    expect(c.g).toBeCloseTo(0.2)
    expect(c.b).toBeCloseTo(0.3)
  })

  it('fires notify through .copy()', () => {
    const c = new Color()
    const notify = vi.fn()
    observable.color.attach(c, notify)
    c.copy(new Color(0.5, 0.5, 0.5))
    expect(notify).toHaveBeenCalled()
  })

  it('snapshot captures r, g, b as a flat record', () => {
    const c = new Color(0.1, 0.2, 0.3)
    observable.color.attach(c, () => {})
    const snap = observable.color.snapshot(c)
    expect(snap).toEqual({ r: 0.1, g: 0.2, b: 0.3 })
  })

  it('snapshot works on Color that has not been attached yet', () => {
    // Strategy must not require pre-attachment for snapshot.
    const c = new Color(0.4, 0.5, 0.6)
    const snap = observable.color.snapshot(c)
    expect(snap).toEqual({ r: 0.4, g: 0.5, b: 0.6 })
  })

  it('re-attach updates the notify callback (idempotent)', () => {
    const c = new Color()
    const n1 = vi.fn()
    const n2 = vi.fn()
    observable.color.attach(c, n1)
    c.r = 0.1
    expect(n1).toHaveBeenCalledTimes(1)
    // Re-attach with a new callback
    observable.color.attach(c, n2)
    c.r = 0.2
    expect(n1).toHaveBeenCalledTimes(1) // unchanged
    expect(n2).toHaveBeenCalledTimes(1)
  })

  it('backing fields are installed as non-enumerable own properties', () => {
    const c = new Color(0.1, 0.2, 0.3)
    observable.color.attach(c, () => {})
    const keys = Object.keys(c)
    // r/g/b accessors stay enumerable so consumers iterating Color see them
    expect(keys).toContain('r')
    expect(keys).toContain('g')
    expect(keys).toContain('b')
    // Backing fields + callback hide from enumeration
    expect(keys).not.toContain('_or')
    expect(keys).not.toContain('_og')
    expect(keys).not.toContain('_ob')
    expect(keys).not.toContain('_cb')
    // But the backing fields still exist (in-operator catches non-enumerable own props)
    expect('_or' in c).toBe(true)
    expect('_cb' in c).toBe(true)
  })
})

// ============================================
// VECTOR2
// ============================================

describe('observable.vector2', () => {
  it('fires notify on .x / .y property assignment', () => {
    const v = new Vector2(0, 0)
    const notify = vi.fn()
    observable.vector2.attach(v, notify)
    v.x = 5
    expect(notify).toHaveBeenCalledTimes(1)
    v.y = 10
    expect(notify).toHaveBeenCalledTimes(2)
    expect(v.x).toBe(5)
    expect(v.y).toBe(10)
  })

  it('fires notify through .set(x, y)', () => {
    const v = new Vector2(0, 0)
    const notify = vi.fn()
    observable.vector2.attach(v, notify)
    v.set(3, 4)
    // .set writes x then y via property setters → 2 notify fires
    expect(notify).toHaveBeenCalledTimes(2)
    expect(v.x).toBe(3)
    expect(v.y).toBe(4)
  })

  it('snapshot returns { x, y }', () => {
    const v = new Vector2(7, 9)
    observable.vector2.attach(v, () => {})
    expect(observable.vector2.snapshot(v)).toEqual({ x: 7, y: 9 })
  })
})

// ============================================
// VECTOR3
// ============================================

describe('observable.vector3', () => {
  it('fires notify on .x / .y / .z property assignment', () => {
    const v = new Vector3(0, 0, 0)
    const notify = vi.fn()
    observable.vector3.attach(v, notify)
    v.x = 1
    v.y = 2
    v.z = 3
    expect(notify).toHaveBeenCalledTimes(3)
    expect(v.x).toBe(1)
    expect(v.y).toBe(2)
    expect(v.z).toBe(3)
  })

  it('fires notify through .set(x, y, z)', () => {
    const v = new Vector3()
    const notify = vi.fn()
    observable.vector3.attach(v, notify)
    v.set(1, 2, 3)
    expect(notify).toHaveBeenCalledTimes(3)
  })

  it('snapshot returns { x, y, z }', () => {
    const v = new Vector3(1, 2, 3)
    observable.vector3.attach(v, () => {})
    expect(observable.vector3.snapshot(v)).toEqual({ x: 1, y: 2, z: 3 })
  })
})

// ============================================
// EULER (hooks into existing _onChangeCallback)
// ============================================

describe('observable.euler', () => {
  it('fires notify on .x / .y / .z assignment', () => {
    const e = new Euler(0, 0, 0)
    const notify = vi.fn()
    observable.euler.attach(e, notify)
    e.x = 0.5
    e.y = 0.25
    e.z = 0.125
    expect(notify).toHaveBeenCalledTimes(3)
  })

  it('fires notify ONCE through .set(x, y, z, order) — three.js batches the callback', () => {
    // Unlike Color/Vector2/Vector3, Euler.set writes private fields
    // directly and fires the callback exactly once at the end. We
    // inherit this batching for free by hooking _onChangeCallback.
    const e = new Euler()
    const notify = vi.fn()
    observable.euler.attach(e, notify)
    e.set(0.1, 0.2, 0.3, 'YXZ')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(e.x).toBeCloseTo(0.1)
    expect(e.y).toBeCloseTo(0.2)
    expect(e.z).toBeCloseTo(0.3)
    expect(e.order).toBe('YXZ')
  })

  it('snapshot captures x, y, z, order', () => {
    const e = new Euler(0.5, 0.25, 0.125, 'XYZ')
    observable.euler.attach(e, () => {})
    expect(observable.euler.snapshot(e)).toEqual({
      x: 0.5,
      y: 0.25,
      z: 0.125,
      order: 'XYZ',
    })
  })
})

// ============================================
// shallowEqual
// ============================================

describe('shallowEqual', () => {
  it('returns true for the same reference', () => {
    const a = { x: 1, y: 2 }
    expect(shallowEqual(a, a)).toBe(true)
  })

  it('returns true for equal flat records', () => {
    expect(shallowEqual({ r: 1, g: 0, b: 0 }, { r: 1, g: 0, b: 0 })).toBe(true)
  })

  it('returns false when any field differs', () => {
    expect(shallowEqual({ r: 1, g: 0, b: 0 }, { r: 1, g: 0.5, b: 0 })).toBe(false)
  })

  it('returns false when key sets differ', () => {
    expect(shallowEqual({ x: 1 }, { x: 1, y: 2 })).toBe(false)
  })

  it('uses === comparison (NaN !== NaN)', () => {
    expect(shallowEqual({ x: NaN }, { x: NaN })).toBe(false)
  })
})
