# Bug: React auto-wired a11y projection never pumps (Mode-2/3 positioning dead in R3F)

> ## ✅ RESOLVED — the original diagnosis below was WRONG
>
> The "onFrame never pumps" conclusion was a **flaky-browser probe artifact** (a frozen/uninitialised
> canvas), not a real global failure. Codex's static trace and the Playwright e2e suite both confirm
> the pump runs: the React `[data-uikit-a11y]` containers flip to `position: fixed` and elements get
> real `transform` rects. The genuine causes of the misbehaviour I saw were two OTHER bugs, both now
> fixed and proven by `e2e/a11y-uikit.spec.ts` (13 real-browser tests):
>
> 1. **Duplicate-module WeakMap fork** — the per-root `rootMembers`/`rootContainers` registries were
>    module-global `WeakMap`s; a duplicate copy of the module forked them, so `setupComponentA11y`
>    registered members in one copy and projection read an empty map in another → `onFrame` early-
>    returned at `members.size === 0` → container stuck at `-1000vw`. Fixed by `c6bc9f02` (a11yGlobal
>    stashes every registry on `globalThis` under a `Symbol.for` key).
> 2. **Wrong camera for world-space roots** — `build.tsx` auto-wired projection against R3F's active
>    camera for EVERY root; an app rendering through its own camera (the flatland examples) left
>    world-space panels projected against the wrong static camera, so camera motion had no effect.
>    Fixed by `08252ae2` (the `<A11yCamera camera={renderCamera}>` context override).
>
> Lesson: a flaky live-browser probe is not ground truth — a deterministic Playwright/CDP test is.
> The original diagnosis (below) is retained for the record; ignore its conclusion.

---

**Status:** ~~open, pre-existing since Phase 1 (`dabbf790`)~~ — **RESOLVED** (see banner). Original write-up follows.
**Severity:** medium — degrades an *enhancement* (visual position overlay), not core a11y.
**Scope:** `packages/uikit/src/react/build.tsx` (the React root's projection auto-wiring). NOT the a11y
library logic, which is directly proven by the passing happy-dom `a11y-projection-dom.test.ts` suite.

## Symptom (observed live, `examples/react/uikit`, WebGL2 fallback render)

Every per-root `[data-uikit-a11y]` container stays at the off-screen fallback
`position:absolute; top:0; left:-1000vw`, for all four roots in the example (the CRYPT-RAIDER HUD,
the world-space Wall Panel, the Behind-You panel, the Player-Name input). `setupA11yProjection`'s
`onFrame` never flips a container to the `position:fixed` overlay, and no hidden element ever receives
a projection `transform` / `width` / `height`. So Mode-2/3 **positioning** (placing each hidden
element over its on-screen panel for switch-access hit-testing and screen magnification) is inactive.

**What still works:** the a11y *tree* is fully correct — every interactive control has a hidden
element with the right `role`, `aria-label`, and focusability (`tabIndex`). Screen readers perceive
the whole UI and sequential Tab works. `-1000vw` is the standard screen-reader-only off-screen
pattern (elements remain in the a11y tree). Only the visual-position overlay is missing.

## Diagnosis (runtime-instrumented via temporary probes, then reverted)

1. `setupA11yProjection` **is** invoked for every root — 8 calls (4 roots × React 19 StrictMode
   double-invoke), each with `root.component === rootComponent` (`isRoot: true`) and the root's
   `onFrameEndSet` already holding 3 handlers (the glyph / shape / panel group-managers).
2. It registers `onFrame` into that root's `onFrameEndSet` (`root.onFrameEndSet.add(onFrame)`).
3. `Component.update()` (component.ts:519) iterates `this.root.peek().onFrameEndSet` and the scene
   renders — yet the instrumented `onFrame` fires **0 times**.

So `onFrame` is registered against a `RootContext` whose `onFrameEndSet` is not the one `update()`
pumps, **or** `update()` for these roots stops after initial layout. The definitive datum (does the
pumped context id equal the setup context id?) was lost to browser-renderer flakiness; the two
candidate mechanisms are (a) a stale `RootContext` captured by the `[camera, renderer]`-keyed
projection `useEffect` relative to the context `update()` pumps, or (b) StrictMode
mount→unmount→remount leaving `onFrame` on the throwaway context. Both live in `build.tsx`'s
projection `useEffect` (lines ~89-98) + the standalone-`Container`-as-root lifecycle, not in the a11y
library.

## Why it went unnoticed

Prior live probes (P1/P2) used the **Three.js** example (`examples/three/uikit/main.ts`), which calls
`setupA11yProjection` **explicitly** with `flatland.camera` + `renderer` and drives its own render
loop — bypassing `build.tsx`'s auto-wiring entirely. The React auto-wiring path had never been
live-verified.

## Recommended fix (next focused unit)

- Reproduce deterministically with a React Testing Library + happy-dom harness that mounts a uikit
  root through the real `build.tsx` path and asserts `onFrame` pumps (no WebGPU needed — assert the
  container flips to `fixed`). This removes the flaky-browser dependency.
- In `setupA11yProjection`, read `rootComponent.root.peek()` **inside** `onFrame` (or re-register on
  root-context change) instead of capturing it once, so a context swap can't orphan the handler.
- Verify against StrictMode double-invoke.

## Interim verification path

The Three.js example's explicit wiring is the live-probe target for Mode-2/3 positioning until this is
fixed. Library correctness (visibility policy, focus manager, switch-scan) is covered by the happy-dom
suites, which drive `setupA11yProjection` frames directly via `component.update()`.
