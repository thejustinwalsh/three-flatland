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

### Architecture: extend the shared canvas primitives, not the encode tool

The compare slider belongs in `@three-flatland/preview/canvas` as a reusable primitive. Concrete near-term consumers we anticipate:

- **encode** — original vs encoded (the immediate driver of this spec)
- **atlas** — sprite-sheet PNG vs its KTX2-compressed build, useful for spotting block-coding artifacts in the atlas tool
- **merge** — two source atlases at the same coordinates, useful when reconciling overlapping atlases
- **slug-text** (future) — typesetting before/after a parameter change
- **skia-based tools** (future) — render before/after with different filters / render passes

Building it inside `tools/vscode/webview/encode/` ships one feature, one consumer, and the immediate-debt of extracting it later when the second tool wants compare. The cost differential between "ship in tools/preview now" and "ship in encode/ now and extract later" is small — and the extraction-later case has a real risk of never happening if the encode-tool version diverges enough that pulling it out becomes its own project. **One set of canvas components, owned by `@three-flatland/preview/canvas`, used by every tool that wants compare.** No duplication.

We compose against the existing canvas stack — `CanvasStage` for the chrome, `ThreeLayer` for the rendering — and add what's missing rather than rebuilding what's there.

#### Generalization needed in `ThreeLayer`

`ThreeLayer.tsx` currently takes `imageUri: string` and uses `useLoader(TextureLoader, imageUri)` internally. That works for any format the browser decodes natively — but blocks KTX2 (which needs `Ktx2Loader` to produce a `CompressedTexture` from bytes).

Generalize the source prop:

```ts
type ImageSource =
  | { kind: 'url'; url: string }
  | { kind: 'texture'; texture: THREE.Texture }

type ThreeLayerProps = {
  imageSource: ImageSource | null
  // ...rest unchanged: zoom, panX, panY, fitMargin, pixelArt, onImageReady
}
```

The `'texture'` path skips `useLoader` and uses the provided texture directly. Existing consumers that pass `imageUri: string` keep working through a backwards-compatible adapter (the prop becomes `imageUri?: string | ImageSource | null` — see Migration below).

This unblocks every loader that produces a Texture without going through three's URL-based loader system: KTX2, future spark.js variants, programmatically-generated textures, etc.

#### New: `CompareLayer` (sibling to `ThreeLayer`)

`CompareLayer` is the two-texture analog of ThreeLayer. Same WebGPU `<Canvas>` from `@react-three/fiber/webgpu`, same orthographic camera + pan/zoom math, but renders BOTH textures via a custom NodeMaterial that samples the appropriate texture based on `uv.x < splitU`. The pan/zoom math is shared — both textures move together (the slider only reveals one or the other; it doesn't pan them independently).

```ts
type CompareLayerProps = {
  imageSource: ImageSource | null         // "left" / original
  compareImageSource: ImageSource | null  // "right" / encoded
  splitU: number                          // 0..1, 0 = all original, 1 = all encoded
  // ... pan/zoom props inherited from ThreeLayer's signature
  mipLevelB?: number                      // KTX2 mip-level inspection (default 0)
}
```

The shader is TSL (`MeshBasicNodeMaterial` with `select(...)` per uv condition) — the project rule is TSL-only for any code that runs inside `@react-three/fiber/webgpu`, and a shared primitive in `@three-flatland/preview` is squarely under that rule. `CompareLayer` does NOT take vanilla GLSL.

#### `CanvasStage` extension

`CanvasStage` is the chrome (pan/zoom + cursor + viewport context + background). It currently takes `imageUri` and pipes it to ThreeLayer. Add an optional `compareImageSource` prop:

```ts
type CanvasStageProps = {
  // EXISTING (kept for back-compat):
  imageUri?: string | null
  // NEW:
  imageSource?: ImageSource | null            // primary image; preferred over imageUri
  compareImageSource?: ImageSource | null     // when set, switches the inner layer to CompareLayer
  // ...rest unchanged
}
```

When `compareImageSource` is null/undefined, CanvasStage routes to `ThreeLayer` (current behavior, no change for atlas/merge consumers). When set, it routes to `CompareLayer`. The pan/zoom + cursor context that CanvasStage already manages is shared with both layer types.

#### `CompareContext` + `useCompareController()`

The slider's `splitU` is mounted-component state, not document state, so it doesn't need to be in zustand. But it needs to be readable by both the CompareLayer (consumer) and the slider HTML overlay (producer). We expose it via React context, exactly mirroring `ViewportContext` / `useViewportController`:

```ts
type CompareController = {
  splitU: number
  setSplitU: (next: number) => void
}

const CompareContext = createContext<CompareController | null>(null)
export function useCompareController(): CompareController { ... }
```

CanvasStage owns the state and provides the context when `compareImageSource` is set. CompareLayer consumes it internally; child overlays consume via the hook.

#### New: `CompareSliderOverlay`

HTML overlay that mounts as a CHILD of CanvasStage, alongside other overlays like `RectOverlay` / `InfoPanel` / `HoverFrameChip`. Reads `splitU` via `useCompareController()`, draws the vertical line + handle at the corresponding screen X, writes back on drag.

```tsx
<CanvasStage imageSource={original} compareImageSource={encoded}>
  <CompareSliderOverlay />
</CanvasStage>
```

The slider is theme-aware (line color / handle color from VSCode tokens) and can be styled by the consumer via a className/style prop. Pan/zoom doesn't move the slider — it's a screen-space control.

#### Pan/zoom + cursor in v1

Because CanvasStage owns these, the encode tool gets pan + zoom + cursor coord/color readout for free. The encode tool's `<InfoPanel>` (mounted as a CanvasStage child) can show the cursor's pixel coords + sampled color at the original side OR the encoded side based on which side of the slider the cursor is on. v1 implementation: read both samples, show both in the InfoPanel ("Orig: rgba(...), Enc: rgba(...)"). This is genuinely useful for spotting compression artifacts.

#### Encode-tool consumer (the simple result)

```tsx
function EncodeApp() {
  const original = useEncodeStore((s) => s.sourceImage)
  const encoded = useEncodedTexture()  // adapter that decodes encodedBytes via the right loader
  return (
    <Panel title="Compare" bodyPadding="none">
      <CanvasStage
        imageSource={original ? { kind: 'texture', texture: makeOriginalTex(original) } : null}
        compareImageSource={encoded ? { kind: 'texture', texture: encoded } : null}
        backgroundStyle="checker"
      >
        <CompareSliderOverlay />
        <InfoPanel />
      </CanvasStage>
    </Panel>
  )
}
```

The encode tool becomes a ~30-LOC composer. Atlas and merge can adopt the same primitive whenever they need an A/B view (e.g., atlas comparing a sprite-sheet against its KTX2 build, merge comparing input vs output atlases).

### Migration plan for the existing ComparePreview work

Phase 2.1.1's Tasks 1–3 (DONE) wired a hand-rolled R3F canvas inside `tools/vscode/webview/encode/ComparePreview.tsx`. Their **logic** carries forward (texture creation from ImageData, KTX2 decode via three's loader as the stopgap), but their **mounting** moves into the new shared primitives:

- The texture-creation effects (`imageDataToTexture`, the encoded-texture useEffect with the reqId race-guard) move to the encode tool's adapter (a small hook that turns store state into ThreeLayer-shaped sources)
- The slider state moves into CompareContext (managed by CanvasStage)
- The shader moves into CompareLayer's TSL material
- The HTML overlay moves to CompareSliderOverlay
- ComparePreview.tsx becomes the small composer above; or the file is deleted and its contents fold directly into App.tsx

Net effect on the encode tool: less code, more capability (pan/zoom + cursor + InfoPanel show up for free).

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

## Panel chrome + custom-editor activation

The current encode tool layout is a free-floating header line above a flex body. The user-facing convention across the existing VSCode tools (atlas, merge) is: the canvas lives inside a `<Panel>` with a single-line header that owns toolbar-style controls (settings menu, format quick-pick, etc.). Atlas's `AtlasMenu.tsx` is the canonical pattern.

### Wrap ComparePreview in a Panel

Replace the bare `<div>` body wrapper with `<Panel bodyPadding="none">` from the design system. The canvas + slider mount inside the panel body. Panel's flex shell handles the surrounding chrome.

Two header-area slots used:
- `title` — short label like `Compare`. Drop the source filename from the panel header (the file URI shows in the editor tab via the custom-editor activation, see below).
- `headerActions` — settings menu (gear icon) + format dropdown + mip stepper + save button, all on a single row. The toolbar stops being a separate row above the panel; it merges into the panel's header.

This gives us a proper VSCode-native chrome and matches the "single-line header, no redundant filename" ask.

### Settings menu

Mirror atlas's `AtlasMenu.tsx`: a `vscode-icon` (gear) that pops a dropdown menu of toggles. v0 entries:
- "Show pixel grid at 1:1" — pixel-art toggle (deferred from compare-slider out-of-scope, but make the menu entry now and gate the implementation behind a follow-up)
- "Reset slider to center"
- "Open save folder" — reveals the source's parent directory in VSCode's explorer

The menu is the place we accumulate future polish (per-channel diff, magnifier loupe, fit modes, etc.) without bloating the toolbar.

### Custom-editor activation

The current encode tool is registered as an ad-hoc `vscode.commands.registerCommand` plus an explorer/context menu entry. That activation pattern is fine for "encode this PNG", but it doesn't tie the panel to the file URI — the panel lives outside VSCode's document lifecycle and the tab title is hand-set ("Encode: foo.png").

We register encode as a `vscode.window.registerCustomEditorProvider` on `*.png`, `*.webp`, `*.avif`, `*.ktx2`. With `priority: "option"` on PNG (atlas remains the primary option), and `priority: "default"` on WebP/AVIF/KTX2 since nothing else handles those.

Outcome:
- The tab shows the file path automatically (no hand-set title), no need for the filename in the panel header
- "Reopen Editor With…" surfaces the encoder in the picker
- Right-click → "Open With" picks up the encoder for the four extensions
- The existing `threeFlatland.encode.open` command is kept as a thin wrapper that calls `vscode.commands.executeCommand('vscode.openWith', uri, 'threeFlatland.encode')` — backwards-compatible with menu entries that already invoke it

Architecturally:
- Replace `extension/tools/encode/host.ts`'s `openEncodePanel(context, target)` with a `EncodeCustomEditorProvider` class implementing `vscode.CustomReadonlyEditorProvider<vscode.CustomDocument>` (atlas's pattern verbatim).
- `resolveCustomEditor(document, panel)` does the work the old `openEncodePanel` did: reads bytes via `vscode.workspace.fs.readFile(document.uri)`, sets up the bridge, emits `encode/init`.
- The command `threeFlatland.encode.open` becomes a one-liner: `vscode.commands.executeCommand('vscode.openWith', uri, EncodeCustomEditorProvider.viewType)`.

### Opening encoded outputs

By registering on WebP/AVIF/KTX2 too, the tool becomes the primary inspector for encoded files, not just an encoder GUI. When opened on a `.ktx2`:
- The "source" IS the encoded file — there's no original to compare against on the left side
- The slider and format-knobs collapse to a single-pane view (slider hidden, both shader sides sample the same texture)
- Save is disabled (you can't encode an already-encoded file in v1; recompressing KTX2 → KTX2 is out of scope)
- The mip stepper still works (KTX2 with mips loads as a CompressedTexture from KTX2Loader)

The encode tool's UI gracefully degrades when there's no source-format-to-encoded-format pair to compare. State-machine-wise: introduce a `mode: 'encode' | 'inspect'` derived from the source extension.

This requires Phase 2.1.2's transcoder + KTX2Loader fork to land first for KTX2 inspection — until then, `.ktx2` files open in inspect-mode using three's vendored loader, identical to the encode-flow's KTX2 preview path.

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

### Task 6 — Panel chrome + settings menu + single-line header

Wrap `ComparePreview` in `<Panel bodyPadding="none">` with:
- `title="Compare"`
- `headerActions` carrying the format dropdown, mip stepper, save button, settings menu (gear icon)

Drop the dedicated `<Toolbar>` row — it merges into the panel header. The standalone filename header line is removed (the editor tab carries the file URI now via Task 7's custom-editor activation).

Settings menu: a new `EncodeMenu.tsx` mirroring `webview/atlas/AtlasMenu.tsx`. v0 entries:
- "Reset slider to center" → calls `setSplits({ compareU: 0.5 })`
- "Open save folder" → bridge call `encode/reveal-folder` → host runs `vscode.commands.executeCommand('revealFileInOS', target)`
- "Show pixel grid at 1:1" — checkbox; implementation deferred (gates a CSS overlay we'll add in 2.1.2 or later)

### Task 7 — Custom-editor activation on .png / .webp / .avif / .ktx2

Replace `extension/tools/encode/host.ts`'s `openEncodePanel(...)` with an `EncodeCustomEditorProvider` class implementing `vscode.CustomReadonlyEditorProvider<vscode.CustomDocument>`. Atlas's `extension/tools/atlas/provider.ts` is the canonical reference.

`extension/tools/encode/register.ts`:
- Register the provider via `vscode.window.registerCustomEditorProvider`
- Reduce the existing `threeFlatland.encode.open` command to a thin wrapper that calls `vscode.commands.executeCommand('vscode.openWith', uri, EncodeCustomEditorProvider.viewType)` — keeps the explorer/context menu and command palette entries working

`package.json` `contributes.customEditors` (new section):
```json
{
  "viewType": "threeFlatland.encode",
  "displayName": "FL Image Encoder",
  "selector": [
    { "filenamePattern": "*.png" },
    { "filenamePattern": "*.webp" },
    { "filenamePattern": "*.avif" },
    { "filenamePattern": "*.ktx2" }
  ],
  "priority": "option"
}
```

Use `priority: "option"` everywhere for v1 — atlas owns the default-option for PNG and the encoder is a chooser pick. We re-evaluate if WebP/AVIF/KTX2 should default-to-encoder once it stabilizes.

For `.ktx2`, `.webp`, `.avif` opened directly: the tool enters **inspect mode**:
- The source IS the encoded file — both shader sides sample the same texture
- The slider is hidden (no point comparing identical content)
- Format / quality knobs disabled (you can't re-encode an encoded file in v1)
- Save disabled
- Mip stepper still works for `.ktx2` (multiple mip levels visible in the loaded CompressedTexture)

The mode is derived from the source file's extension in App's bridge handler:
```ts
const isInspectOnly = ['ktx2', 'webp', 'avif'].includes(ext)
loadInit({ ..., mode: isInspectOnly ? 'inspect' : 'encode' })
```

Add `mode: 'encode' | 'inspect'` to the SessionSlice with default `'encode'`.

### Task 8 — Whole-repo gate + bundle size measurement

- pnpm test / build / typecheck all green
- Encode app chunk size measured (will grow from R3F + three.js + KTX2Loader; record numbers)
- Encode entry shell stays small (the heavy chunk is lazy-loaded)
- Empty-commit checkpoint with measurements

### Task 9 — Test gate report addendum

Append a "Compare-slider + Panel chrome addendum" section to `2026-05-02-image-encoder-tool-gate-report.md` covering the new criteria (compare slider, mip viewer, panel chrome, custom-editor activation, inspect-mode for encoded files), updated chunk sizes, manual verification checklist.

## Done when

- KTX2 visually renders behind the slider — the original 9-step manual checklist works for KTX2 too
- Slider drag produces pixel-perfect crossover with no flicker
- Mip stepper shows `Mip: K / N` for KTX2+mips and disabled state for everything else; stepping changes the encoded view to the chosen level
- The compare canvas lives inside `<Panel>` with single-line header; settings menu is functional
- Right-clicking a .ktx2/.webp/.avif file opens the encoder in inspect mode; the editor tab shows the file URI; no panel-header filename
- Bundle sizes recorded; entry shell unchanged
- Whole-repo green

---

# Phase 2.1.2 — three-flatland image loader stack (owned, format-agnostic, lazy-everywhere)

## Why this is bigger than the encode tool

Phase 2.1.1 wired KTX2 visual preview into the encode tool by leaning on three's stock `KTX2Loader` and the `basis_transcoder.{js,wasm}` shipped under `three/examples/jsm/libs/basis/`. That worked as a stopgap for one tool, one preview pane.

But this loader work is **not just for the encode tool**. It's the loader stack the three-flatland runtime uses to ingest images. The contract we're building toward:

> "Hand a three-flatland loader any image format (PNG / WebP / AVIF / KTX2 / future spark.js KTX2-X) and it produces the right three.js texture. Native browser decoders handle the formats they support; wasm only ships for the formats they don't (KTX2 today, future GPU-compressed variants tomorrow)."

The encode tool happens to be the first consumer, but `SpriteSheetLoader`, `TextureLoader`, future PBR-material loaders, and animation-aware atlas loaders all compose against this base.

### Browser-native first, wasm only when necessary

Critical scope constraint: **the runtime is browser-only.** Modern browsers natively decode PNG, WebP, and AVIF via `<img>` / `createImageBitmap` / `THREE.ImageBitmapLoader`. We do NOT ship wasm decoders for those formats in the runtime — that would duplicate the browser's built-in capability and bloat every page that uses three-flatland.

The wasm-based decoders in `@three-flatland/image` exist for **tools** (encode tool, CLI bakers) where we need byte-level control or run outside a browser context. Those decoders stay where they are; runtime loaders stay light.

That leaves exactly one format in the runtime that requires custom code: **KTX2**. Browsers can't decode it (it's a GPU container), and three's stock `KTX2Loader` is the only path today. We fork it (with our zig-built transcoder) so we own the binary, can extend the loader (spark.js variants, custom mip strategies), and don't drift with three's upstream.

### Scope summary

- **Build**: `BaseImageLoader<T>` abstraction, `Ktx2Loader` subclass, our zig-built `basis_transcoder.wasm`, lazy registry that defaults non-KTX2 to three's `ImageBitmapLoader` / `TextureLoader`
- **Don't build**: `WebpLoader`, `AvifLoader`, `PngLoader` — browsers handle those
- **Compose**: three-flatland's `SpriteSheetLoader` / `TextureLoader` route via the registry; KTX2 goes to our loader, everything else to native browser paths
- **Encode-tool side**: ComparePreview swaps to our `Ktx2Loader`. The tool's WebP/AVIF preview path keeps using `@three-flatland/image`'s wasm decoders because the encoder side already loads them — no duplicate bloat in the tool, the wasm is already paid-for

Two specific compromises Phase 2.1.1 inherited that we close out here:

1. **We don't own the transcoder binary.** The basis transcoder shipped with three is BinomialLLC's reference binary, built with whatever flags Emscripten uses. We've already vendored the same upstream sources at `packages/image/vendor/basisu/transcoder/` — the encoder's link needed `basisu_transcoder.cpp`. Adding a parallel zig target that builds `basis_transcoder.wasm` with our `-msimd128` + WASM SIMD path is a small additional cost; the payoff is one toolchain, one set of SIMD paths, both halves of the codec under our control.

2. **We don't own the loader.** Three's `KTX2Loader` is single-purpose: read KTX2 → return a `CompressedTexture`. Future work — spark.js KTX2-X variants, custom mip strategies, animation-aware sprite atlases, format-agnostic SpriteSheetLoader, lazy-everything texture loaders — needs a loader hierarchy we can extend. Monkey-patching three's class is fragile; forking is a one-time cost that pays back across every future loader.

Phase 2.1.2 builds:
- The owned transcoder binary (zig build)
- A `BaseImageLoader<T>` abstraction designed for three-flatland-wide use
- A `Ktx2Loader` extending it (ports three's KTX2Loader, swaps in our transcoder)
- Migration of three-flatland's existing `TextureLoader` / `SpriteSheetLoader` to compose against `BaseImageLoader`
- The encode tool's `ComparePreview` swap to the new loader (simultaneous validation that the new stack works in a webview consumer)

User-visible: nothing regresses. KTX2 preview still works in the encode tool, sprite-sheet loading still works in three-flatland examples. **Behind the scenes, every format flows through one consistent pipeline that knows how to lazy-load its own dependencies.**

## Architecture

```
packages/image/
├── src/loaders/
│   ├── BaseImageLoader.ts        // abstract Loader<T> with fetch/cache/error handling
│   ├── Ktx2Loader.ts             // forked from three's KTX2Loader, parameterized over our transcoder
│   └── (future) SpriteLoader.ts, SparkKtx2Loader.ts, …
├── vendor/basisu/transcoder/
│   └── (already vendored in Phase 1)
├── src/zig/
│   └── basis_transcoder_c_api.{h,cpp}   // flat C API for the transcoder, mirroring basis_c_api.h
└── build.zig    // adds a SECOND target — basis_transcoder_encoder is the existing one,
                 //                          basis_transcoder is the new one
```

### `BaseImageLoader<T>` — the abstraction

The abstraction has to satisfy two quite different consumer shapes:

1. **Webview tools** (encode, future inspect tools) — pass `Uint8Array` bytes, get back a three.js `Texture` they can put in a shader. Renderer is required for `CompressedTexture` paths (format support detection).
2. **three-flatland runtime** (`SpriteSheetLoader`, `TextureLoader`, future PBR loaders) — pass a URL, get back a `Texture` that's already wired into three's resource lifecycle. The runtime composes loaders by format-detecting the URL and routing to the right subclass.

The base is shaped to support both.

```ts
// packages/image/src/loaders/BaseImageLoader.ts

export interface LoaderRequest {
  // Source — exactly one of these is set.
  bytes?: Uint8Array | ArrayBuffer
  url?: string
  // For loaders that need a renderer / GL context (KTX2 transcoder picks
  // GPU format from the renderer's caps), pass it through. Both WebGL and
  // WebGPU renderers are accepted — subclasses adapt internally.
  renderer?: WebGLRenderer | WebGPURenderer | null
  // Per-load options (e.g., generate mipmaps, sRGB color space). Each
  // subclass declares its own options shape.
  options?: unknown
}

export interface LoaderResult<T> {
  texture: T
  // Loader-specific metadata that callers can read after parse.
  meta?: Record<string, unknown>
}

export abstract class BaseImageLoader<T extends Texture = Texture> {
  abstract readonly format: string

  /**
   * Magic-number / extension-based detection. Loaders are dispatched by
   * walking a registry of registered loaders and calling supports() on
   * the bytes (or extension prefix from the URL). The first match wins.
   */
  abstract supports(input: { bytes?: Uint8Array; url?: string }): boolean

  /**
   * Parse bytes (or fetch then parse) and return a Texture. Lazy-load
   * any wasm dependencies inside parse() — never at module load time.
   */
  abstract parse(req: LoaderRequest): Promise<LoaderResult<T>>

  // Utility: fetch URL → bytes. Subclasses can override for caching.
  protected async fetchBytes(url: string): Promise<Uint8Array> { ... }

  // Utility: extract a file extension from a URL.
  protected extOf(url: string): string { ... }
}
```

Key design decisions:

- **Renderer parameter accepts WebGL OR WebGPU.** Three has two renderer classes, and three-flatland's roadmap is WebGPU-first while still supporting WebGL. The `KTX2Loader` fork adapts internally: WebGL path uses `renderer.capabilities`/`extensions`; WebGPU path uses the WebGPU `device.features` (the BC/ASTC/ETC GPU format support flags). Loaders that don't need a renderer (PNG/WebP/AVIF) accept `null`.
- **Lazy-load wasm INSIDE `parse()`.** `BaseImageLoader.ts` and `Ktx2Loader.ts` do not statically import the transcoder JS or WASM. The transcoder bytes are fetched + instantiated on first `parse()` call (and cached at the module level for subsequent calls). This means: `import { Ktx2Loader } from '@three-flatland/image/loaders'` is cheap — it brings in maybe 2 KB of class definition. The 500 KB transcoder WASM only ships when someone actually loads a KTX2 file. Same pattern for the JPEG-decode path inside any future JpegLoader, etc.
- **Format dispatch via a registry, not a switch.** The runtime exposes a `LoaderRegistry` that holds a list of loaders and walks them in order. Adding a new format is a register call, not a code edit on a central switch. This is what unblocks SparkKtx2Loader to slot in next to Ktx2Loader without touching the dispatcher.

```ts
// packages/image/src/loaders/registry.ts
export class LoaderRegistry {
  private loaders: BaseImageLoader[] = []
  register(loader: BaseImageLoader): void { this.loaders.unshift(loader) }
  resolve(input: { bytes?: Uint8Array; url?: string }): BaseImageLoader | null {
    return this.loaders.find((l) => l.supports(input)) ?? null
  }
}

// Default registry — opinionated for three-flatland's stack.
// Ktx2Loader is lazy (a thin proxy that imports the real loader + wasm on
// first parse()). The native bitmap fallback is eager (just wraps
// THREE.ImageBitmapLoader, no wasm) and matches everything else.
export const defaultLoaderRegistry = new LoaderRegistry()
defaultLoaderRegistry.register(lazyKtx2Loader())          // matches *.ktx2
defaultLoaderRegistry.register(new NativeBitmapLoader())  // matches png/webp/avif
```

### Compose into three-flatland's existing loaders

three-flatland already ships `SpriteSheetLoader` (atlas) and `TextureLoader` wrappers that today only handle PNG. We migrate them to compose against `BaseImageLoader`:

```ts
// BEFORE — packages/three-flatland/src/loaders/TextureLoader.ts (illustrative)
const tex = await new THREE.TextureLoader().loadAsync(url)
return tex

// AFTER
import { defaultLoaderRegistry } from '@three-flatland/image/loaders'
const loader = defaultLoaderRegistry.resolve({ url })
if (!loader) throw new Error(`No loader for ${url}`)
const { texture } = await loader.parse({ url, renderer })
return texture
```

Result: `SpriteSheetLoader` and `TextureLoader` accept any of the four formats transparently. KTX2 atlases just work. The wasm dependencies are pulled in ONLY for the formats actually encountered.

### The Phase 2.1.2 subclass list (deliberately narrow)

- `Ktx2Loader<CompressedTexture>` — KTX2 / Basis Universal, lazy-loads our transcoder. **The only custom subclass we ship.**

For PNG / WebP / AVIF, the registry returns a thin `NativeBitmapLoader` that wraps `THREE.ImageBitmapLoader` (or `TextureLoader` as a fallback). It contains no wasm — just the native browser decode path with a Texture wrapping the result. Counted as a "subclass" only because it satisfies the `BaseImageLoader` interface; conceptually it's the no-op fallback that says "browser handles this."

### Future subclasses (NOT in this phase, but the abstraction supports them)

- `SparkKtx2Loader<CompressedTexture>` — when spark.js lands, register a higher-priority loader for KTX2 that uses spark.js's GPU transcoding path; falls through to our Ktx2Loader on unsupported devices
- `AnimatedSpriteLoader<SpriteSheet>` — loads animated sprites with sidecar atlas JSON; format-agnostic via the registry
- `PbrTextureSetLoader<{ albedo, normal, mr }>` — loads multi-image PBR materials, registry handles per-channel format dispatch

### `Ktx2Loader` — forked from three.js

Three's `KTX2Loader` source lives at `three/examples/jsm/loaders/KTX2Loader.js` (~600 LOC of vanilla JS). The fork:

1. Copy the source verbatim into `packages/image/src/loaders/Ktx2Loader.three.ts`.
2. Convert to TypeScript (return types, parameter types, class field types — should be a couple hours).
3. Refactor: separate the "read KTX2 container" logic from the "transcode basis blocks via the transcoder JS" logic. Three's KTX2Loader has both wired together; we want them separable so future variants can reuse the container logic.
4. Subclass `BaseImageLoader<CompressedTexture>` so it fits our hierarchy.
5. Replace the transcoder-JS loading path: instead of `setTranscoderPath('three/examples/jsm/libs/basis/')`, read our own JS+WASM URLs (Vite `?url` imports of the artifacts the new zig target produces).
6. Keep the renderer-dependent format selection logic (`detectSupport(renderer)`) — this is correct and we don't need to change it.

The forked loader carries an attribution comment at the top citing three.js's MIT license.

### Zig basis_transcoder target

The current `packages/image/build.zig` builds `basis_encoder.wasm`. We add a second target:

```zig
// build.zig (additions)
const transcoder = b.addExecutable(.{
    .name = "basis_transcoder",
    .root_module = b.createModule(.{ .target = target, .optimize = optimize }),
})
transcoder.entry = .disabled
transcoder.rdynamic = true
transcoder.export_table = true
transcoder.initial_memory = 16 * 1024 * 1024  // smaller than encoder's 32 MB
transcoder.max_memory = 256 * 1024 * 1024
transcoder.wasi_exec_model = .reactor

// Reuse the same vendor sources, with a different subset:
transcoder.addCSourceFiles(.{
    .root = b.path("vendor/basisu/transcoder"),
    .files = &transcoder_files, // hand-listed: basisu_transcoder.cpp + needed deps
    .flags = transcoder_cxx_flags, // same simd + WASM_SIMD flags as encoder
})
transcoder.addCSourceFile(.{
    .file = b.path("src/zig/basis_transcoder_c_api.cpp"),
    .flags = transcoder_cxx_flags,
})
// ... include paths, linkLibCpp, etc.

// wasm-opt -Oz post-link, install to vendor/basis/basis_transcoder.wasm
// (so it sits next to basis_encoder.wasm)
```

The transcoder source is much smaller than the encoder: `basisu_transcoder.cpp` (~5k LOC) plus a few headers. Build time is fast.

### `basis_transcoder_c_api.cpp` — flat API

Mirrors `basis_c_api.h`'s shape. Functions:

```c
// Memory helpers — same as encoder
void* fl_basis_transcoder_alloc(size_t bytes)
void  fl_basis_transcoder_free(void* p)

// One-shot init
int fl_basis_transcoder_init(void)

// Open a KTX2 file in memory; returns an opaque handle or null on error.
typedef struct fl_basis_ktx2_file fl_basis_ktx2_file
fl_basis_ktx2_file* fl_basis_ktx2_open(const uint8_t* bytes, uint32_t len)
void                fl_basis_ktx2_close(fl_basis_ktx2_file* f)

// File metadata
uint32_t fl_basis_ktx2_width(fl_basis_ktx2_file* f)
uint32_t fl_basis_ktx2_height(fl_basis_ktx2_file* f)
uint32_t fl_basis_ktx2_levels(fl_basis_ktx2_file* f)
uint32_t fl_basis_ktx2_format(fl_basis_ktx2_file* f)  // ETC1S / UASTC enum
uint32_t fl_basis_ktx2_has_alpha(fl_basis_ktx2_file* f)

// Transcode level i to a target GPU format (caller picks based on GPU caps).
// out_ptr/out_len are filled with the output block buffer.
// Returns 0 on success, negative error code on failure.
int fl_basis_ktx2_transcode_level(
  fl_basis_ktx2_file* f,
  uint32_t level,
  uint32_t target_format,    // ETC2_RGBA, BC7_RGBA, ASTC_4x4, RGBA8 fallback, ...
  uint8_t** out_ptr,
  uint32_t* out_len
)
```

JS wrapper (`Ktx2Loader.ts`) calls these to walk a KTX2 file's mip chain, picks a format the renderer's GL caps support, and copies out the transcoded bytes into a `CompressedTexture.image` array.

### Replacing three's loader in ComparePreview

ComparePreview's KTX2 path currently does:

```ts
const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
const loader = new KTX2Loader().setTranscoderPath(...).detectSupport(renderer)
const tex = await new Promise(r => loader.parse(buffer, r))
```

After Phase 2.1.2 it becomes:

```ts
import { Ktx2Loader } from '@three-flatland/image/loaders/ktx2'
const loader = new Ktx2Loader()  // or shared module-level singleton
const result = await loader.parse({ bytes: encodedBytes, renderer })
const tex = result.texture
```

The implementation work in 2.1.2 is invisible to ComparePreview — just a swap of the import. The reward shows up later when we extend the loader for spark.js or animation-aware sprites.

## Risks

| Risk | Mitigation |
|---|---|
| KTX2Loader's source is non-trivial; the TS port may take longer than expected | Time-box: if the port exceeds 1 day, ship the JS source verbatim with a `.d.ts` shim and TS-port incrementally. Functional parity beats type purity here. |
| Three updates `KTX2Loader` and we drift | Acceptable. We update from upstream when we want a specific bugfix or feature; otherwise we stay on the fork. Document the upstream rev (commit SHA at fork time) in a `LOADER_FORK.md` or in the file header. |
| Building the transcoder doubles the wasm size users download | One-time cost (~500 KB compressed). Both binaries are lazy-loaded — encoder when the user picks an encode format, transcoder when the user opens a `.ktx2` or previews KTX2 output. The pages that don't need them don't load them. |
| Our zig-built transcoder produces different output than three's stock transcoder | Both compile from the same upstream source rev. Output should be byte-identical for a given KTX2 input. Validate with a single-byte-equivalence test (transcode the same KTX2 with both binaries; assert the output buffer matches). If it diverges, rev pin or build flag drift is the most likely cause. |

## Tasks (Phase 2.1.2)

### Task 1 — Vendor and TS-port three's KTX2Loader

- Copy `node_modules/three/examples/jsm/loaders/KTX2Loader.js` to `packages/image/src/loaders/Ktx2Loader.ts`
- Add upstream attribution + license header
- Convert to TypeScript progressively: type the public surface first (Loader API), then internals
- Add unit tests against a small fixture KTX2 file (asserts container metadata, level count, format byte)
- Pin the upstream three.js rev in a comment header

### Task 2 — Define `BaseImageLoader<T>` abstraction

- New file `packages/image/src/loaders/BaseImageLoader.ts`
- Abstract methods: `supports(bytes)`, `parse(req)`
- Common helpers: `fetchBytes(uri)`, `readBytes(file)`
- Update `Ktx2Loader` to extend it

### Task 3 — Add `basis_transcoder_c_api.{h,cpp}`

- Header at `packages/image/src/zig/basis_transcoder_c_api.h`
- Implementation at `packages/image/src/zig/basis_transcoder_c_api.cpp` wrapping `basisu_transcoder.cpp`'s API (open, query metadata, transcode level)
- All exports tagged with `__attribute__((export_name(...)))`

### Task 4 — Add zig basis_transcoder target

- Modify `packages/image/build.zig` to add a second `addExecutable` target alongside the encoder
- Source list `packages/image/transcoder_files.zig` (or inline) — much smaller than encoder
- Same flag set: `-msimd128`, `BASISU_SUPPORT_WASM_SIMD=1`, `BASISU_SUPPORT_SSE=1` (so wasm SIMD path takes effect)
- wasm-opt -Oz post-link
- Output: `packages/image/vendor/basis/basis_transcoder.wasm`

### Task 5 — JS wrapper: `runtime/transcoder-loader.ts`

- Mirror `basis-loader.ts` but for the transcoder
- Vite `?url` imports for the new wasm + the (small) JS bridge
- WASI Proxy shim shared with `basis-loader.ts` (extract into `runtime/wasi-shim.ts` if not already shared — Phase 1's basis-loader already used the shared shim, just re-use)

### Task 6 — Update Ktx2Loader to use our transcoder

- Replace three's `setTranscoderPath` calls with our flat-C-API calls via the transcoder JS wrapper
- Container parsing logic from the forked loader stays
- Format selection (`detectSupport(renderer)`) stays
- Result shape (`CompressedTexture` with mipmaps) stays

### Task 7 — ComparePreview swap

- Replace `import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'` with `import { Ktx2Loader } from '@three-flatland/image/loaders/ktx2'`
- Drop the Vite `?url` imports of three's `basis_transcoder.{js,wasm}` — those assets stop being emitted
- Verify the visual output is byte-identical to the pre-2.1.2 behavior

### Task 8 — Equivalence test (our transcoder vs three's)

- Build both binaries, transcode the same KTX2 fixture, assert byte-equality of the transcoded RGBA output
- One-shot test in `packages/image/src/loaders/Ktx2Loader.equivalence.test.ts`
- Skipped by default; run when the basis transcoder vendor sources are bumped

### Task 9 — Whole-repo gate + bundle size

- pnpm test / build / typecheck all green
- Inspect `dist/webview/assets/` for the new `basis_transcoder-*.wasm` (replacing three's)
- Compare bundle sizes pre/post 2.1.2: net change should be small (one wasm out, one wasm in; both ~500 KB)

### Task 10 — Test gate report

- New report: `planning/superpowers/specs/2026-05-02-image-loader-fork-gate-report.md`
- Cover: TS port quality, transcoder build success, equivalence test result, bundle deltas
- "What's next" — Phase 2.1.3 candidates: SpriteLoader on the new base; SparkKtx2Loader subclass; pre-emptive sparkbasis support

## Done when (Phase 2.1.2)

- `packages/image/src/loaders/Ktx2Loader.ts` exists and is the loader ComparePreview imports
- `BaseImageLoader<T>` abstract base exists in `packages/image/src/loaders/`
- `packages/image/build.zig` builds two targets: `basis_encoder.wasm` AND `basis_transcoder.wasm`
- `vendor/basis/basis_transcoder.wasm` is git-tracked (just like `basis_encoder.wasm`)
- ComparePreview no longer imports anything from `three/examples/jsm/...`
- Three's `basis_transcoder.{js,wasm}` no longer appear in the dist output
- pnpm test / build / typecheck all green
- Bundle size delta ≤ +200 KB net (likely much less, since we replace three's transcoder JS+WASM with ours)
