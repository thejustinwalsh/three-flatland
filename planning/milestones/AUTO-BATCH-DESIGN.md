# Auto-batch design

**Status:** Design canonical  ·  **Authored:** 2026-05-17  ·  **Parent:** `RENDERING-ARCHITECTURE.md`

How sprites added to a vanilla three.js scene end up batched without user ceremony, with byte-identical visuals to the standalone path.

---

## Three modes for a Sprite2D

A `Sprite2D` always works as a standalone Three.js Mesh. Batching is an optimization layered on top, never a precondition.

| Mode | API shape | When |
|---|---|---|
| **Standalone** | `scene.add(sprite)`, sprite has own material/geometry | Always works. Slow for many sprites; fine for single/few. |
| **Auto-batched** | Same construction; orchestrator promotes when N+ sprites share material | Default behavior. Zero user thought. |
| **Explicit (SpriteGroup)** | `spriteGroup.add(sprite)`; group declares the material for all children | Use when you want guaranteed batching without "did I forget to share the material?" risk. |

All three are first-class. SpriteGroup is a *discipline container* — its job is preventing the footgun where the user wants batching but accidentally creates per-sprite materials. SpriteGroup doesn't enable batching the orchestrator can't do; it just enforces the contract upfront.

---

## Promotion safety: class invariant proof

A sprite's standalone rendering and its batched rendering produce identical pixels if every state component has a 1:1 representation in both paths. For Sprite2D as designed today:

| State | Standalone | Batched | Identical? |
|---|---|---|---|
| Vertex position | `localPos × matrixWorld × V × P` | `localPos × instanceMatrix × V × P` | ✓ (`instanceMatrix` set from `matrixWorld`) |
| UV / atlas | `Sprite2DMaterial` reads atlas via `instanceUV` | Same material, same `instanceUV` attribute | ✓ |
| Color/tint | `instanceColor` attribute | Same attribute | ✓ |
| Flip | `instanceSystem.xy` | Same | ✓ |
| Effects + enable bits | `instanceSystem.w` + `effectBuf*` | Same | ✓ |
| Material blend/depth | Shared material instance | Same instance | ✓ |
| Shader pipeline | Compiled from material | Same material → same compiled program (deduped by three) | ✓ |
| **`renderOrder`** | `sprite.renderOrder` | `batch.renderOrder` (derived from sortLayer) | **only ✓ if not user-customized** |
| **`layers` mask** | `sprite.layers` | `batch.layers` | **always — sprites with different masks route to different batches** |

The first 8 are structurally invariant — Sprite2D is batch-safe by class design. Only `renderOrder` (when user-customized) breaks batching; `layers` mask differences just route to different batches.

**Eligibility + routing rule:**

> Every Sprite2D is auto-batch eligible unless the user customizes `renderOrder` directly (escaping the `sortLayer` system).
>
> Which batch it joins is determined by its **run key** — `(material.id, sortLayer, layers.mask)`. The orchestrator routes the sprite to (or creates) the batch matching that tuple. Customizing `sprite.layers` doesn't disqualify batching; it just routes to a different batch with that camera mask.

Decided once at registration time + on relevant mutations (via intercepted setters on `sortLayer`, `material`, `renderOrder`). No periodic re-check.

---

## Lifecycle

```
                     ┌────────────────────┐
                     │  Sprite created    │
                     │  (texture only,    │
                     │   no material)     │
                     └─────────┬──────────┘
                               │ scene.add(sprite)
                               ▼
                  ┌───────────────────────────┐
                  │  'added' event fires      │
                  │  • walk parent → scene    │
                  │  • prime registry         │
                  │  • install Scene hook     │
                  └─────────┬─────────────────┘
                            │  if walk succeeded
                            ▼
                  ┌───────────────────────────┐
                  │  First renderer.render()  │
                  │  • Scene.onBeforeRender   │
                  │    (our chained handler)  │
                  │  • sweep: classify        │
                  │  • assign default mat     │
                  │    from registry          │
                  │  • count siblings sharing │
                  │    run key                │
                  │    (material,             │
                  │     sortLayer,            │
                  │     layers.mask)          │
                  └─────────┬─────────────────┘
                            │
                  ┌─────────┴─────────────────┐
                  │ N=1 in run?       N≥2?    │
                  ▼                           ▼
        ┌─────────────────┐         ┌─────────────────────┐
        │ Stay standalone │         │ Promote to batch    │
        │ visible=true    │         │ • allocate tier-0   │
        │ draws as Mesh   │         │   batch (64 slots)  │
        │                 │         │ • sprites.visible=  │
        │                 │         │   false             │
        │                 │         │ • register data     │
        │                 │         │   in batch          │
        └─────────────────┘         └──────────┬──────────┘
                                               │ tier 0 fills
                                               ▼
                                    ┌──────────────────────┐
                                    │ Allocate tier-1      │
                                    │ batch (256 slots);   │
                                    │ continues per tier   │
                                    └──────────────────────┘
```

---

## Tiered buffer sizes

Each `SpriteBatch` is born at a fixed size and stays that size forever. When it fills, the next batch in the run is created at a larger tier. The existing multi-batch-per-material machinery handles overflow — no mid-life reallocation.

| Tier | Slots | Memory per batch (approx) | Allocation moment |
|---|---|---|---|
| 0 | 64 | ~11 KB | First auto-batch for a run-key (material, sortLayer, layers.mask) |
| 1 | 256 | ~44 KB | Tier 0 filled |
| 2 | 1,024 | ~176 KB | Tier 1 filled |
| 3 | 4,096 | ~704 KB | Tier 2 filled |
| 4 | 16,384 | ~2.75 MB | Tier 3 filled; max |

Memory scales with actual usage. A scene with 5,000 sprites of one material allocates ~935 KB total (tiers 0+1+2+3 = 5,440 slots), vs ~2.75 MB if we always allocated max. **3× less memory, 4 draw calls instead of 1.**

For SpriteGroup users who declare `maxBatchSize: 8192` explicitly, they get exactly that. The tier ladder is an auto-orchestrate-path default; explicit declarations override.

### Memory math per slot

Per-instance state per slot:
- `instanceMatrix`: 16 floats × 4 bytes = 64 B
- Interleaved core (UV, Color, System, Extras): 16 floats × 4 bytes = 64 B
- `effectBuf0..2` (up to 3 × vec4): 12 floats × 4 bytes = 48 B

Total: **~176 B/slot** of GPU buffer. CPU JS-side bookkeeping (BatchSlot trait, free list entry) adds tens of bytes per slot in Koota's archetype storage. All well-bounded.

### Threshold

Auto-batch threshold = **2**. At tier-0 size (64 slots, ~11 KB), the batch overhead is trivial. There's no meaningful "too few to justify" zone.

The earlier "16k slots for 2 sprites is wasteful" concern dissolves entirely once tiers exist.

### Hysteresis

Sprites added/removed cycle without batch destruction:

| State | Action |
|---|---|
| Batch has N ≥ 2 sprites | Healthy |
| Batch drops to N = 1 | **Keep batch alive** (hysteresis floor — don't flap) |
| Batch drops to N = 0 | Destroy batch, free GPU buffers |
| New sprite added to a run-key with no batch | Threshold check: ≥ 2 sprites in run → create tier-0 batch |

Avoids the destroy/recreate flap when user adds and removes a sprite repeatedly (e.g., particle spawn-die cycles where N hovers near threshold).

---

## There is no per-frame eligibility sweep — the model is event-driven

An earlier draft of this doc described a per-frame "sweep" that iterated `registry.sprites` checking eligibility. **That was over-design.** Eligibility decisions are reactive — they fire on lifecycle events, not per frame.

### What changes a sprite's batch eligibility, and how we detect it

| Trigger | Detected by | Action |
|---|---|---|
| Sprite added to scene | `'added'` event (signal A in `RENDERING-ARCHITECTURE.md`) | Register → evaluate once → batch or standalone synchronously |
| Sprite removed from scene | `'removed'` event | Unregister → free batch slot → demote remaining if N drops to 0 |
| Sprite material changes | Our `material` setter (existing `batchReassignSystem`) | Move sprite to correct run |
| Sprite sortLayer changes | Our `sortLayer` setter | Move sprite to correct run |
| Sprite `layers` mask changes | Our intercepted `layers` setter | Move sprite to batch matching new mask (still batched) |
| Material disposed | `material.addEventListener('dispose')` | Tear down batches + resurrect default-material sprites |
| Sibling crosses N=2 threshold | Same add/remove handlers above | Promotion / demotion computed reactively in those handlers |
| User mutates `sprite.renderOrder` or `sprite.layers` directly | **No event fires** | Undefined behavior — same as any three.js library. Document: `scene.remove(sprite); scene.add(sprite)` to force re-evaluation |

Every legitimate trigger is event-driven. There's no need to poll. Three.js itself doesn't react to direct property mutations either — we take the same posture.

### What Scene.onBeforeRender actually does each frame

The chained handler installed on the user's scene runs every render call. Its work:

1. **Run existing ECS systems** (`batchSortSystem`, `transformSyncSystem`, etc.) — already dirty-tracked, short-circuit when nothing changed
2. **Flush dirty GPU upload ranges** via `flushDirtyRanges` per touched batch — O(dirty buckets), zero when clean
3. **Call user's original `Scene.onBeforeRender` if any** (chain preserved)

No iteration over `registry.sprites`. No per-sprite checks. On a frame where nothing changed (no add/remove/move, no color/transform mutations), the handler does ~zero work beyond the function call itself.

### What `registry.sprites` is for, then

Lookup, not iteration. It's the set we use when we need to find all sprites attached to a disposed material (`registry.spritesForMaterial(mat)`) or do a wholesale cleanup. Not a hot-path collection.

### Frame cost model

| Per-frame work | Cost when nothing changed | Cost when N sprites' color changed |
|---|---|---|
| Eligibility check | **None** | None (orthogonal to data updates) |
| ECS systems | ~hundreds of ns (early-outs) | O(dirty buckets), sub-ms at 16k |
| Dirty flush | None | One `bufferSubData` per dirty bucket (or one `bufferData` if many) |

---

## Migration paths (all event-driven)

| Transition | Trigger | Handled by |
|---|---|---|
| Standalone → batched (auto-promote) | `'added'` event finds existing sibling in run, OR sibling add bumps run to N≥2 | Add `IsRenderable` trait → existing `batchAssignSystem` runs |
| Batched → standalone (auto-demote) | `'removed'` event drops run to N=0, OR user customizes `renderOrder` via `scene.remove`+`scene.add` cycle | Free batch slot → restore `visible = true` |
| Sprite material changes | Our `material` setter | Existing `batchReassignSystem` |
| Sprite `sortLayer` changes | Our `sortLayer` setter | `batchReassignSystem` (new run key) |
| Sprite `layers` mask changes | Our intercepted `layers` setter | `batchReassignSystem` (new run key — routes to differently-masked batch) |
| Sprite `renderOrder` directly customized | Our intercepted `renderOrder` setter | Demote to standalone (escapes sortLayer system) |
| Sprite removed from scene | `'removed'` event | Registry unregisters → batch slot freed |
| Material disposed | `material.dispose` event | Batches torn down → default-material sprites resurrect (see [§Material lifecycle](#material-lifecycle)) |

The existing system shape covers most of this. One small extension needed: the **batched→standalone** path (currently the sprite stays invisible after `freeSlot`; needs explicit `visible = true` restoration when demotion is auto-orchestrator decision rather than user action). Add to `batchRemoveSystem` or sibling.

---

## Material lifecycle

### Construction

```ts
// texture-first (most common)
const s = new Sprite2D({ texture: knightAtlas })
// material is null until registration

scene.add(s)
// registry.register(s) → s.material = registry.getDefaultMaterial(knightAtlas)
//                      → s._materialWasRegistryDefault = true
```

```ts
// explicit material (user opts in)
const s = new Sprite2D({ texture: knightAtlas, material: myCustomMat })
// s.material = myCustomMat at construction
// s._materialWasRegistryDefault = false
```

### Dispose handling

On `material.addEventListener('dispose', fn)`:

```ts
for (const sprite of registry.spritesForMaterial(material)) {
  if (sprite._materialWasRegistryDefault && sprite._texture) {
    // resurrect: fresh default from registry
    sprite.material = registry.getDefaultMaterial(sprite._texture)
    // sprite stays registered; next sweep re-batches it cleanly
  } else {
    // user-supplied custom material; can't resurrect
    sprite.visible = true
    sprite._registered = false
    // three.js semantics for "disposed material in use" apply
  }
}
for (const batch of registry.batchesForMaterial(material)) {
  batch.dispose()
  registry.removeBatch(batch)
}
registry.unregisterMaterial(material)
console.warn(`[three-flatland] Disposed material ${material.name || material.id} had N sprites attached.`)
```

Default-material sprites survive dispose-then-reuse transparently. Custom-material sprites are the user's responsibility (standard three.js behavior).

### Why per-registry defaults (not module-static)

Three's pipeline cache (`Pipelines.js:176–198`) dedupes `ProgrammableStage` instances by shader source string. Two Sprite2DMaterials in two registries with identical generated TSL share the compiled shader program. The only per-material cost is a small JS instance + pipeline binding state — trivial.

What we gain: full Flatland isolation. Registering an effect on Flatland A's material doesn't pollute Flatland B's. Dispose on A doesn't break B.

---

## What auto-batch deliberately doesn't try to do

- **Don't promote sprites with custom `renderOrder` / `layers`** — those users explicitly opted out of default ordering
- **Don't intercept arbitrary three.js property changes** — class invariant rules cover what we control; users who mutate three internals get three semantics
- **Don't recompile shaders during promotion** — material is the same instance pre-and-post-promotion; the only state change is "which Mesh draws the pixels"
- **Don't auto-batch across scenes/Flatlands** — registry boundary is the batching boundary, period
- **Don't try to "fix" user-disposed custom materials** — orphaning is three's contract; we warn and move on

---

## Acceptance criteria

- [ ] `Sprite2D._sharedMaterials` static cache removed; replaced with `registry.defaultMaterials`
- [ ] Sprite2D constructor with just `{ texture }` produces a sprite that auto-batches with siblings sharing the texture
- [ ] Two Flatland instances in the same scene with sprites sharing a texture use two separate materials (verified by mutation isolation test)
- [ ] Auto-batch tier ladder produces correct multi-batch behavior across 1 → 100k sprite stress
- [ ] First-frame auto-batch verified — sprite added to scene then immediately rendered draws batched (not standalone)
- [ ] Custom `sprite.renderOrder = 99` keeps the sprite standalone
- [ ] Material dispose resurrects default-material sprites correctly
- [ ] Material dispose with custom-material sprites warns + leaves three.js semantics intact
- [ ] Knightmark continues to hit 60fps at current sprite count
- [ ] Memory profile shows tiered allocation (small batches early, larger batches added on overflow)

---

## Open knobs (tunable, not blocking)

- Tier ladder values (64/256/1024/4096/16384) — benchmark sweep may suggest tweaks
- Threshold of 2 — could be material-specific in the future if some materials prove expensive to batch (none known today)
- Hysteresis floor (currently 0) — could become "destroy at 0 after K frames" for further smoothing if flap is observed
