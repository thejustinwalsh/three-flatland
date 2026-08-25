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
- A production-only `@pmndrs/labs` lane supplies the trusted Node renderer timing verdict with
  isolated workers, adaptive confidence sampling, CPU-clock checks, and statistical comparisons.
- A separate numeric-storage harness compares ordinary arrays, fixed typed arrays, and typed arrays
  behind a stable growable wrapper, including reference-stability and growth behavior.
- The browser harness runs deterministic Knightmark or lighting fixtures against one or two
  production preview servers. It validates the applied seed, fixed timestep, Knightmark collision
  mode, requested entity counts, and exact committed batch counts before recording RAF callback intervals,
  late-callback rates, sample-window long tasks, Chromium heap boundaries, browser diagnostics, and
  opt-in ECS timing markers.

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
pnpm nx run @three-flatland/ecs-bench:benchmark:labs:smoke
pnpm nx run @three-flatland/ecs-bench:benchmark:renderer --args='--quick'
pnpm nx run @three-flatland/ecs-bench:benchmark:browser --args='--help'
```

Use `--adapter=koota`, `--adapter=flatland-runtime`, `--adapter=sparse-persistent`,
`--adapter=signature-persistent`, or `--adapter=anchored-scan` to isolate one implementation. Both
benchmark commands accept `--output=<path>` to preserve the raw JSON report.

Wall-clock results are comparative evidence, not a deterministic CI test. The scenario suite,
type checks, and later bundle budgets are deterministic gates.

## Trusted renderer timing with Labs

`benchmark:labs:*` runs the production `SpriteGroup` frame through `@pmndrs/labs` 0.6.0. This is
the statistical Node timing lane. It covers static, moving alpha/depth, transparent sorting, and
12,000 routing changes at 16,384 sprites, plus static and moving alpha/depth at 60,000 sprites.
Every case runs in an isolated worker and uses inner GC. Fixture creation, initial assignment,
topology assertions, next-frame mutations, and teardown are outside the measured callback; only
`group.update()` is measured.

The runner refuses development, `FL_PROFILE=true`, or `FL_DEVTOOLS=true` execution so User Timing
and devtools instrumentation cannot contaminate a production verdict. The checked-in config uses
adaptive 0.5% log-space confidence sampling, at least 5 seconds and 100 samples per case, a
30-second ceiling, Mann-Whitney U at `alpha=0.05`, a 3% practical-delta floor, and
`|Cliff's d| >= 0.474`. Labs raises the effective practical threshold above 3% when a distribution
is noisy. A faster/slower verdict therefore requires statistical significance, practical magnitude,
and effect size together; raw median movement alone is not a verdict.

Run the smoke target after editing the fixture. It exercises the real static 16,384-sprite case with
a deliberately short fixed sample budget and saves nothing. The wrapper redirects Labs to a fresh
temporary results directory, then verifies both that directory and the trusted `.labs` state are
unchanged before discarding it:

```sh
pnpm nx run @three-flatland/ecs-bench:benchmark:labs:smoke
```

Smoke output proves that discovery, setup, measurement, teardown, and GC work. It is not performance
evidence. For an A/B, freeze the benchmark source, use the same idle host and Node runtime, avoid
concurrent browser/GPU captures, and run the baseline before changing the implementation:

```sh
pnpm nx run @three-flatland/ecs-bench:benchmark:labs:baseline \
  --args='-n renderer-before'

# Switch to the candidate while keeping the benchmark/config identical.
pnpm nx run @three-flatland/ecs-bench:benchmark:labs:compare \
  --args='-n renderer-after'
```

`benchmark:labs:save` records a named run without replacing an existing baseline (Labs makes the
first saved result the baseline when none exists). All Labs targets disable Nx caching; saved local
observations live in the ignored `tools/ecs-bench/.labs/` directory. Reject
missing/noisy comparisons and clock-drift or clock-mismatch warnings rather than promoting them to
release evidence. Alternate old-first/head-first order when repeating a pair. If the older revision
predates this fixture, apply the exact same benchmark-only commit to both comparison worktrees and
record its hash with both source revisions.

Every saved run automatically embeds the full source revision, dirty state, installed Labs version,
and SHA-256 hashes of the lockfile, Labs config, renderer fixture, and provenance runner in its
description; Labs records the CPU, clock, OS, architecture, and Node runtime in the result itself.
Only clean runs with identical lock/config/fixture/runner hashes are eligible for comparison evidence.
Use `--args='-m context'` to append a human note without replacing that provenance.
`@pmndrs/labs` 0.6.0 requires Node 25 or newer; the rest of this workspace retains its Node 24 floor.
The baseline and compare targets refuse dirty trees, smoke sampling, and a baseline whose Labs,
lockfile, config, fixture, or runner hash differs from the candidate.

Labs answers whether whole production frames differ. It does not replace the deterministic renderer
harness below, which remains authoritative for topology, ownership, memory lifecycle, buffer-call
boundaries, per-system attribution, and provenance. Its instrumented wall-time medians are diagnostic
clues only and must not overrule a neutral Labs comparison.

### Animated-sprite playback slice

The same trusted Labs configuration includes `@animation-playback`: explicit
`AnimatedSprite2D.update(deltaMs)` over 1,000, 16,384, and 60,000 sprites sharing one four-frame
definition. Construction, assertions, disposal, and texture teardown remain outside the measured
callback. This slice exists to judge the private playback-state migration; it does not replace the
renderer-frame cases or claim that application simulation is renderer-owned.

Run an unsaved development smoke with `@animation-smoke`. For evidence, use the provenance wrapper
directly so both sides retain identical fixture/config hashes:

```sh
NODE_ENV=production FL_DEVTOOLS=false FL_PROFILE=false \
  node --import tsx tools/ecs-bench/src/labs-run.ts '@animation-playback' --baseline \
  -n animation-before

NODE_ENV=production FL_DEVTOOLS=false FL_PROFILE=false \
  node --import tsx tools/ecs-bench/src/labs-run.ts '@animation-playback' --compare \
  -n animation-after
```

Flatland's private ECS design was made possible by
[Koota](https://github.com/pmndrs/koota), whose typed-trait, SoA, query, and system model established
the architectural foundation. This benchmark evaluates a renderer-specialized internal path; Koota
remains the recommended general-purpose ECS for application and gameplay state.

### Tile-animation slice

`@tile-animation` measures `TileLayer.update(deltaMs)` with 1,000, 16,384, and 60,000 animated tiles
spread across 16 shared base animations and multiple chunks. Layer construction, projection
assertions, disposal, and texture teardown stay outside the measured callback. The fixture tests a
layer-local data-oriented projection; it does not move tile topology into the sprite ECS.

Capture the unchanged object-state path before implementing a candidate, then compare with the same
provenance wrapper and frozen fixture:

```sh
NODE_ENV=production FL_DEVTOOLS=false FL_PROFILE=false \
  node --import tsx tools/ecs-bench/src/labs-run.ts '@tile-animation' --baseline \
  -n tile-animation-before

NODE_ENV=production FL_DEVTOOLS=false FL_PROFILE=false \
  node --import tsx tools/ecs-bench/src/labs-run.ts '@tile-animation' --compare \
  -n tile-animation-after
```

This experiment carries the same explicit Koota legacy: Koota's typed traits, SoA layout, and query
model made Flatland's private specialization possible. Koota remains the recommended choice for
general-purpose application and gameplay ECS state.

## Representative consumer bundle attribution

The consumer bundle gate builds four production-shaped entry points: basic Three.js, basic React
Three Fiber, Knightmark-style batching, and pass/lighting with dynamic effect traits. Each fixture is
bundled unchanged against current `three-flatland` source and against the direct parent of the commit
that migrated production batching from Koota
(`58bf83781dfc4c854f6c2dca09e57024a012815a`). Both sides use the current locked Three.js, React,
React Three Fiber, workspace dependencies, esbuild, compression, and minifier settings. The paired
result is therefore the net package-source change seen by the same consumer, not an estimate formed
by adding Koota to the current runtime.

Build the published package first, then capture from a clean source tree:

```sh
pnpm nx run three-flatland:build
node --import tsx tools/ecs-bench/src/measure-consumer-bundles.ts \
  --output=/private/tmp/three-flatland-consumer-bundles-$(git rev-parse --short=12 HEAD)
```

Omit `--output` to create a unique directory under the operating system's temporary directory. The
harness refuses an output path inside the repository and refuses a non-empty output directory. Every capture emits the
minified bundles, raw esbuild metafiles, and a JSON report containing exact minified, gzip, and
Brotli sizes; source, fixture, harness, baseline, and lockfile hashes; exact tool versions; and both
full Git revisions.

A passing definitive capture proves that the historical graph retains Koota and omits the private
runtime; the current graph has the reverse attribution; Koota is absent from current source and
published output; and the private runtime is retained in exactly one output per fixture. The
combined shipped runtime and optional capacity module have a separate 12,000 B minified / 4,000 B
gzip / 3,800 B Brotli hard cap. The isolated seven-export Koota bundle must still match the recorded
34,910 B minified / 10,584 B gzip / 9,362 B Brotli number, but that value is a dependency-attribution
diagnostic only.

The pinned pre-migration comparison is exact but report-only. It spans every package-source change
reachable by each fixture between the historical revision and current source, so the report labels
the result `all-smaller`, `all-larger`, `unchanged`, or `mixed` without presenting it as an isolated
ECS saving.

Current consumer growth is gated by the reviewed, versioned budget at
`planning/internal-ecs/results/consumer-bundle-budget.json`. It records each fixture ID, source hash,
absolute minified/gzip/Brotli maxima, source revision and hashes, and tool versions. A one-byte growth
in any metric fails; smaller results pass without modifying or silently ratcheting the accepted
maximum. Missing or extra fixtures and fixture source/hash drift also fail.

Use `--allow-dirty` only while changing the harness. Supplying it always labels the capture
`smoke-dirty`, even when the working tree happens to be clean, so an explicit smoke run cannot become
release evidence accidentally. Every run writes `accepted-current-budget.candidate.json` beside the
report. A dirty candidate records that state and is ineligible for acceptance.
Any candidate from an explicit smoke capture is also ineligible, even if its source tree happened to
be clean.

The first clean frozen-source run writes its artifacts and then fails as `pending` until a reviewer
copies the inspected candidate to the accepted budget path. After committing the reviewed artifact
and returning to a clean tree, re-run to prove the accepted fixture set, hashes, provenance, and byte
maxima. Future budget changes use the same explicit capture-review-copy-commit
cycle; the harness never edits the accepted artifact. The initial frozen-source budget is accepted;
the latest clean verification reproduced zero-byte deltas across all four fixtures.

## Node renderer schedule evidence

`benchmark:renderer` runs the production `SpriteGroup`, private runtime, and `SystemSchedule`
directly in Node. It covers static sprites, moving alpha-test sprites, transparent sorting, 12,000
routing changes, 10% add/remove churn, dynamic-effect churn, a mixed scene, and multiple independent
worlds. The raw report includes total and per-system durations, a separately captured buffer-call
topology summary, and a
full ownership check across packed handles, `BatchSlot`, stable batch members, physical rows, sprite
references, and registry lookup entries.

Use quick mode while changing the harness:

```sh
pnpm nx run @three-flatland/ecs-bench:benchmark:renderer --args='--quick'
```

Quick mode is a smoke test at 64 sprites. It uses a tiny fixed capacity that creates roughly four
batches per one-run case, ensuring traversal-order assertions exercise batch boundaries. Its report
says `smoke-measured`; its artificial batching topology is not performance or merge evidence.

Non-quick cases construct `SpriteGroup` without a `maxBatchSize` override and therefore exercise the
production tier ladder: a bulk 16,384-sprite, one-material run commits one batch, while 60,000 sprites
commit four. The harness records and asserts the expected initial committed count before measuring.
There is no separate forced-4,096 stress mode in this harness. The default workload uses five warm-up
frames and ten measured frames per case:

```sh
pnpm nx run @three-flatland/ecs-bench:benchmark:renderer \
  --args='--output=/private/tmp/flatland-renderer-16384.json'
```

Add the optional 60,000-sprite scale point only on a machine with enough memory:

```sh
pnpm nx run @three-flatland/ecs-bench:benchmark:renderer \
  --args='--include-60000 --output=/private/tmp/flatland-renderer-full.json'
```

The target always starts Node with `--expose-gc`. Memory evidence runs first in dedicated lifecycle
contexts, before topology summaries or timing samples exist. It clears User Timing entries before
every heap boundary, forces collection before create, after setup, and after disposal, and reports
active, create peak, and the post-disposal retained delta after yielding one event-loop turn. The
default evidence run repeats the complete create/dispose cycle three times and records every
active/retained boundary so heap stabilization is inspectable; `--memory-cycles=N` overrides it. A missing GC hook is recorded as
`unavailable`, never silently treated as a measurement. The generator deliberately leaves
`status.definitiveCapture` as `pending` and a non-quick observation as `measured-unreviewed`; it
cannot approve its own output. Review and acceptance are recorded in
`planning/internal-ecs/05-baseline-and-kernel-decision.md` when the complete raw result is copied into
`planning/internal-ecs/results/`. The 60,000-sprite observation is emitted only when
`--include-60000` ran.

The transition probe wraps existing batch-buffer methods and the private ownership adapter only for
one separate topology-validation frame per case. That frame is not included in timing or memory
samples: the harness summarizes its transitions, clears the event queue, restores every wrapper,
and only then forces GC and starts warm-up/measurement. It does not instrument production source.
Transform, sort, and dirty-buffer traversal
must not return to a batch after advancing to another; routing/assignment transitions are reported
but are not subject to that traversal invariant because they intentionally move individual owners
between batches. Source-level provenance includes Git revisions, dirty state, host details, the
lockfile hash, per-source SHA-256 values, and an aggregate source hash.

These Node totals are instrumented diagnostics: the schedule emits User Timing spans. The separate
topology frame observes buffer boundaries without contaminating those totals or retained-heap
samples. The results are useful for per-system attribution and regression
diagnosis, but they do not issue the statistical timing verdict. Use the uninstrumented Labs lane for
trusted Node comparison and the ordinary uninstrumented browser production pair for the real-world
merge-timing gate.
Non-quick runs reject a dirty source tree so a definitive-looking report cannot be detached from its
recorded source hashes.

## Browser benchmark

Build and preview the same example from clean base and head worktrees on separate ports. Apply the
fixture-only evidence patch from head to base; only the implementation under comparison may differ.
Ordinary production builds provide merge timing. Rebuild both with `FL_PROFILE=true` only for
per-system diagnostics.

Set the worktree paths, then build an ordinary production pair:

```sh
BASE_WORKTREE=/absolute/path/to/base-worktree
HEAD_WORKTREE=/absolute/path/to/head-worktree
EVIDENCE_FIXTURE_COMMIT=FULL_40_CHARACTER_FIXTURE_COMMIT_SHA
EVIDENCE_OUTPUT_DIR=/private/tmp/three-flatland-evidence
mkdir -p "$EVIDENCE_OUTPUT_DIR"
git -C "$HEAD_WORKTREE" diff-tree --no-commit-id --name-only -r "$EVIDENCE_FIXTURE_COMMIT"
git -C "$BASE_WORKTREE" cherry-pick "$EVIDENCE_FIXTURE_COMMIT"
BASE_REVISION="$(git -C "$BASE_WORKTREE" rev-parse HEAD)"
HEAD_REVISION="$(git -C "$HEAD_WORKTREE" rev-parse HEAD)"

FL_BENCHMARK_EVIDENCE=true FL_DEVTOOLS=false FL_PROFILE=false \
  pnpm --dir "$BASE_WORKTREE" --filter=example-three-knightmark build
FL_BENCHMARK_EVIDENCE=true FL_DEVTOOLS=false FL_PROFILE=false \
  pnpm --dir "$HEAD_WORKTREE" --filter=example-three-knightmark build
```

Start each preview in its own terminal:

```sh
pnpm --dir "$BASE_WORKTREE" --filter=example-three-knightmark preview --host 127.0.0.1 --port 4173
```

```sh
pnpm --dir "$HEAD_WORKTREE" --filter=example-three-knightmark preview --host 127.0.0.1 --port 4174
```

Run the harness from the clean head worktree. Target revisions must be the full 40-character SHAs
derived above:

```sh
pnpm --dir "$HEAD_WORKTREE" --filter @three-flatland/ecs-bench benchmark:browser \
  --target=base=http://127.0.0.1:4173@${BASE_REVISION} \
  --target=head=http://127.0.0.1:4174@${HEAD_REVISION} \
  --example=knightmark --variant=three \
  --counts=1000,5000,10000,15000,20000,25000,30000,35000,40000,50000,60000 \
  --collisions=0 --profile=0 \
  --output=${EVIDENCE_OUTPUT_DIR}/knightmark.json
```

After the coarse sweep, rerun with 1,000-sprite increments spanning the first passing-to-failing
band. For example, if 30,000 passes and 35,000 fails, use `--counts=31000,32000,33000,34000` with
the otherwise identical command. The largest count with at most 5% late RAF callbacks against the
60 Hz callback budget is the reported browser CPU-cadence crossover.

The complete ordinary-production matrix requires separate artifacts for both Knightmark collision
modes and both renderers. Repeat the command with `--collisions=1` and distinct output names such as
`knightmark-three-collisions-off.json` and `knightmark-three-collisions-on.json`; then rebuild and
preview `example-react-knightmark`, change `--variant=react`, and capture the same two modes. Run the
coarse sweep and the 1,000-sprite crossover refinement for all four artifacts.

Lighting likewise requires Three and React captures. Build and preview the matching lighting pair,
set `--example=lighting --variant=three|react`, and capture both `--lights=0` and a documented bounded
light load, using the slime counts `1000,5000,10000,20000,30000,40000`. The 40,000-slime result must
therefore measure sprite scaling without accidentally creating 40,000 lights. Use distinct artifact
names for renderer and light count. Repeat the full matrix in profile mode for diagnostic system
timings; ordinary production remains the merge gate.

Each fixture publishes the adapter identity from the initialized renderer's actual WebGPU backend
device. The harness rejects missing or redacted identities and requires that same normalized adapter
across every base/head control and observation; it does not infer renderer identity from a separate
`navigator.gpu.requestAdapter()` call.

`EVIDENCE_FIXTURE_COMMIT` identifies the exact fixture-only patch applied to base. Its file list may
contain the two `examples/_shared/benchmark*.ts` sources and the selected benchmark example
directories, but no runtime implementation changes. If that commit is already present on base, skip
the `cherry-pick`. For a profile pair, rebuild both worktrees, restart the two previews with the same
preview commands, and run the harness with `--profile=1`:

```sh
FL_BENCHMARK_EVIDENCE=true FL_DEVTOOLS=false FL_PROFILE=true \
  pnpm --dir "$BASE_WORKTREE" --filter=example-three-knightmark build
FL_BENCHMARK_EVIDENCE=true FL_DEVTOOLS=false FL_PROFILE=true \
  pnpm --dir "$HEAD_WORKTREE" --filter=example-three-knightmark build
```

Profile mode requires `ecs:run` and every expected renderer-system span at approximately one marker
per sampled frame. Production mode rejects timing markers, catching an instrumented artifact before
its overhead is mistaken for merge timing. Replace the package filter, example, and variant together
for React or lighting captures.

`FL_BENCHMARK_EVIDENCE=true` is required: it rejects a dirty build worktree, requires
`FL_DEVTOOLS=false`, and embeds the revision returned by `git rev-parse HEAD`. Readiness records the
applied devtools/profile flags and the harness rejects either devtools-enabled evidence or a profile
flag that differs from `--profile`. `VITE_FLATLAND_BENCHMARK_REVISION` is optional and assertion-only.
When supplied, it must equal Git's revision or the build fails; it cannot choose or override the
embedded revision.

Each evidence build also embeds a fixture-source SHA-256 over
`examples/_shared/benchmark.ts`, `examples/_shared/benchmark-vite.ts`, and every Git-tracked file
under the selected example directory. The control pass rejects base/head fixture hashes that differ
before the measured matrix starts. The report records the common hash as `fixture.fixtureSourceSha256`
and sets `fixture.fixtureSourceParityVerified` only after every target's control capture agrees.

Keep every in-progress capture outside both source worktrees. Writing a report under `planning/`
would dirty the harness worktree and cause its clean-tree guard to reject the next observation. After
the complete matrix passes, copy the finalized artifacts into `planning/internal-ecs/results/`
together as the final evidence update.

Each observation uses a fresh Chromium process at 1280×720 and DPR 1. The harness takes 180 warmup
frames and 600 measured frames by default. With two targets it alternates A/B, B/A, A/B. Presented
frame results use an explicit 16.667 ms 60 Hz budget; an interval above 25.0005 ms counts as missed
vsync. The low-load control remains a diagnostic reference and does not redefine that budget.
Simulation is paused at the exact in-page warmup and sample boundaries while Chromium heap telemetry
is read, so protocol round trips cannot advance one target farther than another.
Lighting uses `--example=lighting --lights=N`; the `lights` value controls actual `Light2D` creation
independently from the slime count.

Warning/error console messages, page errors, crashes, marker failures, observation-shape failures,
and fixture-parity failures are written into the incomplete report and then fail the run. Long tasks
are filtered by their start time so warmup entries delivered late by
`PerformanceObserver` cannot enter the measured window. Reports include Chromium's
`Performance.JSHeapUsedSize` after warmup and after sampling without forced garbage collection.
Those two boundaries are diagnostic telemetry, not retained-heap or peak-heap evidence.
Capture-frame waits have a three-minute deadline, and browser teardown has a bounded two-minute
deadline. This prevents a blocked WebGPU process from stranding the run indefinitely while giving a
high-memory renderer enough time to release its resources.
Each report also records the Three.js and react-three-fiber catalog specifiers, their exact resolved
versions from `pnpm-lock.yaml`, and the lockfile SHA-256.

Nx treats the parent `examples` project as an implicit dependency of the four Knightmark and lighting
fixtures. Changes to either shared benchmark source therefore invalidate `build`, `typecheck`, and
`lint` for all four projects.
