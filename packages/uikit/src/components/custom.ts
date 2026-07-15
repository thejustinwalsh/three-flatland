import type { z } from 'zod'
import {
  baseOutPropertiesSchema,
  createInPropertiesSchema,
  defineSchema,
} from '../properties/schema.js'
import { computed } from '@preact/signals-core'
import { createGlobalClippingPlanes } from '../clipping.js'
import { setupOrderInfo, ElementType, setupRenderOrder } from '../order.js'
import type { BaseOutProperties, InProperties, WithSignal } from '../properties/index.js'
import { abortableEffect, setupMatrixWorldUpdate } from '../utils.js'
import { Component } from './component.js'
import { CustomContentMesh } from './custom-content-mesh.js'
import type { Material, Plane } from 'three'
import type { RenderContext } from '../context.js'
import { parseNumberValue } from '../properties/values.js'
export const CustomPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(baseOutPropertiesSchema)
)

export type CustomOutProperties = BaseOutProperties
export type CustomProperties = z.input<typeof CustomPropertiesSchema>

export class Custom<
  OutProperties extends CustomOutProperties = CustomOutProperties,
> extends Component<OutProperties> {
  /**
   * ClippingGroup contract (duck-typed): the common (WebGPU) renderer sources
   * clipping state EXCLUSIVELY from clipping groups — `Renderer._projectObject`
   * reads `isGroup` + `isClippingGroup` + `enabled` and hands every descendant
   * a context built from `clippingPlanes`/`clipShadows`
   * (`ClippingContext.getGroupContext`); `material.clippingPlanes` is inert.
   * The user's material draws on `contentMesh` INSIDE that context. The group
   * branch skips the component mesh itself in the render traversal (it was the
   * drawn mesh before), while raycasting/pointer events stay on the component.
   * A real `ClippingGroup` ancestor is not an option: uikit tree discovery
   * requires `parent instanceof Component`, and the component renders itself.
   */
  readonly isGroup = true
  readonly isClippingGroup = true
  /** the live world-space planes (`createGlobalClippingPlanes`) — never replaced */
  readonly clippingPlanes: Array<Plane>
  clipShadows = true
  /** driven by the parent's clippingRect — no context is attached while unclipped */
  enabled = false
  readonly contentMesh: CustomContentMesh

  constructor(
    inputProperties?: InProperties<OutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    protected inputConfig?: {
      material?: Material
      renderContext?: RenderContext
      defaultOverrides?: InProperties<OutProperties>
      defaults?: WithSignal<OutProperties>
    }
  ) {
    super(inputProperties, initialClasses, { hasNonUikitChildren: false, ...inputConfig })

    setupOrderInfo(
      this.orderInfo,
      this.properties,
      'zIndex',
      ElementType.Custom,
      undefined,
      computed(() =>
        this.parentContainer.value == null ? null : this.parentContainer.value.orderInfo.value
      ),
      this.abortSignal
    )

    this.frustumCulled = false
    setupRenderOrder(this, this.root, this.orderInfo)

    // No customDepth/DistanceMaterial and no material.clippingPlanes: the
    // common Renderer ignores all of them. Clipping comes from the clipping
    // group contract above; shadow silhouettes come from the shadow pass's
    // own node path.
    this.clippingPlanes = createGlobalClippingPlanes(this)

    this.contentMesh = new CustomContentMesh(this)
    setupRenderOrder(this.contentMesh, this.root, this.orderInfo)
    this.add(this.contentMesh)

    abortableEffect(() => {
      this.enabled = this.parentContainer.value?.clippingRect.value != null
      this.root.peek().requestRender?.()
    }, this.abortSignal)

    abortableEffect(() => {
      this.material.depthTest = this.properties.value.depthTest
      this.root.peek().requestRender?.()
    }, this.abortSignal)
    abortableEffect(() => {
      this.material.depthWrite = this.properties.value.depthWrite ?? false
      this.root.peek().requestRender?.()
    }, this.abortSignal)
    abortableEffect(() => {
      // the sort key belongs on the mesh the renderer actually draws; the
      // component's own renderOrder must stay 0 — as a clipping group it would
      // otherwise become the subtree's groupOrder and change sorting semantics
      this.contentMesh.renderOrder = parseNumberValue(this.properties.value.renderOrder ?? 0)
      this.root.peek().requestRender?.()
    }, this.abortSignal)
    abortableEffect(() => {
      this.castShadow = this.properties.value.castShadow
      this.contentMesh.castShadow = this.castShadow
      this.root.peek().requestRender?.()
    }, this.abortSignal)
    abortableEffect(() => {
      this.receiveShadow = this.properties.value.receiveShadow
      this.contentMesh.receiveShadow = this.receiveShadow
      this.root.peek().requestRender?.()
    }, this.abortSignal)

    setupMatrixWorldUpdate(this, this.root, this.globalPanelMatrix, this.abortSignal)

    abortableEffect(() => {
      this.visible = this.isVisible.value
      this.root.peek().requestRender?.()
    }, this.abortSignal)
  }

  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
    super.updateWorldMatrix(updateParents, updateChildren)
    // the content mesh tracks the component transform exactly (identity local
    // matrix); optional-chained because the base constructor runs before ours
    this.contentMesh?.matrixWorld.copy(this.matrixWorld)
  }

  clone(recursive?: boolean): this {
    const cloned = new Custom(this.inputProperties, this.initialClasses, this.inputConfig) as this
    this.copyInto(cloned, recursive)
    return cloned
  }
}
