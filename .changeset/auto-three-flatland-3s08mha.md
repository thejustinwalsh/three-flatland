---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D Lighting System:**
- `Light2D` class with point, directional, ambient, and spot light types
- `LightEffect` plugin system: `Flatland.setLighting(effect)` activates an effect; `LightStore` manages packed light data uploaded to a DataTexture each frame
- ECS systems for lighting: `lightEffectSystem`, `lightMaterialAssignSystem`, `lightSyncSystem`, `effectTraitsSystem`, `materialVersionSystem`, `lateAssignSystem`, `conditionalTransformSyncSystem`, `flushDirtyRangesSystem`
- `ForwardPlusLighting`: tiled light culling with reservoir-based overflow by importance score — lights in dense clusters degrade gracefully to brightest contributors instead of flickering by scene-graph order
- `needsShadows` flag on `LightEffect` triggers eager `SDFGenerator` allocation before shader build, so TSL `texture()` bindings are stable

**SDF Shadow Pipeline:**
- `SDFGenerator`: JFA-based SDF generation from occluder silhouette render target
- `OcclusionPass`: renders each `SpriteBatch` with a per-texture occlusion material; per-sprite `castsShadow` bit masks non-casters to alpha=0; material cache per atlas texture; zero-alloc scene traverse
- Shadow pipeline moved to `ShadowPipeline` ECS trait + `shadowPipelineSystem`; removed 5 private Flatland fields and an ensure-method
- `LightEffectBuildContext` carries `sdfTexture`, `worldSizeNode`, `worldOffsetNode`; effects bind the SDF at shader-build time, world-bound uniforms updated zero-cost via `.value` mutation each frame

**Sprite & Material System:**
- `castsShadow` per-instance flag on `Sprite2D` (bit 2 of `effectBuf0.x`); opt-in, default off
- `effectBuf0` component split: system flags (lit, receiveShadows, castsShadow) isolated in `.x`; effect enable bits moved to `.y` (24 slots, up from 21)
- `createMaterialEffect` generic over `provides` tuple: `channelNode` return type narrowed at compile time — returning wrong channel type is now a `tsc` error rather than a silent runtime mismatch
- Dev-time warning for lit sprites with unsatisfied channel provider requirements; deduped via `WeakSet`, suppressed in production

**Devtools / Debug Infrastructure:**
- `DevtoolsProvider` (renamed from `DevtoolsProducer`): broadcasts stats, env, registry, and buffer data via `BroadcastChannel`; zero-alloc scratch-object hot path
- `BusTransport` with offload worker: pool-buffer transfer to worker thread eliminates `structuredClone` on the render thread; two-tier pool (4 KB × 8 small, 2 MB × 4 large); `bus-frame.ts` fixed-header zero-alloc frame writer
- Debug pool tier bumped to 2 MB; oversized entries ship metadata-only with a one-shot warn instead of throwing
- `DebugRegistry`: publishes CPU typed arrays (`lightCounts`, `tileScores`, light store data) with per-entry subscribe filtering
- `DebugTextureRegistry`: async GPU readback with `maxDim` downsampling; `Downsampler` TSL blit keeps readback payload small
- Frame-boundary stats via `beginFrame`/`endFrame` on `StatsCollector` — eliminates multi-pass FPS inflation (was ~6× real rate); `scene` arg removed from `DevtoolsProducer`/`StatsCollector` constructors
- Subscribe/ack protocol with multi-provider discovery (`provider:announce/query/gone`), delta-encoded wire format, idle ping for liveness, and `delete`-based field omission (absent = no change)
- `perf-track.ts` User Timing spans for flush CPU and bus-receive latency

**Lighting Example:**
- `examples/react/lighting`: dungeon tilemap floor, perimeter walls as shadow casters, wandering knights + slimes as point lights, flickering torches, WASD hero, Tweakpane debug panel

**Fixes:**
- `Flatland._validateLightingChannels` uses `globalThis.process` for compatibility with packages without `@types/node`
- Lint cleanup: unused imports in `SpriteGroup`, ECS systems, and traits

This release delivers the complete 2D lighting pipeline (Forward+ tiled culling with importance-based overflow, SDF soft shadows, normal-map channels) alongside a zero-alloc devtools bus with offload-worker transport and live GPU buffer inspection.
