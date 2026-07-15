import { Vector2 } from 'three'
import type { Camera, Material, Object3DEventMap } from 'three'
import { SlugBatch } from '@three-flatland/slug'
import type { SlugBatchOptions, SlugFont } from '@three-flatland/slug'
import { computed } from '@preact/signals-core'
import type { ReadonlySignal } from '@preact/signals-core'
import type { InstancedGlyph } from './instanced-glyph.js'
import type { Font } from '../font.js'
import { ElementType, type OrderInfo, setupRenderOrder } from '../../order.js'
import type { RootContext } from '../../context.js'
import type { Component } from '../../components/component.js'
import { computeWorldToGlobalMatrix } from '../../utils.js'

/** Group-bucket dependency: only the font identity forces a new glyph group. */
export function computedGylphGroupDependencies(fontSignal: ReadonlySignal<Font | undefined>) {
  return computed(() => ({ font: fontSignal.value?.slug }))
}

const viewportSizeHelper = new Vector2()

/**
 * `SlugBatch` wired into uikit's root-driven `matrixWorld` propagation
 * (uikit components don't sit in the normal Object3D parent chain — Root
 * recomputes each mesh's `matrixWorld` once via `onUpdateMatrixWorldSet`,
 * exactly like `InstancedPanelMesh`) plus self-contained per-frame
 * dilation plumbing: `onBeforeRender` reads the renderer's OWN drawing-
 * buffer size and pushes both `setViewportSize` and the MVP update
 * (`SlugBatch.update(camera)`) every frame, for whichever render target
 * this batch is actually drawn into. No Root/renderer coupling needed
 * anywhere else in the render seam. Keeps the historical `InstancedGlyphMesh`
 * name — `components/component.ts`/`content.ts` `instanceof`-check it to
 * recognize uikit-internal text meshes during traversal.
 */
export class InstancedGlyphMesh extends SlugBatch {
  private readonly customUpdateMatrixWorld = () =>
    computeWorldToGlobalMatrix(this.root, this.matrixWorld)

  constructor(
    private readonly root: Omit<
      RootContext,
      'glyphGroupManager' | 'panelGroupManager' | 'shapeGroupManager'
    >,
    options?: SlugBatchOptions
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

  // Never legitimately cloneable: `Component.copyInto` explicitly skips these
  // meshes as children (the glyph-group pipeline recreates them fresh instead),
  // and three's default `Object3D.clone()` would call the zero-arg constructor,
  // which crashes on the required `root` arg. Throw clearly instead.
  override clone(): this {
    throw new Error('InstancedGlyphMesh.clone() is not supported. Use GlyphGroupManager instead.')
  }

  override copy(): this {
    throw new Error('InstancedGlyphMesh.copy() is not supported. Use GlyphGroupManager instead.')
  }
}

export class GlyphGroupManager {
  private map = new Map<SlugFont, Map<string, InstancedGlyphGroup>>()
  constructor(
    private readonly root: Omit<
      RootContext,
      'glyphGroupManager' | 'panelGroupManager' | 'shapeGroupManager'
    >,
    private readonly object: Component
  ) {}

  init(abortSignal: AbortSignal) {
    //flush runs in the end-of-update post-pass so glyphs activated during
    //THIS frame's layout/scroll handlers still draw on this frame's render
    const onFrameEnd = () => this.traverse((group) => group.onFrame())
    this.root.onFrameEndSet.add(onFrameEnd)
    abortSignal.addEventListener('abort', () => {
      this.root.onFrameEndSet.delete(onFrameEnd)
      this.traverse((group) => group.destroy())
    })
  }

  private traverse(fn: (group: InstancedGlyphGroup) => void) {
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
    font: SlugFont
  ) {
    let groups = this.map.get(font)
    if (groups == null) {
      this.map.set(font, (groups = new Map()))
    }
    const key = [majorIndex, minorIndex, depthTest, depthWrite, renderOrder].join(',')
    let glyphGroup = groups?.get(key)
    if (glyphGroup == null) {
      groups.set(
        key,
        (glyphGroup = new InstancedGlyphGroup(
          this.object,
          font,
          this.root,
          {
            majorIndex,
            minorIndex,
            elementType: ElementType.Text,
            patchIndex: 0,
          },
          depthTest,
          depthWrite,
          renderOrder
        ))
      )
    }
    return glyphGroup
  }
}

export class InstancedGlyphGroup {
  private glyphs: Array<InstancedGlyph | undefined> = []
  private requestedGlyphs: Array<InstancedGlyph> = []
  private holeIndicies: Array<number> = []
  private mesh?: InstancedGlyphMesh

  constructor(
    private object: Component,
    public readonly font: SlugFont,
    public readonly root: Omit<
      RootContext,
      'glyphGroupManager' | 'panelGroupManager' | 'shapeGroupManager'
    >,
    private orderInfo: OrderInfo,
    private depthTest: boolean,
    private depthWrite: boolean,
    private renderOrder: number
  ) {}

  /** The batch instances write into — `undefined` until the first glyph activates. */
  get batch(): SlugBatch | undefined {
    return this.mesh
  }

  requestActivate(glyph: InstancedGlyph): void {
    const holeIndex = this.holeIndicies.shift()
    if (holeIndex != null) {
      //inserting into existing hole
      this.glyphs[holeIndex] = glyph
      glyph.activate(holeIndex)
      this.root.requestRender?.()
      return
    }

    if (this.mesh == null || this.mesh.count >= this.mesh.capacity) {
      //requesting insert because no space available (or the batch doesn't exist yet)
      this.requestedGlyphs.push(glyph)
      this.root.requestFrame?.()
      return
    }

    //inserting at the end because space available
    const index = this.mesh.count
    this.glyphs[index] = glyph
    glyph.activate(index)
    this.mesh.count += 1
    this.root.requestRender?.()
    return
  }

  delete(glyph: InstancedGlyph): void {
    if (glyph.index == null) {
      //remove an not yet added glyph
      const indexInRequested = this.requestedGlyphs.indexOf(glyph)
      if (indexInRequested === -1) {
        return
      }
      this.requestedGlyphs.splice(indexInRequested, 1)
      return
    }

    //can directly request render because we don't need "onFrame" to handle delete
    this.root.requestRender?.()

    const replacement = this.requestedGlyphs.shift()
    if (replacement != null) {
      //replace
      replacement.activate(glyph.index)
      this.glyphs[glyph.index] = replacement
      glyph.index = undefined
      return
    }

    if (glyph.index === this.glyphs.length - 1) {
      //remove at the end
      this.glyphs.length -= 1
      this.mesh!.count -= 1
      glyph.index = undefined
      return
    }

    //remove in between: hide via the hidden-degenerate rect (zero size, zero alpha),
    //remember the slot as a hole for reuse. `SlugBatch` only ever grows
    //(`ensureCapacity`, no shrink) so — unlike the old MSDF group — this group
    //never rebuilds/decimates its buffer; it just never gives capacity back.
    this.mesh!.writeRect(glyph.index, { x: 0, y: 0, width: 0, height: 0 }, { opacity: 0 })
    this.holeIndicies.push(glyph.index)
    this.glyphs[glyph.index] = undefined
    glyph.index = undefined
  }

  onFrame(): void {
    const requiredSize = this.glyphs.length - this.holeIndicies.length + this.requestedGlyphs.length

    if (this.mesh != null) {
      this.mesh.visible = requiredSize > 0
    }

    if (this.requestedGlyphs.length === 0) {
      return
    }

    this.ensureMesh()
    const indexOffset = this.mesh!.count
    const requestedGlyphsLength = this.requestedGlyphs.length
    // Requested glyphs are appended at [count, count + requested). `count` already
    // spans the hidden hole slots (SlugBatch only grows — deleted-in-between glyphs
    // are hidden in place, never removed), so the buffer must reach that append
    // high-water mark. `requiredSize` is the NET live count (holes excluded) and
    // undercounts the append range by exactly the number of holes; ensuring only
    // that leaves `count` past the bound buffer, so every DrawIndexed fails with
    // "requires a larger buffer than the bound buffer size" and the batch freezes.
    this.mesh!.ensureCapacity(indexOffset + requestedGlyphsLength)
    for (let i = 0; i < requestedGlyphsLength; i++) {
      const glyph = this.requestedGlyphs[i]!
      glyph.activate(indexOffset + i)
      this.glyphs[indexOffset + i] = glyph
    }
    this.mesh!.count += requestedGlyphsLength
    this.mesh!.visible = true
    this.requestedGlyphs.length = 0
  }

  private ensureMesh(): void {
    if (this.mesh != null) {
      return
    }
    this.mesh = new InstancedGlyphMesh(this.root, { font: this.font })
    // `font` was passed to the constructor, so the SlugBatch `font` setter already
    // built a single `SlugMaterial` — never the `Material[]` half of `Mesh.material`.
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
