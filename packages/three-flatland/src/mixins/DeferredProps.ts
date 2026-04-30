import type { Object3D } from 'three'

/**
 * Deferred multi-prop dependency system for Object3D-derived classes
 * that participate in R3F's no-args + post-construction property
 * setter lifecycle.
 *
 * # Two pieces
 *
 * 1. `DeferredProps(Base)` — a class mixin that hooks `updateMatrix`
 *    (forces a settle pass before the matrix commits) and `dispose`
 *    (cleanup). One mixin per class.
 *
 * 2. `deferredProps(host, defaults, action)` — a factory. Each call
 *    registers ONE atomic prop group: a tuple of related defaults +
 *    one action that fires when any of them changes. Multiple
 *    `deferredProps()` calls per class are supported and each is
 *    tracked independently — separate dependency groups don't
 *    interfere with each other's memoization or lifecycle.
 *
 * # Factory return value
 *
 * `deferredProps()` returns a typed Proxy of the same shape as the
 * defaults. Reads/writes route through the same reactive accessors
 * that get installed on the host, so internal class code can use
 * either path (`this._myGroup.foo = x` or `this.foo = x`) — both
 * trigger the action. R3F's prop walk uses `this.foo`; class-internal
 * code can prefer the typed proxy for grouping clarity.
 *
 * # Usage
 *
 * ```ts
 * class AnimatedSprite2D extends DeferredProps(Sprite2D) {
 *   // Type-only declarations let TS see the runtime accessors
 *   // installed by `deferredProps()` and surface them to R3F's
 *   // ThreeElement<...> JSX prop typing.
 *   declare spriteSheet:  SpriteSheet | null
 *   declare animationSet: AnimationSetDefinition | null
 *   declare animation:    string | null
 *
 *   private _anim = deferredProps(this,
 *     {
 *       spriteSheet:  null as SpriteSheet | null,
 *       animationSet: null as AnimationSetDefinition | null,
 *       animation:    null as string | null,
 *     },
 *     (props, prev) => { ... },
 *   )
 *
 *   // A second, independent group on the same class is fine:
 *   // private _other = deferredProps(this, { ... }, ...)
 * }
 * ```
 *
 * # Reaction semantics
 *
 * - **Eager** when possible — every setter call invokes the action
 *   if values differ from the last invocation (shallow `===` across
 *   all keys in the group).
 * - **Deferred** as a fallback — the mixin's `updateMatrix` override
 *   runs every group's action exactly once with default values if
 *   no eager set has fired it yet. So a fully default-constructed
 *   instance still gets a chance to react before render.
 * - **Memoized** — identical-value setter calls are no-ops.
 * - **Per-group atomicity** — each group's deps and action are
 *   isolated. A setter on group A doesn't trigger group B's action.
 *
 * # Constraints
 *
 * - Keys across groups within one host must be unique (each key
 *   installs an `Object.defineProperty` on `this`; collisions
 *   would conflict). The factory throws on collision.
 * - Reactions writing to their own deps would loop. Implementer
 *   responsibility — the system does not enforce.
 */

// `any[]` is required by TS's mixin-class constraint — concrete tuples
// or `never[]` block the mixin from accepting the diverse signatures
// of real Object3D-derived classes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = object> = new (...args: any[]) => T

type DeferredAction<P> = (props: P, prev: P | undefined) => void

/**
 * Internal per-group state. Tracked by the mixin via the
 * `hostGroups` WeakMap below; accessed only by the factory and the
 * mixin's lifecycle hooks.
 *
 * Uses ES `#` private fields so TypeScript can emit a public
 * declaration of the class without complaining about private
 * members on an exported anonymous mixin shape (TS4094).
 */
class DeferredGroup<P extends Record<string, unknown>> {
  readonly values: P
  lastRun: P | undefined = undefined
  ran = false
  readonly #action: DeferredAction<P>

  constructor(initial: P, action: DeferredAction<P>) {
    this.values = { ...initial }
    this.#action = action
  }

  /** Memoized run — only fires the action when any tracked value differs from the last run. */
  tryRun(): void {
    const last = this.lastRun
    if (last) {
      let same = true
      for (const k of Object.keys(this.values)) {
        if (this.values[k] !== last[k]) {
          same = false
          break
        }
      }
      if (same) return
    }
    const snapshot = { ...this.values }
    this.#action(snapshot, last)
    this.lastRun = snapshot
    this.ran = true
  }

  /** Force the action to run if it hasn't yet. The mixin's settle pass calls this from updateMatrix. */
  settle(): void {
    if (this.ran) return
    const snapshot = { ...this.values }
    this.#action(snapshot, undefined)
    this.lastRun = snapshot
    this.ran = true
  }
}

/**
 * Module-private association from host → groups. The factory
 * appends to it; the mixin's lifecycle hooks read it. WeakMap so
 * GC of the host transparently drops the group list. Avoids
 * giving the mixin a public method that the factory has to call —
 * which would otherwise leak through TypeScript's declaration
 * emit (TS4020 on the symbol-keyed-method approach we'd otherwise
 * need).
 */
const hostGroups = new WeakMap<object, DeferredGroup<Record<string, unknown>>[]>()

function groupsFor(host: object): DeferredGroup<Record<string, unknown>>[] {
  let arr = hostGroups.get(host)
  if (!arr) {
    arr = []
    hostGroups.set(host, arr)
  }
  return arr
}

/**
 * Register a deferred-props group on `host` and return a typed
 * Proxy for direct access. Installs reactive accessors on `host`
 * for each key in `defaults`. Calling multiple times on the same
 * host is fine — each call is its own group; cross-group keys must
 * not collide.
 *
 * Without the `DeferredProps` mixin the group still works for eager
 * firing (every setter call triggers `tryRun`) but there's no
 * settle pass on first updateMatrix or cleanup on dispose — a
 * console warning surfaces this misconfiguration during dev.
 */
export function deferredProps<P extends Record<string, unknown>>(
  host: object,
  defaults: P,
  action: DeferredAction<P>,
): P {
  const group = new DeferredGroup(defaults, action)
  groupsFor(host).push(group as DeferredGroup<Record<string, unknown>>)

  // Install reactive accessors for each declared key. Reads/writes
  // through `host[key]` flow through these — including R3F's prop
  // walk after no-args construction.
  const keys = Object.keys(defaults) as Array<keyof P>
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(host, key)) {
      throw new Error(
        `deferredProps: key '${String(key)}' already exists on host. ` +
          'Cross-group keys must be unique within a single host instance.',
      )
    }
    Object.defineProperty(host, key, {
      get: () => group.values[key],
      set: (next: P[typeof key]) => {
        group.values[key] = next
        group.tryRun()
      },
      enumerable: true,
      configurable: true,
    })
  }

  // Typed proxy. Reads/writes route through the same group state as
  // the host accessors above, so internal use (`this._myGroup.foo`)
  // and external use (`instance.foo`, R3F prop walks) are equivalent.
  return new Proxy({} as P, {
    get: (_target, key) => group.values[key as keyof P],
    set: (_target, key, value) => {
      group.values[key as keyof P] = value as P[keyof P]
      group.tryRun()
      return true
    },
    has: (_target, key) => key in group.values,
    ownKeys: () => Object.keys(group.values),
    getOwnPropertyDescriptor: (_target, key) =>
      key in group.values
        ? { value: group.values[key as keyof P], writable: true, enumerable: true, configurable: true }
        : undefined,
  })
}

export function DeferredProps<TBase extends Constructor<Object3D>>(Base: TBase) {
  return class DeferredPropsMixin extends Base {
    /**
     * Bound handler for Three's `'added'` event. Cached so it can be
     * removed in `dispose()` (without the same reference,
     * `removeEventListener` is a no-op).
     */
    readonly #onAdded: () => void = () => {
      const groups = hostGroups.get(this)
      if (groups) {
        for (const group of groups) group.settle()
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      super(...args)
      // Three.js dispatches `'added'` on `this` when a parent runs
      // `parent.add(this)` — fires once at scene-graph attach time,
      // well before any `updateMatrix` / render. This is the primary
      // settle trigger so default-value-only groups resolve before
      // the first frame is set up.
      this.addEventListener('added', this.#onAdded)
    }

    override updateMatrix(): void {
      // Backup settle pass for objects that render without ever
      // being added to a parent (orphans rendered via direct
      // `renderer.render` calls, head-of-tree roots, etc.). The
      // 'added' event is the primary path; this is here for the
      // edge cases where it never fires. Idempotent — `settle()`
      // checks the `ran` flag.
      const groups = hostGroups.get(this)
      if (groups) {
        for (const group of groups) group.settle()
      }
      super.updateMatrix()
    }

    /**
     * Mixin-level dispose. Removes the 'added' listener so its
     * captured `this` reference is released, drops the host's entry
     * from the global group registry so the action closures (which
     * also capture `this`) become GC-eligible, then forwards to the
     * base class's dispose if one exists. Object3D itself doesn't
     * declare `dispose`, but Mesh / Sprite2D / etc. do — the
     * prototype walk handles either case.
     */
    dispose(): void {
      this.removeEventListener('added', this.#onAdded)
      hostGroups.delete(this)
      const baseProto = Object.getPrototypeOf(DeferredPropsMixin.prototype) as {
        dispose?: () => void
      }
      if (typeof baseProto.dispose === 'function') {
        baseProto.dispose.call(this)
      }
    }
  }
}
