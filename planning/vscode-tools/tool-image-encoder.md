# Tool: Image Encoder (A/B with per-loader GPU memory)

Squoosh-style A/B image encoder across PNG / WebP / AVIF / KTX2, with disk / decoded-RAM / GPU-memory readouts per candidate runtime loader (three default, `KTX2Loader`, spark.js).

**The tool is a thin GUI over a baker package.** All encoding logic, runtime helpers, and the CLI live in `@three-flatland/image` following the same pattern as `@three-flatland/normals`:

- **Browser-safe runtime** + **node file-I/O surface** + **CLI subcommand** via `flatland-bake encode`.
- The VSCode tool imports `@three-flatland/image/node` for encoding and `@three-flatland/image` for memory estimation and preview.
- Headless / CI / scripts use `flatland-bake encode <input> [output] --format webp` — no VSCode needed.
- Runtime consumers (three-flatland loaders) import the same package for format-fallback resolution and source decoding.

## Package: `@three-flatland/image`

Lives at `packages/image/`. Mirrors `packages/normals/` structurally.

### Layout

```
packages/image/
  package.json              # flatland.bake: [{ name: "encode", entry: "./dist/cli.js" }]
  src/
    index.ts                # browser-safe: encoders, decoders, memory estimator, fallback resolver
    node.ts                 # re-exports index + file-I/O wrappers (encodeImageFile, batch)
    cli.ts                  # default-exports Baker for `flatland-bake encode`
    encode.ts               # pure encode — WASM codec invocations (browser-safe)
    encode.node.ts          # file-I/O wrappers, worker_threads spawner
    decode.ts               # pure decode (browser-safe)
    memory.ts               # GpuMemoryEstimator (analytic + spark-measured)
    resolveSource.ts        # format-fallback resolver used by runtime loaders
    codecs/
      png.ts                # @jsquash/png wrapper
      webp.ts               # @jsquash/webp wrapper
      avif.ts               # @jsquash/avif wrapper
      ktx2.ts               # basis_universal WASM wrapper
    types.ts                # EncodeFormat, ImageEncodeOptions, GpuMemoryEstimate, SourceEntry
    __fixtures__/
      valid/   invalid/     # codec round-trip tests
    *.test.ts
  tsup.config.ts
```

### `package.json` (essential fields)

```jsonc
{
  "name": "@three-flatland/image",
  "type": "module",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "node":    { "types": "./dist/node.d.ts",  "import": "./dist/node.js" },
      "browser": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
      "default": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
    },
    "./node": {
      "source": "./src/node.ts",
      "types":  "./dist/node.d.ts",
      "import": "./dist/node.js"
    },
    "./cli": {
      "source": "./src/cli.ts",
      "types":  "./dist/cli.d.ts",
      "import": "./dist/cli.js"
    }
  },
  "sideEffects": false,
  "dependencies": {
    "@three-flatland/bake": "workspace:*",
    "@jsquash/png":  "^3.1.0",
    "@jsquash/webp": "^1.4.0",
    "@jsquash/avif": "^1.5.0"
  },
  "peerDependencies": { "three": ">=0.170.0" },
  "flatland": {
    "bake": [
      { "name": "encode", "description": "Encode image to PNG/WebP/AVIF/KTX2", "entry": "./dist/cli.js" }
    ]
  }
}
```

### API (public surface)

```ts
// @three-flatland/image (browser-safe)
export type EncodeFormat = 'png' | 'webp' | 'avif' | 'ktx2'

export interface ImageEncodeOptions {
  format: EncodeFormat
  quality?: number                    // 0..100 (PNG ignores; WebP/AVIF use; KTX2: ETC1S quality)
  mode?: 'lossy' | 'lossless'         // WebP/AVIF
  basis?: { mode?: 'etc1s' | 'uastc', mipmaps?: boolean, uastcLevel?: 0|1|2|3|4 }
  alpha?: boolean                     // auto-detected if omitted
}

/** Pure encode. Input: RGBA8 ImageData. Output: encoded bytes. Browser + Node. */
export function encodeImage(pixels: ImageData, opts: ImageEncodeOptions): Promise<Uint8Array>

/** Pure decode. Input: encoded bytes + format. Output: RGBA8 ImageData. */
export function decodeImage(bytes: Uint8Array, format: EncodeFormat): Promise<ImageData>

export interface GpuMemoryEstimate {
  loader: 'three-default' | 'three-ktx' | 'spark'
  gpuFormat: string           // e.g. 'RGBA8', 'BC7', 'ASTC_4x4_RGBA'
  bytes: number
  mipBytes?: number           // + 1/3 mipmap pyramid if mipmaps enabled
  measured?: boolean          // true if spark computed from a real GPUTexture
}

export function estimateGpuMemory(
  source: { width: number, height: number, alpha: boolean, format: EncodeFormat },
  loader: 'three-default' | 'three-ktx' | 'spark' | 'all'
): Promise<GpuMemoryEstimate[]>

/** Source-format fallback resolver used by runtime loaders. Given `formats: ['webp','ktx2','png']`
 *  and a sidecar's meta.sources array, pick the first supported entry. */
export function resolveImageSource(
  sources: { format: EncodeFormat, uri: string }[],
  formats: EncodeFormat[],
  caps: { webp: boolean, avif: boolean, ktx2: boolean }
): { format: EncodeFormat, uri: string } | null
```

```ts
// @three-flatland/image/node (adds file I/O)
export * from '@three-flatland/image'

/** Reads input path, encodes, writes output path (or infers from --format). Returns output path. */
export function encodeImageFile(input: string, output: string | null, opts: ImageEncodeOptions): Promise<string>

/** Runs a batch in worker_threads. Progress stream via AsyncIterable. */
export function encodeImageBatch(
  items: { input: string, output?: string, opts: ImageEncodeOptions }[],
  concurrency?: number
): AsyncIterable<{ input: string, status: 'ok' | 'err', output?: string, error?: string, bytes?: number, ms?: number }>
```

```ts
// @three-flatland/image/cli (default export is Baker)
const baker: Baker = {
  name: 'encode',
  description: 'Encode image to PNG/WebP/AVIF/KTX2',
  usage() { /* ... */ },
  run(args): Promise<number> { /* parse args, call encodeImageFile or batch, exit code 0/1 */ },
}
export default baker
```

### CLI usage

```
flatland-bake encode <input> [output] [options]

Options:
  --format <fmt>          png | webp | avif | ktx2  (required)
  --quality <n>           0..100 (WebP/AVIF) or ETC1S quality for KTX2
  --mode <m>              lossy | lossless (WebP/AVIF)
  --basis-mode <m>        etc1s | uastc (KTX2)
  --uastc-level <0..4>    UASTC pack level (KTX2)
  --mipmaps               Generate mipmap pyramid (KTX2)
  --batch <glob>          Process every matching file; output dir via --out-dir
  --out-dir <path>        Batch output directory
  --sidecar               Update matching *.atlas.json meta.sources after success
```

`flatland-bake encode hero.png --format webp --quality 80` → `hero.webp`.
`flatland-bake encode "sprites/*.png" --batch --format avif --quality 55 --out-dir out/` → batch.

CLI uses `@three-flatland/bake` discovery (`flatland.bake` in this package's `package.json`) exactly like `normal` does.

## VSCode tool (GUI wrapper)

Lives at `tools/vscode/src/tools/imageEncoder/`. Imports:
- `@three-flatland/image/node` — for `encodeImageFile`, `encodeImageBatch`, `decodeImage` (file I/O in the extension host).
- `@three-flatland/image` — for `estimateGpuMemory`, types, source-preview decoding inside the webview.

No codec, file-I/O, or worker_thread logic lives in `tools/`. The tool is pure UI + glue.

### User flow

1. Right-click `hero.png` → "Open in FL Image Encoder". Or command palette `FL: Open Image Encoder`.
2. Webview opens with source on the left; encoded result on the right.
3. Top bar picks output format: PNG / WebP / AVIF / KTX2. Format-specific param panel below.
4. Second top bar picks runtime loader simulation: three default / `KTX2Loader` / spark.js. Updates the GPU memory readout.
5. Live preview: before/after canvas, zoom + pan synced, pixel peeker, delta overlay.
6. Save: calls `encodeImageFile` in the host; writes next to source. If a `*.atlas.json` sibling exists, offers to update `meta.sources` (ajv-validated against `validateAtlas`).

### Architecture

```
Extension host (ESM)                          Webview (React + StyleX)
  ImageEncoderCommand                           React app
    → spawns webview                              - design-system
  host-side:                                      - before/after canvas, pixel peeker
    import { encodeImageFile,                     - delta overlay
      encodeImageBatch, decodeImage }             - format picker + param panel
      from '@three-flatland/image/node'           - loader picker + memory readout
                                                  - Save button → postMessage
  SidecarPatcher                                webview-side:
    - on save, if meta.sources exists in           import { estimateGpuMemory,
      matching .atlas.json, splice + validate          decodeImage } from
      against validateAtlas                              '@three-flatland/image'
      (packages/three-flatland/sprites)
                                                 For the spark.js GPU column:
                                                   - webview lazy-imports spark.js
                                                   - runs encodeTexture() against the
                                                     candidate encoded source in a
                                                     hidden WebGPU context
                                                   - reads real GPUTexture size
                                                   - returns measured: true
```

### Contribution

```json
"contributes": {
  "commands": [
    { "command": "threeFlatland.imageEncoder.open", "title": "Open in FL Image Encoder", "category": "FL" }
  ],
  "menus": {
    "explorer/context": [
      {
        "command": "threeFlatland.imageEncoder.open",
        "when": "resourceExtname in threeFlatland.imageExts",
        "group": "navigation@30"
      }
    ]
  }
}
```

## Why this split (baker package pattern)

Three independent consumption paths for the same logic:

| Path | Entry | Use case |
|---|---|---|
| Runtime (browser) | `@three-flatland/image` | Loaders resolve `{ formats, loader }`; call `resolveImageSource`; decode if needed; compute memory estimates for devtools overlays |
| Node (programmatic) | `@three-flatland/image/node` | Build scripts, CI, bespoke tooling, the VSCode tool's extension host |
| CLI (headless) | `flatland-bake encode` | Terminal one-offs, CI, Makefiles, `npm run bake` |

All three share one codec implementation (`codecs/*.ts`). No duplication.

## GPU memory readout (unchanged)

| Runtime loader | Source format | GPU format (desktop) | GPU bytes |
|---|---|---|---|
| three default `TextureLoader` | PNG / WebP / AVIF | RGBA8 uncompressed | `w × h × 4` |
| three `KTX2Loader` | KTX2 / BasisU | BC7 / ASTC 4×4 | `w × h × 1` (BC7) |
| **spark.js** | PNG / WebP / AVIF / Canvas → compressed `GPUTexture` | BC7 / ASTC 4×4 / ETC2 | measured: read `GPUTexture.format` + dims, compute from block size |

For the spark column the webview **actually runs** `spark.encodeTexture()` in a hidden WebGPU context against the candidate encoded source and reads the real GPU texture size. `measured: true` marks the result. Analytic formula is the fallback when a WebGPU context isn't available (e.g., VSCode web, remote workspaces).

## Runtime loader follow-up

Out of scope for this package, tracked against `packages/three-flatland/`. `TextureLoader` / `SpriteSheetLoader` add:

```ts
loadSpriteSheet('hero', {
  formats: ['webp', 'ktx2', 'png'],
  loader:  'auto'    // 'spark' | 'three-ktx' | 'three-default' | 'auto'
})
```

They use `@three-flatland/image.resolveImageSource` for format-fallback resolution — same package, one implementation.

## Risks

1. **spark.js GPU measurement reliability** — spark picks different target formats based on device caps; preview-machine result may differ from user-device result. Show the chosen format alongside the byte count.
2. **Encoder performance** — AVIF at high quality is slow even in workers. Cap default quality to 55; show encode time; offer "fast preview / full quality" toggle.
3. **Lossy color shifts** — delta overlay is mandatory; not optional.
4. **KTX2 CSP in webview** — if we preview transcoded KTX2, CSP needs `wasm-unsafe-eval` for BasisU transcoder.
5. **@jsquash WASM download size** — each codec is ~400 KB – 2 MB WASM. Loaded lazily per format the user picks.

## References

- `packages/normals/` — baker package prototype: `src/{index,node,cli,bake,bake.node,NormalMapLoader}.ts`
- `packages/bake/src/types.ts` — `Baker` contract
- [spark.js](https://github.com/ludicon/spark.js)
- [Squoosh](https://squoosh.app/) — reference UX
- [jSquash (WASM codecs)](https://github.com/jamsinclair/jSquash)
- [basis_universal](https://github.com/BinomialLLC/basis_universal)
- [three.js KTX2Loader](https://threejs.org/docs/#examples/en/loaders/KTX2Loader)
