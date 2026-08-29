import { ClampToEdgeWrapping, NearestFilter, RGBAFormat, RenderTarget, UnsignedByteType, type Texture } from 'three'
import { NodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu'
import { Fn, float, floor, int, ivec2, textureLoad, uv, vec2, vec3, vec4 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { beginDebugPass, endDebugPass, registerDebugTexture, unregisterDebugTexture } from '../debug/debug-sink'

/** One byte stores the exact four bits of a 2x2 fine-grid tile. */
export const DDA_LEAF_TILE_SCALE = 2
export const DDA_MASK_BYTE_SCALE = 255

export function getDdaLeafBit(x: number, y: number): number {
  return 1 << ((x & 1) + ((y & 1) << 1))
}

export function getDdaCascadeHierarchyLevel(
  cascadeIndex: number,
  configuredLevel: number,
  availableLevels: number
): number {
  return Math.max(0, Math.min(cascadeIndex, configuredLevel, availableLevels))
}

export interface DdaHierarchyLevel {
  readonly texture: Texture
  readonly scale: number
  readonly width: number
  readonly height: number
}

export function getDdaHierarchyDimensions(
  width: number,
  height: number,
  levelCount: number
): Array<{ width: number; height: number; scale: number }> {
  const levels: Array<{ width: number; height: number; scale: number }> = []
  const count = Math.max(1, Math.round(levelCount))
  for (let level = 1; level <= count; level++) {
    const scale = 2 ** level
    levels.push({
      width: Math.max(1, Math.ceil(width / scale)),
      height: Math.max(1, Math.ceil(height / scale)),
      scale,
    })
  }
  return levels
}

/**
 * Conservative fragment-built hierarchy for the portable DDA path.
 *
 * Level 1 stores exact 2x2 bitmasks in RGB:
 * - R: occupied cells
 * - G: cells belonging to an emissive silhouette
 * - B: cells containing captured emissive radiance
 *
 * Higher levels OR four children into full-byte presence flags. No averaged
 * mip or epsilon decides whether a block is empty, so a single fine-grid wall
 * or emitter can never disappear from the hierarchy.
 */
export class DdaHierarchy {
  private _levels: Array<{
    target: RenderTarget
    material: NodeMaterial
    scale: number
  }> = []
  private _quad = new QuadMesh()
  private _occlusionTexture: Texture | null = null
  private _emissiveTexture: Texture | null = null
  private _sourceWidth = 0
  private _sourceHeight = 0
  private _requestedLevelCount = 0

  get levels(): readonly DdaHierarchyLevel[] {
    return this._levels.map(({ target, scale }) => ({
      texture: target.texture,
      scale,
      width: target.width,
      height: target.height,
    }))
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
      const target = new RenderTarget(dimension.width, dimension.height, {
        type: UnsignedByteType,
        format: RGBAFormat,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        wrapS: ClampToEdgeWrapping,
        wrapT: ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      })
      target.texture.generateMipmaps = false
      const material =
        index === 0
          ? this.createLeafMaterial(occlusionTexture, emissiveTexture, width, height, dimension.width, dimension.height)
          : this.createReductionMaterial(
              this._levels[index - 1]!.target.texture,
              this._levels[index - 1]!.target.width,
              this._levels[index - 1]!.target.height,
              dimension.width,
              dimension.height
            )
      this._levels.push({ target, material, scale: dimension.scale })
      registerDebugTexture(`radiance.ddaHierarchy${index + 1}`, target, 'rgba8', {
        display: 'colors',
        label: `DDA hierarchy ${dimension.scale}x`,
      })
    }
    return true
  }

  render(renderer: WebGPURenderer): void {
    for (let index = 0; index < this._levels.length; index++) {
      const level = this._levels[index]!
      beginDebugPass(`radiance.ddaHierarchy${index + 1}`, renderer)
      this._quad.material = level.material
      renderer.setRenderTarget(level.target)
      this._quad.render(renderer)
      endDebugPass(renderer)
    }
  }

  private createLeafMaterial(
    occlusionTexture: Texture,
    emissiveTexture: Texture,
    sourceWidth: number,
    sourceHeight: number,
    outputWidth: number,
    outputHeight: number
  ): NodeMaterial {
    const sourceMax = ivec2(int(sourceWidth - 1), int(sourceHeight - 1)).toConst()
    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const outputCell = ivec2(floor(uv().mul(vec2(float(outputWidth), float(outputHeight))))).toConst()
      const baseCell = outputCell.mul(int(DDA_LEAF_TILE_SCALE)).toConst()
      const occupiedMask = float(0).toVar()
      const emitterMask = float(0).toVar()
      const emissionMask = float(0).toVar()

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
        const bit = float(getDdaLeafBit(dx, dy))
        occupiedMask.addAssign(occlusion.a.greaterThan(float(0.5)).select(bit, float(0)))
        emitterMask.addAssign(occlusion.r.greaterThan(float(0.5)).select(bit, float(0)))
        emissionMask.addAssign(emission.dot(emission).greaterThan(float(1e-10)).select(bit, float(0)))
      }

      return vec4(occupiedMask, emitterMask, emissionMask, float(0)).div(float(DDA_MASK_BYTE_SCALE))
    })() as Node<'vec4'>
    return material
  }

  private createReductionMaterial(
    sourceTexture: Texture,
    sourceWidth: number,
    sourceHeight: number,
    outputWidth: number,
    outputHeight: number
  ): NodeMaterial {
    const sourceMax = ivec2(int(sourceWidth - 1), int(sourceHeight - 1)).toConst()
    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const outputCell = ivec2(floor(uv().mul(vec2(float(outputWidth), float(outputHeight))))).toConst()
      const baseCell = outputCell.mul(int(2)).toConst()
      const signals = vec3(0).toVar()
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
      // TSL's vector-condition `.select(vec3, vec3)` lowers through `all()`:
      // it would set every channel only when occupancy, emitter silhouette,
      // and emissive radiance are all present in the same coarse block. Keep
      // the three conservative OR flags independent instead. Most blocks are
      // intentionally wall-only or emission-only, so coupling them makes the
      // hierarchy report false-empty space and skip real transport.
      const present = vec3(
        signals.x.greaterThan(threshold).select(float(1), float(0)),
        signals.y.greaterThan(threshold).select(float(1), float(0)),
        signals.z.greaterThan(threshold).select(float(1), float(0)),
      )
      return vec4(present, float(0))
    })() as Node<'vec4'>
    return material
  }

  private disposeLevels(): void {
    for (let index = 0; index < this._levels.length; index++) {
      unregisterDebugTexture(`radiance.ddaHierarchy${index + 1}`)
      this._levels[index]!.material.dispose()
      this._levels[index]!.target.dispose()
    }
    this._levels = []
  }

  dispose(): void {
    this.disposeLevels()
    this._occlusionTexture = null
    this._emissiveTexture = null
  }
}
