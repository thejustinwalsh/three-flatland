# three-flatland

## 0.1.0-alpha.6

### Minor Changes

- ed33b1a: > Branch: fix-sprite-sort-regression

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/28

  ## Bug Fixes
  - **Sprite slot corruption after sort** — `BatchSlot` is now the single source of truth for a sprite's physical slot; `InBatch` relation no longer stores a slot field that could go stale after a sort swap, preventing slot zeroing on reassign/remove/material-rebuild
  - **Wrong blending when `premultipliedAlpha` differs** — `Sprite2DMaterial.getShared()` now includes `premultipliedAlpha` in its cache key; previously two materials differing only in this flag shared the same cached instance, silently applying the wrong blend mode and `depthWrite` value
  - **One-frame zero-matrix flash on new sprites** — patched Three.js `InstanceNode` to propagate `instanceMatrix` upload ranges in `updateBefore` instead of the FRAME phase, eliminating the blank-sprite flicker when a `SpriteBatch` grows its draw count (upstream: mrdoob/three.js#33615)
  - **Alpha fade artifacts** — the default 0.01 discard cutoff in `Sprite2DMaterial` now applies to `texColor.a` only, not `finalAlpha`; sprites faded via `instanceColor.a` no longer have their edges hardened during fade-out
  - **z-sort correctness** — `batchSortSystem` now re-sorts batch instance slots by `zIndex` each frame; slot permutations are applied via `SpriteBatch.swapSlots()` which keeps `instanceMatrix`, UV, color, flip, and all effect buffers in sync

  ## Features
  - **`alphaTest` option surfaced end-to-end** — `Sprite2DMaterialOptions.alphaTest > 0` sets `transparent=false` + `depthWrite=true` and discards fragments below the threshold; `batchSortSystem` short-circuits entirely for these batches since the GPU depth test handles ordering, included in `getShared()` cache key
  - **Anchor baked into matrix** — `Sprite2D` anchor changes no longer trigger a geometry rebuild; `(0.5 - anchor) * scale` is folded into the matrix translation in `updateMatrix`, correct under non-uniform scale and rotation
  - **Observable mutation hooks** — new `ObservableStrategy<T>` with `attach` / `snapshot` for `Color`, `Vector2`, `Vector3`, and `Euler`; consumers can react to in-place mutations of mutable Three.js types without prop reassignment

  ## Performance
  - **`batchSortSystem` O(n) swap + TimSort** — swap permutation now uses an inverse `slotToScratchIdx` Int32Array (O(n)) instead of a linear search (O(n²)); sorting replaced hand-rolled insertion sort with `Array.prototype.sort` (V8 TimSort: O(n) near-sorted, O(n log n) worst case vs O(n²) for 20k+ sprites); Knightmark 10k: 30 fps → 60+ fps
  - **`zIndex` setter fast path** — setter skips the ECS `Changed` write when the `alphaTest+depthWrite` gate applies, eliminating Koota change-tracker overhead on gated batches
  - **Interleaved core buffer** — `SpriteBatch` replaces three separate `instanceUV` / `instanceColor` / `instanceFlip` attributes with a single `InstancedInterleavedBuffer` (stride 16), dropping vertex buffer count from `3+1+3+N` to `3+1+1+N` and freeing two slots under WebGPU's `maxVertexBuffers=8` cap
  - **`EffectMaterial` slot cap** — `registerEffect` now enforces `MAX_EFFECT_FLOATS = 12` with a clear error instead of letting WebGPU reject the pipeline at draw time

  ## Internal
  - ECS systems with per-frame state (`batchAssignSystem`, `batchReassignSystem`, `batchRemoveSystem`, `batchSortSystem`, `sceneGraphSyncSystem`) converted to `createXxxSystem()` factories; each `SpriteGroup` holds its own scratch and change-tracking state, eliminating cross-group interference and high-water-mark overhead
  - `bufferSyncSystem` deleted — all buffer writes go direct through `_batchMesh` / `_batchSlot`; per-frame system loop loses one pass

  This release fixes the sprite sort regression that caused visual corruption and poor performance in y-sorted scenes, adds the `alphaTest` fast path for pixel-art sprites, and consolidates the per-instance GPU buffer layout to stay within WebGPU's vertex buffer limit as effect counts grow.

- 1719d16: > Branch: fix-sprite-sort-regression

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/28

  ## New Features
  - `Sprite2DMaterialOptions.alphaTest` is now fully wired end-to-end. Setting it to a value > 0 switches the material to `transparent=false` / `depthWrite=true` and discards fragments where `finalAlpha < alphaTest`. Distinct cutoff values produce distinct shared material instances.
  - Pixel-art and hard-edge sprites can opt in to GPU depth-test ordering by setting `alphaTest`, skipping CPU sort entirely — no per-frame `batchSortSystem` work for those batches.

  ## Performance
  - `batchSortSystem` now gates on material properties at frame start: batches with `alphaTest > 0 && depthWrite` are skipped entirely, so scenes like Knightmark pay near-zero sort cost.
  - Slot swap permutation rewritten from O(n²) linear search to O(n) using an inverse `slotToScratchIdx` lookup maintained in lockstep during swaps.
  - Per-batch sort upgraded from hand-rolled insertion sort (O(n²) cold-start) to `Array.prototype.sort` (V8 TimSort, O(n) near-sorted, O(n log n) worst case) — eliminates a ~400M-comparison cliff at 20k sprites.
  - `Sprite2D.zIndex` setter short-circuits the Koota `entity.set(SpriteZIndex, …)` call for gated materials, preventing the ECS Changed tracker from accumulating entries that `batchSortSystem` would only skip anyway.
  - Combined effect: Knightmark at 10k sprites went from 30 fps (22 ms in sort) to 60+ fps; sort cost drops to near-zero after the setter gate.
  - Consolidated three separate per-instance GPU attributes (`instanceUV`, `instanceColor`, `instanceFlip`) into one `InstancedInterleavedBuffer` (stride 16), reducing vertex-buffer slot usage from `3+1+3+N` to `3+1+1+N` — frees two slots under WebGPU's `maxVertexBuffers=8` cap and allows more effect data buffers.
  - Removed `bufferSyncSystem` pass entirely; color, UV, flip, and effect data are now written directly at mutation sites, saving one full-world pass per frame.
  - All ECS systems with non-trivial state converted to `createXxxSystem()` factories, giving each `SpriteGroup` independent scratch arrays and change-tracking state — no shared high-water-mark growth, no GC from per-call `new Set()`.

  ## Bug Fixes
  - Fixed sprite fade-out edge hardening: the default 0.01 discard cutoff now tests `texColor.a` only (pure transparency skip), not `texColor.a * instanceColor.a`. Sprites faded via `instanceColor.a` no longer lose texels in the `[0.01, 0.02)` range. The `alphaTest` opt-in continues to test combined alpha, as intended.
  - Fixed `batchSortSystem` not re-sorting batched sprites by `zIndex` each frame; GPU instance rows are now permuted in-place via `SpriteBatch.swapSlots`, preserving the free-list and all effect buffer rows.
  - Fixed latent flags-write in `batchReassignSystem`: was writing enable-bits to `effectBuf0[0]` (old layout) instead of `instanceSystem.w`.

  ## Internals
  - `BucketedDirtyTracker` constructor accepts both `InstancedBufferAttribute` and `InstancedInterleavedBuffer` via a shared `UploadTarget` structural type.
  - `EffectMaterial` effect-slot allocator now starts at offset 0 (flags moved to `instanceSystem.w`); `effectBuf*` is pure user data. A `MAX_EFFECT_FLOATS = 12` hard cap replaces the previous silent WebGPU pipeline rejection.
  - `Sprite2DMaterial` shader reads flip from `instanceSystem.xy` (was `instanceFlip`); `TileLayer` updated to match with a `vec4` attribute.
  - `Sprite2D` standalone path now mirrors the batched attribute layout (`_instanceSystemBuffer` vec4 + `_instanceExtrasBuffer` vec4).

  Resolves the sprite sort regression on PR #28; Knightmark with effects enabled sustains ~27k sprites at 60 fps on M2 Mac, matching the pre-effects baseline.

- e0562c3: > Branch: fix-sprite-sort-regression

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/28

  ### Sprite z-sorting — correctness fix and performance opt-in

  **Core fix (re-sort batch instance slots by zIndex each frame)**
  - Adds `batchSortSystem` running after `transformSyncSystem` and before `sceneGraphSyncSystem` — sprites now render in correct zIndex order within a batch
  - Gated on `Changed(SpriteZIndex)`: only batches with a zIndex change this frame are re-sorted; unchanged batches pay zero CPU cost
  - `SpriteBatch.swapSlots(a, b)` swaps instanceMatrix, UV, color, flip, and all custom effect buffer rows in lockstep; free-list and entity IDs are unaffected
  - `Sprite2D.zIndex` setter now triggers Koota's `Changed` tracker; `batchAssignSystem` fires it once on first slot assignment so newly-added sprites sort immediately
  - All sort scratch arrays are module-scope and reused frame-to-frame for zero-alloc hot paths
  - 234-line test suite added (`batchSort.test.ts`) covering sort correctness, no-op frames, and the alphaTest gate

  **`alphaTest` opt-in for pixel-art / opaque sprites**
  - `Sprite2DMaterialOptions.alphaTest` is now fully supported: when `> 0`, the material defaults to `transparent=false`, `depthWrite=true`, and the TSL shader discards fragments where `finalAlpha < alphaTest`
  - `Sprite2DMaterial.getShared()` dedup key now includes `alphaTest`, so different cutoff values produce distinct cached instances
  - `batchSortSystem` short-circuits any batch whose material has `alphaTest > 0 && depthWrite` — GPU depth test resolves draw order without CPU sorting
  - Knightmark demo updated to use `alphaTest: 0.5` (hard-edge pixel-art atlas), opting into the depth-test fast path

  **Internal / CI**
  - Fixed `prefer-const` lint error on `batchEntityBuckets` in `batchSortSystem` that was blocking CI on PR #28

  Fixes sprite z-ordering within batches for transparent sprites (CPU sort) and adds a GPU depth-test fast path for opaque/pixel-art sprites via `alphaTest`.

## 0.1.0-alpha.5

### Minor Changes

- fb92ecc: > Branch: docs-refresh-foundation

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/33

  ### Docs site

  **Footer**
  - New `SiteFooter` component: brand lockup, three link columns (Docs, Packages, Community), version row, gem-tinted section headings, foil rule accent; replaces the previous AI-disclaimer footer text
  - New `lib/packages.ts`: shared build-time workspace-package discovery drives both the footer Packages column and the landing alpha-ribbon from one source; suppresses badges matching the project-level baseline to reduce noise

  **API reference routing**
  - New `typedoc-plugins/strip-index-links.mjs` remark plugin strips trailing `/index/` from TypeDoc-generated URLs, fixing links to per-module index pages emitted as directory roots by Astro
  - `astro.config.mjs`: set `entryFileName=index`, wire `stripIndexLinks` plugin, populate `starlight.description` (feeds footer tagline + `<meta description>`)

  **Landing page copy**
  - Section heading: "Built into three.js, not on top of it" -> "Built for three.js" (removes false implication of an upstream fork)
  - VP1 opener rewritten to avoid a false-universal categorical claim
  - Hero subtagline: em-dash removed; replaced with two short declaratives
  - StatsBanner sprite count updated: 10K+ -> 20K+
  - `HeroShader.tsx`: side vignette removed; gem flow runs edge-to-edge

  **Theme polish**
  - `Header.astro`: wordmark +2px offset removed; baseline now aligns with header text
  - `SidebarSublist.astro`: API ref nested groups always-open via `forceCollapsable` cascade; full tree visible on any API page
  - `styles/base.css`: legacy `[data-slot=footer-text]` rules removed

  ### StatsBanner
  - Re-enabled the `color` prop on `<Stat>` (was marked deprecated and silently ignored, causing all stats to render in `--foreground`)
  - `color` resolves through the shared `legacyToGem` table (same mapping used by `FeatureCard` / `ValueProp`), so conventional names like `cyan` map to gem tokens
  - Stat value text now uses a gem-mixed color (65% gem + 35% foreground) with a soft gem-tinted text-shadow glow for legibility
  - Each stat gains a thin gem-tinted hairline underline (linear gradient fading right) so the four stats read as a colored chord across the row

  ***

  Adds a full-site footer with gem-accented navigation, fixes API reference URL routing so TypeDoc module links resolve correctly, sharpens landing page copy, and restores per-stat gem coloring in the stats banner.

## 0.1.0-alpha.4

### Minor Changes

- 4d6d65a: > Branch: feat-examples-tweakplane

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/22

  ### API changes
  - `Flatland.renderTarget` type changed from `WebGLRenderTarget` to `RenderTarget` — use `import { RenderTarget } from 'three'` instead of `WebGLRenderTarget` when passing a render target to `Flatland`

  ### Examples
  - All plain Three.js examples moved from `examples/vanilla/` to `examples/three/`; React examples remain under `examples/react/`
  - All examples now include Tweakpane debug controls via `createPane({ scene })` for live stats and scene-specific parameter controls

  ### Documentation
  - New "Debug Controls" guide covering Tweakpane integration for both vanilla Three.js and R3F
  - Updated guides for Flatland, sprites, pass-effects, and loaders to reflect `RenderTarget` API and example restructuring
  - Updated LLM prompt context files

  ### BREAKING CHANGES
  - `FlatlandOptions.renderTarget` accepts `RenderTarget` instead of `WebGLRenderTarget`. Update any call sites that pass a `WebGLRenderTarget` to use `RenderTarget` from `three`.

  `Flatland.renderTarget` now uses the renderer-agnostic `RenderTarget` type throughout, and plain Three.js examples have been reorganised into `examples/three/` to align with the established `three/` vs `react/` naming convention.

## 0.1.0-alpha.2

### Minor Changes

- 6f89768: > Branch: jw/ecs-update-and-perf

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/6

  ## Performance: ECS entity access overhaul
  - Updated koota dependency to v0.6.5
  - `measure()` utility now accepts a string as the first argument (in addition to a function), enabling named measurements without a function reference
  - Removed `ThreeRef` ECS trait; sprite-to-entity mapping is now handled internally via a flat array indexed by entity SoA ID
  - Replaced `readField`, `readTrait`, and `writeTrait` snapshot utilities with `resolveStore`, which returns stable SoA store arrays for a trait in a world
  - `Sprite2D` internal state refactored from a `_snapshot` object to per-field backing arrays using an array-ref swap pattern; standalone sprites use local arrays at index 0, enrolled sprites swap refs to world SoA arrays at entity index — zero branching in property setters
  - `RegistryData.spriteRefs` (Map) replaced by `RegistryData.spriteArr` (flat array indexed by entity SoA ID) for uniform O(1) array-index access across all ECS hot paths
  - Batch assign system defers `needsUpdate` and `syncCount` calls to a single flush after all entities are processed, reducing per-entity overhead

  ## BREAKING CHANGES
  - `ThreeRef` is no longer exported from the ECS module
  - `readField`, `readTrait`, and `writeTrait` are no longer exported; use `resolveStore` to access SoA store arrays directly
  - `RegistryData.spriteRefs` (Map) replaced by `RegistryData.spriteArr` (array); any code indexing the registry by entity must switch to array access with `entity & ENTITY_ID_MASK`
  - `Sprite2D._snapshot` removed; pre-enrollment state is now stored in per-field `_colorR`, `_colorG`, `_colorB`, `_colorA`, `_uvX`/`Y`/`W`/`H`, `_flipXArr`/`_flipYArr`, `_layerArr`, `_zIndexArr` arrays (all `@internal`)

  Performance-focused release replacing snapshot-based entity state with a zero-allocation array-ref swap pattern and upgrading the koota ECS library to v0.6.5.

## 0.1.0-alpha.1

### Minor Changes

- 96371ed: ## Initial alpha release of `three-flatland`

  ### New package
  - Core library source consolidated from `@three-flatland/core` into the new `three-flatland` package (renamed for simpler install)
  - Exports sprites, animation, materials, loaders, pipeline, tilemaps, and global uniforms from the package root
  - React Three Fiber integration available via `three-flatland/react` subpath — re-exports all core APIs plus R3F helpers and `ThreeElements` type augmentation
  - Per-domain subpaths: `three-flatland/sprites`, `/animation`, `/materials`, `/loaders`, `/pipeline`, `/tilemap`, `/react/sprites`, `/react/animation`, `/react/materials`, `/react/pipeline`, `/react/loaders`, `/react/tilemap`
  - Added `source` export condition on all entries for build-free monorepo development
  - R3F helpers: `attachEffect`, `createResource`, `createCachedResource`, `spriteSheet`, `texture`
  - Exports `FlatlandProps`, `Sprite2DProps`, `EffectElement` types from `three-flatland/react`

  ### Build & tooling
  - `tsup` dual ESM/CJS build with `.d.ts` and `.d.cts` declarations
  - Production environment check in `measure.ts` uses `import.meta.env?.PROD` with correct fallback
  - `tsconfig.json` cleaned up; stale ambient type declaration removed from `types/env.d.ts`
  - `sync-react-subpaths.ts` script generates per-category React re-export index files with `ThreeElements` side-effect import

  ### Documentation
  - Added `packages/three-flatland/README.md` (quick-start, R3F guide, package table) and `packages/three-flatland/LICENSE` (MIT)
  - Repository URL set to `https://github.com/thejustinwalsh/three-flatland.git`

  ### BREAKING CHANGES
  - Package renamed from `@three-flatland/core` to `three-flatland`; update all imports: `import { ... } from 'three-flatland'` and `import { ... } from 'three-flatland/react'`
  - R3F users should import from `three-flatland/react` instead of a separate `@three-flatland/react` package

  This is the initial alpha release of `three-flatland`, delivering the complete WebGPU 2D sprite, tilemap, and effects library with full React Three Fiber integration.

## 0.1.0-alpha.0

### Minor Changes

- Alpha release: Consolidate core+react into single `three-flatland` package with `/react` subpath, extract TSL nodes to `@three-flatland/nodes` with per-category subpaths, and use preserved module structure for maximum tree-shakeability.
