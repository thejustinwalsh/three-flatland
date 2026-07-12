import { signal, type ReadonlySignal } from '@preact/signals-core'
import type { Component } from '../components/component.js'

/**
 * A11y DEBUG overlay (spec §7, dev-tool). The hidden a11y elements the library projects over each
 * panel are normally invisible (`opacity:0`). Toggling debug on renders every projected element as a
 * magenta outlined box tinted over its panel, with its role + accessible name shown as a tooltip and
 * a `data-a11y-debug` attribute for devtools — so you can SEE the accessibility tree and verify
 * Mode-2/3 positioning against the real panels. Developer aid only; never enable in production.
 */

const a11yDebugSignal = /* @__PURE__ */ signal(false)

/** Toggle the a11y debug overlay on/off for every projected root. */
export function setA11yDebug(enabled: boolean): void {
  a11yDebugSignal.value = enabled
}

/** Reactive debug state — the projection reads it each frame to style/unstyle members. */
export function getA11yDebug(): ReadonlySignal<boolean> {
  return a11yDebugSignal
}

const DEBUG_OUTLINE = '2px solid #ff2fb0'
const DEBUG_BACKGROUND = 'rgba(255,47,176,0.14)'

/**
 * Apply or clear the debug visualization on one a11y element. `on` reveals it (opacity 1 + outline +
 * role/name label); otherwise it restores the hidden default (`opacity:0`, no outline). Idempotent
 * and cheap — only touches the DOM when the element's debug state actually flips, so it is safe to
 * call every frame from the projection loop. An element that is `visibility:hidden` (behind-camera /
 * too-small / not laid out) stays hidden regardless, so only perceivable, positioned elements show.
 */
export function applyA11yDebugStyle(element: HTMLElement, component: Component, on: boolean): void {
  const already = element.hasAttribute('data-a11y-debug')
  if (on === already) {
    return
  }
  const style = element.style
  if (on) {
    style.setProperty('outline', DEBUG_OUTLINE)
    style.setProperty('background', DEBUG_BACKGROUND)
    style.setProperty('opacity', '1')
    const props = component.properties.peek()
    const name = props.ariaLabel ?? props.a11ySpatialLabel ?? props.ariaDescription ?? ''
    const label = `${props.role ?? 'content'}${name ? ` · ${name}` : ''}`
    element.setAttribute('data-a11y-debug', label)
    element.title = label
  } else {
    style.removeProperty('outline')
    style.removeProperty('background')
    style.setProperty('opacity', '0')
    element.removeAttribute('data-a11y-debug')
    element.removeAttribute('title')
  }
}
