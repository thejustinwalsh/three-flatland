import type { Object3D } from 'three'

interface ObservedHierarchyState {
  readonly matrix: Float64Array
  parent: Object3D | null
  visible: boolean
  frame: number
  changed: boolean
}

interface BatchVisibilitySource extends Object3D {
  _batchVisibilityState?(): boolean
  _isAuthoredVisible?(): boolean
  _batchHierarchyState?: SourceHierarchyState
}

interface SourceHierarchyState extends ObservedHierarchyState {
  owner: HierarchyStateTracker
}

/** Compare shared Object3D paths once per frame and report affected sources. */
export class HierarchyStateTracker {
  private readonly _observed = new WeakMap<Object3D, ObservedHierarchyState>()
  private _frame = 0

  beginFrame(): void {
    this._frame++
  }

  /**
   * Check a source path up to (but excluding) its draw boundary. A parent
   * override models directly-enrolled sprites without reparenting the source.
   */
  pathChanged(
    source: Object3D,
    boundary: Object3D | null,
    parentOverride?: Object3D | null,
    sourceVisible?: boolean,
    sourceIsSprite = true
  ): boolean {
    let changed = this._objectChanged(source, sourceIsSprite, sourceVisible)
    let object = parentOverride === undefined ? source.parent : parentOverride
    while (object && object !== boundary) {
      if (this._objectChanged(object)) changed = true
      object = object.parent
    }
    return changed
  }

  private _objectChanged(object: Object3D, spriteSource = false, visibilityOverride?: boolean): boolean {
    const candidate = object as BatchVisibilitySource
    const sourceState = spriteSource ? candidate._batchHierarchyState : undefined
    const existing = sourceState?.owner === this ? sourceState : this._observed.get(object)
    if (existing?.frame === this._frame) return existing.changed

    const elements = object.matrix.elements
    const visible =
      visibilityOverride ??
      (spriteSource ? candidate._batchVisibilityState?.() : candidate._isAuthoredVisible?.()) ??
      object.visible
    if (!existing) {
      const state: SourceHierarchyState = {
        matrix: new Float64Array(elements),
        parent: object.parent,
        visible,
        frame: this._frame,
        changed: true,
        owner: this,
      }
      if (spriteSource) candidate._batchHierarchyState = state
      else this._observed.set(object, state)
      return true
    }

    let changed = existing.parent !== object.parent || existing.visible !== visible
    if (spriteSource) {
      // Sprite2D.updateMatrix() is a fixed 2D affine. Comparing its seven
      // authored entries avoids scanning nine constants for every sprite.
      if (
        existing.matrix[0] !== elements[0] ||
        existing.matrix[1] !== elements[1] ||
        existing.matrix[4] !== elements[4] ||
        existing.matrix[5] !== elements[5] ||
        existing.matrix[12] !== elements[12] ||
        existing.matrix[13] !== elements[13] ||
        existing.matrix[14] !== elements[14]
      ) {
        existing.matrix[0] = elements[0]!
        existing.matrix[1] = elements[1]!
        existing.matrix[4] = elements[4]!
        existing.matrix[5] = elements[5]!
        existing.matrix[12] = elements[12]!
        existing.matrix[13] = elements[13]!
        existing.matrix[14] = elements[14]!
        changed = true
      }
    } else {
      for (let i = 0; i < 16; i++) {
        if (existing.matrix[i] === elements[i]) continue
        existing.matrix[i] = elements[i]!
        changed = true
      }
    }
    existing.parent = object.parent
    existing.visible = visible
    existing.frame = this._frame
    existing.changed = changed
    return changed
  }
}
