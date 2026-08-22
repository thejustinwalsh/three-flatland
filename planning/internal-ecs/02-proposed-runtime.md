# Proposed private entity runtime

Status: approved; signature-backed persistent selectors selected by the first evidence gate

Date: 2026-08-22

## Goals

1. Preserve the type inference and declaration clarity Flatland gets from Koota traits.
2. Make the hot path numeric, world-local, allocation-free, and direct-array based.
3. Implement only semantics required by existing Flatland production code.
4. Reduce the browser runtime to at most 12 kB minified / 4 kB gzip.
5. Keep every type and function private to `three-flatland` source.
6. Make behavior easy to compare against the current Koota implementation.

## Non-goals

- A general-purpose ECS.
- A public `three-flatland/ecs` export.
- A workspace tooling package.
- React state management.
- A system scheduler or game loop.
- General relations, query logic, subscriptions, actions, serialization, networking, or worker support.
- Maintaining source compatibility with Koota.

## Proposed module boundary

```text
packages/three-flatland/src/ecs/runtime/
  entity.ts       # entity packing, allocation, liveness
  trait.ts        # typed schema handles and storage creation
  sparse-set.ts   # internal dense/sparse primitive
  selector.ts     # compiled ordinary and event selectors
  world.ts        # world-owned stores and operations
  index.ts        # private imports used by Flatland ECS modules
```

The filenames are a planning shape, not a requirement. Bundle output and code clarity decide whether the final kernel is split or kept in fewer source files.

## Schema API

The schema declaration retains Koota's most useful forms.

```ts
const SpriteUV = trait({ x: 0, y: 0, w: 1, h: 1 })
const IsRenderable = trait()
const BatchMesh = trait(() => ({ mesh: null as SpriteBatch | null }))
```

Calling a trait creates a typed initializer:

```ts
SpriteUV({ x: 0.25, w: 0.5 })
IsRenderable
BatchMesh({ mesh })
```

Required inference:

- a numeric object becomes a flat SoA schema,
- a factory becomes an object-backed value schema,
- no argument becomes a tag,
- initializer patches are typed and partial,
- `world.read(entity, SpriteUV)` returns the inferred value shape,
- `world.store(SpriteUV)` returns the inferred field-array shape,
- `world.patch(entity, SpriteUV, patch)` accepts only schema fields and values.

Nested numeric arrays are not supported by the runtime. Material, light, and pass effects already flatten vector fields to numeric keys before creating their traits. Object-backed factory values remain ordinary typed objects.

## World API

Proposed internal surface:

```ts
const world = createWorld()

const entity = world.spawn(SpriteUV({ x: 0.25 }), SpriteColor, IsRenderable)

world.add(entity, EffectTrait(values))
world.remove(entity, IsRenderable)
world.has(entity, SpriteUV)
world.read(entity, SpriteUV)
world.patch(entity, SpriteUV, { x: 0.5 })
world.patch(entity, BatchSlot, { slot }, false)
world.destroy(entity)
world.dispose()
```

Rationale:

- Entity methods are removed. This avoids built-in prototype mutation and makes world ownership explicit.
- `read` and `patch` distinguish access intent more clearly than overloaded `get` and `set`.
- The final boolean preserves the existing “do not emit changed” fast path without a new allocation-bearing options object.
- `dispose` describes releasing a world more precisely than `destroy`, which is reserved for entities.

Names can be revised during review. Semantics and generated code matter more than matching this spelling exactly.

## Entities

### Handle layout

Use a world-local packed numeric handle:

```text
high bits: generation
low 20 bits: entity index
```

Properties:

- At least 1,048,576 simultaneous entity indices per world.
- No world ID bits because every operation takes its world explicitly.
- No global universe.
- A generation side table rejects stale handles after index reuse.
- Handles are world-relative: two worlds may issue the same numeric handle. Passing a handle to the
  wrong world is an internal ownership error, not something the packed value can identify by itself.
- Worlds reject allocation beyond the 20-bit simultaneous-entity capacity. If one index reaches
  the maximum safely packable generation, that index is retired instead of wrapping or aliasing a
  stale handle.
- Hot systems may extract the low index once and retain it on the owning `Sprite2D`, as they do today.

The benchmark prototype must also measure raw non-generational indices. Generational safety remains the recommended production choice unless it measurably violates the end-to-end gate. It must not be removed merely to win a synthetic chart.

### Allocation

- Dense alive list plus sparse position table.
- Free indices are reused.
- Destroy increments the generation before reuse.
- World disposal clears owned stores/selectors and releases object references.
- No entity object allocation.

## Storage forms

### Numeric SoA traits

Each numeric trait owns one stable `number[]` per field, indexed by entity index.

Why ordinary arrays lead the proposal:

- Sprite2D retains direct references to field arrays after enrollment.
- `number[]` can grow without replacing the referenced object.
- Koota uses this shape today, so it has the lowest migration risk.
- Integer-like values can stay V8 packed-SMI arrays until a field requires doubles.

The prototype phase must still compare:

1. ordinary `number[]`,
2. preallocated typed arrays with configurable capacity,
3. typed-array storage behind stable wrappers.

A typed-array result is accepted only if it wins the end-to-end schedule after accounting for growth and access indirection. Fixed capacity is not an acceptable hidden constraint.

### Object-backed traits

- Sparse array of object references indexed by entity index.
- Factory executes once per added trait instance.
- Initializer patches merge into that fresh object.
- Removal clears the reference so disposed worlds and entities do not retain render resources.

### Tags

- Presence only; no value store.
- The selected kernel decides whether presence is a sparse set, per-trait byte array, or entity signature.

## Selector API

Inline per-frame query hashing is replaced with compiled module-level selectors.

```ts
const BatchedSprites = select(IsBatched, BatchSlot)
const RegistryEntities = select(BatchRegistry)

for (const entity of world.view(BatchedSprites)) {
  // no copied result array
}
```

Required selector behavior:

- Identity is assigned once when the selector is declared.
- Each world lazily creates the selector's local state.
- Ordinary selector membership is maintained only after relevant structural changes.
- `view()` returns a reusable read-only view, not a copied array.
- Iteration order is explicitly unspecified.
- Selector membership must not allocate during a steady-state schedule run.

### Mutation semantics

The safest small rule is:

> Do not add or remove one of a selector's required traits while iterating that selector's live view.

Existing Flatland systems do not require that operation. Development builds may assert this condition if the assertion can be eliminated from production. Unrelated trait writes and tracked value patches are allowed.

A command buffer is rejected unless migration proves an existing system requires deferred structural changes. Building one speculatively would reproduce framework machinery the private runtime is meant to avoid.

## Event selectors

```ts
const AddedRenderable = added(IsRenderable)
const RemovedRenderable = removed(IsRenderable)
const ChangedRouting = changed({
  any: [SortLayer, SpriteMaterialRef, CameraLayersMask],
  all: [IsBatched],
})

for (const entity of world.drain(AddedRenderable)) {
  // process once
}
```

Semantics:

- Every event selector is an independent consumer.
- The world registers which selectors observe each trait.
- Add/remove/trackable patch operations push the entity into only the relevant selector queues.
- A queue is a reusable dense/sparse set, so repeated changes before drain produce one entity.
- `drain()` returns the reusable queue view and marks it consumed without allocating.
- Added then removed before either drain produces an entry in both independent queues.
- Explicit trait removal queues the entity while its other traits remain readable.
- Entity destruction does not synthesize removed-trait events. Callers that need removal work must
  remove the observed trait and drain that work before destroying the entity.
- Queued generations remain distinct if an index is destroyed and recycled before a drain.
- An untracked patch (`false`) emits no changed event.
- A multi-trait changed selector uses OR semantics across `any`: changing any observed routing trait
  enqueues the entity. The dense/sparse queue deduplicates it once even if several observed traits
  change before the drain.
- Ordinary requirements use AND semantics across `all`. Here `IsBatched` must still be present when
  enqueueing, so unrelated sprites cannot enter routing work.
- This one combined selector replaces the separate changed queries and post-query JavaScript `Set`
  union used by the current schedule.

Exact edge cases are specified by the differential tests, not left to incidental implementation behavior.

## Query kernel competition

The API above is independent of the internal kernel. Three candidates must be prototyped behind the same test adapter.

The completed comparison selected candidate B. See
[`05-baseline-and-kernel-decision.md`](./05-baseline-and-kernel-decision.md) for raw-evidence links
and the disposition of the other candidates. The end-to-end renderer gates can still reject or
revise that choice before Koota is removed.

### A. Sparse trait sets + persistent selector sets

- Each trait has dense/sparse membership.
- Each selector has dense/sparse membership.
- Structural mutations re-evaluate only selectors subscribed to the changed trait.
- Selector creation anchors its initial scan on the smallest required trait set.

Expected profile: fastest stable iteration and structural membership at the cost of more sparse arrays.

### B. Entity signatures + persistent selector sets

- Entity presence is stored in one or more 32-bit signature words.
- Selectors keep required masks and their own dense/sparse results.
- Structural mutations update the signature and affected selectors.

Expected profile: small/fast membership while trait count is modest; dynamic effect traits may force additional words and complexity.

### C. Sparse trait sets + anchored selector scans

- Traits maintain membership sets.
- A selector starts from the smallest set and checks the other required traits on each `view()`.
- Selector results use reusable scratch storage.

Expected profile: smallest implementation, but repeated per-frame intersection work. It may still win because many singleton selectors are tiny and only two sprite-wide queries dominate.

Selection rule: choose the smallest candidate that meets every end-to-end performance gate. A candidate that wins isolated query ops but loses the actual SpriteGroup schedule is rejected.

## Removing the relation

Replace:

```ts
const InBatch = relation({ exclusive: true })
const BatchSlot = trait({ batchIdx: -1, slot: -1 })
```

with:

```ts
const BatchSlot = trait({
  batchEntity: -1,
  batchIdx: -1,
  slot: -1,
})
```

The value is updated atomically on assignment, reassignment, removal, and sort swaps. The `IsBatched` tag remains initially because it communicates query intent and avoids interpreting sentinel values in selectors. A later simplification may remove it only if tests and bundle/performance results prove that is a net improvement within this same change.

No generalized relation API is included.

## Batch entities and singleton records

The first implementation keeps batch entities and object-backed singleton traits. This minimizes simultaneous architectural change and preserves `BatchQueryTag` behavior.

The benchmark report must separately measure whether replacing batch entities/singleton queries with direct registry records matters. That simplification is permitted in the same work only when it:

- reduces code or frame cost measurably,
- preserves the opaque batch-query facade,
- does not turn `SpriteGroup` into an unstructured bag of unrelated fields.

It is not required to justify removing Koota because the relation engine and general query/tracker machinery are already removable without it.

## Error and debug behavior

Development builds should detect:

- stale entity handles and, where an owning object is available, mismatched world ownership,
- reading or patching a missing trait,
- duplicate trait addition where replacement was not requested,
- selector mutation of its required structure during iteration,
- object-backed values retained after entity/world disposal.

Production builds should retain only checks needed to prevent memory corruption or user-visible incorrect rendering. Since the runtime is internal, callers can be corrected rather than supporting permissive ambiguous behavior.

## Public compatibility

Unchanged:

- `Flatland`, `SpriteGroup`, `Sprite2D`, effect, light, pass, and React APIs.
- Batch query facade behavior.
- World ownership rules.
- Sprite batching and lifecycle timing.

Changed for users:

- Koota is no longer a peer dependency or installation prerequisite.
- Bundles no longer include Koota through `three-flatland`.

The internal runtime itself is not documented as user API.
