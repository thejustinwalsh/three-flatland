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
import { panelClippingLanes, panelDataLanes, panelMatrixLanes } from '../material/shader.js'
import type { RootContext } from '../../context.js'
import { computeWorldToGlobalMatrix } from '../../utils.js'

type LaneNames = readonly [string, string, string, string]

type LaneSync = {
  source: InstancedBufferAttribute
  buffer: InstancedInterleavedBuffer
  /**
   * Drain `source.updateRanges` after forwarding. Safe only when the lane
   * buffer is the source's sole consumer (aData/aClipping) — the matrix source
   * is also read by three's own InstanceNode AFTER onBeforeRender, so its
   * ranges must be left in place (core InstancedMesh behavior).
   */
  drainSource: boolean
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
  source: InstancedBufferAttribute,
  drainSource: boolean
): LaneSync {
  const buffer = new InstancedInterleavedBuffer(source.array as Float32Array, 16, 1)
  buffer.setUsage(DynamicDrawUsage)
  for (let i = 0; i < 4; i++) {
    geometry.setAttribute(names[i]!, new InterleavedBufferAttribute(buffer, 4, i * 4))
  }
  return { source, buffer, drainSource }
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
    protected readonly root: Omit<RootContext, 'glyphGroupManager' | 'panelGroupManager'>,
    public readonly instanceMatrix: InstancedBufferAttribute,
    instanceData: InstancedBufferAttribute,
    instanceClipping: InstancedBufferAttribute
  ) {
    const panelGeometry = createPanelGeometry()
    super(panelGeometry)
    this.pointerEvents = 'none'
    this.laneSyncs = [
      addMat4Lanes(panelGeometry, panelMatrixLanes, instanceMatrix, false),
      addMat4Lanes(panelGeometry, panelDataLanes, instanceData, true),
      addMat4Lanes(panelGeometry, panelClippingLanes, instanceClipping, true),
    ]
    this.frustumCulled = false
    root.onUpdateMatrixWorldSet.add(this.customUpdateMatrixWorld)
  }

  /**
   * Forward writes on the itemSize-16 source attributes into the vec4-lane
   * interleaved buffers — the same version/updateRanges sync three's own
   * `InstanceNode.update()` performs for `instanceMatrix`. Runs for the main
   * AND shadow passes (both go through `Renderer._renderObjectDirect`).
   */
  override onBeforeRender = () => {
    for (const { source, buffer, drainSource } of this.laneSyncs) {
      if (buffer.version === source.version) {
        continue
      }
      buffer.clearUpdateRanges()
      for (const range of source.updateRanges) {
        buffer.addUpdateRange(range.start, range.count)
      }
      buffer.version = source.version
      if (drainSource) {
        source.clearUpdateRanges()
      }
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
      this.laneSyncs[1]!.source,
      this.laneSyncs[2]!.source
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
