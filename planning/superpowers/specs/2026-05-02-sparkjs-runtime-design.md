---
date: 2026-05-02
last-updated: 2026-05-04
topic: sparkjs-runtime
phase: 3.x (deferred)
status: tabled — license incompatible with three-flatland's middleware position
branch: feat-vscode-tools
predecessors:
  - planning/superpowers/specs/2026-05-02-image-encoder-compare-slider.md  (Phase 2.1.2 BaseImageLoader + LoaderRegistry)
  - planning/vscode-tools/tool-image-encoder.md  (early notes on three loader / KTX2 / spark candidates)
---

> **TABLED 2026-05-04.** The license audit (see "License audit" section) found the
> spark.js shaders are EULA-bound and prohibited from inclusion in middleware /
> dev toolkits. Three-flatland is exactly that, so we cannot ship a default
> integration. Hooks-only Option B is described below for posterity but is
> NOT being built. If this changes (Ludicon's terms relax, someone licenses
> commercially and contributes the integration, or we build a permissive
> alternative), reopen this spec.


# spark.js runtime — what it is, what we need, what it costs

## Why

`@three-flatland/image`'s loader stack (Phase 2.1.2) is being designed format-agnostic from the start. Today the runtime needs `Ktx2Loader` for KTX2; everything else (PNG / WebP / AVIF) goes through native browser bitmap loaders. The Phase 2.1.2 spec leaves a clear seam for a `SparkKtx2Loader` or `SparkNativeLoader` to register alongside, but doesn't commit to building one.

This document is the research + design pass that decides:

1. What spark.js actually is, and what it'd cost us to integrate
2. Whether it requires WebGPU (forcing TSL's WebGPU renderer) or works with WebGL2 (preserving the WebGL fallback)
3. How its memory model compares to KTX2 and to the "deliver WebP and decode in browser" baseline — specifically the pixi.js-style "keep the decoded ImageData around for device-lost recovery" antipattern that balloons RAM
4. Whether KTX2 still has a place once spark.js lands — when each format wins
5. The integration shape against the `BaseImageLoader<T>` + `LoaderRegistry` abstraction from Phase 2.1.2
6. **What licensing constraints affect distribution** — spoiler: this is the load-bearing finding. See "License audit" below before reading anything else.

## License audit — read this first

**spark.js has a mixed license that prevents us from shipping it as a default integration.**

The repository's `LICENSE` file makes this explicit:

- **JavaScript code: MIT.** The orchestration layer is permissive; we can fork, modify, redistribute.
- **Spark Shaders: proprietary EULA.** The actual encoder logic (the WGSL + GLSL shaders that do the GPU compression) is governed by a custom EULA at `https://ludicon.com/sparkjs/eula.html`.

Reading the EULA, the practical constraints are:

| Concern | Spark.js EULA position |
|---|---|
| Commercial use | **Requires a paid license from Ludicon.** Non-commercial (personal / educational / hobbyist) use is free. |
| Inclusion in middleware / engines / dev toolkits | **Prohibited except for evaluation.** "Cannot be distributed as part of game engines, development toolkits, or middleware." three-flatland is exactly that. |
| Downstream propagation | **Viral.** Downstream users must be bound by the EULA and must obtain their own commercial licenses for paid use. |
| Inclusion in MIT/Apache-2.0 open-source projects | **Not explicitly permitted** — the EULA notes that incorporating into permissively-licensed open-source work could create license-compatibility issues. |
| Derivative works (modifying the shaders) | **Prohibited.** |
| Contributions back | Ludicon gains a perpetual unrestricted license to anything we contribute. |
| Attribution | Required: "Powered by spark.js⚡️" with hyperlink (non-commercial users). |

**What this means for three-flatland:**

- **We cannot ship spark.js as a default dependency in `@three-flatland/image`** without converting the package (and three-flatland as a whole) into something users can't freely use commercially. That's a non-starter for a permissively-licensed library.
- **We probably cannot ship it as an opt-in subpath either** — including the EULA-bound shaders in our published npm package qualifies as "distributing as part of middleware," which the EULA prohibits even for evaluation distribution.
- **The realistic options** are: (A) don't integrate spark.js at all; (B) provide loader-registry HOOKS so end-users can plug in their own licensed spark.js installation, where THEY take on the licensing burden, never us; (C) build our own GPU-side encoder with a permissive license.

Option B (registry hooks, no shipped code) is the only way to reference spark.js without taking on its licensing obligations. The rest of this spec assumes that mode — we do NOT vendor or import spark.js anywhere in three-flatland.

**The remainder of the spec is research that informs (a) what an opt-in B-mode integration would look like, and (b) what we'd need to build if we ever wanted a permissive equivalent.**

## What spark.js is

> spark.js is a "standalone JavaScript library that exposes a subset of the Spark codecs" for real-time texture compression in web applications. It transcodes standard image formats into native GPU formats like BC7, ASTC, and ETC2 at load-time using high-quality GPU encoders.
> — [github.com/ludicon/spark.js](https://github.com/ludicon/spark.js)

In one sentence: **spark.js is a GPU-resident encoder that takes a CPU-decoded image (PNG/WebP/AVIF/canvas/video frame) and emits a GPU-compressed texture.** No CPU encode, no `basis_encoder.wasm`, no transcoder JS. The encoding happens via shaders in the GPU itself, then the compressed bytes stay on the GPU.

The codebase is 51.7% WGSL + 24.8% JavaScript + 23.5% GLSL — meaning it ships shaders for both backends and a small JS coordination layer on top.

## Backend support — does it require WebGPU?

**No.** spark.js exports two classes:

| Class | Backend | Used like |
|---|---|---|
| `Spark` | WebGPU | `await Spark.create(device)` |
| `SparkGL` | WebGL2 | `await SparkGL.create(gl)` |

Both produce the same family of GPU-compressed outputs (BC1 / BC5 / BC7 / ETC2 / EAC-RG / ASTC 4×4 LDR). The `Spark` path uses WGSL compute shaders; the `SparkGL` path uses GLSL fragment-shader-based encoders.

### What this means for our TSL stack

three.js's TSL is a backend-agnostic shader graph that compiles to WGSL (for `WebGPURenderer`) or GLSL (for the standard WebGL renderer). spark.js itself is renderer-agnostic too — it doesn't care that we're using TSL. We just hand it a `device` (WebGPU) or a `gl` (WebGL2) context, get back a `GPUTexture` or `WebGLTexture`, and wrap it in a `THREE.CompressedTexture` for our material.

**TSL with WebGL fallback works.** The encode path uses `SparkGL.create(gl)`; the result feeds into a TSL `texture(node)` sample exactly the same way a WebGPU spark encoding does. We don't lose anything by keeping a WebGL renderer in our supported matrix.

There is a real WebGPU advantage worth flagging:
- **WebGPU `Spark` uses compute** → faster encoding, less GPU thrash during load. Good for batch loading.
- **WebGL2 `SparkGL` uses fragment shaders** → slower, slightly more roundabout (encodes via render-to-texture passes). Still works, still fast in absolute terms (frames not seconds).

Either way: TSL is preserved. We don't have to commit to WebGPU to use spark.js.

## API shape

### Initialization

```ts
// WebGPU path
const adapter = await navigator.gpu.requestAdapter()
const required = Spark.getRequiredFeatures(adapter)  // e.g. ['texture-compression-bc', 'texture-compression-astc']
const device = await adapter.requestDevice({ requiredFeatures: required })
const spark = await Spark.create(device)   // returns Promise<Spark>

// WebGL2 path
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
const spark = SparkGL.create(gl)           // returns SparkGL synchronously
```

`Spark.getRequiredFeatures(adapter)` returns the WebGPU features needed given the GPU's capabilities — typically a subset of `['texture-compression-bc', 'texture-compression-astc', 'texture-compression-etc2']` depending on the adapter. The caller passes that array to `requestDevice({ requiredFeatures })`. Important: this means a Spark device requires explicit feature negotiation — we can't just hand it the standard R3F device without enabling the compression features first.

For WebGL2, extensions are auto-enabled inside `SparkGL.create`. We don't have to manage them.

### encodeTexture options (full surface)

| Option | Type | Default | Notes |
|---|---|---|---|
| `format` | `'rgba'` \| `'rgb'` \| `'rg'` \| `'r'` \| `'auto'` \| explicit name | `'rgb'` | Channel mask (auto-picks BC7/ASTC/ETC2 variant per device) or explicit (`'bc7-rgba'`, `'astc-4x4-rgb'`, `'etc2-rgb'`, `'eac-r'`, etc.) `'auto'` is WebGPU-only. |
| `mips` / `generateMipmaps` | boolean | `false` | Mip chain generation. We'd typically set `true` for atlases. |
| `mipmapFilter` | `'box'` \| `'magic'` | `'magic'` | Downsample filter. "magic" is a 4×4 with sharpening; "box" is plain box filter. |
| `mipsAlphaScale` | `number[]` | undefined | Per-level alpha multipliers — useful when alpha changes meaning at lower mips (e.g., coverage). |
| `srgb` | boolean | `false` | sRGB encoding. We'd set `true` for color textures (atlas, UI), `false` for normal maps and data textures. |
| `normal` | boolean | `false` | Treat as normal map — favors BC5 / EAC-RG (2-channel high-quality formats). |
| `flipY` | boolean | `false` | Vertical flip during encode. |
| `preferLowQuality` | boolean | `false` | Use 8-bit formats when `format='rgb'`. Trades quality for size. |
| `outputTexture` | GPUTexture / WebGLTexture | undefined | Reuse a previously-allocated texture — avoids realloc. Width / height / mipmap count / format must match exactly or a new texture is allocated. |
| `preload` | boolean \| string[] | `false` | Precompile encoders for given formats up front (avoids first-encode latency). |
| `cacheTempResources` | boolean | `false` | Cache scratch GPU resources between encodes. Faster batch encoding. Pair with `freeTempResources()` after batch. |
| `verbose` | boolean | `false` | Debug logging. |
| `useTimestampQueries` | boolean | `false` | WebGPU GPU profiling timestamps. Useful for our perf investigation. |

### Source types

| Source | Spark (WebGPU) | SparkGL (WebGL2) |
|---|---|---|
| URL string | yes (auto-fetches + decodes) | yes |
| `HTMLImageElement` / `ImageBitmap` / `HTMLCanvasElement` / `OffscreenCanvas` | yes | yes |
| `VideoFrame` | yes | yes |
| `GPUTexture` | yes | — |
| `WebGLTexture` | — | yes |

When given a URL, spark.js owns the fetch + decode. When given a decoded source, spark just reads from it.

### Output formats and their tradeoffs

| Format | Channels | Block size | Compression ratio | Quality |
|---|---|---|---|---|
| `bc1-rgb` | 3 | 8B / 4×4 | 8:1 | Low |
| `bc4-r` | 1 | 8B / 4×4 | 2:1 | High |
| `bc5-rg` | 2 | 8B / 4×4 | 2:1 | High |
| `bc7-rgb` / `bc7-rgba` | 3/4 | 16B / 4×4 | 4:1 | High |
| `etc2-rgb` | 3 | 8B / 4×4 | 8:1 | Low |
| `eac-r` / `eac-rg` | 1/2 | 8/16B / 4×4 | 2:1 | High |
| `astc-rgb` / `astc-rgba` | 3/4 | 16B / 4×4 | 4:1 | High |

For our common case (sRGB color atlas, 4-channel including alpha): BC7/ASTC-4×4/ETC2 RGBA chosen by device. Block size 16 bytes per 4×4 pixel block = 1 byte per pixel = 4:1 ratio vs RGBA8. So a 2048² atlas → 4 MB GPU.

### Resource lifecycle

- Caller owns the returned texture (`GPUTexture` or `WebGLTexture`). Caller's responsibility to dispose.
- `outputTexture` reuse: only reused if width / height / mipCount / format all match. Otherwise spark allocates a new one and returns it.
- `spark.dispose()` destroys the encoder instance and all retained GPU scratch resources.
- `freeTempResources()` on the spark instance: drops cached scratch GPU resources between batches.

### three.js integration helpers (NOT useful for us)

spark.js ships:
- `registerSparkLoader(GLTFLoader)` — extends GLTFLoader to spark-encode embedded textures during glTF parsing
- `createSparkPlugins(...)` — for `3DTilesRenderer`

Neither is wired for sprite atlases or our custom loader hierarchy. They also don't address our licensing problem — using these helpers still pulls the EULA-bound shaders into our distribution path.

## Memory model — the pixi.js antipattern

This is the user's load-bearing concern. Walking through what each delivery path actually costs.

### Baseline: PNG/WebP/AVIF + native browser decode

For a **2048×2048 RGBA image:**

| Stage | Bytes | Where |
|---|---|---|
| On disk | ~50 KB (WebP) – 200 KB (PNG) | network/disk |
| Decoded `ImageBitmap` | ~16 MB | CPU heap |
| Uploaded as `THREE.Texture` (uncompressed RGBA8) | ~16 MB | GPU |
| **Total resident** if `ImageBitmap` is kept (pixi.js pattern) | **~32 MB** | |
| **Total resident** if `ImageBitmap` is discarded after upload | **~16 MB** | |

The pixi.js choice — keep the bitmap to recover from device-lost — doubles RAM. That's the antipattern. With many textures it blows up fast.

Three.js's default `TextureLoader` does NOT retain the bitmap by default; it uploads and the bitmap is GC-eligible. Good. But three has its own quirk: `texture.image` keeps a reference to the source HTMLImageElement until you `.dispose()` it. For three's purposes we control disposal explicitly.

### KTX2 path (no spark)

| Stage | Bytes | Where |
|---|---|---|
| On disk | ~150 KB (ETC1S) – 1 MB (UASTC) | network/disk |
| Transcoded compressed bytes (BC7 / ASTC / ETC2 fallback) | ~5 MB (BC7) | CPU briefly during transcode |
| Uploaded as `CompressedTexture` | ~5 MB (BC7 4×4) | GPU |
| `texture.mipmaps[]` array (CompressedTexture retains compressed bytes) | ~5 MB | CPU heap |
| **Total resident** | **~10 MB** | |

Three's `CompressedTexture.mipmaps[]` keeps the compressed mip data in CPU memory by default. That's how `flipY = false` and re-upload-on-context-loss work. It's much smaller than the uncompressed RGBA bitmap (5 MB vs 16 MB in our example) but still non-zero. We can null it out post-upload if we trust the texture won't need re-uploading.

### Spark.js path (PNG/WebP/AVIF source → GPU-compressed texture)

| Stage | Bytes | Where |
|---|---|---|
| On disk | ~50 KB (WebP) | network/disk |
| Decoded `ImageBitmap` (briefly) | ~16 MB | CPU heap during encode |
| Encoded as `GPUTexture` / `WebGLTexture` (BC7 4×4) | ~5 MB | GPU |
| Source `ImageBitmap` after encode | **TBD — see below** | CPU heap |
| **Total resident**, best case (bitmap discarded) | **~5 MB** | |
| **Total resident**, worst case (bitmap retained) | **~21 MB** | |

The TBD is the key risk. spark.js's docs don't specify whether it retains the source after encoding. **We have to test or read the source to find out.** If it retains, that erases the win. If it discards (or we control retention), we beat KTX2 on resident memory because we don't even keep the compressed mipmaps[] CPU copy that three's CompressedTexture default does.

### Comparison summary (single 2048² atlas, after warm-up)

| Path | Disk | CPU residual | GPU | Total resident |
|---|---|---|---|---|
| WebP + native decode + keep bitmap (pixi pattern) | 50 KB | 16 MB | 16 MB | **32 MB** |
| WebP + native decode + discard bitmap | 50 KB | 0 | 16 MB | **16 MB** |
| KTX2 ETC1S + KTX2Loader (default mipmaps[] retain) | 150 KB | 5 MB | 5 MB | **10 MB** |
| KTX2 ETC1S + KTX2Loader (mipmaps[] cleared after upload) | 150 KB | 0 | 5 MB | **5 MB** |
| WebP + spark.js (bitmap discarded by spark) | 50 KB | 0 | 5 MB | **5 MB** |
| WebP + spark.js (bitmap retained by spark) | 50 KB | 16 MB | 5 MB | **21 MB** |

**KTX2 wins on disk-to-GPU efficiency** (smallest disk for a given GPU outcome, no GPU-side encode pass). **WebP + spark wins on disk size** for typical photographic content. Both crash and burn if we let the CPU side retain the source bitmap.

## Where each format earns its keep

### KTX2 keeps a strong case for:

1. **Sprite atlases with many mips** — pre-baked mip chain, no per-load GPU encode pass. Game asset path par excellence.
2. **Authoring control** — we tune the encoder once at build time (CLI baker) and ship the same bytes to every device.
3. **Bandwidth-sensitive deployments** — ETC1S can be smaller than WebP for atlases with hard-edged sprites (lots of repeated patterns).
4. **Predictability** — same compressed bytes regardless of device caps; the format runs through a transcoder that adapts to the GPU. spark.js encodes per-device, so the actual GPU memory and quality differ slightly.

### Spark.js wins for:

1. **Authoring-free workflows** — you have a WebP and want it on the GPU compressed. No baker step. Useful for user-uploaded content, dynamic textures, video frames.
2. **Smallest disk size for photo content** — WebP/AVIF beat KTX2 ETC1S for typical photographs.
3. **Generated textures** — canvas → encode without ever serializing to disk.
4. **One source, many GPU formats** — the same WebP becomes BC7 on Mac, ETC2 on mobile, ASTC where supported. Caller doesn't have to multi-encode.

### Where the choice is unclear (test required):

- Memory residency post-encode (the TBD above). If spark retains, KTX2 wins memory for everything; if spark discards, spark equals or beats KTX2.
- Per-device quality variability with spark. Atlas asset on Mac vs ASTC mobile vs ETC2 fallback may not look identical.

**Conclusion: KTX2 stays.** Even if spark.js delivers as advertised, KTX2 covers cases (pre-baked mips, predictable output across devices, smaller atlases for sprite content) that spark doesn't address well. The two are complementary; neither replaces the other.

## Integration design (option B: hooks-only, no shipped spark code)

Given the licensing constraint, three-flatland does NOT vendor or `import` spark.js anywhere. Instead, the loader registry exposes hooks that an end-user app can plug their own (separately-licensed) spark.js installation into.

### What three-flatland ships

A `SparkBitmapLoader` SKELETON in `@three-flatland/image/loaders/SparkBitmapLoader` that:
- Implements the `BaseImageLoader<CompressedTexture>` interface
- Takes a user-provided `encodeTexture` function as a constructor argument — does NOT import spark.js itself
- Owns the adapter from spark.js result → `THREE.CompressedTexture`
- Owns memory hygiene (drops the input ImageBitmap reference; nulls blob URLs)

```ts
// packages/image/src/loaders/SparkBitmapLoader.ts (in three-flatland)

import type { CompressedTexture, WebGLRenderer } from 'three'
import { BaseImageLoader, type LoaderRequest, type LoaderResult } from './BaseImageLoader'

// User-provided encoder function. Matches spark.js's encodeTexture signature
// shape but is NOT imported from spark.js — the user wires their own
// licensed instance up.
export type SparkEncodeFn = (
  source: string | ImageBitmap | HTMLCanvasElement | OffscreenCanvas,
  options: SparkEncodeOptions,
) => Promise<{
  texture: unknown          // GPUTexture | WebGLTexture, opaque to us
  format: number            // GL or WebGPU format constant
  width: number
  height: number
  mipmapCount: number
  byteLength: number
}>

export interface SparkEncodeOptions {
  format?: 'rgba' | 'rgb' | 'rg' | 'r' | 'auto' | string
  mips?: boolean
  srgb?: boolean
  normal?: boolean
  flipY?: boolean
  preferLowQuality?: boolean
  outputTexture?: unknown
}

export class SparkBitmapLoader extends BaseImageLoader<CompressedTexture> {
  readonly format = 'spark-bitmap'

  constructor(private encode: SparkEncodeFn) { super() }

  supports(input: { bytes?: Uint8Array; url?: string }): boolean {
    const ext = (input.url ?? '').split('.').pop()?.toLowerCase()
    return ext === 'png' || ext === 'webp' || ext === 'avif' || ext === 'jpg' || ext === 'jpeg'
  }

  async parse(req: LoaderRequest): Promise<LoaderResult<CompressedTexture>> {
    if (!req.renderer) throw new Error('SparkBitmapLoader requires a renderer')
    if (!req.url) throw new Error('SparkBitmapLoader currently requires a url source')

    const result = await this.encode(req.url, {
      format: 'rgba',
      mips: req.options?.mipmaps ?? true,
      srgb: req.options?.srgb ?? true,
      flipY: false,
    })

    // Adapter: spark gives us a GPU-resident handle; three wants a
    // CompressedTexture. See "adapter strategy" below for the two
    // compatible paths.
    const texture = adaptSparkResultToCompressedTexture(result)

    return {
      texture,
      meta: { sparkFormat: result.format, byteLength: result.byteLength },
      recovery: { kind: 'url', url: req.url, format: 'png' /* or detected */ },
    }
  }
}
```

### What the end-user does

In their own application code (where they've signed Ludicon's commercial license, or they're using it non-commercially):

```ts
// User's own app code — this is where spark.js is actually imported
import { Spark } from '@spark/web'                 // user pays for this
import { SparkBitmapLoader, defaultLoaderRegistry } from '@three-flatland/image/loaders'

const adapter = await navigator.gpu.requestAdapter()
const required = Spark.getRequiredFeatures(adapter)
const device = await adapter.requestDevice({ requiredFeatures: required })
const spark = await Spark.create(device)

defaultLoaderRegistry.register(
  new SparkBitmapLoader((src, opts) => spark.encodeTexture(src, opts)),
  { priority: 'before-native-bitmap' },
)
```

three-flatland's package.json never lists `@spark/web` as a dependency. We don't pull it. The end-user does, under their own license.

### Why this works for the licensing

- Our `SparkBitmapLoader` ships with no shader code, no imports of `@spark/web`, no compiled spark output.
- It's a typed adapter that calls a function the caller provides. Functionally indistinguishable from any other "you bring the encoder" plugin pattern.
- The Ludicon EULA's "cannot be distributed as part of middleware" clause doesn't bite us because we don't distribute spark.js. The user does, in their own app, where their license applies.

### Adapter strategy (spark output → CompressedTexture)

The `adaptSparkResultToCompressedTexture` helper is the load-bearing piece. It's not free — three's renderer expects to manage texture uploads itself, and spark gives us a GPU-resident texture that's already uploaded. Three options:

1. **Read back compressed bytes** from the spark-encoded texture into JS, then build a `CompressedTexture` with `mipmaps[]` populated. The renderer re-uploads. Ugly but compatible.
2. **Subclass `CompressedTexture` to override the upload** — we tell three "the texture is already on the GPU at this handle; don't re-upload, just bind."
3. **Use three's external texture API** (WebGPU has `GPUExternalTexture`; WebGL has similar). May or may not work cleanly with three's NodeMaterial / TSL pipeline.

Option 2 is the win if it works. Option 1 is the safe fallback. Phase 2.1.2's `Ktx2Loader` already does option 1 (KTX2Loader's parse output is a CompressedTexture with mipmaps[]). Following that pattern is the lowest-risk first step; we evaluate option 2 if measurements show readback is a bottleneck.

### Registry policy

Loader registry exposes a per-extension preference list. With the user's spark loader registered:

```ts
defaultLoaderRegistry.setPreference({
  png: ['spark-bitmap', 'native-bitmap'],
  webp: ['spark-bitmap', 'native-bitmap'],
  avif: ['spark-bitmap', 'native-bitmap'],
  // ktx2 is unaffected — only Ktx2Loader handles it.
})
```

Without spark registered, the preference list silently falls through to native-bitmap. Apps that don't license spark just don't get the GPU-compressed path.

### Memory residency policy (applies to BOTH spark and Ktx2)

The registry exposes a `retainSource: boolean` policy:

```ts
loaderRegistry.setPolicy({
  retainSource: false,  // drop ImageBitmap after encode; drop mipmaps[] after upload
})
```

Implementation:
- `SparkBitmapLoader` after `encode()` resolves: explicitly null any input bitmap reference and revoke blob URLs.
- `Ktx2Loader` after upload: null the `texture.mipmaps[]` array if `retainSource: false`.
- Re-creation on device-lost: drives the `recovery: RecoveryDescriptor` field on `LoaderResult` (see Phase 2.1.2 spec addendum on device-lost recovery).

Default for v1: `retainSource: true` (pixi-like safe). Apps that opt out of the safety net get the lean memory model + must rely on their `RecoveryDescriptor` (URL refetch / SW cache / explicit retain) when device-lost fires.

## Permissive alternatives if the EULA stays a blocker

If Option B's "user brings their own spark" is too high-friction for the runtime story (most users won't deal with the licensing dance), the alternatives are:

1. **Build our own GPU-side encoder.** A WebGPU compute shader that compresses to BC7/ETC2/ASTC. This is non-trivial — block compression algorithms are gnarly — but it's bounded scope (each format is a few hundred lines of WGSL). Open-source references exist (basis_universal's encoder, libastc, NVIDIA's Texture Tools Exporter). 2-3 weeks of dedicated work for a competent implementer per format. We'd start with BC7 (Apple/Mac/PC) and add ETC2 / ASTC for mobile coverage later. **Permissively licensed by us; full control.**

2. **Stay on KTX2 + native-bitmap forever.** No GPU-side encoder in the runtime. PNG/WebP/AVIF stay on the browser's native decode path; sprite atlases get pre-baked KTX2 via our CLI baker. The sparkjs use case (one-off photo content compressed at load time) just doesn't get covered. For most asset workflows this is actually fine — game assets are baked anyway.

3. **Add a different GPU encoder library.** Compressonator-WASM and a few others exist. License audit each. None we found at research time has both (a) GPU-shader-based encoding and (b) a permissive license. If one shows up, evaluate it.

For now, option 2 is what three-flatland already does (Phase 2.1.2). We can revisit option 1 once we have a real demand for it (someone shipping user-uploaded photo content at scale who needs better than browser-native decode).

## Open questions

1. **Is the EULA's "cannot be distributed as part of middleware" interpretation correct?** Email Ludicon (`spark@ludicon.com`) and ask explicitly: "Can we ship a SparkBitmapLoader CLASS in our open-source library that calls a user-provided function — without bundling any spark.js code ourselves — without violating the EULA?" If yes (which is our reading), the hooks-only Option B integration is fine. If no, we drop spark.js entirely.
2. **Is there a non-commercial-only redistribution path?** The EULA distinguishes commercial vs non-commercial. If we ship the hooks-only adapter and clearly mark it as "spark.js integration provided for non-commercial use; commercial users must obtain their own license," it might be a cleaner story.
3. **Does spark.js retain the source `ImageBitmap` after encoding?** Test on a real install (whoever does the integration runs this): profile heap before/after `encodeTexture`, force GC, see if the bitmap is collected. If retained, our adapter wraps the encode call to null the input reference after.
4. **What's the bundle size of `@spark/web`?** Not documented. Out of scope for us since we don't ship it; the user who licenses it deals with the bundle cost.
5. **Per-device output quality** — spark picks BC7/ASTC/ETC2 based on adapter caps. Same source, different output per device. Tooling that previews "what the runtime will look like" needs to communicate the chosen format. Our existing encode tool's preview is for KTX2; spark's preview would be a separate Phase 3.x feature if we ever build it.
6. **Does our existing Phase 2.1.2 LoaderRegistry actually need the `setPreference()` API now**, or is it fine to add later when someone ships a SparkBitmapLoader? Our call: add the field shape now (so we don't break consumers), wire the implementation when needed.

## Phase plan (revised after license audit)

The license audit changes the previous plan. Spark.js integration is no longer a phase we proactively ship — it's a hooks-only seam that lets users plug their own licensed install in if they want.

1. **Phase 2.1.2** (committed) — `BaseImageLoader<T>`, `LoaderRegistry`, our own `Ktx2Loader` + zig-built `basis_transcoder.wasm`. PNG/WebP/AVIF route to `NativeBitmapLoader`. **No spark.js code anywhere.**
2. **Phase 3.0** — `retainSource: false` policy + Ktx2Loader's `mipmaps[]` cleanup + the `recovery: RecoveryDescriptor` field on `LoaderResult`. The memory-conservative path for KTX2 + the device-lost recovery seam (sibling spec on device-lost recovery covers this).
3. **Phase 3.1** — `SparkBitmapLoader` skeleton: the typed adapter class that takes a user-provided `encodeTexture` function. Ships in `@three-flatland/image/loaders/SparkBitmapLoader`. NO `@spark/web` import, NO shader code. Just the interface + the spark-result → CompressedTexture adapter. ~150 LOC of TS, no licensing burden.
4. **Phase 3.2** — opt-in registry preference API + docs for end-users wanting to plug spark in. Tools that want to preview spark output (the existing encode tool's "spark column") would live in a separate `@three-flatland-tools-spark` package the user opts into — not in `@three-flatland/image`.

If Ludicon's response to the open-question email is "no, even hooks count as redistribution," skip Phase 3.1. Drop spark.js entirely and document that the runtime supports KTX2 + native-bitmap; users wanting GPU-side encoding can either bake KTX2 ahead of time or implement their own loader against `BaseImageLoader<T>`.

## Success criteria (revised)

- **Phase 3.0 (memory + recovery)**: 2048² atlas via Ktx2Loader with `retainSource: false` shows ≤ 5 MB CPU residual after upload (measured in DevTools heap snapshot). Device-lost simulation (via `WEBGL_lose_context.loseContext()`) triggers the registered `RecoveryDescriptor` and re-uploads the texture. Default behavior unchanged for users who don't opt in.
- **Phase 3.1 (spark hooks)**: A `SparkBitmapLoader` class exists in `@three-flatland/image/loaders/`. It compiles, typechecks, has unit tests with a mock `encode` function. End-user docs walk through how to wire `Spark.create(device)` from a separately-installed `@spark/web`. **Three-flatland's package.json doesn't list `@spark/web` anywhere.**
- **Phase 3.2 (registry preference)**: Loader registry `setPreference()` works; mock-spark loader registered with priority over native-bitmap routes PNG/WebP/AVIF correctly. Without spark registered, fallthrough to native-bitmap is invisible.

## What we ARE committing to now

Nothing. This document is research + design only. **The license audit's headline finding is the load-bearing decision: we treat spark.js as an end-user-managed dependency, not as a default piece of three-flatland's runtime.** Phase 2.1.2 (already specced) is the next thing to ship; spark hooks (Phase 3.1+) come later if and only if (a) Ludicon confirms the hooks-only model is fine, and (b) someone actually wants the integration enough to drive it.
