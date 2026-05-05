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

This unblocks every loader that produces a Texture without going through three's URL-based loader system: KTX2, future GPU-side encoders, programmatically-generated textures, etc.

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


# Phase 2.1.2 — owned KTX2 loader (canonical pattern)

> **Architecture reference:** `.library/three-flatland/loader-architecture.md` is the source of truth for HOW we build loaders. This spec only covers WHAT we're building in this phase — the KTX2 piece. Read the architecture reference first if you haven't.

## Why

Phase 2.1.1 wired KTX2 preview into the encode tool by leaning on three's stock `KTX2Loader` and the `basis_transcoder.{js,wasm}` shipped under `three/examples/jsm/libs/basis/`. That works as a stopgap for one tool, one preview pane — but it's transitive vendor coupling we don't want to ship long-term:

- `three/examples/jsm/loaders/KTX2Loader.js` is technically internal-ish API (it's under `examples/`, not `src/`).
- The `basis_transcoder.{js,wasm}` are vendored upstream binaries we don't control.
- The encode tool needed an unhashed-asset Vite copy plugin (`copyBasisTranscoder()`) plus a throwaway `WebGLRenderer` instance to call `KTX2Loader.detectSupport()` against — both ugly hacks layered to make the third-party loader work.

Phase 2.1.2 replaces all of that with our own owned KTX2 stack:

- `Ktx2Loader.ts` in `@three-flatland/image/loaders/` — TS-ported fork of three's KTX2Loader that extends `three.Loader<CompressedTexture>` directly. Standalone-publishable, R3F `useLoader`-compatible, the canonical loader pattern.
- `basis_transcoder.wasm` built by our zig pipeline (alongside Phase 1's `basis_encoder.wasm`), output to `packages/image/libs/basis/` (same library family — both are basisu artifacts).
- `transcoder-loader.ts` JS wrapper colocated with the wasm.

The encode tool's `ComparePreview` is the first consumer (it swaps three's KTX2Loader for ours). The runtime side — `three-flatland/loaders/TextureLoader` adding an inline KTX2 branch via `await import('@three-flatland/image/loaders/ktx2')` — is **deferred** to a follow-up after `lighting-stochastic-adoption` lands its rewritten TextureLoader/SpriteSheetLoader.

## Architecture (refer to `.library/three-flatland/loader-architecture.md`)

The hard rules from the canonical reference:

1. `Ktx2Loader` extends `three.Loader<CompressedTexture>` **directly**. No `BaseImageLoader`, no `LoaderRegistry`, no shared base class.
2. Standalone-publishable from `@three-flatland/image/loaders/ktx2` subpath. A vanilla three.js / R3F user installs `@three-flatland/image` and `useLoader(Ktx2Loader, url)` works.
3. Wasm artifact lives at `packages/image/libs/basis/basis_transcoder.wasm`, alongside `libs/basis/basis_encoder.wasm` (NOT `vendor/` — `libs/` is for our bespoke build outputs; folder grouped by library family, mirroring three's `examples/jsm/libs/basis/` layout).
4. `@three-flatland/image` declares `three` as an **optional peer** (`peerDependenciesMeta.three.optional: true`). Main entries (encode/decode/CLI) don't need three; only the `loaders/*` subpath does.
5. Tier 1 dispatch (TextureLoader/SpriteSheetLoader doing inline `if (ext === 'ktx2') await import(...)`) is deferred — see "Deferred work" below.

## File map

```
packages/image/
├── src/
│   ├── loaders/
│   │   └── Ktx2Loader.ts                    // NEW — extends three.Loader<CompressedTexture>
│   ├── runtime/
│   │   ├── basis-loader.ts                  // existing (encoder wasm wrapper)
│   │   ├── transcoder-loader.ts             // NEW (transcoder wasm wrapper)
│   │   └── wasi-shim.ts                     // existing (shared WASI proxy)
│   └── zig/
│       ├── basis_c_api.{h,cpp}              // existing — encoder
│       └── basis_transcoder_c_api.{h,cpp}   // NEW — transcoder
├── libs/
│   └── basis/                               // basis_encoder.wasm + basis_transcoder.wasm (same library family)
├── build.zig                                // EDITED — second target for transcoder
├── transcoder_files.zig                     // NEW — transcoder source list
├── package.json                             // EDITED — three optional peer, ./loaders/ktx2 subpath export
└── tsup.config.ts                           // EDITED — add loaders/Ktx2Loader, runtime/transcoder-loader entries

tools/vscode/
├── webview/encode/ComparePreview.tsx        // EDITED — import Ktx2Loader from @three-flatland/image/loaders/ktx2
└── vite.config.ts                           // EDITED — remove copyBasisTranscoder() plugin
```

Note: existing `packages/image/vendor/basis/` (Phase 1's encoder output) is renamed to `packages/image/libs/basis/` in this phase to align with the `libs/` convention. The vendored basisu C++ sources at `packages/image/vendor/basisu/` stay there (those ARE upstream vendored code).

## Tasks (collapsed from prior 12 → 8 net new + revert)

Task IDs map to current TaskList entries.

| ID | Task |
|---|---|
| 91 | T0 — Revert commit `9fba867` (BaseImageLoader/registry wrong turn) — **DONE** |
| 67 | T1 — Vendor + TS-port three's KTX2Loader to `packages/image/src/loaders/Ktx2Loader.ts`, extending `three.Loader<CompressedTexture>` |
| 69 | T3 — `basis_transcoder_c_api.{h,cpp}` — flat C API mirroring `basis_c_api.h` shape |
| 70 | T4 — Add `basis_transcoder` zig build target, output to `packages/image/libs/basis/basis_transcoder.wasm` |
| 71 | T5 — Transcoder JS wrapper at `packages/image/src/runtime/transcoder-loader.ts` |
| 72 | T6 — Wire `Ktx2Loader` to use our transcoder |
| 73 | T7 — `ComparePreview` swap to `@three-flatland/image/loaders/ktx2`; remove `copyBasisTranscoder` Vite plugin and the throwaway WebGLRenderer hack |
| 74 | T8 — Equivalence test (our transcoder vs three's, byte-equality on a fixture) |
| 75 | T9 — Whole-repo gate + bundle size delta |
| 76 | T10 — Test gate report |

(Task IDs 68, 77, 78 — BaseImageLoader, LoaderRegistry, registry-migration — are **deleted**; the canonical pattern rejects them.)

### Recommended execution order

`T1 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10`. Mostly sequential. T1 (KTX2Loader port) and T3/T4/T5 (transcoder build + wrapper) are independent and could run in parallel, but T6 needs both.

### Deferred work (Phase 2.1.3 candidate)

| ID | Task |
|---|---|
| 92 | T13 — `three-flatland/loaders/TextureLoader.ts` adds inline `if (ext === 'ktx2') await import('@three-flatland/image/loaders/ktx2')`. Same for `SpriteSheetLoader` image-load step. Adds `@three-flatland/image` as a hard `dependencies` entry in `packages/three-flatland/package.json`. **Blocked on `lighting-stochastic-adoption` merging** — that branch rewrites TextureLoader/SpriteSheetLoader and we need to graft the KTX2 branch onto its shape, not the current one. **Full spec:** `planning/superpowers/specs/2026-05-04-three-flatland-textureloader-ktx2.md`. |

Until T13 lands, three-flatland users who want KTX2 import `Ktx2Loader` directly from `@three-flatland/image/loaders/ktx2` (Tier 2). The encode tool ships through this path in T7.

## Risks

- **TS-port of KTX2Loader is non-trivial.** Three's source is ~600 LOC of vanilla JS with Worker-based parallel transcoding. Mitigation: first pass converts to TypeScript without restructuring; refactor for our needs in a follow-up. Carry an attribution comment with three's MIT license at the top.
- **Equivalence test depends on stable wasm output.** Our zig+wasm32-wasi build may produce subtly different bytes than three's emscripten build. The test asserts byte-equality of TRANSCODED RGBA output, not the raw transcoder bytes — so binary differences in the wasm are fine as long as the algorithm produces the same pixels. Skip-by-default; run when basisu vendor sources bump.
- **VSCode webview asset resolution** — the `?url` import path for our wasm needs to land at a fetchable URL inside the webview's local-resource allowlist. Phase 1's basis_encoder.wasm already solved this; T5/T6 follow that pattern.

## Done when

- `packages/image/src/loaders/Ktx2Loader.ts` exists, extends `three.Loader<CompressedTexture>`, is the loader `ComparePreview` imports
- `packages/image/build.zig` builds two targets: `basis_encoder.wasm` AND `basis_transcoder.wasm`
- `packages/image/libs/basis/basis_transcoder.wasm` is git-tracked alongside `libs/basis/basis_encoder.wasm`
- `@three-flatland/image` exports `./loaders/ktx2` subpath
- `@three-flatland/image` declares `three` as `peerDependenciesMeta.three.optional: true`
- `tools/vscode/webview/encode/ComparePreview.tsx` no longer imports anything from `three/examples/jsm/...`
- `tools/vscode/vite.config.ts` no longer contains `copyBasisTranscoder()`
- Three's `basis_transcoder.{js,wasm}` no longer appear in the dist output
- pnpm test / build / typecheck all green
- Bundle size delta ≤ +200 KB net
- Test gate report filed at `planning/superpowers/specs/2026-05-02-image-loader-fork-gate-report.md`
