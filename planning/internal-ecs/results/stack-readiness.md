# Internal renderer modernization — stack readiness

Status: **ready for final human review**

Reviewed implementation and evidence tip: `2dfedc6f652459230d9bc655b824e6b10e0b0e1f`

Base: `bd19dd506f64cbb060e69148e01fc7b9ceb4bee8` (`origin/main`)

## Koota lineage

[Koota](https://github.com/pmndrs/koota) made this renderer design possible. Its typed traits,
structure-of-arrays storage, queries, and systems provided the foundation from which Flatland's
renderer-owned specialization grew. The private runtime is not a replacement for Koota: Koota remains
the recommended general-purpose ECS for application and gameplay state.

This attribution is a release invariant. `docs/AGENTS.md` defines the authoring rule, and
`privateArchitectureContract.test.ts` rejects public private-ECS material that drops the Koota link,
foundation statement, or continuing recommendation.

## Proposed pull-request stack

Each range is based on the previous row. The first three tips already exist on `origin`; the fourth is
the final local follow-up branch.

| Stack | Branch                                      | Exact range          | Purpose                                                                |
| ----- | ------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| 1     | `feat/internal-ecs-publish-cleanup`         | `bd19dd50..3decfb7b` | Production migration and deterministic fixtures                        |
| 2     | `feat/internal-ecs-migration`               | `3decfb7b..6547f8c5` | Material/capacity cleanup and publication boundary                     |
| 3     | `feat/internal-ecs-release-stack`           | `6547f8c5..a0035529` | Type-erased public boundary, migration/codemod, lifecycle hardening    |
| 4     | `feat/internal-ecs-data-oriented-followups` | `a0035529..HEAD`     | Pass graph, animation, tile, lighting, hierarchy, evidence, and audits |

Do not flatten the stack before review: the ranges preserve the implementation, API-boundary, and
follow-up performance narratives independently. Rebase each row onto its predecessor if an earlier
review changes a tip.

## Accepted follow-up conversions

The durable decision record is
[`09-private-ecs-evolution-ledger.md`](../09-private-ecs-evolution-ledger.md). It records every proposed
internal ECS capability before implementation, including rejected experiments.

| Area                          | Decision | Accepted result                                                                                   |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| Post-pass ownership           | Accepted | One package-private graph owns pass ordering, target routing, resize, execution, and disposal     |
| Animated tile playback        | Accepted | Dense typed clocks and dirty projection; 76.6–78.8% lower p50 in measured loads                   |
| Lighting storage              | Bounded  | Stale-tail clearing only; broad storage split rejected without evidence                           |
| Animated sprite playback      | Accepted | Shared immutable timelines plus dense membership; 25.5–38.6% lower p50 at accepted measured loads |
| Hierarchy traversal           | Accepted | Cached shared-parent paths; neutral direct roots, 4–11.6% gains for supported shared paths        |
| Blanket enrolled playback SoA | Rejected | The prototype was slower and was removed                                                          |

Raw Labs captures, source revisions, hashes, and hardware provenance are preserved in
`conversion-labs-evidence.tar.gz`. The final checksum table is in
[`final-evidence-manifest.md`](./final-evidence-manifest.md).

## Review and release gates

- `three-flatland` package test, typecheck, typed lint, production build, declaration reachability,
  module boundary, EventNode patch, and test-artifact checks pass.
- The private benchmark package passes typecheck, typed lint, 142 deterministic tests, and both real
  Labs CLI contract tests. The Labs contract requires local process/IPC permission in restricted
  sandboxes.
- Shipped runtime plus capacity is `10,954 / 3,887 / 3,529 B` minified/gzip/Brotli, below the
  `12,000 / 4,000 / 3,800 B` caps.
- The accepted consumer budget was captured cleanly at `00206b54` and reproduced with zero deltas at
  `969b677d`.
- All 28 Three/R3F example and starter surfaces pass build, typecheck, and typed lint. They were
  relaunched serially with Chrome/WebGPU and visually reviewed at `158e5100`.
- Docs pass the mini-breakout prerequisite, Astro check, and the full 503-page production build.
- `changeset status --since=origin/main` parses and includes the expected `three-flatland` minor
  release. Existing changesets preserve Koota attribution and the alpha breaking-change summary.
- The standalone [API audit](./api-audit.html) approves the alpha boundary and records the remaining
  pre-stable declaration-hygiene review.

## Evidence boundaries

- Historical kernel and headed-browser comparisons remain foundational evidence for the private
  runtime. Later follow-up conversions have their own clean Labs captures and consumer recertification.
- Node renderer medians are diagnostic topology/ownership evidence. Statistical timing verdicts use
  pinned `@pmndrs/labs` adaptive sampling; the final production comparison did not establish a renderer
  regression.
- The browser matrix and public API audit do not claim that the private runtime supersedes Koota.
- No remote CI or pull-request status is asserted here. The branch ranges are locally green and ready
  to be pushed/opened for final human review.

## Final reviewer checklist

1. Review the four ranges in order and keep Stack 4 based on Stack 3.
2. Confirm intentional alpha breaks against the migration guide and effect-vector codemod.
3. Inspect the API audit, final evidence manifest, example smoke summary, and evolution ledger.
4. Confirm every public explanation of the private renderer architecture preserves Koota attribution.
5. Run the affected CI matrix after the branches are pushed; do not rerun the multi-hour browser
   benchmark matrix unless runtime or benchmark fixture code changes.
