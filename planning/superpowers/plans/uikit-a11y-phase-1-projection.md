# uikit a11y — Phase 1: projection (Mode 2) + toolbar dogfood

**Spec:** `uikit-native-a11y.md` §3; dogfood §12
**Depends on:** Phase 0 merged (or stacked on its branch).
**Packages:** `packages/uikit` (new file + react touch), `packages/uikit-default` (Button role only), `packages/uikit-lucide/example`.

## Tasks

### T1.1 — `a11y/projection.ts`

- `setupA11yProjection(root, { camera, renderer, isPerceivable? })` per spec §3: registers into `root.root.peek().onFrameSet`; per frame, for each a11y element under the root (the per-root container tracks its members), compute the panel screen AABB:
  - corners = `(±size[0]/2, ±size[1]/2, 0) × pixelSize` through `globalPanelMatrix` → world → `.project(camera)` → NDC → canvas client coords (offset by `renderer.domElement.getBoundingClientRect()`, cached per frame).
  - Write `left/top/width/height` (px, `transform` not layout — use `translate`/`width`/`height` style writes) only when changed > 1px epsilon.
  - Container becomes `position:fixed` (or absolute w/ page offset) overlaying the canvas; container off-screen fallback (Phase 0) is replaced once a projection registers.
  - Off-frustum/degenerate → `element.style.visibility = 'hidden'` this phase (full `a11yVisibility` policy is Phase 3); restore when back.
- Pure-math core extracted as `computeA11yScreenRect(globalPanelMatrix, size, pixelSize, camera, viewport): {x,y,w,h} | null` — unit-testable without DOM.
- **Accept:** unit tests against known camera/panel setups: fronto-parallel panel rect matches analytic expectation ±1px; 30°/60° tilted panels produce enclosing AABBs (matrix-math oracle in test); behind-camera returns null. Perf micro-bench (local-only assert per repo CI posture): 200 elements ≤ 0.2 ms/frame average over 500 frames.

### T1.2 — React auto-wiring

- File: `packages/uikit/src/react/build.tsx` (and/or the `Fullscreen` path in `react/index.tsx`).
- In `useSetup` (root components only — guard `component.root.peek().component === component` like the frame pump): `useThree` camera + `gl.domElement`, `useEffect` → `setupA11yProjection(component, { camera, renderer: gl })`, dispose on cleanup. Camera identity change re-runs.
- Dev warn (one-shot per root) when a role exists under a root with no projection — implemented in Phase 0's container, verified here.
- **Accept:** icon-browser example boots with zero code changes and the container overlays the canvas (probe: container bounding rect ≈ canvas rect).

### T1.3 — Button role + toolbar dogfood

- `packages/uikit-default/src/button/index.ts`: `role: 'button'` in `defaultOverrides` (behavior stays on user `onClick` until Phase 2 migrates widgets to `onActivate`; Button itself has no built-in behavior).
- `packages/uikit-lucide/example/App.tsx`: `ariaLabel` on the three toolbar buttons (`Select all ${filtered.length} icons`, `Copy manifest`, `Clear selection`) and the search `Input` (`Search icons by name or tag`); `activationMessage` on Copy (`Copied N icons` — dynamic via signal-free re-render, acceptable); `focus={{ borderColor: colors.ring ?? colors.primary, borderWidth: 2 }}` on all three.
- **Accept — live in-product probe (browser automation, machine gate):** against `pnpm --filter @three-flatland/uikit-lucide... dev` (vite serve of the example):
  1. `document.querySelectorAll('[data-uikit-a11y] button').length === 3` and every one has non-empty computed accessible name.
  2. Tab sequence reaches input → buttons; on each focus, `document.activeElement` advances AND a screenshot diff / pixel probe shows the ring color on the focused button (read the panel color via canvas pixel at the projected rect border).
  3. Enter on "Select all" mutates the `N selected` text; live region (`[aria-live]`) textContent becomes the activation message after Copy.
  4. Rect overlap: for each button, `element.getBoundingClientRect()` ∩ its uikit panel screen rect (recomputed in-page from the component's `globalPanelMatrix`/`size` via a `window.__uikitA11yDebug` hook exposed by the example in dev) ≥ 90% IoU.
- Acceptance-matrix rows: #2, #3(machine half), #5, #9(fronto-parallel), #17 (live).

## Phase gate

Unit + typecheck + lint (as Phase 0) **plus the live probe script green**, run by the orchestrator itself. Manual VoiceOver spot-check (name/role announced on the three buttons) — recorded in the matrix checklist, not merge-blocking.
