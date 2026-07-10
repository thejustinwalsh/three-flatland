import { expect } from 'chai'
import { beforeAll } from 'vitest'
import { loadYoga } from 'yoga-layout/load'
import { Object3D } from 'three'
import type { RenderItem } from 'three'
import type { Renderer } from 'three/webgpu'
import { Container, Fullscreen, Text } from '../index.js'
import { compareOrderInfo, reversePainterSortStable, setupRenderOrder } from '../order.js'
import type { OrderInfo } from '../order.js'
import { InstancedPanelMesh } from '../panel/instance/mesh.js'
import type { RootContext } from '../context.js'

/**
 * Paint order across the instanced group meshes. Every group mesh renders at
 * renderOrder 0 with depthWrite off, so correctness rests entirely on the
 * custom transparent sort (`reversePainterSortStable`) consulting each mesh's
 * `orderInfo` — NOT on per-mesh renderOrder. These tests pin the comparator
 * semantics (panel-before-text, zIndex overlays above text, monotonic depth
 * chains) and that the vanilla entry point (`Fullscreen`) actually installs
 * the sort on the renderer — the missing link that let panels paint over
 * their own labels.
 */

beforeAll(async () => {
  await loadYoga()
})

function createRoot() {
  const root = new Container({ width: 200, height: 200 })
  const scene = new Object3D()
  scene.add(root)
  return { root, scene }
}

let nextItemId = 1

/** A RenderItem as the common renderer's RenderList would produce it: same z, renderOrder from the object. */
function renderItemFor(object: Object3D, z = 5): RenderItem {
  return {
    id: nextItemId++,
    object,
    geometry: null,
    material: null,
    groupOrder: 0,
    renderOrder: object.renderOrder,
    z,
    group: null,
  } as unknown as RenderItem
}

/** Tags a stand-in object exactly the way InstancedGlyphGroup/InstancedPanelGroup tag their meshes. */
function taggedObject(rootCtx: RootContext, orderInfo: OrderInfo | undefined): Object3D {
  const object = new Object3D()
  setupRenderOrder(object, { peek: () => rootCtx }, { value: orderInfo })
  return object
}

describe('paint order between instanced group meshes', () => {
  it('sorts the glyph batch of a Text strictly after the panel of its painted Container', () => {
    const { root, scene } = createRoot()
    const container = new Container({ backgroundColor: 'black', width: 100, height: 50 })
    const text = new Text({ text: 'Quit', color: 'white' })
    container.add(text)
    root.add(container)
    // frame 1 computes layout, frame 2 lets the panel group's onFrame build the mesh
    root.update(16)
    root.update(16)

    const panelInfo = container.orderInfo.value
    const textInfo = text.orderInfo.value
    expect(panelInfo, 'container orderInfo').to.not.equal(undefined)
    expect(textInfo, 'text orderInfo').to.not.equal(undefined)
    expect(compareOrderInfo(panelInfo, textInfo), 'panel paints before its label').to.be.lessThan(0)

    // the REAL panel mesh materialized by the group manager is tagged for the sort
    let panelMesh: InstancedPanelMesh | undefined
    scene.traverse((object) => {
      if (object instanceof InstancedPanelMesh) {
        panelMesh = object
      }
    })
    expect(panelMesh, 'InstancedPanelMesh materialized').to.not.equal(undefined)

    const rootCtx = root.root.peek()
    const glyphStandIn = taggedObject(rootCtx, textInfo)
    // both directions: panel first regardless of RenderList insertion order
    expect(
      reversePainterSortStable(renderItemFor(panelMesh!), renderItemFor(glyphStandIn))
    ).to.be.lessThan(0)
    expect(
      reversePainterSortStable(renderItemFor(glyphStandIn), renderItemFor(panelMesh!))
    ).to.be.greaterThan(0)
  })

  it('sorts a higher order group panel (Dialog case, zIndex) above text beneath it', () => {
    const { root } = createRoot()
    const container = new Container({ backgroundColor: 'black' })
    const text = new Text({ text: 'behind the dialog' })
    container.add(text)
    // both kits ship overlays with zIndex 50 (Dialog, Tooltip)
    const overlay = new Container({ zIndex: 50, backgroundColor: 'white' })
    root.add(container)
    root.add(overlay)
    root.update(16)

    const textInfo = text.orderInfo.value
    const overlayInfo = overlay.orderInfo.value
    expect(overlayInfo?.majorIndex).to.equal(50)
    expect(
      compareOrderInfo(textInfo, overlayInfo),
      'overlay panel paints after the text beneath it'
    ).to.be.lessThan(0)

    const rootCtx = root.root.peek()
    const glyphStandIn = taggedObject(rootCtx, textInfo)
    const overlayPanelStandIn = taggedObject(rootCtx, overlayInfo)
    expect(
      reversePainterSortStable(renderItemFor(overlayPanelStandIn), renderItemFor(glyphStandIn))
    ).to.be.greaterThan(0)
  })

  it('keeps a nested panel → text → panel → text chain monotonic', () => {
    const { root } = createRoot()
    const outer = new Container({ backgroundColor: 'black' })
    const outerText = new Text({ text: 'outer' })
    // a nested surface that must occlude siblings picks a zIndex, exactly like the kits do
    const inner = new Container({ zIndex: 1, backgroundColor: 'white' })
    const innerText = new Text({ text: 'inner' })
    outer.add(outerText)
    inner.add(innerText)
    outer.add(inner)
    root.add(outer)
    root.update(16)

    const chain = [
      outer.orderInfo.value,
      outerText.orderInfo.value,
      inner.orderInfo.value,
      innerText.orderInfo.value,
    ]
    for (const info of chain) {
      expect(info).to.not.equal(undefined)
    }
    for (let i = 0; i + 1 < chain.length; i++) {
      expect(
        compareOrderInfo(chain[i], chain[i + 1]),
        `chain step ${i} paints before step ${i + 1}`
      ).to.be.lessThan(0)
    }

    // and the transparent sort agrees end-to-end on tagged meshes
    const rootCtx = root.root.peek()
    const objects = chain.map((info) => taggedObject(rootCtx, info))
    for (let i = 0; i + 1 < objects.length; i++) {
      expect(
        reversePainterSortStable(renderItemFor(objects[i]!), renderItemFor(objects[i + 1]!)),
        `sort step ${i} before step ${i + 1}`
      ).to.be.lessThan(0)
    }
  })

  it('nested same-group panels advance patchIndex so instances stack within the batch', () => {
    const { root } = createRoot()
    const outer = new Container({ backgroundColor: 'black' })
    const inner = new Container({ backgroundColor: 'white' })
    outer.add(inner)
    root.add(outer)
    root.update(16)

    // same major/minor (one instanced batch), later patch paints later inside it
    expect(inner.orderInfo.value?.majorIndex).to.equal(outer.orderInfo.value?.majorIndex)
    expect(inner.orderInfo.value?.minorIndex).to.equal(outer.orderInfo.value?.minorIndex)
    expect(compareOrderInfo(outer.orderInfo.value, inner.orderInfo.value)).to.be.lessThan(0)
  })
})

describe('Fullscreen (vanilla entry point)', () => {
  it('installs reversePainterSortStable as the renderer transparent sort', () => {
    const calls: Array<unknown> = []
    const fakeRenderer = {
      setTransparentSort: (method: unknown) => calls.push(method),
    } as unknown as Renderer
    const fullscreen = new Fullscreen(fakeRenderer)
    expect(calls).to.deep.equal([reversePainterSortStable])
    fullscreen.dispose?.()
  })
})
