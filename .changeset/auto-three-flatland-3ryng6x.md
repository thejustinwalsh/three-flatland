---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting system**
- `Light2D` class: point, directional, ambient, spot types; `importance`, `castsShadow`, `category`, `radius` fields; exported from `three-flatland`
- `LightEffect` + `setLighting()` API: attach custom per-effect TSL shader pipelines to the ECS; `needsShadows` class flag triggers shadow pipeline allocation
- `LightEffectBuildContext`: carries `sdfTexture`, `worldSizeNode`, `worldOffsetNode`, `lightStore` at shader-build time; world uniform nodes owned by `Flatland`, updated each frame with zero rebuild
- `MaterialEffect` + `createMaterialEffect()`: per-instance effect enable bits in `effectBuf0.y` (24 slots); system flags (`lit`, `receiveShadows`, `castsShadow`) in `effectBuf0.x`; `channelNode` return type narrowed to declared `provides` tuple — type error instead of silent runtime shader mix-up; `EffectMaterial.MAX_EFFECT_FLOATS = 12`
- Per-sprite `castsShadow` flag (bit 2 of `effectBuf0.x`): opt-in; zero-rebuild setter; propagated through `bufferSyncSystem`/`batchAssignSystem`
- Dev-time warning when a lit sprite is added without a provider satisfying the active `LightEffect`'s `requires` channels; WeakSet-deduped; no-op in production
- `forceRuntime` option unifies `skipBakedProbe`/`disableRuntimeBake` across `LDtkLoader`, `SpriteSheetLoader`, and `TiledLoader`
- `NormalSourceDescriptor` / `normalDescriptor.ts` loader: per-region normal bake targets; consumed by bake CLI and runtime loaders

**Shadow pipeline**
- `OcclusionPass`: scene-space silhouette RT at 0.5× viewport; per-texture cached TSL materials; reads `castsShadow` per instance so non-casters emit `alpha=0`; zero-alloc traverse
- `SDFGenerator` (JFA): signed dual-JFA packed into single ping-pong chain (RGBA: RG=outside seed, BA=inside seed) — same cost as unsigned SDF (2 RTs, 11 JFA passes) with signed distance output
- `ShadowPipeline` ECS singleton trait + `shadowPipelineSystem`: owns full shadow lifecycle (allocate, init, resize, run pre-pass, dispose); eagerly allocated before `buildLightFn` so `sdfTexture` reference is stable; runs after `transformSystem` (fixes one-frame lag)
- Occluder-dirty gate: `shadowPipelineSystem` skips JFA regeneration when no occluder has changed — shadow cost on static scenes ≈ zero
- `sdfTexture` removed from `LightingContext`; `lightEffectSystem` queries `ShadowPipeline` trait directly each frame — eliminates dual-ownership footgun
- `sdf.distanceField` (rgba16f signed) and `occlusion.mask` (rgba8 mono) registered as debug textures; visible in fullscreen buffer modal

**Forward+ tiled culling**
- `TILE_SIZE` changed from 16 → 32: 4× fewer CPU tile rows, 4× cheaper cull loop; GPU shader tile coverage unchanged
- Reservoir-based tile overflow by importance: evicts the weakest occupant (by intensity × falloff score against tile AABB) rather than silently dropping; directional lights take full score; ambient lights excluded from tiles; no shader change
- Per-tile score array adds 1 KB/tile — negligible vs existing tile `DataTexture`
- CPU/shader tile bound alignment fix: previously a half-tile gap left the last column/row unlit

**Per-sprite shadow radius**
- `shadowExtras` interleaved buffer field (offset 12, `float shadowRadius, reserved×3`): auto-derived from `max(|scale.x|, |scale.y|)`, overridable per sprite
- Replaces scene-wide `shadowStartOffset` uniform; self-shadow escape offset now proportional to each sprite's footprint

**Interleaved instance buffer**
- Core per-instance data packed into 64-byte interleaved buffer: `instanceUV` (offset 0), `instanceColor` (offset 4), `instanceSystem` (offset 8: flipX, flipY, sysFlags, enableBits), `instanceExtras` (offset 12: shadowRadius, reserved×3)
- Freed 3 WebGPU vertex buffer bindings (was at the 8-buffer cap); `instanceAttributes.ts` centralizes TSL per-instance attribute helpers: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readCastShadowFlag()`

**Devtools subsystem**
- Full debug bus: `BroadcastChannel` protocol with subscribe/ack, delta-encoded data packets, idle ping, multi-provider discovery (`provider:announce`/`query`/`gone`)
- `DevtoolsProvider`: pure constructor (side-effect-free); explicit `start()`/`dispose()`; lazy-started on first `Flatland.render()`; `FlatlandOptions.name` distinguishes multiple instances
- Devtools dead-stripped from production: `process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true'` inline gate + dynamic `import()` behind fence; `three-flatland` full bundle: 45.4 KB → 36.3 KB
- `process.env` typed with module-local `declare const` — no `@types/node` needed in browser apps
- `createDevtoolsProvider(opts?)` helper: returns real `DevtoolsProvider` when active, no-op stub in prod (tree-shaken by bundler); for vanilla apps that don't use `Flatland`
- Off-render-thread bus: `BusTransport` worker with tiered buffer pool (small 4 KB × 8, large 2 MB × 4); `BufferCursor`/`copyTypedTo` zero-alloc flush path; inline fallback for no-worker environments
- `DebugTextureRegistry`: GPU `RenderTarget` readback via `readRenderTargetPixelsAsync`; `maxDim` cap downsamples via TSL blit before readback (SDF 1920×1080 → 256×144); handles 1×1 start size, version-bumps on resize, defers registrations before provider `start()`
- `readRenderTargetPixelsAsync` signature fix: three.js r183 returns `Promise<TypedArray>` (no buffer param); readback skipped for 1×1 targets
- `StatsCollector`: frame-boundary `beginFrame`/`endFrame` API fixes multi-pass over-counting (was reporting ~6× real FPS); draw-call delta computed from `info.render.calls` snapshots
- `Flatland._debug` renamed to `_devtools` throughout; `Flatland.stats` getter removed from production path

**ECS / systems**
- `SystemSchedule` perf instrumentation: `perfMeasure`/`perfStart` emit User Timing spans on Chrome custom tracks (`trackGroup: 'three-flatland'`, tracks: `devtools`, `lighting`, `sprites`, `sdf`)
- `lightEffectSystem`, `lightSyncSystem`, `lightMaterialAssignSystem`, `shadowPipelineSystem`, `effectTraitsSystem` added to ECS schedule
- `Sprite2D` observable refactor: `color`/`vector2` shared strategies for observable properties

**Other fixes**
- `bus-worker` URL uses extensionless path (`./bus-worker` not `./bus-worker.ts`) for source/dist compatibility
- Texture readback moved to end-of-frame (after all render passes); eliminates blocky strips in SDF debug visualization
- Channel validation drain exposed as `_flushPendingChannelValidation()` for headless tests

**BREAKING CHANGES**
- `skipBakedProbe` / `disableRuntimeBake` options removed from all loaders; use `forceRuntime: true`
- `Flatland.stats` getter removed; read from `spriteGroup.stats` directly
- `DEVTOOLS_BUNDLED` re-export removed; use `isDevtoolsActive()` or inline `process.env` gate
- `effectBuf0.y` repurposed for effect enable bits (was zero-padding); third-party code that read `effectBuf0.y` directly will see enable bits instead of zero

This release ships a complete production-ready 2D lighting pipeline — JFA signed SDF shadows, Forward+ tiled culling with importance-based overflow, per-sprite `castsShadow`, and a zero-overhead devtools bus — integrated end-to-end with the Flatland ECS.
