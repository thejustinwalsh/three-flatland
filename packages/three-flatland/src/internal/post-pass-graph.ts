import type { PassEffect, PassEffectFn } from '../pipeline/PassEffect'

/**
 * Canonical package-private owner for post-pass topology and its render projection.
 * Object topology stays outside numeric ECS storage; declared effect fields remain SoA.
 */
export class PostPassGraph {
  readonly effects: PassEffect[] = []
  nextOrder = 0

  private _dirty = false
  private readonly _orderedEffects: PassEffect[] = []
  private readonly _functions: PassEffectFn[] = []

  get dirty(): boolean {
    return this._dirty
  }

  markDirty(): void {
    this._dirty = true
  }

  /** Restore a captured dirty state when an owning transaction rolls back. */
  restoreDirty(dirty: boolean): void {
    this._dirty = dirty
  }

  add(effect: PassEffect): void {
    this.effects.push(effect)
    this._dirty = true
  }

  remove(effect: PassEffect): boolean {
    const index = this.effects.indexOf(effect)
    if (index < 0) return false
    this.effects.splice(index, 1)
    this._dirty = true
    return true
  }

  clear(): void {
    this.effects.length = 0
    this.nextOrder = 0
    this._dirty = true
  }

  /**
   * Rebuild the reusable function projection when dirty. The returned array is
   * internal scratch and must be consumed synchronously before another mutation.
   */
  project(): readonly PassEffectFn[] | null {
    if (!this._dirty) return null
    this._dirty = false

    const count = this.effects.length
    this._orderedEffects.length = count
    for (let index = 0; index < count; index++) this._orderedEffects[index] = this.effects[index]!
    this._orderedEffects.sort(comparePassOrder)

    this._functions.length = 0
    for (const effect of this._orderedEffects) {
      const fn = effect._passFn
      if (effect.enabled && fn) this._functions.push(fn)
    }
    return this._functions
  }

  /** Release retained object references at the terminal ownership boundary. */
  dispose(): void {
    this.effects.length = 0
    this._orderedEffects.length = 0
    this._functions.length = 0
    this.nextOrder = 0
    this._dirty = false
  }
}

function comparePassOrder(left: PassEffect, right: PassEffect): number {
  return left._order - right._order
}
