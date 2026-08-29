import {
  ClampToEdgeWrapping,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
  type Texture,
} from 'three'
import { StorageTexture, type WebGPURenderer } from 'three/webgpu'
import { Fn, float, int, instanceIndex, ivec2, textureLoad, textureStore, uint, uvec2, vec3, vec4 } from 'three/tsl'
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js'
import {
  DDA_LEAF_TILE_SCALE,
  DDA_MASK_BYTE_SCALE,
  getDdaHierarchyDimensions,
  getDdaLeafBit,
  type DdaHierarchyLevel,
} from '../DdaHierarchy'

/** 8x8 is supported by every WebGPU implementation and maps cleanly to 64-lane workgroups. */
export const DDA_WORKGROUP_2D_SIZE = 8

type StorageTextureWithMipState = StorageTexture & { mipmapsAutoUpdate: boolean }

function configureStorageTexture(texture: StorageTexture, nearest: boolean): void {
  texture.type = UnsignedByteType
  texture.format = RGBAFormat
  texture.colorSpace = NoColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.minFilter = nearest ? NearestFilter : LinearFilter
  texture.magFilter = nearest ? NearestFilter : LinearFilter
  texture.generateMipmaps = false
  ;(texture as StorageTextureWithMipState).mipmapsAutoUpdate = false
}

function outputCell(width: number) {
  // `instanceIndex` remains linear when Three splits a very large dispatch
  // across multiple workgroup dimensions; `globalId.x` would wrap per row.
  const linearIndex = instanceIndex.toConst('ddaWorkgroupLinearIndex')
  return ivec2(int(linearIndex.mod(uint(width))), int(linearIndex.div(uint(width)))).toConst('ddaWorkgroupOutputCell')
}

/**
 * Build the exact 2x2 leaf masks into an rgba8unorm storage texture.
 *
 * Each invocation exclusively owns one output texel. An atomic OR would only
 * serialize four source tests that are already available to the same lane, so
 * the four bits are assembled in registers and committed with one store.
 */
export function createDdaWorkgroupLeafKernel(
  target: StorageTexture,
  occlusionTexture: Texture,
  emissiveTexture: Texture,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
): ComputeNode {
  const sourceMax = ivec2(int(sourceWidth - 1), int(sourceHeight - 1)).toConst()
  return Fn(() => {
    const cell = outputCell(outputWidth)
    const baseCell = cell.mul(int(DDA_LEAF_TILE_SCALE)).toConst()
    const occupiedMask = float(0).toVar('ddaOccupiedMask')
    const emitterMask = float(0).toVar('ddaEmitterMask')
    const emissionMask = float(0).toVar('ddaEmissionMask')

    for (let child = 0; child < 4; child++) {
      const dx = child & 1
      const dy = child >> 1
      const childX = baseCell.x.add(int(dx)).toConst()
      const childY = baseCell.y.add(int(dy)).toConst()
      const sourceCell = ivec2(
        childX.greaterThan(sourceMax.x).select(sourceMax.x, childX),
        childY.greaterThan(sourceMax.y).select(sourceMax.y, childY)
      ).toConst()
      const occlusion = textureLoad(occlusionTexture, sourceCell).toConst()
      const emission = textureLoad(emissiveTexture, sourceCell).rgb.toConst()
      const bit = float(getDdaLeafBit(dx, dy)).toConst()
      occupiedMask.addAssign(occlusion.a.greaterThan(float(0.5)).select(bit, float(0)))
      emitterMask.addAssign(occlusion.r.greaterThan(float(0.5)).select(bit, float(0)))
      emissionMask.addAssign(emission.dot(emission).greaterThan(float(1e-10)).select(bit, float(0)))
    }

    textureStore(
      target,
      uvec2(cell),
      vec4(occupiedMask, emitterMask, emissionMask, float(0)).div(float(DDA_MASK_BYTE_SCALE))
    ).toWriteOnly()
  })()
    .compute(outputWidth * outputHeight, [DDA_WORKGROUP_2D_SIZE * DDA_WORKGROUP_2D_SIZE])
    .setName('dda-workgroup-hierarchy-leaf')
}

/** Build one conservative OR-reduction level. No averaged mip sampling is used. */
export function createDdaWorkgroupReductionKernel(
  target: StorageTexture,
  sourceTexture: Texture,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
): ComputeNode {
  const sourceMax = ivec2(int(sourceWidth - 1), int(sourceHeight - 1)).toConst()
  return Fn(() => {
    const cell = outputCell(outputWidth)
    const baseCell = cell.mul(int(2)).toConst()
    const signals = vec3(0).toVar('ddaHierarchySignals')
    for (let child = 0; child < 4; child++) {
      const dx = child & 1
      const dy = child >> 1
      const childX = baseCell.x.add(int(dx)).toConst()
      const childY = baseCell.y.add(int(dy)).toConst()
      const sourceCell = ivec2(
        childX.greaterThan(sourceMax.x).select(sourceMax.x, childX),
        childY.greaterThan(sourceMax.y).select(sourceMax.y, childY)
      ).toConst()
      signals.assign(signals.max(textureLoad(sourceTexture, sourceCell).rgb))
    }
    const threshold = float(0.5 / DDA_MASK_BYTE_SCALE)
    // A vector condition passed to TSL `select()` lowers through `all()`,
    // coupling the three otherwise independent hierarchy flags. Preserve the
    // conservative occupancy/emitter/emission OR channels independently.
    const present = vec3(
      signals.x.greaterThan(threshold).select(float(1), float(0)),
      signals.y.greaterThan(threshold).select(float(1), float(0)),
      signals.z.greaterThan(threshold).select(float(1), float(0)),
    )
    textureStore(target, uvec2(cell), vec4(present, float(0))).toWriteOnly()
  })()
    .compute(outputWidth * outputHeight, [DDA_WORKGROUP_2D_SIZE * DDA_WORKGROUP_2D_SIZE])
    .setName('dda-workgroup-hierarchy-reduce')
}

interface OwnedHierarchyLevel extends DdaHierarchyLevel {
  readonly texture: StorageTexture
  readonly computeNode: ComputeNode
}

/**
 * WebGPU compute equivalent of {@link DdaHierarchy}.
 *
 * Separate compute passes are intentional: a pass boundary changes each
 * preceding level from storage-write usage to sampled-read usage before the
 * next level consumes it.
 */
export class DdaWorkgroupHierarchy {
  private _levels: OwnedHierarchyLevel[] = []
  private _occlusionTexture: Texture | null = null
  private _emissiveTexture: Texture | null = null
  private _sourceWidth = 0
  private _sourceHeight = 0
  private _requestedLevelCount = 0

  get levels(): readonly DdaHierarchyLevel[] {
    return this._levels
  }

  get computeNodes(): readonly ComputeNode[] {
    return this._levels.map((level) => level.computeNode)
  }

  get levelCount(): number {
    return this._levels.length
  }

  configure(
    occlusionTexture: Texture,
    emissiveTexture: Texture,
    sourceWidth: number,
    sourceHeight: number,
    levelCount: number
  ): boolean {
    const width = Math.max(1, Math.round(sourceWidth))
    const height = Math.max(1, Math.round(sourceHeight))
    const count = Math.max(1, Math.round(levelCount))
    if (
      this._occlusionTexture === occlusionTexture &&
      this._emissiveTexture === emissiveTexture &&
      this._sourceWidth === width &&
      this._sourceHeight === height &&
      this._requestedLevelCount === count
    ) {
      return false
    }

    this.disposeLevels()
    this._occlusionTexture = occlusionTexture
    this._emissiveTexture = emissiveTexture
    this._sourceWidth = width
    this._sourceHeight = height
    this._requestedLevelCount = count

    const dimensions = getDdaHierarchyDimensions(width, height, count)
    for (let index = 0; index < dimensions.length; index++) {
      const dimension = dimensions[index]!
      const target = new StorageTexture(dimension.width, dimension.height)
      configureStorageTexture(target, true)
      const previous = this._levels[index - 1]
      const computeNode = previous
        ? createDdaWorkgroupReductionKernel(
            target,
            previous.texture,
            previous.width,
            previous.height,
            dimension.width,
            dimension.height
          )
        : createDdaWorkgroupLeafKernel(
            target,
            occlusionTexture,
            emissiveTexture,
            width,
            height,
            dimension.width,
            dimension.height
          )
      this._levels.push({
        texture: target,
        computeNode,
        width: dimension.width,
        height: dimension.height,
        scale: dimension.scale,
      })
    }
    return true
  }

  execute(renderer: WebGPURenderer): void {
    // Do not pass the array to renderer.compute(): sequential calls guarantee
    // WebGPU pass boundaries between storage writes and sampled reads.
    for (const level of this._levels) void renderer.compute(level.computeNode)
  }

  private disposeLevels(): void {
    for (const level of this._levels) {
      level.computeNode.dispose()
      level.texture.dispose()
    }
    this._levels = []
  }

  dispose(): void {
    this.disposeLevels()
    this._occlusionTexture = null
    this._emissiveTexture = null
  }
}
