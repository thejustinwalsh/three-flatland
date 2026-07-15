import { Vector2 } from 'three'
import type { Camera, Material, Object3DEventMap } from 'three'
import { SlugShapeBatch } from '@three-flatland/slug'
import type { SlugShapeBatchOptions, SlugShapeSet } from '@three-flatland/slug'
import type { InstancedShape } from './instanced-shape.js'
import { ElementType, type OrderInfo, setupRenderOrder } from '../../order.js'
import type { RootContext } from '../../context.js'
import type { Component } from '../../components/component.js'
import { computeWorldToGlobalMatrix } from '../../utils.js'

const viewportSizeHelper = new Vector2()

/**
 * `SlugShapeBatch` wired into uikit's root-driven `matrixWorld`
 * propagation — the shape-batch analogue of
 * `text/render/instanced-glyph-group.ts`'s `InstancedGlyphMesh`. Root
 * recomputes each mesh's `matrixWorld` once via `onUpdateMatrixWorldSet`
 * (uikit components don't sit in the normal Object3D parent chain), plus
 * self-contained per-frame dilation plumbing identical to the glyph mesh's:
 * `onBeforeRender` reads the renderer's own drawing-buffer size and pushes
 * both `setViewportSize` and the MVP update (`SlugShapeBatch.update`)
 * every frame.
 */
export class InstancedShapeMesh extends SlugShapeBatch {
  private readonly customUpdateMatrixWorld = () =>
    computeWorldToGlobalMatrix(this.root, this.matrixWorld)

  constructor(
    private readonly root: Omit<
      RootContext,
      'glyphGroupManager' | 'panelGroupManager' | 'shapeGroupManager'
    >,
    options?: SlugShapeBatchOptions
  ) {
    super(options)
    this.pointerEvents = 'none'
    root.onUpdateMatrixWorldSet.add(this.customUpdateMatrixWorld)
  }

  override onBeforeRender = (
    renderer: { getDrawingBufferSize(target: Vector2): Vector2 },
    _scene: unknown,
    camera: Camera
  ) => {
    renderer.getDrawingBufferSize(viewportSizeHelper)
    this.setViewportSize(viewportSizeHelper.width, viewportSizeHelper.height)
    this.update(camera)
  }

  override dispose(): this {
    this.root.onUpdateMatrixWorldSet.delete(this.customUpdateMatrixWorld)
    this.dispatchEvent({ type: 'dispose' as keyof Object3DEventMap })
    super.dispose()
    return this
  }

  // Never legitimately cloneable — see InstancedGlyphMesh's identical note.
  override clone(): this {
    throw new Error('InstancedShapeMesh.clone() is not supported. Use ShapeGroupManager instead.')
  }

  override copy(): this {
    throw new Error('InstancedShapeMesh.copy() is not supported. Use ShapeGroupManager instead.')
  }
}

export class ShapeGroupManager {
  private map = new Map<SlugShapeSet, Map<string, InstancedShapeGroup>>()
  constructor(
    private readonly root: Omit<
      RootContext,
      'glyphGroupManager' | 'panelGroupManager' | 'shapeGroupManager'
    >,
    private readonly object: Component
  ) {}

  init(abortSignal: AbortSignal) {
    //flush runs in the end-of-update post-pass so shapes activated during
    //THIS frame's layout/scroll handlers still draw on this frame's render
    const onFrameEnd = () => this.traverse((group) => group.onFrame())
    this.root.onFrameEndSet.add(onFrameEnd)
    abortSignal.addEventListener('abort', () => {
      this.root.onFrameEndSet.delete(onFrameEnd)
      this.traverse((group) => group.destroy())
    })
  }

  private traverse(fn: (group: InstancedShapeGroup) => void) {
    for (const groups of this.map.values()) {
      for (const group of groups.values()) {
        fn(group)
      }
    }
  }

  getGroup(
    { majorIndex, minorIndex }: OrderInfo,
    depthTest: boolean,
    depthWrite: boolean,
    renderOrder: number,
    shapes: SlugShapeSet
  ) {
    let groups = this.map.get(shapes)
    if (groups == null) {
      this.map.set(shapes, (groups = new Map()))
    }
    const key = [majorIndex, minorIndex, depthTest, depthWrite, renderOrder].join(',')
    let shapeGroup = groups?.get(key)
    if (shapeGroup == null) {
      groups.set(
        key,
        (shapeGroup = new InstancedShapeGroup(
          this.object,
          shapes,
          this.root,
          {
            majorIndex,
            minorIndex,
            elementType: ElementType.Content,
            patchIndex: 0,
          },
          depthTest,
          depthWrite,
          renderOrder
        ))
      )
    }
    return shapeGroup
  }
}

export class InstancedShapeGroup {
  private shapeInstances: Array<InstancedShape | undefined> = []
  private requestedShapes: Array<InstancedShape> = []
  private holeIndicies: Array<number> = []
  private mesh?: InstancedShapeMesh

  constructor(
    private object: Component,
    public readonly shapes: SlugShapeSet,
    public readonly root: Omit<
      RootContext,
      'glyphGroupManager' | 'panelGroupManager' | 'shapeGroupManager'
    >,
    private orderInfo: OrderInfo,
    private depthTest: boolean,
    private depthWrite: boolean,
    private renderOrder: number
  ) {}

  /** The batch instances write into — `undefined` until the first shape activates. */
  get batch(): SlugShapeBatch | undefined {
    return this.mesh
  }

  requestActivate(shape: InstancedShape): void {
    const holeIndex = this.holeIndicies.shift()
    if (holeIndex != null) {
      //inserting into existing hole
      this.shapeInstances[holeIndex] = shape
      shape.activate(holeIndex)
      this.root.requestRender?.()
      return
    }

    if (this.mesh == null || this.mesh.count >= this.mesh.capacity) {
      //requesting insert because no space available (or the batch doesn't exist yet)
      this.requestedShapes.push(shape)
      this.root.requestFrame?.()
      return
    }

    //inserting at the end because space available
    const index = this.mesh.count
    this.shapeInstances[index] = shape
    shape.activate(index)
    this.mesh.count += 1
    this.root.requestRender?.()
    return
  }

  delete(shape: InstancedShape): void {
    if (shape.index == null) {
      //remove an not yet added shape
      const indexInRequested = this.requestedShapes.indexOf(shape)
      if (indexInRequested === -1) {
        return
      }
      this.requestedShapes.splice(indexInRequested, 1)
      return
    }

    //can directly request render because we don't need "onFrame" to handle delete
    this.root.requestRender?.()

    const replacement = this.requestedShapes.shift()
    if (replacement != null) {
      //replace
      replacement.activate(shape.index)
      this.shapeInstances[shape.index] = replacement
      shape.index = undefined
      return
    }

    if (shape.index === this.shapeInstances.length - 1) {
      //remove at the end
      this.shapeInstances.length -= 1
      this.mesh!.count -= 1
      shape.index = undefined
      return
    }

    //remove in between: hide via the hidden-degenerate rect (zero size, zero alpha),
    //remember the slot as a hole for reuse — the batch only ever grows.
    this.mesh!.writeRect(shape.index, { x: 0, y: 0, width: 0, height: 0 }, { opacity: 0 })
    this.holeIndicies.push(shape.index)
    this.shapeInstances[shape.index] = undefined
    shape.index = undefined
  }

  onFrame(): void {
    const requiredSize =
      this.shapeInstances.length - this.holeIndicies.length + this.requestedShapes.length

    if (this.mesh != null) {
      this.mesh.visible = requiredSize > 0
    }

    if (this.requestedShapes.length === 0) {
      return
    }

    this.ensureMesh()
    this.mesh!.ensureCapacity(requiredSize)
    const indexOffset = this.mesh!.count
    const requestedShapesLength = this.requestedShapes.length
    for (let i = 0; i < requestedShapesLength; i++) {
      const shape = this.requestedShapes[i]!
      shape.activate(indexOffset + i)
      this.shapeInstances[indexOffset + i] = shape
    }
    this.mesh!.count += requestedShapesLength
    this.mesh!.visible = true
    this.requestedShapes.length = 0
  }

  private ensureMesh(): void {
    if (this.mesh != null) {
      return
    }
    this.mesh = new InstancedShapeMesh(this.root, { shapes: this.shapes })
    // `shapes` was passed to the constructor, so the `SlugShapeBatch` `shapes`
    // setter already built a single `SlugMaterial` — never `Material[]`.
    const material = this.mesh.material as Material
    material.depthTest = this.depthTest
    material.depthWrite = this.depthWrite
    this.mesh.renderOrder = this.renderOrder
    setupRenderOrder(this.mesh, { peek: () => this.root }, { value: this.orderInfo })
    this.object.addUnsafe(this.mesh)
  }

  destroy() {
    if (this.mesh == null) {
      return
    }
    this.object.remove(this.mesh)
    this.mesh.dispose()
  }
}
