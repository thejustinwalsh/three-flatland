# Internal ECS migration and rollout plan

Status: core migration in progress — private runtime merged, renderer A/B pending

Date: 2026-08-22

## Branch and PR shape

Work begins in a clean worktree rebased onto the then-current `origin/main`. Do not use the Driller branch or the camera stack worktrees.

The first three planned review slices landed together in PR #231: design evidence, the differential
harness, and a private typed runtime with no production consumer. The remaining delivery is a
two-PR stack:

1. Core migration, compiled event/selectors, direct batch ownership, deterministic browser
   fixtures, and live renderer A/B evidence, targeting `main`.
2. Koota dependency removal, installation documentation, and representative-consumer attribution,
   targeting the core migration PR.

Only the final cleanup PR removes Koota from the package manifest. The current migration remains
reversible independently of dependency and documentation cleanup.

Implemented and proposed commit sequence:

1. `test(ecs): add deterministic browser benchmarks`
2. `perf(three-flatland)!: migrate batching to the private ecs`
3. `docs(internal-ecs): record production migration evidence`
4. `refactor(three-flatland): remove koota peer dependency`
5. `docs(three-flatland): remove koota installation requirement`

The exact split follows diff cohesion. Conventional Commit metadata is authoritative under the
repository's current release policy; CI generates changesets from commit history. Agents do not
hand-write changesets. Private tooling changes are not release-visible.

## Phase 0: approved design and fresh baseline

- Resolve every review comment on this planning package.
- Rebase a clean implementation worktree onto current main.
- Record exact dependency and tool versions.
- Capture Koota size, kernel microbenchmark, and memory baselines before selecting the private runtime.
- Capture the full schedule and live-example baselines immediately before the production migration,
  so the comparison uses the exact core implementation being replaced.
- Confirm whether concurrent open PRs modify `src/ecs`, SpriteGroup scheduling, or dependency declarations.

Exit gate: kernel baseline report checked into the PR branch; no production runtime change yet. The
schedule/live baseline remains a mandatory migration gate rather than being implied by the kernel report.

## Phase 1: reference model and kernel competition

- Define the adapter semantics required by Flatland.
- Write one scenario suite that runs against Koota.
- Implement the three minimal candidate kernels behind the same adapter:
  - persistent sparse-set selectors,
  - signature-backed persistent selectors,
  - anchored scans.
- Measure schema/store variants using ordinary arrays and viable typed-array forms.
- Select the smallest candidate that passes end-to-end thresholds.
- Delete rejected prototype implementations from the production diff while preserving their results in the benchmark report.

Exit gate: selected design and evidence are reviewable before migration begins.

## Phase 2: private runtime with no production consumer

- Implement entity allocation/liveness, trait schema inference, stores, selectors, event queues, and disposal.
- Activate each world-owned event selector when the SpriteGroup initializes its system schedule,
  before any observed entity is enrolled.
- Add runtime and type tests.
- Add production bundle budget for the isolated kernel.
- Verify no entrypoint exports the runtime.

Exit gate: kernel tests, type tests, size gate, and reference scenarios pass.

## Phase 3: migrate traits and world ownership

- Replace Koota imports in `src/ecs/traits.ts`, world management, schedule types, and registry types.
- Migrate entity fields on `Flatland`, `SpriteGroup`, `Sprite2D`, material effects, light effects, and pass effects.
- Replace entity fluent methods with explicit world operations.
- Preserve direct store references and `_idx` behavior.
- Replace every numeric read in a frame/system path with one captured `world.store(Trait)` and direct
  indexed fields. A static audited gate rejects numeric `world.read` in hot paths; object reads must
  carry an explicit allocation-free allowlist marker.
- Replace every numeric `world.patch` in a frame/system path with direct captured-store writes and
  `world.touch` when tracking is required. Keep validated generic patching on cold control paths only,
  with an audited static gate enforcing the distinction.
- Replace tests that depend on `universe.reset()` with world-local cleanup.
- Omit the accidental public `world`, entity, effect `_trait`, and batch-query constructor ECS types
  from reachable declarations. Do not expose the private runtime as their replacement.

During this phase a private adapter module is the rollback boundary. Production files import runtime types/functions from one local location; reverting that adapter and call-site commit restores Koota without undoing the test harness.

Exit gate: full core package behavior passes with ordinary queries still semantically equivalent;
hot paths contain no numeric snapshot reads; packed public declarations expose neither Koota nor
the private runtime.

## Phase 4: compiled selectors and event queues

- Predeclare ordinary selectors used by frame systems.
- Replace inline query hashing and copied result arrays.
- Replace the three Koota tracker factories with explicit event selectors.
- Combine routing changes into one deduplicated selector with the `IsBatched` requirement.
- Verify event ordering and drain semantics against reference scenarios.
- Confirm no steady-state allocations.

Exit gate: lifecycle, routing, sort, transform, effect, lighting, and post-pass system tests pass; schedule benchmark passes.

## Phase 5: remove the relation engine

- Add `batchEntity` to `BatchSlot`.
- Add batch-owned packed-handle and direct sprite-reference arrays with `0`/`null` hole sentinels;
  maintain them atomically on allocate, swap, free, and recycle.
- Make transform sync iterate each batch's packed active-member table, following its physical-slot
  indirection only for the final GPU write; remove world-wide traversal and cross-buffer hopping.
- Make batch sorting consume the batch-owned slot map instead of scanning and rebucketing every
  batched entity from the world.
- Update assignment, reassignment, removal, recycle, and sort repair paths.
- Remove `InBatch` and every `targetFor`/relation-pair operation.
- Add hole traversal/reuse, atomic swap/free, stale generation, recycled entity/batch handle, and
  failed-assignment rollback tests.
- Verify the public batch-query facade remains unchanged.

Exit gate: relation-free runtime, coherent entity-to-batch/member-to-slot/slot-to-entity ownership,
batch-local packed transform traversal plus physical-row sort traversal, no world-wide rebucketing,
and all batch lifecycle tests pass.

## Phase 6: dependency and documentation cleanup

- Remove Koota from `three-flatland` peer dependencies.
- Remove Koota from the package build external list.
- Remove Koota from all `three-flatland` production and test imports.
- Remove Koota from install commands and requirements in the docs.
- Update comments and API docs that name Koota when they mean the internal store.
- Scan emitted `.js`, `.d.ts`, source maps, and package tarball for `koota`.
- Leave workspace catalog/minis alone where they use Koota directly.

Exit gate: a packed consumer installs and typechecks `three-flatland` without Koota.

## Phase 7: repository and live verification

- Core unit tests, typecheck, lint, and build.
- Affected workspace tests/builds through Nx.
- Package boundary checks.
- Representative Three.js and React example builds.
- Live WebGPU probes listed in the benchmark plan.
- Bundle attribution and final base-versus-head benchmark report.
- Documentation build and link check.

Exit gate: every hard acceptance threshold passes.

## Review sequence

1. Codex self-review against this plan and repository instructions.
2. Claude Opus high adversarial review of the full diff, benchmark claims, and reference-model coverage.
3. Independently reproduce or reject every reviewer claim.
4. Address all findings, including low-severity and documentation feedback.
5. Open or update the PR only after local verification is green.
6. Read all PR review threads, inline comments, bot comments, and check summaries.
7. Resolve comments only after the corresponding change or evidence is pushed.
8. Re-run the relevant benchmark and size proof after review-driven runtime changes.

## Rollback strategy

Before dependency removal, rollback is a revert of the production migration commit. After dependency
removal, the atomic commit structure allows reverting the cleanup and migration independently while
retaining the useful benchmark/reference harness.

Do not ship a runtime feature flag or dual ECS implementations. That would add bytes and double the state paths. The reversible boundary is the Git history and local adapter during development, not production configuration.

## Documentation impact

User-facing docs should say less, not more:

- remove Koota from installation,
- remove the peer requirement line,
- avoid marketing the private ECS as a feature,
- mention the bundle reduction in release notes only after measured,
- retain explanation of SpriteGroup batching in renderer terms rather than exposing storage internals.

Internal planning and code comments should document:

- selector mutation rule,
- tracked/untracked patch rule,
- entity handle/index distinction,
- event drain semantics,
- `BatchSlot` as the single assignment source of truth.

## Release classification

The rendered API does not intentionally break, and removing a required peer dependency is a
compatibility improvement. The emitted TypeScript surface does change: accidental ECS members are
removed rather than exposing the private runtime. The migration therefore uses a breaking
Conventional Commit with a `BREAKING CHANGE:` footer. CI derives the release changeset from that
commit history.

The declaration audit confirmed 24 built declaration leaves currently reference Koota. The migration
must remove those reachable references and prove the private runtime is not substituted into them.

## Explicit out of scope

- Rewriting the Breakout mini's application ECS.
- Publishing the internal runtime.
- Migrating unrelated application code that directly selected Koota.
- Combining this work with Glyph/Slug documentation changes.
- General cleanup of every renderer registry unless it is required for correctness or proven by this change's benchmark.

## Completion definition

The task is complete only when:

- the design has been approved,
- the selected kernel beats the evidence gates,
- core no longer depends on Koota,
- public behavior remains correct,
- published output and docs no longer require Koota,
- review feedback is fully addressed,
- the PR contains enough evidence to reproduce every performance and size claim.
