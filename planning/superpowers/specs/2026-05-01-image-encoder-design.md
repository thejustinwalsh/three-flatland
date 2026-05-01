---
date: 2026-05-01
topic: image-encoder
status: design-approved
branch: feat-vscode-tools
supersedes: planning/vscode-tools/tool-image-encoder.md (refines, doesn't replace)
---

# Image Encoder — Design

A WASM-only image encoder package + CLI + (later) Squoosh-style VSCode GUI. Ships as `@three-flatland/image` following the baker package pattern. Phase 1 lands the package + CLI. Phase 2 lands the full A/B GUI after a test gate.

## Goals

- One encoding implementation that runs in the browser, in Node, and from a CLI — same WASM modules, no native fallbacks.
- WebP and KTX2/BasisU as the headline output formats; PNG/AVIF along for comparison and baseline coverage.
- Deterministic, testable encode/decode round-trips that can be invoked from the runtime, the VSCode extension host, or `flatland-bake`.
- Sidecar awareness: atlases carry an explicit list of encoded sources (`meta.sources`) so consumers can pick the right format at load time.

## Non-goals

- No `resolveImageSource` runtime fallback resolver in this package. That function belongs next to the eventual `SpriteSheetLoader({ formats, loader })` work landing on `lighting-stochastic-adoption`. **Pinned for revisit** after that branch rebases in.
- No multi-baker orchestration. No `flatland-bake pipeline merge,encode` meta-runner, no declarative workflow files. Each baker is invoked independently; users chain via shell `&&` or scripts. The `image` baker itself is in scope (see §1).
- No per-channel encode settings. Reasonable defaults only; v1+.
- No `vscode.lm` AI quality picker.
- No quality presets in v0. They will likely emerge from real usage and should not be invented up-front.
- No native binaries (no shelling out to `cwebp`, `basisu`, etc.). The runtime contract demands WASM in both Node and browser; native would create two implementations to keep in sync.

## Success criteria

1. `pnpm --filter @three-flatland/image build` succeeds; `dist/` ships browser-safe `index.js`, Node `node.js`, and CLI `cli.js` per the baker pattern.
2. `flatland-bake encode hero.png --format webp --quality 80` writes `hero.webp` next to source.
3. `flatland-bake encode hero.png --format ktx2 --basis-mode etc1s --mipmaps` writes a transcodable `hero.ktx2`.
4. Round-trip tests pass for all four formats: encode RGBA8 → decode → byte-equality (or per-format perceptual tolerance for lossy codecs).
5. The same WASM codecs load and run inside a VSCode webview (proven via a one-off harness) — validates the runtime contract.
6. Atlas + merge tools read/write the new `meta.sources` schema; `validateAtlas` is the single source of truth.
7. Phase-1 BasisU latency on a 2048² atlas is measured. Either acceptable (continue with stock WASM) or triggers Path B (Zig-built SIMD encoder) before phase 2.

---

## 1. Package shape — `@three-flatland/image`

Lives at `packages/image/`. Mirrors `packages/normals/` from the cherry-picked `packages/bake` infrastructure.

### Subpath exports

| Subpath | Use case | Contents |
|---|---|---|
| `.` | Browser runtime, webview tools | `encodeImage`, `decodeImage`, `estimateGpuMemory`, types, codec dispatch (browser-safe — no `node:*`) |
| `./node` | Extension host, build scripts, CI | Re-exports `.` plus `encodeImageFile`, `encodeImageBatch` (worker_threads pool) |
| `./cli` | `flatland-bake encode` | Default-exports a `Baker` registered via `flatland.bake` |

Layout:

```
packages/image/
  package.json              # flatland.bake: [{ name: "encode", entry: "./dist/cli.js" }]
  src/
    index.ts                # browser-safe surface
    node.ts                 # adds encodeImageFile, encodeImageBatch
    cli.ts                  # default-exports Baker
    encode.ts               # codec dispatch (browser-safe)
    encode.node.ts          # file I/O wrappers, worker_threads
    decode.ts               # codec dispatch (browser-safe)
    memory.ts               # GpuMemoryEstimator (analytic baseline)
    codecs/
      png.ts                # @jsquash/png
      webp.ts               # @jsquash/webp
      avif.ts               # @jsquash/avif
      ktx2.ts               # basis_universal stock WASM (Path A)
    types.ts                # EncodeFormat, ImageEncodeOptions, GpuMemoryEstimate
    __fixtures__/
      valid/
      invalid/
    *.test.ts
  tsup.config.ts
```

### Public API

```ts
// @three-flatland/image (browser-safe)
export type EncodeFormat = 'png' | 'webp' | 'avif' | 'ktx2'

export interface ImageEncodeOptions {
  format: EncodeFormat
  quality?: number                      // 0..100; PNG ignores; WebP/AVIF use; KTX2: ETC1S quality
  mode?: 'lossy' | 'lossless'           // WebP/AVIF
  basis?: { mode?: 'etc1s' | 'uastc', mipmaps?: boolean, uastcLevel?: 0|1|2|3|4 }
  alpha?: boolean                       // auto-detected if omitted
}

export function encodeImage(pixels: ImageData, opts: ImageEncodeOptions): Promise<Uint8Array>
export function decodeImage(bytes: Uint8Array, format: EncodeFormat): Promise<ImageData>

export interface GpuMemoryEstimate {
  loader: 'three-default' | 'three-ktx' | 'spark'
  gpuFormat: string                     // 'RGBA8' | 'BC7' | 'ASTC_4x4_RGBA' | ...
  bytes: number
  mipBytes?: number                     // present when mipmaps included
  measured?: boolean                    // true only when spark.js measured a real GPUTexture
}

export function estimateGpuMemory(
  source: { width: number, height: number, alpha: boolean, format: EncodeFormat },
  loader: 'three-default' | 'three-ktx' | 'spark' | 'all'
): Promise<GpuMemoryEstimate[]>
```

```ts
// @three-flatland/image/node
export * from '@three-flatland/image'

export function encodeImageFile(input: string, output: string | null, opts: ImageEncodeOptions): Promise<string>

export function encodeImageBatch(
  items: { input: string, output?: string, opts: ImageEncodeOptions }[],
  concurrency?: number
): AsyncIterable<{ input: string, status: 'ok' | 'err', output?: string, error?: string, bytes?: number, ms?: number }>
```

```ts
// @three-flatland/image/cli — default exports Baker
const baker: Baker = {
  name: 'encode',
  description: 'Encode image to PNG/WebP/AVIF/KTX2',
  usage() { /* ... */ },
  run(args): Promise<number> { /* parse args, dispatch, exit code 0/1 */ },
}
export default baker
```

`resolveImageSource` is **not** exported from this package. It will live next to the consumer (`SpriteSheetLoader`) in `packages/three-flatland/src/sprites/` once the loader work rebases in.

---

## 2. Codec strategy

Three paths in priority order. Default is Path A; Path B is the planned fallback for BasisU; Path C is reserved for hard blockers.

### Path A — stock WASM (default)

| Format | Source | Notes |
|---|---|---|
| PNG | `@jsquash/png` | Mature, fast, SIMD build. |
| WebP | `@jsquash/webp` | Headline output. SIMD build available. spark.js results suggest WebP alone delivers the GPU memory savings we care about. |
| AVIF | `@jsquash/avif` | Comparison/baseline. Slow at high quality; default cap at 55. |
| KTX2/BasisU | BinomialLLC `basis_encoder.wasm` | Stock build, no SIMD. **Phase-1 measurement gate** — see Path B. |

All four ship the same way: lazy dynamic import in browser; lazy `await import()` in Node-side worker threads. WASM blobs are loaded once per worker, kept warm for batch jobs.

### Path B — Zig-built SIMD BasisU (backup)

Triggered when phase-1 measurement on a 2048² atlas shows the stock encoder is unacceptably slow (target: <5s single-threaded for ETC1S quality 128, mip enabled — adjust during measurement).

Approach: Zig + Emscripten + `-msimd128`, thin C ABI over the BasisU encoder, following the patterns established in `packages/skia` (per memory: WASM build, handle-pool ownership model). Output is a drop-in replacement for `basis_encoder.wasm` — same exported entry points so `codecs/ktx2.ts` doesn't change.

Decision is made *before* phase 2 GUI work begins. The GUI cannot ship with an encoder that locks up the webview for 30+ seconds.

### Path C — Zig everything (reserved)

Only on hard blockers in jsquash for PNG/WebP/AVIF. Reproduces what jsquash already gives us; not free.

---

## 3. Schema migration — `meta.sources`

Single coordinated change in this branch. No backward-compatibility path; nothing has been released and this is the only branch with the work.

### Schema change

`packages/three-flatland/src/sprites/atlas.schema.json`:

- **Remove**: `meta.image: string`
- **Add**: `meta.sources: { format: EncodeFormat, uri: string }[]` (min 1 entry, unique formats)

### Coordinated touchpoints

- `packages/three-flatland/src/sprites/atlas.schema.json` — schema rewrite.
- `packages/three-flatland/src/sprites/atlas.schema.ts` — new file: ajv compile + `validateAtlas` export. Replaces the duplicate validator currently living in `tools/vscode/extension/tools/atlas/validateAtlas.ts`.
- `tools/vscode/extension/tools/atlas/{provider,sidecar}.ts` — read/write `meta.sources`, write a single-entry array until phase 2.
- `tools/vscode/extension/tools/merge/host.ts` — same.
- `tools/vscode/webview/atlas/`, `tools/vscode/webview/merge/` — wherever the old `meta.image` is referenced.

Atlas + merge tools emit a single-entry `meta.sources` until multi-format pipelines exist (i.e., until phase 2 of this work, or until a future runtime loader splices in alternate formats).

---

## 4. Phasing

### Phase 1 — package + CLI

Scope:

- All four codecs working end-to-end through `encodeImage` / `decodeImage` / `encodeImageFile`.
- `flatland-bake encode <input> [output]` with: `--format`, `--quality`, `--mode`, `--basis-mode`, `--uastc-level`, `--mipmaps`, `--batch`, `--out-dir`, `--force`.
- `meta.sources` schema lands here; atlas + merge tools updated alongside.
- Cherry-pick `packages/bake` from `lighting-stochastic-adoption` so `Baker` contract + `flatland-bake` discovery exist in this branch. Reconcile on rebase.

Operational policies (locked):

- **a-ii.** Output collision: error on existing target; `--force` to overwrite.
- **b-ii.** Batch failure: best-effort completion, summary line at end, exit code 1 if any failed.
- **c-i.** Atomic writes: write to `<output>.tmp`, fsync, rename on success.

Tests:

- Codec round-trip: encode RGBA8 → decode → exact byte equality for PNG; perceptual ΔE tolerance for WebP/AVIF/KTX2.
- Golden bytes for deterministic encoders (PNG with fixed deflate level, BasisU at `--basis-mode etc1s --quality 128`).
- BasisU latency benchmark on a 2048² atlas — the gate to Path B.
- CLI integration: `flatland-bake encode` from a child process round-trips a fixture.

### Test gate (between phases)

Required to pass before any phase-2 GUI work begins:

1. All round-trip tests pass.
2. BasisU latency measured. Either acceptable on Path A, or Path B has been built and is acceptable.
3. WebP output verified to load correctly via spark.js in a one-off harness (proves the headline runtime path).
4. Atlas + merge tools still write valid sidecars under the new schema.
5. `@jsquash/webp` proven to load and encode inside a VSCode webview via a throwaway test panel — validates the runtime contract that motivated the WASM-only commitment.

### Phase 2 — Squoosh-style GUI

Scope (no minimal-middle stop — we either ship A/B properly or not at all):

- Right-click `.png` / `.webp` / `.atlas.json` → "Open in FL Image Encoder".
- Side-by-side canvas: source on left, encoded on right. Zoom + pan synced via the `CanvasStage` patterns already used in atlas.
- Format picker + per-format param panel (lossy/lossless toggle for WebP/AVIF; `etc1s`/`uastc` toggle + UASTC level for KTX2).
- Loader picker drives the GPU memory column: `three-default` (RGBA8 analytic), `three-ktx` (BC7/ASTC analytic), `spark` (measured when WebGPU available, falls back to analytic).
- Delta overlay (per-pixel ΔE highlighted), pixel peeker, encode-time display.
- Save → host calls `encodeImageFile`; if an `.atlas.json` sibling exists, splice the new entry into `meta.sources` after `validateAtlas` passes.

Reuses existing primitives:

- `<CanvasStage>` + `<InfoPanel>` from `tools/preview`.
- Design-system `Toolbar`, `Panel`, `Splitter`, `Tabs`.
- The `*.tmp` + rename + ajv pattern from atlas's `bridge.atlas/save` flow.

---

## 5. Architecture & data flow

```
┌──────────────────────────────┐      ┌────────────────────────────────┐
│ Phase 2: VSCode webview      │      │ Phase 1: CLI (flatland-bake)   │
│ tools/vscode/webview/        │      │                                │
│   imageEncoder/App.tsx       │      │   $ flatland-bake encode ...   │
│                              │      │     ↓                          │
│   import {                   │      │   @three-flatland/image/cli    │
│     decodeImage,             │      │     ↓                          │
│     estimateGpuMemory        │      │   @three-flatland/image/node   │
│   } from '@three-flatland/   │      │     encodeImageFile / Batch    │
│           image'             │      │     ↓                          │
│                              │      │   worker_threads pool          │
│   bridge → host:             │      │     ↓                          │
│     'image/encode'           │      │   codec WASM (lazy import)     │
└──────────────┬───────────────┘      └────────────────────────────────┘
               ↓
┌──────────────────────────────┐
│ Phase 2: Extension host      │
│ tools/vscode/extension/      │
│   imageEncoder/host.ts       │
│                              │
│   import {                   │
│     encodeImageFile          │
│   } from '@three-flatland/   │
│           image/node'        │
│                              │
│   ajv-validate sidecar       │
│   atomic write (.tmp+rename) │
└──────────────────────────────┘
```

All three call sites (webview, host, CLI) hit the same codec WASM. No duplicated implementations.

---

## 6. Risks

1. **BasisU stock latency** — addressed by the explicit measurement gate before phase 2. Path B is pre-planned, not reactive.
2. **WASM in webview CSP** — needs `wasm-unsafe-eval`; existing tools already set this. Test gate item 5 catches regressions.
3. **AVIF in Node via @jsquash** — historically had gaps; verify current state during phase-1 codec wiring.
4. **Worker_threads + WASM init** — known pattern (Skia work); init per-worker, keep warm.
5. **Encoder determinism for golden tests** — WebP/AVIF aren't bit-deterministic across encoder versions. Use perceptual ΔE thresholds, pin codec versions in `package.json`, snapshot version in test fixtures.
6. **Spark.js availability in webview** — WebGPU isn't always present (remote workspaces, vscode.dev). The `spark` GPU column gracefully falls back to analytic; never blocks encoding.

---

## 7. Implementation plan scope

The implementation plan that follows this spec covers **phase 1 only** — package + CLI + schema migration + test gate. Phase 2 (the GUI) gets its own spec + plan after the gate passes, because:

- Phase 2 may need to react to phase-1 measurement results (e.g., Path B was triggered, which changes assumptions about encode latency in the GUI).
- The GUI's specific UX decisions (delta overlay rendering, pixel peeker interaction) benefit from being designed against a working encoder rather than imagined.
- Splitting keeps each plan a tractable size.

## 8. References

- `planning/vscode-tools/tool-image-encoder.md` — original spec; this design refines but does not replace it.
- `planning/vscode-tools/README.md` — baker package pattern and convention.
- `packages/normals` (on `lighting-stochastic-adoption`) — baker prototype to mirror.
- `packages/skia` — Zig + Emscripten + handle-pool patterns for Path B.
- `tools/vscode/extension/tools/atlas/sidecar.ts` — atomic-write + ajv pattern to reuse.
- [@jsquash](https://github.com/jamsinclair/jSquash) — PNG/WebP/AVIF codecs.
- [basis_universal](https://github.com/BinomialLLC/basis_universal) — KTX2/BasisU encoder.
- [spark.js](https://github.com/ludicon/spark.js) — runtime GPU compression measurement.
