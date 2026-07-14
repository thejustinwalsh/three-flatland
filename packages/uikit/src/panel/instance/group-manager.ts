import type { Component } from '../../components/component.js'
import type { RootContext } from '../../context.js'
import { ElementType, type OrderInfo } from '../../order.js'
import type { NodeMaterialClass } from '../material/create.js'
import { resolvePanelMaterialClassProperty } from '../material/presets.js'
import { InstancedPanelGroup } from './group.js'
import type { PanelGroupProperties } from './properties.js'

export class PanelGroupManager {
  private map = new Map<NodeMaterialClass, Map<string, InstancedPanelGroup>>()

  constructor(
    private readonly root: Omit<
      RootContext,
      'glyphGroupManager' | 'panelGroupManager' | 'shapeGroupManager'
    >,
    private readonly object: Component
  ) {}

  init(abortSignal: AbortSignal) {
    //flush runs in the end-of-update post-pass so panels inserted during
    //THIS frame's layout/scroll handlers still draw on this frame's render
    const onFrameEnd = () => this.traverse((group) => group.onFrame())
    this.root.onFrameEndSet.add(onFrameEnd)
    abortSignal.addEventListener('abort', () => {
      this.root.onFrameEndSet.delete(onFrameEnd)
      this.traverse((group) => group.destroy())
    })
  }

  private traverse(fn: (group: InstancedPanelGroup) => void) {
    for (const groups of this.map.values()) {
      for (const group of groups.values()) {
        fn(group)
      }
    }
  }

  /**
   * `clipped` splits panels into separate batches by clip status so each batch's
   * material bakes the matching build-time clip variant (perf win #3): unclipped
   * panels land in a zero-clip-ALU group, clipped panels in a 4-plane group. It is
   * part of the group key, so an unclipped batch is never contaminated by a clipped
   * panel (and vice versa). A panel migrates groups if its clip status flips.
   */
  getGroup(
    { majorIndex, minorIndex }: OrderInfo,
    properties: Required<PanelGroupProperties>,
    clipped: boolean
  ) {
    const materialClass = resolvePanelMaterialClassProperty(properties.panelMaterialClass)
    let groups = this.map.get(materialClass)
    if (groups == null) {
      this.map.set(materialClass, (groups = new Map()))
    }
    const key = [
      majorIndex,
      minorIndex,
      properties.renderOrder,
      properties.depthTest,
      properties.depthWrite,
      properties.receiveShadow,
      properties.castShadow,
      clipped,
    ].join(',')
    let panelGroup = groups.get(key)
    if (panelGroup == null) {
      groups.set(
        key,
        (panelGroup = new InstancedPanelGroup(
          this.object,
          this.root,
          {
            elementType: ElementType.Panel,
            minorIndex,
            majorIndex,
            patchIndex: 0,
          },
          properties,
          clipped
        ))
      )
    }
    return panelGroup
  }
}
