import { type Signal, computed } from '@preact/signals-core'
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
  // Stable clip-status boolean: the panel is clipped iff a scroll/overflow ancestor
  // hands it a clipping rect — the SAME condition that decides whether its instance
  // writes real planes or the `NoClippingPlane` sentinel (see `InstancedPanel`). Deriving
  // it as a `computed` collapses the per-frame `clippingRect` churn (a fresh rect every
  // time the panel moves) to a boolean that only flips on structural/overflow changes, so
  // the effect below re-runs (and the panel migrates groups) only on a real clip toggle.
  const isClipped = computed(() => clippingRect != null && clippingRect.value != null)
  abortableEffect(() => {
    const isEnabled = properties.enabled.value
    const currentOrderInfo = orderInfo.value
    if (!isEnabled || currentOrderInfo == null) {
      return
    }
    const clipped = isClipped.value
    const innerAbortController = new AbortController()
    const group = root.value.panelGroupManager.getGroup(
      currentOrderInfo,
      panelGroupDependencies.value,
      clipped
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
