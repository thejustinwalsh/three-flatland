# three-flatland

## 0.1.0-alpha.8

### Minor Changes

- d3ee466: > Branch: feat/world-effect-materials

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/156

  ### Changes
  - World-scope constants-effect material variants: sprites with a constants-effect (e.g. `NormalMapProvider`) now resolve materials per-world instead of from a flat module-global cache, eliminating cross-world material sharing/coupling for effect variants (matches existing default-material behavior)
  - Reassigning a texture on a sprite holding a shared effect-variant material now re-resolves the variant instead of mutating the shared instance in place
  - Fixed `alphaTest`/`premultipliedAlpha` being silently dropped on variant re-resolution (texture reassignment, dispose resurrection, bootstrap enrollment) — sprites relying on alpha-test depth fast-path or premultiplied-alpha `CustomBlending` now keep those settings correctly
  - Added `Sprite2DMaterial.variantOptions` accessor to centralize variant option readback and prevent future drift between the cache key and its consumers

  ### Summary

  Effect-variant materials are now world-scoped like default materials, fixing cross-world sharing bugs, and a related regression that dropped alpha-test/premultiplied-alpha settings during material re-resolution has been fixed.

- 12bacea: > Branch: feat/rotated-polygon-mesh

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/144
  - Polygon-trim meshes (`SpriteSheetLoader`) are no longer discarded for rotated TexturePacker frames. Previously any frame with `frame.rotated: true` fell back to a plain quad, even when a mesh was defined; now the mesh renders correctly since mesh space is always the unrotated source frame, and rotation is handled per-instance in the shader (`ROTATED_FRAME_MASK` unrotation in `Sprite2DMaterial`/`OcclusionPass`).
  - Rotated polygon frames now contribute their hull to `buildEnvelopeGeometry` instead of degrading to a 4-corner quad fallback, improving overdraw reduction and occlusion accuracy for rotated, tightly-trimmed sprites.
  - Docs: corrected the hit-test guide's rotated/trimmed-frame caveat — rendering now honors both `frame.rotated` and `frame.trimmed`, but alpha hit-testing (`AlphaMap.sampleFrame`) hasn't caught up yet and can sample the wrong atlas region for such frames. Recommends `hitTestMode: 'bounds'` as a workaround until full atlas-aware alpha sampling lands (PR #117). Also updated the loaders guide to note polygon-trim now supports rotated frames.

  Fixes polygon-mesh sprites packed with rotation enabled in TexturePacker so they render with tight, overdraw-reducing meshes instead of silently falling back to quads.

- 26739f3: > Branch: feat/devtools-texturepacker

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/143

  ## Features
  - **TexturePacker support for rotated and trimmed frames** — atlases packed with size optimizations (rotation, trim) now render correctly without disabling those options at export. Rotated frames unrotate frame-local sampling via a new per-instance flag; trimmed frames position the quad at the true trimmed offset, with trim scale/offset baked into both the standalone and batched matrix paths so per-frame trim in animations no longer stretches or wobbles. `OcclusionPass` mirrors the same math. Docs updated to cover the supported TexturePacker feature set (rotation, trim, polygon trim).
  - **WebSocket transport for remote/mobile debugging** — run the game on a device and attach the desktop devtools dashboard over WebSocket. Adds a wire codec for bus frames (JSON + binary sections, round-trip safe for typed arrays), direction-filtered bridges over the existing BroadcastChannel bus, `createDevtoolsProvider({ remote: 'ws://…' })`, and outbound frame queuing while the socket is connecting.

  ## Fixes
  - Fixed a batching bug where batched sprites with a non-center anchor (`anchor != [0.5, 0.5]`) rendered at the wrong position — the batch path now bakes the anchor offset into the instance matrix identically to the standalone path. Added a regression test.
  - Hardened remote-debug WebSocket handling: both socket message handlers are now guarded against malformed frames (a bad frame no longer crashes remote debugging), the consumer bridge opens a provider's data channel eagerly so early subscribes aren't dropped, and reconnecting a provider on an already-closed socket now warns instead of silently going dark.
  - Fixed several adversarial-review findings on the remote-debug path: correct RFC 6455 fragmentation handling in the relay, a same-context echo guard to prevent provider/consumer bridges in one page from relay-ping-ponging forever, binary payloads now travel via an explicit path table instead of sentinel objects, and wire sends are properly bound to bridge lifetime.

  ## Summary

  This release adds full TexturePacker atlas support (rotation + trim) and a WebSocket-based remote debugging transport, alongside anchor-offset and remote-debug robustness fixes.

- 2f94520: > Branch: feat/overdraw-tight-mesh

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/142

  ## Tight-mesh envelope geometry for alpha-blend sprites
  - Add tight-mesh (convex-hull envelope) geometry path for transparent, non-alpha-tested sprite materials, cutting overdraw/fringe shading vs the synth-quad path. Materials auto-select the strategy from registered atlas polygon data; unregistered/meshless textures keep rendering as the synth quad with no behavior change.
  - Extend the atlas format with optional per-frame polygon mesh data (native `mesh` field or TexturePacker polygon-trim import), concatenated per-sheet and registered against each texture via a new atlas mesh registry.
  - Rebuild affected batches automatically when atlas content changes after sprites are already batched (late-loading sheets, re-registration, merges, degrades) — envelopes and geometry versioning now track atlas state so stale/clipped geometry can't persist.
  - Rotated TexturePacker frames fall back to the quad (rotated sampling isn't supported yet) instead of producing incorrectly sampled meshes.
  - Disconnected sprite silhouettes (multiple alpha blobs) now trace every connected component instead of only the first, preventing clipped envelopes.
  - A material already over the tight-mesh effect-float budget (16 floats, vs 24 for synth-quad) now demotes to synth-quad with a warning instead of throwing or silently overflowing WebGPU's binding budget; `registerEffect` is transactional so a rejected effect never leaves partial state behind.
  - Fix atlas merge bugs: a meshless sheet loading before a meshed sheet sharing its texture no longer gets marked complete prematurely (which would clip its frames); two complete sheets merging now correctly stay complete; dangling registry-level mesh arrays from re-registration are removed since only per-frame data is used.

  Files: packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/loaders/atlasMeshRegistry.ts, packages/three-flatland/src/loaders/atlasMesh.test.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts, packages/three-flatland/src/pipeline/convexHull.ts, packages/three-flatland/src/pipeline/envelopeGeometry.ts, packages/three-flatland/src/pipeline/tightMesh.test.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/sprites/types.ts, packages/atlas/src/polygon.ts

  Summary: Adds an opt-in tight-mesh envelope geometry path that reduces alpha-blend overdraw for sprites with registered atlas polygon data, plus a series of correctness fixes for atlas merging, late registration, and effect-budget handling discovered during review.

- e4c3c68: > Branch: feat/sort-layers-orchestration

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/141

  ## Auto-orchestration & batching
  - Sprites in a plain three.js scene now self-register per (renderer, scene) and auto-batch with siblings sharing the same material/sortLayer/layers.mask — zero setup required
  - Tiered batch buffers (1024 → 4096 → 16384 slots) with hysteresis, so batches grow/shrink without create/destroy flapping around thresholds; bulk-adds size their first batch for the load they already know about
  - Default materials are now scoped per world/registry instead of a single cross-world static cache, preventing effect registrations or texture swaps on one scene from leaking into another
  - Batch classification traits (`IsAlphaBlendedBatch`, `IsLitBatch`, `BatchGeometryStrategy`) exposed via `group.batches` / `registry.batches` query views
  - New `SortLayerGroup` container bridges first-party sprites and foreign three.js objects (Skia, Slug, plain Mesh) under one sort-ordering discipline
  - `SpriteGroup.maxBatchSize` is now a settable property (previously constructor-only), so it can be set via R3F JSX

  ## Fixes
  - Assigning `sprite.material` directly no longer gets silently clobbered by auto-orchestration on the next render sweep
  - Synth-quad geometry now carries real position/uv attributes, fixing custom TSL effects that read `uv()`/`positionGeometry()` (pixelate, dissolve, outline effects were previously broken)
  - Fixed a material leak: reassigning a sprite's material no longer keeps the old material (and its texture) alive forever
  - `spriteSheet` swaps now re-resolve the active animation frame instead of rendering with stale UVs
  - Missing-alphaMap raycast warning is now latched per sprite instead of a single process-wide flag that suppressed it for every other sprite
  - `effectTier` values that exceed the WebGPU buffer cap now throw at construction instead of failing deep in pipeline creation
  - Fixed batch eviction reading the wrong (undefined) slot during effect-tier upgrades, which silently no-op'd cleanup
  - Auto-batch tier floor raised from 64 to 1024 to cut CPU overhead (~20% faster on the knightmark example at matched sprite counts); batch consolidation across the ladder was dropped in favor of hand-tuned `maxBatchSize` for very large scenes
  - Fixed the missing-position console warning firing for synth-quad geometry, and various adversarial-review fixes to the sortLayer/batching stack (renderOrder derivation, dispose listener leaks, run-key bit width, negative sortLayer handling)

  ## Performance
  - Synth-quad geometry (index-only, position synthesized in the vertex shader) replaces `PlaneGeometry` for sprites, freeing 3 vertex-buffer bindings and doubling effect capacity (`MAX_EFFECT_FLOATS` 12 → 24)

  ## Refactors
  - Internal cleanup: shared eviction core, deduped batch-view builder between `SpriteGroup`/`Registry`, internal scene sweep no longer calls the deprecated `SpriteGroup.update()`

  ## BREAKING CHANGES
  - `Sprite2D.layer` renamed to `sortLayer` (and the `{ layer }` constructor option to `{ sortLayer }`), to avoid confusion with three.js's `Object3D.layers` camera bitmask. `Layers`/`LayerManager` renamed to `SortLayers`/`SortLayerManager`. Update any code, examples, or docs referencing the old `layer` property/option.

  ***

  This release activates the full auto-orchestration and auto-batching pipeline for vanilla three.js scenes, adds a `SortLayerGroup` container and per-world default materials, and fixes a series of material/batching correctness bugs surfaced along the way, alongside a sort-layer rename that is the sole breaking change.

- 9b04cfa: > Branch: worktree-events-system

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/125

  ### c03dd167fcabfbc0f0ce6f52a4b43159d8585da5

  feat: extract the alpha hitmask baker into its own package
  Each flatland-bake baker is meant to be a small grab-it-when-you-need-it
  package, not a tenant of an unrelated one. The alpha baker had been
  parked in @three-flatland/normals (which already owned PNG decode), but
  the name was misleading — normals now shipped a non-normal baker.

  Move the alpha baker into a new @three-flatland/alphamap package: the
  `flatland-bake alpha` subcommand, bakeAlphaMapFile, and the
  ALPHA_DESCRIPTOR. The runtime side (AlphaMap, resolveAlphaMap) stays in
  three-flatland/events, decoupled by the re-declared descriptor literal —
  no cross-package import either way. normals goes back to a single
  `normal` baker.

  Shared deps move to the workspace catalog (pngjs, @types/pngjs); both
  baker packages reference catalog:. Discovery is unchanged — the bake CLI
  finds whichever bakers are installed via their package.json flatland.bake
  manifest, so consumers install only the baker they need.
  Files: docs/src/content/docs/examples/hit-test.mdx, docs/src/content/docs/guides/baking.mdx, packages/alphamap/README.md, packages/alphamap/package.json, packages/alphamap/src/bake.node.test.ts, packages/alphamap/src/bake.node.ts, packages/alphamap/src/cli.ts, packages/alphamap/src/descriptor.ts, packages/alphamap/src/index.ts, packages/alphamap/src/node.ts, packages/alphamap/tsconfig.json, packages/alphamap/tsup.config.ts, packages/normals/package.json, packages/normals/src/alphaBake.node.ts, packages/normals/src/alphaBake.test.ts, packages/normals/src/alphaCli.ts, packages/three-flatland/src/events/resolveAlphaMap.ts, pnpm-lock.yaml, pnpm-workspace.yaml
  Stats: 19 files changed, 283 insertions(+), 121 deletions(-)

  ### 68fcbdf27396059dca8296c02ab23efd0bc7cc69

  fix: AnimatedSprite2D keeps a user-set alphaMap across sheet swaps
  The spriteSheet setter decided whether to replace alphaMap from the
  \_usesSpriteSheetAlphaMap flag, but that flag only tracks the sheet path
  — assigning the public alphaMap property directly leaves it stale at
  true. So inherit-from-sheet → user override → swap clobbered the user's
  map. Decide replacement by comparing the current alphaMap against the
  previous sheet's inherited map instead: replace only when alphaMap is
  null or still that inherited map. Add a regression test for the
  inherit → override → swap lifecycle (the existing user-set test never
  inherited first, so it missed the stale-flag path).
  Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
  Stats: 2 files changed, 34 insertions(+), 1 deletion(-)

  ### 024cb610d30e1683e400c1d2962b22348590c15d

  fix: AnimatedSprite2D updates inherited alphaMap on sheet swap
  CodeRabbit #125: the null-only guard left a sheet-inherited alphaMap stale
  after swapping spritesheets. Track inherited vs user-set so swaps update the
  inherited mask while preserving an explicit assignment.
  Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
  Stats: 2 files changed, 47 insertions(+), 1 deletion(-)

  ### a9209ed2ff60f71d021f3a9792fbd3602c276bee

  fix: empty supportedHitTestModes guard + resolveAlphaMap decode fallback
  CodeRabbit #125: resolveHitTestMode could return undefined for an empty
  supported list — now throws; a corrupt/stale baked .alpha.png rejected the
  whole load — now caught and degraded to runtime extraction; test warn
  assertion made NODE_ENV-deterministic.
  Files: packages/three-flatland/src/events/HitTestMode.test.ts, packages/three-flatland/src/events/HitTestMode.ts, packages/three-flatland/src/events/resolveAlphaMap.test.ts, packages/three-flatland/src/events/resolveAlphaMap.ts
  Stats: 4 files changed, 55 insertions(+), 18 deletions(-)

  ### 34c039f1a94e4384c223a8b1ae60a2297e92eea6

  fix: Sprite2D — flip-aware alpha sampling, clone hit-test config, explicit none guard
  CodeRabbit #125: alpha mode sampled the unflipped atlas (mirrored sprites
  hit-tested the wrong pixels) — now mirrors Sprite2DMaterial's UV flip;
  clone() dropped hitTestMode/hitRadius/alphaThreshold/alphaMap — now carried;
  added an explicit 'none' early-return in raycast() for direct calls (the
  raycast-nulling stays as the R3F-registration skip optimization).
  Files: packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
  Stats: 2 files changed, 66 insertions(+), 2 deletions(-)

  ### 46efe52a759e55bca8bac07c3d714a92f9ecca56

  refactor: break AlphaMap <-> sprites/types type cycle
  AlphaMap imported SpriteFrame from sprites/types while SpriteSheet.alphaMap
  imported AlphaMap back — a type-only cycle (no runtime effect, but real in
  the type graph). Give sampleFrame a local structural AtlasRect type so
  events/ never imports sprites/. Not the cause of the DTS-build heap pressure
  (that persists with the cycle gone — it's the package's type-graph size vs
  the default DTS worker heap), but correct hygiene.
  Files: packages/three-flatland/src/events/AlphaMap.ts
  Stats: 1 file changed, 14 insertions(+), 2 deletions(-)

  ### c67a9695449d412b0008da24b95684c0a156df1c

  fix: key the spritesheet cache on sidecar flags (alpha/normals/forceRuntime)
  Final-review finding: getCacheKey hashed only URL + texture preset, so
  load(url, { alpha: true }) and a bare load(url) shared a cache entry —
  whichever resolved first won, silently giving the alpha caller a sheet
  with no alphaMap (degrading hitTestMode 'alpha' to bounds). Fold the
  sidecar flags into the cache identity.
  Files: packages/three-flatland/src/loaders/SpriteSheetLoader.test.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts
  Stats: 2 files changed, 21 insertions(+), 1 deletion(-)

  ### b42b74ee5b6e8a546dddc47002802f4afd27174d

  feat: AnimatedSprite2D adopts SpriteSheet.alphaMap
  Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
  Stats: 2 files changed, 39 insertions(+), 7 deletions(-)

  ### 341ebeb22e9eefaf1ae9a919acb53c4e9345ed61

  feat: alpha option populating SpriteSheet.alphaMap via sidecar resolve
  Files: packages/three-flatland/src/loaders/SpriteSheetLoader.test.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/sprites/types.ts
  Stats: 3 files changed, 104 insertions(+), 10 deletions(-)

  ### f7115882e8ed985ebc7734519c0d4e2cacf4d0e0

  feat: resolveAlphaMap with baked-sidecar probe and runtime fallback
  Files: packages/three-flatland/src/events/index.ts, packages/three-flatland/src/events/resolveAlphaMap.test.ts, packages/three-flatland/src/events/resolveAlphaMap.ts
  Stats: 3 files changed, 129 insertions(+)

  ### b42d30032bc24367b6fdcb0c7993cb381fd8abd7

  feat: createFlatlandCompute portal events seam for flatland camera
  Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/react/flatlandEvents.test.ts, packages/three-flatland/src/react/flatlandEvents.ts, packages/three-flatland/src/react/index.ts
  Stats: 4 files changed, 88 insertions(+), 2 deletions(-)

  ### fba088a29a2895c7c8614b1991136f5f72c12b92

  feat: TileMap2D raycast with O(1) tile lookup and child-traversal block
  Files: packages/three-flatland/src/tilemap/TileMap2D.raycast.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
  Stats: 2 files changed, 151 insertions(+), 7 deletions(-)

  ### b7ff64f3ca3cc646e19db7d5a66285ba10e67efa

  feat: Sprite2D.raycast with radius/bounds/alpha modes and none opt-out
  Files: packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
  Stats: 2 files changed, 271 insertions(+), 13 deletions(-)

  ### a172d41ce3f865d7f1c311095ade3dc26c0ce6b5

  feat: export events module + react subpath wrapper
  Files: packages/three-flatland/package.json, packages/three-flatland/src/events/HitTestMode.ts, packages/three-flatland/src/events/index.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/react/events/index.ts
  Stats: 5 files changed, 35 insertions(+)

  ### 5d49506fcd75ed23e5d959d92008e20a502b576a

  feat: AlphaMap CPU alpha store with frame-rect sampling
  Files: packages/three-flatland/src/events/AlphaMap.test.ts, packages/three-flatland/src/events/AlphaMap.ts
  Stats: 2 files changed, 101 insertions(+)

  ### 86260c6e2e8ede3c46042254897602c59fb20eda

  feat: ray-to-local-plane helpers with per-hit point cloning
  Files: packages/three-flatland/src/events/raycastHelpers.test.ts, packages/three-flatland/src/events/raycastHelpers.ts
  Stats: 2 files changed, 117 insertions(+)

  ### ea9bca8a343587ee0f4e99c9af5fa49a8dfcd29d

  feat: hit-test mode union with resolve fallback
  Files: packages/three-flatland/src/events/HitTestMode.test.ts, packages/three-flatland/src/events/HitTestMode.ts
  Stats: 2 files changed, 50 insertions(+)

- ea7ec3d: > Branch: feat/oklch-color-main

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/123

  ### e1167303647acd572b4cfdd6ea435f6410bdbe90

  fix: correct Color color-space semantics, exact sRGB transfer, TSL dedup
  Review-cycle fixes for the ported suite (this is its first review):

  CPU (three-flatland/src/color):
  - colorToOklab / oklabToColor / relativeLuminance now treat Color
    components as working-space Linear-sRGB (the three.js default since
    r152) instead of double-applying the sRGB transfer; srgbToLinear /
    linearToSrgb remain for explicit gamma-encoded values
  - tests hardened with absolute Ottosson/CSS Color 4 reference values,
    exact mid-gray luminance, exact 21:1 black/white contrast, and a
    non-cancelling round-trip through the Color type

  TSL (@three-flatland/nodes/color):
  - exact IEC 61966-2-1 transfer via three/tsl sRGBTransferEOTF/OETF
    (replaces the pow-2.2 approximation; GPU now matches CPU)
  - gamma entry points clamp input to [0,1] (kills pow-on-negative NaN)
  - reuse three/tsl cbrt and TWO_PI; drop local re-implementations
  - oklchLerp reuses the shared OKLAB<->OKLCH polar helpers from oklch.ts
  - conversion cores wrapped in Fn() so composed calls emit shader
    function invocations instead of re-inlined subgraphs; typed through a
    narrow adapter (array-inputs Fn overload is runtime-supported but
    missing from some @types/three resolutions)
    Files: packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/interpolation.test.ts
    Stats: 11 files changed, 208 insertions(+), 85 deletions(-)

  ### 3ba7af85461c0ba7bc153aaf28c47155075b7cd5

  feat: port OKLAB/OKLCH color suite onto the current layout
  Re-homes the orphaned worktree-oklch-color work (39086a1f, based on a
  pre-alpha-6 tree) onto main:
  - @three-flatland/nodes: oklab/oklch/oklchLerp TSL nodes alongside the
    existing color nodes, exported from the color index
  - three-flatland: new src/color/ CPU-side suite (conversions, distance,
    gamut, harmony, interpolation, palette) with ./color package exports
    and a generated react subpath wrapper (pnpm sync:react)

  Adapted to current conventions: import type for type-only imports,
  dropped an unused import, prettier formatting.
  Files: packages/nodes/src/color/contrast.ts, packages/nodes/src/color/hueShift.ts, packages/nodes/src/color/index.ts, packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/package.json, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/gamut.test.ts, packages/three-flatland/src/color/gamut.ts, packages/three-flatland/src/color/harmony.test.ts, packages/three-flatland/src/color/harmony.ts, packages/three-flatland/src/color/index.ts, packages/three-flatland/src/color/interpolation.test.ts, packages/three-flatland/src/color/interpolation.ts, packages/three-flatland/src/color/palette.test.ts, packages/three-flatland/src/color/palette.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/react/color/index.ts
  Stats: 25 files changed, 1497 insertions(+), 6 deletions(-)

- 6caf0f8: > Branch: worktree-events-system

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/125

  ### 6ef42b72356a33615296a0073adce1737af0b49f

  fix: AnimatedSprite2D updates inherited alphaMap on sheet swap
  CodeRabbit #125: the null-only guard left a sheet-inherited alphaMap stale
  after swapping spritesheets. Track inherited vs user-set so swaps update the
  inherited mask while preserving an explicit assignment.
  Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
  Stats: 2 files changed, 47 insertions(+), 1 deletion(-)

  ### 5a4f6853b2599ec68989f302a77a7225f716cb39

  fix: empty supportedHitTestModes guard + resolveAlphaMap decode fallback
  CodeRabbit #125: resolveHitTestMode could return undefined for an empty
  supported list — now throws; a corrupt/stale baked .alpha.png rejected the
  whole load — now caught and degraded to runtime extraction; test warn
  assertion made NODE_ENV-deterministic.
  Files: packages/three-flatland/src/events/HitTestMode.test.ts, packages/three-flatland/src/events/HitTestMode.ts, packages/three-flatland/src/events/resolveAlphaMap.test.ts, packages/three-flatland/src/events/resolveAlphaMap.ts
  Stats: 4 files changed, 55 insertions(+), 18 deletions(-)

  ### 407074489eb41e31cd5347c2b23a0f8f33b0e0a5

  fix: Sprite2D — flip-aware alpha sampling, clone hit-test config, explicit none guard
  CodeRabbit #125: alpha mode sampled the unflipped atlas (mirrored sprites
  hit-tested the wrong pixels) — now mirrors Sprite2DMaterial's UV flip;
  clone() dropped hitTestMode/hitRadius/alphaThreshold/alphaMap — now carried;
  added an explicit 'none' early-return in raycast() for direct calls (the
  raycast-nulling stays as the R3F-registration skip optimization).
  Files: packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
  Stats: 2 files changed, 66 insertions(+), 2 deletions(-)

  ### 61bcf0b0cfc02c270930bea2b99c2acc87140140

  refactor: break AlphaMap <-> sprites/types type cycle
  AlphaMap imported SpriteFrame from sprites/types while SpriteSheet.alphaMap
  imported AlphaMap back — a type-only cycle (no runtime effect, but real in
  the type graph). Give sampleFrame a local structural AtlasRect type so
  events/ never imports sprites/. Not the cause of the DTS-build heap pressure
  (that persists with the cycle gone — it's the package's type-graph size vs
  the default DTS worker heap), but correct hygiene.
  Files: packages/three-flatland/src/events/AlphaMap.ts
  Stats: 1 file changed, 14 insertions(+), 2 deletions(-)

  ### 2e0d613acc3b1f39ecfc65a2b5b1755d1d346fe1

  fix: key the spritesheet cache on sidecar flags (alpha/normals/forceRuntime)
  Final-review finding: getCacheKey hashed only URL + texture preset, so
  load(url, { alpha: true }) and a bare load(url) shared a cache entry —
  whichever resolved first won, silently giving the alpha caller a sheet
  with no alphaMap (degrading hitTestMode 'alpha' to bounds). Fold the
  sidecar flags into the cache identity.
  Files: packages/three-flatland/src/loaders/SpriteSheetLoader.test.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts
  Stats: 2 files changed, 21 insertions(+), 1 deletion(-)

  ### 3673d47a4a1655dba76e82f5597eec98e987e62d

  feat: AnimatedSprite2D adopts SpriteSheet.alphaMap
  Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
  Stats: 2 files changed, 39 insertions(+), 7 deletions(-)

  ### 1c815f291b6fe71895f8b283959a29a4c9501d00

  feat: alpha option populating SpriteSheet.alphaMap via sidecar resolve
  Files: packages/three-flatland/src/loaders/SpriteSheetLoader.test.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/sprites/types.ts
  Stats: 3 files changed, 104 insertions(+), 10 deletions(-)

  ### add6a9a3140a7998087ad73d37f883f917a15f98

  feat: resolveAlphaMap with baked-sidecar probe and runtime fallback
  Files: packages/three-flatland/src/events/index.ts, packages/three-flatland/src/events/resolveAlphaMap.test.ts, packages/three-flatland/src/events/resolveAlphaMap.ts
  Stats: 3 files changed, 129 insertions(+)

  ### 582b062ed76faf32d864903bad89dd5df380dd17

  feat: createFlatlandCompute portal events seam for flatland camera
  Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/react/flatlandEvents.test.ts, packages/three-flatland/src/react/flatlandEvents.ts, packages/three-flatland/src/react/index.ts
  Stats: 4 files changed, 88 insertions(+), 2 deletions(-)

  ### 605935e17dff298a10892b030a26be73b9eccc41

  feat: TileMap2D raycast with O(1) tile lookup and child-traversal block
  Files: packages/three-flatland/src/tilemap/TileMap2D.raycast.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
  Stats: 2 files changed, 151 insertions(+), 7 deletions(-)

  ### e89e37ccfa4c3bd1f2964605fa9228610f40859b

  feat: Sprite2D.raycast with radius/bounds/alpha modes and none opt-out
  Files: packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
  Stats: 2 files changed, 271 insertions(+), 13 deletions(-)

  ### 312486dce60c249214a80201d69d32a67cdfbc31

  feat: export events module + react subpath wrapper
  Files: packages/three-flatland/package.json, packages/three-flatland/src/events/HitTestMode.ts, packages/three-flatland/src/events/index.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/react/events/index.ts
  Stats: 5 files changed, 35 insertions(+)

  ### 9a6d9b7ca6cbb6c987531dcf832c285491e308db

  feat: AlphaMap CPU alpha store with frame-rect sampling
  Files: packages/three-flatland/src/events/AlphaMap.test.ts, packages/three-flatland/src/events/AlphaMap.ts
  Stats: 2 files changed, 101 insertions(+)

  ### d3483e8dc2a29268cda39bf596adfbafba34cefa

  feat: ray-to-local-plane helpers with per-hit point cloning
  Files: packages/three-flatland/src/events/raycastHelpers.test.ts, packages/three-flatland/src/events/raycastHelpers.ts
  Stats: 2 files changed, 117 insertions(+)

  ### 4ffe61342f0b8327c7ff9bd854effc6ad056f0d1

  feat: hit-test mode union with resolve fallback
  Files: packages/three-flatland/src/events/HitTestMode.test.ts, packages/three-flatland/src/events/HitTestMode.ts
  Stats: 2 files changed, 50 insertions(+)

- 0033ea6: > Branch: feat/oklch-color-main

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/123

  ### cc96f8702ab41e81980f329f3829f21fc0bc890f

  fix: correct Color color-space semantics, exact sRGB transfer, TSL dedup
  Review-cycle fixes for the ported suite (this is its first review):

  CPU (three-flatland/src/color):
  - colorToOklab / oklabToColor / relativeLuminance now treat Color
    components as working-space Linear-sRGB (the three.js default since
    r152) instead of double-applying the sRGB transfer; srgbToLinear /
    linearToSrgb remain for explicit gamma-encoded values
  - tests hardened with absolute Ottosson/CSS Color 4 reference values,
    exact mid-gray luminance, exact 21:1 black/white contrast, and a
    non-cancelling round-trip through the Color type

  TSL (@three-flatland/nodes/color):
  - exact IEC 61966-2-1 transfer via three/tsl sRGBTransferEOTF/OETF
    (replaces the pow-2.2 approximation; GPU now matches CPU)
  - gamma entry points clamp input to [0,1] (kills pow-on-negative NaN)
  - reuse three/tsl cbrt and TWO_PI; drop local re-implementations
  - oklchLerp reuses the shared OKLAB<->OKLCH polar helpers from oklch.ts
  - conversion cores wrapped in Fn() so composed calls emit shader
    function invocations instead of re-inlined subgraphs; typed through a
    narrow adapter (array-inputs Fn overload is runtime-supported but
    missing from some @types/three resolutions)
    Files: packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/interpolation.test.ts
    Stats: 11 files changed, 208 insertions(+), 85 deletions(-)

  ### 2760f64794e3a6eed3e8814be9c43f9daeddda2f

  feat: port OKLAB/OKLCH color suite onto the current layout
  Re-homes the orphaned worktree-oklch-color work (39086a1f, based on a
  pre-alpha-6 tree) onto main:
  - @three-flatland/nodes: oklab/oklch/oklchLerp TSL nodes alongside the
    existing color nodes, exported from the color index
  - three-flatland: new src/color/ CPU-side suite (conversions, distance,
    gamut, harmony, interpolation, palette) with ./color package exports
    and a generated react subpath wrapper (pnpm sync:react)

  Adapted to current conventions: import type for type-only imports,
  dropped an unused import, prettier formatting.
  Files: packages/nodes/src/color/contrast.ts, packages/nodes/src/color/hueShift.ts, packages/nodes/src/color/index.ts, packages/nodes/src/color/oklab.test.ts, packages/nodes/src/color/oklab.ts, packages/nodes/src/color/oklch.test.ts, packages/nodes/src/color/oklch.ts, packages/nodes/src/color/oklchLerp.test.ts, packages/nodes/src/color/oklchLerp.ts, packages/three-flatland/package.json, packages/three-flatland/src/color/conversions.test.ts, packages/three-flatland/src/color/conversions.ts, packages/three-flatland/src/color/distance.test.ts, packages/three-flatland/src/color/distance.ts, packages/three-flatland/src/color/gamut.test.ts, packages/three-flatland/src/color/gamut.ts, packages/three-flatland/src/color/harmony.test.ts, packages/three-flatland/src/color/harmony.ts, packages/three-flatland/src/color/index.ts, packages/three-flatland/src/color/interpolation.test.ts, packages/three-flatland/src/color/interpolation.ts, packages/three-flatland/src/color/palette.test.ts, packages/three-flatland/src/color/palette.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/react/color/index.ts
  Stats: 25 files changed, 1497 insertions(+), 6 deletions(-)

- 30550a2: > Branch: preview/tools-combined

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/172

  ## Atlas schema & validation
  - New `@three-flatland/schemas` package: canonical `schema.json` + Ajv validators for the atlas format, silo'd out of `three-flatland` runtime (removes Ajv from the bundle — full build drops 56.91 kB → 22.26 kB brotli, -34.65 kB)
  - Atlas schema JSON hosted from the docs site for external `$ref` consumers
  - `scripts/gen-schema-types.ts` codegens `atlas.types.gen.ts` from schema.json into both `three-flatland` and `tools/io`; committed so a fresh checkout builds without the codegen toolchain; `pnpm gen:types:verify` now wired into CI's build/verify step to catch drift
  - Relaxed atlas `meta` requiredness: only `size` is required now, `meta.sources` and legacy `meta.image` both validate via `anyOf` — fixes raw TexturePacker/Aseprite exports (image-only meta) failing validation and crashing `validateAtlas()`
  - Added per-frame polygon fields to `Frame`: baked `mesh` (verts/indices) plus TexturePacker's `vertices`/`verticesUV`/`triangles`, with `mesh` preferred on read
  - Fixed a schema/codegen bug where nesting `sources`/`image` `anyOf` directly inside `meta`'s subschema collapsed generated `AtlasJson` typing to a bare index signature, silently dropping every typed `meta.*` field (including `animations`)
  - `validateAtlas`/`assertValidAtlas`/`formatAtlasErrors` centralized with a format-uniqueness check; `tools/vscode` validator now re-exports from `@three-flatland/schemas/atlas` instead of duplicating the implementation

  ## Sprite animations
  - `AnimatedSprite2D` now auto-populates its animation controller from a loaded `SpriteSheet`'s named animations (`meta.animations` / Aseprite `frameTags`) via `sheetAnimationsToDefinition()` when no explicit `animationSet` is given — in both the constructor and the `spriteSheet` setter. An explicit `animationSet` still takes priority
  - Fixed a crash in `new AnimatedSprite2D({})` caused by missing optional chaining on `options.spriteSheet.animations`
  - `SpriteSheetLoader` now tolerates legacy `meta.image` atlases (`meta.sources?.[0]?.uri ?? meta.image`), fixing a runtime crash ("Cannot read properties of undefined (reading '0')") on any sidecar without `meta.sources`

  ## Editor tooling (atlas panel)
  - Atlas sidecar save workflow: `<basename>.atlas.json` written next to the source image via the new `atlas.schema.json` ($id `https://three-flatland.dev/schemas/atlas.v1.json`), a superset of TexturePacker's JSON-Hash format
  - Editor Save button + Cmd/Ctrl+S write the sidecar, with a themed status chip ("Saving atlas…" → "Saved N frames → knight.atlas.json", auto-hiding) and error state on failure
  - Canvas import restructuring and UI responsiveness improvements across the atlas/animation preview tooling

  ## BREAKING CHANGES
  - `three-flatland`'s `./sprites/atlas` and `./sprites/atlas.schema.json` subpath exports are removed; atlas schema validation now lives in `@three-flatland/schemas` (`@three-flatland/schemas/atlas`) instead

  ## Summary

  Atlas schema validation moves to a dedicated `@three-flatland/schemas` package (dropping ~35 kB of Ajv from the runtime bundle), atlas `meta` becomes more permissive to support real-world TexturePacker/Aseprite exports, sprites gain automatic animation population from atlas metadata, and the VSCode atlas editor gains a full sidecar save workflow.

- 261b5be: **BREAKING — render-order layers renamed to sort layers.** `layer` → `sortLayer` on `Sprite2D`/`AnimatedSprite2D` (property, constructor option, and R3F JSX prop), `Layers` → `SortLayers`, `LayerManager`/`Layer`/`LayerConfig`/`LayerName`/`LayerValue` → `SortLayerManager`/`SortLayer`/`SortLayerConfig`/`SortLayerName`/`SortLayerValue`, ECS trait `SpriteLayer` → `SortLayer`, and `SpriteSortFunction`'s comparator fields now read `sortLayer`. Camera layer masks (`sprite.layers`, three.js `Layers`) and tilemap tile layers (`TileLayer`, `tileFromIntersection().layer`) intentionally keep their names — that collision is why the rename exists. Also note: assigning `renderOrder` to a sprite now deliberately demotes it from batching to standalone rendering with a custom order; prefer `sortLayer` + `zIndex`.

  **A codemod ships with this release.** Point an LLM agent at `node_modules/three-flatland/codemods/layers-to-sort-layers.md` and it migrates your codebase (the artifact embeds the full agent instructions, scope rules for the camera-mask/tile-layer false positives, and verification commands). Codemod index: `node_modules/three-flatland/codemods/README.md`.

### Patch Changes

- 75fcf94: > Branch: feat/esm-oxc-migration

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/196
  - Fixed all real-source oxlint errors across the monorepo (0 errors remaining); `exhaustive-deps` kept as advisory warnings, matching prior eslint config
  - Applied oxlint autofixes and reformatting (unused imports/vars removed, `import type` enforced, floating promises voided, useless spreads removed)
  - Excluded e2e/spec test harnesses from lint scope (previously uncovered by eslint)
  - No functional/API changes — internal code-quality and tooling cleanup only, verified via typecheck (45/45) and build (46/46)

  No breaking changes.

  Internal lint and code-quality cleanup as part of the ESM/oxlint migration; no user-facing behavior changes.

- abad04f: > Branch: fix/dissolve-instant-vanish

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/158
  - Fix: the dissolve effect in the react `tsl-nodes` example vanished almost instantly instead of fading out over 1.5s. Caused by the noise texture being tagged sRGB via the `pixel-art` preset, which made WebGPU hardware-decode the raw noise samples and skew them toward 0. The noise texture now sets nearest filtering directly and leaves `colorSpace` untouched, matching the vanilla three.js example's behavior.
  - Add tests for `applyTextureOptions` documenting that `colorSpace` is only applied when explicitly provided, so data/mask textures (noise, height, distortion maps) can opt out of sRGB tagging.

  Fixes a bug where the WebGPU dissolve shader example dissolved too fast due to incorrect sRGB tagging on a non-color noise texture; no public API changes.

- a8b7e5d: > Branch: fix/devtools-buffer-pool-tier

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/120

  ### b304ae4058fd4d940bde62907ecd208a3b4670e8

  fix: restore buffer streaming without bloating the flush cursor
  `@three-flatland/devtools` panel stopped rendering texture pixels — every
  inspectable buffer entry (SDF passes, occlusion mask, ForwardPlus tiles)
  logged `[devtools] buffer entry '...' exceeds remaining pool buffer space.
Shipping metadata only.`

  Cause: `_textures.drain` was copying pixel bytes into the per-flush data-
  packet cursor (so a typed-array view in the published payload referenced the
  transferred pool buffer). When the data packet moved to the 256 KB medium
  tier — to fix the BroadcastChannel re-broadcast clone wobble — even a single
  SDF (~900 KB) overflowed the cursor and drain fell back to metadata-only.
  The convert path's `if (!entry.pixels) continue` guard then skipped the
  RGBA8/VP9 broadcast for that entry, so the consumer saw nothing.

  The cursor copy was always redundant. `_flush` already deletes `entry.pixels`
  after queuing each entry's `transport.convert(...)` — pixels never travel via
  the broadcasted data message regardless. They flow exclusively through the
  worker's `__convert__` path → `buffer:raw` / `buffer:chunk` broadcasts — and
  that path acquires its own per-entry large buffer for the transfer. The
  consumer renderer reads from `state.buffers[name].pixels`, which both
  broadcasts populate; the data-message pixel reference was a wasted
  intermediate.

  Fix is surgical:
  - `DebugTextureRegistry.drain` references `e.sample` directly. No cursor
    copy, no size check, no warning. The `into?: BufferCursor` parameter +
    `warnedOversized` flag + `copyTypedTo` import all drop out.
  - `DevtoolsProvider._flush` keeps `acquireMedium()` (no tier escalation
    needed — pixel bytes never travel via this buffer) and drops the cursor
    arg from the textures drain call.

  Streaming pipeline untouched: convert → RGBA8 → buffer:raw (thumbnail mode)
  and convert → VideoEncoder → buffer:chunk (VP9 stream mode) both still flow
  through the per-entry large convBuf, the worker still handles codec probing
  and keyframe forcing, and the consumer's VideoDecoder path reads frames the
  same way.

  Tests:
  - `DebugTextureRegistry.test.ts` (new, 5 tests) — drain references the
    cached sample directly (no copy), omits pixels when not in the pixel
    subscription, handles huge samples (1024×1024 = 4 MB ForwardPlus shape)
    without warnings or pixel loss, emits metadata-only when the sample
    isn't ready, suppresses re-emission while version + shape are unchanged.
  - `DevtoolsProvider.buffers.test.ts` (new, 2 tests) — drives a real
    `_flush` against a capturing transport: asserts `convert()` was called
    with the raw pixels (the streaming path is alive), and that the
    broadcast data message carries metadata for the entry but `entry.pixels`
    is `undefined` (broadcast wobble can't return).

  Full suite: typecheck 31/31, debug tests 65/65 (8 files incl. the two new),
  lint 0 errors.
  Files: packages/three-flatland/src/debug/DebugTextureRegistry.test.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.buffers.test.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts
  Stats: 4 files changed, 342 insertions(+), 33 deletions(-)

- Updated dependencies [9b04cfa]
- Updated dependencies [6caf0f8]
- Updated dependencies [192774c]
  - @three-flatland/normals@0.1.0-alpha.3

## 0.1.0-alpha.7

### Minor Changes

- dea6d18: > Branch: lighting-stochastic-adoption

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/27

  ### 2D Lighting System
  - New `Light2D` class with point, ambient, and spot types; `castsShadow`, `importance`, and `category` properties
  - Forward+ tiled light culling: CPU tile bounds now aligned with shader screen-pixel stride math, fixing fill-light checkerboard gaps in non-power-of-two viewports
  - JFA-based signed SDF for shadow occlusion: two JFA chains (outside + inside distance) combined as `distOutside - distInside`; self-shadow uses clean `sdf < 0`
  - Occluder-dirty gate: shadow pipeline skips SDF regen when occluders and camera (position, frustum, zoom) are unchanged
  - Shadow pipeline runs after transform sync — no one-frame lag on moving casters
  - `shadowFilter` option (`auto|nearest|linear`) on `SDFGenerator`; auto ties to `shadowPixelSnapEnabled`
  - `OrthographicCamera.zoom` changes now trigger SDF regen (was skipped, freezing shadows on zoom)
  - Fill-light quota system: `castsShadow: false` lights capped at 2 per tile per category with luminance compensation via `fillScale`
  - `Light2D.category` (djb2 hash, 4 buckets): independent quota and compensation per fill category, preventing cross-type eviction
  - `Light2D.importance` (default 1.0): multiplicative bias for tile-slot ranking; hero lights resist eviction by dense cosmetic fill clusters
  - Dead per-tile `fillScale` shader multiply removed (was causing tile-boundary banding)
  - `LightEffect` system with ECS traits, attach helpers, and React integration
  - `NormalMapProvider` as the channel provider for normal maps

  ### Normal Map Pipeline
  - `normalDescriptor.ts` loader + `NormalSourceDescriptor` type added to the loaders barrel
  - `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` support `normals: true | descriptor` and `forceRuntime: true`
  - Loaders fall back to runtime TSL `normalFromSprite` when no baked sidecar is found; devtime warning fires at most once per URL

  ### Per-instance Data / ECS
  - Core instance data (UV, color, flip, system flags, shadow radius, extras) interleaved in a single buffer (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`); frees 3 WebGPU vertex buffer slots previously at the 8-binding cap
  - `EffectMaterial.MAX_EFFECT_FLOATS = 12` cap enforced at `registerEffect` time with a clear error instead of a silent WebGPU pipeline rejection
  - Per-sprite `shadowRadius` attribute: auto-derived from `max(|scale.x|, |scale.y|)`, overridable per-sprite; `transformSyncSystem` resolves it every frame tracking scale changes
  - New TSL helpers: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readShadowRadius()`
  - `Sprite2D.tint`/`anchor` delegate to shared `observable.color`/`vector2` strategies (removes ~100 lines of inline duplicate)

  ### Performance
  - ECS perf-track instrumentation gated dev-only; examples built in `production + FL_DEVTOOLS=true` no longer pay the per-frame measurement cost
  - `writeShadowRadius` idempotent: skips upload and dirty-mark when scale is unchanged in static-scale scenes
  - `AnimatedSprite2D` callback closures hoisted to bound instance fields — no per-frame allocation in dense animated scenes
  - Zero-alloc light-effect runtime context: module-level scratch object + live `Vector2` mutations
  - 256 KB medium pool tier for devtools stats packets; eliminates mark-compact GC spikes with dashboard active (p99 frame time 23.5 ms → 10.1 ms at 16k–20k sprites)
  - Devtools subsystem dead-stripped from production builds via inlined `process.env` gate; bundle: 45.4 KB → 36.3 KB
  - ECS schedule fully instrumented with colored Chrome Performance-panel tracks (dev/`FL_DEVTOOLS` only)
  - Shadow trace gated on per-light `castsShadow` flag — trace cost is O(casting lights) in dense fill scenes
  - Shadow trace skipped when attenuation ≤ 0.01 — free savings in near-miss contributions

  ### Devtools / Debug
  - `DevtoolsProvider` enables/disables GPU timestamp queries live off the stats subscription; fixes "Maximum number of queries exceeded" production regression from always-on query polling
  - Devtools bus worker resolves via extensionless URL — works from both `source` and `dist` consumers
  - Buffer subscription and effect field location added to the debug protocol

  ### Fixes
  - `process.env.NODE_ENV`/`FL_DEVTOOLS` typed via module-local `declare const process` — no `@types/node` dependency for browser consumers
  - `LinearFilter` imported as type-only in `SDFGenerator`
  - Type-aware lint fixes across debug, loaders, and tilemap code

  ## BREAKING CHANGES
  - `skipBakedProbe` renamed to `forceRuntime` on `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` normals options
  - `disableRuntimeBake` removed; use `forceRuntime: true` instead
  - `DEVTOOLS_BUNDLED` constant no longer exported from `three-flatland`; use the inlined `process.env.FL_DEVTOOLS` gate
  - `RadianceCascades` no longer exported from `three-flatland/lights` (deferred to a follow-up PR)
  - Internal instance buffer layout changed (`instanceUV`/`instanceColor`/`instanceSystem`/`instanceExtras`); public `Sprite2D` API is unchanged

  Delivers a complete 2D lighting pipeline with SDF shadows, Forward+ culling, normal-map baking, and production-safe devtools dead-stripping.

- 2db36c9: ## Unify baked-asset loader runtime flag as `forceRuntime`

  Every baked-asset loader in the codebase now exposes the same single flag — `forceRuntime: true` — declaring that the browser is where this asset's derived data is produced (instead of a CI bake step). The contract is unchanged: if you ask for the data, you get it. The flag only chooses _where_ generation happens. Mirrors `SlugFontLoader.forceRuntime`, which is the canonical pattern.

  ### Renames
  - `BakedAssetLoaderOptions.skipBakedProbe` → `forceRuntime`
  - `SpriteSheetLoaderOptions.skipBakedProbe` → `forceRuntime`
  - `LDtkLoaderOptions.skipBakedProbe` → `forceRuntime`
  - `TiledLoaderOptions.skipBakedProbe` → `forceRuntime`
  - `NormalMapLoader.skipBakedProbe` (instance + static `load()`) → `forceRuntime`
  - `ResolveNormalMapOptions.skipBakedProbe` → `forceRuntime`

  ### Removed
  - `LDtkLoaderOptions.disableRuntimeBake` (+ instance property)
  - `SpriteSheetLoaderOptions.disableRuntimeBake` (+ instance property)
  - `NormalMapLoader.disableRuntimeBake` (instance + static `load()` option)
  - `ResolveNormalMapOptions.disableRuntimeBake`

  The previous `disableRuntimeBake` flag conflated two intents into a second option. The unified model is simpler: **opt in to normals (`normals: true | descriptor`), and they're guaranteed to load** — baked sidecar if available, in-memory bake on miss, devtime warn when the runtime path fires. There is no "no normals" fallback; the engine never silently fails on a missing asset.

  `forceRuntime: true` is the project-level architectural choice for a specific asset: the browser is where its normal map is produced, on every load, no sidecar exists for it by design. Use for procedurally varied content, throwaway prototypes, or lean bundles. **Not** a dev-iteration knob; the default path (probe → bake on miss + warn) already handles iteration.

  ### Migration

  ```diff
  - SpriteSheetLoader.load(url, { normals: true, skipBakedProbe: true })
  + SpriteSheetLoader.load(url, { normals: true, forceRuntime: true })

  - SpriteSheetLoader.load(url, { normals: { disableRuntimeBake: true } })
  + SpriteSheetLoader.load(url, { normals: true })  // runtime bake is now always the fallback
  ```

### Patch Changes

- Updated dependencies [dea6d18]
- Updated dependencies [dea6d18]
- Updated dependencies [2db36c9]
  - @three-flatland/bake@0.1.0-alpha.2
  - @three-flatland/normals@0.1.0-alpha.2

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
