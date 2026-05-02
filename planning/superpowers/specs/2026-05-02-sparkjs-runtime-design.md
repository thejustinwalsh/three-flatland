---
date: 2026-05-02
topic: sparkjs-runtime
phase: 3.x (planning)
status: research-design
branch: feat-vscode-tools
predecessors:
  - planning/superpowers/specs/2026-05-02-image-encoder-compare-slider.md  (Phase 2.1.2 BaseImageLoader + LoaderRegistry)
  - planning/vscode-tools/tool-image-encoder.md  (early notes on three loader / KTX2 / spark candidates)
---

# spark.js runtime — what it is, what we need, what it costs

## Why

`@three-flatland/image`'s loader stack (Phase 2.1.2) is being designed format-agnostic from the start. Today the runtime needs `Ktx2Loader` for KTX2; everything else (PNG / WebP / AVIF) goes through native browser bitmap loaders. The Phase 2.1.2 spec leaves a clear seam for a `SparkKtx2Loader` or `SparkNativeLoader` to register alongside, but doesn't commit to building one.

This document is the research + design pass that decides:

1. What spark.js actually is, and what it'd cost us to integrate
2. Whether it requires WebGPU (forcing TSL's WebGPU renderer) or works with WebGL2 (preserving the WebGL fallback)
3. How its memory model compares to KTX2 and to the "deliver WebP and decode in browser" baseline — specifically the pixi.js-style "keep the decoded ImageData around for device-lost recovery" antipattern that balloons RAM
4. Whether KTX2 still has a place once spark.js lands — when each format wins
5. The integration shape against the `BaseImageLoader<T>` + `LoaderRegistry` abstraction from Phase 2.1.2

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

```ts
// WebGPU path
const adapter = await navigator.gpu.requestAdapter()
const required = Spark.getRequiredFeatures(adapter)  // e.g. ['texture-compression-bc', 'texture-compression-astc']
const device = await adapter.requestDevice({ requiredFeatures: required })
const spark = await Spark.create(device)

// WebGL2 path
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
const spark = await SparkGL.create(gl)

// Encode (both paths)
const result = await spark.encodeTexture(source, {
  format: 'rgba',          // channel mask or explicit format
  generateMipmaps: true,
  srgb: true,
  flipY: false,
  outputTexture: prevTex,  // reuse to avoid reallocation
})

// Result shape:
// - WebGPU:    Promise<GPUTexture>
// - WebGL2:    Promise<{ texture, format, sparkFormat, srgb, width, height, mipmapCount, byteLength }>
```

`source` accepts a wide variety: URL string, `HTMLImageElement`, `ImageBitmap`, `HTMLCanvasElement`, `OffscreenCanvas`, `VideoFrame`, `GPUTexture`, `WebGLTexture`. When given a URL, spark loads the image internally (caller doesn't need to fetch + decode first). When given an already-decoded source, spark just reads from it.

### three.js integration helpers

spark.js ships:
- `registerSparkLoader(GLTFLoader)` — extends GLTFLoader to spark-encode embedded textures during glTF parsing
- `createSparkPlugins(...)` — for `3DTilesRenderer`

Neither is wired for sprite atlases or our custom loader hierarchy. We'd write a `SparkLoader` extending `BaseImageLoader<CompressedTexture>` that consumes spark.js directly.

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

## Integration design

### Slot in the existing `LoaderRegistry`

Phase 2.1.2's registry pattern:

```ts
defaultLoaderRegistry.register(lazyKtx2Loader())
defaultLoaderRegistry.register(new NativeBitmapLoader())  // png/webp/avif via ImageBitmapLoader
```

Spark.js adds a third entry. Two design choices:

**Option A: register `SparkKtx2Loader` AT HIGHER PRIORITY than Ktx2Loader.**
- KTX2 inputs route to spark first; if spark can't transcode the basis blocks (which it doesn't natively support — it's an encoder, not a basis transcoder) it falls through to our Ktx2Loader.
- We don't actually want this. Spark doesn't transcode existing GPU-compressed formats; it encodes raw images. KTX2-via-spark isn't a real thing.

**Option B: register `SparkBitmapLoader` instead of `NativeBitmapLoader` for PNG/WebP/AVIF.**
- PNG/WebP/AVIF inputs route to spark, which decodes (via browser) + encodes (via GPU) → CompressedTexture.
- KTX2 inputs continue to route to Ktx2Loader (spark doesn't claim them).
- Caller can opt out per-load via a hint: `loader.parse({ url, useSpark: false })` — falls through to NativeBitmapLoader.
- Default policy is configurable: spark-on for performance-sensitive paths, native-bitmap for simplicity.

**Option C: add as an opt-in via a new `policy` field.**
- Loader registry exposes a global policy: `'native-bitmap' | 'spark' | 'auto'`.
- `'auto'` chooses spark when supported (WebGPU + GPU compressed-texture extensions present), falls back to native-bitmap.
- Tools / runtime consumers can override.

**Recommendation: Option C.** Keeps the registry surface clean; consumers don't need to know what each loader does. The policy is a runtime concern, not a per-call decision.

### `SparkBitmapLoader<CompressedTexture>` shape

```ts
import type { CompressedTexture } from 'three'
import { BaseImageLoader, type LoaderRequest, type LoaderResult } from './BaseImageLoader'

let sparkInstance: { encodeTexture: (...) => Promise<unknown> } | null = null

async function getSpark(renderer: WebGLRenderer | WebGPURenderer) {
  if (sparkInstance) return sparkInstance
  if (isWebGPURenderer(renderer)) {
    const { Spark } = await import('@spark/web')
    sparkInstance = await Spark.create(renderer.getDevice())
  } else {
    const { SparkGL } = await import('@spark/web')
    sparkInstance = await SparkGL.create(renderer.getContext())
  }
  return sparkInstance
}

export class SparkBitmapLoader extends BaseImageLoader<CompressedTexture> {
  format = 'spark-bitmap'

  supports(input: { bytes?: Uint8Array; url?: string }): boolean {
    const ext = (input.url ?? '').split('.').pop()?.toLowerCase()
    return ext === 'png' || ext === 'webp' || ext === 'avif' || ext === 'jpg' || ext === 'jpeg'
  }

  async parse(req: LoaderRequest): Promise<LoaderResult<CompressedTexture>> {
    if (!req.renderer) throw new Error('SparkBitmapLoader requires a renderer')
    const spark = await getSpark(req.renderer)
    const result = await spark.encodeTexture(req.url ?? req.bytes, {
      generateMipmaps: req.options?.mipmaps ?? true,
      srgb: req.options?.srgb ?? true,
      flipY: false,
    })
    // Wrap into a THREE.CompressedTexture our renderer can consume.
    // Both Spark (WebGPU) and SparkGL (WebGL2) results need a small adapter
    // because three's CompressedTexture expects mipmaps[] data, not a raw
    // GPUTexture / WebGLTexture handle. The wrapper either (a) reads back
    // the compressed bytes from the GPU once into mipmaps[], or (b) builds
    // a custom texture subclass that owns the GPU handle directly and
    // bypasses three's normal upload path.
    //
    // (a) keeps compatibility with three's renderer; (b) saves the readback
    // cost. Pick (a) for v1 — measure the readback overhead, evaluate (b)
    // if it's a hotspot.
    const tex = adaptToCompressedTexture(result)
    return { texture: tex, meta: { sparkFormat: result.sparkFormat } }
  }
}
```

The `adaptToCompressedTexture(result)` helper is the load-bearing piece. It's not free — three's renderer expects to manage texture uploads itself, and spark gives us a GPU-resident texture that's already uploaded. Three options:

1. **Read back compressed bytes** from the spark-encoded texture into JS, then build a `CompressedTexture` with `mipmaps[]` populated. The renderer re-uploads. Ugly but compatible.
2. **Subclass `CompressedTexture` to override the upload** — we tell three "the texture is already on the GPU at this handle; don't re-upload, just bind."
3. **Use three's external texture API** (WebGPU has `GPUExternalTexture`; WebGL has similar). May or may not work cleanly with three's NodeMaterial / TSL pipeline.

Option 2 is the win if it works. Option 1 is the safe fallback. Phase 2.1.2's `Ktx2Loader` already does option 1 (KTX2Loader's parse output is a CompressedTexture with mipmaps[]). Following that pattern is the lowest-risk first step; we evaluate option 2 if measurements show readback is a bottleneck.

### Memory residency policy

Once we have `SparkBitmapLoader`, the registry adds a `retainSource: boolean` policy:

```ts
loaderRegistry.setPolicy({
  retainSource: false,  // CRITICAL: drop the ImageBitmap after encode
})
```

Implementation: after `encodeTexture` resolves, our wrapper explicitly nulls the input's reference + revokes any blob URLs. We do NOT trust spark.js to clean up; we own that.

### `Ktx2Loader` mipmaps[] cleanup

Same policy. Phase 2.1.2's Ktx2Loader is currently following three's default which retains `mipmaps[]`. We add a post-upload cleanup pass for textures the user marks as "won't need re-upload":

```ts
loader.parse({ url, options: { releaseMips: true } })
// → after upload, texture.mipmaps = null
// → device-lost recovery requires re-fetching the URL
```

This is the explicit opt-in to skip the pixi-style retention. Default is `false` (keep the safety net). Tools / asset pipelines that know they have re-fetch capability flip this to `true` and save the CPU residual.

## Open questions for the user / further research

1. **Does spark.js retain the source `ImageBitmap` after encoding?** Test required: profile heap before/after `encodeTexture`, force GC, see if the bitmap is collected. If retained, we either work around it (decode externally, pass the result, then null our reference) or report upstream. Do this BEFORE committing to spark.js as a default.
2. **What's spark.js's bundle size?** Not documented. Guess: ~50–100 KB JS + WGSL/GLSL shaders. Acceptable for the runtime if it's lazy-loaded only when needed.
3. **License terms.** spark.js references "external EULA" — need to confirm this is compatible with our MIT/Apache-2.0 stack BEFORE writing integration code. If it's a proprietary or restrictive license, fall back to our own GPU-side encoder (much bigger project) or stick with KTX2.
4. **Animated content support.** Not documented. Sprite-sheet atlases work fine (one big texture, frame indexing in the shader), but real animated formats (GIF / animated WebP / animated AVIF) are out of scope for both spark and KTX2. We accept that.
5. **Per-device output quality.** Spark picks the GPU format based on caps. The same WebP might be BC7 on Mac, ETC2 on mobile, ASTC on phones with the extension. Same source, slightly different output. We need to communicate this in any tooling that previews "what the runtime will look like."

## Phase plan

Spark.js is **Phase 3.x** material — strictly after Phase 2.1.2's loader infrastructure lands. The right order:

1. **Phase 2.1.2** (committed) — `BaseImageLoader<T>`, `LoaderRegistry`, our own `Ktx2Loader` + zig-built `basis_transcoder.wasm`. PNG/WebP/AVIF route to `NativeBitmapLoader`. **No spark.js yet.**
2. **Phase 3.0** — `mipmaps[]` cleanup policy. The pixi-antipattern fix for KTX2. Lets us measure baseline memory residency before spark adds noise.
3. **Phase 3.1** — research-mode spark.js integration. Build a `SparkBitmapLoader` against a real spark.js install, verify the memory model claim, decide if we want it as an opt-in or as default for some content classes.
4. **Phase 3.2** — wire spark policy into the registry. Tools / runtime consumers configure `'native-bitmap' | 'spark' | 'auto'`.

Phase 3.1's verdict can also be "no" — if the EULA is bad, the bundle is huge, or the memory claim doesn't hold. Then we just stay with native-bitmap for non-KTX2 content.

## Success criteria (when each phase lands)

- **Phase 3.0 (mipmaps cleanup)**: 2048² atlas via Ktx2Loader with `releaseMips: true` shows ≤ 5 MB CPU residual after upload (measured in DevTools heap snapshot). Default behavior unchanged.
- **Phase 3.1 (spark research)**: Document confirms or refutes the post-encode memory model. If retained, document the workaround we use; if discarded, document the measured savings.
- **Phase 3.2 (spark policy)**: Loader registry policy `'spark'` produces a working pipeline for PNG/WebP/AVIF → CompressedTexture with measured memory in line with the spark-discards-bitmap row of the comparison table above. `'auto'` picks correctly per device.

## What we ARE committing to now

Nothing. This document is research + design only. The Phase 2.1.2 spec is the next thing to ship. After that lands and we have measured memory baselines, we re-read this and decide phase 3 next steps.
