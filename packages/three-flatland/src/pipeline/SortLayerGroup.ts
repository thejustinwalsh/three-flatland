import { Group, type Object3D } from 'three'
import { getSortLayer, resolveSortLayer, type SortLayerName } from './sortLayers'

/**
 * Duck-type for first-party primitives that participate in the
 * sortLayer system (Sprite2D, AnimatedSprite2D, future ParticleSystem).
 */
interface SortLayerParticipant extends Object3D {
  _sortLayerExplicit: boolean
  _applySortLayerFromGroup(name: SortLayerName): void
}

function isSortLayerParticipant(object: Object3D): object is SortLayerParticipant {
  return '_applySortLayerFromGroup' in object
}

/**
 * Discipline container for sort ordering — every child inside gets the
 * declared sortLayer, mirroring how `SpriteGroup` enforces material
 * discipline.
 *
 * The one container that bridges first-party primitives AND foreign
 * Object3Ds: our primitives get `sortLayer` (routing through the
 * auto-batch run key); foreign children (Skia, Slug, plain Mesh) get
 * `renderOrder` from the layer's declared config. One container, mixed
 * children, consistent ordering through three's render-list sort.
 *
 * Precedence rules:
 * - Nested `SortLayerGroup` with a different name: **inner wins** —
 *   the walk stops at its boundary and it disciplines its own subtree
 * - A child with an explicit `sortLayer` or non-zero `renderOrder`
 *   already set is respected — never overridden
 * - Plain `Group` containers are walked through; their descendants get
 *   the same rules
 *
 * ```tsx
 * <sortLayerGroup name="world">
 *   <sprite2D texture={...} />   // sortLayer = 'world'
 *   <skiaText />                  // renderOrder = world.renderOrder
 * </sortLayerGroup>
 * ```
 *
 * Vanilla three.js:
 * ```ts
 * const world = new SortLayerGroup({ name: 'world' })
 * scene.add(world)
 * world.add(playerSprite, enemy, skiaHud)
 * ```
 */
export class SortLayerGroup extends Group {
  /** Backing store for the intercepted `name` accessor. @internal */
  declare private _sortLayerGroupName?: string

  constructor(options?: { name?: SortLayerName }) {
    super()
    this.addEventListener('childadded', this._onChildAdded)
    if (options?.name !== undefined) {
      this.name = options.name
    }
  }

  /** @internal three 'childadded' fires for direct adds only. */
  private _onChildAdded = (event: { child?: Object3D }): void => {
    const child = event.child
    if (child && this._sortLayerGroupName) {
      this._applyToSubtree(child)
    }
  }

  /**
   * Re-apply the discipline to current children — used when `name` is
   * assigned after children already exist (R3F sets props post-mount).
   * @internal
   */
  _applyName(value: string): void {
    this._sortLayerGroupName = value
    // Guard: Object3D's constructor assigns `name = ''` before
    // `children` exists.
    if (!value || !this.children) return
    for (const child of this.children) {
      this._applyToSubtree(child)
    }
  }

  /** @internal */
  _applyToSubtree(object: Object3D): void {
    const name = this._sortLayerGroupName as SortLayerName | undefined
    if (!name) return

    // Inner SortLayerGroup wins — it disciplines its own subtree.
    if (object instanceof SortLayerGroup) return

    if (isSortLayerParticipant(object)) {
      // Respect an explicit user assignment; group discipline never
      // overrides intent.
      if (!object._sortLayerExplicit) {
        object._applySortLayerFromGroup(name)
      }
    } else if (object.renderOrder === 0) {
      // Foreign Object3D — compile the layer straight to three's
      // primitive. Non-zero renderOrder counts as an explicit user
      // assignment and is respected.
      object.renderOrder = resolveSortLayer(name)
    }

    for (const child of object.children) {
      this._applyToSubtree(child)
    }
  }
}

// `name` doubles as the sortLayer key (`<sortLayerGroup name="world">`).
// Object3D declares `name` as a data property, so the interception is a
// prototype accessor installed via defineProperty (ts2611 workaround —
// same pattern as Sprite2D.renderOrder). Object3D's constructor
// assignment (`this.name = ''`) passes through harmlessly pre-listeners.
Object.defineProperty(SortLayerGroup.prototype, 'name', {
  get(this: SortLayerGroup): string {
    return (this as unknown as { _sortLayerGroupName?: string })._sortLayerGroupName ?? ''
  },
  set(this: SortLayerGroup, value: string): void {
    if (value && getSortLayer(value as SortLayerName) === undefined) {
      // Not declared (yet) — resolveSortLayer would warn on every child;
      // warn once here with actionable context instead.
      console.warn(
        `three-flatland: SortLayerGroup name '${value}' is not a declared sortLayer — ` +
          'declare it with declareSortLayer() for a non-zero renderOrder.'
      )
    }
    this._applyName(value)
  },
  configurable: true,
})
