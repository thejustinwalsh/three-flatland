# Sprite Sort Regression — Z / Y / zIndex / layer Ordering

## Symptom

User report: *"something broke the Z sorting and my sorted-by-Y demos are
not rendering correctly, recency wins."*

In `knightmark` (and any Y-sort demo that does
`sprite.zIndex = -Math.floor(sprite.position.y)`), sprites render in slot
allocation / insertion order rather than by Z. Whichever sprite was added
most recently to a batch wins overlap — hence "recency wins".

`layer` still visibly groups correctly (different layers produce different
`SpriteBatch` instances with different `renderOrder`), but within a single
layer, the `zIndex` / Y-sort has no visible effect at all.

## Reproduction

1. `pnpm --filter=example-three-knightmark dev`
2. Observe knights stacking — the ones added later always draw on top,
   regardless of Y position. Run long enough and a knight at a low Y
   (should be in front) is occluded by a knight at a higher Y (should be
   behind) simply because the latter was added more recently.

Also affected: `examples/three/tilemap` layered content,
`examples/three/basic-sprite` when stacking sprites with varying zIndex,
any user code relying on per-sprite ordering within a single batch.

## Root Cause

Commit `8bfc4ce refactor!: three-flatland alpha package` replaced the old
`packages/core/src/pipeline/BatchManager.ts` with an ECS-driven pipeline
under `packages/three-flatland/src/ecs/`. The old pipeline had **real
per-sprite sorting** inside `BatchManager`:

```ts
// old packages/core/src/pipeline/BatchManager.ts
entries.sort((a, b) => a.sortKey - b.sortKey)
// sortKey = encodeSortKey(layer, batchId, zIndex)
//        = (layer<<24) | (batchId<<12) | (zIndex)
```

Sprites were sorted globally by `(layer, batchId, zIndex)` and then
**written into batch slots in that order** via `batch.rebuild()`, so the
GPU rendered instances back-to-front by zIndex within a material.

The new ECS pipeline keeps only the **batch-level** (layer, materialId)
ordering:

- `packages/three-flatland/src/ecs/batchUtils.ts::computeRunKey` groups
  batches by `(layer << 16) | materialId`.
- `rebuildBatchOrder` assigns `renderOrder` to each `SpriteBatch`
  (Object3D) in `sortedRunKeys` order.
- Within a single `SpriteBatch`, instance slots are allocated
  **first-come-first-served** by `SpriteBatch.allocateSlot()`
  (`_freeList.pop()` or `_nextIndex++`). There is no re-sort by zIndex,
  ever.

The `updateMatrix` / `transformSyncSystem` path does bake a Z offset into
the instance matrix:

```ts
// packages/three-flatland/src/ecs/systems/transformSyncSystem.ts:75
const pz = sprite.position.z + layer * 10 + zIdx * 0.001
```

…but this only affects clip-space Z, not draw order, and the default
material config makes the depth buffer useless for ordering transparent
sprites:

```ts
// packages/three-flatland/src/materials/Sprite2DMaterial.ts:141-153
this.transparent = options.transparent ?? true   // default true
this.depthTest   = true
// both branches (premultiplied / normal) set:
this.depthWrite  = false
```

With `transparent=true, depthTest=true, depthWrite=false`, every sprite
fragment inside the batch blends over whatever is already there, in slot
order. Newer (higher-slot) instances always win. That is precisely
"recency wins".

### Why `renderOrder` on the batch doesn't save us

`renderOrder` is a Three.js `Object3D`-level sort key. It orders
**draw calls** — i.e. different `SpriteBatch` meshes — not instances
inside one `InstancedMesh`. Three.js has no concept of per-instance
sort order for an `InstancedMesh`. Once all sprites share a `(layer,
materialId)` run (very common: one sprite-sheet per layer), they all
live in one batch and `renderOrder` has zero effect on their mutual
order.

## Impact Surface

- `packages/three-flatland/src/pipeline/SpriteBatch.ts` — slot allocation,
  no sorted write path.
- `packages/three-flatland/src/pipeline/SpriteGroup.ts` — owns the batch
  lifecycle; no per-frame sort step.
- `packages/three-flatland/src/ecs/batchUtils.ts` — run/batch-level sort
  only.
- `packages/three-flatland/src/ecs/systems/transformSyncSystem.ts` — writes
  Z-offset into matrix but nothing consumes it for ordering.
- `packages/three-flatland/src/materials/Sprite2DMaterial.ts` — default
  `depthWrite=false`.
- `packages/three-flatland/src/ecs/traits.ts` — `SpriteZIndex`,
  `SpriteLayer` traits (writes happen, no observer re-sorts).

## Suggested Fixes

Three viable strategies, in increasing invasiveness. All of them must
honor the "no allocations in hot path / use `BatchRegistry.spriteArr` SoA,
no reverse maps" convention from `CLAUDE.md`.

### Option A — Opaque fast-path via `depthWrite=true` + `alphaTest`

Cheapest. For sprites with hard-edged alpha (most pixel art, including
knightmark), flip the default:

```ts
// Sprite2DMaterial.ts
this.transparent = options.transparent ?? false
this.depthWrite  = !this.transparent
this.alphaTest   = options.alphaTest ?? (this.transparent ? 0 : 0.5)
```

With `depthWrite=true` and the existing `pz = layer*10 + zIndex*0.001`
in the instance matrix, the GPU depth test resolves order correctly
regardless of draw order. Works for arbitrary Y-sort.

Trade-offs:
- Breaks smooth alpha (feathered edges become hard cutouts) for any demo
  relying on transparent blending. Knightmark and tilemap pixel art:
  fine. Particle-style sprites: regression.
- Must stay opt-in per material, not a global default change.
- Does not fix **true transparent** content — those still need Option B
  or C.

### Option B — Per-frame slot-remap inside `SpriteBatch`

Add a sort system that produces a slot-order permutation sorted by
`zIndex` (and position.z) once per frame, then when transforming in
`transformSyncSystem`, write entity `i` into slot `sortedIndex[i]`
instead of its stored `BatchSlot.slot`. Only the **instanceMatrix and
per-instance attributes** need re-written in sorted order — topology is
unchanged.

Implementation sketch (zero-alloc hot path):

1. Add a `sortedSlots: Int32Array` per `SpriteBatch`, resized on
   `maxSize` only.
2. New `batchSortSystem(world)` that, for each dirty batch:
   - Iterates entities in that batch (via `InBatch(batchEntity)` or
     `BatchSlot.batchIdx`),
   - Fills a parallel `sortKeys: Float32Array` with
     `position.y + zIndex*1e-3` (or the current `pz`),
   - Runs an in-place radix / insertion sort on `sortedSlots` keyed by
     `sortKeys` (insertion sort is fine — most frames the order is
     nearly sorted).
3. `transformSyncSystem` writes to `slot = sortedSlots[logicalIndex]`
   instead of the raw `slot`, and also re-writes UV/Color/Flip/effect
   bufs from SoA for the sorted slot.

Trade-offs:
- Actually correct for transparent content.
- Adds per-frame work proportional to batch size; insertion sort on
  near-sorted data is ~O(n) in practice.
- Requires **all** per-instance attributes (not just matrix) to be
  re-emitted when order changes, because each logical entity now lives
  in a different physical slot. That means `BatchSlot.slot` is no longer
  a stable write target — or, alternatively, a "logical slot → physical
  slot" indirection table stored on the batch and consulted by every
  write method. Bigger refactor.
- Needs a "sort dirty" flag driven by
  `Changed(SpriteZIndex)`, `Changed(SpriteLayer)`, or a transform
  observer; knightmark mutates `zIndex` every frame for every knight,
  so in that demo the sort runs every frame — acceptable given the old
  pipeline did the same.

### Option C — Split hot Y-sort batches by zIndex bucket

Re-use the existing run/batch grouping: extend the run key to include a
coarse zIndex bucket, so `computeRunKey(layer, materialId, zBucket)`.
Each bucket becomes its own batch with its own `renderOrder`, and
Three.js's `renderOrder` sort handles it. Buckets re-bucketed on zIndex
change.

Trade-offs:
- Zero shader or per-instance sort code — reuses what exists.
- Draw-call count explodes in proportion to bucket count. Y-sort
  over 600 knights at 1-pixel granularity → 600 batches → 600 draw
  calls. Only viable for coarse layering (e.g. ground / mid / foreground
  buckets), which is basically what `layer` already does.
- Not a real Y-sort substitute, just a pragmatic middle ground.

## Recommendation

Ship Option A as a one-line opt-in escape hatch immediately (users with
pixel-art demos can set `transparent: false` on their material and get
correct behavior today), then design Option B properly — probably with
a `sortedSlots` indirection on `SpriteBatch` and a
`batchSortSystem` that only runs for batches whose `SpriteZIndex`
store has changed. Keep SoA, keep `BatchRegistry.spriteArr` as the
single source of truth, no reverse maps.

Option C is a stopgap only; don't invest in it.

## Files To Touch

Short-term (Option A):
- `packages/three-flatland/src/materials/Sprite2DMaterial.ts` — expose
  `depthWrite` option; if `transparent === false`, default `depthWrite`
  to `true` and `alphaTest` to `0.5`.
- `packages/three-flatland/src/materials/Sprite2DMaterial.ts::_getMaterialKey`
  — include `depthWrite`/`alphaTest` in the dedup key.
- Docs: add a `Y-sort` note to sprite docs explaining transparent vs
  opaque trade-off.

Long-term (Option B):
- `packages/three-flatland/src/pipeline/SpriteBatch.ts` — add
  `sortedSlots: Int32Array`, `logicalToPhysical()` helper, rewrite
  `writeColor/UV/Flip/Matrix/EffectSlot` to accept a logical index
  and look up the physical slot.
- `packages/three-flatland/src/ecs/systems/batchSortSystem.ts` — new.
  Driven by a `sortDirty` flag on `RegistryData` plus
  `Changed(SpriteZIndex)` / `Changed(SpriteLayer)` membership.
- `packages/three-flatland/src/ecs/systems/transformSyncSystem.ts` and
  `bufferSyncSystem.ts` — route writes through the indirection.
- `packages/three-flatland/src/ecs/traits.ts` — `BatchSlot.slot` becomes
  a **logical** slot, not a GPU slot.
- Tests under `packages/three-flatland/src/ecs/systems/` —
  `batchSort.test.ts` asserting that a sprite with lower zIndex ends up
  in a lower physical slot after sort, and that a zIndex flip swaps
  which sprite renders on top (can be validated by inspecting
  `instanceMatrix.array` without a renderer).

## Out of Scope / Notes

- Do **not** touch `effectBuf0` packing or flag bit layout — that is
  mid-flight on the `lighting-stochastic-adoption` branch.
- The Z-offset in `Sprite2D.updateMatrix()` and `transformSyncSystem`
  (`layer * 10 + zIndex * 0.001`) should stay — it's still the right
  clip-space Z for any depth-testing consumer and for ray / picking.
  The fix is to make **one of** draw order OR depth writes actually
  respect it.
- Regression test at ECS level is feasible without a renderer: write
  two sprites into one batch with differing zIndex, run the pipeline,
  inspect `SpriteBatch.instanceMatrix.array` and `sortedSlots` to
  confirm the lower-zIndex sprite sits at the lower physical slot.
