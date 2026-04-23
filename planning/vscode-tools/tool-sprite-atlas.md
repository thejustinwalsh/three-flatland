# Tool: Sprite Atlas + Animation Editor

## Goal

Right-click a sprite image → open a CustomEditor that lets the user define sprite rects, name frames, group them into animations with frame-duplication-based timing, preview with three-flatland, and write a schema-validated sidecar JSON next to the image.

## Image-format support

| Format | v0 | v1 | Notes |
|---|---|---|---|
| PNG | yes | yes | Primary source format |
| WebP | no | yes | Default modern source; pairs with `spark.js` loader for GPU-compressed runtime |
| KTX2 (BasisU) | no | yes | Alternative compressed path; pairs with three's `KTX2Loader` |

The editor treats all three as sprite sources. Encoding between formats is the [Image Encoder tool's](./tool-image-encoder.md) job; this tool only consumes.

## Runtime loader contract (follow-up against three-flatland)

Two orthogonal knobs in the new loader API:

```ts
loadSpriteSheet('hero', {
  formats: ['webp', 'ktx2', 'png'],   // source-format preference, first supported wins
  loader:  'auto'                     // 'spark' | 'three-ktx' | 'three-default' | 'auto'
})
```

- `auto` (default): spark when a WebP source exists and a spark-compatible sibling is present; three-ktx when KTX2 exists; three-default otherwise.
- When `formats` is omitted it defaults to `['webp', 'png']` with a dev-time warn if a requested format is missing.
- Loader probes `meta.sources: [{ format, uri }]` in the sidecar. Runtime-available formats are filtered from the preference list before selection.
- Atlas editor + Image Encoder emit sidecars whose `meta.sources` list every authored variant. Any one of them is sufficient for runtime; more variants give the loader more paths.

Lives in `packages/three-flatland/` (new loader contract), not in `tools/`. Filed as a separate work item.

## User flow

1. Right-click `characters/hero.png` → "Open in Sprite Atlas".
2. CustomEditor opens; three panes: slice editor, frame list, animation timeline. Live preview in a fourth pane.
3. Slice: grid / auto-detect / manual rect / snap.
4. Name: F2 renames selected frame(s); multi-select auto-numbers `{prefix}_{index}` in `(y, x)` order with tolerance.
5. Animations: build named animations by selecting frames. Timeline editor shows each selected frame as a cell; clicking a cell's right edge + dragging extends the hold (frame duplication). Quick `1,2,3,4` keys set hold to N frames on selected cells.
6. Preview: `<AnimatedSprite2D>` with toggleable lighting, normal-map, background presets.
7. Save: writes `hero.atlas.json`, validated against JSON Schema before write.

## Timing model: frame duplication

Rejected: per-frame duration fields (Aseprite-style). Reason: harder to visualize, doesn't round-trip cleanly when re-editing.

Accepted: frames are duplicated in the `frames` array. A hold-3 is `[f, f, f]` in the animation's frame list. The timeline editor renders duplicates as a single cell annotated with `×3` so they're visually compact but structurally transparent.

Advantage: no timing arithmetic; fps alone governs playback; any tool that reads the sidecar gets correct timing without parsing a duration schema.

Schema:

```json
"animations": {
  "attack": {
    "frames": ["hero_attack_0", "hero_attack_0", "hero_attack_0", "hero_attack_1", "hero_attack_2"],
    "fps": 12,
    "loop": false,
    "pingPong": false,
    "events": { "3": "hitbox_on", "4": "hitbox_off" }
  }
}
```

## Architecture

```
Extension host (ESM)                         Webview (atlas editor)
  AtlasCustomEditorProvider                    React app
   - openCustomDocument                        - tools-design-system (StyleX + Lit)
   - resolveCustomEditor                       - tools-preview (SpritePreview, AtlasPreview, Timeline)
   - saveCustomDocument (ajv-validates)        - tools-io (CCL, grid slice, schema validator)
   - backupCustomDocument                      - three-flatland preview
  AtlasFsBridge (tools-bridge)
   - readImage(uri) → bytes
   - readSidecar(uri) → AtlasSidecar | null
   - writeSidecar(uri, doc) → WorkspaceEdit
   - probeSidecars(baseUri) → paths present (normal, ktx2, webp)
```

Webview never touches filesystem directly — all I/O via bridge.

## Contribution

```json
"contributes": {
  "customEditors": [
    {
      "viewType": "threeFlatland.atlas",
      "displayName": "three-flatland Sprite Atlas",
      "selector": [
        { "filenamePattern": "*.png" },
        { "filenamePattern": "*.webp" },
        { "filenamePattern": "*.ktx2" }
      ],
      "priority": "option"
    }
  ],
  "commands": [
    { "command": "threeFlatland.atlas.openEditor", "title": "Open in Sprite Atlas" }
  ],
  "menus": {
    "explorer/context": [
      {
        "command": "threeFlatland.atlas.openEditor",
        "when": "resourceExtname in threeFlatland.imageExts",
        "group": "navigation@10"
      }
    ]
  }
}
```

`priority: "option"` keeps the built-in image viewer default; explorer command opens ours explicitly.

## Sidecar JSON schema

Owned by `packages/three-flatland/` — lives with its types and loader:

- Schema: `packages/three-flatland/src/sprites/atlas.schema.json` — published at `https://three-flatland.dev/schemas/atlas.v1.json`
- Validator: `packages/three-flatland/src/sprites/atlas.schema.ts` — exports pre-compiled `validateAtlas` ajv function
- Type: `packages/three-flatland/src/sprites/types.ts` — `SpriteSheetJSONHash` stays authoritative; schema parity enforced by test

The atlas editor imports `validateAtlas` from the three-flatland package and runs it authoritatively in the host before `workspace.fs.writeFile`.

See [schemas/README.md](./schemas/README.md) for authoring rules, consumption patterns, and the docs-site publication pipeline.

Sketch (full schema file is authoritative):

```json
{
  "$schema": "https://three-flatland.dev/schemas/atlas.schema.json",
  "meta": {
    "app": "tools-sprite-atlas",
    "version": "1.0",
    "image": "hero.png",
    "sources": [
      { "format": "png",  "uri": "hero.png" },
      { "format": "webp", "uri": "hero.webp" },
      { "format": "ktx2", "uri": "hero.ktx2" }
    ],
    "normal": "hero.normal.png",
    "size": { "w": 512, "h": 512 },
    "scale": "1",
    "format": "RGBA8888",
    "pivot": { "x": 0.5, "y": 0.5 },

    "animations": {
      "idle": {
        "frames": ["hero_idle_0", "hero_idle_0", "hero_idle_1", "hero_idle_2"],
        "fps": 8,
        "loop": true,
        "pingPong": false
      },
      "attack": {
        "frames": ["hero_attack_0", "hero_attack_1", "hero_attack_1", "hero_attack_2"],
        "fps": 12,
        "loop": false,
        "events": { "2": "hitbox_on", "3": "hitbox_off" }
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

Notes:
- `meta.sources` is authoritative for runtime format selection. `meta.image` is retained for back-compat with the current `SpriteSheetLoader`.
- `meta.normal` is a path to the `.normal.png` (or baked KTX2 equivalent in the future).
- `animations[name].events` maps string-index (matches position in `frames` array after duplication) to event id. Timeline editor surfaces these as flagged cells.

## Auto-slicing

Two modes at v0, unchanged from prior plan:

- **Grid**: alpha-projection autocorrelation; period-detection threshold 0.85; params `minCellSize: 4`, `maxCellSize: 512`, `alphaThreshold: 8/255`.
- **Auto (CCL)**: connected-component labeling on `alpha > T` with 1 px dilation to merge AA edges; `minArea: 16 px²`, `maxComponents: 1024`.

Both live in `tools/io/src/slice.ts` as pure functions. Operate on `ImageData`.

## AI assist (v1)

Use `vscode.lm` with a vision-capable model (`gpt-4o`, `claude-3.5-sonnet` via Copilot) as a *labeling* assistant only — not localization. Input: the image + pre-detected rects. Output:

```json
{
  "groups": [
    { "animation": "idle", "frames": [0, 1, 2, 3], "fps": 8, "loop": true },
    { "animation": "run",  "frames": [4, 5, 6, 7, 8, 9], "fps": 12, "loop": true }
  ],
  "frameNames": { "4": "run_0", "5": "run_1" }
}
```

Never auto-applies; user reviews and accepts/edits.

## Preview

Uses `@three-flatland/tools-preview`:

```tsx
<AtlasPreview sheetUri={uri} sourceFormats={['webp','png']} rects={rects} onRectChange={setRects} />
<SpritePreview sheetUri={uri} sidecar={doc} selected={selectedFrameId} lit={lit} normal={normalUri} />
<LightRig active={lit} />
<Timeline animation={current} onChange={...} />
```

- WebGPU via `@react-three/fiber/webgpu`; fall back to WebGL2 if `navigator.gpu` absent.
- Backgrounds: checker (default), solid (5 presets), gradient, noise.
- `lit` toggle engages normal-map preview. Until the main repo merges normal-map support on `Sprite2DMaterial` (sister work on `lighting-stochastic-adoption`), the preview runs a hand-rolled TSL graph sampling the `.normal.png`. Drops when the runtime catches up.

## Editing tooling

- Rect tool: click-drag creates, Shift constrains, Alt moves
- Grid tool: overlay grid; click cell selects, drag selects span
- Snap: pixel / grid / existing-rect-edges
- Select: marquee, click, shift-click
- Rename: F2; multi-selection auto-numbers in `(y, x)` order, tolerance half-cell
- Timeline:
  - Drag frame from frame list onto animation row → appended
  - Drag right edge of cell to extend hold (adds duplicates)
  - `1..9` keys set hold on selected cells
  - Right-click cell → "Add event"

## Risks

1. **`SpriteSheetLoader` enhancement prerequisite** — must learn `meta.sources`, `meta.normal`, `meta.animations` for v1 runtime consumption. File against main repo.
2. **KTX2 preview in webview** — three's `KTX2Loader` needs the BasisU transcoder. Bundle via `three/examples/jsm/loaders/KTX2Loader.js` + transcoder assets under `dist/webview/atlas/basis/`. CSP `wasm-unsafe-eval` required for transcoder WASM.
3. **WebP/KTX2 decode in auto-slice** — CCL needs `ImageData`; WebP decodes via `createImageBitmap` in browser contexts (webview fine). KTX2 decoded frame has compressed texture data, not raw pixels — auto-slice has to request the PNG source if available, or skip auto-slice for KTX2-only inputs.
4. **Timing migration from per-frame-duration sources** — if importing Aseprite JSON, translate `duration` to frame duplication using nearest-common-denominator frame rate.
5. **Multi-resolution atlases (@2x)** — out of scope at v0.

## References

- [`SpriteSheetLoader.ts`](/Users/tjw/Developer/three-flatland/packages/three-flatland/src/loaders/SpriteSheetLoader.ts)
- [`sprites/types.ts`](/Users/tjw/Developer/three-flatland/packages/three-flatland/src/sprites/types.ts)
- [`animation/types.ts`](/Users/tjw/Developer/three-flatland/packages/three-flatland/src/animation/types.ts)
- [three.js KTX2Loader docs](https://threejs.org/docs/#examples/en/loaders/KTX2Loader)
- [BasisU](https://github.com/BinomialLLC/basis_universal)
- [Aseprite JSON format](https://www.aseprite.org/docs/cli/)
- [ajv JSON Schema validator](https://ajv.js.org/)
