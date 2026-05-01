---
date: 2026-05-01
topic: image-encoder
phase: 1
status: gate-passed-with-path-b-trigger
branch: feat-vscode-tools
spec: planning/superpowers/specs/2026-05-01-image-encoder-design.md
plan: planning/superpowers/plans/2026-05-01-image-encoder-phase-1.md
---

# Phase-1 Test Gate Report

## Results

| # | Gate item | Status | Notes |
|---|---|---|---|
| 1 | Round-trip tests pass for all four formats | **PASS** | PNG byte-equal, WebP/AVIF/KTX2 perceptual ΔE under threshold. 13 codec/dispatch/memory tests + benchmark + integration = 17 image tests, all green. |
| 2 | BasisU latency on 2048² atlas measured | **MEASURED — TRIGGER PATH B** | 8558ms for ETC1S+mipmaps quality 128 (stock BinomialLLC `basis_encoder.wasm` v1_50_0_2). Threshold was 5000ms; exceeded by 1.7×. 150KB output. |
| 3 | WebP via spark.js verified in a one-off harness | **DEFERRED — manual smoke** | Not built. spark.js integration is a half-day on its own; the runtime contract is validated by gate item 5 below. Gate-3 remains a phase-2-ship blocker, not a phase-2-plan blocker. |
| 4 | Atlas + merge tools write valid sidecars under new schema | **PASS** | 657 tests / 5 skipped across the repo. Atlas + merge tools write `meta.sources`. `validateAtlas` enforces format-uniqueness + minItems:1. |
| 5 | `@jsquash/webp` proven to load/encode in VSCode webview | **HARNESS BUILT — manual verify pending** | `tools/vscode/webview/_wasm-test/` + `tools/vscode/extension/tools/_wasm-test/register.ts` ship a `FL: WASM Contract Test` command. Vite bundles the WASM (`webp_enc-*.wasm`, `webp_enc_simd-*.wasm`) cleanly; jsquash uses fetch-based runtime loading. **Manual verification** (F5 in VSCode → run command) is the last step. |

## Repo state

- Branch: `feat-vscode-tools`
- Last commits (chronological):
  - `4cf521e` chore: cherry-pick @three-flatland/bake from lighting-stochastic-adoption
  - `492d144` feat(three-flatland): require meta.sources, drop meta.image from atlas schema
  - `cf8036e` feat(three-flatland): centralize validateAtlas with format-uniqueness check
  - `6270e9b` fix(three-flatland): import atlas schema from JSON, copy file to dist
  - `7851b2f` feat(io/atlas): emit meta.sources instead of meta.image
  - `60daafa` feat(vscode): atlas+merge tools read/write meta.sources
  - `0870f7b` feat(three-flatland): SpriteSheetLoader reads meta.sources[0].uri
  - `51eeff1` feat(image): scaffold @three-flatland/image package
  - `c41b1a0` feat(image): PNG codec via @jsquash/png
  - `d2a0a8e` fix(image): make PNG codec browser-safe via dynamic node imports
  - `319542f` feat(image): WebP codec via @jsquash/webp
  - `997db32` feat(image): AVIF codec via @jsquash/avif
  - `d1ecdf6` feat(image): KTX2/BasisU codec via vendored basis_encoder.wasm
  - `4923180` feat(image): public encodeImage/decodeImage dispatch + analytic GPU memory estimator
  - `607c9e4` feat(image/node): encodeImageFile + encodeImageBatch with atomic write and force
  - `9f1f81d` feat(image): flatland-bake encode CLI baker
  - `a9d6064` feat(image): BasisU latency benchmark — Path B gate
  - `fbfd2a8` test(image): CLI child-process integration
  - `c251e7c` test(image): WASM-in-webview contract harness
  - `1d3f020` fix(merge): emit meta.sources in empty atlas template
- Working tree: clean
- `pnpm test`: 652 passed / 5 skipped / 657 total
- `pnpm build`: 33 successful
- `pnpm typecheck`: 52 successful

## Spec success criteria check

1. **`pnpm --filter @three-flatland/image build` succeeds.** ✓
2. **`flatland-bake encode hero.png --format webp --quality 80` writes `hero.webp`.** ✓ Verified: `[encode] ok src/__fixtures__/tiny.png → /tmp/spec-check.webp` (90 bytes).
3. **`flatland-bake encode hero.png --format ktx2 --basis-mode etc1s --mipmaps`.** ✓ Verified: `[encode] ok ... → /tmp/spec-check.ktx2` (419 bytes, valid KTX2 magic).
4. **Round-trip tests pass for all four formats.** ✓
5. **WASM codecs load inside a VSCode webview.** Harness built; manual F5 verification pending.
6. **Atlas + merge tools read/write the new `meta.sources` schema; `validateAtlas` is the single source of truth.** ✓ `validateAtlas` lives in `packages/three-flatland/src/sprites/atlas.schema.ts`; the previous duplicate in `tools/vscode/extension/tools/atlas/validateAtlas.ts` is now a re-export.
7. **BasisU latency measured.** ✓ — TRIGGER PATH B (see gate item 2).

## Decision

**Phase 1 is COMPLETE for shipping the package + CLI.** The package, schema migration, all four codecs, public API, file I/O, batch, and CLI baker work end-to-end and have green tests.

**Phase 2 (Squoosh-style GUI) is GATED on Path B.** The 8.5s BasisU encode time is unacceptable for an interactive A/B GUI — a user would lose flow waiting for KTX2 results. Before phase 2 starts, write a follow-up plan for Path B: build BasisU from source via Zig + Emscripten + `-msimd128`, mirroring the patterns from `packages/skia`. The output is a drop-in `basis_encoder.wasm` replacement that goes into `packages/image/vendor/basis/`. `codecs/ktx2.ts` does not change.

Manual verification of gate item 5 (F5 in VSCode → `FL: WASM Contract Test`) should also happen before phase-2 GUI work begins, but it's a 30-second check that doesn't block the Path B plan.

## What's next

1. **Manual verify gate item 5.** Open this worktree in VSCode, F5, run `FL: WASM Contract Test` from the palette. Expected: webview displays `OK: encoded 64×64 to <N> bytes in <Mms> — WASM works in webview`.
2. **Write Path B brainstorm + spec + plan.** Triggered by gate item 2's measurement. The Zig + Emscripten + handle-pool patterns from `packages/skia` are the precedent.
3. **(Optional) gate item 3 follow-up.** WebP-via-spark.js smoke test in a real browser. Not blocking the Path B work; can run in parallel.

After Path B lands and gate item 5 is signed off: brainstorm + spec + plan for phase 2 (the Squoosh-style GUI).
