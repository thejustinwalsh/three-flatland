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

  // onActivate may have synchronously disabled the component (vanilla signal path) — don't fire the
  // compat synthetic click into a now-disabled control (would double-act with a legacy onClick).
  if (event.source !== 'pointer' && component.properties.value.disabled !== true) {
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
    // The synthetic click is a compat bridge to legacy onClick code. If that code throws (a bug, or
    // an env-gated API like navigator.clipboard on an insecure origin), it must NOT abort the
    // semantic path — assistive tech still needs the activation announcement below. Surface, continue.
    try {
      component.dispatchEvent({ type: 'click', ...click })
    } catch (error) {
      console.error('[uikit a11y] a click handler threw during activation', error)
    }
  }

  const wasToggled = properties.ariaChecked ?? properties.ariaPressed
  const message = wasToggled ? properties.deactivationMessage : properties.activationMessage
  if (typeof message === 'string' && message.length > 0) {
    announce(message, { source: component, kind: 'activation' })
  }
}
