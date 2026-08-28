import {
  AdditiveBlending,
  DoubleSide,
  type Material,
  type Mesh,
  type Object3D,
  OrthographicCamera,
  type RenderTarget,
  type Scene,
  type Texture,
  type Vector2,
} from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { WebGPURenderer } from 'three/webgpu'
import { Fn, attribute, float, select, texture as sampleTexture, uv, vec2, vec3, vec4 } from 'three/tsl'
import { beginDebugPass, endDebugPass } from '../debug/debug-sink'
import { EMISSIVE_EFFECT_NAME } from '../materials/EmissiveEffect'
import { readEffectEnabledFlag, readFlip, readRotatedFrameFlag } from '../materials/instanceAttributes'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { synthQuadNodes } from '../materials/synthQuadNodes'

/**
 * Re-renders emissive Sprite2D batches into an existing HDR radiance target.
 *
 * The pass mirrors the production Sprite2D vertex/atlas path and swaps only
 * materials that registered EmissiveEffect. Everything else is temporarily
 * hidden. This keeps the pass batched: its draw count is per emissive material
 * batch, never per sprite.
 *
 * @internal
 */
export class EmissivePass {
  private _disposed = false
  private _rendering = false
  private _captureCamera = new OrthographicCamera()
  private _materials = new Map<string, Sprite2DMaterial>()
  private _swappedMeshes: Mesh[] = []
  private _swappedOriginals: Material[] = []
  private _hiddenObjects: Object3D[] = []

  render(
    renderer: WebGPURenderer,
    scene: Scene,
    camera: OrthographicCamera,
    target: RenderTarget,
    radianceWorldSize: Vector2
  ): void {
    this._assertUsable('render')
    if (this._rendering) return
    this._rendering = true

    const previousTarget = renderer.getRenderTarget()
    const previousBackground = scene.background
    const previousAutoClear = renderer.autoClear

    this._swappedMeshes.length = 0
    this._swappedOriginals.length = 0
    this._hiddenObjects.length = 0
    scene.traverse(this._collectAndSwap)

    this._syncCamera(camera, radianceWorldSize)

    try {
      scene.background = null
      renderer.autoClear = false
      renderer.setRenderTarget(target)
      beginDebugPass('radiance.emissiveSprites', renderer)
      renderer.render(scene, this._captureCamera)
      endDebugPass(renderer)
    } finally {
      for (let i = this._swappedMeshes.length - 1; i >= 0; i--) {
        this._swappedMeshes[i]!.material = this._swappedOriginals[i]!
      }
      for (let i = this._hiddenObjects.length - 1; i >= 0; i--) {
        this._hiddenObjects[i]!.visible = true
      }
      this._swappedMeshes.length = 0
      this._swappedOriginals.length = 0
      this._hiddenObjects.length = 0
      scene.background = previousBackground
      renderer.autoClear = previousAutoClear
      renderer.setRenderTarget(previousTarget)
      this._rendering = false
    }
  }

  private _syncCamera(source: OrthographicCamera, worldSize: Vector2): void {
    this._captureCamera.copy(source, false)
    const sourceWidth = source.right - source.left
    const sourceHeight = source.top - source.bottom
    const padX = Math.max(0, worldSize.x - sourceWidth) * 0.5
    const padY = Math.max(0, worldSize.y - sourceHeight) * 0.5
    this._captureCamera.left = source.left - padX
    this._captureCamera.right = source.right + padX
    // Keep the capture in camera/world orientation. DDA's worldToCell()
    // performs the one required world-Y -> render-target-Y conversion when
    // it addresses this texture. Flipping the projection here as well mirrors
    // every emissive sprite a second time, so rays trace toward the wrong Y.
    this._captureCamera.bottom = source.bottom - padY
    this._captureCamera.top = source.top + padY
    this._captureCamera.updateProjectionMatrix()
    this._captureCamera.updateMatrixWorld(true)
  }

  private _collectAndSwap = (object: Object3D): void => {
    const mesh = object as Mesh
    if (!(mesh as { isMesh?: boolean }).isMesh || !mesh.visible) return

    const source = mesh.material
    if (Array.isArray(source) || !(source instanceof Sprite2DMaterial)) {
      mesh.visible = false
      this._hiddenObjects.push(mesh)
      return
    }

    const texture = source.getTexture()
    const colorSlot = source._effectSlots.get(`${EMISSIVE_EFFECT_NAME}_color`)
    const intensitySlot = source._effectSlots.get(`${EMISSIVE_EFFECT_NAME}_intensity`)
    const thresholdSlot = source._effectSlots.get(`${EMISSIVE_EFFECT_NAME}_threshold`)
    const bitIndex = source._effectBitIndex.get(EMISSIVE_EFFECT_NAME)
    if (!texture || !colorSlot || !intensitySlot || !thresholdSlot || bitIndex === undefined) {
      mesh.visible = false
      this._hiddenObjects.push(mesh)
      return
    }

    const key = `${source.batchId}:${source._effectSchemaVersion}:${source._tightMesh ? 1 : 0}`
    let emissiveMaterial = this._materials.get(key)
    if (!emissiveMaterial) {
      const constants = source._effectConstants.get(EMISSIVE_EFFECT_NAME) as
        | { emissionMap?: Texture | null }
        | undefined
      emissiveMaterial = buildEmissiveMaterial(
        texture,
        constants?.emissionMap ?? null,
        colorSlot.offset,
        intensitySlot.offset,
        thresholdSlot.offset,
        bitIndex,
        source._tightMesh
      )
      this._materials.set(key, emissiveMaterial)
    }

    this._swappedMeshes.push(mesh)
    this._swappedOriginals.push(source)
    mesh.material = emissiveMaterial
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    for (const material of this._materials.values()) material.dispose()
    this._materials.clear()
  }

  private _assertUsable(member: string): void {
    if (this._disposed) throw new Error(`three-flatland: EmissivePass.${member} cannot be used after dispose()`)
  }
}

function effectComponent(offset: number): Node<'float'> {
  const buffer = attribute<'vec4'>(`effectBuf${Math.floor(offset / 4)}`, 'vec4')
  const components = [buffer.x, buffer.y, buffer.z, buffer.w] as const
  return components[offset % 4]!
}

function buildEmissiveMaterial(
  texture: Texture,
  emissionMap: Texture | null,
  colorOffset: number,
  intensityOffset: number,
  thresholdOffset: number,
  bitIndex: number,
  tightMesh: boolean
): Sprite2DMaterial {
  const material = new Sprite2DMaterial({ map: texture, transparent: true, lit: false, effectTier: 0 })
  const synth = tightMesh ? null : synthQuadNodes()
  material.positionNode = synth?.position ?? null
  material.blending = AdditiveBlending
  material.depthTest = false
  material.depthWrite = false
  // Emission sprites may be authored with either winding after atlas/frame
  // transforms; capture both faces so the auxiliary pass never drops them.
  material.side = DoubleSide
  material.toneMapped = false

  material.colorNode = Fn(() => {
    const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
    const instanceColor = attribute<'vec4'>('instanceColor', 'vec4')
    const flip = readFlip()
    const baseUV = synth ? synth.cornerUV : (uv() as unknown as Node<'vec2'>)
    const flippedUV = vec2(
      select(flip.x.greaterThan(float(0)), baseUV.x, float(1).sub(baseUV.x)),
      select(flip.y.greaterThan(float(0)), baseUV.y, float(1).sub(baseUV.y))
    )
    const rotated = readRotatedFrameFlag()
    const frameUV = vec2(
      select(rotated, flippedUV.y, flippedUV.x),
      select(rotated, float(1).sub(flippedUV.x), flippedUV.y)
    )
    const atlasUV = frameUV.mul(vec2(instanceUV.z, instanceUV.w)).add(vec2(instanceUV.x, instanceUV.y))

    const baseSample = sampleTexture(texture, atlasUV)
    const mapSample = emissionMap ? sampleTexture(emissionMap, atlasUV) : vec4(1, 1, 1, 1)
    const color = vec3(effectComponent(colorOffset), effectComponent(colorOffset + 1), effectComponent(colorOffset + 2))
    const intensity = effectComponent(intensityOffset)
    const threshold = effectComponent(thresholdOffset)
    const enabled = select(readEffectEnabledFlag(bitIndex), float(1), float(0))
    const maskColor = emissionMap ? mapSample.rgb : baseSample.rgb
    const luminance = maskColor.dot(vec3(0.2126, 0.7152, 0.0722))
    const thresholdMask = select(
      threshold.greaterThan(float(0)),
      luminance.sub(threshold).div(float(0.05)).clamp(0, 1),
      float(1)
    )
    const mask = baseSample.a.mul(instanceColor.a).mul(mapSample.a).mul(enabled).mul(thresholdMask)
    const radiance = color.mul(mapSample.rgb).mul(intensity)

    // AdditiveBlending applies source alpha, so keep RGB un-premultiplied.
    // Alpha remains an emitter mask for transport and debug inspection.
    return vec4(radiance, mask)
  })() as Node<'vec4'>

  return material
}
