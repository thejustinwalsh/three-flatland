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
- The browser harness runs deterministic Knightmark or lighting fixtures against one or two
  production preview servers. It validates the requested entity counts before recording frame
  intervals, missed-vsync rates, long tasks, and opt-in ECS timing markers.

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
pnpm nx run @three-flatland/ecs-bench:benchmark:browser --args='--help'
```

Use `--adapter=koota`, `--adapter=flatland-runtime`, `--adapter=sparse-persistent`,
`--adapter=signature-persistent`, or `--adapter=anchored-scan` to isolate one implementation. Both
benchmark commands accept `--output=<path>` to preserve the raw JSON report.

Wall-clock results are comparative evidence, not a deterministic CI test. The scenario suite,
type checks, and later bundle budgets are deterministic gates.

## Browser benchmark

Build and preview the same example from the base and head worktrees on separate ports. Ordinary
production builds provide the merge timing. Rebuild both with `FL_PROFILE=true` only when collecting
per-system diagnostics; do not compare a profile build with an uninstrumented build.

```sh
pnpm nx run @three-flatland/ecs-bench:benchmark:browser --args='\
  --target=base=http://127.0.0.1:4173@BASE_SHA \
  --target=head=http://127.0.0.1:4174@HEAD_SHA \
  --example=knightmark --variant=three \
  --counts=1000,5000,10000,20000,30000,40000,60000 \
  --collisions=0 --output=../../planning/internal-ecs/results/knightmark.json'
```

Each observation uses a fresh Chromium process at 1280×720 and DPR 1. The harness takes 180 warmup
frames and 600 measured frames by default. With two targets it alternates A/B, B/A, A/B. The low-load
control establishes the nominal refresh interval used for the missed-vsync threshold. Lighting uses
`--example=lighting --lights=N`; the `lights` value controls actual `Light2D` creation independently
from the slime count.
