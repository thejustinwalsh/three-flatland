---
"three-flatland": minor
---

> Branch: fix-sprite-sort-regression
> PR: https://github.com/thejustinwalsh/three-flatland/pull/28

## Sprite sorting, alpha test fast path, and interleaved buffer layout

### Sprite z-sorting

- Added `batchSortSystem` — re-sorts batch instance slots by `zIndex` each frame, gated on `Changed(SpriteZIndex)` so only affected batches are touched
- `SpriteBatch.swapSlots(a, b)` permutes all GPU rows (matrix, UV, color, system, effect buffers) in lockstep; free list and physical slot assignments stay valid
- `Sprite2D.zIndex` setter propagates writes to Koota's ECS tracker so the sort system fires correctly; `batchAssignSystem` triggers an initial sort on first assignment
- All sort scratch buffers are module-scope and reused frame-to-frame (zero per-frame allocation)

### Alpha test fast path (`alphaTest` option)

- `Sprite2DMaterialOptions.alphaTest` is now wired end-to-end: when `> 0`, the material sets `transparent=false` + `depthWrite=true` and the shader discards fragments where `finalAlpha < alphaTest`
- `batchSortSystem` skips re-sorting any batch whose material has `alphaTest > 0 && depthWrite` — the GPU depth test handles ordering for free via the `pz` value baked into instance matrices by `transformSyncSystem`
- `Sprite2D.zIndex` setter short-circuits the ECS write when the gate applies, eliminating unnecessary Changed-tracker churn
- `Sprite2DMaterial.getShared()` cache key now includes `alphaTest` so different cutoff values get distinct shared instances

### Alpha discard fix

- Fixed: the default 0.01 discard cutoff now tests `texColor.a` only (texture transparency), not `texColor.a * instanceColor.a`; sprites faded via `instanceColor.a` no longer have their edges hardened mid-fade
- `alphaTest` opt-in cutoff still tests combined `finalAlpha` (intentional — user-requested threshold applies post-fade)

### Sort performance

- `batchSortSystem` swap pass: replaced O(n²) linear search with an inverse `slotToScratchIdx` Int32Array updated in lockstep — O(n) per batch
- Sort pass: replaced hand-rolled insertion sort (O(n²) cold start) with `Array.prototype.sort` (V8 TimSort — O(n) near-sorted, O(n log n) worst case); eliminated a 400M-comparison cliff at 20k sprites
- Knightmark @ 10k sprites: 30fps (22ms sort cost) → 60fps+ (near-zero sort cost)

### Interleaved core buffer layout

- `SpriteBatch` consolidates `instanceUV`, `instanceColor`, and `instanceFlip` into one `InstancedInterleavedBuffer` (stride 16, four `InterleavedBufferAttribute` views: `instanceUV` at offset 0, `instanceColor` at 4, `instanceSystem` at 8, `instanceExtras` at 12)
- Vertex buffer slot count drops from `3+1+3+N` to `3+1+1+N`, freeing two slots under WebGPU's `maxVertexBuffers=8` cap and unblocking materials with more effect data
- New `SpriteBatch` methods: `writeEnableBits`, `writeSystemFlags`, `writeShadowRadius`; `swapSlots` / `freeSlot` / `flushDirtyRanges` updated for the consolidated buffer
- `BucketedDirtyTracker` accepts either `InstancedBufferAttribute` or `InstancedInterleavedBuffer` via a structural `UploadTarget` type
- `EffectMaterial`: effect-slot allocator starts at offset 0 (flags moved to `instanceSystem.w`); `MAX_EFFECT_FLOATS = 12` cap enforced with a clear error at `registerEffect` instead of a cryptic WebGPU pipeline rejection
- `TileLayer`: `instanceFlip` (vec2) replaced with `instanceSystem` (vec4) to match the shared shader; `Sprite2DMaterial` shader reads flip from `instanceSystem.xy`
- `bufferSyncSystem.ts` removed — all buffer writes are now direct; per-frame ECS system loop loses one pass
- Knightmark with effects enabled: ~27k sprites at 60fps (matching the no-effects baseline)

Fixes the sprite z-sort regression, introduces an `alphaTest` fast path that lets the GPU depth buffer handle sprite ordering for opaque pixel-art sprites, and consolidates per-instance GPU buffers into an interleaved layout that frees vertex buffer slots for future lighting and effect data.
