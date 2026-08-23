# Internal ECS design gate

Status: **approved — core migration and frozen-source evidence accepted, live browser A/B pending**

Date: 2026-08-22

## Decision requested

Approve or revise the proposal to replace Koota inside `three-flatland` with a private, Flatland-specific entity store.

The recommendation is **not** to publish another general ECS and **not** to recreate Koota. The proposed runtime keeps the useful part of Koota's model—typed trait schemas with tag, structure-of-arrays, and object-backed forms—while removing the general features Flatland does not use.

The replacement was required to prove all of the following before Koota was removed. The private
runtime, core migration, dependency cleanup, frozen-source Node evidence, and consumer budgets now
satisfy those gates. The deterministic live browser A/B remains the final release timing check:

1. It is behaviorally equivalent for Flatland's entity lifecycle, batching, effect traits, and change events.
2. It is faster in the representative structural and steady-state workloads.
3. It materially reduces shipped JavaScript.
4. It does not become a public API or another package users must understand.
5. It leaves Koota available to unrelated minis or applications that deliberately use its broader API.

## Review package

1. [Ecosystem research](./00-ecosystem-research.md) — representative JS/TS ECS designs and the lessons applicable here.
2. [Koota usage audit](./01-koota-usage-audit.md) — the exact runtime surface, costs, and Flatland-specific shortcuts already in use.
3. [Proposed runtime](./02-proposed-runtime.md) — scope, API, storage, query, event, and entity-lifecycle design.
4. [Benchmark and validation plan](./03-benchmark-validation-plan.md) — baselines, workloads, acceptance thresholds, and CI gates.
5. [Migration and rollout plan](./04-migration-rollout-plan.md) — atomic implementation phases, rollback boundary, documentation, and review sequence.
6. [Baseline and kernel decision](./05-baseline-and-kernel-decision.md) — raw-evidence links, Koota behavior findings, isolated size results, and the selected production direction.
7. [Private ECS architecture standard](./06-private-ecs-architecture-standard.md) — the durable public/private boundary, ownership laws, hot-path rules, lifecycle contract, capacity policy, and telemetry policy.
8. [Private ECS convergence plan](./07-private-ecs-convergence-plan.md) — subsystem audit, ranked migrations, source references, and the gates required for each follow-up.
9. [Koota upstream suggestions](./08-koota-upstream-suggestions.md) — narrowly scoped ideas learned from the migration, separated into measured proposals and lower-confidence experiments.

## Proposed decision in one page

### Keep

- `trait({ x: 0, y: 0 })`-style typed numeric schemas.
- `trait(() => value)` for object-backed state.
- `trait()` for zero-data tags.
- World-local numeric entities and direct SoA field access.
- Cached query membership.
- Independent added, changed, and removed event consumers.
- The existing opaque `BatchQueryTag` public facade; users never receive the internal runtime's trait type.

### Remove

- The Koota peer dependency and installation step.
- Global world/universe registration.
- `Number.prototype` entity methods.
- World IDs in entity handles.
- General relations, ordered relations, reverse relation indexes, and relation cascade rules.
- General query operators, subscriptions, actions, React bindings, serialization, and world traits.
- Per-call query hashing and copied query-result arrays on frame paths.
- Snapshot-based global tracking masks.

### Replace the one relation directly

Flatland's only relation is the exclusive `InBatch` edge. It duplicates information already present in `BatchSlot`. The proposed schema is:

```ts
const BatchSlot = trait({
  batchEntity: -1,
  batchIdx: -1,
  slot: -1,
})
```

This removes the relation engine while retaining O(1) access to both the batch entity and the batch's GPU-buffer index.

### Keep the runtime private

Proposed location:

```text
packages/three-flatland/src/ecs/runtime/
```

It is source-internal, has no package export, no public declaration surface, and no separate workspace package. Keeping it next to its only consumer lets the bundler inline and eliminate unused helpers.

### Do not select the kernel by intuition

The implementation phase begins with three small, API-equivalent kernels:

1. Sparse-set traits with incrementally maintained query sets.
2. Entity signatures with incrementally maintained query sets.
3. Anchored sparse-set scans with compiled selectors.

The first evidence gate selects entity signatures with incrementally maintained query views as the
production direction. It used 68.5% less active heap than Koota at 60,000 entities and won the
principal lifecycle, stable-query, structural, routing-event, and assignment microbenchmarks. That
selection remains subject to the end-to-end renderer gates; the architecture document expresses the
preferred API and semantics, not an unchangeable storage bet.

## Current measured cost

Against the currently installed Koota 0.6.5:

| Measurement                                            |                                                 Current result |
| ------------------------------------------------------ | -------------------------------------------------------------: |
| Installed Koota package                                |                                                 496 kB on disk |
| Tree-shaken bundle of Flatland's seven runtime imports | 34,910 bytes minified / 10,584 bytes gzip / 9,362 bytes Brotli |
| Shipped private runtime with capacity                  |  10,954 bytes minified / 3,887 bytes gzip / 3,529 bytes Brotli |

The seven imports are `createWorld`, `trait`, `relation`, `createAdded`, `createChanged`, `createRemoved`, and `getStore`. Type-only imports are excluded from the bundle measurement.

The combined shipped private runtime and optional capacity module is gated at **12 kB minified / 4 kB gzip / 3.8 kB Brotli**. Representative consumers use reviewed fixture-specific absolute budgets after source freeze. The pinned pre-migration comparison remains exact but report-only because it spans every reachable package-source change, not only the ECS replacement.

## Approval boundary

The proposal was approved on 2026-08-22. Production migration may proceed only while the evidence
gates remain green. Review can still request changes to:

- the public/private boundary,
- the schema API,
- entity safety,
- query mutation semantics,
- relation removal,
- benchmark thresholds,
- migration commit structure.
