# Tool: Sprite Atlas + Animation Editor

## Goal

Right-click a PNG → open a CustomEditor that lets the user define sprite rects, name frames, group them into animations, preview everything with three-flatland (including optional normal map + lighting), and write a sidecar JSON next to the image.

## User flow

1. Right-click `characters/hero.png` in the Explorer.
2. "Open in Sprite Atlas Editor" → CustomEditor opens the PNG with an overlay canvas for rect editing.
3. Toolbar: `Grid Slice | Auto Detect | Manual Rect | Snap on/off`.
4. User slices sprites; selects frames to name them (multi-select auto-numbers left→right, top→bottom with `{prefix}_{index}`).
5. Animation tab: create named animations by picking frame lists, per-frame durations, loop/ping-pong options.
6. Preview tab: live three-flatland `<AnimatedSprite2D>`. Toggle: lighting on/off, normal map on/off, background presets.
7. Save: writes `hero.atlas.json` next to the PNG.

## Architecture

```
Extension host                            Webview (atlas editor)
  AtlasCustomEditorProvider                 React app
   - openCustomDocument                       - @three-flatland/vscode-design-system
   - resolveCustomEditor                      - @three-flatland/vscode-preview (SpritePreview, AtlasPreview)
   - saveCustomDocument                       - @three-flatland/vscode-io (sidecar schema, CCL)
   - backupCustomDocument                     - Three-flatland runtime for live preview

  AtlasFsBridge (via vscode-webview-bridge)
   - readImage(uri) → base64 bytes
   - readSidecar(uri) → AtlasSidecar | null
   - writeSidecar(uri, doc) → WorkspaceEdit
   - listSidecars(baseUri) → [paths]         // probes foo.normal.png, foo_n.png, foo-normal.png
```

The webview never reads files directly. All I/O goes through the bridge so remote/virtual workspaces work.

## Contribution

```json
"contributes": {
  "customEditors": [
    {
      "viewType": "threeFlatland.atlas",
      "displayName": "three-flatland Sprite Atlas",
      "selector": [{ "filenamePattern": "*.png" }],
      "priority": "option"
    }
  ],
  "commands": [
    { "command": "threeFlatland.atlas.openEditor", "title": "Open in Sprite Atlas Editor" }
  ],
  "menus": {
    "explorer/context": [
      { "command": "threeFlatland.atlas.openEditor", "when": "resourceExtname == .png", "group": "navigation@10" }
    ]
  }
}
```

`priority: "option"` leaves VSCode's built-in image viewer default. Our explorer command calls `vscode.commands.executeCommand('vscode.openWith', uri, 'threeFlatland.atlas')`.

## Sidecar JSON schema

Superset of three-flatland's existing `SpriteSheetJSONHash` at `packages/three-flatland/src/sprites/types.ts:81`. Consumed by `SpriteSheetLoader` at `packages/three-flatland/src/loaders/SpriteSheetLoader.ts:137` with no loader changes required at v0.

```json
{
  "meta": {
    "app": "vscode-sprite-atlas",
    "version": "1.0",
    "image": "hero.png",
    "normal": "hero.normal.png",
    "size": { "w": 512, "h": 512 },
    "scale": "1",
    "format": "RGBA8888",
    "pivot": { "x": 0.5, "y": 0.5 },

    "frameTags": [
      { "name": "idle", "from": 0, "to": 3, "direction": "forward", "fps": 8, "loop": true },
      { "name": "run",  "from": 4, "to": 9, "direction": "pingpong", "fps": 12, "loop": true }
    ],

    "animations": {
      "attack": {
        "frames": ["hero_attack_0", "hero_attack_1", "hero_attack_2"],
        "durations": [80, 60, 120],
        "loop": false,
        "pingPong": false,
        "events": { "1": "hitbox_on", "2": "hitbox_off" }
      }
    }
  },
  "frames": {
    "hero_idle_0": {
      "frame":            { "x": 0,  "y": 0,  "w": 32, "h": 32 },
      "rotated":          false,
      "trimmed":          true,
      "spriteSourceSize": { "x": 2, "y": 4, "w": 32, "h": 32 },
      "sourceSize":       { "w": 36, "h": 36 },
      "pivot":            { "x": 0.5, "y": 1.0 }
    }
  }
}
```

Format rationale:
- **TexturePacker-shape frames** — already consumed by `SpriteSheetLoader` verbatim.
- **Aseprite-style `frameTags`** — battle-tested, tiny, supports all directions.
- **`animations`** — direct serialization of three-flatland's `AnimationSetDefinition` (`packages/three-flatland/src/animation/types.ts:78`). Caller can feed this straight into `AnimationController`.
- **`meta.normal`** — explicit normal-map path so the loader never has to probe sidecars at runtime.

## Sidecar naming

- Atlas: `foo.png` → `foo.atlas.json` (avoids colliding with `foo.json` some users already have).
- Normal map: `foo.normal.png` (primary). Fallbacks on probe: `foo-normal.png`, `foo_n.png`.
- Future emissive/specular: `foo.emissive.png`, `foo.specular.png`.

## Auto-slicing

Two modes shipped at v0:

### Grid mode
- Pixel alignment by alpha-projection autocorrelation. Compute per-column and per-row alpha histograms (sum of `alpha > T`, T≈8/255). Empty rows/cols are gutters.
- Autocorrelate the 1-D alpha projection; strong peak at period P → grid of P px. Accept if normalized corr ≥ 0.85.
- Params: `minCellSize: 4`, `maxCellSize: 512`, `alphaThreshold: 8/255`.

### Auto-detect mode (CCL)
- Connected-component labeling on `alpha > T` mask.
- Dilate mask 1 px to merge anti-aliased edges.
- Each component's AABB = a sprite rect.
- Filter: `minArea: 16 px²`, `maxComponents: 1024`.
- Optionally snap centers to detected grid if also auto-detected.

Both algorithms are ~100 LOC TypeScript via Canvas2D `getImageData` + typed arrays. No WASM. Live in `packages/vscode-io/src/atlas.ts` as `autoSliceGrid` + `autoSliceCCL`.

## AI assist (optional)

Use `vscode.lm` as a *labeling* assistant, not a localization one. Flow:

1. User auto-slices; gets N rects with default names (`frame_0`, `frame_1`, …).
2. Clicks "Suggest names" → host posts image + rects metadata to `vscode.lm` chat model (vision-capable).
3. Model returns suggested names and animation groupings:

```json
{
  "groups": [
    { "animation": "idle", "frames": [0, 1, 2, 3], "fps": 8, "loop": true },
    { "animation": "run",  "frames": [4, 5, 6, 7, 8, 9], "fps": 12, "loop": true }
  ],
  "frameNames": { "4": "run_0", "5": "run_1", "…": "…" }
}
```

User reviews and accepts/edits before applying. Never auto-applies.

Vision input via `LanguageModelImagePart`. Check `model.capabilities` — degrade to heuristic naming if unavailable.

## Preview (webview)

Uses `@three-flatland/vscode-preview` components:

```tsx
<SpritePreview
  sheet={sheetDataUri}
  sidecar={currentSidecar}
  selected={selectedFrameId}
/>
<AtlasPreview
  sheet={sheetDataUri}
  rects={rects}
  onRectChange={setRects}
/>
<LightRig active={lightingToggle} />
```

Backgrounds: checker, solid (5 presets), noise, gradient. Stored as session state in `acquireVsCodeApi().setState()`.

WebGPU via `@react-three/fiber/webgpu`; fall back to WebGL2 if `navigator.gpu` unavailable.

### Runtime gap

three-flatland has no normal-map support on `Sprite2DMaterial` yet (grep at /Users/tjw/Developer/three-flatland confirmed zero `normalMap` references). For v0 preview lit mode, implement normal-mapped lighting inline in the webview via a hand-rolled TSL graph against the sprite's normal texture. Open a follow-up ticket against three-flatland to:

1. Add `normalMap` + tangent-space lighting as a `MaterialEffect`.
2. Teach `SpriteSheetLoader` to read `meta.normal` and `meta.animations` from the sidecar.

Once landed, the webview drops its local implementation.

## Editing tooling

- **Rect tool**: click-drag creates a rect. Shift-drag constrains. Alt-drag moves.
- **Grid tool**: overlay grid; click any cell selects; drag selects a span.
- **Snap**: toggle. Snaps rect edges to pixel, grid, or existing rect edges.
- **Select**: marquee, click, shift-click multi-select.
- **Rename**: F2 on selection. Multi-selection auto-numbers using `{prefix}_{index}`, ordered by `(y, x)` with tolerance.

## Risks + follow-ups

1. **`SpriteSheetLoader` doesn't read `meta.normal`/`meta.animations` yet** — our sidecar is forward-compatible but the loader enhancement is prerequisite for v1 runtime consumption. File against three-flatland.
2. **Normal-map preview requires runtime work** — see Runtime gap above.
3. **`packages/presets` is empty** — no reusable lighting preset for "just make it look right". May want to build a default sprite-lit preset as part of this effort.
4. **Multi-resolution atlases** — not in scope at v0. Emit a single atlas per PNG. @2x support can come later via a second sidecar `meta.scale`.
5. **PSD / multi-layer import** — out of scope at v0.

## References

- [`SpriteSheetLoader.ts:137`](/Users/tjw/Developer/three-flatland/packages/three-flatland/src/loaders/SpriteSheetLoader.ts)
- [`sprites/types.ts:81`](/Users/tjw/Developer/three-flatland/packages/three-flatland/src/sprites/types.ts)
- [`animation/types.ts:78`](/Users/tjw/Developer/three-flatland/packages/three-flatland/src/animation/types.ts)
- [`animation/AnimationController.ts`](/Users/tjw/Developer/three-flatland/packages/three-flatland/src/animation/AnimationController.ts)
- [TexturePacker JSON Hash format](https://www.codeandweb.com/texturepacker/documentation)
- [Aseprite CLI `--data` format](https://www.aseprite.org/docs/cli/)
- [VSCode Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
