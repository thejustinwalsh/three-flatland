import { signal, type Signal } from '@preact/signals-core'
import { abortableEffect } from '../utils.js'
import { parseNumberValue } from '../properties/values.js'
import type { Component } from '../components/component.js'
import type { RootContext } from '../context.js'
import { setupUpdateHasFocus } from './focus.js'
import { a11yGlobal } from './global-state.js'

// ——— per-component focus-skip flag (Mode 3 visibility policy) ———
// setupA11yProjection classifies each element's perceivability per frame and toggles this when a
// panel is offscreen/occluded/behind/too-small; setupRoleState's tabIndex effect reads it so a
// non-perceivable panel is skipped by sequential focus (tabIndex -1) without setupRoleState and the
// projection fighting over tabIndex. Screen-space roots never set it (always perceivable).
const focusSkipSignals = a11yGlobal(
  'focusSkipSignals',
  () => new WeakMap<Component, Signal<boolean>>()
)

/** The component's focus-skip signal (lazily created); read by setupRoleState, written by projection. */
export function a11yFocusSkipSignal(component: Component): Signal<boolean> {
  let existing = focusSkipSignals.get(component)
  if (existing == null) {
    existing = signal(false)
    focusSkipSignals.set(component, existing)
  }
  return existing
}

export type A11yRole =
  | 'button'
  | 'togglebutton'
  | 'link'
  | 'checkbox'
  | 'switch'
  | 'radio'
  | 'tab'
  | 'slider'
  | 'image'
  | 'content'
  | 'listbox'
  | 'landmark'

// opacity:0 + pointer-events:none but REAL-SIZED — Mode 2 projection positions the element, so no
// left:-1000vw here. The per-root CONTAINER is what sits off-screen until a projection registers.
const A11Y_ELEMENT_STYLE =
  'position:absolute;opacity:0;pointer-events:none;margin:0;border:0;padding:0;'
const TRANSPARENT_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"
const INTERACTIVE_ROLES = new Set<A11yRole>([
  'button',
  'togglebutton',
  'link',
  'checkbox',
  'switch',
  'radio',
  'tab',
  'slider',
])
const warnedRoles = a11yGlobal('warnedRoles', () => new Set<string>())
const missingLabelWarned = /* @__PURE__ */ new WeakSet<object>()
let nextListboxOptionId = 0

// Key → move-token grammar for the virtualized listbox (spec §8, APG listbox).
const LISTBOX_MOVE_BY_KEY: Record<
  string,
  'next' | 'prev' | 'nextRow' | 'prevRow' | 'first' | 'last'
> = {
  ArrowRight: 'next',
  ArrowLeft: 'prev',
  ArrowDown: 'nextRow',
  ArrowUp: 'prevRow',
  Home: 'first',
  End: 'last',
}

/**
 * Create the hidden native DOM element for a role (spec §1.2). Native `<button>`/`<a>`/
 * `<input type=range>`/`<img>`/`<p>` so Enter/Space/AT activation and arrow-key handling come for
 * free. `listbox` (spec §8) is the virtualized pattern: ONE focusable element with ONE managed
 * option re-labelled as the active index moves — no per-item DOM. Unimplemented roles
 * (`landmark` P3) warn once and fall back to content.
 */
export function createHtmlA11yElement(role: A11yRole): HTMLElement {
  let element: HTMLElement
  switch (role) {
    case 'button':
      element = document.createElement('button')
      break
    case 'togglebutton':
      element = document.createElement('button')
      element.setAttribute('aria-pressed', 'false')
      break
    case 'checkbox':
    case 'switch':
    case 'radio':
      element = document.createElement('button')
      element.setAttribute('role', role)
      element.setAttribute('aria-checked', 'false')
      break
    case 'tab':
      element = document.createElement('button')
      element.setAttribute('role', 'tab')
      break
    case 'link':
      element = document.createElement('a')
      break
    case 'slider': {
      const input = document.createElement('input')
      input.type = 'range'
      element = input
      break
    }
    case 'image': {
      const img = document.createElement('img')
      img.src = TRANSPARENT_SVG
      element = img
      break
    }
    case 'content':
      element = document.createElement('p')
      break
    case 'listbox': {
      element = document.createElement('div')
      element.setAttribute('role', 'listbox')
      element.setAttribute('tabindex', '0')
      const option = document.createElement('div')
      option.setAttribute('role', 'option')
      option.id = `uikit-a11y-option-${nextListboxOptionId++}`
      element.appendChild(option)
      element.setAttribute('aria-activedescendant', option.id)
      break
    }
    default:
      if (!warnedRoles.has(role)) {
        warnedRoles.add(role)
        console.warn(`[uikit a11y] role "${role}" is not implemented yet; using content semantics.`)
      }
      element = document.createElement('p')
      break
  }
  element.style.cssText = A11Y_ELEMENT_STYLE
  return element
}

// ——— per-root a11y container (one <div data-uikit-a11y> on document.body, refCounted) ———

type RootA11yContainer = { element: HTMLElement; refCount: number }
const rootContainers = a11yGlobal(
  'rootContainers',
  () => new WeakMap<RootContext, RootA11yContainer>()
)

function acquireRootContainer(root: RootContext): HTMLElement {
  let entry = rootContainers.get(root)
  if (entry == null) {
    const element = document.createElement('div')
    element.setAttribute('data-uikit-a11y', '')
    // Off-screen until a Mode 2 projection positions it (documented degraded fallback, §3.3).
    element.style.cssText = 'position:absolute;top:0;left:-1000vw;'
    document.body.appendChild(element)
    entry = { element, refCount: 0 }
    rootContainers.set(root, entry)
  }
  entry.refCount += 1
  return entry.element
}

function releaseRootContainer(root: RootContext): void {
  const entry = rootContainers.get(root)
  if (entry == null) {
    return
  }
  entry.refCount -= 1
  if (entry.refCount <= 0) {
    entry.element.remove()
    rootContainers.delete(root)
  }
}

/** The per-root `[data-uikit-a11y]` container, if one exists — the Mode 2 projection overlays it. */
export function getRootA11yContainer(root: RootContext): HTMLElement | undefined {
  return rootContainers.get(root)?.element
}

/**
 * Move a hidden element into the per-root a11y container and neutralize any own left/top offset, so
 * Mode 2 projection positions it uniformly by `transform`. Used by Input, whose `<input>` is created
 * off-screen on `document.body` (text/input/hidden-input.ts) rather than by setupComponentA11y.
 * Returns a detach that releases the container refcount.
 */
export function attachA11yElementToRoot(root: RootContext, element: HTMLElement): () => void {
  acquireRootContainer(root).appendChild(element)
  element.style.left = '0'
  element.style.top = '0'
  return () => releaseRootContainer(root)
}

// ——— per-root a11y member registry (component → its hidden element) ———
// Mode 2 projection enumerates these to position each element over its panel every frame. Both the
// role-driven elements (setupComponentA11y) and Input's own hidden <input> register here, since
// Input opts out of setupComponentA11y but still needs projecting.

const rootMembers = a11yGlobal(
  'rootMembers',
  () => new WeakMap<RootContext, Map<Component, HTMLElement>>()
)

/** Register a component's hidden element under its root for projection; returns an unregister fn. */
export function registerA11yMember(
  root: RootContext,
  component: Component,
  element: HTMLElement
): () => void {
  let map = rootMembers.get(root)
  if (map == null) {
    map = new Map()
    rootMembers.set(root, map)
  }
  map.set(component, element)
  // Nudge a frame so a member added after the projection started gets positioned on-demand.
  root.requestFrame?.()
  return () => {
    const current = rootMembers.get(root)
    if (current != null && current.get(component) === element) {
      current.delete(component)
      if (current.size === 0) {
        rootMembers.delete(root)
      }
    }
  }
}

/** Live (component → hidden element) map for a root — read by setupA11yProjection each frame. */
export function getRootA11yMembers(
  root: RootContext
): ReadonlyMap<Component, HTMLElement> | undefined {
  return rootMembers.get(root)
}

// Minimal structural shape both a Component's properties and Input's share.
type A11yNameSource = {
  readonly value: { ariaLabel?: string; ariaDescription?: string }
}

/**
 * Shared aria name/description sync, used by both the hidden a11y elements and Input's hidden
 * `<input>` (fixing Input's previously-nameless element).
 */
export function setupAriaAttributes(
  properties: A11yNameSource,
  element: HTMLElement,
  abortSignal: AbortSignal
): void {
  abortableEffect(() => {
    const label = properties.value.ariaLabel
    if (label != null) {
      element.setAttribute('aria-label', label)
    } else {
      element.removeAttribute('aria-label')
    }
  }, abortSignal)
  abortableEffect(() => {
    const description = properties.value.ariaDescription
    if (description != null) {
      element.setAttribute('aria-description', description)
    } else {
      element.removeAttribute('aria-description')
    }
  }, abortSignal)
}

/**
 * Reactive orchestrator (spec §1.2), called once from the Component constructor unless the
 * component owns its own hidden element (Input/Textarea). One abortableEffect keyed on the
 * component's `role`: null → no element (zero cost); set/changed → create the element, append it
 * into the per-root container, wire aria sync + activation + focus routing; cleanup removes it and
 * releases the container. SSR-safe.
 */
export function setupComponentA11y(component: Component, abortSignal: AbortSignal): void {
  if (typeof document === 'undefined') {
    return
  }
  abortableEffect(() => {
    const role = component.properties.value.role
    if (role == null) {
      return
    }
    const element = createHtmlA11yElement(role)
    // Read reactively: if the component is reparented to a different root (diegetic reparenting,
    // Modes 3–4), this effect re-runs — teardown releases the old root's container, the re-run
    // acquires the new one — so the hidden element follows the component instead of stranding.
    const root = component.root.value
    acquireRootContainer(root).appendChild(element)
    component.a11yElement = element
    const unregisterMember = registerA11yMember(root, component, element)

    const scoped = new AbortController()

    setupAriaAttributes(component.properties, element, scoped.signal)
    setupRoleState(component, element, role, scoped.signal)

    const onClick = (nativeEvent: Event): void => {
      nativeEvent.preventDefault()
      component.activate({ source: 'screen-reader', nativeEvent })
    }
    element.addEventListener('click', onClick)

    if (role === 'slider') {
      const input = element as HTMLInputElement
      const onInput = (): void => {
        component.properties.peek().onA11yValueChange?.(input.valueAsNumber)
      }
      input.addEventListener('input', onInput)
      scoped.signal.addEventListener('abort', () => input.removeEventListener('input', onInput))
    }

    if (role === 'listbox') {
      // Key → move-token grammar (spec §8). The app owns column geometry and scroll; this only
      // translates keys — no row/column math here.
      const onKeyDown = (event: KeyboardEvent): void => {
        // Unlike click (which routes through dispatchActivation's disabled guard), this path calls
        // the callbacks directly — so a disabled listbox must ignore arrow/Enter/Space itself.
        if (component.properties.peek().disabled === true) {
          return
        }
        const move = LISTBOX_MOVE_BY_KEY[event.key]
        if (move != null) {
          event.preventDefault()
          component.properties.peek().onA11yActiveIndexChange?.({ move })
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          const { onA11yActivate, ariaActiveIndex } = component.properties.peek()
          onA11yActivate?.(parseNumberValue(ariaActiveIndex ?? 0))
        }
      }
      element.addEventListener('keydown', onKeyDown)
      scoped.signal.addEventListener('abort', () =>
        element.removeEventListener('keydown', onKeyDown)
      )
    }

    setupUpdateHasFocus(
      element,
      component.hasFocus,
      (focus) => component.properties.peek().onFocusChange?.(focus),
      scoped.signal
    )

    warnMissingLabel(component, role)

    return () => {
      scoped.abort()
      unregisterMember()
      element.removeEventListener('click', onClick)
      element.remove()
      if (component.a11yElement === element) {
        component.a11yElement = undefined
      }
      releaseRootContainer(root)
    }
  }, abortSignal)
}

function setupRoleState(
  component: Component,
  element: HTMLElement,
  role: A11yRole,
  abortSignal: AbortSignal
): void {
  const properties = component.properties
  const focusSkip = a11yFocusSkipSignal(component)
  const nativeFormEl =
    element instanceof HTMLButtonElement || element instanceof HTMLInputElement
      ? element
      : undefined

  abortableEffect(() => {
    const disabled = properties.value.disabled === true
    const tabIndexProp = properties.value.tabIndex
    // focusSkip (a not-perceivable panel, Mode 3) forces -1 the same way disabled does — the visibility
    // policy skips it in sequential focus while it stays in the accessibility tree.
    element.tabIndex =
      disabled || focusSkip.value
        ? -1
        : tabIndexProp != null
          ? parseNumberValue(tabIndexProp)
          : role === 'content'
            ? -1
            : 0
  }, abortSignal)

  abortableEffect(() => {
    const disabled = properties.value.disabled === true
    if (nativeFormEl != null) {
      nativeFormEl.disabled = disabled
    }
    if (disabled) {
      element.setAttribute('aria-disabled', 'true')
    } else {
      element.removeAttribute('aria-disabled')
    }
  }, abortSignal)

  if (role === 'checkbox' || role === 'switch' || role === 'radio') {
    abortableEffect(() => {
      element.setAttribute('aria-checked', properties.value.ariaChecked ? 'true' : 'false')
    }, abortSignal)
  }
  if (role === 'togglebutton') {
    abortableEffect(() => {
      element.setAttribute('aria-pressed', properties.value.ariaPressed ? 'true' : 'false')
    }, abortSignal)
  }
  if (role === 'tab') {
    abortableEffect(() => {
      element.setAttribute('aria-selected', properties.value.ariaSelected ? 'true' : 'false')
    }, abortSignal)
  }
  abortableEffect(() => {
    const expanded = properties.value.ariaExpanded
    if (expanded != null) {
      element.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    } else {
      element.removeAttribute('aria-expanded')
    }
  }, abortSignal)
  if (role === 'link') {
    abortableEffect(() => {
      const href = properties.value.href
      if (href != null) {
        element.setAttribute('href', href)
      } else {
        element.removeAttribute('href')
      }
    }, abortSignal)
  }
  if (role === 'listbox') {
    // The one managed option (created by createHtmlA11yElement); aria-activedescendant already
    // points at it. setsize/posinset/selected/label are re-stamped as the active index moves, so
    // AT reads "n of N" without a DOM node per item.
    const option = element.querySelector<HTMLElement>('[role=option]')
    if (option != null) {
      abortableEffect(() => {
        const count = properties.value.ariaItemCount
        if (count != null) {
          option.setAttribute('aria-setsize', String(parseNumberValue(count)))
        } else {
          option.removeAttribute('aria-setsize')
        }
      }, abortSignal)
      abortableEffect(() => {
        const index = properties.value.ariaActiveIndex
        if (index != null) {
          option.setAttribute('aria-posinset', String(parseNumberValue(index) + 1))
        } else {
          option.removeAttribute('aria-posinset')
        }
      }, abortSignal)
      abortableEffect(() => {
        option.setAttribute('aria-selected', properties.value.ariaSelected ? 'true' : 'false')
      }, abortSignal)
      abortableEffect(() => {
        option.textContent = properties.value.ariaActiveLabel ?? ''
      }, abortSignal)
    }
  }
  if (role === 'slider') {
    const input = element as HTMLInputElement
    const setRange = (attr: 'min' | 'max' | 'step', value: unknown): void => {
      if (value != null) {
        input[attr] = String(parseNumberValue(value as Parameters<typeof parseNumberValue>[0]))
      }
    }
    abortableEffect(() => setRange('min', properties.value.ariaValueMin), abortSignal)
    abortableEffect(() => setRange('max', properties.value.ariaValueMax), abortSignal)
    abortableEffect(() => setRange('step', properties.value.ariaValueStep), abortSignal)
    abortableEffect(() => {
      const now = properties.value.ariaValueNow
      if (now != null) {
        input.value = String(parseNumberValue(now))
      }
    }, abortSignal)
    abortableEffect(() => {
      const text = properties.value.ariaValueText
      if (text != null) {
        input.setAttribute('aria-valuetext', text)
      } else {
        input.removeAttribute('aria-valuetext')
      }
    }, abortSignal)
  }
}

function warnMissingLabel(component: Component, role: A11yRole): void {
  if (!INTERACTIVE_ROLES.has(role)) {
    return
  }
  if (component.properties.peek().ariaLabel != null) {
    return
  }
  if (missingLabelWarned.has(component)) {
    return
  }
  missingLabelWarned.add(component)
  console.warn(
    `[uikit a11y] interactive role "${role}" has no ariaLabel — it is nameless to assistive tech.`
  )
}
