import type { Signal } from '@preact/signals-core'
import type { Matrix4, Vector2Tuple } from 'three'
import type { ClippingRect } from '../../clipping.js'
import type { RootContext } from '../../context.js'
import type { Inset } from '../../flex/node.js'
import type { OrderInfo } from '../../order.js'
import type { Properties } from '../../properties/index.js'
import { abortableEffect } from '../../utils.js'
import type { PanelMaterialConfig } from '../material/config.js'
import { InstancedPanel } from './panel.js'
import type { PanelGroupProperties } from './properties.js'

export function setupInstancedPanel(
  properties: Properties,
  root: Signal<RootContext>,
  orderInfo: Signal<OrderInfo | undefined>,
  panelGroupDependencies: Signal<Required<PanelGroupProperties>>,
  panelMatrix: Signal<Matrix4 | undefined>,
  size: Signal<Vector2Tuple | undefined>,
  borderInset: Signal<Inset | undefined>,
  clippingRect: Signal<ClippingRect | undefined> | undefined,
  isVisible: Signal<boolean>,
  materialConfig: PanelMaterialConfig,
  abortSignal: AbortSignal
) {
  abortableEffect(() => {
    const isEnabled = properties.enabled.value
    const currentOrderInfo = orderInfo.value
    if (!isEnabled || currentOrderInfo == null) {
      return
    }
    const innerAbortController = new AbortController()
    const group = root.value.panelGroupManager.getGroup(
      currentOrderInfo,
      panelGroupDependencies.value
    )
    new InstancedPanel(
      properties,
      group,
      currentOrderInfo.patchIndex,
      panelMatrix,
      size,
      borderInset,
      clippingRect,
      isVisible,
      materialConfig,
      innerAbortController.signal
    )
    return () => innerAbortController.abort()
  }, abortSignal)
}
