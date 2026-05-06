---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Shadow Nodes

- `shadowSDF2D` TSL helper: sphere-traces a line from fragment to light through a signed SDF texture; returns a `[0, 1]` shadow value with Inigo-Quilez soft-penumbra term
  - Options: `steps` (default 32), `softness`, `startOffset`, `eps`
  - `startOffset` is now a `FloatInput` (tunable uniform); default raised to 40 to clear typical sprite casters
  - Signed SDF consumed: self-shadow detected via `sdf < 0`, eliminating the need for a large hardcoded escape constant
- `shadowStartOffset` split from `shadowBias`: bias is the IQ hit epsilon, startOffset handles self-shadow escape

## Lighting Nodes

- `normalFromSprite` TSL helper updated for elevation-aware normal derivation

All changes are TSL node-level and require no renderer changes.

### 709348dd718744e4f0548c0279a51af996a5820d
fix: raise shadowStartOffset default to 40 to match caster scale
The 1.5 default from the polish spec assumed smaller sprites than
the demo actually uses (knight body is 64 world units). At 1.5 the
trace's first samples land back inside the knight silhouette,
producing self-shadow on the hero, and land in the Voronoi-seam
zone adjacent to silhouette edges, producing shadow-edge ringing.

The old unsigned-SDF path hardcoded escapeOffset = 40 precisely
because it cleared the knight's radius with margin. Restoring 40
as the new default keeps the demo artifact-free out of the box
while still letting users tune the slider for scenes with smaller
or larger casters. The schema comment, the shadowSDF2D docstring,
and the pane slider range are all updated to reflect that this is
a caster-scale parameter, not a hit-epsilon micro-value.
Files: examples/react/lighting/App.tsx, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 3 files changed, 15 insertions(+), 12 deletions(-)

### 7a5c6b57e4393013f8685316d568d46801eda06e
feat: tunable shadowStartOffset uniform, drop 40-unit magic
Replaces the hardcoded `escapeOffset = float(40)` in shadowSDF2D
with a `startOffset: FloatInput` option. DefaultLightEffect adds a
matching `shadowStartOffset` schema uniform (default 1.5 world
units) and threads it through. The lighting demo exposes the
slider alongside the existing bias / maxDistance controls.

Signed SDF (from the previous commits) makes the smaller default
safe — the trace can detect 'ray started inside a caster' directly
via `sdf < 0`, so the start offset only needs to clear the caster's
radius rather than guess conservatively at sprite scale. 1.5 covers
typical sprite casters; scenes with larger bodies can dial up the
slider from the pane.

Also splits the previously-overloaded `shadowBias` semantics:
`shadowBias` stays as the IQ hit epsilon, `shadowStartOffset`
handles the self-shadow escape. Neither can mask the other.
Files: examples/react/lighting/App.tsx, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 3 files changed, 29 insertions(+), 2 deletions(-)

### a5c7e60e27abcf2120a9ca8a13cca29bd2c978f8
feat: signed SDF via dual JFA chains
SDFGenerator now runs JFA twice — once seeded on occluder texels
(outside distance) and once on empty texels (inside distance) — and
combines them in the final pass as signedDist = distOutside -
distInside. Fragments outside occluders see positive distance;
fragments inside a caster see negative distance.

shadowSDF2D consumes the signed field:
- The at-surface self-shadow detection switches from `sdf < eps` to
  the cleaner `sdf < 0` (strictly inside), eliminating the eps
  approximation for the unsigned case.
- The existing in-loop `sdf < eps` hit check naturally catches
  both grazing hits and rays that stepped into an occluder (since
  negative signed values compare less than positive eps). No
  dedicated negative-distance terminator is needed.

Cost: SDF generation roughly doubles (two JFA chains + two seed
passes). Per-fragment shadow-trace cost is unchanged. SDF
generation is a small fraction of frame time; the correctness win
(no more `escapeOffset = 40` magic calibrated to sprite size)
lands the core fix this spec called out.

Debug buffer names changed — `sdf.jfaPing/Pong` split into
`sdf.jfaPing/PongOutside` and `sdf.jfaPing/PongInside`.
Files: packages/nodes/src/lighting/shadows.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 2 files changed, 229 insertions(+), 102 deletions(-)

### e3238bca08b2e6b90c267a5b9e831d68d4e675dc
refactor: remove unused lighting providers and loaders; update lighting tests and tilemap types
Files: packages/nodes/src/lighting/index.ts, packages/presets/src/lighting/AutoNormalProvider.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/DirectLightEffect.ts, packages/presets/src/lighting/NormalMapProvider.ts, packages/presets/src/lighting/TileNormalProvider.ts, packages/presets/src/lighting/index.ts, packages/presets/src/react/types.ts, packages/three-flatland/package.json, packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TiledLoader.ts, packages/three-flatland/src/tilemap/index.ts, packages/three-flatland/src/tilemap/types.ts
Stats: 14 files changed, 192 insertions(+), 1557 deletions(-)

### 5f850bdd862f6e277b8e830b992e1f4e16651747
feat: add normal descriptor loader and baking script; enhance material effects with elevation support
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json, examples/react/lighting/public/sprites/Dungeon_Tileset.normal.png, examples/react/lighting/public/sprites/slime.png, examples/three/lighting/main.ts, package.json, packages/bake/README.md, packages/bake/package.json, packages/bake/src/devtimeWarn.test.ts, packages/bake/src/devtimeWarn.ts, packages/bake/src/discovery.test.ts, packages/bake/src/discovery.ts, packages/bake/src/index.ts, packages/bake/src/node.ts, packages/bake/src/sidecar.test.ts, packages/bake/src/sidecar.ts, packages/bake/src/types.ts, packages/bake/src/writeSidecar.test.ts, packages/bake/src/writeSidecar.ts, packages/bake/tsup.config.ts, packages/nodes/src/lighting/normalFromSprite.ts, packages/normals/README.md, packages/normals/package.json, packages/normals/src/NormalMapLoader.test.ts, packages/normals/src/NormalMapLoader.ts, packages/normals/src/bake.node.ts, packages/normals/src/bake.test.ts, packages/normals/src/bake.ts, packages/normals/src/bakeRegions.test.ts, packages/normals/src/baker.ts, packages/normals/src/cli.test.ts, packages/normals/src/cli.ts, packages/normals/src/descriptor.test.ts, packages/normals/src/descriptor.ts, packages/normals/src/index.ts, packages/normals/src/node.ts, packages/normals/src/resolveNormalMap.ts, packages/normals/tsup.config.ts, packages/three-flatland/src/debug/bus-pool.test.ts, packages/three-flatland/src/loaders/LDtkLoader.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/loaders/TiledLoader.ts, packages/three-flatland/src/loaders/index.ts, packages/three-flatland/src/loaders/normalDescriptor.test.ts, packages/three-flatland/src/loaders/normalDescriptor.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/materials/channels.ts, packages/three-flatland/src/sprites/types.ts, pnpm-lock.yaml, scripts/bake-dungeon-normals.ts, turbo.json
Stats: 52 files changed, 5924 insertions(+), 404 deletions(-)

### c227ab4942cee2a203e734be02c14b5119bdef85
feat: enhance debug protocol with buffer subscription and effect field location
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, packages/devtools/src/buffers-modal.ts, packages/devtools/src/buffers-view.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/devtools-client.ts, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/TileNormalProvider.ts, packages/presets/src/lighting/index.ts, packages/presets/src/react/types.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/bus-pool.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 22 files changed, 673 insertions(+), 221 deletions(-)

### b3b92b6ab25f9814ed566201a1dadcadd7bc0cf0
fix: shadows use post process pipeline + fix sdf bugs
Files: examples/react/lighting/App.tsx, packages/nodes/src/lighting/shadows.test.ts, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/DirectLightEffect.ts, packages/three-flatland/src/debug/bus-pool.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.ts, packages/three-flatland/src/lights/OcclusionPass.test.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 11 files changed, 622 insertions(+), 286 deletions(-)

### 27289de0a21853e34ff2feb7d158eb3e8bad51ea
fix: penumbra math
Files: packages/nodes/src/lighting/shadows.ts
Stats: 1 file changed, 14 insertions(+), 8 deletions(-)

### 452381341aaa449f1eb72834966677dff8573d8e
feat: rebuild on tweakpane + current API (post-rebase)
Post-rebase rebuild of examples/react/lighting against the
post-restructure codebase. The old demo from PR #17 was dropped
during the rebase because its paths (examples/vanilla/lighting,
microfrontends.json) conflicted with the main-side restructure.

What the new example does:
- Dungeon floor via TileMap2D
- Room perimeter + interior walls as castsShadow Sprite2Ds
- 4 wandering knights + 10 green slimes (each a point light)
- 2 fixed flickering torches at sconce positions
- Keyboard-controlled hero knight (WASD / arrows)
- Ambient, DefaultLightEffect
- Tweakpane panel via @three-flatland/tweakpane/react hooks

Every caster correctly uses `castsShadow` (our per-sprite bit) not
`castShadow` (Object3D's unused-by-us built-in three shadow-map flag).

Rebase fix-ups bundled:
- Flatland._validateLightingChannels uses globalThis.process so
  packages without @types/node (mini-breakout) typecheck clean.
- @three-flatland/presets declares @react-three/fiber as optional peer
  dep so the ThreeElements module augmentation resolves.
- @three-flatland/presets package.json gains ./react subpath export.
- Lint cleanup on unused imports in SpriteGroup, systems, traits.
- Hoisted inline import() type annotations to named import type in
  Flatland.ts + LightEffect.ts.

Refs #11 #14 #16.
Files: examples/react/lighting/App.tsx, examples/react/lighting/index.html, examples/react/lighting/main.tsx, examples/react/lighting/package.json, examples/react/lighting/public/sprites/Dungeon_Tileset.png, examples/react/lighting/public/sprites/knight.json, examples/react/lighting/public/sprites/knight.png, examples/react/lighting/tsconfig.json, examples/react/lighting/vite.config.ts, examples/react/pass-effects/App.tsx, packages/nodes/src/lighting/shadows.ts, packages/normals/src/NormalMapLoader.ts, packages/normals/src/baker.ts, packages/presets/package.json, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/systems/effectTraitsSystem.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/materials/MaterialEffect.type-test.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, pnpm-lock.yaml
Stats: 23 files changed, 2554 insertions(+), 674 deletions(-)

### 58f47ca68504ae4b7cd82fc3befff84220ff8cfb
feat: shadowSDF2D — sphere-trace soft shadow through SDF (T6)
TSL helper that walks a line from the shaded fragment toward a light,
sampling an SDF texture at each step to advance by the guaranteed-clear
distance. Produces a [0, 1] shadow value — 0 fully shadowed, 1 fully
lit — with an Inigo-Quilez-style running-min penumbra term for soft
edges.

Signature:
  shadowSDF2D(
    surfaceWorldPos, lightWorldPos, sdfTexture,
    worldSize, worldOffset,
    { steps?, softness?, startOffset?, eps? }
  ): Node<'float'>

Design:
- SDF texture is assumed to come from SDFGenerator — UV-space distance
  on the `.r` channel. Conversion to world-space uses an isotropic
  scene-size approximation `(worldSize.x + worldSize.y) * 0.5`. Slight
  directional error for non-square worlds; flagged as a revisit when a
  consumer needs anisotropic correctness.
- Loop(steps) with Break() on hit or past-light, compile-time unrolled
  for small step counts. 32 steps is the default.
- startOffset skips self-shadow artifacts on the caster sprite.
- Penumbra = min(softness * sdfWorld / t) across the walk, clamped to
  [0, 1]. Higher softness = sharper shadows; 8 soft, 32 sharp.

Ships in @three-flatland/nodes/lighting alongside the existing
shadow2D / shadowSoft2D helpers (which raymarch an occluder alpha
directly — different algorithm, different use case, both supported).
Consumer for T7 replacement of the `shadow = float(1.0)` stub in
DefaultLightEffect / DirectLightEffect arrives next.

3 unit tests cover: default node-graph construction, compile-time
options bag, uniform-node options. No renderer needed — tests check
the node is shaped correctly; behavior will be validated visually in
T8 (examples/react/lighting smoke test).

Refs #11 #14 #16.
Files: packages/nodes/src/lighting/index.ts, packages/nodes/src/lighting/shadows.test.ts, packages/nodes/src/lighting/shadows.ts
Stats: 3 files changed, 173 insertions(+), 2 deletions(-)

### e25fc4ce2d6e35787feb02d04c8b6cbb0e0a98b9
feat: add LightEffect system with traits, registry, and attach helpers for React integration
Files: packages/nodes/src/lighting/lights.ts, packages/nodes/src/lighting/lit.ts, packages/nodes/src/lighting/normalFromHeight.ts, packages/nodes/src/lighting/normalFromSprite.ts, packages/nodes/src/lighting/shadows.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/lights/LightingSystem.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/lights/coordUtils.ts, packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/react/attach.ts, packages/three-flatland/src/react/index.ts, packages/three-flatland/src/react/types.ts
Stats: 17 files changed, 802 insertions(+), 175 deletions(-)

### 0faf84917675275c08ebc3d5cccb4896e11eb65b
feat: 2D lighting system (SDF + Forward+ + Radiance Cascades)
Adds comprehensive 2D lighting pipeline:
- JFA-based SDF generation for shadow occlusion
- Forward+ tiled light culling with SDF occlusion
- Radiance Cascades GI (WIP - not fully functional)
- Lighting strategy pattern (Simple/Direct/Radiance)
- Light2D class with point, directional, ambient, spot types
- TSL lighting shader nodes (lit, shadows, normals)
- Lighting examples (React + Vanilla)
- Planning docs for lighting architecture

Lighting is WIP - algorithms need validation and integration
with Flatland's ECS pipeline is not yet wired up.

Closes #16
Files: docs/src/content/docs/examples/lighting.mdx, docs/src/content/docs/guides/lighting.mdx, microfrontends.json, packages/nodes/package.json, packages/nodes/src/index.ts, packages/nodes/src/lighting/index.ts, packages/nodes/src/lighting/lights.ts, packages/nodes/src/lighting/lit.ts, packages/nodes/src/lighting/normalFromHeight.ts, packages/nodes/src/lighting/normalFromSprite.ts, packages/nodes/src/lighting/shadows.ts, packages/three-flatland/package.json, packages/three-flatland/src/index.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/Light2D.ts, packages/three-flatland/src/lights/LightingStrategy.ts, packages/three-flatland/src/lights/LightingSystem.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/lights/coordUtils.ts, packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/react/lights/index.ts, planning/experiments/Hybrid-SDF-Shadow-System.md, planning/experiments/Radiance-Accumulation.md, planning/experiments/SDF-Tiled-Forward-Plus.md, planning/experiments/Unified-2D-Lighting-Architecture.md
Stats: 26 files changed, 5600 insertions(+), 28 deletions(-)
