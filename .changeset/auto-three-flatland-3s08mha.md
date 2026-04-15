---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## 2D lighting system

- New `Light2D` class with point, directional, ambient, and spot light types
- `Flatland.setLighting(effect)` attaches a `LightEffect` strategy; switching effects disposes old GPU resources cleanly
- `LightEffect` system with ECS traits, `LightStore`, `ForwardPlusLighting` tiled culling, `SDFGenerator`, and `LightingSystem`
- `LightEffectBuildContext` carries `sdfTexture`, `worldSizeNode`, and `worldOffsetNode` so TSL bindings are stable across resizes
- `Flatland` owns a pair of `uniform(Vector2)` nodes for world bounds; updated each frame from camera bounds — no shader rebuild on camera movement
- Dev-time warning emitted when a lit sprite is missing a required channel provider (e.g., `normal`); suppressed in `NODE_ENV=production`

## SDF soft shadows

- `SDFGenerator`: JFA-based SDF built from the OcclusionPass RT; `sdfTexture` reference stable from construction
- `OcclusionPass`: renders scene silhouette into a resolution-scaled RT; per-texture occlusion material caches per atlas; swap/restore is zero-alloc past warmup
- Shadow pipeline state moved to `ShadowPipeline` ECS trait + `shadowPipelineSystem`; removed six private fields from `Flatland`
- `Flatland.setLighting` eagerly allocates `SDFGenerator` + `OcclusionPass` when effect declares `needsShadows = true`; system is idempotent on first tick

## Per-sprite shadow casting

- `Sprite2D.castsShadow` — per-instance opt-in for shadow casting (default `false`)
- `effectBuf0.x` holds system flags (lit, receiveShadows, castsShadow); `effectBuf0.y` holds 24 user MaterialEffect enable bits — the two fields are now separate, recovering the mixed capacity they previously shared

## Forward+ improvements

- Reservoir-based tile overflow: when a tile exceeds 16 lights, the weakest occupant is evicted by importance score (intensity × falloff to tile AABB closest point) — fixes tile-edge flicker in dense scenes vs. the previous silent-drop behaviour

## MaterialEffect type safety

- `createMaterialEffect` is now generic over the `provides` tuple; the `channelNode` callback return type is enforced at compile time — returning the wrong node type for a declared channel fails `tsc` with TS2322 at the factory call site
- Omitting `provides` but supplying a `channelNode` is a compile-time error (`channelNode: never`)

## Devtools bus producer (Phase A → C)

- `DevtoolsProvider`: BroadcastChannel producer, zero-cost in prod (tree-shaken when `DEVTOOLS_BUNDLED = false`)
- Stats broadcast via `beginFrame` / `endFrame` boundaries — accurate per-logical-frame totals across multi-pass renders (SDF, occlusion, main, post)
- `DebugRegistry`: engine code publishes CPU typed arrays via `registerDebugArray` / `touchDebugArray`; `ForwardPlusLighting` publishes `lightCounts` + `tileScores`; `LightStore` publishes its DataTexture backing
- `DebugTextureRegistry`: `DataTexture` paths copy CPU buffer; `RenderTarget` paths use `renderer.readRenderTargetPixelsAsync`, one in-flight per entry
- Multi-provider discovery protocol: `provider:announce`, `provider:query`, `provider:gone`; consumers auto-switch on provider loss
- `FlatlandOptions.name?: string` to distinguish multiple instances in the devtools UI
- Debug bus protocol: subscribe/ack, delta-encoded data packets (absent = no change, null = clear), idle ping after `IDLE_PING_MS` of silence, zero-alloc hot path via scratch objects

## Removed

- `Flatland.stats` getter removed; use `spriteGroup.stats` for sprite-domain metrics (spriteCount, batchCount, visibleSprites)

This release delivers a complete 2D lighting pipeline — SDF soft shadows, Forward+ tiled culling with importance-based overflow, per-sprite `castsShadow`, type-safe MaterialEffect channels, and a full devtools bus for live engine inspection.
