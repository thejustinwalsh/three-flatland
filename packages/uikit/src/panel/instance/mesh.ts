import {
  Box3,
  DynamicDrawUsage,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  Sphere,
} from 'three'
import type { BufferGeometry, InstancedBufferAttribute, Object3DEventMap } from 'three'
import { createPanelGeometry } from '../geometry.js'
import { panelClippingLanes, panelDataLanes } from '../material/shader.js'
import type { RootContext } from '../../context.js'
import { computeWorldToGlobalMatrix } from '../../utils.js'

type LaneNames = readonly [string, string, string, string]

type LaneSync = {
  source: InstancedBufferAttribute
  buffer: InstancedInterleavedBuffer
}

/**
 * Expose an itemSize-16 instanced attribute as four instanced vec4 lanes the
 * TSL panel graph can read (WGSL has no mat4 vertex attributes — Q1). The
 * interleaved buffer aliases the SAME Float32Array; uploads are forwarded from
 * the source attribute per frame (see `InstancedPanelMesh.onBeforeRender`).
 */
function addMat4Lanes(
  geometry: BufferGeometry,
  names: LaneNames,
  source: InstancedBufferAttribute
): LaneSync {
  const buffer = new InstancedInterleavedBuffer(source.array as Float32Array, 16, 1)
  buffer.setUsage(DynamicDrawUsage)
  for (let i = 0; i < 4; i++) {
    geometry.setAttribute(names[i]!, new InterleavedBufferAttribute(buffer, 4, i * 4))
  }
  return { source, buffer }
}

export class InstancedPanelMesh extends Mesh {
  public count = 0

  protected readonly isInstancedMesh = true
  public readonly instanceColor = null
  public readonly morphTexture = null
  public readonly boundingBox = new Box3()
  public readonly boundingSphere = new Sphere()

  private readonly laneSyncs: Array<LaneSync>

  private readonly customUpdateMatrixWorld = () =>
    computeWorldToGlobalMatrix(this.root, this.matrixWorld)

  constructor(
    protected readonly root: Omit<
      RootContext,
      'glyphGroupManager' | 'panelGroupManager' | 'shapeGroupManager'
    >,
    public readonly instanceMatrix: InstancedBufferAttribute,
    instanceData: InstancedBufferAttribute,
    instanceClipping: InstancedBufferAttribute
  ) {
    const panelGeometry = createPanelGeometry()
    super(panelGeometry)
    this.pointerEvents = 'none'
    // Only aData/aClipping get lane attributes — the custom per-instance data that genuinely needs
    // splitting for WGSL. The instance MATRIX is NOT laned: three's own InstanceNode already exposes
    // `this.instanceMatrix` as vec4 lanes for WGSL and applies it to positionLocal, and the panel
    // shader reads that instanced positionLocal directly. Declaring a second aInstanceMatrix lane set
    // over the same buffer took the panel program to 19 vertex attributes, overflowing WebGL2's cap.
    this.laneSyncs = [
      addMat4Lanes(panelGeometry, panelDataLanes, instanceData),
      addMat4Lanes(panelGeometry, panelClippingLanes, instanceClipping),
    ]
    this.frustumCulled = false
    root.onUpdateMatrixWorldSet.add(this.customUpdateMatrixWorld)
  }

  /**
   * Forward writes on the itemSize-16 source attributes into the vec4-lane
   * interleaved buffers — the same version/updateRanges sync three's own
   * `InstanceNode.update()` performs for `instanceMatrix`. Runs for the main
   * AND shadow passes (both go through `Renderer._renderObjectDirect`).
   *
   * Sole-consumer sources (aData/aClipping) are drained after forwarding.
   * The matrix source CANNOT be drained (three's `InstanceNode` still reads
   * it and misrenders on empty ranges) and CANNOT be left as-is: under the
   * WebGPU renderer nothing ever clears it (`InstanceNode.update()`
   * re-forwards without clearing, and the source attribute itself is never
   * uploaded directly), so every animated panel's per-frame write would grow
   * the list forever — re-forwarded here in full each frame. Measured on the
   * uikit examples pre-fix: `addUpdateRange` traffic climbing 129k/s → 550k/s
   * over 30s with FPS decaying 120 → 67 in BOTH twins. So after forwarding,
   * the matrix source's accumulated ranges are COMPACTED into their single
   * union range — a conservative superset over the same aliased array, so
   * every consumer uploads correct data, and the list stays O(writes per
   * frame) instead of O(runtime). Verified post-fix: flat 120 FPS and correct
   * rendering over the same 30s soak.
   */
  override onBeforeRender = () => {
    for (const { source, buffer } of this.laneSyncs) {
      if (buffer.version === source.version) {
        continue
      }
      buffer.clearUpdateRanges()
      for (const range of source.updateRanges) {
        buffer.addUpdateRange(range.start, range.count)
      }
      buffer.version = source.version
      // aData/aClipping: the lane buffer is the source's SOLE consumer → drain after forwarding.
      source.clearUpdateRanges()
    }
    // The instance MATRIX has no lane — three's own InstanceNode consumes `this.instanceMatrix`. But
    // InstanceNode.update() forwards the source's updateRanges into its buffer WITHOUT clearing the
    // source, so an animated panel's per-frame writes grow the list forever (measured 129k→550k
    // ranges/30s, FPS 120→67). It cannot be drained (InstanceNode misrenders on empty ranges), so
    // compact to the single union range each frame — a conservative superset over the same array,
    // correct for every consumer, O(writes/frame) not O(runtime).
    const matrixRanges = this.instanceMatrix.updateRanges
    if (matrixRanges.length > 1) {
      let lo = Infinity
      let hi = 0
      for (const { start, count } of matrixRanges) {
        if (start < lo) lo = start
        if (start + count > hi) hi = start + count
      }
      this.instanceMatrix.clearUpdateRanges()
      this.instanceMatrix.addUpdateRange(lo, hi - lo)
    }
  }

  dispose() {
    this.root.onUpdateMatrixWorldSet.delete(this.customUpdateMatrixWorld)
    this.dispatchEvent({ type: 'dispose' as keyof Object3DEventMap })
    this.geometry.dispose()
  }

  clone(): this {
    const cloned = new InstancedPanelMesh(
      this.root,
      this.instanceMatrix,
      this.laneSyncs[0]!.source,
      this.laneSyncs[1]!.source
    ) as this
    cloned.count = this.count
    cloned.material = this.material
    return cloned
  }

  copy(): this {
    throw new Error('InstancedPanelMesh.copy() is not supported. Use clone() instead.')
  }

  // Functions not needed because intersection and morphing are intentionally disabled.
  computeBoundingBox(): void {}
  computeBoundingSphere(): void {}
  updateMorphTargets(): void {}
  raycast(): void {}
  spherecast(): void {}
}
