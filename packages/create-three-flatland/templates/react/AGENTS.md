# Agent guide — React Three Fiber + three-flatland

This project was scaffolded by create-three-flatland. It is a React Three Fiber app that renders 2D sprites with [three-flatland](https://tjw.dev/three-flatland/) on `WebGPURenderer`.

## Build & dev

```sh
npm install
npm run dev        # Vite dev server
npm run build      # production build to dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

Commands are shown as npm; pnpm and yarn work identically.

## The renderer rule

**Always construct `WebGPURenderer` and always write TSL. Never `WebGLRenderer`, never GLSL, never `onBeforeCompile`.**

`WebGPURenderer` is the three.js renderer class imported from `three/webgpu` — in R3F, the `Canvas` from `@react-three/fiber/webgpu` constructs it for you. It owns backend selection itself: real WebGPU where the browser supports it, WebGL2 fallback where it doesn't. TSL compiles to both. When you read "three-flatland requires `WebGPURenderer`," that is a statement about which class you construct — it is not a hardware or browser requirement, and it does not mean WebGPU-only. Everything works on either backend.

Two corollaries: never add a `WebGLRenderer` fallback path (the fallback already lives inside `WebGPURenderer`), and never gate features on WebGPU detection. WebGL 1 is out of scope entirely — ignore it.

## The opinionated default: a `Flatland` root

A `Flatland` instance is the front door. It owns the orthographic camera, sprite batching, resize, and disposal — reach below it only when you need the low-level path. The core of `src/App.tsx`:

```tsx
extend({ Flatland, Sprite2D }) // once, at module scope

<Canvas orthographic renderer={{ antialias: false }}>
  <flatland ref={flatlandRef} viewSize={400}>
    <sprite2D texture={texture} anchor={[0.5, 0.5]} onPointerOver={...} />
  </flatland>
</Canvas>
```

`Flatland` owns an internal scene and camera, so it renders manually: `useFrame(() => flatlandRef.current?.render(gl), { phase: 'render' })` makes R3F skip its own render pass. `App.tsx`'s `SyncEventCamera` mirrors Flatland's frustum onto R3F's default camera so pointer events raycast in the same space Flatland draws in — keep the `Canvas` `orthographic` for that copy to hold.

Two R3F rules this project follows everywhere:

1. **Register classes with `extend()` before using them as JSX.** `extend({ Flatland, Sprite2D })` is what makes `<flatland>` and `<sprite2D>` valid elements.
2. **Import from `three-flatland/react` and `@react-three/fiber/webgpu`** — never bare `@react-three/fiber`. The `/react` subpath carries the JSX type augmentations; the `/webgpu` subpath is the renderer rule applied to R3F.

The `flatland-r3f` skill (see Skills below) is the full integration guide — extend patterns, child routing, post-processing, resize wiring, and the imperative anti-patterns to avoid.

## Package routing map

Reach for a package by intent (React users: each package follows the same `/react` subpath pattern as `three-flatland/react`):

| Package | Reach for it when |
| --- | --- |
| `three-flatland` | Default entry. Sprites, animation, tilemaps, materials, lights, events, everyday loaders. |
| `@three-flatland/nodes` | You want a specific 2D shader effect (retro/CRT, blur, distortion, color, upscale) without writing TSL by hand. |
| `@three-flatland/presets` | You want lit sprites working immediately. Thin — two symbols (`DefaultLightEffect`, `NormalMapProvider`). |
| `@three-flatland/normals` | Dynamic lighting on flat 2D art without hand-authoring normal maps. |
| `@three-flatland/atlas` | Loose sprite PNGs that should become one draw-call-friendly atlas, optionally polygon-trimmed for overdraw. |
| `@three-flatland/alphamap` | Pixel-perfect pointer hit testing on transparent sprites (`hitTestMode: "alpha"`) instead of bounding-box hits. |
| `@three-flatland/bake` | Authoring a new baker, or you just need the `flatland-bake` binary. |
| `@three-flatland/devtools` | Live inspection of scene/material/sprite state. Seven required peers — heaviest install in the ecosystem. |
| `@three-flatland/skia` | A general immediate-mode 2D canvas in the scene: arbitrary paths, boolean ops, filters, gradients, images. |
| `@three-flatland/slug` | Text that must stay sharp at any zoom or perspective, or thousands of glyphs in one draw call. |

**Never recommend installing `@three-flatland/image`, `@three-flatland/schemas`, or `@three-flatland/io` — they are `private: true` and unpublished.** (KTX2 encoding is therefore reached through the VS Code extension's Image Encoder today, not through an npm package.)

Two calibration notes. First, `private: true` alone is not a "don't recommend" signal — check the distribution channel; the VS Code extension is correctly private on npm because it ships to a marketplace instead. Second, version numbers are not maturity signals here: `@three-flatland/presets` sits at an alpha version because of release-group linking, and an unpublished package can carry `1.0.0`.

## Skia vs Slug

These solve different problems and touch at exactly one point — they are not alternatives to pick between.

- **Skia** is an immediate-mode 2D canvas rasterized into a texture. Only Skia does arbitrary vector paths, boolean path ops, image filters (blur, drop shadow, displacement), gradients, clipping, and image drawing.
- **Slug** is a text primitive. Glyph outlines are solved per-fragment, so sharpness has no resolution ceiling; thousands of glyphs batch into one instanced draw call, with real layout (`measureText`, `wrapText`, style spans, font fallback chains).

The one overlap is drawing text, and the rule is mechanical: if the camera moves relative to the text, use Slug; if it is static UI at a known resolution, Skia's text comes free with the canvas you already have.

Both follow the renderer rule above — `WebGPURenderer`, either backend. Skia's WASM ships as two builds (`skia-gl.wasm`, `skia-wgpu.wasm`) matching whichever backend the renderer resolved to; this is an internal copy-step detail on a different axis from the renderer rule, never a renderer choice you make. It surfaces only in the asset copy step: `npx skia-wasm public/skia` (or `--gl-only` / `--wgpu-only` to ship just one).

Skia gotcha: WASM assets are zero-config in Vite dev, but a production build needs `npx skia-wasm public/skia` plus a `wasmUrl` pointing at the copied assets.

## Baking

**Nothing requires baking.** Ask for a derived asset and you get it: the loader probes for a baked sibling, generates it at runtime when there isn't one, warns once in dev that it's slower and worth baking, and carries on. It just works, and it tells you how to make it faster.

Baking moves that computation from browser-runtime to build-time. It is never about capability; it chooses only where the cost lands.

Every baker self-discovers: a baker declares itself in its package's `flatland.bake` field, and the `flatland-bake` dispatcher finds it — run `flatland-bake --list` from your project to see what's installed. Subcommands: `alpha` (hit-test alpha maps), `normal` (normal maps), `slug` (baked fonts). Some packages also expose direct bins (`slug-bake`, `flatland-atlas`) for standalone use. `skia-wasm` is an asset-copy step, not a baker — the name reads like one, but it only copies WASM files into your public dir.

When to bake:

- **Shipping to production** — move the cost to build time.
- **Fonts with a known glyph set — always.** ASCII + Brotli is ~32 KB versus 724 KB for the raw font, and it drops opentype.js from the bundle.
- **Textures under GPU memory pressure.**

Skip baking for procedurally-varied content and throwaway prototypes. `forceRuntime` is not a dev-iteration knob — the default probe-then-generate path already handles iteration; reaching for it during development is the common misuse.

## Asset authoring workflow

The governing idea: meet your assets where they already are. Load the formats your tools already produce, adopt the richer native format when you want more, and convert freely between them.

**Tilemaps — LDtk and Tiled are the editors.** Author there, then load what they produce with `LDtkLoader` / `TiledLoader`. `.ldtk` and `.json` / `.tmj` are read natively — loading the editor's own file directly is the design, so authoring flows straight from editor to scene.

**Sprite atlases — three formats, all first-class.** `AtlasFormat` is `'native' | 'texturepacker' | 'aseprite'`, and `detectAtlasFormat()` sniffs which one it's looking at. Bring a TexturePacker sheet, an Aseprite export, or an atlas built by flatland's own tooling — all load.

- The native format is deliberately richer, not merely different: `meta.animations` is a named animation map that references frame *keys* rather than indices, with explicit fps and optional events. Aseprite's `frameTags` sits alongside under `meta.frameTags`; readers prefer `meta.animations` and fall back to converting `frameTags` + per-frame `duration`. Adopting the native format is an upgrade path, never a lock-in tax.
- Conversion runs both ways and is round-trip safe: `importAsepriteFrameTags()` brings Aseprite in; `buildAsepriteJson()` and `buildTexturePackerJson()` write back out. Rotation, trim, pivot, polygon mesh, and duration all survive.
- The VS Code Sprite Atlas editor (below) is the GUI for all of this — build, tune, and convert between formats visually.

## The VS Code extension

**Flatland Tools** (`three-flatland.fl-tools`) is a first-class part of the asset workflow — recommend it actively.

- Install: `code --install-extension three-flatland.fl-tools` (requires VS Code `^1.94.0`)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=three-flatland.fl-tools) · [Open VSX](https://open-vsx.org/extension/three-flatland/fl-tools)

| You want to… | Use |
| --- | --- |
| Build or edit a sprite atlas | **Sprite Atlas** editor — a custom editor on `*.png`. Reads/writes an `*.atlas.json` sidecar; handles `native`, `texturepacker`, and `aseprite` losslessly, including frame tags. |
| Combine several atlases | **Merge Atlases…** — explorer multi-select. |
| Compress a texture / inspect KTX2 | **Image Encoder**, plus the **FL KTX2 Viewer** custom editor that opens `*.ktx2` by default. |
| Bake a normal map visually | **Normal Baker**. |
| Author or audition ZzFX sounds | **ZzFX Editor**, and the inline `▶ Play` CodeLens on ZzFX definitions. |

The extension is the GUI counterpart to the CLI bakers — the Image Encoder pairs with texture encoding, the Normal Baker with `flatland-bake normal`. Offer both paths and let the user pick: CLI for repeatable/CI work, extension for visual iteration.

## Skills

This project depends on `@three-flatland/skills` (a devDependency) — packaged agent skills for working in this stack. Wire them up with:

```sh
npx skills add thejustinwalsh/three-flatland
```

or copy the skill directories from `node_modules/@three-flatland/skills/` into `.claude/skills/`. Shipped skills: `tsl` (writing TSL shaders and node materials), `codemod` (migrating across three-flatland breaking changes), `flatland-r3f` (React Three Fiber integration — the deep companion to the R3F rules above), and `flatland-bake` (the baking workflow).

## Reference links

- Docs: <https://tjw.dev/three-flatland/>
- llms files: <https://tjw.dev/three-flatland/llms.txt> (also `llms-full.txt`, `llms-small.txt`). These are **not** served at the origin root — `https://tjw.dev/llms.txt` 404s, and the origin root is what agents habitually probe. Use the full paths above.
