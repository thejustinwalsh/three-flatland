import { NodeUpdateType } from 'three/tsl'
import { InstanceNode } from 'three/webgpu'

/**
 * Split `InstanceNode`'s per-frame work into the two phases it actually needs.
 *
 * Three.js's per-render-object pipeline runs in this order
 * (`Renderer._renderObjectDirect`):
 *   1. `_nodes.updateBefore(renderObject)`         // updateBefore-phase nodes
 *   2. `_geometries.updateForRender(renderObject)` // ← GPU upload reads buffer.updateRanges
 *   3. `_nodes.updateForRender(renderObject)`      // FRAME-phase nodes
 *
 * Stock `InstanceNode.update` (FRAME / step 3) does two unrelated things:
 *
 *   a. Propagates `instanceMatrix.updateRanges` into the internal
 *      `InstancedInterleavedBuffer` three.js uploads. The upload reads those
 *      ranges at step 2, so the propagation has to happen at step 1 to be seen.
 *      Running it at step 3 leaves the ranges one frame behind; a slot that has
 *      never been drawn (count growing N → N+1) is dropped from the upload on
 *      its first visible frame and the instance renders with the buffer's
 *      initial (zero) matrix — a one-frame flash. PR #31816 (closed #31814)
 *      made `update` honor the ranges but left it at FRAME, so the phase is
 *      still wrong as of r184/dev.
 *
 *   b. Snapshots the current matrix into `previousInstanceMatrix` for velocity
 *      / motion blur (#32586). This is a current→previous handoff and only has
 *      to run AFTER the upload (step 2): the previous buffer uploads at step 2
 *      holding last frame's matrix, then the snapshot overwrites the CPU copy
 *      with this frame's matrix for next frame. FRAME (step 3) satisfies that,
 *      so its phase is already correct — it is unrelated to the range timing.
 *
 * So the two halves belong in different phases. This patch puts (a) in
 * `updateBefore` (the only phase before the upload at step 2) and leaves (b)
 * exactly where three.js has it — `update` (FRAME), untouched and unchanged.
 * The only phase that would break (b) is `updateBefore`; FRAME and `updateAfter`
 * are both fine, so we don't move it.
 *
 * Mirrors the upstream fix in mrdoob/three.js#33615 (issue #33614). Remove this
 * once that lands and we bump three.js past the release that includes it.
 *
 * Applied once at module load. Idempotent under hot reload.
 *
 * @internal
 */

interface InstanceNodeInternals {
  buffer: { clearUpdateRanges(): void; updateRanges: unknown[]; version: number } | null
  bufferColor: { clearUpdateRanges(): void; updateRanges: unknown[]; version: number } | null
  instanceMatrix: { updateRanges: unknown[]; version: number; array: ArrayLike<number> }
  instanceColor: { updateRanges: unknown[]; version: number } | null
  isStorageMatrix: boolean
  isStorageColor: boolean
  previousInstanceMatrixNode: unknown
}

const PATCH_FLAG = '__instanceNodePhaseSplitPatched__'
const proto = InstanceNode.prototype as unknown as Record<string, unknown>

if (!proto[PATCH_FLAG]) {
  proto[PATCH_FLAG] = true

  // Register the node in the updateBefore pass; keep its FRAME registration
  // (default updateType) so the velocity snapshot still runs at step 3.
  proto.getUpdateBeforeType = function () {
    return NodeUpdateType.FRAME
  }

  // (a) Range propagation — runs before the geometry upload at step 2.
  proto.updateBefore = function (this: InstanceNodeInternals) {
    if (this.buffer !== null && this.isStorageMatrix !== true) {
      this.buffer.clearUpdateRanges()
      this.buffer.updateRanges.push(...this.instanceMatrix.updateRanges)
      if (this.instanceMatrix.version !== this.buffer.version) {
        this.buffer.version = this.instanceMatrix.version
      }
    }

    if (this.instanceColor && this.bufferColor !== null && this.isStorageColor !== true) {
      this.bufferColor.clearUpdateRanges()
      this.bufferColor.updateRanges.push(...this.instanceColor.updateRanges)
      if (this.instanceColor.version !== this.bufferColor.version) {
        this.bufferColor.version = this.instanceColor.version
      }
    }
  }

  // (b) Velocity snapshot only — phase unchanged (FRAME). Range propagation is
  // removed from here; updateBefore owns it now.
  proto.update = function (
    this: InstanceNodeInternals,
    frame: { object: { previousInstanceMatrix: { array: { set(src: ArrayLike<number>): void } } } }
  ) {
    if (this.previousInstanceMatrixNode !== null) {
      frame.object.previousInstanceMatrix.array.set(this.instanceMatrix.array)
    }
  }
}
