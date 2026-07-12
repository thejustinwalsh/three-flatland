import type { Intersection, Object3DEventMap } from 'three'
import type { A11yActivationEvent, A11yActivationSource } from './a11y/activation.js'

declare module 'three' {
  interface Object3DEventMap {
    activate: A11yActivationEvent
    childadded: { child: Object3D }
    childremoved: { child: Object3D }
    click: ThreeMouseEvent
    contextmenu: ThreeMouseEvent
    dblclick: ThreeMouseEvent

    wheel: ThreeMouseEvent

    pointerup: ThreePointerEvent
    pointerdown: ThreePointerEvent
    pointerover: ThreePointerEvent
    pointerout: ThreePointerEvent
    pointerenter: ThreePointerEvent
    pointerleave: ThreePointerEvent
    pointermove: ThreePointerEvent
    pointercancel: ThreePointerEvent
  }
}

export type ThreeMouseEvent = Intersection & {
  nativeEvent?: unknown
  stopPropagation?: () => void
  stopImmediatePropagation?: () => void
  /** Set when a11y activation synthesized this click (keyboard / AT / XR). Geometry-sensitive
   *  onClick handlers should ignore synthetic clicks, and the base Component's pointer delegation
   *  skips them to avoid re-entrancy. */
  synthetic?: boolean
  source?: A11yActivationSource
}

export type ThreePointerEvent = ThreeMouseEvent & { pointerId?: number }

export type EventHandlersProperties = {
  onActivate?: (event: Object3DEventMap['activate']) => void
  onClick?: (event: Object3DEventMap['click']) => void
  onContextMenu?: (event: Object3DEventMap['contextmenu']) => void
  onDblClick?: (event: Object3DEventMap['dblclick']) => void

  onWheel?: (event: Object3DEventMap['wheel']) => void

  onPointerUp?: (event: Object3DEventMap['pointerup']) => void
  onPointerDown?: (event: Object3DEventMap['pointerdown']) => void
  onPointerOver?: (event: Object3DEventMap['pointerover']) => void
  onPointerOut?: (event: Object3DEventMap['pointerout']) => void
  onPointerEnter?: (event: Object3DEventMap['pointerenter']) => void
  onPointerLeave?: (event: Object3DEventMap['pointerleave']) => void
  onPointerMove?: (event: Object3DEventMap['pointermove']) => void
  onPointerCancel?: (event: Object3DEventMap['pointercancel']) => void
}
