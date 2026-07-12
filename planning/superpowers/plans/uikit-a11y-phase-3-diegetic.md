# uikit a11y — Phase 3: diegetic 3D (Mode 3) — visibility, spatial nav, focus-reveal

**Spec:** `uikit-native-a11y.md` §4, §5.1 (manager core lands here), §5.2 (switch-scan only)
**Depends on:** Phases 0–2. The moving-camera pieces need a world-space dogfood: add a small "wall panel" scene to the bento pair (a uikit root on a rotated plane in world space, orbit controls) — build it FIRST (T3.0), everything probes against it.
**Parallelism:** T3.1 (visibility) and T3.2 (spatial-nav) are separate new files but both feed T3.3 (manager); run T3.1 ∥ T3.2, then T3.3 serialized, then T3.4/T3.5 ∥.

## Tasks

### T3.0 — world-space dogfood scene

- Extend `examples/react/uikit` + `examples/three/uikit` (pair rule) with a secondary world-space root: a settings panel on a "wall" (rotated/translated), OrbitControls, a second panel positioned initially behind the camera. Expose `window.__uikitA11yDebug` hooks (camera setter for scripted probes).
- **Accept:** scene renders in both examples; probe can script the camera.

### T3.1 — `a11y/visibility.ts`

- `computedA11yVisibility(component, camera, options?)` + `createRaycastOcclusionProbe(scene, { budgetPerFrame })` per spec §4.1. Runs piggybacked on the Mode-2 frame pass (projection.ts calls a per-element classify step; no separate loop).
- Policy application in `hidden-element.ts`/`projection.ts`: `visible` → focusable; `offscreen`/`occluded` → exposed, `tabIndex -1` unless reveal policy active, `aria-description` gains position phrase; `behind-camera`/`too-small` → `aria-hidden="true"`; `hidden` → per Phase 0. `a11yVisibilityOverride` respected.
- Screen-space roots (`Fullscreen`) short-circuit `visible|hidden`.
- **Accept:** unit — classification table across scripted camera/panel matrices (in-frustum, off-left, behind, 4px projected, override); budgeted probe round-robins (spy counts ≤ budget); default-unoccluded when probe absent.

### T3.2 — `a11y/spatial-nav.ts`

- Ordering per spec §4.2: group sort by camera-distance of group bounding centers; in-group by `a11yOrder ?? projected reading order` with hysteresis (re-sort only when an item moves > H px projected, H default 24). `role:'landmark'` containers define groups implicitly (`a11yGroup` default = landmark's `ariaLabel`).
- `focusDirectional` half-plane nearest-neighbor over projected positions.
- DOM re-append sync (only when container holds no focus).
- **Accept:** unit — deterministic order for a fixed scene; hysteresis holds order under ±10px jitter; directional picks match hand-computed fixtures; re-append skipped while an element has focus.

### T3.3 — `a11y/focus-manager.ts` + focus-reveal

- `A11yFocusManager` per spec §5.1 (focused signal → component `hasFocus`; DOM mirror when not in XR; `getA11yFocusManager(root)` lazy singleton per root) and `FocusRevealPolicy` per §4.3 (default `announce`: position phrase from `a11yPositionDescription` ?? camera-relative octant; `reveal` only calls app `onReveal`; `reducedMotion` pref forces `announce`).
- Canvas keyboard bindings (non-XR): when the canvas (or a root's container) has focus, ArrowKeys/Home/End → manager nav — opt-in via `enableKeyboardSceneNav(root)`.
- Component.focus()/blur() route through the manager when one exists (spec §1.4.4).
- **Accept:** unit — focusNext honors §4.2 order and visibility policy; focusing offscreen component under `announce` emits an announcement containing a direction word; under `skip` it is skipped; `reveal` invokes `onReveal` exactly once; manager dispose restores DOM-only focus behavior; no focus ping-pong when DOM mirror focus event echoes back (guard: manager writes are idempotent).

### T3.4 — `a11y/adapters/switch-scan.ts`

- Auto-advance scanning over `manager.focusables` (interval configurable, default 1200 ms; row-column mode per `a11yGroup`), external trigger API `switchPress()` → `activateFocused({source:'switch'})`. Keyboard binding option (Space as switch) for desktop testing.
- **Accept:** unit with fake timers — advance order matches focusables; press activates; pause/resume; interval configurable (Game Accessibility Guidelines: configurable timing).

### T3.5 — live probes on the wall-panel scene

- Scripted camera: rotate wall panel out of frustum → its elements lose focusability, tabbing skips them, focusing via manager announces direction (matrix #7, #10); occlusion stub (`isPerceivable` returning false for one panel) → skipped/announced (#8); tilted wall panel rect IoU ≥ 90% (#9); switch-scan traverses and activates (#13); reduced-motion pref blocks `reveal` (#16 partial).

## Phase gate

Unit + typecheck + lint + Phase-1/2 probe regressions + T3.5 probes, orchestrator-run. Adversarial review target: the focus-policy state machine (silent focus traps, echo loops between DOM focus and manager focus) — this is the phase where a subtle bug ships a trap.
