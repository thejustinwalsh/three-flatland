# Host-environment (browser) API surface of `@three-flatland/uikit`

Audit target: what `@three-flatland/uikit` reaches for **outside the canvas / WebGPU
surface itself** — the globals a non-browser host (React Native, a Worker, Node SSR,
an embedded JS runtime, a headless test) would have to provide, polyfill, or thinly
shim.

Every claim below carries a `file:line`. Paths are repo-relative. Anything marked
_(inference)_ is reasoning, not a grep hit. Line numbers are from the state of the
tree at audit time (2026-07-10).

Scope covered: `packages/uikit/src/**` (primary), `packages/uikit-default/src/**`,
`packages/uikit-horizon/src/**`, `packages/uikit-lucide/src/**`, and
`packages/slug/src/**` **only at the two points uikit reaches it** (font load, SVG
parse). `uikit-lucide` is 1597 generated icon modules that are pure SVG string
constants — no host-API usage of its own (the `window`/`clipboard`/`image` substrings
in it are icon _names_, e.g. `AppWindow.ts:5`), so it is not tiered further.

---

## 1. Summary — can uikit run with no DOM today?

**A container/text/image tree can be constructed and laid out with no DOM at all.
Text _input_ cannot.** That is the single honest headline.

- **Layout** is `yoga-layout` (WASM) — DOM-free. **Panel rendering** is instanced
  three.js meshes; **text and vector rendering** are `@three-flatland/slug` (analytic
  Bézier math on the GPU) — DOM-free. The **Core tier below is empty of DOM**: nothing
  in the construct-and-lay-out path touches `document`, `window`, or `navigator`. The
  only Core host calls are `performance.now`, `setTimeout`/`clearTimeout`, and
  `AbortController`/`AbortSignal` — all present in Node and Workers.

- **The single hardest blocker is text input, and it blocks at _construction_, not at
  interaction.** The `Input` (and `TextArea`) constructor synchronously calls
  `createHtmlInputElement` → `document.createElement(multiline ? 'textarea' : 'input')`
  (`packages/uikit/src/text/input/hidden-input.ts:18`) and then `setupHtmlInputElement`
  → `document.body.appendChild(element)` (`hidden-input.ts:42`), both **unguarded**,
  driven from the constructor at `packages/uikit/src/components/input.ts:155` and
  `:190`. So `new Input(...)` throws a `ReferenceError`/`TypeError` in a host without
  `document`. This **confirms the prior**: text input is the blocker, text _rendering_
  is not. (Contrast `Video`, which guards the same pattern with
  `typeof document === 'undefined'` — see `video.ts:75`,`:107`.)

- **Interaction** (pointer/keyboard) needs a DOM canvas and the event-forwarding layer,
  but that requirement is **Foreign** — it lives in `@react-three/fiber` and
  `@pmndrs/pointer-events`, not in uikit's own code. uikit's components listen through
  three.js's `EventDispatcher` (`this.addEventListener('pointerdown', …)` on an
  `Object3D`), which is DOM-free; a non-DOM host that synthesizes `ThreePointerEvent`
  intersections and dispatches them onto the object tree drives interaction without a
  DOM. See §3 (events) and §6.

---

## 2. Full API table

Tiers: **Core** (construct + lay out a tree, no interaction) · **Interaction**
(pointer/keyboard) · **Text input** (`Input`/`TextArea` only) · **Optional**
(feature-gated or already `typeof`-guarded) · **Foreign** (required by
`three` / `@react-three/fiber` / `@pmndrs/pointer-events`, not uikit's own code).

Shim difficulty: **triv** (universal in Node/Workers, or a ≤5-line fake) ·
**fake** (a small plain-object stub works — see §4) · **DOM** (genuinely needs a
DOM/parser/media engine).

| API                                                                                        | Used by                                                | file:line                                                                                                                                                   | Tier                          | Shim | What breaks without it                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `performance.now()`                                                                        | panel batch scheduler; scroll drag timing              | `packages/uikit/src/panel/instance/group.ts:98`; `packages/uikit/src/scroll.ts:154,195`                                                                     | **Core**                      | triv | Update scheduling / drag timestamps. Universal in Node.                                                                                                                            |
| `setTimeout`/`clearTimeout`                                                                | panel update scheduler; ancestor-change debounce       | `panel/instance/group.ts:104,105,110,218`; `packages/uikit/src/components/content.ts:270,362`                                                               | **Core**                      | triv | Batched panel updates never flush. Universal.                                                                                                                                      |
| `AbortController` / `AbortSignal` (+ `signal.addEventListener('abort')`)                   | every component's lifecycle/cleanup                    | `packages/uikit/src/components/component.ts:95`; `packages/uikit/src/context.ts:43,53,98`; and ~25 more sites                                               | **Core**                      | triv | Teardown/cleanup. Universal in Node ≥15.                                                                                                                                           |
| `URL` + `import.meta.url`                                                                  | resolve bundled default Inter font                     | `packages/uikit/src/text/font.ts:125`                                                                                                                       | **Core** (text)               | triv | Default `Text` font URL. `URL` is a Node global; `import.meta.url` is resolved by the bundler/runtime.                                                                             |
| `document.body.style.cursor`                                                               | hover cursor set/unset                                 | `packages/uikit/src/hover.ts:61,72`                                                                                                                         | **Interaction**               | fake | **Unguarded — throws** on hover of any element with a `cursor` prop or `onHoverChange`. See §3.                                                                                    |
| `document.activeElement` + `HTMLElement` (`instanceof`)                                    | blur-suppression guard on canvas pointer-down          | `packages/uikit/src/text/selection/pointer.ts:22`                                                                                                           | **Interaction**               | fake | **Unguarded — throws** when `canvasInputProps.onPointerDown` fires.                                                                                                                |
| `addEventListener`/`removeEventListener('pointerdown')` on canvas                          | vanilla-three `attachCanvasInputProps` helper          | `pointer.ts:67,68`                                                                                                                                          | **Interaction**               | DOM  | Only if you use the vanilla helper; it takes a real `HTMLElement` canvas (`pointer.ts:60`). R3F path uses R3F instead.                                                             |
| `document.createElement('input'\|'textarea')`                                              | hidden input backing `Input`/`TextArea`                | `packages/uikit/src/text/input/hidden-input.ts:18`                                                                                                          | **Text input**                | fake | **HARDEST BLOCKER — unguarded, in constructor.** `new Input()` throws. See §1, §4.                                                                                                 |
| `document.body.appendChild` / `element.remove()`                                           | mount/unmount hidden input                             | `hidden-input.ts:42,43`                                                                                                                                     | **Text input**                | fake | Same constructor path; unguarded.                                                                                                                                                  |
| `element.style.setProperty(…)`                                                             | position hidden input offscreen                        | `hidden-input.ts:19-24`                                                                                                                                     | **Text input**                | fake | Cosmetic on the hidden element; needed only because a real `<input>` renders.                                                                                                      |
| `element.addEventListener('input'\|'focus'\|'keydown'\|'keyup'\|'blur')`                   | keystroke / selection / focus tracking                 | `hidden-input.ts:25,29,30,31,32,77,78`                                                                                                                      | **Text input**                | fake | The keyboard/IME bridge. This is _the_ reason a hidden element exists.                                                                                                             |
| `element.value` / `.disabled` / `.tabIndex` / `.autocomplete` / `.setAttribute('type',…)`  | mirror props onto hidden input                         | `hidden-input.ts:45,48,51,54,56`                                                                                                                            | **Text input**                | fake | Input value + attributes. Plain assignments on a stub.                                                                                                                             |
| `document.activeElement === element`                                                       | derive `hasFocus`                                      | `hidden-input.ts:68,70`                                                                                                                                     | **Text input**                | fake | Focus state signal.                                                                                                                                                                |
| `element.focus()` / `element.blur()`                                                       | programmatic focus                                     | `packages/uikit/src/components/input.ts:204,219`                                                                                                            | **Text input**                | fake | `Input.focus()`/`.blur()`.                                                                                                                                                         |
| `element.setSelectionRange(start,end,dir)`                                                 | set caret/selection                                    | `input.ts:207`                                                                                                                                              | **Text input**                | fake | Caret + drag-select placement.                                                                                                                                                     |
| `element.selectionStart` / `.selectionEnd`                                                 | read selection                                         | `packages/uikit/src/text/selection/state.ts:8,9`                                                                                                            | **Text input**                | fake | Selection highlight + caret rendering.                                                                                                                                             |
| `HTMLInputElement` / `HTMLTextAreaElement` / `HTMLElement` (types + `instanceof`)          | element typing / guard                                 | `input.ts:72`; `hidden-input.ts:38,60`; `packages/uikit/src/text/selection/state.ts:6`; `pointer.ts:22`                                                     | **Text input** / Interaction  | fake | Type-only except the `instanceof` at `pointer.ts:22` (Interaction, above).                                                                                                         |
| `setInterval`/`clearInterval`                                                              | caret blink                                            | `packages/uikit/src/text/selection/caret.ts:93,99`                                                                                                          | **Text input**                | triv | Caret stops blinking (still renders). Universal.                                                                                                                                   |
| `Intl.Segmenter`                                                                           | double-click word selection                            | `pointer.ts:71,72` (used `:129`)                                                                                                                            | **Optional** (guarded)        | triv | **Guarded** — see §5. Double-click-to-select-word silently no-ops. Node ≥16 has it.                                                                                                |
| `matchMedia('(prefers-color-scheme: dark)')` (+ `.matches`, `.addEventListener('change')`) | system dark-mode detection                             | `packages/uikit/src/preferred-color-scheme.ts:5,7,9`                                                                                                        | **Optional** (guarded)        | triv | **Guarded** — see §5. Runs at import in the core path. Silently defaults to light.                                                                                                 |
| `typeof document` guard → `document.createElement('video')`, `document.body.appendChild`   | `Video` element                                        | `packages/uikit/src/components/video.ts:75,78,107,110`                                                                                                      | **Optional** (guarded)        | DOM  | **Guarded** — `Video` silently renders nothing without a DOM. See §5.                                                                                                              |
| `HTMLVideoElement` / `MediaStream` (`instanceof`, `typeof … !== 'undefined'`)              | `Video` src detection                                  | `video.ts:16,19,48`                                                                                                                                         | **Optional** (guarded)        | DOM  | Guarded; `src`-is-element detection.                                                                                                                                               |
| `window.devicePixelRatio`                                                                  | XR screen-space pixel size                             | `packages/uikit/src/components/fullscreen.ts:110`                                                                                                           | **Optional**                  | triv | **Unguarded but XR-gated** (`renderer.xr.getSession()?.interactionMode === 'screen-space'`, `:109`). Throws only inside that branch.                                               |
| `window.setTimeout`                                                                        | tooltip open delay                                     | `packages/uikit-default/src/tooltip/index.ts:35`                                                                                                            | **Optional**                  | triv | **Unguarded `window.` prefix** — throws where bare `setTimeout` would not. Portability wart in `uikit-default`.                                                                    |
| `setPointerCapture` / `releasePointerCapture`                                              | pointer capture during scroll/select drag              | `scroll.ts:90-94,138-141`; `pointer.ts:105-109`; `packages/uikit-default/src/slider/index.ts:106-109`; `packages/uikit-horizon/src/slider/index.ts:132-136` | **Foreign** (guarded)         | —    | Guarded `('x' in obj && typeof … === 'function')`; called on a three `Object3D`, not a DOM node — provided by `@pmndrs/pointer-events`. Silently skips capture if absent (see §5). |
| `@pmndrs/pointer-events` `forwardObjectEvents` / `forwardHtmlEvents`                       | deliver pointer/wheel events to the tree               | `packages/uikit/src/react/portal.tsx:33`; `pointer.ts:43,48,54` (docstring)                                                                                 | **Foreign**                   | DOM  | Interaction entirely. Needs a DOM canvas + `PointerEvent`/`WheelEvent`. Not uikit's code.                                                                                          |
| `@react-three/fiber` (`react/*` entry)                                                     | React reconciler + canvas + events                     | `packages/uikit/src/react/*.tsx`; dep in `package.json`                                                                                                     | **Foreign**                   | DOM  | The whole R3F subpath. Vanilla uikit does not need it.                                                                                                                             |
| three `TextureLoader` → `ImageLoader` → `new Image()`                                      | load an `Image` from a URL string                      | `packages/uikit/src/components/image.ts:317,335`                                                                                                            | **Foreign** (three)           | DOM  | Only for **URL** srcs. Passing a `Texture` object bypasses it (`image.ts:331`).                                                                                                    |
| three `VideoTexture`                                                                       | wrap the video element                                 | `video.ts:127`                                                                                                                                              | **Foreign** (three)           | DOM  | `Video` only.                                                                                                                                                                      |
| three `SVGLoader` → `DOMParser`                                                            | parse SVG markup for `Svg`                             | `packages/slug/src/svg/parseSVG.ts:1,287` (reached from `packages/uikit/src/components/svg.ts:10,146`)                                                      | **Foreign** (three, via slug) | DOM  | **Unguarded at runtime.** Runtime `Svg` with `src`/`content` throws without `DOMParser`. See §3, §7.                                                                               |
| `fetch` (font glb/ttf)                                                                     | load font in `SlugFontLoader`                          | `packages/slug/src/SlugFontLoader.ts:136,247`; `packages/slug/src/pipeline/fontParser.ts:146` (reached from uikit `Text` default, `font.ts:125`)            | **Foreign** (slug)            | triv | Text with a URL/default font. Node ≥18 has global `fetch`; else shim, or pre-bake `.slug.glb`.                                                                                     |
| `fetch` (SVG URL)                                                                          | load SVG when `src` is a URL                           | `packages/slug/src/svg/loadSVG.ts:42` (reached from uikit `Svg`)                                                                                            | **Foreign** (slug)            | triv | `Svg` with a URL src (markup src skips fetch).                                                                                                                                     |
| `globalThis.DOMParser` + `happy-dom`                                                       | headless DOMParser shim for the `uikit-bake icons` CLI | `packages/uikit/src/cli.ts:79-103`                                                                                                                          | **Build-time** (not runtime)  | —    | Offline bake tooling only. Documented in §3; it is the reference DOMParser shim.                                                                                                   |

**Not found anywhere in uikit's own source** (verified by grep, so a porter can stop
worrying about them): `navigator`, `navigator.clipboard`, `navigator.userAgent`,
`ClipboardEvent`, `getComputedStyle`, `XMLSerializer`, `ResizeObserver`,
`MutationObserver`, `IntersectionObserver`, `createImageBitmap`/`OffscreenCanvas`,
`requestAnimationFrame`/`cancelAnimationFrame` (uikit is driven by the host render
loop; only `element.requestVideoFrameCallback` on the video element exists, `video.ts:146,148`),
`queueMicrotask`, `structuredClone`, `crypto`, `btoa`/`atob`, `TextEncoder`/`TextDecoder`,
`Blob`/`FileReader`/`Request`/`Response`, `localStorage`/`sessionStorage`,
`location`/`history`, `Worker`/`WebSocket`. (There is **no clipboard support** in uikit
today — copy/paste rides entirely on the browser's native handling of the hidden
`<input>`.)

---

## 3. Per-subsystem breakdown

### Layout — `packages/uikit/src/flex/**` (yoga)

DOM-free. `yoga-layout` is WASM. No `document`/`window` in `flex/*`. This is why the
Core tier has no DOM entry.

### Rendering — panels + slug

- **Panels**: instanced three.js meshes (`packages/uikit/src/panel/instance/**`). The
  only host call in the panel path is scheduling: `performance.now()`
  (`panel/instance/group.ts:98`) and `setTimeout`/`clearTimeout` (`:104,105,110,218`).
  `dispatchEvent` at `panel/instance/mesh.ts:108` and the two `svg/render` /
  `text/render` group files is three's `EventDispatcher`, not DOM.
- **Text/SVG glyphs**: `@three-flatland/slug` — analytic Bézier, DOM-free math. The
  DOM/network requirements are only at the _load_ boundary (font `fetch`, SVG parse),
  not at render.

### Events — Foreign, three `EventDispatcher` underneath

- uikit components register handlers on themselves as three `Object3D`s
  (`this.addEventListener('added'…)`, `component.ts:160-161`,`:355`,`:385`; scroll and
  selection targets attach through the same mechanism). This layer is **DOM-free**.
- The **DOM→tree bridge is Foreign**: `@pmndrs/pointer-events`
  (`forwardObjectEvents`, `react/portal.tsx:33`; `forwardHtmlEvents`, referenced in
  `pointer.ts`'s docstring `:43,48,54`) and `@react-three/fiber` translate real
  `PointerEvent`/`WheelEvent` on a DOM canvas into `ThreePointerEvent` intersections.
  A non-DOM host replaces _this_ layer, not uikit.
- Two uikit-owned Interaction DOM touches leak past that boundary and are **unguarded**:
  `document.body.style.cursor` (`hover.ts:61,72`) and
  `document.activeElement instanceof HTMLElement` (`pointer.ts:22`). Both throw in a
  non-DOM host; both are covered by a trivial fake (§4).

### Focus / selection — Text input tier

The hidden `<input>`/`<textarea>` (`hidden-input.ts`) is a **state holder**, not a
renderer — uikit draws the text itself via slug. It exists to catch OS keyboard/IME
input and to expose `value` + `selectionStart`/`selectionEnd` +
`document.activeElement`. Everything uikit reads from it is enumerated in the table;
the surface is small and stub-able (§4).

### Clipboard

None. No `navigator.clipboard`, no `ClipboardEvent` anywhere. Copy/paste works only
because a real DOM `<input>` handles it natively; in a shimmed host there is **no
clipboard path**.

### Color scheme — `preferred-color-scheme.ts`

`matchMedia` guarded (§5). **Runs at import time in the core path** — it is pulled in
by `properties/conditional.ts:2` (which every component uses) and re-exported from
`index.ts:13`. Guarded, so it does not throw; but it silently defaults to light (§5).

### Images / `Svg`

- **Image from URL**: three `TextureLoader.loadAsync` (`image.ts:335`) → three
  `ImageLoader` → `new Image()` — **Foreign**, needs image decode. Passing a `Texture`
  object directly skips all of it (`image.ts:331`).
- **`Svg` from `src`/`content`**: uikit's `Svg` (`components/svg.ts:146`) calls slug's
  `loadSVGShapes` → `parseSVG` → three `SVGLoader().parse` which requires **`DOMParser`**
  (`slug/src/svg/parseSVG.ts:1,287`; the requirement is documented at `:284`). A URL src
  also `fetch`es first (`slug/src/svg/loadSVG.ts:42`). **Unguarded at runtime.**
  Mitigation: the `uikit-bake icons` CLI pre-bakes SVGs to a `SlugShapeSet` `.glb`
  offline (using the happy-dom `DOMParser` shim at `cli.ts:79-103`), which the runtime
  loads with no `DOMParser`.

### Scrolling

Pure math + pointer capture. `performance.now()` for fling timing (`scroll.ts:154,195`).
`setPointerCapture`/`releasePointerCapture` are guarded and called on the three object,
not DOM (Foreign, §5).

---

## 4. What a minimal shim looks like

**Satisfiable by a small plain-object fake (no real DOM):**

- **Hover cursor** — `document.body.style.cursor` (`hover.ts:61,72`). A one-liner:
  `globalThis.document ??= { body: { style: {} } }`.
- **Blur guard** — `document.activeElement` + `HTMLElement` (`pointer.ts:22`). Provide
  `document.activeElement = null` and a dummy `globalThis.HTMLElement = class {}`.
- **Color scheme** — `matchMedia` (§5); a 5-line fake, or set `dark`/`light` explicitly
  via `setPreferredColorScheme('dark')` (`preferred-color-scheme.ts:26`) and skip the
  media query.
- **Hidden input** — the whole `hidden-input.ts` surface. Tractable, because uikit only
  reads `value`, `selectionStart`, `selectionEnd`, `document.activeElement`, and fires
  the listeners; it never lays out or measures the element. Sketch:

  ```ts
  // ~40-line headless hidden-input shim. Drive keystrokes by mutating
  // `el.value`/`el.selectionStart`/`el.selectionEnd` then `el.dispatch('input')`.
  function makeFakeInput() {
    const listeners: Record<string, Set<() => void>> = {}
    const el = {
      value: '',
      disabled: false,
      tabIndex: 0,
      autocomplete: '',
      selectionStart: 0 as number | null,
      selectionEnd: 0 as number | null,
      selectionDirection: 'none' as string,
      style: { setProperty() {} },
      setAttribute() {},
      focus() {
        fakeDocument.activeElement = el
        el.dispatch('focus')
      },
      blur() {
        if (fakeDocument.activeElement === el) fakeDocument.activeElement = null
        el.dispatch('blur')
      },
      setSelectionRange(s: number, e: number, d = 'none') {
        el.selectionStart = s
        el.selectionEnd = e
        el.selectionDirection = d
      },
      addEventListener(t: string, cb: () => void) {
        ;(listeners[t] ??= new Set()).add(cb)
      },
      removeEventListener(t: string, cb: () => void) {
        listeners[t]?.delete(cb)
      },
      remove() {},
      dispatch(t: string) {
        listeners[t]?.forEach((cb) => cb())
      },
    }
    return el
  }
  const fakeDocument = {
    activeElement: null as unknown,
    body: { appendChild() {}, style: { cursor: '' } },
    createElement: (_tag: string) => makeFakeInput(),
  }
  ;(globalThis as any).document ??= fakeDocument
  ```

  This gets you a fully functional `Input`/`TextArea` **model** — programmatic value and
  selection, caret and highlight rendering, focus signals. It does **not** get you OS
  keyboard/IME; the host must translate its own key events into `el.value` +
  selection mutations and call `el.dispatch('input')`.

**Genuinely needs a real DOM / parser / media engine (not a 50-line fake):**

- **`Svg` with a runtime `src`/`content`** — three `SVGLoader` walks a parsed DOM tree,
  so `DOMParser` must be a real XML/DOM implementation (`happy-dom`/`linkedom`), exactly
  as the CLI does (`cli.ts:79-103`). **Better mitigation: pre-bake** with
  `uikit-bake icons` and load the `.glb` — zero runtime `DOMParser`.
- **`Image` from a URL** — three `ImageLoader` needs real image decode. **Mitigation:
  pass a `Texture` object** you built yourself (`image.ts:331` short-circuits the load).
- **`Video`** — inherently needs an `HTMLVideoElement` + media pipeline. No thin shim;
  it is already guarded to no-op without a DOM (§5).

---

## 5. Already-guarded APIs (where upstream anticipated a non-browser host)

Each of these is **materially different from an unguarded call** — it will not throw.
Several instead **silently no-op**, which is the more dangerous failure (see §6).

- `typeof Intl === 'undefined' ? undefined : new Intl.Segmenter(undefined, { granularity: 'word' })`
  — `pointer.ts:71-72`. Consumed at `:129` behind `if (segmenter == null … return`
  (`:120`).
- `typeof matchMedia === 'undefined' ? undefined : matchMedia?.('(prefers-color-scheme: dark)')`
  — `preferred-color-scheme.ts:5`. Listener optional-chained: `queryList?.addEventListener('change', …)` (`:9`);
  initial value falls back: `queryList?.matches ?? false` (`:7`).
- `if (typeof document === 'undefined') { return undefined }` guarding the `Video`
  element create/append — `video.ts:75,107`.
- `typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement`
  — `video.ts:19,48`; `typeof MediaStream !== 'undefined' && …` — `video.ts:16`.
- `'setPointerCapture' in e.object && typeof e.object.setPointerCapture === 'function'`
  — `scroll.ts:138`, `pointer.ts:105`, `uikit-default/src/slider/index.ts:106`,
  `uikit-horizon/src/slider/index.ts:132`; and
  `'releasePointerCapture' in container && typeof container.releasePointerCapture === 'function'`
  — `scroll.ts:90`.
- (Build-time, not host-DOM) `globalThis.DOMParser` install/restore + lazy optional
  `happy-dom` import — `cli.ts:82-88,97-102`.

---

## 6. ⚠️ Silent no-op risks — compiles, lints, tests pass, does nothing

These are guarded (so they will **not** throw) and therefore easy to miss. They are the
highest-value findings for this port.

1. **Dark mode silently becomes light, forever.** `matchMedia` guarded at
   `preferred-color-scheme.ts:5`; on absence, `symstemIsDarkMode` initializes to `false`
   (`:7`) and the `change` listener never attaches (`:9`). Every `dark:` conditional
   property (wired through `properties/conditional.ts:2`, the core path) resolves to the
   light branch and never updates. No error. If dark mode matters, shim `matchMedia` or
   call `setPreferredColorScheme('dark')`.

2. **Double-click-to-select-word silently does nothing.** `Intl.Segmenter` guarded at
   `pointer.ts:71`; `onDblClick` early-returns when `segmenter == null` (`:120`). Caret
   and drag-select still work; word selection just never happens. No error.

3. **`Video` renders nothing, silently.** `typeof document === 'undefined'` guard at
   `video.ts:75,107` makes the element `undefined`; the component mounts, lays out, and
   shows no texture. No error.

4. **Drag-scroll and drag-select proceed without pointer capture.** The
   `setPointerCapture` guards (`scroll.ts:138`, `pointer.ts:105`) silently skip capture
   when the target lacks the method. The drag still starts, but the pointer can escape
   the element mid-gesture — degraded behavior, no error. `releasePointerCapture`
   (`scroll.ts:90`) is the symmetric skip.

---

## 7. Open questions / risks for a DOM-free target

- **The hidden input is an IME/keyboard bridge, not just a value store.** The audited
  read surface is small (`value`, `selectionStart`/`selectionEnd`, `activeElement`, plus
  the five listeners) and a fake covers it — but a fake gives you programmatic input
  only. A headless host must _originate_ keystrokes/composition and feed them in. Verify
  before shipping that nothing reads the element beyond that surface (this audit found
  nothing more; label as inference for any future field additions).

- **`preferred-color-scheme` executes at import in the core path.** Merely importing
  uikit evaluates the `matchMedia` guard (`preferred-color-scheme.ts:5` via
  `conditional.ts:2`). It is safe (guarded) but see §6.1.

- **Interaction is cleanest replaced at the three layer, not the DOM layer.** uikit's
  components dispatch/listen through three's `EventDispatcher` (DOM-free). The DOM canvas
  - `@pmndrs/pointer-events` + R3F stack is Foreign; a non-DOM host should synthesize
    `ThreePointerEvent`-shaped intersections (`packages/uikit/src/events.ts:24-47` defines
    the shape) and dispatch onto the object tree directly, bypassing `forwardHtmlEvents`.

- **Two unguarded uikit-owned DOM touches on the interaction path** (`hover.ts:61,72`;
  `pointer.ts:22`) will throw before you reach any Foreign layer. They need the §4 fake
  even for pointer-only (no text-input) interaction. _(Candidates to fold in: both could
  take the same `typeof document === 'undefined'` guard the codebase already uses in
  `video.ts` — noted per the repo's fix-at-discovery norm; not changed here, as this unit
  is read-only.)_

- **`window.setTimeout` in `uikit-default` tooltip** (`tooltip/index.ts:35`) throws in a
  host that has `setTimeout` but not `window`. Bare `setTimeout` would be portable; the
  `window.` prefix is an avoidable wart.

- **`URL` + `import.meta.url` for the default font** (`font.ts:125`) assumes the runtime
  resolves `import.meta.url`. Bundlers and Node handle it; a bare embedded runtime may
  not — pass an explicit `fontFamilies` to avoid the default asset entirely.

- **`fetch` for fonts and SVG URLs** (slug: `SlugFontLoader.ts:136,247`;
  `loadSVG.ts:42`) assumes global `fetch`. Node ≥18 has it; embedded runtimes need a
  shim, or pre-bake fonts to `.slug.glb` and pass markup (not URLs) to `Svg`.

- **`performance.now` / `setTimeout` / `AbortController`** (the entire Core tier) are
  assumed present. True for Node and Workers; a bare embedded JS engine may need all
  three shimmed — but none require a DOM.
