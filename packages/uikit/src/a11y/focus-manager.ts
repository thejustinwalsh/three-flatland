import { batch, computed, signal, type ReadonlySignal } from '@preact/signals-core'
import { Vector3, type Camera } from 'three'
import type { Component } from '../components/component.js'
import type { RootContext } from '../context.js'
import type { A11yActivationEvent } from './activation.js'
import { announce, getA11yPreferences } from './announce/announcer.js'
import { getRootA11yMembers } from './hidden-element.js'
import type { A11yViewport } from './projection.js'
import {
  computeSpatialOrder,
  focusDirectional as spatialFocusDirectional,
  type SpatialNavDirection,
} from './spatial-nav.js'
import { classifyA11yVisibility, type A11yVisibility } from './visibility.js'

/**
 * Spatial focus truth for world-space / XR roots (spec §5.1, Modes 3–4). Platform DOM focus alone
 * cannot follow a 3D scene: focus must skip panels the user cannot perceive and must SAY where
 * off-screen focus went. The manager owns that model and mirrors it into the hidden DOM elements so
 * platform AT tracks along — never the other way around inside XR.
 */

/**
 * How focus treats a target the user cannot currently see. `offscreen` also governs `occluded`
 * targets — and, for direct `setFocus` calls, `behind-camera`/`too-small` ones (sequential focus
 * never reaches those; they are excluded from {@link A11yFocusManager.focusables} outright).
 */
export interface FocusRevealPolicy {
  offscreen: 'skip' | 'announce' | 'reveal'
  /**
   * App-implemented reveal (camera follow, panel re-orient, teleport hint). The manager NEVER moves
   * the camera itself — motion is always app-owned and opt-in (XAUR motion-agnostic requirement).
   */
  onReveal?: (component: Component) => void
}

export interface A11yFocusManagerOptions {
  policy?: Partial<FocusRevealPolicy>
  camera?: Camera
  viewport?: A11yViewport
  /** Returns TRUE when the component is perceivable (unoccluded) — same contract as classifyA11yVisibility. */
  occlusionProbe?: (c: Component) => boolean
  /** When it returns true the DOM focus mirror is skipped — inside XR, `document.activeElement` is not the user's focus model. */
  isXRSession?: () => boolean
}

// Mirrors hidden-element.ts's INTERACTIVE_ROLES (not exported there; that file is frozen Phase 0-3 API).
const INTERACTIVE_ROLES = /* @__PURE__ */ new Set<string>([
  'button',
  'togglebutton',
  'link',
  'checkbox',
  'switch',
  'radio',
  'tab',
  'slider',
])

/** Lazy per-root singleton registry — keyed by RootContext so reparented components resolve consistently. */
const managers = /* @__PURE__ */ new WeakMap<RootContext, A11yFocusManager>()

const positionHelper = new Vector3()

/** Post-landing side effect for an off-`visible` target (spec §5.1). */
type FocusSideEffect = 'none' | 'reveal' | 'announce'

/** A resolved, accepted focus request awaiting application by the drain loop. */
interface FocusRequest {
  component: Component | undefined
  sideEffect: FocusSideEffect
}

/**
 * Livelock cap for the drain loop. `onFocusChange`/`onReveal` may re-enter `setFocus`; those requests
 * are queued and applied iteratively (not recursively — no stack overflow). If app callbacks keep
 * redirecting focus every transition, this bounds the loop so an unconditional A↔B redirect terminates
 * instead of spinning forever.
 */
const MAX_FOCUS_TRANSITIONS_PER_DRAIN = 64

export class A11yFocusManager {
  private readonly rootContext: RootContext
  private readonly policy: FocusRevealPolicy
  private readonly occlusionProbe?: (c: Component) => boolean
  private readonly isXRSession?: () => boolean
  private camera?: Camera
  private viewport?: A11yViewport

  private readonly focusedSignal = signal<Component | undefined>(undefined)
  /** Spatial focus truth for this root. */
  readonly focused: ReadonlySignal<Component | undefined> = this.focusedSignal

  // Bumped by refreshFocusables(): the camera pose is not a signal, so the nav methods force a
  // recompute on demand instead of trusting the computed's cache. Per-frame reactivity is
  // deliberately NOT wired here — the caller/adapters drive when perceivability is re-judged.
  private readonly focusablesVersion = signal(0)
  /**
   * Interactive-role members whose perceivability passes the focus policy: `visible` always;
   * `offscreen`/`occluded` only when `policy.offscreen !== 'skip'`; `behind-camera`/`too-small`/
   * `hidden` never; disabled components never. EMPTY until a camera+viewport are provided (via the
   * constructor or {@link setView}) — without a view the manager cannot judge perceivability.
   * Recomputed lazily when the nav methods run; external reads see the last computed snapshot.
   */
  readonly focusables: ReadonlySignal<Array<Component>>

  private lastOrder: Array<Component> | undefined

  /**
   * Reentrancy latch — THE echo-loop guard. Held across the whole focus mutation INCLUDING the
   * synchronous DOM dispatch of `element.focus()`/`element.blur()`, so `setFocus` and the focusin
   * adoption listener re-entered from those events return immediately. See {@link applyFocus} for
   * the full three-wall argument.
   */
  private isApplying = false
  private disposed = false

  // Iterative transition queue. `setFocus` resolves+enqueues a single latest request and drains it;
  // a `setFocus` re-entered from an onFocusChange/onReveal callback (while `draining`) just replaces
  // the pending request and returns, so the transition applies on the NEXT drain iteration rather than
  // recursing. This flattens re-entrant redirects — no stack overflow, and every hasFocus edge the
  // notifications observe is real (codex P3-round4 #1/#2/#3).
  private draining = false
  private pendingRequest: FocusRequest | undefined = undefined
  private hasPendingRequest = false

  /**
   * DOM → manager adoption: native focus moved by the platform (Tab, screen reader) lands on a
   * hidden member element; align the manager WITHOUT calling `element.focus()` back — the element
   * already holds native focus, so reflecting would be the first step of a ping-pong.
   */
  private readonly onDomFocusIn = (event: Event): void => {
    if (this.isApplying) {
      // Our own element.focus() dispatching synchronously — setFocus already holds the truth.
      return
    }
    const component = this.memberOf(event.target)
    if (component == null || component === this.focusedSignal.peek()) {
      return
    }
    // The platform already moved native focus here, so TRACK it unless the target cannot legitimately
    // hold focus — disabled, or not perceivable (codex P3 #2). Adoption is deliberately BROADER than
    // the nav predicate: any enabled, perceivable member the user reached (a `listbox`, a tabbable
    // `content` region — roles outside INTERACTIVE_ROLES) must be adopted, or `manager.focused`
    // desyncs from `document.activeElement` with no way to reconcile (codex P3-round2 #1).
    if (!this.canAdoptDomFocus(component)) {
      return
    }
    this.adopt(component)
  }

  constructor(rootComponent: Component, options?: A11yFocusManagerOptions) {
    this.rootContext = rootComponent.root.peek()
    this.policy = { offscreen: 'announce', ...options?.policy }
    this.camera = options?.camera
    this.viewport = options?.viewport
    this.occlusionProbe = options?.occlusionProbe
    this.isXRSession = options?.isXRSession
    this.focusables = computed(() => {
      void this.focusablesVersion.value // subscribe: refreshFocusables() bumps this to force a recompute
      return this.computeFocusables()
    })
    // Listen on document, not the per-root container: the container is refcounted and recreated as
    // members come and go, so a container-bound listener would silently die with it.
    if (typeof document !== 'undefined') {
      document.addEventListener('focusin', this.onDomFocusIn)
    }
  }

  /** Feed / update the view the manager judges perceivability and spatial order against. */
  setView(camera: Camera, viewport: A11yViewport): void {
    this.camera = camera
    this.viewport = viewport
  }

  /**
   * Move spatial focus. Sets the target's `hasFocus` (the SAME signal DOM focus writes — the
   * `focus` conditional and `onFocusChange` fire identically), clears the previous one, and mirrors
   * into `element.focus()` when a hidden element exists and no XR session is active. `undefined`
   * clears focus (and blurs the mirrored element).
   *
   * Off-`visible` targets follow the reveal policy: `skip` REFUSES to land (no-op — focus stays
   * where it was); `announce` (default) lands and announces a camera-relative position phrase;
   * `reveal` (or `opts.reveal === true`) lands and calls `policy.onReveal` exactly once — falling
   * back to `announce` when no `onReveal` is provided (off-screen focus must never be silent) or
   * when the user prefers reduced motion. `hidden` targets are always refused, as are disabled ones
   * (a control the user cannot operate must never hold focus — that is a trap).
   */
  setFocus(component: Component | undefined, opts?: { reveal?: boolean }): void {
    if (this.disposed) {
      return
    }
    const request = this.resolveFocusRequest(component, opts)
    if (request == null) {
      return // refused (already focused, disabled, hidden, or skip-policy)
    }
    // Latest-request-wins: a redirect from a callback supersedes any still-queued request.
    this.pendingRequest = request
    this.hasPendingRequest = true
    if (!this.draining) {
      this.drainFocus()
    }
  }

  /**
   * Validate + classify a focus request into an accepted {@link FocusRequest}, or null to refuse.
   * Refusals: already the focused component, disabled, `hidden`, or off-`visible` under `skip` policy.
   * Off-`visible` accepted targets carry a `reveal`/`announce` side effect (reveal falls back to
   * announce with no `onReveal` or under reduced motion — off-screen focus is never silent).
   */
  private resolveFocusRequest(
    component: Component | undefined,
    opts?: { reveal?: boolean }
  ): FocusRequest | null {
    if (component === this.focusedSignal.peek()) {
      return null
    }
    if (component == null) {
      return { component: undefined, sideEffect: 'none' }
    }
    if (component.properties.peek().disabled === true) {
      return null
    }
    const visibility = this.classify(component)
    if (visibility === 'visible') {
      return { component, sideEffect: 'none' }
    }
    if (visibility === 'hidden' || this.policy.offscreen === 'skip') {
      return null
    }
    const reveal =
      (this.policy.offscreen === 'reveal' || opts?.reveal === true) &&
      this.policy.onReveal != null &&
      !getA11yPreferences().value.reducedMotion
    return { component, sideEffect: reveal ? 'reveal' : 'announce' }
  }

  /**
   * Apply queued focus requests one at a time until the queue drains (or the livelock cap trips).
   * Each iteration commits the transition then fires its notifications; a `setFocus` re-entered from
   * those notifications only re-arms `pendingRequest`, so it is picked up by the NEXT loop iteration
   * instead of recursing. The post-landing side effect runs only for the RESTING transition — the one
   * left with no newer request queued — so a superseded/disposed target is never revealed or announced
   * (codex P3-round4 #3).
   */
  private drainFocus(): void {
    this.draining = true
    try {
      let budget = MAX_FOCUS_TRANSITIONS_PER_DRAIN
      while (this.hasPendingRequest && budget > 0) {
        budget -= 1
        const request = this.pendingRequest!
        this.hasPendingRequest = false
        this.pendingRequest = undefined
        this.applyFocus(request.component)
        if (
          !this.hasPendingRequest &&
          !this.disposed &&
          request.component != null &&
          this.focusedSignal.peek() === request.component
        ) {
          if (request.sideEffect === 'reveal') {
            this.policy.onReveal?.(request.component)
          } else if (request.sideEffect === 'announce') {
            this.announcePosition(request.component)
          }
        }
      }
      if (budget === 0) {
        // A callback kept redirecting focus every transition — stop rather than spin. Drop the
        // pending request; focus rests wherever the last applied transition left it.
        this.hasPendingRequest = false
        this.pendingRequest = undefined
      }
    } finally {
      this.draining = false
    }
  }

  /**
   * Sequential focus in spatial order (§4.2). WRAPS past the end back to the first entry. When the
   * current focus is stale (cleared, or no longer focusable), restarts at the first entry.
   */
  focusNext(): void {
    const order = this.orderedFocusables()
    if (order.length === 0) {
      return
    }
    const index = this.currentIndex(order)
    this.setFocus(order[(index + 1) % order.length])
  }

  /** Sequential focus, reversed. WRAPS past the start; with no (or stale) current focus it lands on the LAST entry. */
  focusPrev(): void {
    const order = this.orderedFocusables()
    if (order.length === 0) {
      return
    }
    const index = this.currentIndex(order)
    this.setFocus(
      index === -1 ? order[order.length - 1] : order[(index - 1 + order.length) % order.length]
    )
  }

  /** Focus the first entry in spatial order (Home). */
  focusFirst(): void {
    const order = this.orderedFocusables()
    if (order.length > 0) {
      this.setFocus(order[0])
    }
  }

  /** Focus the last entry in spatial order (End). */
  focusLast(): void {
    const order = this.orderedFocusables()
    if (order.length > 0) {
      this.setFocus(order[order.length - 1])
    }
  }

  /** Move focus to the nearest focusable whose projected center lies in the requested half-plane (§4.2); no-op when none. */
  focusDirectional(dir: SpatialNavDirection): void {
    const camera = this.camera
    const viewport = this.viewport
    if (camera == null || viewport == null) {
      return
    }
    const next = spatialFocusDirectional(this.refreshFocusables(), this.focusedSignal.peek(), dir, {
      camera,
      viewport,
    })
    if (next != null) {
      this.setFocus(next)
    }
  }

  /** Activate the focused component through the semantic activation path; `source` defaults to 'keyboard'. */
  activateFocused(event?: Partial<Omit<A11yActivationEvent, 'intersection'>>): void {
    this.focusedSignal.peek()?.activate({ ...event, source: event?.source ?? 'keyboard' })
  }

  /**
   * Tear down: unhook the DOM listener, clear focus so NO component is left stuck focused (its
   * `hasFocus` goes false and the mirrored element is blurred — DOM-only focus behavior is
   * restored), and vacate the per-root singleton slot so a later {@link getA11yFocusManager}
   * builds a fresh manager.
   */
  dispose(): void {
    if (this.disposed) {
      return
    }
    // Enter the disposed state BEFORE clearing focus. Clearing fires a blur onFocusChange outside the
    // latch, and a setFocus re-entered from there must be rejected — otherwise it would re-focus a
    // component on a manager whose focusin listener is already gone (codex P3-round3 #2). The clear
    // itself goes through applyFocus directly, which — unlike public setFocus — is not gated on
    // `disposed`, so disposal can still release the current focus.
    this.disposed = true
    if (typeof document !== 'undefined') {
      document.removeEventListener('focusin', this.onDomFocusIn)
    }
    this.applyFocus(undefined)
    this.lastOrder = undefined
    if (managers.get(this.rootContext) === this) {
      managers.delete(this.rootContext)
    }
  }

  /**
   * The single mutation site: `hasFocus` bookkeeping + DOM mirror, latched behind `isApplying`.
   *
   * Echo-loop safety (the adversarial target — `element.focus()` synchronously dispatches DOM
   * focus/blur events that land back in this module). Three independent walls stop a ping-pong:
   *
   * 1. `isApplying` is held across the whole mutation INCLUDING the `element.focus()`/`blur()`
   *    dispatch, so `setFocus` and `onDomFocusIn` re-entered from those events return immediately.
   * 2. `hasFocus` writes are idempotent — peek-before-write here, and `setupUpdateHasFocus`'s own
   *    DOM listener early-returns when the signal already matches — so the mirror's focus event
   *    causes no signal change and therefore no downstream effect run.
   * 3. Adoption never mirrors BACK into `element.focus()` (signals only) and no-ops when the target
   *    already IS the focused component — so even a hypothetical deferred/async focus event that
   *    misses wall 1 finds a converged state and stops.
   */
  private applyFocus(component: Component | undefined): void {
    const previous = this.focusedSignal.peek()
    const toBlur =
      previous != null && previous !== component && previous.hasFocus.peek() ? previous : undefined
    const toFocus = component != null && !component.hasFocus.peek() ? component : undefined
    this.isApplying = true
    try {
      batch(() => {
        if (toBlur != null) {
          toBlur.hasFocus.value = false
        }
        if (toFocus != null) {
          toFocus.hasFocus.value = true
        }
        this.focusedSignal.value = component
      })
      // DOM mirror — still latched, so the focus/blur events it dispatches back into this module are
      // ignored (wall 1). The idempotent hasFocus guards above mean the mirror causes no signal change
      // and therefore no onFocusChange fire from setupUpdateHasFocus (wall 2).
      if (this.isXRSession?.() !== true && typeof document !== 'undefined') {
        if (component == null) {
          const element = previous?.a11yElement
          if (element != null && document.activeElement === element) {
            element.blur()
          }
        } else {
          component.a11yElement?.focus()
        }
      }
    } finally {
      this.isApplying = false
    }
    // App callbacks fire ONLY after focus state is fully committed and the latch is released, so a
    // callback sees manager.focused === component, activateFocused() hits the right control, and a
    // re-entrant setFocus/dispose is honored rather than dropped mid-transition (codex P3-round2 #2).
    // Each fire is re-checked against the LIVE hasFocus so a re-entrant transition that already moved
    // focus on cannot deliver a now-stale notification (codex P3-round3 #1).
    this.notifyFocusChange(toBlur, false)
    this.notifyFocusChange(toFocus, true)
  }

  /** Align manager state to a DOM focus the platform already moved — signals only, no element.focus(). */
  private adopt(component: Component): void {
    const previous = this.focusedSignal.peek()
    const toBlur =
      previous != null && previous !== component && previous.hasFocus.peek() ? previous : undefined
    const toFocus = component.hasFocus.peek() ? undefined : component
    this.isApplying = true
    try {
      batch(() => {
        if (toBlur != null) {
          toBlur.hasFocus.value = false
        }
        if (toFocus != null) {
          toFocus.hasFocus.value = true
        }
        this.focusedSignal.value = component
      })
    } finally {
      this.isApplying = false
    }
    // Callbacks after commit + latch release (codex P3-round2 #2), each re-checked against live
    // hasFocus (codex P3-round3 #1). In the common Tab path both guards are already false —
    // setupUpdateHasFocus fired onFocusChange off the native focus/blur events — so this only fires
    // for the rare adopt where hasFocus was not already toggled by a DOM event.
    this.notifyFocusChange(toBlur, false)
    this.notifyFocusChange(toFocus, true)
  }

  /**
   * Deliver one onFocusChange, but ONLY if the component's live hasFocus still matches what we are
   * about to report. Callbacks fire outside the latch, so a re-entrant transition may have already
   * moved focus on; re-checking here coalesces the now-stale notification away (codex P3-round3 #1).
   */
  private notifyFocusChange(component: Component | undefined, focused: boolean): void {
    if (component != null && component.hasFocus.peek() === focused) {
      component.properties.peek().onFocusChange?.(focused)
    }
  }

  private memberOf(target: EventTarget | null): Component | undefined {
    if (!(target instanceof Node)) {
      return undefined
    }
    const members = getRootA11yMembers(this.rootContext)
    if (members == null) {
      return undefined
    }
    for (const [component, element] of members) {
      if (element === target || element.contains(target)) {
        return component
      }
    }
    return undefined
  }

  private computeFocusables(): Array<Component> {
    const camera = this.camera
    const viewport = this.viewport
    if (camera == null || viewport == null) {
      return []
    }
    const members = getRootA11yMembers(this.rootContext)
    if (members == null) {
      return []
    }
    const result: Array<Component> = []
    for (const component of members.keys()) {
      if (this.passesFocusPolicy(component)) {
        result.push(component)
      }
    }
    return result
  }

  /**
   * The focusable predicate shared by the focusables snapshot AND DOM-focus adoption: an interactive,
   * enabled role whose a11yVisibility passes the reveal policy — visible always; offscreen/occluded
   * only when the policy is not 'skip'; behind-camera/too-small/hidden never.
   */
  private passesFocusPolicy(component: Component): boolean {
    const properties = component.properties.value
    if (
      properties.role == null ||
      !INTERACTIVE_ROLES.has(properties.role) ||
      properties.disabled === true
    ) {
      return false
    }
    const visibility = this.classify(component)
    if (visibility === 'visible') {
      return true
    }
    if (visibility === 'offscreen' || visibility === 'occluded') {
      return this.policy.offscreen !== 'skip'
    }
    return false
  }

  /**
   * Whether native DOM focus that ALREADY landed on `component` should be adopted as the tracked
   * spatial focus. Unlike {@link passesFocusPolicy} (which gates the manager's own sequential nav to
   * interactive, perceivable, policy-passing members), adoption only rejects targets that cannot
   * legitimately hold focus at all — disabled, or not perceivable (hidden / behind-camera /
   * too-small). Everything else the platform focused — including non-INTERACTIVE_ROLES members like
   * `listbox` or a tabbable `content` region — is adopted so the manager stays in sync with reality.
   */
  private canAdoptDomFocus(component: Component): boolean {
    if (component.properties.value.disabled === true) {
      return false
    }
    const visibility = this.classify(component)
    return visibility !== 'hidden' && visibility !== 'behind-camera' && visibility !== 'too-small'
  }

  private refreshFocusables(): Array<Component> {
    this.focusablesVersion.value++
    return this.focusables.value
  }

  private orderedFocusables(): Array<Component> {
    const camera = this.camera
    const viewport = this.viewport
    const list = this.refreshFocusables()
    if (camera == null || viewport == null || list.length === 0) {
      this.lastOrder = undefined
      return []
    }
    const order = computeSpatialOrder(list, { camera, viewport }, { previousOrder: this.lastOrder })
    this.lastOrder = order
    return order
  }

  private currentIndex(order: Array<Component>): number {
    const current = this.focusedSignal.peek()
    return current == null ? -1 : order.indexOf(current)
  }

  /** Without a view the manager cannot judge perceivability — treat as visible (focus lands plainly). */
  private classify(component: Component): A11yVisibility {
    const camera = this.camera
    const viewport = this.viewport
    if (camera == null || viewport == null) {
      return 'visible'
    }
    return classifyA11yVisibility(component, camera, viewport, {
      occlusionProbe: this.occlusionProbe,
    })
  }

  private announcePosition(component: Component): void {
    const message =
      component.properties.peek().a11yPositionDescription ?? this.positionPhrase(component)
    announce(message, { source: component, kind: 'focus' })
  }

  /**
   * Camera-relative direction phrase for a target the user cannot currently see — always contains
   * a direction word (left/right/above/below/behind) so AT users know where off-screen focus went.
   * Dominant camera-space axis wins; positive camera-space z means behind the viewer.
   */
  private positionPhrase(component: Component): string {
    const properties = component.properties.peek()
    const label = properties.ariaLabel ?? properties.a11ySpatialLabel ?? 'Focus'
    const camera = this.camera
    if (camera == null) {
      // Unreachable via setFocus (classify() reports 'visible' without a camera); safe fallback.
      return `${label} is off screen`
    }
    camera.updateWorldMatrix(true, false)
    component.getWorldPosition(positionHelper).applyMatrix4(camera.matrixWorldInverse)
    if (positionHelper.z > 0) {
      return `${label} is behind you`
    }
    const direction =
      Math.abs(positionHelper.x) >= Math.abs(positionHelper.y)
        ? positionHelper.x < 0
          ? 'to the left'
          : 'to the right'
        : positionHelper.y > 0
          ? 'above'
          : 'below'
    return `${label} is ${direction}`
  }
}

/**
 * Lazy per-root singleton (keyed by the root's RootContext in a module WeakMap). The first call
 * constructs the manager with `options`; later calls return the existing instance and IGNORE
 * `options`. `dispose()` vacates the slot, so a subsequent call builds a fresh manager.
 */
export function getA11yFocusManager(
  root: Component,
  options?: A11yFocusManagerOptions
): A11yFocusManager {
  const context = root.root.peek()
  let manager = managers.get(context)
  if (manager == null) {
    manager = new A11yFocusManager(root, options)
    managers.set(context, manager)
  }
  return manager
}

/**
 * Focus-routing seam for `Component.focus()`/`blur()` (spec §1.2 item 4) WITHOUT editing
 * component.ts: when a manager exists for the component's root, spatial focus takes it (returns
 * true); otherwise returns false and the caller falls back to `component.focus()` (plain hidden
 * element focus, Mode 1). Integrators wire this into their focus entry points; either way the
 * manager's DOM mirror + focusin adoption keep both models converged.
 */
export function routeFocusThroughManager(component: Component): boolean {
  const manager = managers.get(component.root.peek())
  if (manager == null) {
    return false
  }
  manager.setFocus(component)
  return true
}

/**
 * Keyboard scene navigation for a root: ArrowLeft/Right/Up/Down → {@link A11yFocusManager.focusDirectional},
 * Home/End → first/last focusable. Tab is deliberately left to the native platform — the hidden
 * elements are real focusable DOM. Uses the root's lazy singleton manager (configure it with a
 * camera/viewport first, or focusables stay empty). Returns an unbind function.
 *
 * The listener sits on `document`, scoped to keys targeting this root's a11y member elements —
 * behaviorally identical to binding the per-root container, but it survives the container being
 * refcount-released and recreated as members come and go. Keys already handled closer to the
 * target are respected: `defaultPrevented` events (listbox grammar) are ignored, and `<input>`
 * members (slider range) keep their native arrow/Home/End handling.
 */
export function enableKeyboardSceneNav(root: Component): () => void {
  if (typeof document === 'undefined') {
    return () => {}
  }
  const manager = getA11yFocusManager(root)
  const context = root.root.peek()
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return
    }
    const target = event.target
    if (!(target instanceof Node) || target instanceof HTMLInputElement) {
      return
    }
    const members = getRootA11yMembers(context)
    if (members == null) {
      return
    }
    let isMember = false
    for (const element of members.values()) {
      if (element === target || element.contains(target)) {
        isMember = true
        break
      }
    }
    if (!isMember) {
      return
    }
    switch (event.key) {
      case 'ArrowLeft':
        manager.focusDirectional('left')
        break
      case 'ArrowRight':
        manager.focusDirectional('right')
        break
      case 'ArrowUp':
        manager.focusDirectional('up')
        break
      case 'ArrowDown':
        manager.focusDirectional('down')
        break
      case 'Home':
        manager.focusFirst()
        break
      case 'End':
        manager.focusLast()
        break
      default:
        return
    }
    event.preventDefault()
  }
  document.addEventListener('keydown', onKeyDown)
  return () => document.removeEventListener('keydown', onKeyDown)
}
