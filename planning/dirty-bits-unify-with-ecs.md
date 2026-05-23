# Unify WithPropsSync dirty bits with ECS dirty tracking

**Status:** Future improvement. NOT in scope for the WithPropsSync recast PR.

**Captured:** During the WithPropsSync recast discussion (event-driven → dirty-bit). User flagged the parallel to recent sprite-sort-fix work.

## The observation

Two dirty-bit systems are emerging in three-flatland:

1. **ECS dirty tracking** (recently shipped in sprite-sort-fix). Koota's `Changed(SpriteUV)`, `Changed(SpriteColor)`, etc. drive batch buffer uploads. Already proven, already fine.
2. **WithPropsSync dirty bits** (this PR). Per-host bit mask, resolver method, fires at sync point.

Both signal "this state is stale until something acts on it." The WithPropsSync resolver currently bridges the two — it reads sprite prop state, writes ECS trait values, which then trigger ECS dirty for buffer sync.

## The deeper observation

Sprite2D has a dual life — standalone or batched. Standalone = own geometry + local arrays. Batched = ECS-backed with array refs swapped to world SoA. Late enrollment (when added to a SpriteGroup parent) does the swap.

This forces WithPropsSync's resolver to branch on `_entity`:
- `if (!this._entity) this._updateOwnUV()` (standalone)
- `else this._entity.set(SpriteUV, {...})` (batched)

If every sprite was always ECS-backed from construction (no standalone path):
- Sprite props project directly to ECS traits, unconditionally.
- WithPropsSync's resolver could be auto-generated from schema-to-trait mapping.
- Auto-batching dynamically batches/unbatches based on material/layer/etc. — sprite doesn't know or care.
- Single-sprite scenes become 1-sprite batches; no special case.

This is the auto-batching milestone (referenced in existing plans). Late enrollment is a symptom of not having it yet.

## What it would mean

The resolver currently has branches like:
```ts
if (!this._entity) this._updateOwnUV()
else this._entity.set(SpriteUV, { ... })
```

With always-on-ECS:
```ts
this._entity.set(SpriteUV, { ... })
```

No branching. The dual sprite-prop-dirty + ECS-trait-dirty layers collapse into one — write a prop → ECS trait change → batch upload triggered. Single signal, single write.

## Out of scope for this PR

1. Auto-batching is its own milestone with prerequisites (entity pooling, batch-membership traits, transition systems).
2. Entity pool management needed to avoid GC churn for short-lived sprites.
3. API contract changes: `sprite._entity` becomes always-truthy; consumers checking it for standalone-vs-enrolled break.

The recast (dirty-bit WithPropsSync, anchor-in-matrix, SpriteGroup flush) is independent and stand-alone valuable. The deeper always-on-ECS work can build on top later.

## Connection to sprite-sort-fix

That branch shipped ECS dirty tracking for batch buffer uploads. The WithPropsSync recast is the same pattern at a different layer (sprite props → derived ECS state). When always-on-ECS lands, the two layers collapse — sprite's "prop dirty" becomes a direct ECS trait write becomes the ECS dirty signal becomes the batch upload.

## TODO when picking this up

- [ ] Audit `planning/milestones/` for the auto-batching milestone; reconcile.
- [ ] Spec entity pool + lifecycle for always-on sprites.
- [ ] Define "always-on-ECS" Sprite2D contract — what disappears from the public API.
- [ ] Performance bracket: spawning N sprites, mutating, render. Measure vs current.
- [ ] Plan migration for existing consumers checking `_entity`.
