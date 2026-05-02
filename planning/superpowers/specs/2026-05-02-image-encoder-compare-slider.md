---
date: 2026-05-02
topic: image-encoder-compare-slider
phase: 2.1.1
status: draft
branch: feat-vscode-tools
predecessor: planning/superpowers/specs/2026-05-02-image-encoder-tool-design.md
gate-report: planning/superpowers/specs/2026-05-02-image-encoder-tool-gate-report.md
---

# Compare-slider preview canvas (replaces stacked 2D canvases)

## Why

The current encode tool renders the source image and the encoded preview as two separate `<canvas>` elements via `putImageData`. Two problems:

1. **No KTX2 visual.** The encoded panel shows a placeholder for KTX2 because `decodeImage` doesn't support it. The whole tool's pitch — "compare encoder output side by side" — falls flat for the format people care most about.
2. **Side-by-side at different positions costs you the eye's pixel-level diff sense.** Two panes makes you saccade; an A/B slider over the same pixels makes microartifacts pop.

Squoosh's UX is a single image with a draggable vertical slider. To the left of the slider the original shows; to the right the encoded shows. The eye stays on one set of pixels and the brain notices encoder damage instantly. We want that.

## Design

### Approach: single R3F canvas, two textures, shader-based split

One `<Canvas>` from `@react-three/fiber`. One full-screen quad. A custom material samples either `textureA` (original) or `textureB` (encoded) based on `uv.x < splitU`. An HTML overlay paints the slider line and a draggable handle at the same `splitU`-derived screen position.

Why this beats "two stacked canvases with `clip-path`":
- One GL context, not two. No sync drift, no double init cost.
- The split is sub-pixel exact via shader lookup; CSS `clip-path` is rounded to the nearest CSS pixel.
- Future: easy to add a fade transition, magnifier loupe, or per-channel diff overlay — all just shader edits.

WebGL via R3F's standard `<Canvas>`, NOT WebGPU. Reasoning: KTX2Loader plus the basis transcoder is well-tested on WebGL; mixing in WebGPU's `detectSupport()` path is unnecessary complexity for a tool that doesn't render anything but a quad. If we later move every tool to WebGPU we'll re-evaluate as part of that effort.

### Texture pipeline

```
source bytes ──┬─→ [WebP/AVIF/PNG path] decodeImage → ImageData → CanvasTexture (originalTexture)
               │
               └─→ Tracks separately, no encode dependency

knob change ──→ debounced encode → encodedBytes
                                   │
                                   ├─→ [PNG/WebP/AVIF] decodeImage → CanvasTexture (encodedTexture)
                                   └─→ [KTX2]          KTX2Loader.parse(bytes) → CompressedTexture (encodedTexture)
```

Texture lifecycle: dispose the previous `encodedTexture` before replacing. Original texture is created once per source load. Both textures use linear filtering (we'll add nearest-toggle for pixel-art mode in a later patch).

### KTX2Loader integration

Three's `KTX2Loader` is in `three/examples/jsm/loaders/KTX2Loader.js`. It requires:
- A path to the basis transcoder JS (`basis_transcoder.js`)
- The WebGL renderer (for `detectSupport(renderer)` — picks ASTC/BC/ETC formats based on GPU support)

The transcoder JS+WASM ship with three at `three/examples/jsm/libs/basis/`. We import them via Vite's `?url` suffix, which emits the asset and gives us a webview-safe URL:

```ts
import basisTranscoderJsUrl from 'three/examples/jsm/libs/basis/basis_transcoder.js?url'
import basisTranscoderWasmUrl from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url'
```

Vite then puts both files in `dist/webview/assets/` next to our existing `basis_encoder-<hash>.wasm`. The `KTX2Loader` is told the transcoder path via `loader.setTranscoderPath(...)`. Three's loader internally fetches both the JS and the WASM from there.

CSP / `localResourceRoots` already allow `dist/`, so the loader can fetch from there.

Worker concern: KTX2Loader uses Web Workers internally for transcoding. The current Vite config has `worker: { format: 'es' }` (set in Phase 2.1 for jsquash). Three's KTX2Loader worker is also Emscripten-style; if it trips the same IIFE issue, we'll need the `?worker&inline` pattern from `imageDecoderWorker`. Test on first integration.

### Slider control

HTML overlay div, absolutely positioned over the canvas. Children:
- A vertical line at `splitX` px, full height, 1px wide, theme color
- A round handle at the line's midpoint, 28px diameter, with chevrons hinting drag
- Pointer events on the line + handle drag the slider

The slider's `splitX` is plain React state in the parent, passed to the canvas as a uniform via the material's `splitU` (= `splitX / canvasWidth`). On mouse-up the position persists to the prefs slice (cross-session).

### Component shape

`webview/encode/ComparePreview.tsx` (new):

```tsx
type ComparePreviewProps = {
  originalImage: ImageData | null   // already decoded by App
  encodedBytes: Uint8Array | null   // raw bytes for the encoder output
  encodedFormat: 'png' | 'webp' | 'avif' | 'ktx2' | null
  isEncoding: boolean
  encodeError: string | null
  // Slider position from prefs (0..1 normalized)
  splitU: number
  onSplitChange: (next: number) => void
}
```

The component owns:
- Three.js / R3F mount
- Both textures (created from props)
- KTX2Loader instance (memoized at the component level)
- Slider drag handlers + cursor handling
- Layout (CSS-positioned slider line + handle on top of the canvas)

The component does NOT own:
- Encoder pipeline (still in `encodePipeline.ts`)
- Source decode (still in App's bridge handler)
- Format selection / knobs / save (still in `Knobs.tsx` / `Toolbar.tsx`)

## Replacement scope

`OriginalView.tsx` and `EncodedView.tsx` are deleted. App's body becomes:

```
[Toolbar]
[Header line — filename · dims]
[Knobs]
[ComparePreview (fills body)]
```

No more horizontal Splitter — the compare slider IS the split. Persisted splitter width state moves from `splits.encodedPanel` (px) to `splits.compareU` (0..1).

## Mip-level viewer

KTX2 with `mipmaps: true` ships a mip chain (e.g. for 2048² → 12 levels: 2048, 1024, 512, …, 1). The encoder's whole point is to ship pre-computed mipmaps so the GPU samples the right resolution at distance — but as authors we need to inspect each level. PNG-shrink artifacts at level 9 won't show up in the level-0 view.

### UI

A **mip level stepper** in the toolbar, sitting next to the format / save buttons:

```
[Mip: ◀ 0 / 10 ▶]
```

- Disabled when:
  - Format is not KTX2
  - Format is KTX2 but `mipmaps: false`
  - The encoded texture isn't a `CompressedTexture` with `> 1` mip
- Stepper bounds: `[0, mipCount - 1]` where mip 0 = full resolution.
- Both arrows + a NumberField between them. Up/Down keys increment when focused.

The toolbar reads `mipLevel` and `maxMipLevel` from the store; the canvas reads `mipLevel` and feeds it into the shader as a uniform.

### Shader change

`textureLod()` in WebGL2 fragment shaders samples a specific mip level:

```glsl
uniform sampler2D textureA;
uniform sampler2D textureB;
uniform float splitU;
uniform float mipLevelA;   // 0 for original (no mips on a CanvasTexture by default)
uniform float mipLevelB;   // 0..N for encoded
varying vec2 vUv;
void main() {
  vec4 c = vUv.x < splitU
    ? textureLod(textureA, vUv, mipLevelA)
    : textureLod(textureB, vUv, mipLevelB);
  gl_FragColor = c;
}
```

R3F's default `<Canvas>` requests a WebGL2 context — `textureLod` is universally available. If for any reason WebGL1 is forced, fall back to `texture2DLodEXT(...)` via the `OES_standard_derivatives` extension; we don't expect to hit this.

### Texture configuration for mip selection

For `CompressedTexture` from KTX2Loader, we don't need to do anything — the mip chain is already attached by the loader. We just set `texture.minFilter = THREE.NearestMipmapNearestFilter` so the LOD bias maps cleanly to integer levels (no inter-level blending, which is what we want for inspection).

For the original `CanvasTexture`, we set `mipLevelA = 0` and don't generate mipmaps — the original side of the slider always shows full resolution. That's the correct semantic: "look at the original at full res, look at mip N of the encoded."

### Store fields

```ts
interface DocSlice {
  // ...existing
}

interface RuntimeSlice {
  // ...existing
  encodedMipCount: number   // 1 if no mips; N for KTX2 with mipmaps
}

interface SessionSlice {
  // ...existing
  mipLevel: number          // 0..encodedMipCount-1, defaults to 0
}
```

`mipLevel` lives in the session slice (not zundo-tracked — undoing a mip view change is annoying, not useful). It clamps to `[0, encodedMipCount - 1]` whenever `encodedMipCount` changes (e.g. after re-encoding to a different format), reset to 0 on format change.

`encodedMipCount` is read from the loaded texture: `(texture as CompressedTexture).mipmaps?.length ?? 1`.

## Out of scope (filed for later)

- Pan/zoom on the compare canvas. v1 fits the image to the canvas, no zooming.
- Pixel-art mode (NEAREST filtering toggle for the original side).
- Multiple compare modes (split / fade / diff / loupe).
- Extracting `ComparePreview` into `@three-flatland/preview/canvas` as a reusable primitive. Do it once it's stable in the encode tool — premature reuse is worse than localized v1.
- "Mip atlas" view (all mip levels tiled at once instead of one at a time). The single-level viewer covers the inspection use case; atlas view is nice-to-have.

## Risks

| Risk | Mitigation |
|---|---|
| KTX2Loader's worker fails under the webview's CSP / cross-origin | Fall back to `?worker&inline` (Blob URL same-origin trick from `imageDecoderWorker`). Worst case: tell `KTX2Loader` to use main-thread mode. |
| The `basis_transcoder.wasm` from three is a different version than our zig-built `basis_encoder.wasm` | Encoder and transcoder are decoupled by the KTX2 file format spec — file format compatibility is the contract. As long as both are spec-compliant they interoperate. Three's transcoder is the upstream BinomialLLC transcoder; our encoder is also from BinomialLLC's repo (vendored at v2_1_0). Should be fine. |
| Canvas size + image fit math gets weird with tiny or huge images | Image is fit-to-canvas with object-fit semantics: shorter dim fills, longer dim has padding. Both textures use the same projection so the slider lines up perfectly. |
| Texture upload jitter on every encode (4–8 MB of GPU upload per knob tweak for 2048² UASTC) | Acceptable for v1. KTX2 textures are GPU-compressed so the upload size is much smaller than RGBA8 (153 KB instead of 16 MB for our 2048² fixture). WebP/AVIF uploads are RGBA8 ImageData and are the bigger concern. Workers + transferable ImageData is a Phase 2.2 fix if it becomes a problem. |
| Initial chunk size when adding KTX2Loader + basis transcoder | KTX2Loader is small (~10 KB JS); the basis transcoder is loaded lazily by the loader as a worker on first KTX2 decode. Initial paint chunk should not regress. |

## Success criteria

1. Open a PNG with the encode tool. Source renders in the compare canvas (full pane, slider centered).
2. Default format = WebP. Encoded version is visible to the right of the slider; original visible to the left.
3. Drag the slider — left/right reveal updates pixel-perfectly with no flicker.
4. Switch format to KTX2, mode = ETC1S. Encoded result decodes via KTX2Loader and shows in the right half of the slider.
5. Switch to UASTC. Same: visual update appears.
6. Toggle Mipmaps. Re-encode triggers; texture updates without disposing the original.
7. The slider position persists across panel close/reopen.
8. `pnpm test` / `pnpm build` / `pnpm typecheck` all green.
9. Encode chunk size measured; growth from R3F + three.js is acceptable (the lazy chunk is the right place for it; entry shell still small).

---

# Implementation plan

## File map

**Created:**
- `tools/vscode/webview/encode/ComparePreview.tsx` — R3F canvas + slider + textures + KTX2Loader

**Modified:**
- `tools/vscode/webview/encode/App.tsx` — replace OriginalView/EncodedView/Splitter with `<ComparePreview>`
- `tools/vscode/webview/encode/encodeStore.ts` — replace `splits.encodedPanel` (px) with `splits.compareU` (0..1)
- `tools/vscode/webview/encode/main.tsx` — add `void import('@three-flatland/preview/canvas')` warm-up, OR equivalent if we don't actually use the preview/canvas chunk (depends on whether ComparePreview pulls R3F directly or via preview/canvas)

**Deleted:**
- `tools/vscode/webview/encode/OriginalView.tsx`
- `tools/vscode/webview/encode/EncodedView.tsx`

## Tasks

### Task 1 — Add R3F canvas with original-only display

Create `ComparePreview.tsx` rendering ONE texture (the original) via R3F. No slider yet. No encoded texture. Hard-codes `originalImage` → CanvasTexture. Mount it in `App.tsx` replacing the OriginalView/Splitter/EncodedView trio. Update store: drop `splits.encodedPanel`, add `splits.compareU` (default 0.5). Delete OriginalView.tsx + EncodedView.tsx.

Verify: F5, open a PNG, see the source rendered fullscreen via three.js. No encoded display yet, no slider. Build + typecheck + test green.

Code shape:

```tsx
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function FullscreenQuad({ texture }: { texture: THREE.Texture }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  // The shader gets fancy in Task 2; v1 is just a textured quad.
  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial ref={matRef} map={texture} toneMapped={false} />
    </mesh>
  )
}

export function ComparePreview({ originalImage, ...rest }: ComparePreviewProps) {
  const originalTexture = useMemo(() => {
    if (!originalImage) return null
    const t = new THREE.CanvasTexture(toCanvas(originalImage))
    t.colorSpace = THREE.SRGBColorSpace
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.needsUpdate = true
    return t
  }, [originalImage])

  // dispose on change/unmount
  useEffect(() => () => originalTexture?.dispose(), [originalTexture])

  if (!originalTexture) return <div>loading…</div>

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas orthographic camera={{ position: [0, 0, 5], zoom: 1 }} dpr={[1, 2]}>
        <Suspense fallback={null}>
          <FullscreenQuad texture={originalTexture} />
        </Suspense>
      </Canvas>
    </div>
  )
}

function toCanvas(image: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = image.width
  c.height = image.height
  c.getContext('2d')!.putImageData(image, 0, 0)
  return c
}
```

### Task 2 — Add the slider shader + HTML overlay

Replace `<meshBasicMaterial>` with a custom material that takes two textures and a `splitU` uniform, plus a placeholder second texture (use the same image as both for visual confirmation that the split mechanic works before we wire up the encoded texture). Add an HTML overlay div containing the vertical line + draggable handle. Slider position is local React state for now; persistence comes in Task 4.

Shader (vanilla GLSL via `<shaderMaterial>` — vanilla GLSL is acceptable here because we're inside a self-contained tool surface, not the public TSL package; the project's GLSL ban applies to packages/three-flatland code):

```glsl
// fragment
uniform sampler2D textureA;
uniform sampler2D textureB;
uniform float splitU;
varying vec2 vUv;
void main() {
  vec4 c = vUv.x < splitU ? texture2D(textureA, vUv) : texture2D(textureB, vUv);
  gl_FragColor = c;
}
```

NOTE: if the project's no-GLSL rule extends to all code, replace with TSL via `THREE.ShaderNodeMaterial`. Verify by reading `tools/preview/src/SpritePreview.tsx` — it uses a real material; check whether it's NodeMaterial or vanilla.

Layout: `position: relative` wrapper → R3F `<Canvas>` underneath, absolutely-positioned `<div>` slider line + handle on top with `pointer-events: auto`.

### Task 3 — Wire encoded textures (PNG/WebP/AVIF + KTX2)

For PNG/WebP/AVIF: when `encodedBytes` changes, decode via `decodeImage(bytes, format)` → ImageData → CanvasTexture. Replace `textureB`, dispose the old.

For KTX2:
- Lazy-import KTX2Loader: `const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')`
- Resolve transcoder asset URLs: `import basisJsUrl from 'three/examples/jsm/libs/basis/basis_transcoder.js?url'` and `import basisWasmUrl from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url'`. Use the JS URL's directory for `setTranscoderPath`.
- Initialize KTX2Loader once: `loader.setTranscoderPath(transcoderDir).detectSupport(gl)` — needs the renderer instance, get it via R3F's `useThree(({ gl }) => gl)`.
- On encode: `loader.parse(encodedBytes.buffer.slice(...), (texture) => { ... })`. Replace `textureB`, dispose old.
- KTX2 textures are CompressedTexture; the shader works the same.

If the worker setup hits CSP issues, switch the loader to main-thread mode by passing `null` to `setWorkerLimit()` or whichever opt-out the loader version exposes.

Verify: F5, open a PNG, switch through WebP/AVIF/KTX2/UASTC modes. Each shows visually correctly behind the slider. Drag the slider — pixel-perfect crossover at the line.

### Task 4 — Persist slider position

- Wire `splits.compareU` setter via the slider's pointer-up handler
- Initial value pulled from store on mount, default 0.5
- App.tsx hooks up the store wires

### Task 5 — Mip-level viewer

- Extend store: add `encodedMipCount` to RuntimeSlice (default 1), add `mipLevel` to SessionSlice (default 0)
- Add `setMipLevel(n)` action; clamp to `[0, encodedMipCount - 1]`
- Reset `mipLevel = 0` whenever `encodedMipCount` changes (or format changes)
- After KTX2 decode in Task 3, read `(texture as CompressedTexture).mipmaps?.length ?? 1` and call `setRuntimeFields({ encodedMipCount })`
- For non-KTX2 formats, set `encodedMipCount = 1`
- Toolbar gets a stepper (`◀` decrement, NumberField, `▶` increment) reading from the store. Disabled when `encodedMipCount <= 1`. Disabled label shows `Mip: 0 / 0` (single-level case)
- Shader gets `mipLevelB` uniform from `mipLevel`; `mipLevelA` is hard-coded to 0
- For a `CompressedTexture` from KTX2Loader: ensure `texture.minFilter = THREE.NearestMipmapNearestFilter` so the LOD bias is integer-stepped

Verify: encode a 1024²+ atlas to KTX2 ETC1S+mips. The toolbar shows `Mip: 0 / 10` (or however many levels). Step through levels — the right side of the slider re-renders at each downsampled resolution. Mip 0 = full res (matches the left side). Mip max = a few pixels (the GPU's "viewed from far away" sampling).

### Task 6 — Whole-repo gate + bundle size measurement

- pnpm test / build / typecheck all green
- Encode app chunk size measured (will grow from R3F + three.js + KTX2Loader; record numbers)
- Encode entry shell stays small (the heavy chunk is lazy-loaded)
- Empty-commit checkpoint with measurements

### Task 7 — Test gate report addendum

Append a "Compare-slider addendum" section to `2026-05-02-image-encoder-tool-gate-report.md` covering the new criteria (1–9 above), updated chunk sizes, manual verification checklist (specifically: KTX2 visual works, slider drag is smooth, splitter persists).

## Done when

- KTX2 visually renders behind the slider — the original 9-step manual checklist works for KTX2 too
- Slider drag produces pixel-perfect crossover with no flicker
- Mip stepper shows `Mip: K / N` for KTX2+mips and disabled state for everything else; stepping changes the encoded view to the chosen level
- Bundle sizes recorded; entry shell unchanged
- Whole-repo green
