# Binary Artifact Unification — spec

**Status:** approved 2026-07-18. Execute against this doc.
**Goal:** one shared "build-once, commit, reuse, rebuild-only-on-change" treatment for every buildable binary/generated artifact in the repo — no per-package script duplication, package boundaries respected. Kill the skia outlier where the WASM toolchain runs on every CI build.

## The inventory (full sweep)

### Class A — Portable WASM (Zig → `wasm32-wasi` + `wasm-opt`). Commit-once-rebuild-on-change fits perfectly.
| Artifact | Package | Size | Today |
| --- | --- | --- | --- |
| `lib/skia-gl.wasm` | `packages/skia` | 3.2M | **rebuilt every CI run** — the outlier |
| `lib/skia-wgpu.wasm` | `packages/skia` | 2.6M | rebuilt every CI run |
| `lib/wasi_snapshot_preview1.wasm` | `packages/skia` | small | committed, static (shim) |
| `libs/basis/basis_encoder.wasm` | `packages/image` | 2.5M | **already committed** ✅ (exemplar) |
| `libs/basis/basis_transcoder.wasm` | `packages/image` | 927K | already committed ✅ |

`packages/image` is the exemplar: `build: tsdown` consumes committed wasm, a **separate** `build:wasm: zig build` regenerates them, wasm lives in `libs/`, `files: [dist, libs]`, **CI never rebuilds them**. skia is the only package still dragging Zig+Emscripten+submodule onto every build.

### Class B — Native per-platform binaries. Explicitly EXCLUDED from commit-to-git.
| Artifact | Spread | Origin |
| --- | --- | --- |
| `codelens-service` (Rust) | 6 targets: darwin arm64/x64, linux x64/arm64, win32 x64/arm64 | CI-built per-platform, gitignored → one universal VSIX |
| `node-web-audio-api.*.node` | 7 npm prebuilt addons (~40M) | npm-prebuilt, all shipped, runtime-selected |

A Rust binary can't be built for all 6 triples from one runner (why `build-vscode-vsix.yml` uses 6 OS runners). Committing ~90M of per-triple binaries buys a cache at the cost of large git churn **and** a cross-platform lockstep-staleness problem WASM doesn't have — you'd still need the 6-runner matrix to regenerate on change. Current matrix→universal-VSIX design is correct; leave it. Marginal-only win: hash-gate the Rust matrix to skip cargo when `sidecar/` unchanged (`Swatinem/rust-cache` already covers most of it).

### Class C — Baker outputs. Deterministic, committed, examples consume them (build doesn't re-bake). Same shape as Class A.
| Artifact | Baker |
| --- | --- |
| `examples/*/slug-text/public/*.slug.glb` (Inter 3.5M, fa-solid 1.7M) | `scripts/bake-example-fonts.ts` |
| dungeon normal maps | `scripts/bake-dungeon-normals.ts` |
| `examples/*/batch-demo/.../sprites.atlas.json` | atlas baker |
| docs brand-icon / noise | `docs/scripts/bake-*.mjs` |

**Out of scope:** `.webm` captures, source fonts/sprites, vendored C++ (`vendor/basisu`, freetype).

## The unified treatment — two shared layers, package-local commands

Classes A and C already follow "commit + rebuild-on-change" de facto (image, all bakers). "Unify" = formalize that pattern and pull skia into it.

### Layer 1 — Shared NX convention (the *when-to-rebuild* oracle)
Each artifact producer is a **cacheable NX target** (`build:wasm`, `bake:*`) with:
- `inputs`: source globs + toolchain version (already in-tree: `package.json` `skiaDependencies`, `build.zig.zon`) + `{ "runtime": "git rev-parse HEAD:<submodule>" }` for submodule SHA.
- `outputs`: the **committed** artifact path (`lib/`, `libs/`, the baked asset).
- The plain `build` consumes the committed artifact and never recompiles (image already does this; skia converges).

NX's content hash IS the "strong fingerprint." Local cache is free; CI persists `.nx/cache` via `actions/cache` (already wired). Do NOT adopt the deprecated `@nx/*-cache` packages (CVE-2025-36852).

### Layer 2 — One parametrized reusable CI workflow
`.github/workflows/commit-artifact.yml` (`workflow_call`), inputs: `package`, `nx-target`, `paths` (change filter), `setup` (which toolchain), `artifact-glob` (what to commit). Behavior:
1. Path-filter / nx-hash → decide if a rebuild is needed.
2. If needed: set up the package's toolchain → run the nx target → commit the artifact back via `GITHUB_TOKEN` (does **not** retrigger CI) → upload artifact for the current run's downstream jobs.
3. If not: no-op; committed artifact is used.

The **build command stays in each package** (skia `build-wasm.mjs`, image `zig build`, `bake-*.ts`) — boundaries respected. Only the orchestration is defined once.

## Per-package application

- **skia** (Class A) — converge to image's model. Finish the `dist/skia-*/` → `lib/` relink; add the `build:wasm` NX target; `build` no longer `--ensure`-compiles (consumes committed `lib/`). Drop submodule/Zig/`.tools` from the common `build.yml`; the reusable workflow rebuilds+commits only on skia-native change. **Instance #1.**
- **image** (Class A) — already commits `libs/basis/*.wasm`. Add the `build:wasm` NX target + `nx` config parity so it's part of the same convention; optionally adopt the reusable workflow for its (rare) rebuilds. Low touch.
- **bakers** (Class C) — expose `scripts/bake-*` as NX targets with inputs (source asset + baker script) and outputs (the committed baked file); adopt the reusable workflow. Examples keep consuming committed outputs.
- **native** (Class B) — no change to the commit story. Keep matrix→universal-VSIX. Optional: source-hash gate on the Rust matrix.

## skia path fix (approved)

skia's `tsdown.config.ts` sets `root: 'src/ts'`, so `src/ts/context.ts` → `dist/context.js` (1 level), while the source is 2 levels deep. A `new URL('../../lib/...', import.meta.url)` is therefore **source-correct but dist-incorrect** (the same defect the old `../../dist/...` had — masked because examples resolve via the `source` condition and published consumers use the `./wasm` export / explicit `wasmUrl`).

**Fix:** align skia to image's structure — change tsdown `root: 'src/ts'` → `root: 'src'` so outputs become `dist/ts/*.js` (2 levels, matching source depth). Then `../../lib/skia-*.wasm` resolves to `<pkg>/lib/` in **both** source and built. Ripple (mechanical): update `exports` dist targets, `main`/`module`/`types`, and `prepack.mjs` required-list from `./dist/*` → `./dist/ts/*`. Locally verifiable — tsdown is pure JS and runs on any host (only the wasm *compile* needs Linux).

## Execution order & acceptance

1. **skia relink → `lib/`** (in flight): `build-wasm.mjs`, `context.ts`, `package.json` exports+files, `prepack.mjs`, `setup.mjs`, `prebuilt-wasm.{mjs,json}`, `compare-builds.mjs`, `bin/copy-wasm.mjs`. AC: zero residual `dist/skia-*/` wasm refs; `package.json` valid.
2. **skia path fix**: tsdown `root: src` + dist-path ripple. AC: local `tsdown` emits `dist/ts/*`; exports resolve (ESM `import.meta.resolve` over the subpaths); loader URL resolves to `<pkg>/lib/` from both source and `dist/ts/context.js`.
3. **skia NX target**: `project.json` `build:wasm` (inputs/outputs/cache) + `build dependsOn build:wasm`. AC: `nx show project @three-flatland/skia` lists `build:wasm` with the lib outputs; touching a native input flips the hash, touching a TS file does not.
4. **Reusable `commit-artifact.yml`** + wire skia into `build.yml` (drop toolchain on common path). AC: on a no-skia-change PR, no submodule/Zig/`.tools` steps run; first run seeds `lib/*.wasm` via commit-back; the runtime path validates in the skia browser example.
5. **image NX parity** + **bakers as NX targets** adopting the reusable workflow.
6. **(optional) native**: source-hash gate on the Rust matrix.

Only the wasm/native *compile* validates in CI (can't compile skia on the dev mac). Everything else is locally verifiable.
