import { Mesh } from 'three'
import { panelGeometry } from '../panel/geometry.js'

/**
 * The mesh that actually draws a `Custom` component's user material.
 *
 * `Custom` presents itself to the renderer as a clipping group (see
 * `custom.ts`), so the renderer's traversal never draws the component mesh —
 * this child draws instead, inheriting the group's clipping context. It owns
 * no material: `material` forwards to the source component, so
 * `custom.material = ...` (including R3F auto-attach) keeps working.
 */
export class CustomContentMesh extends Mesh {
  constructor(readonly source: Mesh) {
    super(panelGeometry, source.material)
    // the source component copies its matrixWorld onto this mesh
    this.matrixAutoUpdate = false
    this.matrixWorldAutoUpdate = false
    this.frustumCulled = false
    // picking happens on the Custom component itself (clipped raycast)
    this.raycast = () => {}
  }
}

// `material` lives on the source component — forward reads and swallow writes
// (the Mesh constructor's assignment lands here; the source is the sole owner).
Object.defineProperty(CustomContentMesh.prototype, 'material', {
  get(this: CustomContentMesh) {
    return this.source.material
  },
  set() {},
  configurable: true,
})
