import { Vector3 } from 'three'
import type { Intersection } from 'three'
import type { Component } from '../components/component.js'
import type { ThreeMouseEvent } from '../events.js'
import { announce } from './announce/announcer.js'

/**
 * The modality that triggered an activation. The cross-mode truth: pointer clicks delegate TO
 * activation, not the reverse, so controller / gaze / switch activation in Modes 3–4 reuse the
 * exact same path with zero per-widget code.
 */
export type A11yActivationSource =
  | 'pointer'
  | 'keyboard'
  | 'screen-reader'
  | 'voice'
  | 'xr-controller'
  | 'gaze'
  | 'hand'
  | 'switch'

/**
 * A semantic activation event dispatched as three's `'activate'`. Geometry is present ONLY when
 * the source actually has it (`pointer` / `xr-controller`); a keyboard/AT activation carries no
 * fake mouse coordinates — that honesty is finding #8 of the spec's adversarial review.
 */
export type A11yActivationEvent = {
  source: A11yActivationSource
  /** DOM event / XRInputSourceEvent when available. */
  nativeEvent?: unknown
  /** Real geometry when `source` is `'pointer'` / `'xr-controller'`; absent otherwise. */
  intersection?: Intersection
  handedness?: 'left' | 'right' | 'none'
  stopPropagation?: () => void
}

const activationPoint = /* @__PURE__ */ new Vector3()
const noop = (): void => {}

/**
 * Dispatch a semantic activation on a component (spec §2). Fires `'activate'` through the existing
 * handler chain — so `onActivate` from props / classes / star props / kit `defaultOverrides` all
 * run via the exact computedHandlers → addEventListener path already in component.ts — then a
 * compat synthetic `'click'` (marked `synthetic` so onClick-only code keeps working for keyboard/AT
 * activation, skipped for real pointer clicks that already ran), then announces the activation /
 * deactivation message chosen by the current toggle state.
 */
export function dispatchActivation(component: Component, event: A11yActivationEvent): void {
  const properties = component.properties.value
  if (properties.disabled === true) {
    return
  }

  component.dispatchEvent({ type: 'activate', ...event })

  if (event.source !== 'pointer') {
    component.getWorldPosition(activationPoint)
    const click: ThreeMouseEvent = {
      distance: 0,
      point: activationPoint.clone(),
      object: component,
      synthetic: true,
      source: event.source,
      nativeEvent: event.nativeEvent,
      stopPropagation: event.stopPropagation ?? noop,
    }
    component.dispatchEvent({ type: 'click', ...click })
  }

  const wasToggled = properties.ariaChecked ?? properties.ariaPressed
  const message = wasToggled ? properties.deactivationMessage : properties.activationMessage
  if (typeof message === 'string' && message.length > 0) {
    announce(message, { source: component, kind: 'activation' })
  }
}
