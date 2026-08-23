# Koota upstream suggestions

Status: **draft for maintainer review**

Date: 2026-08-23

## Purpose

`three-flatland` still values Koota as the general ECS we reach for in examples and other projects.
The private Flatland runtime is not a proposed replacement for Koota: it is a renderer-specific
kernel that trades generality for a smaller, narrower hot path. This note records the parts of that
work that may transfer back to Koota without asking Koota to become renderer-specific.

The proposals are intentionally separated by confidence. The first four follow directly from Koota
0.6.5 source inspection and reproduced measurements. The final section contains experiments, not
recommendations.

Every percentage below is a median from one frozen comparison run recorded in
`planning/internal-ecs/results/kernel-baseline.json`, captured on a single machine against Koota
0.6.5. Treat the figures as evidence for where costs live, not as portable performance claims; any
upstream work should start by reproducing them inside Koota's own benchmarks.

## Proposal 1: add a stable borrowed query view

### Suggested name

Prefer `queryView` or `createQueryView` over `memoizedQuery`.

“Memoized query” suggests that the query computation is rerun and its input/output pair is cached.
Koota already does the important incremental work: each world caches a `QueryInstance`, and that
instance maintains membership in a sparse set as structure changes. The remaining cost is in
materializing the public result.

In Koota 0.6.5, a normal query read:

1. commits pending removals;
2. reads `query.entities.dense`, whose getter returns `slice(0, cursor)`;
3. calls `.slice()` on that result again;
4. decorates the copied array with a newly constructed query-result facade.

That preserves convenient snapshot semantics, but it makes an O(n) copy and new result object part
of every read even when membership did not change.

### Proposed API shape

```ts
const Moving = createQuery(Position, Velocity)
const moving = world.queryView(Moving)

for (const entity of moving) {
  // Read directly from the incrementally maintained membership.
}

// Take an owned array only when snapshot semantics are required.
const snapshot = moving.toArray()
```

The exact spelling should follow Koota's API conventions. The semantic distinction matters more
than the method name:

- `world.query(...)` keeps today's owned snapshot behavior.
- `world.queryView(...)` returns a stable, read-only facade over live membership.
- Repeated `queryView` calls for the same world/query pair return the same facade identity.
- The facade never exposes the mutable dense array.
- `toArray()` is the explicit allocation boundary.

A minimal facade surface, for illustration only:

```ts
interface QueryView<E extends Entity = Entity> extends Iterable<E> {
  readonly length: number
  readonly version: number
  at(index: number): E | undefined
  toArray(): E[]
}
```

Keeping the facade iterable but not array-like prevents accidental index writes against shared
membership. Whether views are also offered for ad-hoc trait lists (`world.query(Position)` works
without a declared query today) should follow whatever conventions `world.query` already has; the
sketch shows only the `createQuery` form.

Start with ordinary, non-tracking queries. Added/changed/removed queries are consumable event
streams: their clear-on-read behavior conflicts with a continuously live view and deserves a
separate design rather than surprising overloads.

### Mutation contract

A borrowed view needs a precise structural-mutation rule. The smallest safe first version is:

- synchronize pending removals before every observation: reading `length`, calling `at()` or
  `toArray()`, and creating an iterator;
- allow component-value writes during iteration;
- reject or defer structural mutation that changes this view until the active iteration completes;
- make a nested iteration use its own cursor, not shared iterator state;
- keep view identity stable across `world.reset()`: membership empties, the same facade object stays
  readable;
- invalidate all operations after world disposal.

`version` should increment whenever committed membership changes, including the emptying transition
on reset. If removals remain queued internally, the observation that commits them increments the
version before returning. It must not expose a pre-commit version alongside post-commit membership.

An alternative is versioned fail-fast iteration. Snapshot-on-first-mutation is attractive, but it
reintroduces an unpredictable allocation into the path this API is meant to stabilize.

### Why this is the highest-value proposal

In the frozen Flatland comparison, repeated stable-query retrieval made 1,000 reads of a
16,384-member result and was 99.8% lower in median time than the Koota path. The stable-iteration
case also called `world.view()` in each of its 1,000 loops before visiting roughly 16.38 million
entities; its 46.3% reduction therefore combines retrieval materialization and iteration rather
than isolating iterator speed. Those figures are not a promise that this API alone reproduces the
private kernel—the private runtime also has fewer abstractions—but source inspection identifies
result materialization as a concrete, independently removable cost. An upstream prototype should
measure iteration over an already-obtained borrowed view separately.

### Acceptance tests

- repeated reads return the same facade and allocate no entity array;
- membership changes appear without recreating the view;
- `toArray()` returns an owned snapshot that does not change later;
- nested iteration is correct;
- the chosen structural-mutation rule is enforced deterministically;
- views survive `world.reset()` with unchanged facade identity and empty membership;
- tracking queries are rejected until their consumption semantics are explicitly designed;
- world disposal invalidates the view.

## Proposal 2: advisory entity-capacity hints

Koota's `createWorld` already accepts an options object. A compatible extension could be:

```ts
const world = createWorld({ expectedEntities: 16_384 })
```

The hint should mean “prepare for approximately this many simultaneously live entities,” never
“hard maximum.” It should:

- validate a non-negative safe integer;
- initialize only storage that can be usefully and honestly reserved;
- grow geometrically when the estimate is exceeded;
- preserve useful capacity across `reset()`;
- release retained storage on terminal world disposal;
- avoid pre-creating cold traits, relations, queries, or application payloads;
- expose optional development telemetry at growth boundaries, not on steady reads.

JavaScript does not provide a portable capacity-only reservation API for ordinary dense arrays.
Push-then-truncate is not a real guarantee and should not be presented as one. The useful targets are
index-addressed sparse tables, masks, entity metadata, typed arrays, and other structures whose
capacity can be established without creating fake live values.

Flatland's analogous hint is covered by lifecycle tests that verify growth beyond the estimate,
capacity retention across clear/reuse, and release on disposal. The defensible value is
deterministic allocation placement, not a headline speed claim; an upstream Koota prototype should
capture its own end-to-end timing and heap evidence before making one.

## Proposal 3: prevent packed-handle generation aliasing

Koota 0.6.5 packs entities into 32 bits as 4 world-ID bits, 8 generation bits, and 20 entity-ID bits.
Generation increments per recycle of an index and wraps modulo 256, so the 256th reuse of an index
reproduces the exact bits of that index's original handle: a stale `Entity` held across the boundary
becomes indistinguishable from a different, live entity. The Flatland compatibility scenario
originally checked recycle 4,096; that passed only because 4,096 is a multiple of 256. The corrected
scenario records the first alias at recycle 256, where stale-handle comparison succeeds against the
recycled live entity.

Generation wrap is not the only alias boundary. `world.reset()` immediately reuses the same world
ID, entity index, and generation for the first new entity, and destroying a world releases its
4-bit world ID for reuse by a later world. In both cases, a stale handle can equal a new live handle
and pass `world.has(stale)` in the receiving world. The benchmark suite now records these two direct
Koota alias boundaries alongside the 256-recycle horizon.

Possible upstream directions, in increasing compatibility cost:

1. retire an entity index before its generation wraps (an in-world mitigation only);
2. widen the safe-integer handle so it carries larger generation and persistent world/reset epochs;
3. use an opaque boxed handle or never-reused indirection token that a side table can validate;
4. make the packing layout configurable for workloads that need more worlds or more reuse safety.

Retiring before wrap is the smallest mitigation for uninterrupted in-world recycling, but it does
not solve reset or world-ID reuse. A complete stale-handle guarantee needs identity that survives
those boundaries. Long-running churn-heavy worlds also need controlled index growth and telemetry
so retirement cannot become a silent memory problem. Any change should test stale handles, queued
tracking events, relations, reset, destroy/recreate, serialization, and the maximum simultaneously
live entity count together.

## Proposal 4: activate event tracking per world

Koota's `createAdded`, `createChanged`, and `createRemoved` allocate a process-global tracking ID.
Creating one of those modifier factories immediately snapshots every existing world, and every world
initialized later allocates masks for every global tracking ID whether or not that world uses it.

An owned world-local activation API could keep modifier definitions declarative and allocate queues
only for consumers that drain them:

```ts
const RoutingChanges = createQuery(IsBatched, Or(Changed(SortLayer), Changed(Material), Changed(CameraLayers)))

const routingChanges = world.track(RoutingChanges)

for (const entity of routingChanges.drain()) {
  // Each tracker owns an independent cursor.
}

routingChanges.dispose()
```

Required semantics:

- tracking starts at `world.track`, not module-level modifier creation;
- multiple consumers get independent queues/cursors;
- activation is lazy and disposal is idempotent;
- reset clears pending events but keeps a live tracker;
- world disposal invalidates it;
- a stale disposer cannot deactivate a newer tracker.

The existing `world.query(Changed(...))` behavior could remain as a compatibility path until a major
release. Flatland's routing-event workload (12,000 entities with three tracked writes each) was 65.2%
lower in median time, but that comparison also replaced Koota's generalized tracking and
deduplication with a purpose-built queue. It motivates an isolated Koota prototype; it does not
attribute that full improvement to activation timing.

## Lower-confidence experiments

These ideas are promising but should not be presented as migration findings until isolated Koota
prototypes measure them.

### Optional reverse indexing for exclusive relations

Koota already specializes `relation({ exclusive: true })` to one scalar target per source. The
Flatland result therefore does not justify a new relation constructor. If target-to-source queries
are independently shown to dominate, Koota could instead test an opt-in incrementally maintained
reverse index such as `relation({ exclusive: true, indexed: true })`. It must preserve the current
relation lifecycle and be judged against the extra memory/write cost.

### Allocation-focused result helpers

`readEach` reuses one state array within a call, which is already a good local optimization. Further
experiments could cache immutable trait/store resolution on the query instance and offer callback
forms that do not decorate arrays. Measure them independently from `queryView` so the value of each
change remains attributable.

### Growth telemetry for future PGO

An optional development-only callback could report storage kind, old capacity, new capacity, and
the triggering live count. That would make recorded play sessions useful for future profile-guided
preallocation without adding production-frame observation. Keep this as a data seam, not an
automatic policy: entities, traits, relations, and event queues have different useful growth curves.

## Suggested upstream sequence

1. Add an allocation benchmark around unchanged repeated queries and prototype `queryView` for
   non-tracking queries only.
2. Land generation-wrap, reset, and world-ID-reuse tests before choosing a handle fix.
3. Prototype `expectedEntities` with growth-boundary telemetry and heap measurements.
4. Measure world-local event activation independently from routing queue specialization.
5. Evaluate optional reverse relation indexing only if a representative target-query workload
   identifies it as a bottleneck.

Each proposal should ship behind its own benchmark and compatibility tests. The useful upstream
lesson is not “copy Flatland's ECS”; it is that Koota's already-incremental membership can expose a
more explicit zero-copy read contract, and its general storage can give applications more control
over when growth happens.
