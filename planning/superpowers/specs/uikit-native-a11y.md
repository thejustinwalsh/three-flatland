# Accessibility for `@three-flatland/uikit` — screen-space core + spatial/XR layer

**Status:** spec v2 — reworked after cross-vendor adversarial review (`uikit-native-a11y-codex-review.md`); ready for implementation via `planning/superpowers/plans/uikit-a11y-*.md`
**Scope:** `packages/uikit`, `packages/uikit-default`, `packages/uikit-lucide/example`, `examples/*/uikit`
**Decision context (settled):** `@react-three/a11y` was evaluated and rejected as a dependency — its `<A11y>` wrapper renders a THREE `<group>`, which uikit's child guard rejects (`component.ts` — `hasNonUikitChildren: false` components throw on non-uikit children), and its pointer-catching group is redundant with uikit's own pointer-event system. It survives only as a semantics reference.
**Review verdict honored here:** the DOM-shadow core is sound **for screen-space** and is preserved intact; it is no longer presented as the whole answer. Accessibility for uikit is a mode-layered system: DOM semantics + required projection for anything rendered to a browser canvas, and a parallel spatial layer — independent of `document.activeElement` — for diegetic 3D and immersive XR.

---

## 0. The mode map

A uikit panel can be experienced four ways. Each mode names its **focus truth**, its **output channel**, and its **activation path**. A component does not choose a mode; the *root's environment* does (renderer target, XR session state, projection availability). Modes 1+2 ship first and are the foundation; Modes 3+4 layer on top of the same property schema and the same semantic-activation API.

| Mode | Situation | Focus truth | Output channel | Geometry contract |
|---|---|---|---|---|
| **1 — screen/canvas DOM semantics** | uikit rendered to a canvas in a normal page | `document.activeElement` on hidden native elements | Platform AT (VoiceOver/NVDA/TalkBack) via real DOM | Requires Mode 2 projection; off-screen placement is a *documented degraded fallback only* |
| **2 — projected canvas geometry** | Same as 1 — this is Mode 1's required geometry pipeline | (same as 1) | (same as 1) | Hidden elements sized/positioned at the panel's projected screen rect, per frame |
| **3 — diegetic 3D, moving camera (non-XR)** | World-space panels in a game/scene; camera moves; panels occlude, leave frustum | `A11yFocusManager` (spatial), mirrored into DOM focus when a hidden element exists | Platform AT where reachable + announcement backends | `a11yVisibility` (frustum/occlusion/size aware), spatial nav order, focus-reveal policy |
| **4 — immersive XR** | Active `XRSession` (VR/AR); controller ray, gaze, hand, switch | `A11yFocusManager` **only** — `document.activeElement` is not perceivable in-headset and is never the source of truth | Announcement backends (captions, spatial audio/earcons, haptics, speech); DOM Overlay for true 2D companion UI only | Spatial metadata props; XAUR-driven requirements |

The one thing every mode shares: **semantic activation** (§2). Focus models differ, output channels differ, but "the user activated this control" is a single API with a modality source, and every widget behavior hangs off it.

---

## 1. Mode 1 — screen/canvas DOM semantics (the preserved core)

uikit already ships this machinery for one component: `packages/uikit/src/text/input/hidden-input.ts` creates a real hidden DOM `<input>`/`<textarea>`, appends it to `document.body`, reactively syncs `tabIndex`/`disabled`/`autocomplete`/`type`/`value` from properties signals via `abortableEffect`, and `setupUpdateHasFocus` routes `document.activeElement === element` back into the component's `hasFocus` signal — driving the `focus` style conditional. **Mode 1 generalizes that exact pattern to every component with a `role`.**

```
uikit Component (Mesh)                    hidden DOM element (per-root container)
┌─────────────────────────┐   props →    ┌──────────────────────────────────┐
│ properties.value.role   │──────────────│ <button> / <a> / <input range> … │
│ properties.value.aria*  │  abortable   │ aria-* / disabled / tabIndex     │
│                         │   Effect     │ rect = projected panel (Mode 2)  │
│ activate({source}) ◄────┼──────────────│ 'click' (Enter/Space/AT)         │
│ hasFocus: Signal<bool>  │◄─────────────│ focus/blur (activeElement)       │
│  └→ `focus` conditional │              │                                  │
└─────────────────────────┘              └──────────────────────────────────┘
```

### 1.1 Module layout

```
packages/uikit/src/a11y/
  index.ts             re-exports; wired into packages/uikit/src/index.ts
  hidden-element.ts    createHtmlA11yElement + setupComponentA11y + aria sync (Mode 1)
  focus.ts             setupUpdateHasFocus (MOVED from text/input/hidden-input.ts)
  activation.ts        A11yActivationEvent, Component.activate plumbing (§2)
  projection.ts        setupA11yProjection — required geometry pipeline (Mode 2, §3)
  visibility.ts        computedA11yVisibility (Mode 3, §4.1)
  spatial-nav.ts       ordering, groups, directional nav (Mode 3, §4.2)
  focus-manager.ts     A11yFocusManager — spatial focus truth (Modes 3–4, §5.1)
  adapters/            XR input adapters: controller-ray.ts, gaze.ts, switch-scan.ts (§5.2)
  announce/            announcer.ts (registry) + backends/: dom-live-region.ts,
                       caption.ts, earcon.ts, haptic.ts, speech.ts (§6)
```

### 1.2 `hidden-element.ts`

```ts
export type A11yRole =
  | 'button' | 'togglebutton' | 'link' | 'checkbox' | 'switch' | 'radio' | 'tab'
  | 'slider'        // <input type="range"> — native arrow-key handling
  | 'image'         // <img alt> (1px transparent data-URI svg)
  | 'content'       // <p>; textContent = ariaLabel; focusable only if tabIndex set
  | 'listbox'       // virtualized region: aria-activedescendant + posinset/setsize (§8)
  | 'landmark'      // <section aria-label> — grouping/wayfinding (Mode 3 nav anchor)

/** Element factory — mirrors createHtmlInputElement. Elements are opacity:0 +
 *  pointer-events:none but REAL-SIZED and positioned by Mode 2 projection;
 *  `left:-1000vw` off-screen placement happens ONLY in the degraded fallback (§3.3). */
export function createHtmlA11yElement(role: A11yRole): HTMLElement

/** Reactive orchestrator, called once from the Component constructor (§1.4).
 *  One abortableEffect keyed on `properties.value.role`: role null → no element
 *  (zero cost); role set/changed → create element, append into the per-root a11y
 *  container, wire aria sync + activation + focus routing; cleanup → element.remove().
 *  SSR guard: no-ops when `typeof document === 'undefined'`. */
export function setupComponentA11y(component: Component, abortSignal: AbortSignal): void

/** Shared aria sync used by BOTH a11y elements and Input's hidden <input>:
 *  ariaLabel → aria-label, ariaDescription → aria-description. Folds in the fix
 *  for Input's currently-nameless hidden element. */
export function setupAriaAttributes(
  properties: Component['properties'], element: HTMLElement, abortSignal: AbortSignal
): void
```

Per-attribute `abortableEffect`s (mirroring `setupHtmlInputElement` style): `tabIndex` (default 0 for interactive roles; `-1` when disabled / non-perceivable per §4.1), `disabled`/`aria-disabled`, `aria-checked|pressed|expanded|selected` per role, slider `min/max/step/value` + `aria-valuetext` with `'input'` → `onA11yValueChange`, link `href` (SR context; navigation preventDefault-ed), name/description via `setupAriaAttributes`.

**Activation routing:** the element's `'click'` (which native buttons fire for Enter/Space and AT activation) calls `component.activate({ source: 'screen-reader', nativeEvent })` (`'keyboard'` when a real keydown is in flight) — see §2. No raw synthetic three `'click'` as the primary path; provenance is explicit.

**Focus routing:** `setupUpdateHasFocus(element, component.hasFocus, f => properties.peek().onFocusChange?.(f), abortSignal)` — the moved primitive, unchanged.

**Per-root a11y container:** one `<div data-uikit-a11y>` per uikit root (`WeakMap<RootContext, {element, refCount}>` in `hidden-element.ts`; no `RootContext` type change), appended to `document.body`, removed at refCount 0. Mode 2 positions this container over the canvas and children within it.

### 1.3 Properties schema — `packages/uikit/src/properties/schema.ts`

New `a11yPropertyShape` spread into `baseOutPropertyShape`. Everything optional; every value signal-accepting via the existing `propertyValueSchema` union, so kit widgets bind `computed(...)` in `defaultOverrides` — the pub-sub system is the state-threading story. Types flow automatically to every vanilla constructor and React JSX component (wrappers are `build()`-generated over `z.input`); **no React-side type work**.

```ts
const a11yPropertyShape = /* @__PURE__ */ defineSchema(() => ({
  // ——— semantics (Mode 1) ———
  role: enumSchema(['button','togglebutton','link','checkbox','switch','radio','tab',
                    'slider','image','content','listbox','landmark']).optional(),
  ariaLabel: string().optional(),
  ariaDescription: string().optional(),
  tabIndex: numberValueSchema.optional(),          // hoisted from input.ts
  disabled: boolean().optional(),                  // a11y semantics; visuals stay per-kit (§14.5)
  href: string().optional(),
  ariaChecked: boolean().optional(),
  ariaPressed: boolean().optional(),
  ariaExpanded: boolean().optional(),
  ariaSelected: boolean().optional(),
  ariaValueMin: numberValueSchema.optional(),
  ariaValueMax: numberValueSchema.optional(),
  ariaValueNow: numberValueSchema.optional(),
  ariaValueStep: numberValueSchema.optional(),
  ariaValueText: string().optional(),
  ariaItemCount: numberValueSchema.optional(),     // listbox (§8)
  ariaActiveIndex: numberValueSchema.optional(),
  ariaActiveLabel: string().optional(),
  activationMessage: string().optional(),          // announced on activate
  deactivationMessage: string().optional(),        // announced on toggle-off
  // ——— spatial semantics (Modes 3–4; §4–§5) ———
  a11yOrder: numberValueSchema.optional(),         // authorable nav order within group
  a11yGroup: string().optional(),                  // nav grouping / landmark membership
  a11ySpatialLabel: string().optional(),           // "wall terminal, north wall"
  a11yPositionDescription: string().optional(),    // "two meters ahead, slightly left" (app/computed)
  a11yReachable: boolean().optional(),             // app-declared reachability
  a11yVisibilityOverride: enumSchema(['visible','hidden']).optional(), // force include/exclude from AT
  // ——— handlers ———
  onFocusChange: functionSchema.optional(),        // hoisted from input.ts
  onActivate: functionSchema.optional(),           // (event: A11yActivationEvent) => void  (§2)
  onA11yValueChange: functionSchema.optional(),
  onA11yActiveIndexChange: functionSchema.optional(),
  onA11yActivate: functionSchema.optional(),       // listbox item activation
}))
```

`uikit-default` widget schemas spread `...baseOutPropertyShape` then re-declare `disabled` — identical type, harmless override; leave them. Remove `tabIndex`/`onFocusChange` from `inputOutPropertiesSchema` once hoisted (`inputDefaults.tabIndex = 0` stays).

### 1.4 `Component` base-class wiring — `packages/uikit/src/components/component.ts`

1. **Hoist `hasFocus`.** `readonly hasFocus: Signal<boolean>` = `config?.hasFocus ?? signal(false)`, passed to `createConditionals(...)`. `Input` keeps passing its own via config (zero behavior change), drops its own field. Consequence: the already-parsed `focus={{...}}` conditional becomes live for every component with a role — focus rings are just props.
2. **`activate(event?)`** — §2. The semantic entry point, on the base class.
3. **`setupComponentA11y(this, this.abortSignal)`** at end of constructor, unless `config?.ownsHiddenA11yElement` (new flag; `Input`/`Textarea` pass it — their hidden `<input>` *is* their a11y element; they call `setupAriaAttributes(...)` beside `setupHtmlInputElement`).
4. **`focus()` / `blur()`** — focus/blur the hidden element if present (Mode 1) or route to the root's `A11yFocusManager` when one is active (Modes 3–4). `Input.focus(start?, end?, direction?)`/`blur()` remain valid overrides.

---

## 2. Semantic activation — the cross-mode truth (`a11y/activation.ts`)

Adversarial finding #8, accepted: a synthetic mouse-shaped `'click'` collapses modalities and lies about geometry. Activation becomes a first-class semantic event; **pointer clicks delegate to it, not the reverse.**

```ts
export type A11yActivationSource =
  | 'pointer' | 'keyboard' | 'screen-reader' | 'voice'
  | 'xr-controller' | 'gaze' | 'hand' | 'switch'

export type A11yActivationEvent = {
  source: A11yActivationSource
  nativeEvent?: unknown            // DOM event / XRInputSourceEvent when available
  intersection?: Intersection      // REAL geometry when source is 'pointer'/'xr-controller'; absent otherwise
  handedness?: 'left' | 'right' | 'none'
  stopPropagation?: () => void
}

// events.ts: Object3DEventMap gains  activate: A11yActivationEvent
// eventHandlerShape / EventHandlersProperties gain  onActivate
```

`Component.activate(event)`:
1. Returns early when `properties.peek().disabled`.
2. Dispatches `'activate'` through the existing three EventDispatcher — so `onActivate` from input props, classes, star props, and kit `defaultOverrides` all fire via the exact `computedHandlers`/`addEventListener` chain already in `component.ts`.
3. **Compat shim:** afterwards dispatches a `'click'` whose event is honestly marked — `{ synthetic: true, source, point: panel center world pos, distance: camera distance if a projection/focus manager knows it else 0 }` — so existing user `onClick`-only code keeps working for keyboard/AT activation. Documented: geometry-sensitive `onClick` handlers must check `synthetic`. Skipped when `event.source === 'pointer'` (the real click already ran).
4. Announces `activationMessage`/`deactivationMessage` (pre-reading `ariaChecked ?? ariaPressed` to pick) through the announcer registry (§6).

**Pointer delegation:** the base Component registers an internal `'click'` listener (guarded against the shim's synthetic events) that calls `this.activate({ source: 'pointer', intersection: clickEvent, nativeEvent: clickEvent.nativeEvent })`. Kit widgets **move their behavior from `onClick` to `onActivate`** (Checkbox toggle, TabsTrigger select, AccordionTrigger expand…), which is what makes controller/gaze/switch activation in Modes 3–4 work with zero further per-widget code.

---

## 3. Mode 2 — projection: the required geometry pipeline (`a11y/projection.ts`)

Adversarial finding #2, accepted: without projection, mobile touch-exploration and voice control ("click Settings" resolves by accessible name + on-screen position) cannot map the target to what is visible. **Projection is required for Mode 1**, not a nice-to-have.

```ts
export type A11yProjectionOptions = {
  camera: Camera
  renderer: { domElement: HTMLCanvasElement }   // rects are relative to this canvas
  /** optional app hook for occlusion (§4.1); default: frustum-only */
  isPerceivable?: (component: Component) => boolean
}
/** Registers into root.onFrameSet. Each frame: for every a11y element under this
 *  root, compute the panel's screen-space AABB (globalMatrix × size × pixelSize,
 *  4 corners projected through camera, clamped to canvas, offset by canvas
 *  client rect) and write left/top/width/height on the hidden element inside the
 *  per-root container (position:absolute; container overlays the canvas).
 *  Off-frustum / degenerate rect → visibility policy (§4.1) decides exposure.
 *  Writes only on change (epsilon 1px) — zero DOM churn on a static camera.
 *  Returns dispose. */
export function setupA11yProjection(root: Component, options: A11yProjectionOptions): () => void
```

- **React:** auto-wired. `build()`'s `useSetup` (or the `Fullscreen`/root path) calls `setupA11yProjection` with `useThree`'s camera + `gl.domElement` once per root — R3F knows both, so React users get projected a11y by default with no extra component.
- **Vanilla:** explicit `setupA11yProjection(rootComponent, { camera, renderer })` — one line next to the existing `component.update(delta)` wiring.
- Elements stay `opacity: 0; pointer-events: none` (a11y hit-testing ignores pointer-events; real pointer input continues to hit the canvas), but are **real-sized** — this is what makes iOS/Android touch-exploration and voice-control targeting land on the visible control.

### 3.3 Degraded fallback (documented, warned)

When projection cannot be configured (vanilla app without camera access, headless), elements fall back to the `Input` precedent: off-screen block at `left:-1000vw`. Keyboard + linear SR navigation still work; touch-exploration and voice targeting do not. A one-shot dev-mode `console.warn` fires when a role is set under a root with no projection configured. This is the *only* sanctioned off-screen path.

---

## 4. Mode 3 — diegetic 3D, moving camera (non-XR)

Diegetic explicitly includes the ordinary case: a 3D-positioned panel in a mouse-driven game on a flat screen. uikit's pointer events already resolve that mouse click via raycast — pointer users need nothing new. The a11y work is for everyone else: keyboard, voice-control, and magnifier users need the Mode-1/2 DOM shadow projected to where the panel *currently appears on screen* (projection is load-bearing outside XR too). Beyond that, world-space panels break two further Mode-1 assumptions: render-visibility ≈ perceivability (finding #6) and construction order as a sane focus order (finding #5). And focus can land somewhere the user can't see (finding #7).

### 4.1 `a11yVisibility` — separate from render visibility (`a11y/visibility.ts`)

```ts
export type A11yVisibility =
  | 'visible'        // in frustum, unoccluded, big enough
  | 'offscreen'      // outside frustum, in front hemisphere
  | 'behind-camera'
  | 'occluded'       // app/probe says another mesh covers it
  | 'too-small'      // projected rect under minPerceivableSize (default 8px)
  | 'hidden'         // component.isVisible false or a11yVisibilityOverride 'hidden'

export function computedA11yVisibility(
  component: Component,
  camera: Signal<Camera | undefined>,
  options?: { occlusionProbe?: (c: Component) => boolean; minPerceivableSize?: number }
): ReadonlySignal<A11yVisibility>
```

- Core computes frustum/behind/too-small from `globalMatrix` + `size` + `pixelSize` + camera (cheap; runs inside the Mode-2 frame pass, not per-signal-change).
- **Occlusion is an app hook** (`occlusionProbe`), with an optional provided helper `createRaycastOcclusionProbe(scene, { budgetPerFrame: 8 })` — raycasts are budgeted and round-robined; occlusion is opt-in because it's the expensive part.
- Policy mapping (defaults, all overridable): `visible` → exposed + focusable; `offscreen`/`occluded` → exposed to AT with position description, **skipped by sequential focus** unless focus-reveal (§4.3) is active; `behind-camera`/`too-small` → `aria-hidden`; `hidden` → removed. `a11yVisibilityOverride` force-includes (e.g. a critical alarm panel that must stay reachable) or force-excludes.
- Mode 1 (Fullscreen/screen-space roots) short-circuits to `visible|hidden` — no cost.

### 4.2 Spatial navigation (`a11y/spatial-nav.ts`)

Construction order is acceptable **only** for flat screen-space layouts. For world-space roots:

- **Authorable:** `a11yOrder` (number, sorts within a group), `a11yGroup` (string), `role: 'landmark'` + `ariaLabel` marks wayfinding anchors ("Cockpit panel", "Inventory wall").
- **Computed:** default order = groups sorted by camera distance of their bounding centers, components within a group by `a11yOrder ?? camera-relative reading order` (projected top-left → bottom-right, hysteresis so small camera moves don't reshuffle mid-tab).
- **Directional nav:** `focusDirectional('left'|'right'|'up'|'down')` on the focus manager — nearest focusable by projected camera-space position in that half-plane. Backs both arrow-key nav on landmark containers and XR thumbstick nav.
- **DOM ordering sync:** for Mode 1 targets, the per-root container re-appends hidden elements to match computed order when it changes while no element inside holds focus (never yanks the tab cursor).

### 4.3 Focus-reveal policy (finding #7)

```ts
export type FocusRevealPolicy = {
  offscreen: 'skip' | 'announce' | 'reveal'      // default 'announce'
  onReveal?: (component: Component) => void       // app moves camera / scrolls / re-orients panel
}
```

- `skip`: sequential focus never lands outside `visible`.
- `announce` (default): focus may land there; the announcer emits the position description ("Settings panel — behind you, to the left") built from `a11yPositionDescription` ?? computed camera-relative octant; an earcon backend (§6) can pan the cue spatially.
- `reveal`: calls `onReveal` — camera-follow / panel auto-orient is **always app-implemented and opt-in** (comfort: never auto-move the camera by default; XAUR motion-agnostic requirement).

---

## 5. Mode 4 — immersive XR

Inside an `XRSession`, `document.activeElement` is not the user's focus model and an off-screen live region may not be perceivable (findings #3, #9). Mode 4 stands on three legs: the focus manager, input adapters, and announcement backends. The DOM focus bridge *mirrors* spatial focus when hidden elements exist; it is never the source of truth.

**Input foundation (verified 2026-07-12):** `@pmndrs/xr` implements **no accessibility** — its core (`packages/xr/src`) is XR input/setup only: controllers, hands, pointers, teleport, hit-test, emulate, store; zero tabIndex/activeElement/announcer/aria machinery. It is built on the same `@pmndrs/pointer-events` uikit already depends on. The division is therefore clean: **@pmndrs/xr is the XR input plumbing to integrate with, not reinvent** — it turns controllers/hands into pointer-events rays that already hit uikit panels — and this layer supplies exactly what it lacks: AT focus semantics, announcements, dwell/scan modalities. uikit has zero XR binding today; the Phase-4 dogfood establishes it (`@react-three/xr` in the react example, `@pmndrs/xr` in the vanilla pair). Integration is duck-typed/optional-peer — no new hard runtime dependency: session detection defaults to three's `renderer.xr` `sessionstart`/`sessionend` events, reading @pmndrs/xr's `store` for richer mode/input-source state when the app provides one; its `emulate` (IWER-based) is the test harness.

### 5.1 `A11yFocusManager` (`a11y/focus-manager.ts`) — Modes 3–4

```ts
export class A11yFocusManager {
  constructor(root: Component, options?: { policy?: FocusRevealPolicy })
  readonly focused: Signal<Component | undefined>       // spatial focus truth
  focusNext(): void; focusPrev(): void                  // computed order (§4.2)
  focusDirectional(dir: 'left'|'right'|'up'|'down'): void
  setFocus(component: Component | undefined, opts?: { reveal?: boolean }): void
  activateFocused(event: Omit<A11yActivationEvent, 'intersection'>): void
  /** focusables snapshot: role interactive + a11yVisibility policy-pass */
  readonly focusables: ReadonlySignal<Array<Component>>
  dispose(): void
}
```

- Writing `focused` sets the target component's `hasFocus` signal (same signal DOM focus writes — the `focus` conditional and `onFocusChange` fire identically) and clears the previous one.
- **DOM mirror:** when the focused component has a hidden element and no XR session is active, `setFocus` also calls `element.focus()` so platform AT tracks along; inside an XR session the mirror is skipped (no DOM focus dependence).
- One manager per root, lazily created by the first adapter or by explicit construction; exposed as `getA11yFocusManager(root)`.

### 5.2 Input adapters (`a11y/adapters/`)

Each adapter is a small setup function binding an input source to the manager; all activation flows through `component.activate({source, ...})`:

- **`controller-ray.ts`** — @pmndrs/xr (when wired by the app) delivers controller/hand rays as `@pmndrs/pointer-events` pointers that already produce uikit hover/click; the adapter listens to uikit's own pointer-event stream (XR pointers arrive tagged with their pointer type/state) and maps "ray dwell on focusable ≥ debounce" → `setFocus`, select/squeeze → `activateFocused({source:'xr-controller', handedness})`, and thumbstick flicks (via the @pmndrs/xr store's input sources, or raw `XRInputSource.gamepad` polling when absent) → `focusDirectional`. Real intersections pass through — no geometry lies, and no parallel raycasting is built.
- **`gaze.ts`** — head/eye-gaze reticle: dwell timer (default 800 ms, configurable, visual progress ring hook) → `setFocus`; continued dwell or select → activate with `source:'gaze'`.
- **`switch-scan.ts`** — single/dual-switch scanning: auto-advance interval over `focusables` (row-column scanning per `a11yGroup`), switch press → activate with `source:'switch'`. Also usable outside XR (motor a11y on desktop).

Keyboard/gamepad in-scene nav (non-XR Mode 3) reuses the same manager: arrow/tab bindings on the canvas → `focusNext/Directional`.

### 5.3 Announcement backends — §6; captions/earcons/haptics are the in-headset output channel.

### 5.4 Spatial metadata (finding #10)

`a11ySpatialLabel`, `a11yPositionDescription`, `a11yGroup`, landmark roles (§1.3) plus query helpers:

```ts
/** flattened semantic tree for AT bridges / debugging / test assertions */
export function getA11yTree(root: Component): Array<{
  component: Component; role: A11yRole; label?: string;
  visibility: A11yVisibility; group?: string; order: number
}>
/** "Three controls: Play button, two meters ahead; Settings, to your left; …" */
export function describeSurroundings(manager: A11yFocusManager): string
```

`describeSurroundings` output feeds a voice command / help gesture ("where am I?") — an XAUR spatial-orientation requirement.

### 5.5 WebXR DOM Overlay — what it is and is not (finding #4)

- **Is:** a way to keep *true 2D companion/overlay UI* (pause menu, caption strip, settings sheet) as real DOM inside AR sessions (`optionalFeatures: ['dom-overlay']`), fully accessible by the platform's own AT. The per-root a11y container + caption backend element are valid DOM Overlay content; when a session grants `dom-overlay`, the announcer's caption backend renders there.
- **Is not:** an accessibility model for in-scene panels. A panel on a wall is Mode 4; DOM Overlay never describes or focuses the mesh.
- Support is uneven (AR-first; headset browsers vary) — always feature-detect; Mode 4 must be complete without it. Reference: [WebXR DOM Overlays Module](https://immersive-web.github.io/dom-overlays/).

---

## 6. Announcer — backend registry (`a11y/announce/`)

Finding #9 accepted: one DOM live region is a browser-mode backend, not the system.

```ts
export type Politeness = 'polite' | 'assertive'
export type Announcement = {
  message: string; politeness: Politeness
  source?: Component            // enables spatial audio panning / caption anchoring
  kind?: 'activation' | 'focus' | 'status'
}
export interface AnnouncementBackend {
  announce(a: Announcement): void
  dispose?(): void
}
export function registerAnnouncementBackend(b: AnnouncementBackend): () => void
export function announce(message: string, opts?: Partial<Omit<Announcement,'message'>>): void
```

Backends (each its own file, independently tree-shakeable):
- **`dom-live-region.ts`** — default, auto-registered on first `announce` in a DOM env: singleton off-screen live region (clip-rect pattern), clear-then-set ~100 ms so repeats re-announce (react-three-a11y port, no zustand, framework-free). Mounts inside the DOM Overlay root when a session provides one.
- **`caption.ts`** — in-world caption panel: a camera-anchored uikit `Container`+`Text` (dogfoods uikit) showing the last message, per XAUR captions requirement; user prefs: on/off, size, anchor.
- **`earcon.ts`** — Web Audio cues (focus tick, activate blip, toggle up/down); `source` component pans via `PannerNode`; mono-audio preference collapses to stereo-center.
- **`haptic.ts`** — pulses `XRInputSource.gamepad.hapticActuators` on focus/activate when in-session.
- **`speech.ts`** — optional `speechSynthesis` fallback for environments with no SR running (explicitly opt-in; never fights a real screen reader).

Preferences: `setA11yPreferences({ captions, earcons, haptics, speech, monoAudio, reducedMotion })` — a plain signal-backed store; backends read it; `reducedMotion` also gates focus-reveal camera behaviors.

---

## 7. `uikit-default` widget wiring

Same table as v1, with behavior moving to `onActivate` (§2). Roles are defaulted; labels are not — dev-mode one-shot `console.warn` when an interactive role has no accessible name.

| Widget | defaultOverrides additions |
|---|---|
| `button/index.ts` `Button` | `role: 'button'` |
| `checkbox/index.ts` `Checkbox` | `role: 'checkbox'`, `ariaChecked: computed(() => this.currentSignal.value ?? false)`, toggle moves `onClick`→`onActivate` |
| `switch/index.ts` `Switch` | `role: 'switch'`, `ariaChecked: computed(...)`, `onActivate` |
| `radio-group/index.ts` `RadioGroupItem` | `role: 'radio'`, `ariaChecked` via `searchFor` group compare, `onActivate` |
| `tabs/trigger.ts` `TabsTrigger` | `role: 'tab'`, `ariaSelected` (reuses `active` computed), `onActivate` |
| `accordion/trigger.ts` | `role: 'button'`, `ariaExpanded: computed(...)`, `onActivate` |
| `slider/index.ts` `Slider` | `role: 'slider'`, `ariaValueNow/Min/Max/Step`, `onA11yValueChange` → existing controlled/uncontrolled path |
| `toggle/`, `toggle-group/` | `role: 'togglebutton'`, `ariaPressed: computed(...)`, `onActivate` |
| `pagination`, `menubar`, `dialog`, `alert-dialog`, `tooltip` | Later phase — dialog needs focus trap + `aria-modal` + restore-focus; menubar full keyboard grammar |

`uikit-horizon` inherits base props free; widget sweep is a follow-up mirroring this table.

## 8. Virtualized listbox (preserved from v1)

One focusable hidden element for the icon grid's 1594 virtual items: `role="listbox" tabindex=0 aria-activedescendant` + a single managed `role="option"` child carrying `aria-posinset/aria-setsize/aria-selected` + label. Keydown grammar: arrows/Home/End → `onA11yActiveIndexChange({ move: 'next'|'prev'|'nextRow'|'prevRow'|'first'|'last' })` (the app owns column geometry), Enter/Space → `onA11yActivate(currentIndex)`. App scrolls via the existing `scrollPosition` signal, drives a visual highlight, announces selection.

## 9. API surface

**Vanilla:** props on construction/`setProperties`; `component.hasFocus`, `component.focus()/blur()`, `component.activate({source})`, `announce()`, `setupA11yProjection(root, {camera, renderer})`, `getA11yFocusManager(root)` + adapters, `registerAnnouncementBackend`, `setA11yPreferences`.

**React:** individual flat props (not a grouped `a11y={{}}` object — flat props are what the schema/pub-sub natively threads, and they participate in conditionals/classes): `<Button ariaLabel="Copy manifest" focus={{ borderColor: colors.ring }} />`. Projection auto-wired per root (§3). Adapters/backends: thin optional components later (`<A11yXRAdapters />`), not required for Modes 1–2.

## 10. Standards & prior art

- **[W3C XR Accessibility User Requirements (XAUR)](https://www.w3.org/TR/xaur/)** — the checklist for Modes 3–4: motion-agnostic operation (never require head/body motion — gaze dwell + switch scanning cover it), alternative input mapping (adapters), spatial orientation (`describeSurroundings`, position descriptions), captions + spatial-audio alternatives (backends, mono pref), target-size/dwell customization.
- **[WebXR Device API](https://www.w3.org/TR/webxr/)** — session/input-source model the adapters bind to; **[WebXR DOM Overlays](https://immersive-web.github.io/dom-overlays/)** — §5.5 scope.
- **WCAG 2.2** — the DOM layer's floor (name/role/value 4.1.2, focus visible 2.4.7, target size 2.5.8 via projection).
- **[Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/)** — remappable input, captions, no-hold alternatives, configurable motor timing (switch-scan intervals).
- **Prior art:** *Babylon.js* ships an HTML-twin accessibility tree (`accessibilityTag` → hidden DOM mirroring the scene) — direct precedent for Modes 1–2 and evidence the DOM-shadow approach is production-viable; *Unity* (Screen Reader API, mobile SR bridge) mirrors the "semantic tree + platform bridge" split; *Meta* Quest guidelines push haptics+audio redundancy (our backend set); *visionOS* maps gaze+pinch through system AT with Dwell Control — validating dwell as a first-class adapter; *A-Frame* has only community add-ons — no precedent to import; *@pmndrs/xr* (verified) ships no a11y at all — confirming this layer fills a real gap in the pmndrs stack rather than duplicating one.
- `@react-three/a11y` — role taxonomy + announcer pattern only (already mined).

## 11. Acceptance matrix

| # | Scenario | Mode | Gate | Verified by |
|---|---|---|---|---|
| 1 | Desktop SR (VoiceOver/NVDA) reads name/role/state of every interactive component | 1 | name+role+state exposed | machine (a11y-tree probe) + manual SR pass |
| 2 | Keyboard-only: Tab/Shift-Tab reach all controls; Enter/Space activate; visible ring | 1 | focus routes to `hasFocus`; ring renders; activation fires | machine (browser probe) |
| 3 | Mobile touch-exploration lands on visible control positions | 2 | projected rect ∩ rendered panel rect ≥ 90% | machine (rect-overlap probe) + manual VoiceOver/TalkBack |
| 4 | Voice control "click Settings" hits the control | 2 | accessible name + on-screen rect | manual (macOS Voice Control) |
| 5 | aria-live announces activation/toggle messages | 1 | live-region text mutates | machine |
| 6 | Virtualized grid: one tab stop, arrows move active item w/ posinset/setsize, Enter toggles | 1 | listbox semantics + callbacks | machine |
| 7 | Moving camera: panel leaves frustum → focus policy honored, position announced | 3 | `a11yVisibility` transitions; announce fires | machine (scripted camera) |
| 8 | Occluded panel skipped/announced per policy | 3 | occlusionProbe respected | machine (probe stub) + manual |
| 9 | Scaled/rotated/oblique panels project correct rects | 2 | AABB overlap ≥ 90% at 30°/60° tilt | machine |
| 10 | Panel behind user: never a silent focus trap; 'announce' policy describes direction | 3 | focus-reveal policy | machine |
| 11 | XR controller ray: focus follows ray dwell, squeeze activates, haptic fires | 4 | manager focus + `activate({source:'xr-controller'})` | machine (IWER emulated session) + manual headset |
| 12 | Gaze dwell focuses + activates without hand input | 4 | dwell timer → activate | machine (IWER) + manual |
| 13 | Switch scan traverses focusables and activates | 3/4 | scan interval + activate | machine |
| 14 | In-headset feedback without DOM SR: caption + earcon + haptic on activation | 4 | backends emit | machine (backend spies) + manual headset |
| 15 | AR DOM Overlay: companion UI accessible via platform AT; in-scene panels still Mode-4 | 4 | overlay hosts container; no regression | manual (device) + IWER smoke |
| 16 | `prefers-reduced-motion` + `setA11yPreferences` honored (no auto camera moves; earcon/caption prefs) | all | prefs gate behaviors | machine |
| 17 | StrictMode double-mount leaves zero orphan DOM / listeners / managers | 1–4 | count probes | machine |

Machine rows are loop gates (see horde plan); manual rows ship with a sign-off checklist and block release, not merge.

## 12. Rollout

Phased plans in `planning/superpowers/plans/`: `uikit-a11y-phase-0-core.md` (Mode-1 semantics + activation + announcer registry + DOM backend), `uikit-a11y-phase-1-projection.md` (Mode 2 + toolbar dogfood), `uikit-a11y-phase-2-widgets.md` (kit bindings + listbox + bento), `uikit-a11y-phase-3-diegetic.md` (visibility/nav/reveal + moving-camera example), `uikit-a11y-phase-4-xr.md` (focus manager, adapters, backends, DOM Overlay, IWER harness). Orchestration: `uikit-a11y-horde-execution.md`.

## 13. Testing strategy

- **Unit (vitest, node + happy-dom `Window` per existing `svg-shared-set.test.ts` pattern):** element lifecycle per role incl. abort/StrictMode-shaped double construct; aria sync; activation chain (Checkbox toggles through `onActivate`); focus→`hasFocus`→conditional; announcer backends (spies); projection math (pure function against known camera setups); visibility classification; nav ordering determinism; listbox grammar; focus-manager transitions; adapters against scripted input timelines.
- **Live in-product probes (browser automation on the icon-browser + bento dev servers):** the machine rows of §11 — exact probe scripts live in the horde plan.
- **XR (@pmndrs/xr `emulate`, IWER-based, dev-dep):** emulated `XRSession` + controller/gaze input driving rows 11–12, 14–15 smoke — same runtime the integration targets, so the harness exercises the real @pmndrs/xr → pointer-events → uikit path.
- **Manual:** VoiceOver/NVDA/TalkBack passes, Voice Control, headset checklist — tracked in the acceptance matrix, release-blocking.

## 14. Open questions / risks

1. **Projection perf ceiling** — per-frame rect writes for hundreds of roles; mitigated by epsilon-gated writes + only-dirty updates; budget: ≤ 0.2 ms for 200 elements (measured in the Phase-1 gate).
2. **Tab-order re-sync vs focus stability** — reordering the container only when it holds no focus can leave stale order during long focus dwell; acceptable, documented.
3. **Occlusion cost/quality** — raycast probe is approximate (center-point) and budgeted; apps with heavy geometry supply their own probe. Wrong-side default: unoccluded (never hide a control we're not sure about).
4. **Compat shim double-behavior** — apps binding the same behavior to both `onClick` and `onActivate` would double-fire on pointer; rule: shim never runs for `source:'pointer'`, kit widgets bind only `onActivate`. Docs call it out.
5. **`disabled` on base Container** — a11y-element semantics only (does not gate uikit pointer events; kit visuals own their disabled look). Documented loudly.
6. **XR AT reality** — headset screen readers are nascent; Mode 4's backends (captions/earcons/haptics/speech) are the practically-perceivable channel today, with the semantic tree ready for platform bridges as they mature. XAUR is the requirements bar, not current-browser parity.
7. **speech.ts vs running SR** — speaking over a real screen reader is hostile; backend stays opt-in with a "no SR detected" heuristic documented as best-effort.
