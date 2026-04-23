# Tool: Normal Baker

## Goal

Bake normal maps from albedo (or explicit height) sprites. Ship as (a) a standalone publishable CLI + library and (b) a GUI webview inside the suite that reuses atlas-editor components.

## Status

**Greenfield.** Repo search confirmed no existing normal-map baker exists. The only "bake" CLI is `slug-bake` for fonts (at `packages/slug/src/cli.ts`). The PRD lists `normalFromHeight(heightMap, strength)` and `normalFromSprite(sprite, depth)` as wishlist TSL node signatures ([THREE-FLATLAND-PRD.md:346-349](/Users/tjw/Developer/three-flatland/planning/THREE-FLATLAND-PRD.md)) but nothing is implemented.

## Two deliverables

### (1) `packages/normal-baker` — standalone

Public npm package. Mirrors `packages/slug` layout.

```
packages/normal-baker/
  package.json
    bin: { "normal-bake": "./dist/cli.js" }
    exports:
      '.'    → bakeNormal programmatic API
      './cli' → CLI entry
  src/
    bakeNormal.ts     # pure function, no VSCode deps
    cli.ts            # argv parsing, file IO, sidecar write
    index.ts          # re-export
  README.md
```

**API**:

```ts
export interface BakeNormalOptions {
  image: Uint8Array          // PNG bytes
  mode?: 'albedo' | 'height' // default: 'albedo' (derive height from luminance)
  strength?: number          // 0..10, default 4
  blur?: number              // 0..5 px, default 0
  invertY?: boolean          // default false (DirectX vs OpenGL)
  tile?: boolean             // default false (seamless vs clamped edges)
  channel?: 'r' | 'g' | 'b' | 'a' | 'luma' // source channel; default 'luma'
  alphaMask?: boolean        // zero normals where alpha == 0; default true
}

export interface BakeNormalResult {
  png: Uint8Array            // baked normal map PNG
  sidecar: {
    app: 'normal-baker'
    version: '1.0'
    source: string           // basename of input
    strength: number
    blur: number
    invertY: boolean
    tile: boolean
    channel: string
  }
}

export function bakeNormal(opts: BakeNormalOptions): Promise<BakeNormalResult>
```

**Algorithm** (Sobel by default):
1. Decode PNG (via `@napi-rs/canvas` or `pngjs` — pick pure-JS to avoid native deps in the CLI).
2. Optional Gaussian blur on source channel.
3. Sobel X/Y gradient on height.
4. Normal `n = normalize(vec3(-dx*strength, -dy*strength, 1))` (flip Y via `invertY` → `n.y *= -1`).
5. Encode `(n * 0.5 + 0.5)` into RGB, alpha passthrough if `alphaMask`.

Optional Skia path for GPU-accelerated variants later — `packages/skia/src/ts/image-filter.ts` exposes `matrixTransform` + image filter primitives. Not needed at v0.

**CLI**:

```
normal-bake input.png [--out input.normal.png]
            [--strength 4] [--blur 0] [--invert-y]
            [--tile] [--channel luma]
            [--sidecar input.normal.json]
```

### (2) `apps/vscode-tools` integration — GUI

Command `threeFlatland.normalBaker.run` registered on:
- Explorer context menu: `when: resourceExtname == .png`, group `navigation@20` (below atlas opener).
- Command palette.

Opens a webview panel (not a CustomEditor — this is task-oriented, not file-oriented). Webview:

- Loads input PNG via bridge.
- Left column: `vscode-design-system` controls (Slider, NumberField, Toggle) bound to `BakeNormalOptions`.
- Right column: `NormalPreview` (from `vscode-preview`) showing three modes:
  - Split view (albedo | normal)
  - Lit composite (albedo × generated normal under a rotating light)
  - Normal only
- Live preview updates as sliders change (debounced 150 ms; preview runs in the webview via the same algorithm, not the extension host).
- "Save" button → posts the output PNG + sidecar back to the host, which writes both files via `workspace.fs`.

## Code sharing with Atlas Editor

Belongs in the shared packages defined in [suite-architecture.md](./suite-architecture.md#shared-package-layout):

| Concern | Package | Export |
|---|---|---|
| Decode/encode PNG | `vscode-io` | `loadPng`, `encodePng` |
| Read/write sidecar | `vscode-io` | `readSidecar`, `writeSidecar` (polymorphic by `meta.app`) |
| `bakeNormal` | `normal-baker` | direct import (CLI + GUI share) |
| `NormalPreview` | `vscode-preview` | `<NormalPreview albedo normal mode='split'|'lit' />` |
| `LightRig` | `vscode-preview` | rotating light used by both atlas lit preview and baker lit preview |
| Sliders, Toolbar | `vscode-design-system` | `Slider`, `NumberField`, `Toolbar` |
| `FsBridge` | `vscode-webview-bridge` | shared extension ↔ webview RPC |

App-specific code in `apps/vscode-tools/src/tools/normalBaker/` is ~200-300 LOC of glue: register command, spawn webview, wire bridge, call `bakeNormal`, write files.

## Runtime gap

three-flatland has no normal-map consumer yet. This tool produces artifacts the runtime can't use. Follow-up against three-flatland (same as atlas editor's follow-up):

1. Add `normalMap` uniform + tangent-space lighting as a new `MaterialEffect`.
2. Build the corresponding TSL node at `packages/nodes/src/lighting/normalMap2D.ts` (slot identified in research — `packages/nodes/src/` currently has no `lighting/` dir).
3. Optionally `normalFromHeight` + `normalFromSprite` TSL utility nodes per the PRD wishlist.

Until those land, this tool still has value (content authoring ahead of runtime; normal maps consumable by other engines, plus our own when runtime catches up).

## References

- [`packages/slug/src/cli.ts`](/Users/tjw/Developer/three-flatland/packages/slug/src/cli.ts) — CLI shape template
- [`packages/slug/package.json:85`](/Users/tjw/Developer/three-flatland/packages/slug/package.json) — bin-entry pattern
- [`packages/nodes/src/index.ts`](/Users/tjw/Developer/three-flatland/packages/nodes/src/index.ts) — where `lighting/normalMap2D.ts` would slot
- [`packages/skia/src/ts/image-filter.ts`](/Users/tjw/Developer/three-flatland/packages/skia/src/ts/image-filter.ts) — available Skia primitives for future GPU path
- [THREE-FLATLAND-PRD.md:346-349, 1611-1636](/Users/tjw/Developer/three-flatland/planning/THREE-FLATLAND-PRD.md) — normal-map TSL wishlist + lit-sprite shader sketch
- [M6-tsl-nodes-part2.md](/Users/tjw/Developer/three-flatland/planning/milestones/M6-tsl-nodes-part2.md) — `normalMap2D` consumer node spec
