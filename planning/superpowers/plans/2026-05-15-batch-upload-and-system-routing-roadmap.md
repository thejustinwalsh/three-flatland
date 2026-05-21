# Sprite Batch Performance & ECS System Routing

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scale the sprite render pipeline from ~28k sprites at 60fps (knightmark with alphaTest, current) to ≥60k sprites at 60fps across mixed workloads (sorted/unsorted batches, moving/static sprites), without bypassing Koota's bookkeeping or introducing fragile coordination paths.

**Working branch:** `fix-sprite-sort-regression` (PR #28, rebased onto current main).

---

## Scope

Four orthogonal axes of batch behavior:

|                    | Moving sprites           | Static sprites             |
|--------------------|---------------------------|----------------------------|
| **Sorted batch**   | y-sort top-down, batch-demo placement | UI panels with alpha       |
| **AlphaTest batch**| knightmark (GPU depth)    | tilemaps, large static fields |

These four cells share data layout (SoA traits, instanced GPU buffers) but want different update strategies. The plan covers the data structure (bucketed dirty tracking), the ECS routing (which systems touch which batches), and the decision metric (computed inline during writes — no extra walks, no allocations).

---

## Architecture decisions (baked in before phase 1)

1. **One dirty-tracker class** (`BucketedDirtyTracker`) for all per-instance attributes. Per-attribute thresholds tune the range-vs-full upload decision. Strictly dominates the current single-min/max approach.
2. **Direct-write setters** for setter-driven attrs (UV via `setFrame`, color, flip, alpha). Sprite caches `_batchMesh` + `_batchSlot` + `_batchIdx` at assign time → O(1) write dispatch. No Koota Changed roundtrip on hot paths.
3. **Registry-side `dirtyBatchSet: Set<number>`** populated by zIndex setter and batchAssignSystem. Replaces `Changed(SpriteZIndex)` query.
4. **Material gate** (`alphaTest > 0 && depthWrite`) keeps non-sorting batches out of batchSortSystem entirely — already shipped in this branch.
5. **Koota Changed stays** for rare-event paths only: `batchReassignSystem` (layer / material changes), `batchAssignSystem` (Added). These fire 0–few times per frame; gate-and-skip math wins.

---

## Measurement

Use existing `measure()` telemetry — already wired in `SpriteGroup._runSystems` and surfaced via `@three-flatland/tweakpane` stats panel.

Per phase, record at: **1k, 5k, 10k, 20k, 30k, 50k** sprites. Two scenes:

- **knightmark** (movement-heavy, alphaTest path): every sprite zIndex flips every frame.
- **batch-demo** (placement-heavy, sort path): adds + removes via click, then steady-state.

For each scene + count, record:

| System | Target |
|---|---|
| `batchAssignSystem` | < 0.1 ms steady-state |
| `batchSortSystem` | < 0.5 ms at 50k |
| `transformSyncSystem` | < 5 ms at 50k |
| `bufferSync*` | gone (Phase 3+) |
| `_flushDirtyRanges` | < 1 ms at 50k |

---

## Phases

| Phase | Status | Win |
|---|---|---|
| 0 — Baseline + harness | ⬜ | calibration |
| 1 — `BucketedDirtyTracker` | ⬜ | tight uploads on pre-allocated batches |
| 2 — Sprite2D batch cache | ⬜ | plumbing for direct writes |
| 3 — Direct-write setters (UV / color / flip / alpha) | ⬜ | drops bufferSync systems |
| 4 — `dirtyBatchSet` replaces `Changed(SpriteZIndex)` | ⬜ | drops Koota Changed from hot path |
| 5 — Threshold calibration | ⬜ | tune per-attribute |
| 6 (stretch) — Per-batch system routing via ECS | ⬜ | static batches skip transform sync |

---

## Phase 0 — Baseline + measurement harness

Bake current numbers into the plan as a reference. No code changes.

- [ ] **0.1** Run knightmark with alphaTest at 1k / 5k / 10k / 20k / 30k / 50k. Record per-system ms from the stats panel. Append to a `## Baseline` section at the bottom of this doc.
- [ ] **0.2** Same for batch-demo (no alphaTest, sort path).
- [ ] **0.3** Verify `measure()` covers `batchAssignSystem`, `batchSortSystem`, `transformSyncSystem`, `bufferSyncColorSystem`, `bufferSyncFlipSystem`, `bufferSyncEffectSystem`, `_flushDirtyRanges`. Add any missing wrappers.

**Human gate:** confirm the baseline matches your perception of where bottlenecks live. If the numbers contradict the architecture decisions above, revisit before Phase 1.

---

## Phase 1 — `BucketedDirtyTracker`

Drop-in replacement for per-attribute `_dirtyMin`/`_dirtyMax` on `SpriteBatch`. Same external API (`writeUV(slot, ...)` etc.); the tracker handles dirty bookkeeping and flush strategy internally.

**Files:**
- New: `packages/three-flatland/src/pipeline/BucketedDirtyTracker.ts`
- Modify: `packages/three-flatland/src/pipeline/SpriteBatch.ts`

**Shape:**

```ts
// BucketedDirtyTracker.ts
export class BucketedDirtyTracker {
  private bucketState: Int32Array     // -1 = clean; else = first dirty slot in bucket
  private bucketLastSlot: Int32Array  // last dirty slot in bucket
  private bucketDirtyCount = 0
  private readonly bucketShift: number  // log2(bucketSize)
  private readonly bucketCount: number
  private readonly stride: number       // floats per slot

  constructor(
    private readonly attr: InstancedBufferAttribute,
    maxSize: number,
    bucketSize: number,
    stride: number,
    private readonly fullThreshold: number,
  ) {
    this.bucketShift = Math.log2(bucketSize)
    this.bucketCount = Math.ceil(maxSize / bucketSize)
    this.bucketState = new Int32Array(this.bucketCount).fill(-1)
    this.bucketLastSlot = new Int32Array(this.bucketCount)
    this.stride = stride
  }

  markDirty(slot: number): void {
    const b = slot >>> this.bucketShift
    if (this.bucketState[b] === -1) {
      this.bucketState[b] = slot
      this.bucketDirtyCount++
    } else if (slot < this.bucketState[b]!) {
      this.bucketState[b] = slot
    }
    if (slot > this.bucketLastSlot[b]!) this.bucketLastSlot[b] = slot
  }

  flush(): void {
    if (this.bucketDirtyCount === 0) return
    this.attr.clearUpdateRanges()
    if (this.bucketDirtyCount >= this.fullThreshold) {
      // Full-buffer upload — three takes the bufferData fast path.
      this.attr.needsUpdate = true
    } else {
      const stride = this.stride
      for (let b = 0; b < this.bucketCount; b++) {
        const first = this.bucketState[b]!
        if (first === -1) continue
        const last = this.bucketLastSlot[b]!
        this.attr.addUpdateRange(first * stride, (last - first + 1) * stride)
        this.bucketState[b] = -1
      }
      this.attr.needsUpdate = true
    }
    this.bucketDirtyCount = 0
  }
}
```

**SpriteBatch integration:**

```ts
// Replace _matrixDirtyMin / _matrixDirtyMax + _uvDirtyMin / _uvDirtyMax / etc.
private matrixTracker: BucketedDirtyTracker  // stride 16, threshold 30
private uvTracker:     BucketedDirtyTracker  // stride 4,  threshold 30
private colorTracker:  BucketedDirtyTracker  // stride 4,  threshold 10
private flipTracker:   BucketedDirtyTracker  // stride 2,  threshold 10
// (custom attrs get their own trackers in the constructor's schema loop)

// In writeUV / writeColor / etc., replace dirtyMin/Max bookkeeping with:
this.uvTracker.markDirty(slot)

// flushDirtyRanges becomes:
flushDirtyRanges(): void {
  this.matrixTracker.flush()
  this.uvTracker.flush()
  this.colorTracker.flush()
  this.flipTracker.flush()
  for (const [, custom] of this._customAttributes) custom.tracker.flush()
}
```

**Bucket sizes**: default 256 across attributes. Power-of-2 so `>>> shift` works.

**Tasks:**
- [ ] **1.1** Implement `BucketedDirtyTracker` with the API above + unit tests covering: empty flush, single-bucket dirty, all-buckets dirty (full upload), scattered ranges across buckets.
- [ ] **1.2** Migrate `SpriteBatch` to use one `BucketedDirtyTracker` per attribute. Replace every `_xDirtyMin` / `_xDirtyMax` site. `swapSlots` calls `markDirty(a)` and `markDirty(b)` per attribute.
- [ ] **1.3** Run `pnpm test` — every existing batch test must still pass.
- [ ] **1.4** Repeat Phase 0 measurement set. Compare.

**Expected outcome:** at full-dirty extreme, neutral perf (threshold trips → full upload, same as today). At pre-allocated-batch-with-rolling-churn, measurable reduction in upload bytes.

**Alternative if Phase 1 regresses anything:**
- The bucket walk in `flush` is the only added work in the worst case. If it shows in a profile, raise default `fullThreshold` to ~5 so we fall into full-upload sooner; only attrs with very sparse writes benefit from bucketed.
- If `Int32Array` allocation per batch is a startup cost concern, pool trackers across batches in `BatchRegistry`.

**Human gate:** review the before/after numbers. Don't proceed if any per-system measurement regresses by >10% in any scenario.

---

## Phase 2 — Sprite2D batch cache

Plumbing only. Three new private fields on `Sprite2D`:

```ts
class Sprite2D extends Mesh {
  /** @internal */ _batchMesh: SpriteBatch | null = null
  /** @internal */ _batchSlot: number = -1
  /** @internal */ _batchIdx: number = -1
}
```

**Files:**
- Modify: `packages/three-flatland/src/sprites/Sprite2D.ts` (declare fields)
- Modify: `packages/three-flatland/src/ecs/systems/batchAssignSystem.ts` (populate after slot alloc)
- Modify: `packages/three-flatland/src/ecs/systems/batchReassignSystem.ts` (update on cross-batch move)
- Modify: `packages/three-flatland/src/ecs/systems/batchRemoveSystem.ts` (clear on remove)

**Setter to populate (in batchAssignSystem after `mesh.allocateSlot()`):**

```ts
sprite._batchMesh = mesh
sprite._batchSlot = slot
sprite._batchIdx = batchIdx
```

**Clear (in batchRemoveSystem after slot free):**

```ts
sprite._batchMesh = null
sprite._batchSlot = -1
sprite._batchIdx = -1
```

**Tasks:**
- [ ] **2.1** Add fields, populate at assign, clear at remove, update at reassign.
- [ ] **2.2** Add invariant test: post-assign, `sprite._batchMesh.allocateSlot()`'s returned slot matches `sprite._batchSlot`. Post-remove, all three fields are reset.
- [ ] **2.3** Re-run perf — should be neutral (no hot-path change yet).

**Human gate:** quick sanity check — `_batchMesh` is non-null exactly when sprite is enrolled in a batch. Spot-check via debugger.

---

## Phase 3 — Direct-write setters

Skip the Koota Changed roundtrip for UV / color / flip / alpha. Setters write directly to the cached batch mesh.

**Files:**
- Modify: `packages/three-flatland/src/sprites/Sprite2D.ts` (setters)
- Modify: `packages/three-flatland/src/pipeline/SpriteGroup.ts` (drop deleted systems from `_runSystems`)
- Delete: the body of `bufferSyncColorSystem`, `bufferSyncFlipSystem` (keep exports as no-op for one release, then drop entirely)
- Modify: `packages/three-flatland/src/ecs/systems/transformSyncSystem.ts` (drop UV write)

**Pattern (color):**

```ts
set tint(value: Color | string | number | [number, number, number]) {
  // ... existing color parsing into _tintColor ...
  const i = this._idx
  this._colorR[i] = this._tintColor.r
  this._colorG[i] = this._tintColor.g
  this._colorB[i] = this._tintColor.b
  if (this._batchMesh) {
    this._batchMesh.writeColor(this._batchSlot, this._tintColor.r, this._tintColor.g, this._tintColor.b, this._colorA[i]!)
  } else {
    this._updateOwnColor()
  }
}
```

**Pattern (setFrame):**

```ts
setFrame(frame: SpriteFrame): this {
  this._frame = frame
  const i = this._idx
  this._uvX[i] = frame.x; this._uvY[i] = frame.y
  this._uvW[i] = frame.width; this._uvH[i] = frame.height
  if (this._batchMesh) {
    this._batchMesh.writeUV(this._batchSlot, frame.x, frame.y, frame.width, frame.height)
  } else {
    this._updateOwnUV()
  }
  this.visible = true
  // ... rest as before (first-frame size adjustment) ...
  return this
}
```

**transformSyncSystem becomes matrix-only:**

```ts
// Drop these lines from the loop:
//   mesh.writeUV(slot, uvXArr[eid]!, uvYArr[eid]!, uvWArr[eid]!, uvHArr[eid]!)
// (and remove uvStore lookups at the top)
```

**Drop from `_runSystems`:**

```ts
// REMOVE these — setters handle directly now:
// bufferSyncColorSystem(this._world)
// bufferSyncFlipSystem(this._world)
```

Keep `bufferSyncEffectSystem` for now — effect param changes are more rare and the per-field plumbing is complex. Revisit in a follow-up.

**Tasks:**
- [ ] **3.1** Migrate `setFrame` (UV).
- [ ] **3.2** Migrate `tint` / `alpha` (color).
- [ ] **3.3** Migrate `flipX` / `flipY` / `flip()` (flip).
- [ ] **3.4** Drop UV write from `transformSyncSystem`.
- [ ] **3.5** Remove `bufferSyncColorSystem` and `bufferSyncFlipSystem` from `_runSystems`. Keep the system files in case we need to roll back; delete them in a later cleanup commit.
- [ ] **3.6** Walk every example pair (`pnpm test:smoke` covers correctness; manual walkthrough confirms visuals): animation plays, tint applies, flip applies, alpha fades.
- [ ] **3.7** Re-measure. `transformSyncSystem` should drop. `bufferSyncColorSystem` and `bufferSyncFlipSystem` are gone.

**Alternative if a setter path breaks visually:**
- For the broken setter only: keep `entity.set(...)` alongside the direct write. The bufferSync system stays for that one trait until the direct path is verified. Incremental migration.
- For animation issue (UV write happens but animation looks wrong): verify `setFrame` is being called on the actual sprite, not a clone. `AnimatedSprite2D.update()` is the caller — check it goes through `setFrame`.

**Human gate:** visual walkthrough of all example pairs. Sort-correctness, animation, tint, flip, alpha all must look right.

---

## Phase 4 — `dirtyBatchSet` replaces `Changed(SpriteZIndex)`

Drop Koota Changed for the sort path. Registry holds the dirty signal directly.

**Files:**
- Modify: `packages/three-flatland/src/ecs/traits.ts` (add `dirtyBatchSet: Set<number>` to `BatchRegistry`)
- Modify: `packages/three-flatland/src/sprites/Sprite2D.ts` (zIndex setter)
- Modify: `packages/three-flatland/src/ecs/systems/batchSortSystem.ts` (read Set, no Changed query)
- Modify: `packages/three-flatland/src/ecs/systems/batchAssignSystem.ts` (Set.add on assign)

**zIndex setter:**

```ts
set zIndex(value: number) {
  const prev = this._zIndexArr[this._idx]!
  if (prev === value) return
  this._zIndexArr[this._idx] = value
  if (this._batchMesh) {
    const mat = this.material
    if (mat.alphaTest > 0 && mat.depthWrite) return  // gated; sort skipped
    // Signal sort directly — registry lookup via cached world.
    (this._flatlandWorld as World).query(BatchRegistry)[0]
      ?.get(BatchRegistry)
      ?.dirtyBatchSet
      .add(this._batchIdx)
  }
}
```

(or even better: cache the `dirtyBatchSet` reference directly on the sprite at assign time alongside `_batchMesh`. One more field, removes per-write query.)

**batchSortSystem (new core):**

```ts
export function batchSortSystem(world: World): void {
  const registry = registry(...)  // unchanged lookup
  const dirtySet = registry.dirtyBatchSet
  if (dirtySet.size === 0) return

  for (const bi of dirtySet) {
    const mesh = registry.batchSlots[bi]
    if (!mesh) continue
    // ... existing sort body (precompute eids, sort, swap) ...
  }
  dirtySet.clear()
}
```

The whole "Pass 0 / Pass 1 / Pass 2" structure collapses. No Changed query, no full-world IsBatched walk to filter, no gate precompute (the setter handles gating).

**Tasks:**
- [ ] **4.1** Add `dirtyBatchSet` to `BatchRegistry` trait + initialize in `SpriteGroup.world` getter.
- [ ] **4.2** Cache `_dirtyBatchSetRef: Set<number> | null` on Sprite2D at assign time.
- [ ] **4.3** Rewrite `zIndex` setter to use the cached set.
- [ ] **4.4** `batchAssignSystem`: on assign, add the new sprite's `batchIdx` to the dirty set (replaces the explicit `entity.set(SpriteZIndex, ...)` Changed-firing line).
- [ ] **4.5** Rewrite `batchSortSystem` to read the set, sort listed batches, clear.
- [ ] **4.6** Delete the `Changed(SpriteZIndex)` import and query.
- [ ] **4.7** Smoke test + visual sort verification at batch-demo.
- [ ] **4.8** Re-measure. `batchSortSystem` cost should be proportional to N_dirty_batches, not N_changed_entities.

**Alternative if sort timing has issues:**
- Dual-track mode (dev only): populate both the Set AND fire the old `entity.set(SpriteZIndex, ...)`. Run both queries. Assert the same batches are flagged. Drop dual-track once verified across a few sessions.

**Human gate:** verify batch-demo placement preserves correct y-sort order across many placements + removals + re-placements.

---

## Phase 5 — Threshold calibration

The `BucketedDirtyTracker.fullThreshold` is currently a guess (30 for matrix/UV, 10 for color/flip). Calibrate against the real distribution.

**Tasks:**
- [ ] **5.1** Add a per-tracker telemetry hook: count how many flushes go to "full" vs "ranged" per attribute per frame. Surface to the stats panel.
- [ ] **5.2** Sweep thresholds (5, 10, 20, 30, 50) in knightmark and batch-demo at 5k / 20k / 50k. Record best per attribute.
- [ ] **5.3** Set defaults in `SpriteBatch` constructor. Document the calibration scene + reasoning inline.
- [ ] **5.4** Optional: expose threshold as a constructor option on `SpriteGroup` for advanced users to override per-renderer.

**Alternative if threshold tuning yields <5% improvement:**
- Hard-code a sensible default (say 16 for everything) and don't ship the override option. Less surface area.

**Human gate:** final perf numbers. Update the `## Baseline` and `## Final` sections of this doc.

---

## Phase 6 (stretch) — Per-batch system routing via ECS

Different batches want different systems. A static-tilemap batch shouldn't pay `transformSyncSystem` cost. An alphaTest batch shouldn't pay `batchSortSystem` cost (already handled by the gate). Generalize via ECS query.

**Concept:**

```ts
// Per-batch behavior flag, set at batch creation time.
export const BatchBehavior = trait(() => ({
  needsTransformSync: true,
  needsSort: true,
  alphaTested: false,
}))

// In transformSyncSystem, query batches first, then per-batch query entities:
for (const batchEntity of world.query(BatchBehavior, BatchMesh)) {
  const behavior = batchEntity.get(BatchBehavior)!
  if (!behavior.needsTransformSync) continue
  const meta = batchEntity.get(BatchMeta)!
  // ... walk entities in THIS batch only ...
}
```

This rebuilds `transformSyncSystem` from "walk all batched entities" to "walk per-batch, gated by behavior."

**Catch:** for the common case (single material, all batches behave the same), per-batch iteration adds overhead. Only worth it when scenes are heterogeneous.

**Tasks (only if Phase 5 falls short of the 60k target):**
- [ ] **6.1** Profile a mixed scene — knightmark sprites + a static tilemap batch — to confirm per-batch routing pays off.
- [ ] **6.2** If yes: implement the `BatchBehavior` trait + per-batch system rewrites.
- [ ] **6.3** If no: skip; document that homogeneous scenes don't benefit and per-batch routing is premature.

**Alternative if profiling shows no win:**
- Skip Phase 6 entirely. The per-batch gate at the *material* level (Phase 0's alphaTest gate, already shipped) covers the practical case; full ECS-level routing is over-engineered for current workloads.

**Human gate:** profile before any implementation. Don't build infrastructure for problems you don't have.

---

## Self-review

**Constraints honored:**
- No hot-path allocations: tracker buckets are typed arrays sized at batch construction.
- Cheap runtime decisions: threshold check is a single integer compare in flush.
- ECS-clean: Koota stays authoritative for entity lifecycle + rare-change traits; buffer dirty tracking is mesh-internal.
- Measurement-driven: every phase has a perf gate against the existing `measure()` telemetry.
- Human-in-the-loop: every phase ends with a gate; can't ship without a sign-off.

**Risk: direct writes vs. ECS bookkeeping.**
The setter writes to mesh buffers and ALSO to SoA stores. If a future system needs to read the SoA (e.g., a serialization system), the values are still there. If a future system needs to detect "changed since last frame" for an attribute we've direct-written, it can't use Koota Changed — but the buffer's own dirty tracker has that information. Acceptable.

**Risk: cache invalidation on cross-batch moves.**
`_batchMesh` etc. must be updated on every assign / reassign / remove. Phase 2's invariant test catches the case where one path forgets to update. Add a debug-mode assertion in setters: "if `_entity !== null`, then `_batchMesh !== null`." Fail loudly if this invariant breaks.

**Open question — Phase 6 scope.**
Is per-batch ECS routing worth the complexity for current targets? Phase 5's calibration should give us 60k+. If so, Phase 6 stays in the appendix as a future option. If not, Phase 6 becomes the next mandatory phase.

---

## Baseline (Phase 0 records here)

Pending — first Phase 0 measurement.

## Final (Phase 5 records here)

Pending.
