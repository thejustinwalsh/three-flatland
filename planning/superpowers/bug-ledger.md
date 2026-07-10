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

---

## Upstream PR plan

1. **U1/U2/U3** — file against `pmndrs/uikit` with the repros in `upstream-uikit-bugs.md`. Highest
   value, cleanly ours-vs-theirs verifiable. **Needs stakeholder sign-off to file.**
2. **U4/U5** — confirm fork-vs-upstream first (is it in upstream main too?). If upstream, PR; if
   fork, land locally.
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
