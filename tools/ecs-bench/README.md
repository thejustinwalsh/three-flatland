# Flatland ECS evidence harness

This private workspace tool compares the exact entity-store behavior and hot paths used by
`three-flatland`. It is test infrastructure, not a public ECS package, and it is not reachable from
published package entrypoints.

## What it proves

- One independent, deliberately simple reference model defines the intended Flatland contract.
- A Koota 0.6.5 adapter records the current behavior, including explicitly classified differences.
- Three benchmark-only candidate kernels run behind the same adapter and scenario suite.
- The Koota size probe bundles exactly the seven runtime imports used by Flatland with browser ESM
  tree shaking and minification.
- The benchmark records raw observations, median, p95, operation counts, warm-ups, tool versions,
  machine details, and the tested base commit.
- A separate numeric-storage harness compares ordinary arrays, fixed typed arrays, and typed arrays
  behind a stable growable wrapper, including reference-stability and growth behavior.

The candidates are evidence prototypes. The selected production runtime is implemented separately
inside `packages/three-flatland/src/ecs/runtime` and must pass the same contract before migration.

## Commands

From the repository root:

```sh
pnpm nx test @three-flatland/ecs-bench
pnpm nx run @three-flatland/ecs-bench:typecheck
pnpm nx run @three-flatland/ecs-bench:baseline:size
pnpm nx run @three-flatland/ecs-bench:benchmark --args='--quick'
pnpm nx run @three-flatland/ecs-bench:benchmark
pnpm nx run @three-flatland/ecs-bench:benchmark:storage
```

Use `--adapter=koota`, `--adapter=sparse-persistent`, `--adapter=signature-persistent`, or
`--adapter=anchored-scan` to isolate one implementation. Both benchmark commands accept
`--output=<path>` to preserve the raw JSON report.

Wall-clock results are comparative evidence, not a deterministic CI test. The scenario suite,
type checks, and later bundle budgets are deterministic gates.
