# Internal ECS migration and rollout plan

Status: implementation in progress — design and first evidence gate approved

Date: 2026-08-22

## Branch and PR shape

Work begins in a clean worktree rebased onto the then-current `origin/main`. Do not use the Driller branch or the camera stack worktrees.

Delivery uses a small five-PR stack so CodeRabbit and human reviewers can assess one claim at a time:

1. Design and migration contract, targeting `main`.
2. Differential, size, storage, and performance evidence, targeting PR 1.
3. Private typed runtime with no production consumer, targeting PR 2.
4. Core migration, compiled event/selectors, and direct batch ownership, targeting PR 3.
5. Koota removal, documentation, representative-consumer size gates, and live verification, targeting PR 4.

Only PR 5 removes Koota. Earlier PRs remain inert or private, giving the stack a clean rollback boundary while keeping each review focused.

Proposed commit sequence:

1. `test(three-flatland): add ecs reference and benchmark harnesses`
2. `feat(three-flatland): add private typed entity runtime`
3. `refactor(three-flatland): migrate traits and entity operations`
4. `perf(three-flatland): migrate selectors and routing event queues`
5. `perf(three-flatland): replace batch relation with direct slot ownership`
6. `refactor(three-flatland): remove koota peer dependency`
7. `docs(three-flatland): remove koota installation requirement`

The exact split follows diff cohesion. Every package change receives a hand-written changeset under
the repository's current release policy. This includes the private `tools/ecs-bench` package because
private and out-of-`packages/` workspaces are not discovered by the historical generator.

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
- Add runtime and type tests.
- Add production bundle budget for the isolated kernel.
- Verify no entrypoint exports the runtime.

Exit gate: kernel tests, type tests, size gate, and reference scenarios pass.

## Phase 3: migrate traits and world ownership

- Replace Koota imports in `src/ecs/traits.ts`, world management, schedule types, and registry types.
- Migrate entity fields on `Flatland`, `SpriteGroup`, `Sprite2D`, material effects, light effects, and pass effects.
- Replace entity fluent methods with explicit world operations.
- Preserve direct store references and `_idx` behavior.
- Replace tests that depend on `universe.reset()` with world-local cleanup.

During this phase a private adapter module is the rollback boundary. Production files import runtime types/functions from one local location; reverting that adapter and call-site commit restores Koota without undoing the test harness.

Exit gate: full core package behavior passes with ordinary queries still semantically equivalent.

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
- Update assignment, reassignment, removal, recycle, and sort repair paths.
- Remove `InBatch` and every `targetFor`/relation-pair operation.
- Add stale/recycled batch handle tests.
- Verify the public batch-query facade remains unchanged.

Exit gate: relation-free runtime, no duplicate assignment source of truth, all batch lifecycle tests pass.

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

Before dependency removal, rollback is a call-site revert to the Koota adapter. After dependency removal, the atomic commit structure allows reverting phases 3–6 together while retaining the useful benchmark/reference harness.

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

The user-facing API does not intentionally break. Removing a required peer dependency is a compatibility improvement. The hand-written changeset must classify the actual compatibility impact—likely patch or minor unless the declaration scan finds a public type break. The Conventional Commit describes commit intent; it does not replace or determine the changeset.

If emitted public types currently expose Koota `World`, `Entity`, or `Trait`, that is an accidental public type dependency. The declaration scan must identify it before implementation. If removing it changes a documented public type, classify the release according to the actual public compatibility impact rather than assuming it is non-breaking.

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
