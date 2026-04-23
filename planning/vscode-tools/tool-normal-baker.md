# Tool: Normal Baker

## Goal

GUI wrapper around the existing normal baker shipped on branch `lighting-stochastic-adoption`. Right-click a PNG → visual region editor for the `NormalSourceDescriptor` (tiles, frames, cap/face splits, per-region tilt + elevation) → live preview → bake → writes `.normal.png` + `.normal.json` next to the source.

## Status (existing work to build on)

**Not greenfield.** Commit `61a2c7b` on `lighting-stochastic-adoption` introduced:

- `packages/bake/` — shared Baker framework (CLI dispatch, FNV-1a 64-bit content hashing, `bakedSiblingURL`, `probeBakedSibling`, `devtimeWarn`, `writeSidecar`, `discovery`).
- `packages/normals/` — normal baker implementation:
  - CLI: `flatland-bake normal <input.png> [output.png] [options]` — `packages/normals/src/cli.ts`
  - Programmatic: `bakeNormalMapFile` from `bake.node.ts`
  - Descriptor: `NormalSourceDescriptor` with `version`, `pitch`, `regions[]` — `packages/normals/src/descriptor.ts`
  - Loader: `NormalMapLoader` that probes the sibling and verifies the `tEXt` stamp hash
  - Example asset: `examples/react/lighting/public/sprites/Dungeon_Tileset.normal.{png,json}`
- PNG `tEXt` chunk carries the descriptor's content hash so runtime loaders invalidate stale siblings.

Our job: build the GUI that produces these descriptors interactively. We do not reimplement baking.

## Descriptor format (inherited)

```json
{
  "version": 1,
  "pitch": 0.7853981633974483,
  "regions": [
    { "x": 0,  "y": 0, "w": 16, "h": 16 },
    { "x": 16, "y": 0, "w": 16, "h": 4,  "elevation": 1 },
    { "x": 16, "y": 4, "w": 16, "h": 12, "direction": "south", "elevation": 0.5 }
  ]
}
```

- `pitch` (radians) = default tilt angle from flat; per-region override via `pitch`.
- `direction` (enum) = `flat | up | down | left | right | north | south | east | west | up-left | …`. Resolves to a 2D tilt axis.
- `elevation` = 0..1 height multiplier for the gradient (raises/lowers the surface).
- Regions without a declared `direction` use the descriptor-level default; zero regions means "apply defaults to whole texture" (the flat-flags case).

CLI flags on `flatland-bake normal`:
- `--descriptor <path>`
- `--direction <dir>` (implicit zero-region descriptor)
- `--pitch <radians>`
- `--bump <alpha|none>`
- `--strength <n>`

## GUI flow

1. Right-click `tileset.png` → "Open in FL Normal Baker". Command `threeFlatland.normalBaker.open`.
2. Webview opens with:
   - **Canvas** showing the PNG with region overlays (rects colored by direction).
   - **Region list** (vscode-tree) — select/reorder/delete regions.
   - **Region properties** panel — x/y/w/h number fields, direction picker (9-way compass + `flat`), pitch slider, elevation slider.
   - **Default panel** — descriptor-level `pitch`, `direction`, `strength`, `bump` mode.
   - **Preview panel** — live normal-map render + lit composite with a rotating `<LightRig>`.
3. Edits are serialized to a `NormalSourceDescriptor` and passed to the host, which either:
   - Runs `bakeNormalMapFile` directly (extension host is Node) → writes `.normal.png` + `.normal.json`.
   - Produces a preview-only in-memory bake for the live preview (no file I/O until Save).
4. Save also updates the sidecar's content-hash stamp so the runtime loader's cache invalidation works.

## Architecture

```
Extension host (ESM)                     Webview (React + StyleX)
  NormalBakerCommand                       React app
    → spawns webview panel                   - design-system
  NormalBakerService                         - preview (NormalPreview, AtlasPreview for regions)
    - wraps @three-flatland/normals.bakeNormalMapFile
    - wraps @three-flatland/bake.writeSidecar
    - ajv-validates descriptor against JSON Schema before bake
  FsBridge → webview
```

The host directly imports `@three-flatland/normals` and `@three-flatland/bake` — both are workspace packages, ESM, and already Node-safe.

## Rect editing overlap with Sprite Atlas

The region rect editor is the same widget the atlas editor uses for frame rects. Both consume `preview/AtlasPreview` and `io/slice` helpers (grid snap, drag-resize, selection marquee). Shared code keeps parity between the two tools.

The normal baker's regions have additional per-region properties (`direction`, `pitch`, `elevation`) that the atlas editor doesn't use; the rect widget is agnostic to that.

## JSON Schema

Owned by `packages/normals/` — lives with the descriptor type and loader:

- Schema: `packages/normals/src/descriptor.schema.json` — published at `https://three-flatland.dev/schemas/normal-descriptor.v1.json`
- Validator: `packages/normals/src/descriptor.schema.ts` — exports pre-compiled `validateNormalDescriptor`
- Type: `packages/normals/src/descriptor.ts` — `NormalSourceDescriptor` stays authoritative; schema parity enforced by test

The normal baker GUI imports `validateNormalDescriptor` from `@three-flatland/normals` and runs it before handing the doc to `bakeNormalMapFile`. Tests live in `packages/normals/` alongside the type.

See [schemas/README.md](./schemas/README.md) for authoring rules and docs-site publication.

## Contribution

```json
"contributes": {
  "commands": [
    { "command": "threeFlatland.normalBaker.open", "title": "Open in FL Normal Baker", "category": "FL" }
  ],
  "menus": {
    "explorer/context": [
      {
        "command": "threeFlatland.normalBaker.open",
        "when": "resourceExtname in threeFlatland.imageExts",
        "group": "navigation@20"
      }
    ]
  }
}
```

## Dependency sequencing

This tool depends on `lighting-stochastic-adoption` merging (or being rebased into) `main`. Options:

1. **Wait for merge** — cleanest; no duplicate work.
2. **Branch-off from `lighting-stochastic-adoption`** for development; rebase when main catches up.
3. **Implement in parallel, targeting the package API** as specified by `packages/normals` on that branch; integrate after merge.

Recommend option (2): cut a `feat/normal-baker-gui` branch from `lighting-stochastic-adoption`, develop against the real `packages/normals`, rebase onto the post-merge `main` when ready.

## Risks

1. **Descriptor version upgrade** — if `packages/normals` bumps `version`, this tool must migrate. Add a migration layer keyed on `descriptor.version`.
2. **Preview fidelity** — in-webview lit preview uses hand-rolled TSL until `Sprite2DMaterial` gets proper normal-map support. Keep the preview renderer in `preview` so both atlas and baker share improvements when the main runtime lands normal-mapping.
3. **Hash re-stamp on Save** — after `bakeNormalMapFile` succeeds, the returned sidecar has the stamped hash. Editor must not write a stale descriptor separately.
4. **Large sheets** — CCL auto-region-seed on large tilesets can be slow; debounce and/or run in a worker.

## Follow-ups against main repo

- Normal-map support on `Sprite2DMaterial` / as a `MaterialEffect` — tracked with the sprite atlas editor's preview gap.
- Teach `SpriteSheetLoader` to read `meta.normal` + `meta.animations` from atlas sidecars (same follow-up as atlas editor).

## References

- `lighting-stochastic-adoption` commit `61a2c7b` — introduces `packages/normals` + `packages/bake`
- `packages/normals/src/cli.ts` — CLI shape
- `packages/normals/src/descriptor.ts` — descriptor type
- `packages/bake/src/sidecar.ts` — `bakedSiblingURL`, `hashDescriptor`, `probeBakedSibling`
- `examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json` — real-world descriptor example
