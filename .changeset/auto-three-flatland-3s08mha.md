---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting pipeline**

- New `Light2D` class supporting point, directional, ambient, and spot light types
- `LightStore` — flat typed-array store for GPU light data, keyed by `Light2D` instance
- `LightingSystem` — strategy-pattern dispatcher: Simple, Direct (Forward+), Radiance Cascades
- `ForwardPlusLighting` — tiled Forward+ culling with reservoir-based tile overflow: lights past the 16-slot per-tile cap are now ranked by contribution score (intensity × falloff at closest AABB point), evicting the weakest occupant rather than silently dropping by submission order
- `SDFGenerator` — JFA-based signed-distance-field generator seeded from the OcclusionPass render target; stable texture reference across resize so TSL bindings built at shader-compile time remain valid
- `OcclusionPass` — offscreen render pass that outputs per-sprite alpha silhouettes for SDF seeding; per-instance `castsShadow` filtering so non-casters contribute `alpha = 0` without a separate draw

**Per-sprite shadow casting**

- `Sprite2D.castsShadow` setter (default `false`): opt-in per sprite, zero GPU overhead for non-casters
- Instance flag stored in bit 2 of `effectBuf0.x`; propagates through batch attribute buffers with no material rebuild
- `readCastShadowFlag()` TSL helper mirrors `readReceiveShadowsFlag()` for shader consumption

**effectBuf0 layout change**

- `effectBuf0.x` now holds system flags only (lit, receiveShadows, castsShadow — 3 of 24 bits)
- `effectBuf0.y` holds MaterialEffect enable bits (24 slots, up from 21)
- Effect field data starts at slot 2 (`effectBuf0.z`); `EFFECT_BIT_OFFSET` reset to 0

**LightEffect system**

- `LightEffect` base class + `LightEffectBuildContext` passed to `buildLightFn` at shader-compile time carrying `lightStore`, `sdfTexture`, `worldSizeNode`, `worldOffsetNode`
- `LightEffectRuntimeContext` carried per-frame: `renderer`, `camera`, `scene`, `sdfGenerator`
- `ShadowPipeline` ECS singleton trait owns `sdfGenerator` / `occlusionPass` / resize state; `shadowPipelineSystem` manages full lifecycle (allocate → init → resize → pre-pass → dispose)
- `Flatland.setLighting(effect)` eagerly allocates `ShadowPipeline` when `effect.needsShadows` is true, before `buildLightFn` runs, so the SDF texture reference is captured at shader-build time
- World-bound `uniform(Vector2)` nodes for size and offset owned by `Flatland`, mutated cheaply each frame from camera bounds — no shader rebuild on camera move
- React attach helpers: `useAttach` / `attach` for declarative `<lightEffect>` JSX wiring

**Developer experience**

- Dev-time warning when a lit sprite is missing a `MaterialEffect` that provides channels declared `requires` by the active `LightEffect`; deduped via `WeakSet`, suppressed under `NODE_ENV=production`
- `createMaterialEffect` is now generic over the `provides` tuple: returning the wrong `Node` type for a declared channel is a `tsc` error at the factory call site
- `LightingContext` no longer mirrors `sdfGenerator` — sole owner is `ShadowPipeline`; eliminates a class of silent-desync regression

**Lighting example**

- `examples/react/lighting` rebuilt with Tweakpane controls, dungeon tilemap, wandering knights + slimes as point lights, flickering torches, keyboard-controlled hero, `DefaultLightEffect` with SDF shadows

This release delivers a complete end-to-end 2D lighting pipeline: ECS-integrated lights, JFA SDF shadow generation, per-sprite caster control, and type-safe effect authoring.
