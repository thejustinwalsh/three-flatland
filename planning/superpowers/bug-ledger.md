# Bug ledger — uikit fork

Every defect found while forking `pmndrs/uikit` → `@three-flatland/uikit` (TSL/WebGPU + Slug).
Split by **who owns the fix**. Upstream-owned bugs are PR candidates; fork-owned are ours to land.
Status: ⬜ open · 🔧 fixed-in-fork · ✅ verified-in-browser · 📤 PR-ready · ⏳ needs-confirmation.

The reason a comprehensive ledger matters: this port's dominant failure mode is the **silent
no-op** — code that compiles, lints, passes tests, and does nothing. Six of these shipped and were
caught only by looking at pixels. Every entry below notes how it was caught.

---

## three.js (mrdoob/three.js)

### T1 — InstanceNode syncs update ranges too late ✅ patched

- **PR:** [#33615](https://github.com/mrdoob/three.js/pull/33615) — already MERGED upstream.
- Instanced buffer writes queued in a frame were synced in `update()` (after render prep), so the
  GPU upload landed a frame late — freshly-mounted/changed instanced content (uikit panels, glyphs,
  icons) popped in one frame behind.
- **Ours:** backported as a local pnpm patch on 0.183.1 (`patches/three@0.183.1.patch`) until we take
  the 184+ upgrade. No new PR needed; documented that we carry it.
- **Caught by:** stakeholder noticing bar-fills / icons pop in on tab change.

---

## @react-three/fiber v10 (alpha) — pmndrs/react-three-fiber

### R1 — `createPortal` injects a Scene that StrictMode orphans ⏳📤

- v10's Portal injects an intermediate `THREE.Scene` when the container isn't a Scene. That scene's
  layout effect is cleanup-only (remove + dispose, never re-add), so React 19 StrictMode's
  mount→cleanup→re-run permanently detaches it. Any `createPortal` onto a non-Scene Object3D is
  broken under dev StrictMode.
- **Workaround:** `createPortal(el, container, { injectScene: false })`.
- **Evidence:** `@react-three/fiber@10.0.0-alpha.2` dist, Portal ~line 14897.
- **Status:** worth reporting; it's an alpha so may already be on their radar. Needs a minimal repro.

### R2 — `RootState.gl` typed `WebGLRenderer` from the `/webgpu` entry ⏳

- `dist/index.d.ts:562` and `dist/webgpu/index.d.mts:564` both type `gl: WebGLRenderer` even though
  the /webgpu entry only ever constructs a `WebGPURenderer`. Forces casts. Types-only.

### R3 — (WITHDRAWN) "RootState.internal.subscribe was removed" ❌ my error

- I claimed v10 removed `internal.subscribe`. **False** — it exists (`InternalState`, dist
  `:515`/`:533`) and still returns a working unsubscribe. What is true and worth confirming: nothing
  in the v10 bundle appears to _iterate_ `internal.subscribers` (`useFrame` moved to a phase-graph
  scheduler). If confirmed, a callback registered via `internal.subscribe` is silently never called.
  **Needs a definitive check before any report.**

### R4 — R3F v10's dispatcher never delivers to Object3D `addEventListener` listeners (uikit's drag backend); fixed by routing events through @pmndrs/pointer-events ✅📤

- **NOT "pointer capture is broken."** Native DOM pointer capture works fine under v10 — our own events
  example (`examples/react/hit-test`) drags the knight with `gl.domElement.setPointerCapture(id)` +
  `canvas.addEventListener('pointermove', …)` (`hit-test/App.tsx:250–280`), reading `clientX/Y` by hand.
  That's the browser's `Element.setPointerCapture` on the real `<canvas>`; R3F is not in the loop, so it
  can't break. What v10's built-in dispatcher does NOT do is (a) deliver pointer events to an Object3D's
  `addEventListener` listeners, and (b) run the *synthetic* scene-graph capture (`event.target.setPointerCapture`
  → fresh-plane re-intersection → re-dispatch moves to that object). uikit is built on both; the knight
  sidesteps both by going straight to the DOM.
- **Symptom:** uikit `Slider` thumbs wouldn't drag and `Textarea` text-selection wouldn't drag; the
  hover cursor never changed. EVERYTHING else worked — clicks, focus, single-line typing, tabs, radios,
  switches, accordions, dialogs, pagination-as-buttons. Only interactions relying on **object-registered
  pointer-move + synthetic capture** failed. (React DevTools also wouldn't load — same-root suspicion;
  the fix cleared it, no loop.)
- **Isolation (user-confirmed, real Chrome):** the SAME uikit + uikit-default build worked in the plain
  **three.js** example and failed in EVERY **React** example → the @react-three/fiber v10-alpha React
  binding, not the bento example nor uikit core. Exonerated `uikit-bento` (time was lost suspecting its
  `frameloop`/`Fullscreen`).
- **Root cause (CONFIRMED):** R3F v10 dispatches events ONLY to JSX-prop handlers (`__r3f.handlers`).
  uikit's React binding bridges uikit's **declarative** handlers onto the R3F instance
  (`build.tsx` → `applyProps(container, {...handlers})`), so click/focus/type reach uikit fine. But
  `Slider`/`Textarea` drag register **imperative** Object3D listeners
  (`this.addEventListener('pointermove'…)` + `e.target.setPointerCapture`, `uikit-default/src/slider/index.ts:100–120`,
  `uikit/src/text/selection/pointer.ts:104–160`) which R3F v10 never delivers — and its capture path
  doesn't re-dispatch captured moves to Object3D listeners. The vanilla twin works precisely because it
  wires @pmndrs/pointer-events (`forwardHtmlEvents(..., {batchEvents:false})` + `attachCanvasInputProps`),
  which reads BOTH `object._listeners` AND `__r3f.handlers` and does capture with fresh-plane
  re-intersection. This is a **port gap, not an R3F bug** — upstream uikit ships the very same
  `noEvents`/`PointerEvents` pattern (its `noEvents` comes from `@react-three/xr`).
- **Fix (IMPLEMENTED):** new `packages/uikit/src/react/events.tsx` exports `noEvents` (an `EventManager`
  with `enabled:false`) + `<PointerEvents camera? scene?/>` — mounts
  `forwardHtmlEvents(dom, () => camera, scene, {batchEvents:false})` + `attachCanvasInputProps`, pumped by
  a `useFrame` update; defaults to R3F's camera/scene, takes optional overrides. Examples switch R3F's
  dispatcher OFF (`<Canvas events={noEvents}>`) and mount ONE `<PointerEvents>` aimed at the scene that
  hosts the UI (bento → defaults; `examples/react/uikit` → Flatland's OWN camera+scene, since the HUD is
  portalled onto that camera). Single dispatch source ⇒ no double-fire. Re-exported from `react/index.tsx`.
- **Verified (vitexec, headless WebGPU, `examples/react/uikit-bento`):** self-located `Slider` instances
  by `constructor.name`, drove multi-move drags — thumbs move AND **accumulate** (Δ1-move 0.025 → Δ4-move
  0.052; a second slider 0.038 → 0.065), hover lights the `pointer` cursor, **0 console errors, 120 fps**
  (no loop). Screenshot shows the dragged Resize/Radius thumbs parked at the right. `Input`/textarea
  targets show the `text` cursor and no x-motion (correct — selection, not translation).
- **Collateral port-debt folded in (iron law):** `build.tsx` globally augmented `three`'s
  `Object3D.__r3f` as R3F's full `Instance`; @pmndrs/pointer-events — now a real transitive dep via the
  `PointerEvents` binding — augments the SAME field as a minimal `R3FInstance` with no `.props`, so both
  in one program = **TS2717** conflicting re-declaration. Dropped uikit's augmentation; reach `.props`
  through a local structural type (`r3fHandle()`) at the two call sites (runtime value is always R3F's
  real instance, which has `props`). uikit + all four affected examples typecheck clean.
- **Upstream (📤):** file the port pattern (`noEvents` + `PointerEvents`) as the sanctioned v10 wiring.
  Our `PointerEvents` takes optional `camera`/`scene` (upstream's is default-only) — required for the
  Flatland-portalled-camera case; offer that as the upstream shape too.

---

## @pmndrs/uikit (the upstream base we forked)

These are the real PR candidates. Draft repros live in `upstream-uikit-bugs.md`.

### U1 — `getStarProperties` iterates `for...in` over an array ⏳📤

- `components/classes.ts` (upstream `classes.ts:115`) does `for (const conditionalKey in conditionalKeys)`
  where `conditionalKeys` is an **array** `['dark','hover','active','focus',...]`. `for...in` yields
  `'0'`,`'1'`,… so `properties['0']` is always undefined. Conditional `*` (star) properties are
  **never** extracted.
- Sharper than "styles don't apply": a component whose hover styling is star-only never attaches a
  hover listener at all (the listener attach is gated on `usedConditionals.hover`), so it cannot be
  hovered. `active`/`focus`/`dark` all affected.
- **Ours:** `for...of`. **Caught by:** stricter lint on the fork surfaced the dead iteration.

### U2 — `ClassList[Symbol.iterator]` same `for...in`-over-array bug ⏳📤

- Iterating a `ClassList` yields indices, not class entries.

### U3 — `uikit-horizon` `button/label-subtext.ts` computes disabled colour, never returns it ⏳📤

- Falls through to the default; disabled subtext colour silently ignored.

### U4 — Tabs content box sizes to content, not the Tabs width ⏳ (investigating)

- With the canonical demo (`<Tabs width={400}><TabsList width="100%">…<TabsContent><Card>`), our
  `TabsContent`/`Card` render at fit-content instead of stretching to 400, so the right (Password)
  TabsTrigger overflows the card and the content box **resizes on tab change**. Upstream's released
  packages (codesandbox) render it correctly at a stable 400.
- Component code (`tabs/*.ts`, `card/index.ts`) and `componentDefaults` are **byte-identical** to
  upstream. `flex/node.ts` differs only cosmetically (prettier). **So the cause is NOT our component
  port.** Suspects: yoga-layout version skew, or a regression in the upstream _main_ we forked from
  (released packages differ from main). **Under investigation — determines whether this is a fork
  fix or an upstream PR.**

### U5 — Video component stuck on first frame ⏳ (investigating)

- The `<Video>` texture renders its first frame and never updates — the video plays (audio/time
  advance) but the panel shows a frozen frame. Correlates with a `CopyExternalImageToTexture`
  warning the conformance run flagged, fired before the `<video>` has a decodable frame. Likely the
  per-frame texture update isn't wired (or a `readyState` guard is missing so the first copy fails
  and isn't retried). **Under investigation.**

### U6 — `material.clippingPlanes` reliance breaks on WebGPU (fork-inherited)

- Upstream clips `Image`/`Content`/`Custom` via `material.clippingPlanes`, which the common/WebGPU
  renderer **ignores** (it reads clipping only from `ClippingGroup`). Fine on WebGLRenderer. Not an
  upstream _bug_ (their target is WebGL), but a portability landmine. Fixed fork-side (uniform clip
  path + ClippingGroup). Noted for the record.

### U7 — cross-subtree paint order ties `minorIndex`; a Text paints over a later sibling's Panel ⏳📤

- `order.ts` derives an element's `minorIndex` from its **parent** orderInfo (`container.ts:96`,
  `computed(() => parentContainer.value.orderInfo.value)`), NOT the previous sibling. So two elements
  in different sibling subtrees tie on `(majorIndex, minorIndex)`, and the `elementType` tiebreak
  (`Text 4 > Panel 0`) paints an EARLIER subtree's `Text` over a LATER subtree's `Panel` — regardless
  of document order. Repro: the game-UI radio labels (`Text`) sort over the "Loading assets" footer
  bar (`Panel`). **Byte-identical to upstream** (our `order.ts` differs from `/tmp/uikit-upstream`
  only in type-only imports + the WebGPU RenderItem type), so UPSTREAM-SHARED, PR candidate.
- Deterministic repro (no browser/React): a column root with child0 = `tabs→radioGroup→radioItem→
  Text('Normal')` and child1 = `footer→loadingBar(Panel)`; after `root.update(16)` twice,
  `compareOrderInfo(radioLabel, loadingBar) === 4` (radio paints OVER — a correct result is < 0).
- **NOT fixed in core** (stakeholder call — "don't open Pandora's box"): a reactive document-order
  rewrite fragments panel batching (geoms 11→40) AND hits a preact "Cycle detected" on the three
  twin's build-then-attach; the untracked-read workaround reintroduces the ties. A proper fix needs an
  imperative single-pass order assignment — deferred as a deliberate upstream PR. The visible symptom
  is gone because its trigger (the reflow jump, F7) is fixed; the tie is latent without overlap.

---

## Fork-owned (our code — not upstream)

- **F1 baseline half-leading** ✅ — S2 mixed an exact ink-top term with the em-square centring, so
  text sat 0.10×fontSize too low. Now content-box half-leading. `slug/layout/baseline.ts`.
- **F2 panel matrix-range leak** ✅ — instanceMatrix `updateRanges` never coalesced under WebGPU;
  animated panels grew the list unbounded → FPS decay in both twins. Now compacted to one union
  range/frame. `panel/instance/mesh.ts`.
- **F3 React devtools zeroed stats** ✅ — the `endFrame→beginFrame` window straddled the rAF where
  three resets `info`. Split to 'start'/'finish' phases. `devtools/react/devtools-provider.tsx`.
- **F4 pixelSnap default true** ✅ — quantized Slug's analytic sub-pixel placement; now default false.
- **F5 retina viewport (CSS px)** ⬜ — `SlugMaterial` viewport is fed CSS px but drives `slugDilate`
  (AA) and pixelSnap in device-pixel space, so AA over-dilates ~DPR× on retina. **Re-dispatch queued.**
- **F6 example silent no-ops** ✅ — font-URL 404 → opentype on empty buffer; missing
  `attachCanvasInputProps`/`batchEvents:false`; double event system in the React twin; Flatland
  aspect never resized in R3F (→ PR #181). All fixed in examples / three-flatland.
- **F7 react-twin menu card re-centers on tab switch** ✅ — the React twin's `HudFullscreen` used
  `justifyContent:'center'`, recomputing the card's vertical position from its current height every
  frame, so each tab switch slid the whole card and a bad mid-reflow height frame flung it ("jumps
  halfway down the screen"). The vanilla twin already pins the top edge (`createMenuAnchor`); ported
  the anchor to the React twin (`examples/react/uikit/App.tsx`, `9a3e63cb`). This was the actual
  visible bug behind the "radios over the loading bar" report — the U7 stacking tie is only visible
  during the jump, so removing the jump removes the symptom.
- **F8 SlugBatch grows its instance buffer in place; WebGPU never rebinds it → the draw range
  outruns the bound buffer and the whole text batch freezes** ✅ — `slug/SlugBatch.ts`.
  `SlugBatchGeometry.ensureCapacity` grew the interleaved instance array, built a fresh
  `InstancedInterleavedBuffer`, and rebound the attributes **in place** (same geometry object). three's
  WebGPU render object caches a mesh's vertex buffers per geometry and does NOT notice a replaced
  interleaved buffer, so every grow AFTER the first render left the smaller GPU buffer bound while
  `SlugBatch.count` climbed into the grown region: `DrawIndexed(6, 778)` against a 772-instance buffer
  → `[Invalid CommandBuffer] is invalid due to a previous error` on every `Submit`, the whole batch
  frozen on its last good frame (no animation, stale `info.render`, `drawCalls` reads 0). Confirmed by
  instrumenting the grow — `[SBGX] grew cap -> 1158 arrayInstances 1158` fired while the draw still
  bound 772, and the glyph group's `count` never exceeded the LOGICAL capacity (no `[GGX]`), ruling out
  the allocator. The FIRST grow (before the render object exists) binds; every later grow does not.
  **Fix:** `SlugBatch.ensureCapacity` swaps in a fresh `SlugBatchGeometry` (`cloneGrown`, instances
  copied) and disposes the old one **after** it is unbound — a new geometry object forces three to
  rebuild the render object's vertex buffers, the same reason `panel/instance/group.ts` rebuilds its
  mesh on resize. Disposing the still-bound geometry instead throws `[Buffer] used in submit while
  destroyed` (three uploads to the freed buffer mid-frame), so the unbind-then-dispose order is
  load-bearing. Also folded a glyph-group fix: `text/render/instanced-glyph-group.ts` `onFrame` now
  ensures capacity for the append high-water `indexOffset + requestedGlyphsLength` (was the net live
  count, which undercounts by the hole slots `count` still spans). **Fork-owned** (SlugBatch is our
  Slug batch renderer, grow-only, diverges from upstream's MSDF group). **Caught by:** the uikit-default
  bento (~780 glyphs in one group) froze on first paint; ANY uikit text batch that grows past its
  initial capacity after first render hit this. **Follow-up:** the existing `SlugBatch.test.ts`
  "ensureCapacity grows…" case already exercises the swap and still passes (asserts ≥1.5× growth,
  contents preserved, `glyphPos` attribute identity changed) — but a jsdom test cannot catch the
  WebGPU rebind, so the real guard is a headless-WebGPU smoke test that grows a live `SlugBatch` past
  capacity after first render and asserts the draw succeeds. The in-place `SlugBatchGeometry.ensureCapacity`
  (`_growInto`) is now unused in production (kept for the pre-bind path / direct callers).

---

## Upstream PR plan

1. **U1/U2/U3** — file against `pmndrs/uikit` with the repros in `upstream-uikit-bugs.md`. Highest
   value, cleanly ours-vs-theirs verifiable. **Needs stakeholder sign-off to file.**
2. **U4/U5** — confirm fork-vs-upstream first (is it in upstream main too?). If upstream, PR; if
   fork, land locally.
2b. **U7** — cross-subtree paint-order tie. Confirmed byte-identical to upstream + deterministic repro
   in hand. Filing needs a soundness call on the fix (imperative single-pass order assignment) — a
   bigger change than U1-U3, so PR only after the approach is designed. Do NOT land the reactive
   rewrite (batching + preact-cycle regressions).
3. **R1** — minimal StrictMode repro, file against react-three-fiber.
4. **R3** — confirm the subscribers-never-iterated claim before reporting; do not file unverified.
5. **T1** — none; already merged, we carry the backport patch.

**Rule for this ledger:** nothing gets filed upstream on my say-so. Every entry marked ⏳ is
unconfirmed until re-verified against source, and filing on a third-party repo is a stakeholder call.

---

## PR extraction — MANDATORY before filing any upstream PR (future work)

We folded `pmndrs/uikit` into this monorepo and reran it through **our** Prettier/ESLint (no
semicolons, single quotes, trailing commas, `type` imports, our line width). A naive
`git diff` of any changed file against upstream is therefore **thousands of formatting lines around a
one-line fix** — unmergeable as a PR.

Before opening ANY upstream PR:

1. **Match upstream's exact formatting** on the file(s) you touched. Copy upstream's Prettier/ESLint
   config (from the isolated clone `/tmp/uikit-upstream` — its `.prettierrc`/`eslint.config`) and
   reformat ONLY the changed file(s) to upstream's style. Upstream uses semicolons, tabs, its own
   width — the opposite of ours.
2. **Extract the minimal diff.** Start from the upstream file at the commit/version we forked from,
   apply ONLY our behavioural change (e.g. U1's `for...in`→`for...of` is literally one word), and
   confirm `git diff` shows just that change — no formatting churn, no unrelated edits, no renames
   (`@three-flatland/*` → `@react-three/*` package names must be reverted for the PR).
3. **Rebase onto upstream, not our fork.** The PR branch is off `pmndrs/uikit` main, carrying only
   the minimal behavioural delta — never our TSL/Slug/rename changes.
4. Re-verify the fix still reproduces + resolves on a clean upstream checkout (not just our fork),
   since our fork's behaviour can diverge (different renderer, different deps).

In short: the fix content is trivial (U1/U2/U3 are one-liners); the _work_ is presenting it as a
clean minimal diff against upstream, stripped of our monorepo's formatting and renames. Budget for
that extraction step — it is the actual cost of each upstream PR, not the fix itself.
