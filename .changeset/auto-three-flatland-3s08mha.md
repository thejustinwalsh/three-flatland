---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting pipeline:**
- `Light2D` class: point, directional, ambient, and spot light types
- `LightStore`: typed-array GPU texture backing for packed light data; `LightStore.lightsTexture` registered in debug as `lightStore.lights`
- `ForwardPlusLighting`: tiled light culling; tile overflow now evicts the weakest occupant by importance score (intensity falloff at closest tile AABB point) instead of silently dropping lights in submission order
- `SDFGenerator`: JFA-based SDF from an occlusion render target; eagerly allocates 1×1 placeholder RTs at construction so TSL `texture()` bindings captured at shader-build time remain valid across resize
- `OcclusionPass`: renders the scene to an alpha-channel silhouette RT; per-sprite `castsShadow` masking via instance attribute; per-texture material cache; zero-alloc scene traverse
- `LightEffect`: extensible effect system with `buildLightFn`, `needsShadows`, `LightEffectBuildContext` (`sdfTexture`, `worldSizeNode`, `worldOffsetNode`), and `LightEffectRuntimeContext`
- `Flatland.setLighting(effect)`: wires the full lighting pipeline; eagerly allocates shadow pipeline resources when `needsShadows = true` so the SDF texture reference is stable at shader-build time
- `Flatland.add()` / `setLighting()` emit dev-time warnings for lit sprites missing required channel providers (deduped per sprite via `WeakSet`; suppressed in production)
- World-bound `uniform(Vector2)` nodes for `worldSize` and `worldOffset` created once per `Flatland` instance and mutated each frame — no shader rebuild on camera movement

**ECS additions:**
- `ShadowPipeline` singleton ECS trait + `shadowPipelineSystem` owning full lifecycle (allocate, init, resize, run pre-pass, dispose)
- `LightingContext` trait carries `scene`, `renderer`, and `camera` for per-frame system access
- New ECS systems: `lightEffectSystem`, `lightSyncSystem`, `lightMaterialAssignSystem`, `effectTraitsSystem`, `shadowPipelineSystem`
- `SystemSchedule` with explicit phase ordering
- Batch utilities: `lateAssignSystem`, `conditionalTransformSyncSystem`, `flushDirtyRangesSystem`

**Per-sprite flags and attribute layout:**
- `Sprite2D.castsShadow`: per-instance shadow-caster flag (bit 2 of `effectBuf0.x`); default `false`, opt-in
- `effectBuf0.x` reserved exclusively for system flags (lit, receiveShadows, castsShadow); `effectBuf0.y` now holds MaterialEffect enable bits — recovers 3 previously mixed slots, giving 24 dedicated MaterialEffect enable slots
- `readCastShadowFlag()` TSL helper added to `wrapWithLightFlags`

**MaterialEffect type safety:**
- `createMaterialEffect` is now generic over the declared `provides` tuple; `channelNode` return type is constrained to the declared `ChannelNodeMap` shape — returning the wrong node type fails `tsc` at the call site rather than silently compiling to a broken shader

**React helpers:**
- `attach` helpers for composing `LightEffect` and `Light2D` as R3F JSX children
- `createDevtoolsProvider(opts?)` exported from `three-flatland` for vanilla Three.js apps that do not construct a `Flatland`; returns a no-op stub in non-devtools builds (tree-shaken by Terser)

**Devtools producer:**
- `DevtoolsProvider` (renamed from `DevtoolsProducer`): multi-provider discovery protocol (`provider:announce` / `provider:query` / `provider:gone`); `kind: 'system' | 'user'` gated behind package-internal factory
- `BusTransport`: off-thread worker pool for BroadcastChannel hot path; `BufferCursor` + `copyTypedTo` zero-alloc encoding; render thread transfers pool buffers to worker via `postMessage` transfer
- `DebugRegistry` / `DebugTextureRegistry`: module-level sinks for CPU arrays and GPU textures; no-op when `DEVTOOLS_BUNDLED` is false
- `DebugTextureRegistry` per-entry `maxDim` cap with TSL `Downsampler` blit — avoids multi-MB readbacks for large render targets
- `POOL.large.size` raised to 2 MB; fail-soft on oversized entries to prevent flush failures at 1080p

**Bug fixes:**
- `Flatland._validateLightingChannels` uses `globalThis.process` — no `@types/node` dependency required in consumer packages
- Debug wire protocol: absent delta fields omitted via `delete` instead of `undefined` assignment, preventing unexpected keys in consumer state

This release delivers the complete end-to-end 2D lighting pipeline — SDF generation, Forward+ tiled culling, per-sprite shadow casting, LightEffect build context with live SDF shadows — along with ECS-native shadow pipeline ownership and a production-ready devtools producer.
