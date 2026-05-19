/**
 * Observable mutation strategies for three.js value types.
 *
 * The problem: Color, Vector2, Vector3, etc. are mutable. Code like
 * `sprite.tint.r = 0.5` doesn't trigger any reactive system; the
 * reference doesn't change. R3F's reconciler exacerbates this — for
 * a prop like `tint={[1, 0, 0]}` it falls through to per-component
 * assignment, so we need per-property mutation hooks.
 *
 * Three.js's `Euler` already solves this with `_onChangeCallback` —
 * each setter writes `_x/_y/_z` and calls the callback. We extend
 * the same pattern to Color/Vector2/Vector3 by installing accessor
 * descriptors that replace the plain data properties with
 * notify-firing getters/setters.
 *
 * Each strategy provides:
 *   - `attach(value, notify)` — wire the value's mutation surface
 *   - `snapshot(value)` — capture a flat record of its fields for
 *     shallow memoization (reference-`===` doesn't work for in-place
 *     mutation)
 *
 * A strategy is paired with a schema entry via the `WithPropsSync`
 * tuple form: `[coerce, observable.color]`. The registry installs
 * the strategy on each coerced value and supplies a stale-safe
 * `notify` closure.
 *
 * @example
 * ```ts
 * import { observable } from 'three-flatland'
 *
 * WithPropsSync(Mesh, {
 *   tint: [
 *     (v?: Color | string | number | [number, number, number]): Color => {
 *       if (v === undefined) return new Color(0xffffff)
 *       if (Array.isArray(v)) return new Color().setRGB(v[0], v[1], v[2])
 *       if (v instanceof Color) return v.clone()
 *       return new Color().set(v)
 *     },
 *     observable.color,
 *   ],
 * })
 * ```
 */

import type { Color, Euler, Vector2, Vector3 } from 'three'

/** Flat record returned by `snapshot()` for shallow-equal memoization. */
export type Snapshot = Record<string, unknown>

/**
 * Strategy that wires an observable value's mutation surface and
 * captures field snapshots for memoization. Paired with a schema
 * entry in the `WithPropsSync` tuple form.
 */
export type ObservableStrategy<T> = {
  readonly attach: (value: T, notify: () => void) => void
  readonly snapshot: (value: T) => Snapshot
}

/**
 * Shallow-compare two snapshots. Used by the registry to bail out
 * of redundant action fires when an observed value's fields didn't
 * actually change.
 */
export function shallowEqual(a: Snapshot, b: Snapshot): boolean {
  if (a === b) return true
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) {
    if (a[k] !== b[k]) return false
  }
  return true
}

// ============================================
// Internal types (private — escape hatches for descriptor assignment)
// ============================================

interface ObservableColor extends Color {
  _or: number
  _og: number
  _ob: number
  _cb: () => void
}

interface ObservableVector2 extends Vector2 {
  _ox: number
  _oy: number
  _cb: () => void
}

interface ObservableVector3 extends Vector3 {
  _ox: number
  _oy: number
  _oz: number
  _cb: () => void
}

interface ObservableEuler extends Euler {
  _x: number
  _y: number
  _z: number
  _order: string
  _onChangeCallback: () => void
}

// ============================================
// Shared descriptors — module-level so per-instance attachment
// allocates zero closures.
// ============================================

const colorDesc: PropertyDescriptorMap = {
  r: {
    get(this: ObservableColor) { return this._or },
    set(this: ObservableColor, v: number) { this._or = v; this._cb() },
    configurable: true, enumerable: true,
  },
  g: {
    get(this: ObservableColor) { return this._og },
    set(this: ObservableColor, v: number) { this._og = v; this._cb() },
    configurable: true, enumerable: true,
  },
  b: {
    get(this: ObservableColor) { return this._ob },
    set(this: ObservableColor, v: number) { this._ob = v; this._cb() },
    configurable: true, enumerable: true,
  },
}

const vector2Desc: PropertyDescriptorMap = {
  x: {
    get(this: ObservableVector2) { return this._ox },
    set(this: ObservableVector2, v: number) { this._ox = v; this._cb() },
    configurable: true, enumerable: true,
  },
  y: {
    get(this: ObservableVector2) { return this._oy },
    set(this: ObservableVector2, v: number) { this._oy = v; this._cb() },
    configurable: true, enumerable: true,
  },
}

const vector3Desc: PropertyDescriptorMap = {
  x: {
    get(this: ObservableVector3) { return this._ox },
    set(this: ObservableVector3, v: number) { this._ox = v; this._cb() },
    configurable: true, enumerable: true,
  },
  y: {
    get(this: ObservableVector3) { return this._oy },
    set(this: ObservableVector3, v: number) { this._oy = v; this._cb() },
    configurable: true, enumerable: true,
  },
  z: {
    get(this: ObservableVector3) { return this._oz },
    set(this: ObservableVector3, v: number) { this._oz = v; this._cb() },
    configurable: true, enumerable: true,
  },
}

// ============================================
// Attach implementations
// ============================================

function attachColor(c: Color, notify: () => void): void {
  const o = c as ObservableColor
  if ('_cb' in o) {
    // Already observed — just update the callback. Idempotent re-attach.
    o._cb = notify
    return
  }
  // First attach: install non-enumerable backing fields, then install
  // accessor descriptors. JSON.stringify(color) still emits just r/g/b.
  Object.defineProperties(c, {
    _or: { value: c.r, writable: true, enumerable: false, configurable: true },
    _og: { value: c.g, writable: true, enumerable: false, configurable: true },
    _ob: { value: c.b, writable: true, enumerable: false, configurable: true },
    _cb: { value: notify, writable: true, enumerable: false, configurable: true },
    ...colorDesc,
  })
}

function snapshotColor(c: Color): Snapshot {
  // Read via the accessors (or the original data props if not attached
  // yet — both paths return the same value).
  return { r: c.r, g: c.g, b: c.b }
}

function attachVector2(v: Vector2, notify: () => void): void {
  const o = v as ObservableVector2
  if ('_cb' in o) {
    o._cb = notify
    return
  }
  Object.defineProperties(v, {
    _ox: { value: v.x, writable: true, enumerable: false, configurable: true },
    _oy: { value: v.y, writable: true, enumerable: false, configurable: true },
    _cb: { value: notify, writable: true, enumerable: false, configurable: true },
    ...vector2Desc,
  })
}

function snapshotVector2(v: Vector2): Snapshot {
  return { x: v.x, y: v.y }
}

function attachVector3(v: Vector3, notify: () => void): void {
  const o = v as ObservableVector3
  if ('_cb' in o) {
    o._cb = notify
    return
  }
  Object.defineProperties(v, {
    _ox: { value: v.x, writable: true, enumerable: false, configurable: true },
    _oy: { value: v.y, writable: true, enumerable: false, configurable: true },
    _oz: { value: v.z, writable: true, enumerable: false, configurable: true },
    _cb: { value: notify, writable: true, enumerable: false, configurable: true },
    ...vector3Desc,
  })
}

function snapshotVector3(v: Vector3): Snapshot {
  return { x: v.x, y: v.y, z: v.z }
}

function attachEuler(e: Euler, notify: () => void): void {
  // Euler already has the pattern built in via `_onChangeCallback`.
  // No descriptor surgery needed — just replace the callback.
  ;(e as ObservableEuler)._onChangeCallback = notify
}

function snapshotEuler(e: Euler): Snapshot {
  const oe = e as ObservableEuler
  return { x: oe._x, y: oe._y, z: oe._z, order: oe._order }
}

// ============================================
// Public strategy registry
// ============================================

/**
 * Observable strategies for three.js value types. Each strategy is
 * the second element of a `WithPropsSync` tuple-form schema entry.
 *
 * - `observable.color` — Color (r, g, b)
 * - `observable.vector2` — Vector2 (x, y)
 * - `observable.vector3` — Vector3 (x, y, z)
 * - `observable.euler` — Euler (x, y, z, order) — hooks into three's
 *   existing `_onChangeCallback` rather than installing accessors
 */
export const observable = {
  color: { attach: attachColor, snapshot: snapshotColor } satisfies ObservableStrategy<Color>,
  vector2: { attach: attachVector2, snapshot: snapshotVector2 } satisfies ObservableStrategy<Vector2>,
  vector3: { attach: attachVector3, snapshot: snapshotVector3 } satisfies ObservableStrategy<Vector3>,
  euler: { attach: attachEuler, snapshot: snapshotEuler } satisfies ObservableStrategy<Euler>,
} as const
